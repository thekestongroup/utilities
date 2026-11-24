import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'

/**
 * Finds the personal details hidden in photos and PDFs, and removes them. Everything happens in the
 * browser. Images are cleaned by drawing them again (which keeps only the pixels); PDFs by emptying
 * their document information and XMP packet.
 */
export type FileKind = 'jpeg' | 'png' | 'webp' | 'pdf' | 'other'

export function detectKind(name: string, type: string): FileKind {
  const lower = name.toLowerCase()
  if (type === 'image/jpeg' || /\.jpe?g$/.test(lower)) return 'jpeg'
  if (type === 'image/png' || lower.endsWith('.png')) return 'png'
  if (type === 'image/webp' || lower.endsWith('.webp')) return 'webp'
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf'
  return 'other'
}

export type Risk = 'location' | 'device' | 'person' | 'time' | 'other'

export interface Finding {
  label: string
  value: string
  risk: Risk
}

// ── EXIF (a TIFF structure inside JPEG, PNG and WebP) ───────────────────────
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

interface Entry {
  type: number
  count: number
  /** Absolute offset of the value's bytes. */
  at: number
}

function readIfd(view: DataView, base: number, offset: number, little: boolean): Map<number, Entry> {
  const entries = new Map<number, Entry>()
  if (offset < 0 || offset + 2 > view.byteLength) return entries
  const count = view.getUint16(offset, little)
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12
    if (at + 12 > view.byteLength) break
    const tag = view.getUint16(at, little)
    const type = view.getUint16(at + 2, little)
    const n = view.getUint32(at + 4, little)
    const size = (TYPE_SIZE[type] ?? 1) * n
    const valueAt = size <= 4 ? at + 8 : base + view.getUint32(at + 8, little)
    if (valueAt + size <= view.byteLength) entries.set(tag, { type, count: n, at: valueAt })
  }
  return entries
}

function ascii(view: DataView, entry: Entry | undefined): string | undefined {
  if (!entry || entry.type !== 2) return undefined
  let text = ''
  for (let i = 0; i < entry.count; i++) {
    const c = view.getUint8(entry.at + i)
    if (c === 0) break
    text += String.fromCharCode(c)
  }
  return text.trim() || undefined
}

function rationals(view: DataView, entry: Entry | undefined, little: boolean): number[] | undefined {
  if (!entry || entry.type !== 5) return undefined
  const out: number[] = []
  for (let i = 0; i < entry.count; i++) {
    const denominator = view.getUint32(entry.at + i * 8 + 4, little)
    out.push(denominator ? view.getUint32(entry.at + i * 8, little) / denominator : 0)
  }
  return out
}

const degrees = (parts: number[] | undefined) => (parts && parts.length >= 3 ? parts[0]! + parts[1]! / 60 + parts[2]! / 3600 : undefined)

/** Reads the interesting fields from a TIFF block (the part of an EXIF segment after "Exif\0\0"). */
export function parseTiff(bytes: Uint8Array): Finding[] {
  const found: Finding[] = []
  if (bytes.length < 12) return found
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const order = view.getUint16(0)
  if (order !== 0x4949 && order !== 0x4d4d) return found
  const little = order === 0x4949
  if (view.getUint16(2, little) !== 42) return found
  const base = 0
  const ifd0 = readIfd(view, base, view.getUint32(4, little), little)

  const add = (label: string, value: string | undefined, risk: Risk) => value && found.push({ label, value, risk })
  add('Camera maker', ascii(view, ifd0.get(0x010f)), 'device')
  add('Camera model', ascii(view, ifd0.get(0x0110)), 'device')
  add('Software', ascii(view, ifd0.get(0x0131)), 'device')
  add('Date', ascii(view, ifd0.get(0x0132)), 'time')
  add('Artist', ascii(view, ifd0.get(0x013b)), 'person')
  add('Copyright', ascii(view, ifd0.get(0x8298)), 'person')

  const exifPointer = ifd0.get(0x8769)
  if (exifPointer && exifPointer.type === 4) {
    const exif = readIfd(view, base, base + view.getUint32(exifPointer.at, little), little)
    add('Date taken', ascii(view, exif.get(0x9003)), 'time')
    add('Camera serial number', ascii(view, exif.get(0xa431)), 'device')
    add('Lens', ascii(view, exif.get(0xa434)), 'device')
    add('Owner name', ascii(view, exif.get(0xa430)), 'person')
  }

  const gpsPointer = ifd0.get(0x8825)
  if (gpsPointer && gpsPointer.type === 4) {
    const gps = readIfd(view, base, base + view.getUint32(gpsPointer.at, little), little)
    const lat = degrees(rationals(view, gps.get(2), little))
    const lon = degrees(rationals(view, gps.get(4), little))
    if (lat !== undefined && lon !== undefined) {
      const latitude = (ascii(view, gps.get(1)) === 'S' ? -1 : 1) * lat
      const longitude = (ascii(view, gps.get(3)) === 'W' ? -1 : 1) * lon
      found.push({ label: 'GPS location', value: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, risk: 'location' })
    }
  }
  return found
}

// ── JPEG ────────────────────────────────────────────────────────────────────
const text = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))

export function inspectJpeg(bytes: Uint8Array): Finding[] {
  const found: Finding[] = []
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return found
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1]!
    if (marker === 0xda || marker === 0xd9) break // image data starts
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!
    const start = i + 4
    const end = Math.min(bytes.length, i + 2 + length)
    if (marker === 0xe1) {
      if (text(bytes, start, start + 6) === 'Exif\0\0') found.push(...parseTiff(bytes.subarray(start + 6, end)))
      else if (text(bytes, start, start + 28).startsWith('http://ns.adobe.com/xap/1.0/')) found.push({ label: 'XMP block', value: 'Editing history and other details', risk: 'other' })
    } else if (marker === 0xed) found.push({ label: 'Photoshop / IPTC block', value: 'Captions, credits and keywords', risk: 'person' })
    else if (marker === 0xfe) found.push({ label: 'Comment', value: text(bytes, start, Math.min(end, start + 80)), risk: 'other' })
    i = i + 2 + length
  }
  return found
}

// ── PNG ─────────────────────────────────────────────────────────────────────
export function inspectPng(bytes: Uint8Array): Finding[] {
  const found: Finding[] = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let i = 8
  while (i + 12 <= bytes.length) {
    const length = view.getUint32(i)
    const type = text(bytes, i + 4, i + 8)
    const start = i + 8
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const zero = bytes.indexOf(0, start)
      const keyword = zero > start ? text(bytes, start, Math.min(zero, start + 40)) : 'Text'
      found.push({ label: `Text note (${keyword})`, value: type === 'tEXt' ? text(bytes, zero + 1, Math.min(start + length, zero + 81)) : 'Compressed text', risk: 'other' })
    } else if (type === 'eXIf') found.push(...parseTiff(bytes.subarray(start, start + length)))
    else if (type === 'tIME') found.push({ label: 'Last changed', value: `${view.getUint16(start)}-${view.getUint8(start + 2)}-${view.getUint8(start + 3)}`, risk: 'time' })
    if (type === 'IEND') break
    i = start + length + 4
  }
  return found
}

// ── WebP ────────────────────────────────────────────────────────────────────
export function inspectWebp(bytes: Uint8Array): Finding[] {
  const found: Finding[] = []
  if (text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 12) !== 'WEBP') return found
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let i = 12
  while (i + 8 <= bytes.length) {
    const type = text(bytes, i, i + 4)
    const length = view.getUint32(i + 4, true)
    const start = i + 8
    if (type === 'EXIF') {
      const offset = text(bytes, start, start + 6) === 'Exif\0\0' ? 6 : 0
      found.push(...parseTiff(bytes.subarray(start + offset, start + length)))
    } else if (type === 'XMP ') found.push({ label: 'XMP block', value: 'Editing history and other details', risk: 'other' })
    i = start + length + (length % 2)
  }
  return found
}

// ── PDF ─────────────────────────────────────────────────────────────────────
export async function inspectPdf(bytes: Uint8Array): Promise<Finding[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const found: Finding[] = []
  const add = (label: string, value: string | undefined | Date, risk: Risk) => {
    const shown = value instanceof Date ? value.toISOString().slice(0, 19).replace('T', ' ') : value
    if (shown) found.push({ label, value: shown, risk })
  }
  add('Title', doc.getTitle(), 'other')
  add('Author', doc.getAuthor(), 'person')
  add('Subject', doc.getSubject(), 'other')
  add('Keywords', doc.getKeywords(), 'other')
  add('Made with', doc.getCreator(), 'device')
  add('Converted by', doc.getProducer(), 'device')
  add('Created', doc.getCreationDate(), 'time')
  add('Last changed', doc.getModificationDate(), 'time')
  if (doc.catalog.has(PDFName.of('Metadata'))) found.push({ label: 'XMP block', value: 'Extra details such as editing history and document IDs', risk: 'other' })
  return found
}

/** A copy of the PDF with its document information and XMP packet removed. */
export async function stripPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const info = doc.context.lookup(doc.context.trailerInfo.Info)
  if (info instanceof PDFDict) for (const key of info.keys()) info.delete(key)
  doc.catalog.delete(PDFName.of('Metadata'))
  return doc.save()
}

export async function inspect(kind: FileKind, bytes: Uint8Array): Promise<Finding[]> {
  if (kind === 'jpeg') return inspectJpeg(bytes)
  if (kind === 'png') return inspectPng(bytes)
  if (kind === 'webp') return inspectWebp(bytes)
  if (kind === 'pdf') return inspectPdf(bytes)
  return []
}

export const RISK_LABEL: Record<Risk, string> = {
  location: 'Where you were',
  device: 'Your device or software',
  person: 'Who you are',
  time: 'When',
  other: 'Other'
}
