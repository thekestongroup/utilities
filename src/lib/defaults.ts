import { deleteCookie, readCookie, writeCookie } from './cookies'

/** A tool's options as they appear in its address: short text values. */
export type Options = Record<string, string>

const PREFIX = 'ku-'
/** A cookie holds about 4KB; keep ours well under. */
const MAX_LENGTH = 1500

/**
 * Keeps only the allowed keys, and only text values of a sensible size. This is what stops a
 * secret (a setup key, a password) ever reaching a cookie, however a tool is changed later:
 * a tool lists exactly which options may be saved.
 */
export function pickAllowed(options: Record<string, unknown>, allowed: readonly string[]): Options {
  const picked: Options = {}
  for (const key of allowed) {
    const value = options[key]
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) picked[key] = value
    else if (typeof value === 'number' || typeof value === 'boolean') picked[key] = String(value)
  }
  return picked
}

export function encodeDefaults(options: Options): string {
  return JSON.stringify(options)
}

export function decodeDefaults(text: string | undefined, allowed: readonly string[]): Options {
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return pickAllowed(parsed as Record<string, unknown>, allowed)
  } catch {
    return {}
  }
}

export function loadDefaults(tool: string, allowed: readonly string[]): Options {
  return decodeDefaults(readCookie(PREFIX + tool), allowed)
}

/** Returns false if the options were too big to store. */
export function saveDefaults(tool: string, options: Record<string, unknown>, allowed: readonly string[]): boolean {
  const text = encodeDefaults(pickAllowed(options, allowed))
  if (text.length > MAX_LENGTH) return false
  writeCookie(PREFIX + tool, text)
  return true
}

export function clearDefaults(tool: string): void {
  deleteCookie(PREFIX + tool)
}

export function hasDefaults(tool: string, allowed: readonly string[]): boolean {
  return Object.keys(loadDefaults(tool, allowed)).length > 0
}

type Query = Record<string, string | null | (string | null)[] | undefined>
const first = (value: Query[string]): string | undefined => (Array.isArray(value) ? (value[0] ?? undefined) : (value ?? undefined))

/** The address's options win; whatever it leaves out comes from the saved defaults. */
export function withDefaults(query: Query, defaults: Options): Options {
  const merged: Options = { ...defaults }
  for (const key of Object.keys(query)) {
    const value = first(query[key])
    if (value !== undefined) merged[key] = value
  }
  return merged
}
