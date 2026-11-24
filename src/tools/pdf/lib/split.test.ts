import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { duplexPlan } from './flip'
import { inspectPdf, PdfError, splitForDuplex } from './split'

/** A PDF whose page i is (100 + i) points wide, so pages can be told apart. */
async function sample(pages: number, landscape = false): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 1; i <= pages; i++) doc.addPage(landscape ? [200 + i, 100] : [100 + i, 200])
  return doc.save()
}
async function widths(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => Math.round(p.getWidth()))
}
async function angles(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => p.getRotation().angle)
}
const normal = { rotateBacks: false, reverseBacks: false }

describe('splitForDuplex', () => {
  it('puts odd pages in the first PDF and even pages in the second', async () => {
    const result = await splitForDuplex(await sample(6), normal)
    expect(await widths(result.fronts)).toEqual([101, 103, 105])
    expect(await widths(result.backs)).toEqual([102, 104, 106])
    expect(result).toMatchObject({ pages: 6, sheets: 3, addedBlank: false })
  })

  it('adds a blank at the end of the backs when the page count is odd', async () => {
    const result = await splitForDuplex(await sample(5), normal)
    expect(await widths(result.fronts)).toEqual([101, 103, 105])
    // 102, 104, then a blank the size of the last page
    expect(await widths(result.backs)).toEqual([102, 104, 105])
    expect(result).toMatchObject({ sheets: 3, addedBlank: true })
  })

  it('can reverse the back pages, keeping the blank with the last sheet', async () => {
    const result = await splitForDuplex(await sample(5), { ...normal, reverseBacks: true })
    expect(await widths(result.backs)).toEqual([105, 104, 102])
  })

  it('turns the back pages 180 degrees when asked, and only the backs', async () => {
    const result = await splitForDuplex(await sample(4), { rotateBacks: true, reverseBacks: false })
    expect(await angles(result.fronts)).toEqual([0, 0])
    expect(await angles(result.backs)).toEqual([180, 180])
  })

  it('handles a single page', async () => {
    const result = await splitForDuplex(await sample(1), normal)
    expect(result).toMatchObject({ pages: 1, sheets: 1, addedBlank: true })
    expect(await widths(result.backs)).toHaveLength(1)
  })

  it('rejects files that are not PDFs, without echoing them', async () => {
    await expect(splitForDuplex(new TextEncoder().encode('SECRET not a pdf'), normal)).rejects.toThrow(PdfError)
    await splitForDuplex(new Uint8Array([1, 2, 3]), normal).catch((e) => expect(String(e.message)).not.toMatch(/SECRET/))
  })
})

describe('inspectPdf', () => {
  it('counts pages and spots landscape', async () => {
    expect(await inspectPdf(await sample(3))).toEqual({ pages: 3, landscape: false })
    expect(await inspectPdf(await sample(2, true))).toEqual({ pages: 2, landscape: true })
  })
})

describe('duplexPlan', () => {
  const exit = 'you' as const
  it('long edge, portrait (your printer): backs untouched, same edge first, far edge up', () => {
    expect(duplexPlan({ edge: 'long', landscape: false, exitTop: exit })).toEqual({ rotateBacks: false, feed: 'same-edge', farEdge: 'up' })
  })
  it('short edge, portrait (your printer): backs turned, opposite edge first, far edge down', () => {
    expect(duplexPlan({ edge: 'short', landscape: false, exitTop: exit })).toEqual({ rotateBacks: true, feed: 'opposite-edge', farEdge: 'down' })
  })
  it('landscape swaps which edge needs rotated backs', () => {
    expect(duplexPlan({ edge: 'long', landscape: true, exitTop: exit }).rotateBacks).toBe(true)
    expect(duplexPlan({ edge: 'short', landscape: true, exitTop: exit }).rotateBacks).toBe(false)
  })
  it('the far edge goes the other way when sheets land with the top towards the printer', () => {
    expect(duplexPlan({ edge: 'long', landscape: false, exitTop: 'printer' }).farEdge).toBe('down')
    expect(duplexPlan({ edge: 'short', landscape: false, exitTop: 'printer' }).farEdge).toBe('up')
  })
})
