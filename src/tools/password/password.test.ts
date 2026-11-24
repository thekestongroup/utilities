import { describe, expect, it } from 'vitest'
import { crackTime, DIGITS, generatePassphrase, generatePassword, LOWER, passphraseEntropy, passwordEntropy, poolSize, secureRandom, strengthOf, UPPER, type CharacterOptions } from './password'

const base: CharacterOptions = { length: 20, lower: true, upper: true, digits: true, symbols: true, symbolSet: '!@#', avoidAmbiguous: false, requireEach: true }
/** A cheap deterministic generator, so tests don't depend on chance. */
function seeded(seed = 1): (max: number) => number {
  let state = seed
  return (max) => {
    state = (state * 1664525 + 1013904223) % 2 ** 32
    return state % max
  }
}

describe('secureRandom', () => {
  it('stays in range and covers it', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const n = secureRandom(7)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(7)
      seen.add(n)
    }
    expect(seen.size).toBe(7)
  })
  it('rejects bad limits', () => {
    expect(() => secureRandom(0)).toThrow()
    expect(() => secureRandom(1.5)).toThrow()
  })
})

describe('generatePassword', () => {
  it('has the right length and only the chosen characters', () => {
    for (let seed = 1; seed < 30; seed++) {
      const p = generatePassword({ ...base, length: 16, symbols: false }, seeded(seed))
      expect(p).toHaveLength(16)
      expect(p).toMatch(/^[A-Za-z0-9]+$/)
    }
  })
  it('includes every chosen kind of character when asked', () => {
    for (let seed = 1; seed < 40; seed++) {
      const p = generatePassword({ ...base, length: 8 }, seeded(seed))
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[0-9]/)
      expect(p).toMatch(/[!@#]/)
    }
  })
  it('leaves out look-alike characters when asked', () => {
    for (let seed = 1; seed < 40; seed++) {
      expect(generatePassword({ ...base, length: 64, avoidAmbiguous: true, symbols: false }, seeded(seed))).not.toMatch(/[O0oIl1]/)
    }
  })
  it('refuses to make a password from nothing', () => {
    expect(() => generatePassword({ ...base, lower: false, upper: false, digits: false, symbols: false })).toThrow()
  })
  it('works with the real random source', () => {
    expect(generatePassword({ ...base, length: 24 })).toHaveLength(24)
  })
})

describe('entropy', () => {
  it('is length x log2(pool)', () => {
    expect(poolSize({ ...base, symbols: false })).toBe(62)
    expect(passwordEntropy({ ...base, length: 10, symbols: false })).toBeCloseTo(10 * Math.log2(62), 6)
    expect(poolSize({ ...base, lower: false, upper: false, symbols: false })).toBe(DIGITS.length)
    expect(LOWER.length + UPPER.length).toBe(52)
  })
  it('counts words from a 7,776-word list at 12.92 bits each', () => {
    expect(passphraseEntropy({ words: 6, separator: '-', capitalize: false, number: false }, 7776)).toBeCloseTo(77.5, 1)
  })
  it('puts passwords into plain bands', () => {
    expect(strengthOf(20).label).toBe('Very weak')
    expect(strengthOf(50).label).toBe('Fair')
    expect(strengthOf(100).label).toBe('Very strong')
    expect(crackTime(10)).toBe('less than a second')
    expect(crackTime(128)).toBe('longer than the age of the universe')
  })
})

describe('generatePassphrase', () => {
  const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
  it('joins the right number of words', () => {
    const phrase = generatePassphrase({ words: 4, separator: '-', capitalize: true, number: false }, words, seeded(3))
    const parts = phrase.split('-')
    expect(parts).toHaveLength(4)
    for (const part of parts) expect(part).toMatch(/^[A-Z][a-z]+$/)
  })
  it('can add one digit', () => {
    const phrase = generatePassphrase({ words: 3, separator: ' ', capitalize: false, number: true }, words, seeded(5))
    expect(phrase.match(/[0-9]/g)).toHaveLength(1)
  })
})
