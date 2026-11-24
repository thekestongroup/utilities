import { addDays, clockFromWall, dateKeyFromWall, findTransitions, longDayFromWall, noonOfDay, offsetSeconds, startOfDay, zoneAbbreviation, type Transition } from './tz'
import { groupCode, padCode, type Algorithm, type Digits } from './totp'

/** Half day: an AM page and a PM page for each day. Day: one page per day, in much smaller type. */
export type Edition = 'half' | 'day'

export interface BookSettings {
  label: string
  zone: string
  /** First day, YYYY-MM-DD. The book starts at 00:00 local time. */
  start: string
  /** Day the book ends (exclusive), YYYY-MM-DD, 00:00 local time. */
  end: string
  algorithm: Algorithm
  digits: Digits
  period: number
  edition: Edition
  /** Leave a wider margin on the binding side for a hole punch. */
  punch: boolean
}

export interface VolumePlan {
  /** 1-based. */
  number: number
  startDate: string
  endDate: string
  startSec: number
  endSec: number
  /** TOTP counter of the first code in the volume. */
  firstCounter: number
  count: number
  pages: number
}

export interface BookPlan {
  startSec: number
  endSec: number
  volumes: VolumePlan[]
  totalCodes: number
  totalPages: number
}

/** Longest book allowed, so a mistyped year can't ask for millions of codes. */
export const MAX_DAYS = 366

/**
 * Instants where pages begin, then the end of the last page. Pages break at
 * local midnight (and noon, for half days), so a day with a clock change simply
 * has a shorter or longer AM or PM page.
 */
export function pageBounds(zone: string, startDate: string, endDate: string, edition: Edition): number[] {
  const bounds: number[] = []
  for (let date = startDate; date < endDate; date = addDays(date, 1)) {
    bounds.push(startOfDay(zone, date))
    if (edition === 'half') bounds.push(noonOfDay(zone, date))
  }
  bounds.push(startOfDay(zone, endDate))
  return bounds
}

/** The whole book is one document: a single "volume" covering start to end. */
export function planBook(s: Pick<BookSettings, 'zone' | 'start' | 'end' | 'period' | 'edition'>): BookPlan {
  const startSec = startOfDay(s.zone, s.start)
  const endSec = startOfDay(s.zone, s.end)
  const firstCounter = Math.ceil(startSec / s.period)
  const count = Math.max(0, Math.ceil(endSec / s.period) - firstCounter)
  const pages = pageBounds(s.zone, s.start, s.end, s.edition).length - 1
  const volume: VolumePlan = { number: 1, startDate: s.start, endDate: s.end, startSec, endSec, firstCounter, count, pages }
  return { startSec, endSec, volumes: [volume], totalCodes: count, totalPages: pages }
}

// ── Fitting a page ──────────────────────────────────────────────────────────

/** Space for the code block on an A4 sheet, in points. */
export const FIT = { width: 544, height: 712, noteHeight: 37, gap: 6, advance: 0.6, maxFont: 7.5, minFont: 2.5 } as const

/**
 * The line spacing may be this fraction of the type size at the least (the digits are only 0.73 of
 * the type size tall), so more fits on the page and the type can be bigger.
 */
export const LINE_RATIO = 0.85

/** Extra margin on the binding side when leaving room for a hole punch, in millimetres. */
export const PUNCH_MM = 11
const PUNCH_PT = (PUNCH_MM / 25.4) * 72

/**
 * Which side a sheet's binding margin is on: front sides (odd sheet numbers, the title page is 1)
 * are right-hand pages, punched on the left; backs are left-hand pages, punched on the right.
 */
export function punchSide(sheet: number): 'left' | 'right' {
  return sheet % 2 === 1 ? 'left' : 'right'
}

/** One CSS pixel is 0.75pt. */
const PT_PER_PX = 0.75

export interface PageFit {
  fontPt: number
  /**
   * Line spacing in whole CSS pixels. A fractional spacing lands rows on different device pixels on
   * screen, so some lines sit closer together than others; a whole number keeps every row equal.
   */
  lineHeightPx: number
  cols: number
  rows: number
  /** Space between columns, in pixels. Columns are as wide as their text, so a rule in the gap is centred between them. */
  gapPx: number
  /** Width of the block of columns, in pixels, chosen so that each column starts a whole number of pixels after the last. */
  widthPx: number
}

/**
 * Largest type size at which `lines` lines up to `maxChars` wide fit the sheet in columns, with
 * the line spacing a whole number of pixels.
 */
export function fitPage(lines: number, maxChars: number, notes: number, punch = false): PageFit {
  const heightPt = FIT.height - notes * FIT.noteHeight
  const widthPx = (FIT.width - (punch ? PUNCH_PT : 0)) / PT_PER_PX
  const gapMinPx = FIT.gap / PT_PER_PX
  const lineHeightPx = (font: number) => Math.max(1, Math.ceil((font * LINE_RATIO) / PT_PER_PX - 1e-9))

  const place = (font: number) => {
    const columnPx = (maxChars * FIT.advance * font) / PT_PER_PX
    const cols = Math.floor((widthPx + gapMinPx) / (columnPx + gapMinPx))
    if (cols < 1) return undefined
    // Whole-pixel distance from one column to the next.
    const pitch = Math.floor((widthPx + gapMinPx) / cols)
    const gapPx = pitch - columnPx
    return { cols, rows: Math.ceil(lines / cols), gapPx, widthPx: cols * pitch - gapPx }
  }
  for (let hundredths = FIT.maxFont * 100; hundredths >= FIT.minFont * 100; hundredths--) {
    const font = hundredths / 100
    const spot = place(font)
    if (spot && spot.rows * lineHeightPx(font) * PT_PER_PX <= heightPt) {
      return { fontPt: font, lineHeightPx: lineHeightPx(font), ...spot }
    }
  }
  const font = FIT.minFont
  const spot = place(font) ?? { cols: 1, rows: lines, gapPx: gapMinPx, widthPx }
  return { fontPt: font, lineHeightPx: lineHeightPx(font), ...spot }
}

// ── Laying a volume out as pages ────────────────────────────────────────────

export interface PageModel {
  /** Physical sheet number within the volume (the title page is 1). */
  sheet: number
  /** Heading, e.g. "Tuesday 20 November 2026". */
  day: string
  /** "AM", "PM", or empty for a whole day. */
  part: string
  /** Wall-clock date (YYYY-MM-DD) the page starts on, for the index. */
  dateKey: string
  /** One line per code, "14:37:30  482 913". */
  text: string
  /** The same lines as blocks: each hour's first code (HH:00:00) is its own bold, outlined block. Join with newlines to get `text`. */
  segments: { text: string; bold: boolean }[]
  lines: number
  fit: PageFit
  /** Explains a repeated or missing hour. */
  notes: string[]
  /** Lines in the repeated hour carry zone names. */
  marked: boolean
}

export interface VolumeLayout {
  pages: PageModel[]
  transitions: Transition[]
  /** Each day and the sheets it covers, for the index. */
  index: { dateKey: string; label: string; first: number; last: number }[]
}

function hhmm(wall: number) {
  return clockFromWall(wall, false)
}

/** Builds every page of one volume from its compact codes. */
export function layoutVolume(
  settings: Pick<BookSettings, 'zone' | 'period' | 'digits' | 'edition'> & { punch?: boolean },
  volume: VolumePlan,
  codes: Uint32Array
): VolumeLayout {
  const { zone, period, digits, edition, punch = false } = settings
  const bounds = pageBounds(zone, volume.startDate, volume.endDate, edition)
  const transitions = findTransitions(zone, volume.startSec - 3600, volume.endSec + 3600)
  const offsetAt = (t: number) => {
    let offset = transitions.length ? transitions[0]!.before : offsetSeconds(zone, t)
    for (const tr of transitions) if (t >= tr.at) offset = tr.after
    return offset
  }
  // Times that are printed twice: an hour either side of a clock change that goes back.
  const repeats = transitions
    .filter((tr) => tr.after < tr.before)
    .map((tr) => ({ from: tr.at - (tr.before - tr.after), to: tr.at + (tr.before - tr.after) }))

  const pages: PageModel[] = []
  const index: VolumeLayout['index'] = []

  for (let p = 0; p < bounds.length - 1; p++) {
    const pStart = bounds[p]!
    const pEnd = bounds[p + 1]!
    const first = Math.ceil(pStart / period) - volume.firstCounter
    const last = Math.ceil(pEnd / period) - volume.firstCounter
    const marked = repeats.some((r) => pStart < r.to && pEnd > r.from)

    const lines: string[] = []
    const segments: PageModel['segments'] = []
    let run: string[] = []
    let maxChars = 0
    for (let i = first; i < last; i++) {
      const t = (volume.firstCounter + i) * period
      const wall = t + offsetAt(t)
      const clock = clockFromWall(wall)
      const grouped = groupCode(padCode(codes[i]!, digits))
      const line = marked && repeats.some((r) => t >= r.from && t < r.to) ? `${clock} ${zoneAbbreviation(zone, t)}  ${grouped}` : `${clock}  ${grouped}`
      if (line.length > maxChars) maxChars = line.length
      if (((wall % 3600) + 3600) % 3600 === 0) {
        if (run.length) segments.push({ text: run.join('\n'), bold: false })
        run = []
        segments.push({ text: line, bold: true })
      } else run.push(line)
      lines.push(line)
    }

    if (run.length) segments.push({ text: run.join('\n'), bold: false })
    const startWall = pStart + offsetAt(pStart)
    const notes: string[] = []
    for (const tr of transitions) {
      if (tr.at < pStart || tr.at > pEnd) continue
      const wallBefore = tr.at + tr.before
      const wallAfter = tr.at + tr.after
      const abbrBefore = zoneAbbreviation(zone, tr.at - 1)
      const abbrAfter = zoneAbbreviation(zone, tr.at)
      if (tr.after < tr.before) {
        notes.push(
          `Clocks go back at ${hhmm(wallBefore)} ${abbrBefore}, to ${hhmm(wallAfter)} ${abbrAfter}. ` +
            `The hour from ${hhmm(wallAfter)} to ${hhmm(wallBefore)} happens twice, so it is printed twice, marked ${abbrBefore} and ${abbrAfter}.`
        )
      } else {
        notes.push(
          `Clocks go forward at ${hhmm(wallBefore)} ${abbrBefore}, to ${hhmm(wallAfter)} ${abbrAfter}. ` +
            `The hour from ${hhmm(wallBefore)} to ${hhmm(wallAfter)} does not exist, so it is missing here. The codes carry on without a gap.`
        )
      }
    }

    const dateKey = dateKeyFromWall(startWall)
    const part = edition === 'day' ? '' : p % 2 === 0 ? 'AM' : 'PM'
    const sheet = p + 2
    const entry = index[index.length - 1]
    if (entry && entry.dateKey === dateKey) entry.last = sheet
    else index.push({ dateKey, label: longDayFromWall(startWall), first: sheet, last: sheet })

    pages.push({
      sheet,
      day: longDayFromWall(startWall),
      part,
      dateKey,
      text: lines.join('\n'),
      segments,
      lines: lines.length,
      fit: fitPage(lines.length, maxChars, notes.length, punch),
      notes,
      marked
    })
  }
  return { pages, transitions, index }
}
