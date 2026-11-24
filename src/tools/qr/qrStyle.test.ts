import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { makeQr, qrPdf } from './qr'
import { checkStyle, contrastRatio, DEFAULT_STYLE, normaliseHex, qrPath, qrSvg, type QrStyle } from './qrStyle'

const matrix = makeQr('https://thekestongroup.github.io/utilities/', 'M')
const style = (change: Partial<QrStyle> = {}): QrStyle => ({ ...DEFAULT_STYLE, ...change })

describe('colours', () => {
  it('tidies hex colours and rejects anything else', () => {
    expect(normaliseHex('#ABC')).toBe('#aabbcc')
    expect(normaliseHex('023750')).toBe('#023750')
    expect(normaliseHex(' #FFFFFF ')).toBe('#ffffff')
    expect(normaliseHex('red')).toBeUndefined()
    expect(normaliseHex('#12345')).toBeUndefined()
    expect(normaliseHex('"><script>')).toBeUndefined()
  })
  it('measures contrast on the WCAG scale', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })
  it('warns about colours a scanner will struggle with', () => {
    expect(checkStyle(style()).level).toBe('ok')
    expect(checkStyle(style({ fg: '#023750' })).level).toBe('ok')
    expect(checkStyle(style({ fg: '#bbbbbb' })).level).toBe('bad')
    expect(checkStyle(style({ fg: '#ffffff', bg: '#000000' })).level).toBe('warning') // inverted
    expect(checkStyle(style({ bg: 'none' })).level).toBe('warning')
    expect(checkStyle(style({ quiet: 1 })).level).toBe('warning')
  })
})

describe('qrSvg', () => {
  it('uses the chosen colours and border', () => {
    const svg = qrSvg(matrix, style({ fg: '#023750', bg: '#fff8e1', quiet: 2 }))
    expect(svg).toContain('fill="#023750"')
    expect(svg).toContain('fill="#fff8e1"')
    expect(svg).toContain(`viewBox="0 0 ${matrix.size + 4} ${matrix.size + 4}"`)
  })
  it('has no background rectangle when transparent', () => {
    expect(qrSvg(matrix, style({ bg: 'none' }))).not.toContain('<rect')
  })
  it('can only ever contain checked colours, whatever it is given', () => {
    const svg = qrSvg(matrix, style({ fg: '"><script>alert(1)</script>', bg: 'javascript:x' }))
    expect(svg).not.toMatch(/script|javascript/i)
  })
})

describe('shapes', () => {
  it('draws squares with straight lines only, and dots and rounded modules with arcs', () => {
    expect(qrPath(matrix, style())).not.toContain('a')
    expect(qrPath(matrix, style({ shape: 'dots' }))).toContain('a')
    expect(qrPath(matrix, style({ shape: 'rounded' }))).toContain('a')
  })
  it('draws the eyes as arcs for rounded and circle styles', () => {
    expect(qrPath(matrix, style({ eye: 'rounded' }))).toContain('a')
    expect(qrPath(matrix, style({ eye: 'circle' }))).toContain('a')
  })
  it('keeps data modules out of the eyes, so they are never doubled up', () => {
    // 3 eyes x (ring + hole + core) = 9 closed shapes before any data module is drawn
    const eyesOnly = qrPath({ size: matrix.size, isDark: () => false }, style({ shape: 'dots' }))
    expect(eyesOnly.split('z').length - 1).toBe(9)
    const dots = qrPath(matrix, style({ shape: 'dots' })).split('z').length - 1
    let dataModules = 0
    for (let r = 0; r < matrix.size; r++) {
      for (let c = 0; c < matrix.size; c++) {
        const eye = (r < 7 && c < 7) || (r < 7 && c >= matrix.size - 7) || (r >= matrix.size - 7 && c < 7)
        if (!eye && matrix.isDark(r, c)) dataModules++
      }
    }
    expect(dots).toBe(9 + dataModules)
  })
  it('every style makes a different picture from the same code', () => {
    const paths = new Set<string>()
    for (const shape of ['square', 'rounded', 'dots'] as const) for (const eye of ['square', 'rounded', 'circle'] as const) paths.add(qrPath(matrix, style({ shape, eye })))
    expect(paths.size).toBe(9)
  })
})

describe('qrPdf with a style', () => {
  it('makes a page for any style', async () => {
    for (const s of [style(), style({ shape: 'dots', eye: 'circle', fg: '#023750', bg: '#fff8e1' }), style({ bg: 'none', shape: 'rounded', eye: 'rounded' })]) {
      const doc = await PDFDocument.load(await qrPdf(matrix, { sizeMm: 50, style: s }))
      expect(doc.getPageCount()).toBe(1)
    }
  })
})

describe('merged modules', () => {
  const grid = (cells: string[]) => ({ size: 21, isDark: (r: number, c: number) => cells.includes(`${r},${c}`) })
  const merged = (cells: string[]) => qrPath(grid(cells), style({ shape: 'rounded', merge: true, eye: 'square' }))
  /** Arcs of the data modules only: the three square eyes draw none. */
  const arcs = (d: string) => (d.match(/a/g) ?? []).length

  it('rounds all four corners of a lone module', () => {
    expect(arcs(merged(['10,10']))).toBe(4)
  })
  it('rounds only the outside corners of two neighbours: a pair has 4 corners, not 8', () => {
    expect(arcs(merged(['10,10', '10,11']))).toBe(4)
  })
  it('rounds the 4 outside corners of a 2x2 block and none of the joins', () => {
    expect(arcs(merged(['10,10', '10,11', '11,10', '11,11']))).toBe(4)
  })
  it('leaves the shared edge square, so a joined pair is not wider than 2 modules plus the overlaps', () => {
    const q = DEFAULT_STYLE.quiet
    const d = merged(['10,10', '10,11'])
    expect(d).toContain(`M${q + 10 + 0.4} ${q + 10}`) // the left module starts after its rounded top-left corner
  })
  it('differs from unmerged rounded modules, which round every corner', () => {
    const cells = ['10,10', '10,11']
    expect(arcs(qrPath(grid(cells), style({ shape: 'rounded', merge: false, eye: 'square' })))).toBe(8)
  })
  it('does nothing for squares or dots', () => {
    for (const shape of ['square', 'dots'] as const) {
      expect(qrPath(matrix, style({ shape, merge: true }))).toBe(qrPath(matrix, style({ shape, merge: false })))
    }
  })
})
