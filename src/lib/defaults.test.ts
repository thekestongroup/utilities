import { describe, expect, it } from 'vitest'
import { parseCookies, serializeCookie } from './cookies'
import { decodeDefaults, encodeDefaults, pickAllowed, withDefaults } from './defaults'

describe('cookies', () => {
  it('writes name, path, lifetime and SameSite, and Secure when asked', () => {
    expect(serializeCookie('ku-qr', '{"a":"1"}', { path: '/utilities/', maxAge: 60, secure: true })).toBe(
      'ku-qr=%7B%22a%22%3A%221%22%7D; Path=/utilities/; Max-Age=60; SameSite=Lax; Secure'
    )
  })
  it('reads cookies back, ignoring ones it cannot decode', () => {
    const jar = parseCookies('a=1; ku-qr=%7B%22x%22%3A%222%22%7D; broken=%E0%A4%A; b=2')
    expect(jar).toMatchObject({ a: '1', 'ku-qr': '{"x":"2"}', b: '2' })
    expect(jar.broken).toBeUndefined()
  })
})

describe('defaults', () => {
  const allowed = ['tz', 'edition', 'punch']
  it('only ever keeps the allowed options, so a secret cannot reach a cookie', () => {
    const picked = pickAllowed({ tz: 'Europe/London', key: 'JBSWY3DPEHPK3PXP', password: 'hunter2', punch: true, edition: '' }, allowed)
    expect(picked).toEqual({ tz: 'Europe/London', punch: 'true' })
    expect(encodeDefaults(picked)).not.toMatch(/JBSWY|hunter/)
  })
  it('drops anything not allowed when reading, even from a tampered cookie', () => {
    const text = JSON.stringify({ tz: 'UTC', key: 'SECRET', edition: 'day' })
    expect(decodeDefaults(text, allowed)).toEqual({ tz: 'UTC', edition: 'day' })
    expect(decodeDefaults('not json', allowed)).toEqual({})
    expect(decodeDefaults('["a"]', allowed)).toEqual({})
    expect(decodeDefaults(undefined, allowed)).toEqual({})
  })
  it('lets the address win and fills the rest from the defaults', () => {
    expect(withDefaults({ tz: 'Asia/Tokyo', start: '2027-01-01' }, { tz: 'UTC', edition: 'day' })).toEqual({ tz: 'Asia/Tokyo', edition: 'day', start: '2027-01-01' })
  })
})
