import { describe, it, expect } from 'vitest'
import { toProperCaseName, toSentenceCase, isProtectedToken } from '@/utils/text-casing'

describe('toProperCaseName — Person Name Formatting', () => {
  it('formats uppercase names to Title Case', () => {
    expect(toProperCaseName('VRAJ J VYAS')).toBe('Vraj J Vyas')
    expect(toProperCaseName('CHANDRAKANT V VYAS')).toBe('Chandrakant V Vyas')
    expect(toProperCaseName('DEVILA C VYAS')).toBe('Devila C Vyas')
    expect(toProperCaseName('JAYESH C VYAS')).toBe('Jayesh C Vyas')
    expect(toProperCaseName('TUSHAR C VYAS')).toBe('Tushar C Vyas')
  })

  it('formats lowercase names to Title Case', () => {
    expect(toProperCaseName('vraj j vyas')).toBe('Vraj J Vyas')
    expect(toProperCaseName('jignasha j vyas')).toBe('Jignasha J Vyas')
    expect(toProperCaseName('maya t vyas')).toBe('Maya T Vyas')
    expect(toProperCaseName('harsh t vyas')).toBe('Harsh T Vyas')
    expect(toProperCaseName('dhruv j vyas')).toBe('Dhruv J Vyas')
  })

  it('formats mixed case names cleanly', () => {
    expect(toProperCaseName('jAYESH c vYAS')).toBe('Jayesh C Vyas')
    expect(toProperCaseName('vRaJ j vYaS')).toBe('Vraj J Vyas')
  })

  it('handles initials with dots or single letters', () => {
    expect(toProperCaseName('tushar c. vyas')).toBe('Tushar C. Vyas')
    expect(toProperCaseName('tushar c vyas')).toBe('Tushar C Vyas')
  })

  it('handles hyphenated and apostrophe names', () => {
    expect(toProperCaseName("mary-jane o'connor")).toBe("Mary-Jane O'Connor")
  })

  it('handles empty or null inputs safely', () => {
    expect(toProperCaseName(null)).toBe('')
    expect(toProperCaseName(undefined)).toBe('')
    expect(toProperCaseName('')).toBe('')
    expect(toProperCaseName('   ')).toBe('')
  })
})

describe('toSentenceCase — General Text Formatting', () => {
  it('converts uppercase sentences to sentence case', () => {
    expect(toSentenceCase('THIS IS MY FAMILY DESCRIPTION.')).toBe(
      'This is my family description.'
    )
  })

  it('converts lowercase sentences to sentence case', () => {
    expect(toSentenceCase('this is my family description.')).toBe(
      'This is my family description.'
    )
  })

  it('converts mixed case sentences to sentence case', () => {
    expect(toSentenceCase('tHIS IS MY FAMILY DESCRIPTION.')).toBe(
      'This is my family description.'
    )
  })

  it('handles multi-sentence paragraphs', () => {
    expect(
      toSentenceCase(
        'THIS IS THE FIRST SENTENCE. THIS IS THE SECOND SENTENCE! AND A THIRD?'
      )
    ).toBe('This is the first sentence. This is the second sentence! And a third?')
  })

  it('preserves protected data such as emails, URLs, UUIDs, and acronyms', () => {
    expect(toSentenceCase('contact@example.com')).toBe('contact@example.com')
    expect(toSentenceCase('https://example.com/family')).toBe(
      'https://example.com/family'
    )
    expect(isProtectedToken('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    expect(toSentenceCase('OUR PLATFORM USES AI AND FSSAI COMPLIANCE.')).toBe(
      'Our platform uses AI and FSSAI compliance.'
    )
  })
})
