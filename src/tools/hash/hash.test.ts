import { describe, expect, it } from 'vitest'
import { Crc32, hashBytes, hashText, Md5, parseExpected } from './hash'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('MD5 (RFC 1321 test suite)', () => {
  const vectors: [string, string][] = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a']
  ]
  for (const [input, expected] of vectors) {
    it(`MD5(${JSON.stringify(input.slice(0, 20))}) = ${expected}`, () => {
      expect(new Md5().update(bytes(input)).digest()).toBe(expected)
    })
  }
  it('gives the same answer however the data is cut up, including across the 64-byte blocks', () => {
    const data = bytes('The quick brown fox jumps over the lazy dog'.repeat(20))
    const whole = new Md5().update(data).digest()
    for (const cut of [1, 7, 55, 56, 63, 64, 65, 100]) {
      const md5 = new Md5()
      for (let i = 0; i < data.length; i += cut) md5.update(data.subarray(i, i + cut))
      expect(md5.digest()).toBe(whole)
    }
    expect(new Md5().update(bytes('The quick brown fox jumps over the lazy dog')).digest()).toBe('9e107d9d372bb6826bd81d3542a419d6')
  })
})

describe('CRC-32', () => {
  it('matches the standard check value', () => {
    expect(new Crc32().update(bytes('123456789')).digest()).toBe('cbf43926')
    expect(new Crc32().digest()).toBe('00000000')
  })
  it('works in pieces', () => {
    const crc = new Crc32().update(bytes('1234')).update(bytes('56789'))
    expect(crc.digest()).toBe('cbf43926')
  })
})

describe('SHA family via Web Crypto', () => {
  it('matches the FIPS 180 examples for "abc"', async () => {
    expect(await hashBytes('sha1', bytes('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(await hashBytes('sha256', bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await hashBytes('sha512', bytes('abc'))).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
    )
  })
  it('hashes text for several algorithms at once', async () => {
    const result = await hashText(['md5', 'sha256'], 'abc')
    expect(result.md5).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(result.sha256).toHaveLength(64)
  })
})

describe('parseExpected', () => {
  const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  it('finds a hash by its length, in common formats', () => {
    expect(parseExpected(sha256)).toEqual({ hash: sha256, algorithm: 'sha256' })
    expect(parseExpected(`${sha256.toUpperCase()}  ubuntu.iso`)).toEqual({ hash: sha256, algorithm: 'sha256' })
    expect(parseExpected(`SHA256 (ubuntu.iso) = ${sha256}`)?.algorithm).toBe('sha256')
    expect(parseExpected('900150983cd24fb0d6963f7d28e17f72')?.algorithm).toBe('md5')
    expect(parseExpected('cbf43926')?.algorithm).toBe('crc32')
  })
  it('gives nothing for text that is not a checksum', () => {
    expect(parseExpected('hello world')).toBeUndefined()
    expect(parseExpected('')).toBeUndefined()
  })
})
