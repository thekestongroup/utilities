/**
 * RFC 4648 base32, as used for TOTP setup keys. Error messages never include
 * the key itself.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const LOOKUP = new Map([...ALPHABET].map((char, index) => [char, index]))

export class Base32Error extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Base32Error'
  }
}

/** Upper-cases and strips spaces, dashes and `=` padding. */
export function normalizeBase32(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '').replace(/=+$/, '')
}

/** Decodes a setup key in any common format. Throws Base32Error when it isn't base32. */
export function decodeBase32(input: string): Uint8Array {
  const normalized = normalizeBase32(input)
  if (normalized.length === 0) throw new Base32Error('Enter a setup key.')
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    throw new Base32Error('This is not a valid setup key: it can only contain the letters A–Z and the digits 2–7.')
  }
  // 1, 3 and 6 leftover characters can't be a whole number of bytes.
  if ([1, 3, 6].includes(normalized.length % 8)) {
    throw new Base32Error('This setup key looks incomplete. Check that you copied all of it.')
  }
  const bytes = new Uint8Array(Math.floor((normalized.length * 5) / 8))
  let bits = 0
  let value = 0
  let index = 0
  for (const char of normalized) {
    value = (value << 5) | LOOKUP.get(char)!
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes[index++] = (value >>> bits) & 0xff
    }
  }
  return bytes
}

/** Whether the text decodes as base32 (so the form can flag it while typing). */
export function validateBase32(input: string): string | undefined {
  try {
    decodeBase32(input).fill(0)
    return undefined
  } catch (error) {
    return error instanceof Base32Error ? error.message : 'This is not a valid setup key.'
  }
}
