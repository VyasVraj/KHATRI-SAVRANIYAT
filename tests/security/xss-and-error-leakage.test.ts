import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { createPersonSchema } from '@/features/people/schemas/people.schemas'
import { createFamilySchema } from '@/features/families/schemas/families.schemas'
import { submitClaimSchema, rejectClaimSchema } from '@/features/claims/schemas/claims.schemas'
import { createAnnouncementSchema } from '@/features/community/schemas/announcement.schemas'
import { createEventSchema, cancelEventSchema, setEventRsvpSchema } from '@/features/community/schemas/event.schemas'
import { createGroupSchema } from '@/features/community/schemas/group.schemas'
import { submitVerificationRequestSchema, rejectVerificationRequestSchema } from '@/features/verification/schemas/verification.schemas'
import { createRelationshipSchema } from '@/features/relationships/schemas/relationships.schema'

describe('Security & XSS Audit: Free-Text Fields & Sanitization Integration', () => {
  it('strictly verifies zero instances of dangerouslySetInnerHTML or innerHTML across entire src/', () => {
    const srcDir = path.resolve(__dirname, '../../src')

    function scanFiles(dir: string): string[] {
      const files: string[] = []
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          files.push(...scanFiles(fullPath))
        } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
          files.push(fullPath)
        }
      }
      return files
    }

    const allSourceFiles = scanFiles(srcDir)
    const violations: { file: string; line: number; match: string }[] = []

    for (const filePath of allSourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, index) => {
        const trimmed = line.trim()
        // Skip comment lines
        if (
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/*')
        ) {
          return
        }

        if (
          line.includes('dangerouslySetInnerHTML') ||
          /\binnerHTML\b/.test(line) ||
          /\bouterHTML\b/.test(line) ||
          /\bdocument\.write\b/.test(line)
        ) {
          violations.push({
            file: path.relative(srcDir, filePath),
            line: index + 1,
            match: trimmed,
          })
        }
      })
    }

    expect(violations).toEqual([])
  })

  describe('Zod Schema XSS Sanitization Integration', () => {
    it('strips script tags and executable attributes from Person input', () => {
      const parsed = createPersonSchema.parse({
        first_name: 'Aarav <script>alert("XSS")</script>',
        last_name: 'Patel <img src="x" onerror="steal()" />',
        middle_name: '<iframe src="evil.com"></iframe>K',
        gender: 'MALE',
        blood_group: 'B+',
        date_of_birth: '1990-01-01',
        gotra: '<b>Agastya</b>',
        nukh: 'Arora (Aroda)',
        email_contact: 'aarav@example.com',
        phone: '+919876543210',
        birth_place: 'Ahmedabad <style>body{display:none}</style>',
      })

      expect(parsed.first_name).toBe('Aarav')
      expect(parsed.last_name).toBe('Patel')
      expect(parsed.middle_name).toBe('K')
      expect(parsed.gotra).toBe('Agastya')
      expect(parsed.birth_place).toBe('Ahmedabad')
    })

    it('strips markup while preserving multiline formatting and Unicode in Family schema', () => {
      const parsed = createFamilySchema.parse({
        family_name: 'Patel Parivar <script>alert(1)</script>',
        description: 'First line of history.\n\nSecond line with <b>bold</b> and <script>alert(2)</script>.\nThird line.',
        city: 'અમદાવાદ',
        gotra: 'Kashyap',
      })

      expect(parsed.family_name).toBe('Patel Parivar')
      expect(parsed.description).toBe('First line of history.\n\nSecond line with bold and .\nThird line.')
      expect(parsed.city).toBe('અમદાવાદ')
      expect(parsed.gotra).toBe('Kashyap')
    })

    it('strips malicious payload in Claims schemas', () => {
      const claim = submitClaimSchema.parse({
        personId: '11111111-1111-4111-8111-111111111111',
        evidenceNotes: 'Proof of lineage: <script>document.location="http://evil.com"</script> verified by elder.',
      })
      expect(claim.evidenceNotes).toBe('Proof of lineage:  verified by elder.')

      const rejection = rejectClaimSchema.parse({
        claimId: '11111111-1111-4111-8111-111111111111',
        reason: 'Invalid document <iframe src="evil.com"></iframe> submitted.',
      })
      expect(rejection.reason).toBe('Invalid document submitted.')
    })

    it('strips malicious markup in Announcements schema', () => {
      const announcement = createAnnouncementSchema.parse({
        title: 'Community Gathering <script>alert(1)</script>',
        content: 'Dear members,\n\nPlease join us at the hall.\n<script>alert(2)</script>Regards,\nCommittee',
        announcement_type: 'GENERAL',
      })

      expect(announcement.title).toBe('Community Gathering')
      expect(announcement.content).toBe('Dear members,\n\nPlease join us at the hall.\nRegards,\nCommittee')
    })

    it('strips malicious markup in Events and RSVPs schemas', () => {
      const event = createEventSchema.parse({
        title: 'Annual Festival <img src="x" onerror="steal()" />',
        description: 'Festival details <script>evil()</script>\nLine 2',
        event_type: 'FESTIVAL',
        start_time: '2026-12-01T10:00:00Z',
        location: 'Community Center <iframe src="evil.com"></iframe>',
      })

      expect(event.title).toBe('Annual Festival')
      expect(event.description).toBe('Festival details\nLine 2')
      expect(event.location).toBe('Community Center')

      const rsvp = setEventRsvpSchema.parse({
        event_id: '11111111-1111-4111-8111-111111111111',
        notes: 'Bringing sweets <script>alert(1)</script>',
      })
      expect(rsvp.notes).toBe('Bringing sweets')

      const cancel = cancelEventSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        cancellation_reason: 'Inclement weather <script>evil()</script>',
      })
      expect(cancel.cancellation_reason).toBe('Inclement weather')
    })

    it('strips malicious markup in Groups schema', () => {
      const group = createGroupSchema.parse({
        name: 'Youth Association <script>alert(1)</script>',
        slug: 'youth-association',
        description: 'Activities and workshops <style>body{color:red}</style>',
        group_type: 'YOUTH',
        location: 'Vadodara <script>evil()</script>',
      })

      expect(group.name).toBe('Youth Association')
      expect(group.description).toBe('Activities and workshops')
      expect(group.location).toBe('Vadodara')
    })

    it('strips malicious markup in Verification schemas', () => {
      const request = submitVerificationRequestSchema.parse({
        entityType: 'PERSON',
        entityId: '11111111-1111-4111-8111-111111111111',
        supportingNotes: 'Elder testimony <script>alert("XSS")</script>',
      })
      expect(request.supportingNotes).toBe('Elder testimony')

      const rejection = rejectVerificationRequestSchema.parse({
        requestId: '11111111-1111-4111-8111-111111111111',
        reason: 'Mismatch in census records <iframe src="evil.com"></iframe>',
      })
      expect(rejection.reason).toBe('Mismatch in census records')
    })

    it('strips malicious markup in Relationships schema', () => {
      const relationship = createRelationshipSchema.parse({
        person_a_id: '11111111-1111-4111-8111-111111111111',
        person_b_id: '22222222-2222-4222-8222-222222222222',
        relationship_type: 'PARENT',
        notes: 'Biological parent-child edge <script>evil()</script>',
      })
      expect(relationship.notes).toBe('Biological parent-child edge')
    })
  })
})
