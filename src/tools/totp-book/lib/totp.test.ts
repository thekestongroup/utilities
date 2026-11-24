import { describe, expect, it } from 'vitest'
import { generateCodes, groupCode, importKey, totp, type Algorithm } from './totp'

const ascii = (s: string) => new TextEncoder().encode(s)
const KEYS: Record<Algorithm, string> = {
  'SHA-1': '12345678901234567890',
  'SHA-256': '12345678901234567890123456789012',
  'SHA-512': '1234567890123456789012345678901234567890123456789012345678901234'
}

// RFC 6238 Appendix B (8 digits, 30 second period).
const VECTORS: Record<Algorithm, [number, string][]> = {
  'SHA-1': [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130']
  ],
  'SHA-256': [
    [59, '46119246'],
    [1111111109, '68084774'],
    [1111111111, '67062674'],
    [1234567890, '91819424'],
    [2000000000, '90698825'],
    [20000000000, '77737706']
  ],
  'SHA-512': [
    [59, '90693936'],
    [1111111109, '25091201'],
    [1111111111, '99943326'],
    [1234567890, '93441116'],
    [2000000000, '38618901'],
    [20000000000, '47863826']
  ]
}

describe('RFC 6238 Appendix B', () => {
  for (const algorithm of Object.keys(VECTORS) as Algorithm[]) {
    describe(algorithm, () => {
      for (const [time, expected] of VECTORS[algorithm]) {
        it(`T=${time} → ${expected}`, async () => {
          const key = await importKey(ascii(KEYS[algorithm]), algorithm)
          expect(await totp(key, time, 30, 8)).toBe(expected)
        })
      }
    })
  }
})

describe('digits', () => {
  it('takes the last 6 digits for 6-digit codes and keeps leading zeros', async () => {
    const key = await importKey(ascii(KEYS['SHA-1']), 'SHA-1')
    expect(await totp(key, 1111111109, 30, 6)).toBe('081804')
  })
})

describe('generateCodes', () => {
  it('matches totp() one counter at a time', async () => {
    const key = await importKey(ascii(KEYS['SHA-1']), 'SHA-1')
    const first = Math.floor(1111111109 / 30)
    const codes = await generateCodes(key, first, 5000, 8, undefined, 1000)
    expect(codes[0]).toBe(7081804)
    for (const i of [0, 1, 2, 999, 1000, 4999]) {
      expect(String(codes[i]).padStart(8, '0')).toBe(await totp(key, (first + i) * 30, 30, 8))
    }
  })
})

describe('groupCode', () => {
  it('groups 6 digits as 3+3 and 8 as 4+4', () => {
    expect(groupCode('482913')).toBe('482 913')
    expect(groupCode('07081804')).toBe('0708 1804')
  })
})

describe('matchOffset', () => {
  it('finds which step a typed code belongs to', async () => {
    const { matchOffset } = await import('./totp')
    const key = await importKey(ascii(KEYS['SHA-1']), 'SHA-1')
    const now = 1111111111
    const current = await totp(key, now, 30, 8)
    const previous = await totp(key, now - 30, 30, 8)
    const next = await totp(key, now + 30, 30, 8)
    expect(await matchOffset(key, current, now, 30, 8)).toBe(0)
    expect(await matchOffset(key, previous, now, 30, 8)).toBe(-1)
    expect(await matchOffset(key, next, now, 30, 8)).toBe(1)
    expect(await matchOffset(key, `${current.slice(0, 4)} ${current.slice(4)}`, now, 30, 8)).toBe(0)
  })
  it('gives nothing for wrong, short or non-numeric input', async () => {
    const { matchOffset } = await import('./totp')
    const key = await importKey(ascii(KEYS['SHA-1']), 'SHA-1')
    expect(await matchOffset(key, '00000000', 1111111111, 30, 8)).toBeUndefined()
    expect(await matchOffset(key, '1234', 1111111111, 30, 8)).toBeUndefined()
    expect(await matchOffset(key, 'abcdefgh', 1111111111, 30, 8)).toBeUndefined()
  })
})
