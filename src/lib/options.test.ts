import { describe, expect, it } from 'vitest'
import { fromText, parseOptions, serializeOptions, toText } from './options'

describe('options in an address', () => {
  it('round-trips strings, numbers and booleans', () => {
    const builtIn = { mode: 'random', length: 20, symbols: true }
    const parsed = parseOptions(builtIn, { mode: 'passphrase', length: '32', symbols: '0' })
    expect(parsed).toEqual({ mode: 'passphrase', length: 32, symbols: false })
    expect(serializeOptions(parsed)).toEqual({ mode: 'passphrase', length: '32', symbols: '0' })
  })
  it('falls back to the built-in value for anything that does not fit', () => {
    expect(fromText('abc', 20)).toBe(20)
    expect(fromText('', 20)).toBe(20)
    expect(fromText('maybe', true)).toBe(true)
    expect(fromText(undefined, 'x')).toBe('x')
  })
  it('writes booleans as 1 and 0', () => {
    expect(toText(true)).toBe('1')
    expect(toText(false)).toBe('0')
  })
})
