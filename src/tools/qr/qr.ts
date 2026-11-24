import qrcode from 'qrcode-generator'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { DEFAULT_STYLE, hexToRgb, qrPath, type QrStyle } from './qrStyle'

export { qrSvg } from './qrStyle'

// The library writes text as Latin-1 unless told otherwise; QR readers expect UTF-8.
qrcode.stringToBytes = (text: string) => [...new TextEncoder().encode(text)]

export type ErrorCorrection = 'L' | 'M' | 'Q' | 'H'

export const ERROR_CORRECTION: { id: ErrorCorrection; name: string; note: string }[] = [
  { id: 'L', name: 'Low (7%)', note: 'Smallest code. For clean screens.' },
  { id: 'M', name: 'Medium (15%)', note: 'A good default.' },
  { id: 'Q', name: 'Quartile (25%)', note: 'For print that may get scuffed.' },
  { id: 'H', name: 'High (30%)', note: 'Most forgiving, biggest code.' }
]

export interface QrMatrix {
  /** Modules along each side, not counting the quiet zone. */
  size: number
  isDark: (row: number, col: number) => boolean
}

export class QrError extends Error {}

/** The module grid for some text. Throws QrError if the text is too long for a QR code. */
export function makeQr(text: string, errorCorrection: ErrorCorrection): QrMatrix {
  if (!text) throw new QrError('Enter something to put in the code.')
  try {
    const qr = qrcode(0, errorCorrection)
    qr.addData(text)
    qr.make()
    return { size: qr.getModuleCount(), isDark: (row, col) => qr.isDark(row, col) }
  } catch {
    throw new QrError('That is too much to fit in a QR code. Shorten it, or lower the error correction.')
  }
}

/** Runs of dark modules along each row, as [row, startColumn, length], to draw with fewer shapes. */
export function darkRuns(matrix: QrMatrix): [number, number, number][] {
  const runs: [number, number, number][] = []
  for (let row = 0; row < matrix.size; row++) {
    let start = -1
    for (let col = 0; col <= matrix.size; col++) {
      const dark = col < matrix.size && matrix.isDark(row, col)
      if (dark && start < 0) start = col
      if (!dark && start >= 0) {
        runs.push([row, start, col - start])
        start = -1
      }
    }
  }
  return runs
}

/** A4 page with the code at an exact size (millimetres), at the top left, in the chosen style, with an optional caption. */
export async function qrPdf(matrix: QrMatrix, options: { sizeMm: number; caption?: string; style?: QrStyle }): Promise<Uint8Array> {
  const style = options.style ?? DEFAULT_STYLE
  const mm = 72 / 25.4
  const doc = await PDFDocument.create()
  const page = doc.addPage([210 * mm, 297 * mm])
  const side = options.sizeMm * mm
  const module = side / (matrix.size + style.quiet * 2)
  const left = 20 * mm
  const top = 297 * mm - 20 * mm
  const [r, g, b] = hexToRgb(style.fg)
  if (style.bg !== 'none') {
    const [br, bg, bb] = hexToRgb(style.bg)
    page.drawRectangle({ x: left, y: top - side, width: side, height: side, color: rgb(br, bg, bb) })
  }
  // The path is in module units with y pointing down, as in the SVG, so it is drawn from the top left.
  page.drawSvgPath(qrPath(matrix, style), { x: left, y: top, scale: module, color: rgb(r, g, b), borderWidth: 0 })
  if (options.caption) {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText(options.caption.slice(0, 200).replace(/[^\x20-\x7e]/g, '?'), { x: left, y: top - side - 14, size: 11, font, color: rgb(0, 0, 0) })
  }
  return doc.save()
}

// ── What goes in the code ───────────────────────────────────────────────────
/** Escapes the characters that have a meaning in a Wi-Fi code. */
const escapeWifi = (value: string) => value.replace(/([\\;,:"])/g, '\\$1')

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass'

export function wifiPayload(options: { ssid: string; password: string; security: WifiSecurity; hidden: boolean }): string {
  const parts = [`T:${options.security}`, `S:${escapeWifi(options.ssid)}`]
  if (options.security !== 'nopass') parts.push(`P:${escapeWifi(options.password)}`)
  if (options.hidden) parts.push('H:true')
  return `WIFI:${parts.join(';')};;`
}
