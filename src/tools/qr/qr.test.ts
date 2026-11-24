import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { darkRuns, makeQr, QrError, qrPdf, qrSvg, wifiPayload } from './qr'

describe('makeQr', () => {
  it('makes version 1 (21x21) for a short message, and bigger ones for longer messages', () => {
    expect(makeQr('HELLO', 'L').size).toBe(21)
    expect(makeQr('https://thekestongroup.github.io/utilities/#/qr?type=text', 'M').size).toBeGreaterThan(21)
  })
  it('has the three finder squares in the corners', () => {
    const m = makeQr('HELLO', 'M')
    for (const [r, c] of [[0, 0], [0, m.size - 7], [m.size - 7, 0]] as const) {
      // the 7x7 finder: dark border, light ring, dark centre
      expect(m.isDark(r, c)).toBe(true)
      expect(m.isDark(r + 1, c + 1)).toBe(false)
      expect(m.isDark(r + 3, c + 3)).toBe(true)
    }
  })
  it('refuses empty and oversized input', () => {
    expect(() => makeQr('', 'M')).toThrow(QrError)
    expect(() => makeQr('x'.repeat(5000), 'H')).toThrow(QrError)
  })
  it('keeps non-ASCII text as UTF-8', () => {
    expect(makeQr('Café — ☕', 'M').size).toBeGreaterThanOrEqual(21)
  })
})

describe('qrSvg', () => {
  it('is a viewBox of the grid plus a quiet zone of 4 on each side', () => {
    const svg = qrSvg(makeQr('HELLO', 'L'))
    expect(svg).toContain('viewBox="0 0 29 29"')
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).not.toMatch(/https?:/i.exec(svg.replace('http://www.w3.org/2000/svg', ''))?.[0] ?? '@@@')
  })
  it('draws exactly the dark modules, in runs', () => {
    const m = makeQr('HELLO', 'L')
    let dark = 0
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.isDark(r, c)) dark++
    expect(darkRuns(m).reduce((sum, [, , length]) => sum + length, 0)).toBe(dark)
  })
})

describe('qrPdf', () => {
  it('makes one A4 page', async () => {
    const bytes = await qrPdf(makeQr('HELLO', 'M'), { sizeMm: 40, caption: 'Wi-Fi' })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595)
  })
})

describe('wifiPayload', () => {
  it('escapes the special characters in names and passwords', () => {
    expect(wifiPayload({ ssid: 'My;Net', password: 'a:b\\c"d,e', security: 'WPA', hidden: false })).toBe('WIFI:T:WPA;S:My\\;Net;P:a\\:b\\\\c\\"d\\,e;;')
  })
  it('leaves out the password for open networks, and marks hidden ones', () => {
    expect(wifiPayload({ ssid: 'Cafe', password: 'ignored', security: 'nopass', hidden: true })).toBe('WIFI:T:nopass;S:Cafe;H:true;;')
  })
})
