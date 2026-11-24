/** A source of random whole numbers below `max`. Real use is the browser's CSPRNG; tests pass their own. */
export type Random = (max: number) => number

/** Uniform random integer in [0, max), from crypto.getRandomValues, without modulo bias. */
export const secureRandom: Random = (max) => {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError('max out of range')
  const limit = Math.floor(2 ** 32 / max) * max // reject values in the uneven tail
  const buffer = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buffer)
    if (buffer[0]! < limit) return buffer[0]! % max
  }
}

export const LOWER = 'abcdefghijklmnopqrstuvwxyz'
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const DIGITS = '0123456789'
export const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/'
/** Characters that are easy to mistake for each other. */
const AMBIGUOUS = new Set('O0oIl1|`\'"')

export interface CharacterOptions {
  length: number
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
  /** Which symbols to use when `symbols` is on. */
  symbolSet: string
  avoidAmbiguous: boolean
  /** Make sure at least one character comes from each chosen set. */
  requireEach: boolean
}

function sets(options: CharacterOptions): string[] {
  const chosen: string[] = []
  if (options.lower) chosen.push(LOWER)
  if (options.upper) chosen.push(UPPER)
  if (options.digits) chosen.push(DIGITS)
  if (options.symbols && options.symbolSet) chosen.push([...new Set(options.symbolSet)].join(''))
  return chosen
    .map((set) => (options.avoidAmbiguous ? [...set].filter((c) => !AMBIGUOUS.has(c)).join('') : set))
    .filter((set) => set.length > 0)
}

/** How many different characters a password can be made of. */
export function poolSize(options: CharacterOptions): number {
  return new Set(sets(options).join('')).size
}

function shuffle<T>(items: T[], random: Random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = random(i + 1)
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}

export function generatePassword(options: CharacterOptions, random: Random = secureRandom): string {
  const chosen = sets(options)
  const pool = [...new Set(chosen.join(''))]
  if (pool.length === 0) throw new Error('Choose at least one kind of character.')
  const length = Math.max(1, Math.floor(options.length))
  const result: string[] = []
  if (options.requireEach && length >= chosen.length) {
    for (const set of chosen) result.push(set[random(set.length)]!)
  }
  while (result.length < length) result.push(pool[random(pool.length)]!)
  return shuffle(result, random).join('')
}

export interface PassphraseOptions {
  words: number
  separator: string
  capitalize: boolean
  /** Add a random digit to the end of one word. */
  number: boolean
}

export function generatePassphrase(options: PassphraseOptions, wordList: readonly string[], random: Random = secureRandom): string {
  if (wordList.length < 2) throw new Error('No word list.')
  const count = Math.max(1, Math.floor(options.words))
  const words: string[] = []
  for (let i = 0; i < count; i++) {
    let word = wordList[random(wordList.length)]!
    if (options.capitalize) word = word.charAt(0).toUpperCase() + word.slice(1)
    words.push(word)
  }
  if (options.number) {
    const at = random(words.length)
    words[at] = words[at]! + String(random(10))
  }
  return words.join(options.separator)
}

/** Bits of randomness in a password of this kind: length x log2(pool). */
export function passwordEntropy(options: CharacterOptions): number {
  const pool = poolSize(options)
  return pool > 1 ? Math.max(1, Math.floor(options.length)) * Math.log2(pool) : 0
}

export function passphraseEntropy(options: PassphraseOptions, wordCount: number): number {
  const words = Math.max(1, Math.floor(options.words))
  const extra = options.number ? Math.log2(words * 10) : 0
  return words * Math.log2(wordCount) + extra
}

export interface Strength {
  label: 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong'
  /** 0 to 4, for a meter. */
  level: 0 | 1 | 2 | 3 | 4
}

/** A plain label for bits of entropy. Guesses at an offline fast hash: 10^10 a second. */
export function strengthOf(bits: number): Strength {
  if (bits < 28) return { label: 'Very weak', level: 0 }
  if (bits < 40) return { label: 'Weak', level: 1 }
  if (bits < 60) return { label: 'Fair', level: 2 }
  if (bits < 80) return { label: 'Strong', level: 3 }
  return { label: 'Very strong', level: 4 }
}

/** Roughly how long a guesser doing 10 billion guesses a second would need, on average. */
export function crackTime(bits: number): string {
  const seconds = 2 ** (bits - 1) / 1e10
  const units: [number, string][] = [
    [60 * 60 * 24 * 365 * 1e9, 'billion years'],
    [60 * 60 * 24 * 365 * 1e6, 'million years'],
    [60 * 60 * 24 * 365 * 1e3, 'thousand years'],
    [60 * 60 * 24 * 365, 'years'],
    [60 * 60 * 24, 'days'],
    [60 * 60, 'hours'],
    [60, 'minutes']
  ]
  if (seconds < 1) return 'less than a second'
  for (const [size, name] of units) {
    if (seconds >= size) {
      const value = seconds / size
      return value > 1e6 ? 'longer than the age of the universe' : `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${name}`
    }
  }
  return `${Math.round(seconds)} seconds`
}
