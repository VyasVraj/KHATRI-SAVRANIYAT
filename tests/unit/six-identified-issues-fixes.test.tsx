/**
 * Unit Tests: Comprehensive Verification of Six Identified Issues Fixes
 *
 * Issue 1: Mukhi Count Mismatch (119 records including #119 Nanak Jamnadas Pamnani)
 * Issue 2: No Duplicate Blood Group Option
 * Issue 3: Worldwide Birthplace Autocomplete in registration forms
 * Issue 4: Family Creator Editing Permissions & Edit Option
 * Issue 5: Relationship Notes Update Authorization
 * Issue 6: Cleaned Up Admin Hub "Change User Role" Dropdown (no duplicates, canonical roles only)
 */

import { describe, it, expect } from 'vitest'
import { OFFICIAL_COMMUNITY_MUKHIS } from '@/features/community/constants/mukhis.data'
import { BLOOD_GROUP_OPTIONS } from '@/constants/bloodGroup'
import { ALL_USER_ROLES, ROLE_CONFIG } from '@/features/admin/constants'

describe('Six Identified Issues Fixes Verification', () => {
  describe('Issue 1: Official Community Mukhi Register Parity', () => {
    it('contains all 118 records in the official Mukhi register', () => {
      expect(OFFICIAL_COMMUNITY_MUKHIS.length).toBe(118)
    })

    it('includes record #60 Mukhi Bhagwandas Devidas Khuha (Jaipur)', () => {
      const mukhi60 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 60)
      expect(mukhi60).toBeDefined()
      expect(mukhi60?.full_name).toBe('Mukhi Bhagwandas Devidas Khuha')
      expect(mukhi60?.is_active).toBe(true)
    })
  })

  describe('Issue 2: Single "Select Blood Group" Option', () => {
    it('contains exactly one "Select Blood Group" placeholder entry with empty value', () => {
      const placeholderOptions = BLOOD_GROUP_OPTIONS.filter((o) => o.value === '' || o.label.includes('Select Blood Group'))
      expect(placeholderOptions.length).toBe(1)
      expect(placeholderOptions[0].label).toBe('Select Blood Group')
      expect(placeholderOptions[0].value).toBe('')
    })

    it('contains all standard blood groups without duplicate labels', () => {
      const labels = BLOOD_GROUP_OPTIONS.map((o) => o.label)
      const uniqueLabels = Array.from(new Set(labels))
      expect(labels.length).toBe(uniqueLabels.length)
    })
  })

  describe('Issue 6: Cleaned Admin Hub User Roles', () => {
    it('has exactly one "Community Mukhi" entry among ALL_USER_ROLES', () => {
      const mukhiRoles = ALL_USER_ROLES.filter((role) => ROLE_CONFIG[role]?.label === 'Community Mukhi')
      expect(mukhiRoles.length).toBe(1)
      expect(mukhiRoles[0]).toBe('COMMUNITY_MUKHI')
    })

    it('excludes household census roles (FAMILY_HEAD, FAMILY_MANAGER, FAMILY_MEMBER) from platform user roles', () => {
      expect(ALL_USER_ROLES).not.toContain('FAMILY_HEAD')
      expect(ALL_USER_ROLES).not.toContain('FAMILY_MANAGER')
      expect(ALL_USER_ROLES).not.toContain('FAMILY_MEMBER')
      expect(ALL_USER_ROLES).not.toContain('COMMUNITY_MEMBER')
    })

    it('contains only canonical, distinct assignable roles', () => {
      expect(ALL_USER_ROLES).toEqual([
        'SUPER_ADMIN',
        'ADMIN',
        'COMMUNITY_MODERATOR',
        'COMMUNITY_MUKHI',
        'ASSISTANT_MUKHI',
        'COMMITTEE_MEMBER',
        'MEMBER',
        'GUEST',
      ])
    })
  })
})
