import { describe, expect, it } from 'vitest'
import { looksLikeOtpauth, OtpauthError, parseOtpauth } from './otpauth'

describe('parseOtpauth', () => {
  it('reads every field', () => {
    const data = parseOtpauth(
      'otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA256&digits=8&period=60'
    )
    expect(data).toMatchObject({
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'Example',
      account: 'alice@example.com',
      label: 'Example — alice@example.com',
      algorithm: 'SHA-256',
      digits: 8,
      period: 60
    })
  })

  it('works with only a secret, and leaves the rest undefined', () => {
    const data = parseOtpauth('otpauth://totp/me?secret=JBSWY3DPEHPK3PXP')
    expect(data.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(data.algorithm).toBeUndefined()
    expect(data.digits).toBeUndefined()
    expect(data.period).toBeUndefined()
    expect(data.label).toBe('me')
  })

  it('takes the issuer from the label when there is no issuer parameter', () => {
    expect(parseOtpauth('otpauth://totp/GitHub:bob?secret=ABCDEFGH').issuer).toBe('GitHub')
    expect(parseOtpauth('otpauth://totp/GitHub%3Abob?secret=ABCDEFGH').account).toBe('bob')
  })

  it('prefers the issuer parameter', () => {
    expect(parseOtpauth('otpauth://totp/Old:bob?secret=ABCDEFGH&issuer=New').label).toBe('New — bob')
  })

  it('accepts SHA1 and SHA-512 spellings', () => {
    expect(parseOtpauth('otpauth://totp/x?secret=ABCDEFGH&algorithm=SHA1').algorithm).toBe('SHA-1')
    expect(parseOtpauth('otpauth://totp/x?secret=ABCDEFGH&algorithm=sha512').algorithm).toBe('SHA-512')
  })

  it('rejects HOTP, missing secrets and unsupported options', () => {
    expect(() => parseOtpauth('otpauth://hotp/x?secret=ABCDEFGH&counter=1')).toThrow(OtpauthError)
    expect(() => parseOtpauth('otpauth://totp/x')).toThrow(OtpauthError)
    expect(() => parseOtpauth('otpauth://totp/x?secret=ABCDEFGH&digits=7')).toThrow(OtpauthError)
    expect(() => parseOtpauth('otpauth://totp/x?secret=ABCDEFGH&algorithm=MD5')).toThrow(OtpauthError)
    expect(() => parseOtpauth('https://example.com')).toThrow(OtpauthError)
  })

  it('does not put the secret in error messages', () => {
    try {
      parseOtpauth('otpauth://totp/x?secret=TOPSECRETKEY&digits=7')
    } catch (error) {
      expect((error as Error).message).not.toMatch(/TOPSECRET/)
    }
  })
})

describe('looksLikeOtpauth', () => {
  it('spots a pasted link', () => {
    expect(looksLikeOtpauth('  otpauth://totp/x?secret=A')).toBe(true)
    expect(looksLikeOtpauth('JBSWY3DP')).toBe(false)
  })
})
