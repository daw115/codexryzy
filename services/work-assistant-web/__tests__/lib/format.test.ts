import { describe, it, expect } from 'vitest'
import { formatTokenCount, formatDay } from '@/lib/format'

describe('formatTokenCount', () => {
  it('formats numbers under 1000', () => {
    expect(formatTokenCount(0)).toBe('0')
    expect(formatTokenCount(999)).toBe('999')
  })

  it('formats thousands with k suffix', () => {
    expect(formatTokenCount(1000)).toBe('1.0k')
    expect(formatTokenCount(1500)).toBe('1.5k')
    expect(formatTokenCount(999999)).toBe('1000.0k')
  })

  it('formats millions with M suffix', () => {
    expect(formatTokenCount(1000000)).toBe('1.0M')
    expect(formatTokenCount(1500000)).toBe('1.5M')
  })
})

describe('formatDay', () => {
  it('formats date strings correctly', () => {
    expect(formatDay('2024-01-15')).toBe('15 sty')
    expect(formatDay('2024-12-25')).toBe('25 gru')
  })

  it('returns original value for invalid dates', () => {
    expect(formatDay('invalid')).toBe('invalid')
  })
})
