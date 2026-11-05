/**
 * Sindhi Panchang Hook (Phase 10 / ANDROID-10 Parity)
 *
 * Manages active date, calendar month navigation, day selection,
 * filter states, and computed panchang metrics.
 */

import { useState, useMemo, useCallback } from 'react'
import {
  getMonthMatrix,
  getPanchangDayInfo,
  formatDateString,
  parseDateString,
} from '../services/panchang.service'
import type {
  PanchangDayInfo,
  PanchangFilterType,
} from '../types'

export interface UsePanchangOptions {
  initialDate?: Date
  today?: Date
}

export function usePanchang(options?: UsePanchangOptions) {
  const today = useMemo(() => options?.today ?? new Date(), [options?.today])
  const [selectedDate, setSelectedDate] = useState<Date>(
    () => options?.initialDate ?? today
  )
  const [activeMonthDate, setActiveMonthDate] = useState<Date>(
    () => options?.initialDate ?? today
  )
  const [filter, setFilter] = useState<PanchangFilterType>('ALL')

  const activeYear = activeMonthDate.getFullYear()
  const activeMonth = activeMonthDate.getMonth() // 0-11

  // Navigation handlers
  const jumpToToday = useCallback(() => {
    setSelectedDate(today)
    setActiveMonthDate(today)
  }, [today])

  const selectDate = useCallback((target: Date | string) => {
    const d = typeof target === 'string' ? parseDateString(target) : target
    setSelectedDate(d)
    setActiveMonthDate(new Date(d.getFullYear(), d.getMonth(), 1))
  }, [])

  const prevMonth = useCallback(() => {
    setActiveMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setActiveMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }, [])

  const prevDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1)
      setActiveMonthDate(new Date(d.getFullYear(), d.getMonth(), 1))
      return d
    })
  }, [])

  const nextDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1)
      setActiveMonthDate(new Date(d.getFullYear(), d.getMonth(), 1))
      return d
    })
  }, [])

  // Calendar month matrix (35 or 42 grid cells)
  const monthMatrix: PanchangDayInfo[] = useMemo(() => {
    return getMonthMatrix(activeYear, activeMonth, selectedDate, today, filter)
  }, [activeYear, activeMonth, selectedDate, today, filter])

  // Selected day details
  const selectedDayInfo: PanchangDayInfo = useMemo(() => {
    return getPanchangDayInfo(selectedDate, selectedDate, today)
  }, [selectedDate, today])

  // Today day details
  const todayInfo: PanchangDayInfo = useMemo(() => {
    return getPanchangDayInfo(today, selectedDate, today)
  }, [today, selectedDate])

  // Observances in current visible month
  const monthObservances = useMemo(() => {
    return monthMatrix.filter((day) => day.is_current_month && day.observances.length > 0)
  }, [monthMatrix])

  // Next upcoming observance relative to today
  const nextKeyObservance = useMemo(() => {
    const todayStr = formatDateString(today)
    const upcoming = monthMatrix
      .filter((day) => day.is_current_month && day.date_string >= todayStr && day.observances.length > 0)
      .sort((a, b) => a.date_string.localeCompare(b.date_string))

    if (upcoming.length > 0 && upcoming[0].observances.length > 0) {
      return {
        ...upcoming[0].observances[0],
        date_string: upcoming[0].date_string,
        formatted_date: upcoming[0].formatted_gregorian,
      }
    }
    return null
  }, [monthMatrix, today])

  return {
    selectedDate,
    activeYear,
    activeMonth,
    activeMonthDate,
    monthMatrix,
    selectedDayInfo,
    todayInfo,
    monthObservances,
    nextKeyObservance,
    filter,
    setFilter,
    selectDate,
    jumpToToday,
    prevMonth,
    nextMonth,
    prevDay,
    nextDay,
  }
}
