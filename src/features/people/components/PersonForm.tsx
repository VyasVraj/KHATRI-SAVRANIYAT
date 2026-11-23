/**
 * PersonForm — create/edit form for person records.
 *
 * Uses React Hook Form + zodResolver with a flat form schema.
 * All fields are the user-editable subset of the persons table.
 *
 * SECURITY NOTE:
 * Protected/system fields are NOT present in this form:
 *   id, created_at, updated_at, created_by, user_id,
 *   status, verification_status, deleted_at
 *
 * The service/schema layer remains the authority for protected fields.
 * Even if a caller attempted to inject protected fields, the schema would
 * strip them and the RLS policies would reject them.
 *
 * FORM PREPROCESSING:
 * HTML form elements return empty strings for unfilled optional fields.
 * A sanitization step in onFormSubmit converts empty strings to undefined
 * before calling the parent's onSubmit, so that the service layer receives
 * clean data consistent with what the original schemas expect.
 */

import { useContext } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type CreatePersonInput } from '../schemas/people.schemas'
import { Input } from '@/components/forms/Input'
import { CitySelector } from '@/components/forms/CitySelector'
import { Button } from '@/components/forms/Button'
import { PrivacyLevelSelect } from '@/components/forms/PrivacyLevelSelect'
import { GotraNukhSelect } from '@/components/forms/GotraNukhSelect'
import { TwoLevelOccupationSelect } from '@/components/forms/TwoLevelOccupationSelect'
import { BloodGroupConsentCheckbox } from '@/components/forms/BloodGroupConsentCheckbox'
import { ProfilePhotoUpload } from '@/components/forms/ProfilePhotoUpload'
import { uploadAvatar } from '@/features/media/services/avatar.service'
import { OCCUPATION_CATEGORIES, getCategoryForOccupation } from '@/constants/occupations'
import { PhoneInputWithCountryCode } from '@/components/forms/PhoneInputWithCountryCode'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { canManagePrivacy } from '@/constants/app'
import { BLOOD_GROUP_OPTIONS, BLOOD_GROUPS } from '@/constants/bloodGroup'
import { isValidNukhForGotra } from '@/constants/gotraNukh'
import { calculateAgeFromDob } from '@/utils/common'
import type { PrivacyLevel } from '@/types'

// ---------------------------------------------------------------------------
// Form schema — a flat schema for RHF that accepts string inputs from HTML.
// Empty strings for optional fields are coerced to undefined in onFormSubmit.
// Privacy and gender have explicit enum validation.
// ---------------------------------------------------------------------------

const PRIVACY_ENUM = z.enum(['PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC'])

function getTodayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Form-level schema: 10 mandatory fields and 4 optional fields */
const personFormSchema = z
  .object({
    first_name: z
      .string({ required_error: 'First Name is required' })
      .trim()
      .min(1, 'First Name is required')
      .max(100, 'First name must not exceed 100 characters'),
    last_name: z
      .string({ required_error: 'Last Name is required' })
      .trim()
      .min(1, 'Last Name is required')
      .max(100, 'Last name must not exceed 100 characters'),
    middle_name: z.string().max(100).optional().nullable(),
    maiden_name: z.string().max(100).optional().nullable(),
    gender: z
      .string({ required_error: 'Please select Gender' })
      .min(1, 'Please select Gender')
      .refine((val) => ['MALE', 'FEMALE', 'OTHER'].includes(val), 'Please select Gender'),
    blood_group: z
      .string({ required_error: 'Please select Blood Group' })
      .min(1, 'Please select Blood Group')
      .refine(
        (val) => BLOOD_GROUPS.includes(val as (typeof BLOOD_GROUPS)[number]) && val !== 'UNKNOWN',
        'Please select Blood Group'
      ),
    show_blood_group_in_directory: z.boolean().default(false),
    birth_place: z.string().trim().max(200, 'Birthplace must not exceed 200 characters').optional().nullable(),
    age_mode: z.enum(['dob', 'age']).default('dob'),
    date_of_birth: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine(
        (val) => !val || val <= getTodayIso(),
        'Date of birth cannot be in the future'
      ),
    current_age: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine((val) => {
        if (!val) return true
        const num = parseInt(val, 10)
        return !isNaN(num) && num >= 0 && num <= 125
      }, 'Please enter a valid age between 0 and 125'),
    avatar_url: z.string().optional().nullable(),
    date_of_death: z
      .string()
      .optional()
      .nullable()
      .refine(
        (val) => !val || val <= getTodayIso(),
        'Date of death cannot be in the future'
      ),
    is_deceased: z.boolean().default(false),
    gotra: z
      .string({ required_error: 'Please select Gotra' })
      .trim()
      .min(1, 'Please select Gotra'),
    nukh: z
      .string({ required_error: 'Please select Nukh' })
      .trim()
      .min(1, 'Please select Nukh'),
    occupation: z.string().optional().nullable(),
    occupation_category: z.string().optional().nullable(),
    email_contact: z
      .string()
      .optional()
      .nullable()
      .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), 'Please enter a valid email address'),
    phone: z
      .string()
      .optional()
      .nullable()
      .refine(
        (val) => !val || /^[0-9+\s\-()]{7,25}$/.test(val),
        'Please enter a valid primary phone number'
      ),
    phone_secondary: z
      .string()
      .optional()
      .nullable()
      .refine(
        (val) => !val || /^[0-9+\s\-()]{7,25}$/.test(val.trim()),
        'Please enter a valid secondary phone number'
      ),
    profile_privacy: PRIVACY_ENUM.default('PRIVATE'),
    contact_privacy: PRIVACY_ENUM.default('PRIVATE'),
    dob_privacy: PRIVACY_ENUM.default('PRIVATE'),
  })
  .superRefine((data, ctx) => {
    // Mutually exclusive: user selects either Date of Birth OR Current Age
    if (data.age_mode === 'dob') {
      if (!data.date_of_birth || !data.date_of_birth.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Date of birth is required when Date of Birth is selected',
          path: ['date_of_birth'],
        })
      } else if (data.date_of_birth > getTodayIso()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Date of birth cannot be in the future',
          path: ['date_of_birth'],
        })
      }
    } else if (data.age_mode === 'age') {
      if (!data.current_age || !data.current_age.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Current age is required when Age is selected',
          path: ['current_age'],
        })
      } else {
        const num = parseInt(data.current_age, 10)
        if (isNaN(num) || num < 0 || num > 125) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Please enter a valid age between 0 and 125',
            path: ['current_age'],
          })
        }
      }
    }

    if (data.date_of_birth && data.date_of_death) {
      if (data.date_of_death < data.date_of_birth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Date of death cannot be earlier than date of birth.',
          path: ['date_of_death'],
        })
      }
    }

    if (data.gotra && data.nukh) {
      if (!isValidNukhForGotra(data.gotra, data.nukh)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Nukh "${data.nukh}" does not belong to Gotra "${data.gotra}".`,
          path: ['nukh'],
        })
      }
    }
  })

type PersonFormValues = z.infer<typeof personFormSchema>

// ---------------------------------------------------------------------------
// Sanitization: convert empty string fields to undefined before calling service
// ---------------------------------------------------------------------------

function sanitizeOptional(v: string | null | undefined, isEdit = false): string | null | undefined {
  if (v === '' || v === null) return isEdit ? null : undefined
  if (v === undefined) return undefined
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : isEdit ? null : undefined
}

function sanitizeFormValues(values: PersonFormValues, mode: 'create' | 'edit'): CreatePersonInput {
  const isEdit = mode === 'edit'
  return {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    middle_name: sanitizeOptional(values.middle_name, isEdit),
    maiden_name: sanitizeOptional(values.maiden_name, isEdit),
    gender: values.gender as CreatePersonInput['gender'],
    blood_group: values.blood_group as CreatePersonInput['blood_group'],
    show_blood_group_in_directory: Boolean(values.show_blood_group_in_directory),
    blood_group_consent: Boolean(values.show_blood_group_in_directory),
    date_of_birth: values.age_mode === 'dob' ? sanitizeOptional(values.date_of_birth, isEdit) : null,
    current_age: values.age_mode === 'age' && values.current_age ? parseInt(values.current_age, 10) : null,
    date_of_death: sanitizeOptional(values.date_of_death, isEdit),
    is_deceased: Boolean(values.is_deceased),
    birth_place: sanitizeOptional(values.birth_place, isEdit),
    avatar_url: sanitizeOptional(values.avatar_url, isEdit),
    gotra: values.gotra.trim(),
    nukh: values.nukh.trim(),
    occupation: (() => {
      const rawOcc = values.occupation?.trim() || null
      const rawCat = values.occupation_category?.trim() || null
      if (
        !rawOcc ||
        rawOcc === 'Occupation Pending' ||
        rawOcc === 'Occupation Not Provided' ||
        rawOcc === 'Occupation Not Available' ||
        rawOcc === 'Occupation Rejected'
      ) {
        return rawCat && rawCat !== 'Other' ? rawCat : null
      }
      if (rawCat && rawCat !== 'Other' && (OCCUPATION_CATEGORIES as readonly string[]).includes(rawCat)) {
        return rawCat
      }
      const detected = getCategoryForOccupation(rawOcc)
      if (detected) return detected
      return rawCat && rawCat !== 'Other' ? rawCat : 'Business and Entrepreneurship'
    })(),
    occupation_category: values.occupation_category?.trim() || null,
    custom_occupation: (() => {
      const rawOcc = values.occupation?.trim() || null
      const rawCat = values.occupation_category?.trim() || null
      if (rawOcc && rawCat && rawOcc.toLowerCase() !== rawCat.toLowerCase()) {
        return rawOcc
      }
      return null
    })(),
    email_contact: values.email_contact?.trim() ? values.email_contact.trim().toLowerCase() : null,
    phone: values.phone?.trim() ? values.phone.trim() : null,
    phone_secondary: sanitizeOptional(values.phone_secondary, isEdit),
    profile_privacy: values.profile_privacy,
    contact_privacy: values.contact_privacy,
    dob_privacy: values.dob_privacy,
  }
}

// ---------------------------------------------------------------------------
// Gender options
// ---------------------------------------------------------------------------

const GENDER_OPTIONS = [
  { value: '', label: '— Select gender —' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const

// ---------------------------------------------------------------------------
// PersonForm props
// ---------------------------------------------------------------------------

interface PersonFormProps {
  mode: 'create' | 'edit'
  /**
   * Pre-fill the form with these values (used for edit mode).
   * Null values are rendered as empty strings in form fields.
   */
  defaultValues?: Partial<CreatePersonInput>
  /**
   * Called with validated and sanitized form data when the user submits.
   * The parent component is responsible for calling the appropriate mutation.
   */
  onSubmit: (data: CreatePersonInput) => Promise<void>
  /** Disables the form submit button and shows spinner while true. */
  isSubmitting?: boolean
  /** Error message to display below the form (from the parent mutation). */
  submitError?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert null/undefined to "" for HTML form field defaultValue */
function toFieldValue(v: string | null | undefined): string {
  return v ?? ''
}

// ---------------------------------------------------------------------------
// PersonForm
// ---------------------------------------------------------------------------

/**
 * Person create/edit form.
 *
 * Renders all user-editable fields grouped into sections:
 *   1. Name (required: first_name, last_name; optional: middle_name, maiden_name)
 *   2. Identity (gender, date_of_birth, date_of_death, birth_place)
 *   3. Community identity (gotra, nukh)
 *   4. Contact (email_contact, phone, phone_secondary)
 *   5. Privacy (profile_privacy, contact_privacy, dob_privacy)
 */
export function PersonForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting = false,
  submitError,
}: PersonFormProps) {
  const auth = useContext(AuthContext)
  const isPrivacyManager = canManagePrivacy(auth?.profile?.role)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema),
    defaultValues: {
      first_name: toFieldValue(defaultValues?.first_name),
      last_name: toFieldValue(defaultValues?.last_name),
      middle_name: toFieldValue(defaultValues?.middle_name),
      maiden_name: toFieldValue(defaultValues?.maiden_name),
      gender: defaultValues?.gender ?? '',
      blood_group: toFieldValue((defaultValues as unknown as { blood_group?: string | null })?.blood_group),
      show_blood_group_in_directory: Boolean((defaultValues as unknown as { show_blood_group_in_directory?: boolean; blood_group_consent?: boolean })?.show_blood_group_in_directory ?? (defaultValues as unknown as { blood_group_consent?: boolean })?.blood_group_consent ?? false),
      age_mode: (defaultValues as unknown as { current_age?: number | null })?.current_age && !defaultValues?.date_of_birth ? 'age' : 'dob',
      date_of_birth: toFieldValue(defaultValues?.date_of_birth),
      current_age: (defaultValues as unknown as { current_age?: number | null })?.current_age ? String((defaultValues as unknown as { current_age?: number | null }).current_age) : '',
      avatar_url: toFieldValue((defaultValues as unknown as { avatar_url?: string | null })?.avatar_url),
      date_of_death: toFieldValue(defaultValues?.date_of_death),
      is_deceased: (defaultValues as { is_deceased?: boolean; status?: string; date_of_death?: string | null })?.is_deceased ?? Boolean(defaultValues?.date_of_death || (defaultValues as { status?: string })?.status === 'DECEASED'),
      birth_place: toFieldValue(defaultValues?.birth_place),
      gotra: toFieldValue(defaultValues?.gotra),
      nukh: toFieldValue(defaultValues?.nukh),
      occupation: toFieldValue(
        (defaultValues as unknown as { custom_occupation?: string | null })?.custom_occupation ||
        (defaultValues as unknown as { occupation?: string | null })?.occupation
      ),
      occupation_category: toFieldValue(
        (defaultValues as unknown as { occupation_category?: string | null })?.occupation_category ||
        getCategoryForOccupation((defaultValues as unknown as { occupation?: string | null })?.occupation || '')
      ),
      email_contact: toFieldValue(defaultValues?.email_contact),
      phone: toFieldValue(defaultValues?.phone),
      phone_secondary: toFieldValue(defaultValues?.phone_secondary),
      profile_privacy: (defaultValues?.profile_privacy as PrivacyLevel) ?? 'PRIVATE',
      contact_privacy: (defaultValues?.contact_privacy as PrivacyLevel) ?? 'PRIVATE',
      dob_privacy: (defaultValues?.dob_privacy as PrivacyLevel) ?? 'PRIVATE',
    },
  })

  const selectedGotra = watch('gotra')
  const selectedNukh = watch('nukh')

  async function onFormSubmit(values: PersonFormValues) {
    const sanitized = sanitizeFormValues(values, mode)
    if (!isPrivacyManager) {
      if (mode === 'edit') {
        // Strip privacy fields completely on edit so regular users cannot mutate privacy
        delete sanitized.profile_privacy
        delete sanitized.contact_privacy
        delete sanitized.dob_privacy
      } else {
        // Enforce safe PRIVATE defaults on creation for non-moderators
        sanitized.profile_privacy = 'PRIVATE'
        sanitized.contact_privacy = 'PRIVATE'
        sanitized.dob_privacy = 'PRIVATE'
      }
    }
    await onSubmit(sanitized)
  }

  const submitLabel = mode === 'create' ? 'Add person' : 'Save changes'

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      noValidate
      className="space-y-8"
      aria-label={mode === 'create' ? 'Add person form' : 'Edit person form'}
    >
      {/* ---- Profile Photo ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Profile Photo
        </legend>
        <ProfilePhotoUpload
          id="person-profile-photo"
          currentPhotoUrl={watch('avatar_url')}
          onPhotoSelected={async (file) => {
            if (!file) {
              setValue('avatar_url', '', { shouldDirty: true })
              return
            }
            if (mode === 'edit' && defaultValues && 'id' in defaultValues && (defaultValues as { id?: string }).id) {
              const res = await uploadAvatar(file, { type: 'person', id: (defaultValues as { id: string }).id }, {
                previousAvatarUrl: defaultValues?.avatar_url,
              })
              if (res.data?.url) {
                setValue('avatar_url', res.data.url, { shouldDirty: true })
              }
            } else {
              const reader = new FileReader()
              reader.onload = (event) => {
                setValue('avatar_url', (event.target?.result as string) || '', { shouldDirty: true })
              }
              reader.readAsDataURL(file)
            }
          }}
        />
      </fieldset>

      {/* ---- Name ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Name
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            required
            autoComplete="given-name"
            error={errors.first_name?.message}
            {...register('first_name')}
          />
          <Input
            label="Middle name"
            autoComplete="additional-name"
            error={errors.middle_name?.message}
            {...register('middle_name')}
          />
          <Input
            label="Last name / Surname"
            required
            autoComplete="family-name"
            error={errors.last_name?.message}
            {...register('last_name')}
          />
          <Input
            label="Maiden name (if applicable)"
            hint="Birth surname, if applicable"
            error={errors.maiden_name?.message}
            {...register('maiden_name')}
          />
        </div>
      </fieldset>

      {/* ---- Identity ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Identity
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Gender — native select */}
          <div className="space-y-1">
            <label
              htmlFor="gender"
              className="block text-sm font-medium text-navy-700"
            >
              Gender <span className="text-red-500">*</span>
            </label>
            <select
              id="gender"
              aria-invalid={!!errors.gender}
              aria-describedby={errors.gender ? 'gender-error' : undefined}
              className={[
                'w-full rounded border px-3 py-2 text-sm text-navy-900 bg-white',
                'transition-colors focus:outline-none focus:ring-1',
                errors.gender
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
                  : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400',
              ].join(' ')}
              {...register('gender')}
            >
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.gender && (
              <p id="gender-error" role="alert" className="text-xs text-red-600">
                {errors.gender.message}
              </p>
            )}
          </div>

          {/* Blood Group — native select */}
          <div className="space-y-1">
            <label
              htmlFor="blood_group"
              className="block text-sm font-medium text-navy-700"
            >
              Blood Group <span className="text-red-500">*</span>
            </label>
            <select
              id="blood_group"
              aria-invalid={!!errors.blood_group}
              aria-describedby={errors.blood_group ? 'blood-group-error' : undefined}
              className={[
                'w-full rounded border px-3 py-2 text-sm text-navy-900 bg-white',
                'transition-colors focus:outline-none focus:ring-1',
                errors.blood_group
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
                  : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400',
              ].join(' ')}
              {...register('blood_group')}
            >
              {BLOOD_GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.blood_group && (
              <p id="blood-group-error" role="alert" className="text-xs text-red-600">
                {errors.blood_group.message}
              </p>
            )}

            {/* Blood Group Directory Consent Checkbox */}
            <BloodGroupConsentCheckbox
              id="show_blood_group_in_directory"
              checked={Boolean(watch('show_blood_group_in_directory'))}
              onChange={(val) =>
                setValue('show_blood_group_in_directory', val, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              disabled={isSubmitting}
            />
          </div>

          <CitySelector
            label="Birthplace (Optional)"
            required={false}
            value={watch('birth_place') || ''}
            onSelectCity={(loc) => {
              const formatted = loc.city
                ? loc.state
                  ? `${loc.city}, ${loc.state}${loc.country ? `, ${loc.country}` : ''}`
                  : loc.city
                : ''
              setValue('birth_place', formatted, { shouldValidate: true })
            }}
            error={errors.birth_place?.message}
            placeholder="Search birthplace worldwide..."
            id="birth_place"
          />

          {/* Mutually Exclusive Date of Birth vs Current Age Section */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-navy-800 mb-2">
                Age / Birth Date Method <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label
                  className={`flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all ${
                    watch('age_mode') === 'dob'
                      ? 'border-brand-500 bg-brand-50/60 text-brand-900 shadow-xs ring-1 ring-brand-500/20 font-semibold'
                      : 'border-slate-200 bg-white text-navy-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    value="dob"
                    checked={watch('age_mode') === 'dob'}
                    onChange={() => {
                      setValue('age_mode', 'dob', { shouldValidate: true })
                      setValue('current_age', '', { shouldValidate: true })
                      clearErrors('current_age')
                    }}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs sm:text-sm">Enter Date of Birth</span>
                </label>

                <label
                  className={`flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all ${
                    watch('age_mode') === 'age'
                      ? 'border-brand-500 bg-brand-50/60 text-brand-900 shadow-xs ring-1 ring-brand-500/20 font-semibold'
                      : 'border-slate-200 bg-white text-navy-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    value="age"
                    checked={watch('age_mode') === 'age'}
                    onChange={() => {
                      setValue('age_mode', 'age', { shouldValidate: true })
                      setValue('date_of_birth', '', { shouldValidate: true })
                      clearErrors('date_of_birth')
                    }}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs sm:text-sm">Enter Current Age</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Date of Birth field */}
              <div>
                <Input
                  id="date_of_birth"
                  label={`Date of Birth ${watch('age_mode') === 'dob' ? '*' : '(Disabled)'}`}
                  type="date"
                  max={getTodayIso()}
                  disabled={watch('age_mode') !== 'dob' || isSubmitting}
                  className={watch('age_mode') !== 'dob' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}
                  hint={watch('age_mode') === 'dob' ? 'Format: YYYY-MM-DD' : 'Disabled because Current Age is selected'}
                  error={watch('age_mode') === 'dob' ? errors.date_of_birth?.message : undefined}
                  {...register('date_of_birth')}
                />
              </div>

              {/* Age field */}
              <div>
                {watch('age_mode') === 'dob' ? (
                  <div>
                    <label className="block text-xs font-medium text-navy-700 mb-1">
                      Calculated Current Age (Automatic)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={
                        watch('date_of_birth') && calculateAgeFromDob(watch('date_of_birth')) !== null
                          ? `${calculateAgeFromDob(watch('date_of_birth'))} years (calculated)`
                          : 'Calculated automatically from DOB'
                      }
                      className="w-full rounded border border-navy-200 bg-slate-100 px-3 py-2 text-sm text-navy-800 cursor-not-allowed font-medium"
                    />
                    <p className="mt-1 text-[11px] text-navy-500">
                      Current age is automatically calculated from the Date of Birth entered.
                    </p>
                  </div>
                ) : (
                  <div>
                    <Input
                      id="current_age"
                      label="Current Age (in years) *"
                      type="number"
                      min="0"
                      max="125"
                      placeholder="e.g. 25"
                      disabled={watch('age_mode') !== 'age' || isSubmitting}
                      className={watch('age_mode') !== 'age' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}
                      hint="Completed whole years (0 - 125). Date of birth remains unknown."
                      error={watch('age_mode') === 'age' ? errors.current_age?.message : undefined}
                      {...register('current_age')}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 sm:p-4 transition-colors hover:bg-slate-50">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                id="is_deceased"
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                {...register('is_deceased')}
              />
              <div>
                <span className="text-sm font-medium text-navy-900">This person is deceased</span>
                <p className="text-xs text-navy-500 mt-0.5">
                  Check if the person is deceased. Leave unchecked for a living person.
                </p>
              </div>
            </label>
          </div>
        </div>
      </fieldset>

      {/* ---- Community identity ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Community identity
        </legend>
        <GotraNukhSelect
          selectedGotra={selectedGotra}
          selectedNukh={selectedNukh}
          required
          onGotraChange={(val) => {
            setValue('gotra', val, { shouldValidate: true })
            setValue('nukh', '', { shouldValidate: true })
          }}
          onNukhChange={(val) => setValue('nukh', val, { shouldValidate: true })}
          gotraError={errors.gotra?.message}
          nukhError={errors.nukh?.message}
        />

        <div className="mt-4">
          <TwoLevelOccupationSelect
            categoryValue={watch('occupation_category')}
            occupationValue={watch('occupation')}
            onChange={(occ, cat) => {
              setValue('occupation', occ, { shouldValidate: true })
              setValue('occupation_category', cat, { shouldValidate: true })
            }}
            error={errors.occupation?.message}
            required={false}
          />
        </div>
      </fieldset>

      {/* ---- Contact ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Contact
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            hint="Community contact email — may differ from login email"
            error={errors.email_contact?.message}
            {...register('email_contact')}
          />
          <PhoneInputWithCountryCode
            id="primary-phone"
            label="Primary Phone"
            value={watch('phone')}
            onChange={(val) => setValue('phone', val, { shouldValidate: true })}
            placeholder="Enter mobile number"
            error={errors.phone?.message}
          />
        </div>
      </fieldset>

      {/* ---- Privacy (Restricted to Mukhi / Admins: SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR) ---- */}
      {isPrivacyManager && (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-navy-500">
            Privacy settings
          </legend>
          <p className="mb-4 text-xs text-navy-500">
            Control who in the community can see each category of information.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <PrivacyLevelSelect
              label="Profile visibility"
              hint="Who can see this person's record"
              error={errors.profile_privacy?.message}
              {...register('profile_privacy')}
            />
            <PrivacyLevelSelect
              label="Contact visibility"
              hint="Who can see email and phone"
              error={errors.contact_privacy?.message}
              {...register('contact_privacy')}
            />
            <PrivacyLevelSelect
              label="Date of birth visibility"
              hint="Who can see the date of birth"
              error={errors.dob_privacy?.message}
              {...register('dob_privacy')}
            />
          </div>
        </fieldset>
      )}

      {/* ---- Submission ---- */}
      {submitError && (
        <p role="alert" className="text-sm text-red-600">
          {submitError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
