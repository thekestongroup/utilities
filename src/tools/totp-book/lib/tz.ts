/**
 * Time zone helpers built only on Intl.DateTimeFormat. "Wall" seconds are a
 * local clock reading expressed as if it were UTC (unix seconds + the zone's
 * offset), so a plain Date's UTC fields give the local date and time.
 */
const partFormatters = new Map<string, Intl.DateTimeFormat>()
const abbrFormatters = new Map<string, Intl.DateTimeFormat>()

function partFormatter(zone: string) {
  let f = partFormatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    })
    partFormatters.set(zone, f)
  }
  return f
}

export function isValidZone(zone: string): boolean {
  try {
    partFormatter(zone)
    return true
  } catch {
    return false
  }
}

export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function allZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  const zones = new Set(supported)
  zones.add('UTC')
  zones.add(browserZone())
  return [...zones].sort()
}

/** Seconds the zone is ahead of UTC at a moment (e.g. 3600 for BST). */
export function offsetSeconds(zone: string, unixSeconds: number): number {
  const parts = partFormatter(zone).formatToParts(new Date(Math.floor(unixSeconds) * 1000))
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) / 1000
  return wall - Math.floor(unixSeconds)
}

/** Short zone name at a moment, e.g. "BST", "GMT", "CET", "GMT+9". */
export function zoneAbbreviation(zone: string, unixSeconds: number): string {
  if (zone === 'UTC') return 'UTC'
  let f = abbrFormatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' })
    abbrFormatters.set(zone, f)
  }
  return f.formatToParts(new Date(unixSeconds * 1000)).find((p) => p.type === 'timeZoneName')?.value ?? zone
}

// ── Calendar dates as YYYY-MM-DD strings ────────────────────────────────────

export function parseDate(date: string): [number, number, number] | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return undefined
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(y, m - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return undefined
  return [y, m, d]
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date)!
  return toIso(Date.UTC(y, m - 1, d + days))
}

/** Calendar months, so 14 March + 1 month is 14 April. A day that doesn't exist is clamped (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parseDate(date)!
  const first = Date.UTC(y, m - 1 + months, 1)
  const lastDay = new Date(Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth() + 1, 0)).getUTCDate()
  const result = new Date(first)
  return toIso(Date.UTC(result.getUTCFullYear(), result.getUTCMonth(), Math.min(d, lastDay)))
}

export function daysBetween(from: string, to: string): number {
  const a = parseDate(from)!
  const b = parseDate(to)!
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000)
}

export function todayIn(zone: string): string {
  const wall = Date.now() / 1000 + offsetSeconds(zone, Date.now() / 1000)
  return toIso(wall * 1000)
}

/** The instant when the local clock reads `wall` (seconds since local 1970-01-01 00:00, as if UTC). In a gap, the moment of the clock change. */
export function wallToInstant(zone: string, wall: number): number {
  let t = wall - offsetSeconds(zone, wall)
  t = wall - offsetSeconds(zone, t)
  if (t + offsetSeconds(zone, t) !== wall) {
    // That clock time was skipped by a clock change: use the moment of the change.
    t = wall - offsetSeconds(zone, wall - 86400)
  }
  return t
}

/** The instant (unix seconds) of 00:00 local time on a date. If midnight doesn't exist that day, the first moment of it. */
export function startOfDay(zone: string, date: string): number {
  const [y, m, d] = parseDate(date)!
  return wallToInstant(zone, Date.UTC(y, m - 1, d) / 1000)
}

/** The instant of 12:00 local time on a date. */
export function noonOfDay(zone: string, date: string): number {
  const [y, m, d] = parseDate(date)!
  return wallToInstant(zone, Date.UTC(y, m - 1, d) / 1000 + 12 * 3600)
}

// ── Clock changes ───────────────────────────────────────────────────────────

export interface Transition {
  /** Unix seconds when the clocks changed. */
  at: number
  /** Offset before and after, in seconds. */
  before: number
  after: number
}

/** Every clock change in [from, to], found by sampling and then bisecting. */
export function findTransitions(zone: string, from: number, to: number, step = 3 * 3600): Transition[] {
  const found: Transition[] = []
  let t = from
  let offset = offsetSeconds(zone, t)
  while (t < to) {
    const next = Math.min(t + step, to)
    const nextOffset = offsetSeconds(zone, next)
    if (nextOffset !== offset) {
      let lo = t
      let hi = next
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        if (offsetSeconds(zone, mid) === offset) lo = mid
        else hi = mid
      }
      found.push({ at: hi, before: offset, after: offsetSeconds(zone, hi) })
      offset = offsetSeconds(zone, hi)
      if (offset !== nextOffset) {
        // Two changes inside one step: carry on from just after the first.
        t = hi
        continue
      }
    }
    t = next
    offset = nextOffset
  }
  return found
}

// ── Clock formatting from wall seconds ──────────────────────────────────────

const pad = (n: number) => (n < 10 ? `0${n}` : String(n))

/** "14:37:30" from wall seconds. */
export function clockFromWall(wall: number, seconds = true): string {
  const day = ((wall % 86400) + 86400) % 86400
  const h = Math.floor(day / 3600)
  const m = Math.floor((day % 3600) / 60)
  const s = day % 60
  return seconds ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`
}

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})
const shortDayFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
const rangeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/** "Tuesday 14 March 2027" from wall seconds. */
export function longDayFromWall(wall: number): string {
  return dayFormatter.format(new Date(wall * 1000)).replace(/^(\w+),? /, '$1 ')
}
export function shortDayFromWall(wall: number): string {
  return shortDayFormatter.format(new Date(wall * 1000)).replace(',', '')
}
export function dateKeyFromWall(wall: number): string {
  return toIso(wall * 1000)
}
/** "14 Mar 2027" from YYYY-MM-DD. */
export function formatDate(date: string): string {
  const [y, m, d] = parseDate(date)!
  return rangeFormatter.format(new Date(Date.UTC(y, m - 1, d)))
}
