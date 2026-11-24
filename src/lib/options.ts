/**
 * Options kept in a tool's address (and in saved defaults) are short text; a tool describes them
 * with built-in values, and these helpers turn text back into the right type.
 */
export type OptionValue = string | number | boolean
export type OptionSet = Record<string, OptionValue>

export function toText(value: OptionValue): string {
  return typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
}

/** Turns text into the same type as `fallback`. Anything that doesn't fit gives `fallback`. */
export function fromText<T extends OptionValue>(raw: string | undefined, fallback: T): T {
  if (raw === undefined) return fallback
  if (typeof fallback === 'boolean') return (raw === '1' ? true : raw === '0' ? false : fallback) as T
  if (typeof fallback === 'number') {
    const n = Number(raw)
    return (raw.trim() !== '' && Number.isFinite(n) ? n : fallback) as T
  }
  return raw as T
}

export function parseOptions<T extends OptionSet>(builtIn: T, raw: Record<string, string | undefined>): T {
  const result = { ...builtIn }
  for (const key of Object.keys(builtIn) as (keyof T & string)[]) result[key] = fromText(raw[key], builtIn[key])
  return result
}

export function serializeOptions(options: OptionSet): Record<string, string> {
  const text: Record<string, string> = {}
  for (const [key, value] of Object.entries(options)) text[key] = toText(value)
  return text
}
