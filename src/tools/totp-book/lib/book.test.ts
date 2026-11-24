import { describe, expect, it } from 'vitest'
import { fitPage, layoutVolume, pageBounds, planBook, punchSide } from './book'
import { addMonths, findTransitions, offsetSeconds, startOfDay, zoneAbbreviation } from './tz'

describe('calendar months', () => {
  it('1 month from 14 March ends on 14 April', () => {
    expect(addMonths('2027-03-14', 1)).toBe('2027-04-14')
  })
  it('clamps to the last day of a shorter month', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
  })
  it('crosses a year', () => {
    expect(addMonths('2027-11-15', 3)).toBe('2028-02-15')
  })
})

describe('time zones', () => {
  it('knows London is on BST in summer and GMT in winter', () => {
    expect(offsetSeconds('Europe/London', Date.UTC(2027, 6, 1) / 1000)).toBe(3600)
    expect(offsetSeconds('Europe/London', Date.UTC(2027, 0, 1) / 1000)).toBe(0)
  })
  it('finds local midnight', () => {
    expect(startOfDay('Europe/London', '2027-03-14')).toBe(Date.UTC(2027, 2, 14) / 1000)
    expect(startOfDay('Europe/London', '2027-07-01')).toBe(Date.UTC(2027, 5, 30, 23) / 1000)
    expect(startOfDay('America/New_York', '2027-01-01')).toBe(Date.UTC(2027, 0, 1, 5) / 1000)
  })
  it('finds both clock changes of 2027 in London', () => {
    const changes = findTransitions('Europe/London', Date.UTC(2027, 0, 1) / 1000, Date.UTC(2028, 0, 1) / 1000)
    expect(changes.map((c) => new Date(c.at * 1000).toISOString())).toEqual(['2027-03-28T01:00:00.000Z', '2027-10-31T01:00:00.000Z'])
    expect(zoneAbbreviation('Europe/London', changes[1]!.at - 1)).toBe('BST')
    expect(zoneAbbreviation('Europe/London', changes[1]!.at)).toBe('GMT')
  })
})

describe('planBook', () => {
  const base = { zone: 'Europe/London', period: 30, edition: 'half' as const }
  it('a month with no clock change is 89,280 codes on 62 half-day pages', () => {
    const plan = planBook({ ...base, start: '2027-05-14', end: '2027-06-14' })
    expect(plan.totalCodes).toBe(89280)
    expect(plan.totalPages).toBe(62)
  })
  it('14 Mar to 14 Apr loses the missing hour (120 codes) but keeps 62 pages', () => {
    const plan = planBook({ ...base, start: '2027-03-14', end: '2027-04-14' })
    expect(plan.volumes).toHaveLength(1)
    expect(plan.totalCodes).toBe(89280 - 120)
    expect(plan.totalPages).toBe(62)
  })
  it('a full-day edition has one page per day', () => {
    expect(planBook({ ...base, edition: 'day', start: '2027-05-14', end: '2027-06-14' }).totalPages).toBe(31)
  })
  it('any length is one document: six months in a single book', () => {
    const plan = planBook({ ...base, zone: 'UTC', start: '2027-03-01', end: '2027-09-01' })
    expect(plan.volumes).toHaveLength(1)
    expect(plan.totalCodes).toBe(184 * 2880)
    expect(plan.totalPages).toBe(184 * 2)
  })
  it('a month is from the 1st to the 1st', () => {
    const plan = planBook({ ...base, start: '2027-02-01', end: '2027-03-01' })
    expect(plan.totalCodes).toBe(28 * 2880)
  })
  it('pages break at local midnight and noon', () => {
    const bounds = pageBounds('Europe/London', '2027-10-31', '2027-11-01', 'half')
    expect(bounds.map((t) => new Date(t * 1000).toISOString())).toEqual([
      '2027-10-30T23:00:00.000Z', // 00:00 BST
      '2027-10-31T12:00:00.000Z', // 12:00 GMT
      '2027-11-01T00:00:00.000Z'
    ])
  })
})

function volumeLayout(start: string, end: string, edition: 'half' | 'day' = 'half') {
  const settings = { zone: 'Europe/London', start, end, period: 30, digits: 6 as const, edition }
  const plan = planBook(settings)
  const volume = plan.volumes[0]!
  const codes = new Uint32Array(volume.count).map((_, i) => i)
  return layoutVolume(settings, volume, codes)
}

describe('daylight saving in the book', () => {
  it('prints the repeated hour twice, marked BST and GMT', () => {
    const { pages } = volumeLayout('2027-10-30', '2027-11-02')
    const sunday = pages.filter((p) => p.day.startsWith('Sunday 31 October'))
    expect(sunday.map((p) => p.part)).toEqual(['AM', 'PM'])
    const am = sunday[0]!
    expect(am.lines).toBe(13 * 120) // 13 hours: 00:00 BST to 12:00 GMT
    expect(am.marked).toBe(true)
    const lines = am.text.split('\n')
    expect(lines.filter((l) => l.startsWith('01:00:00')).sort()).toEqual([expect.stringMatching(/^01:00:00 BST /), expect.stringMatching(/^01:00:00 GMT /)])
    expect(lines.filter((l) => /BST|GMT/.test(l))).toHaveLength(240) // both passes of the hour
    expect(am.notes[0]).toMatch(/happens twice/)
    expect(sunday[1]!.marked).toBe(false)
    expect(sunday[1]!.lines).toBe(12 * 120)
  })

  it('leaves the missing hour out when the clocks go forward', () => {
    const { pages } = volumeLayout('2027-03-27', '2027-03-30')
    const am = pages.find((p) => p.day.startsWith('Sunday 28 March') && p.part === 'AM')!
    expect(am.lines).toBe(11 * 120)
    expect(am.text).not.toMatch(/^01:/m)
    expect(am.text).toMatch(/^00:59:30 /m)
    expect(am.text).toMatch(/^02:00:00 /m)
    expect(am.notes[0]).toMatch(/does not exist/)
  })

  it('numbers sheets from 2 (the title page is 1) and indexes each day by its pages', () => {
    const { pages, index } = volumeLayout('2027-05-14', '2027-05-17')
    expect(pages[0]!.sheet).toBe(2)
    expect(pages.map((p) => p.part)).toEqual(['AM', 'PM', 'AM', 'PM', 'AM', 'PM'])
    expect(index.map((i) => [i.first, i.last])).toEqual([[2, 3], [4, 5], [6, 7]])
  })

  it('a whole day on one page has no AM/PM part', () => {
    const { pages } = volumeLayout('2027-05-14', '2027-05-16', 'day')
    expect(pages).toHaveLength(2)
    expect(pages[0]!.part).toBe('')
    expect(pages[0]!.lines).toBe(2880)
  })
})

describe('hour starts', () => {
  it('marks HH:00:00 lines for bold and the segments rebuild the page text', () => {
    const { pages } = volumeLayout('2027-05-14', '2027-05-15')
    const am = pages[0]!
    expect(am.text.split('\n')[0]).toBe('00:00:00  000 000')
    expect(am.segments.filter((s) => s.bold).map((s) => s.text.slice(0, 8))).toEqual(
      Array.from({ length: 12 }, (_, h) => `${String(h).padStart(2, '0')}:00:00`)
    )
    expect(am.segments.map((s) => s.text).join('\n')).toBe(am.text)
    const pm = pages[1]!
    expect(pm.text.split('\n').at(-1)).toMatch(/^23:59:30 /)
  })
})

describe('hole punch', () => {
  it('front sides are punched on the left, backs on the right', () => {
    expect([1, 2, 3, 4].map(punchSide)).toEqual(['left', 'right', 'left', 'right'])
  })
  it('a wider margin means narrower columns or smaller type, never overflow', () => {
    const plain = fitPage(1440, 17, 0)
    const punched = fitPage(1440, 17, 0, true)
    expect(punched.fontPt).toBeLessThanOrEqual(plain.fontPt)
    expect(punched.cols * punched.rows).toBeGreaterThanOrEqual(1440)
  })
})

describe('fitPage', () => {
  it('lays columns a whole number of pixels apart, with a whole-pixel line height', () => {
    for (const [lines, chars] of [[1440, 17], [2880, 17], [1560, 21]] as const) {
      const fit = fitPage(lines, chars, 0)
      const columnPx = (chars * 0.6 * fit.fontPt) / 0.75
      expect(columnPx + fit.gapPx).toBeCloseTo(Math.round(columnPx + fit.gapPx), 6)
      expect(fit.lineHeightPx).toBe(Math.round(fit.lineHeightPx))
      expect(fit.cols * fit.rows).toBeGreaterThanOrEqual(lines)
    }
  })
  it('uses the largest type that fits: half days around 4.8pt, whole days around 3.5pt', () => {
    const half = fitPage(1440, 17, 0)
    const day = fitPage(2880, 17, 0)
    expect(half.fontPt).toBeGreaterThanOrEqual(4.75)
    expect(day.fontPt).toBeGreaterThanOrEqual(3.5)
    for (const fit of [half, day]) {
      expect(fit.rows * fit.lineHeightPx * 0.75).toBeLessThanOrEqual(712)
      expect(fit.rows * fit.lineHeightPx * 0.75).toBeGreaterThan(600)
    }
  })
  it('gives pages with a note a little less room', () => {
    expect(fitPage(1560, 21, 1).fontPt).toBeLessThanOrEqual(fitPage(1560, 21, 0).fontPt)
  })
})

describe('hole punch', () => {
  it('front sides are punched on the left, backs on the right', () => {
    expect([1, 2, 3, 4].map(punchSide)).toEqual(['left', 'right', 'left', 'right'])
  })
  it('a wider margin means narrower columns or smaller type, never overflow', () => {
    const plain = fitPage(1440, 17, 0)
    const punched = fitPage(1440, 17, 0, true)
    expect(punched.fontPt).toBeLessThanOrEqual(plain.fontPt)
    expect(punched.cols * punched.rows).toBeGreaterThanOrEqual(1440)
  })
})
