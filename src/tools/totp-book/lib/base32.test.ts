import { describe, expect, it } from 'vitest'
import { Base32Error, decodeBase32, normalizeBase32, validateBase32 } from './base32'

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('decodeBase32', () => {
  it('decodes the RFC 4648 vectors', () => {
    expect(text(decodeBase32('MY======'))).toBe('f')
    expect(text(decodeBase32('MZXQ===='))).toBe('fo')
    expect(text(decodeBase32('MZXW6==='))).toBe('foo')
    expect(text(decodeBase32('MZXW6YQ='))).toBe('foob')
    expect(text(decodeBase32('MZXW6YTB'))).toBe('fooba')
    expect(text(decodeBase32('MZXW6YTBOI======'))).toBe('foobar')
  })

  it('decodes the RFC 6238 test key', () => {
    expect(text(decodeBase32('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'))).toBe('12345678901234567890')
  })

  it('accepts lowercase, spaces, dashes and missing padding', () => {
    const expected = text(decodeBase32('MZXW6YTBOI======'))
    expect(text(decodeBase32('mzxw 6ytb-oi'))).toBe(expected)
    expect(text(decodeBase32('  MZXW6YTBOI  '))).toBe(expected)
    expect(text(decodeBase32('mzxw6ytboi'))).toBe(expected)
  })

  it('rejects characters outside the alphabet', () => {
    expect(() => decodeBase32('MZXW6YT1')).toThrow(Base32Error) // 1 is not base32
    expect(() => decodeBase32('MZXW6YT!')).toThrow(Base32Error)
    expect(() => decodeBase32('')).toThrow(Base32Error)
  })

  it('rejects impossible lengths', () => {
    expect(() => decodeBase32('MZXW6YTBO')).toThrow(Base32Error) // 9 characters
  })

  it('never puts the key in the error', () => {
    try {
      decodeBase32('SECRETKEY1')
    } catch (error) {
      expect((error as Error).message).not.toMatch(/SECRETKEY/i)
    }
  })
})

describe('normalizeBase32', () => {
  it('upper-cases and strips separators and padding', () => {
    expect(normalizeBase32('mzxw 6ytb-oi==')).toBe('MZXW6YTBOI')
  })
})

describe('validateBase32', () => {
  it('returns a message for bad keys and nothing for good ones', () => {
    expect(validateBase32('GEZDGNBVGY3TQOJQ')).toBeUndefined()
    expect(validateBase32('not a key!')).toMatch(/valid setup key/)
  })
})
