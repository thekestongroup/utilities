import type { Edition } from './book'
import { ALGORITHMS, type Algorithm, type Digits } from './totp'
import { addMonths, isValidZone, parseDate } from './tz'

export type Duration = '1' | '2' | '3' | '6' | '12'
export const PRESET_MONTHS: Duration[] = ['1', '2', '3', '6', '12']

export interface FormState {
  key: string
  label: string
  start: string
  /** Number of calendar months. */
  duration: Duration
  zone: string
  algorithm: Algorithm
  digits: Digits
  period: number
  edition: Edition
  punch: boolean
}

/** A book covers whole months: it starts on the 1st and ends on the 1st, `duration` months later. */
export function endDateOf(form: Pick<FormState, 'start' | 'duration'>): string {
  return parseDate(form.start) ? addMonths(form.start, Number(form.duration)) : ''
}

/** The 1st of the month a date falls in. */
export function firstOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`
}

type Query = Record<string, string | null | (string | null)[] | undefined>
const first = (value: Query[string]): string | undefined => (Array.isArray(value) ? (value[0] ?? undefined) : (value ?? undefined))

/** Settings → the URL's query. Defaults are left out. The key is included on purpose, so a link can be saved per token. */
export function formToQuery(form: FormState): Record<string, string> {
  const query: Record<string, string> = {}
  if (form.key) query.key = form.key
  if (form.label) query.label = form.label
  query.start = form.start
  const end = endDateOf(form)
  if (end) query.end = end
  query.tz = form.zone
  if (form.algorithm !== 'SHA-1') query.algo = form.algorithm
  if (form.digits !== 6) query.digits = String(form.digits)
  if (form.period !== 30) query.period = String(form.period)
  if (form.edition !== 'half') query.edition = form.edition
  if (form.punch) query.punch = '1'
  return query
}

/** The URL's query → settings, ignoring anything that isn't valid. */
export function queryToForm(query: Query, defaults: { today: string; zone: string }): FormState {
  const start = first(query.start)
  // Whole months only: any day in the link is moved to the 1st.
  const validStart = firstOfMonth(start && parseDate(start) ? start : defaults.today)
  const zoneParam = first(query.tz)
  const zone = zoneParam && isValidZone(zoneParam) ? zoneParam : defaults.zone

  let duration: Duration = '1'
  const endParam = first(query.end)
  if (endParam && parseDate(endParam)) {
    duration = PRESET_MONTHS.find((m) => addMonths(validStart, Number(m)) === endParam) ?? '1'
  }

  const algorithm = first(query.algo)
  const digits = first(query.digits)
  const period = Number(first(query.period))
  const edition = first(query.edition)
  return {
    key: first(query.key) ?? '',
    label: first(query.label) ?? '',
    start: validStart,
    duration,
    zone,
    algorithm: ALGORITHMS.includes(algorithm as Algorithm) ? (algorithm as Algorithm) : 'SHA-1',
    digits: digits === '8' ? 8 : 6,
    period: Number.isInteger(period) && period >= 1 && period <= 3600 ? period : 30,
    edition: edition === 'day' ? 'day' : 'half',
    punch: first(query.punch) === '1'
  }
}
