import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { detectKind, inspectJpeg, inspectPdf, inspectPng, inspectWebp, parseTiff, stripPdf } from './metadata'

/** A little-endian TIFF block with a camera maker and a GPS position (51°30'0"N, 0°7'30"W). */
function tiffWithGps(): Uint8Array {
  const bytes = new Uint8Array(200)
  const view = new DataView(bytes.buffer)
  const put = (at: number, text: string) => [...text].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)))
  put(0, 'II')
  view.setUint16(2, 42, true)
  view.setUint32(4, 8, true)
  // IFD0 at 8: Make (ascii, 6 bytes at 80), GPS pointer (long -> 100)
  view.setUint16(8, 2, true)
  view.setUint16(10, 0x010f, true)
  view.setUint16(12, 2, true)
  view.setUint32(14, 6, true)
  view.setUint32(18, 80, true)
  view.setUint16(22, 0x8825, true)
  view.setUint16(24, 4, true)
  view.setUint32(26, 1, true)
  view.setUint32(30, 100, true)
  view.setUint32(34, 0, true)
  put(80, 'Canon\0')
  // GPS IFD at 100: 4 entries
  view.setUint16(100, 4, true)
  const entry = (n: number, tag: number, type: number, count: number, value: number) => {
    const at = 102 + n * 12
    view.setUint16(at, tag, true)
    view.setUint16(at + 2, type, true)
    view.setUint32(at + 4, count, true)
    view.setUint32(at + 8, value, true)
  }
  entry(0, 1, 2, 2, 0x4e) // 'N\0'
  entry(1, 2, 5, 3, 150) // rationals at 150
  entry(2, 3, 2, 2, 0x57) // 'W\0'
  entry(3, 4, 5, 3, 174) // rationals at 174
  const rational = (at: number, n: number, d: number) => {
    view.setUint32(at, n, true)
    view.setUint32(at + 4, d, true)
  }
  rational(150, 51, 1)
  rational(158, 30, 1)
  rational(166, 0, 1)
  rational(174, 0, 1)
  rational(182, 7, 1)
  rational(190, 30, 1)
  return bytes.subarray(0, 200)
}

function jpegWith(tiff: Uint8Array): Uint8Array {
  const header = new TextEncoder().encode('Exif\0\0')
  const length = 2 + header.length + tiff.length
  const out = new Uint8Array(2 + 2 + length + 2)
  out.set([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff])
  out.set(header, 6)
  out.set(tiff, 6 + header.length)
  out.set([0xff, 0xd9], out.length - 2)
  return out
}

describe('EXIF', () => {
  it('finds the camera maker and the GPS position', () => {
    const found = parseTiff(tiffWithGps())
    expect(found).toContainEqual({ label: 'Camera maker', value: 'Canon', risk: 'device' })
    const gps = found.find((f) => f.label === 'GPS location')
    expect(gps?.risk).toBe('location')
    expect(gps?.value).toBe('51.50000, -0.12500')
  })
  it('reads it out of a JPEG', () => {
    expect(inspectJpeg(jpegWith(tiffWithGps())).map((f) => f.label)).toEqual(['Camera maker', 'GPS location'])
  })
  it('finds nothing in a JPEG without any, and survives rubbish', () => {
    expect(inspectJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toEqual([])
    expect(inspectJpeg(new Uint8Array([1, 2, 3]))).toEqual([])
    expect(parseTiff(new Uint8Array(40))).toEqual([])
  })
})

describe('PNG and WebP', () => {
  it('lists PNG text notes', () => {
    const png = new Uint8Array(8 + 12 + 14 + 12)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const view = new DataView(png.buffer)
    view.setUint32(8, 14)
    png.set(new TextEncoder().encode('tEXt'), 12)
    png.set(new TextEncoder().encode('Author\0Ben Smith'.slice(0, 14)), 16)
    const iend = 8 + 12 + 14
    view.setUint32(iend, 0)
    png.set(new TextEncoder().encode('IEND'), iend + 4)
    const found = inspectPng(png)
    expect(found[0]?.label).toBe('Text note (Author)')
  })
  it('finds an EXIF chunk in a WebP', () => {
    const tiff = tiffWithGps()
    const out = new Uint8Array(12 + 8 + tiff.length)
    out.set(new TextEncoder().encode('RIFF'), 0)
    new DataView(out.buffer).setUint32(4, out.length - 8, true)
    out.set(new TextEncoder().encode('WEBP'), 8)
    out.set(new TextEncoder().encode('EXIF'), 12)
    new DataView(out.buffer).setUint32(16, tiff.length, true)
    out.set(tiff, 20)
    expect(inspectWebp(out).some((f) => f.label === 'GPS location')).toBe(true)
  })
})

describe('PDF', () => {
  async function pdfWithDetails() {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    doc.setTitle('Tax return')
    doc.setAuthor('Ben Smith')
    doc.setCreator('Microsoft Word')
    doc.setProducer('Quartz PDFContext')
    return doc.save()
  }
  it('lists the document information', async () => {
    const found = await inspectPdf(await pdfWithDetails())
    expect(found).toContainEqual({ label: 'Author', value: 'Ben Smith', risk: 'person' })
    expect(found.map((f) => f.label)).toEqual(expect.arrayContaining(['Title', 'Made with', 'Converted by']))
  })
  it('removes it, keeping the pages', async () => {
    const cleaned = await stripPdf(await pdfWithDetails())
    expect(await inspectPdf(cleaned)).toEqual([])
    const doc = await PDFDocument.load(cleaned, { updateMetadata: false })
    expect(doc.getPageCount()).toBe(1)
    expect(new TextDecoder('latin1').decode(cleaned)).not.toMatch(/Ben Smith|Tax return/)
  })
})

describe('detectKind', () => {
  it('goes by type, then by extension', () => {
    expect(detectKind('IMG_1.JPG', '')).toBe('jpeg')
    expect(detectKind('x', 'image/png')).toBe('png')
    expect(detectKind('a.webp', '')).toBe('webp')
    expect(detectKind('a.pdf', '')).toBe('pdf')
    expect(detectKind('a.txt', 'text/plain')).toBe('other')
  })
})
