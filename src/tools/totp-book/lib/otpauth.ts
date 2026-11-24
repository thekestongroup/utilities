import type { Algorithm } from './totp'

export interface OtpauthData {
  /** The raw `secret` parameter (not yet normalised or decoded). */
  secret: string
  issuer?: string
  account?: string
  /** "Issuer — account", for the book's headings. */
  label?: string
  algorithm?: Algorithm
  digits?: 6 | 8
  period?: number
}

export class OtpauthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OtpauthError'
  }
}

export function looksLikeOtpauth(text: string): boolean {
  return /^\s*otpauth:\/\//i.test(text)
}

const ALGORITHMS: Record<string, Algorithm> = {
  SHA1: 'SHA-1',
  'SHA-1': 'SHA-1',
  SHA256: 'SHA-256',
  'SHA-256': 'SHA-256',
  SHA512: 'SHA-512',
  'SHA-512': 'SHA-512'
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, ' '))
  } catch {
    return part
  }
}

/** Reads an `otpauth://totp/Issuer:account?secret=…&issuer=…` URI. Error messages never include the URI. */
export function parseOtpauth(uri: string): OtpauthData {
  const match = /^\s*otpauth:\/\/([a-z]+)\/([^?#]*)\??([^#]*)/i.exec(uri)
  if (!match) throw new OtpauthError('This is not a valid otpauth:// link.')
  const [, type, rawLabel, rawQuery] = match
  if (type!.toLowerCase() !== 'totp') {
    throw new OtpauthError('Only time-based (TOTP) keys can be printed. This link is for a counter-based key.')
  }
  const params = new URLSearchParams(rawQuery)
  const secret = params.get('secret')
  if (!secret) throw new OtpauthError('This otpauth:// link has no secret in it.')

  const label = decode(rawLabel!)
  const colon = label.indexOf(':')
  const labelIssuer = colon >= 0 ? label.slice(0, colon).trim() : undefined
  const account = (colon >= 0 ? label.slice(colon + 1) : label).trim() || undefined
  const issuer = params.get('issuer')?.trim() || labelIssuer || undefined

  const data: OtpauthData = { secret, issuer, account }
  data.label = [issuer, account].filter(Boolean).join(' — ') || undefined

  const algorithm = params.get('algorithm')
  if (algorithm) {
    const known = ALGORITHMS[algorithm.toUpperCase()]
    if (!known) throw new OtpauthError(`This link uses an algorithm that is not supported (${algorithm}).`)
    data.algorithm = known
  }
  const digits = params.get('digits')
  if (digits) {
    if (digits !== '6' && digits !== '8') throw new OtpauthError(`This link asks for ${digits} digits. Only 6 or 8 are supported.`)
    data.digits = Number(digits) as 6 | 8
  }
  const period = params.get('period')
  if (period) {
    const seconds = Number(period)
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
      throw new OtpauthError('This link has a period outside 1–3600 seconds.')
    }
    data.period = seconds
  }
  return data
}
