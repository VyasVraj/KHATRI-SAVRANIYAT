/**
 * Birthdays Service (Phase 10 / ANDROID-9 Parity)
 *
 * Implements community birthday calculation, upcoming celebrations, and
 * strict privacy enforcement according to the 5-level privacy model:
 *
 * - PERSON != USER: Birthdays belong to census persons (`public.persons`).
 * - Privacy Model: Respects `dob_privacy` ('PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC').
 *   - 'PRIVATE': Omitted unless viewer is record owner or community moderator.
 *   - 'COMMUNITY': Visible only to authenticated community members.
 *   - 'PUBLIC': Visible to all.
 * - Privacy Shield: Full birth year and calculated age are NEVER exposed to callers.
 *   Display format preference: "Rahul — 12 Nov".
 * - Deceased persons (`status = 'DECEASED'` or `date_of_death != null`) are strictly omitted.
 * - Deterministic upcoming calculation handling year rollovers, today indicators,
 *   and leap-year (Feb 29) handling without timezone jitter.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import type { BirthdayItem, BirthdayGroup } from '../types'

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

interface BirthdayPersonQueryRow {
  id: string
  first_name: string
  middle_name: string | null
  last_name: string
  avatar_url: string | null
  date_of_birth: string | null
  dob_privacy: string
  profile_privacy: string
  status: string
  date_of_death: string | null
  user_id: string | null
  created_by: string | null
}

export interface UpcomingBirthdayOptions {
  currentUserId?: string | null
  isModerator?: boolean
  limit?: number
  now?: Date
}

export interface CalculatedBirthday {
  birthMonth: number
  birthDay: number
  daysUntil: number
  isToday: boolean
  isTomorrow: boolean
  isThisWeek: boolean
  isThisMonth: boolean
  targetDate: string
  formattedDate: string
}

/**
 * Calculates deterministic upcoming celebration metrics for a given ISO date of birth (YYYY-MM-DD).
 *
 * Conceals the birth year and returns only calendar day and month representations.
 */
export function calculateUpcomingBirthday(
  dateOfBirth: string | null | undefined,
  now: Date = new Date()
): CalculatedBirthday | null {
  if (!dateOfBirth || typeof dateOfBirth !== 'string') {
    return null
  }

  // Expect YYYY-MM-DD
  const parts = dateOfBirth.trim().split('-')
  if (parts.length < 3) {
    return null
  }

  const birthMonth = parseInt(parts[1], 10) // 1-12
  const birthDay = parseInt(parts[2], 10) // 1-31

  if (
    isNaN(birthMonth) ||
    isNaN(birthDay) ||
    birthMonth < 1 ||
    birthMonth > 12 ||
    birthDay < 1 ||
    birthDay > 31
  ) {
    return null
  }

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-11
  const currentDate = now.getDate()

  // Normalized to local midnight to avoid timezone shifting
  const todayMidnight = new Date(
    currentYear,
    currentMonth,
    currentDate,
    0,
    0,
    0,
    0
  )

  // Construct target birthday for the current year
  // (In non-leap years, Feb 29 automatically resolves gracefully to March 1 in JS)
  const thisYearBirthday = new Date(
    currentYear,
    birthMonth - 1,
    birthDay,
    0,
    0,
    0,
    0
  )

  let targetDateObj: Date
  if (thisYearBirthday.getTime() < todayMidnight.getTime()) {
    // Birthday has already occurred this year; next celebration is next year
    targetDateObj = new Date(
      currentYear + 1,
      birthMonth - 1,
      birthDay,
      0,
      0,
      0,
      0
    )
  } else {
    targetDateObj = thisYearBirthday
  }

  const diffMs = targetDateObj.getTime() - todayMidnight.getTime()
  const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24))

  const isToday = daysUntil === 0
  const isTomorrow = daysUntil === 1
  const isThisWeek = daysUntil >= 0 && daysUntil <= 7
  const isThisMonth =
    targetDateObj.getMonth() === currentMonth &&
    targetDateObj.getFullYear() === currentYear

  const formattedDate = `${birthDay} ${MONTH_NAMES[birthMonth - 1]}`

  return {
    birthMonth,
    birthDay,
    daysUntil,
    isToday,
    isTomorrow,
    isThisWeek,
    isThisMonth,
    targetDate: targetDateObj.toISOString(),
    formattedDate,
  }
}

/**
 * Fetches upcoming birthdays visible to the caller while strictly enforcing
 * the 5-level privacy model and concealing full birth dates.
 */
export async function getUpcomingBirthdays(
  options: UpcomingBirthdayOptions = {}
): Promise<ApiResponse<BirthdayItem[]>> {
  try {
    const { currentUserId = null, isModerator = false, limit, now } = options

    // Primary attempt: community_persons security barrier view
    const { data, error } = await supabase
      .from('community_persons')
      .select(
        'id, first_name, middle_name, last_name, avatar_url, date_of_birth, dob_privacy, profile_privacy, status, date_of_death, user_id, created_by'
      )
      .not('date_of_birth', 'is', null)
      .is('deleted_at', null)

    let personsData = data as unknown as BirthdayPersonQueryRow[] | null
    let fetchError = error
    if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
      const fallback = await supabase
        .from('persons')
        .select(
          'id, first_name, middle_name, last_name, avatar_url, date_of_birth, dob_privacy, profile_privacy, status, date_of_death, user_id, created_by'
        )
        .not('date_of_birth', 'is', null)
        .is('deleted_at', null)
      personsData = fallback.data as unknown as BirthdayPersonQueryRow[] | null
      fetchError = fallback.error
    }

    if (fetchError) {
      return {
        data: null,
        error: {
          message: 'Unable to load birthdays. Please try again.',
          code: fetchError.code,
          cause: fetchError,
        },
      }
    }

    if (!personsData) {
      return { data: [], error: null }
    }

    const items: BirthdayItem[] = []

    for (const person of personsData) {
      // 1. Exclude deceased individuals
      if (person.status === 'DECEASED' || person.date_of_death !== null) {
        continue
      }

      // 2. Strict Privacy Authorization Checks:
      // Check if caller is owner or creator
      const isOwnerOrCreator =
        Boolean(currentUserId) &&
        (person.user_id === currentUserId || person.created_by === currentUserId)

      if (person.dob_privacy === 'PUBLIC') {
        // Visible to everyone
      } else if (person.dob_privacy === 'COMMUNITY') {
        // Visible only if user is logged in or moderator
        if (!currentUserId && !isModerator) {
          continue
        }
      } else {
        // 'PRIVATE', 'FAMILY', 'CONNECTIONS'
        // In the community feed, only moderators and the record owner/creator can view
        if (!isModerator && !isOwnerOrCreator) {
          continue
        }
      }

      // 3. Deterministic calculation
      const calculated = calculateUpcomingBirthday(person.date_of_birth, now)
      if (!calculated) {
        continue
      }

      items.push({
        id: person.id,
        person_id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
        middle_name: person.middle_name,
        avatar_url: person.avatar_url ?? null,
        birth_month: calculated.birthMonth,
        birth_day: calculated.birthDay,
        formatted_date: calculated.formattedDate,
        days_until: calculated.daysUntil,
        is_today: calculated.isToday,
        is_tomorrow: calculated.isTomorrow,
        is_this_week: calculated.isThisWeek,
        is_this_month: calculated.isThisMonth,
        target_date: calculated.targetDate,
        is_living: true,
      })
    }

    // Sort ascending by days until celebration, then alphabetically
    items.sort((a, b) => {
      if (a.days_until !== b.days_until) {
        return a.days_until - b.days_until
      }
      return a.first_name.localeCompare(b.first_name)
    })

    const finalItems = limit && limit > 0 ? items.slice(0, limit) : items

    return { data: finalItems, error: null }
  } catch (err) {
    return {
      data: null,
      error: {
        message: 'An unexpected error occurred while loading birthdays.',
        cause: err,
      },
    }
  }
}

/**
 * Groups upcoming birthdays into clean logical sections:
 * - Today
 * - This Week
 * - Later This Month
 * - Upcoming
 */
export function groupBirthdays(items: BirthdayItem[]): BirthdayGroup[] {
  const today: BirthdayItem[] = []
  const thisWeek: BirthdayItem[] = []
  const thisMonth: BirthdayItem[] = []
  const upcoming: BirthdayItem[] = []

  for (const item of items) {
    if (item.is_today) {
      today.push(item)
    } else if (item.is_this_week) {
      thisWeek.push(item)
    } else if (item.is_this_month) {
      thisMonth.push(item)
    } else {
      upcoming.push(item)
    }
  }

  const groups: BirthdayGroup[] = []

  if (today.length > 0) {
    groups.push({
      group_key: 'today',
      title_key: 'birthdays.group_today',
      items: today,
    })
  }

  if (thisWeek.length > 0) {
    groups.push({
      group_key: 'this_week',
      title_key: 'birthdays.group_this_week',
      items: thisWeek,
    })
  }

  if (thisMonth.length > 0) {
    groups.push({
      group_key: 'this_month',
      title_key: 'birthdays.group_this_month',
      items: thisMonth,
    })
  }

  if (upcoming.length > 0) {
    groups.push({
      group_key: 'upcoming',
      title_key: 'birthdays.group_upcoming',
      items: upcoming,
    })
  }

  return groups
}
