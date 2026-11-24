import type { QrMatrix } from './qr'

/**
 * How a QR code looks: the shape of the data modules and of the three corner "eyes", the colours,
 * and the blank border. Everything is drawn as one SVG path in module units, so the same shapes
 * can be used for the on-screen SVG, a PNG and a PDF of an exact size. These only change how
 * it looks: the pattern of dark and light modules, and so what a scanner reads, is the same.
 */
export type ModuleShape = 'square' | 'rounded' | 'dots'
export type EyeShape = 'square' | 'rounded' | 'circle'

export interface QrStyle {
  shape: ModuleShape
  eye: EyeShape
  /** The dark colour, as #rrggbb. */
  fg: string
  /** The light colour as #rrggbb, or 'none' for a transparent background. */
  bg: string
  /** With rounded modules: neighbouring modules join up, and only corners with nothing next to them are rounded. */
  merge: boolean
  /** Width of the blank border, in modules. Scanners want at least 4 (the standard), and 2 is the usual minimum. */
  quiet: number
}

export const DEFAULT_STYLE: QrStyle = { shape: 'square', eye: 'square', fg: '#000000', bg: '#ffffff', merge: false, quiet: 4 }

export const SHAPES: { id: ModuleShape; name: string }[] = [
  { id: 'square', name: 'Squares' },
  { id: 'rounded', name: 'Rounded' },
  { id: 'dots', name: 'Dots' }
]
export const EYES: { id: EyeShape; name: string }[] = [
  { id: 'square', name: 'Square' },
  { id: 'rounded', name: 'Rounded' },
  { id: 'circle', name: 'Circle' }
]

// ── Colours ─────────────────────────────────────────────────────────────────
/** "#abc", "abcdef" or "#ABCDEF" as "#abcdef"; undefined if it isn't a colour. */
export function normaliseHex(text: string): string | undefined {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())
  if (!match) return undefined
  const digits = match[1]!.toLowerCase()
  return `#${digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits}`
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export interface StyleCheck {
  level: 'ok' | 'warning' | 'bad'
  message: string
}

/** Whether a scanner is likely to read these colours and this border. */
export function checkStyle(style: QrStyle): StyleCheck {
  const light = style.bg === 'none' ? '#ffffff' : style.bg
  const ratio = contrastRatio(style.fg, light)
  if (ratio < 3) return { level: 'bad', message: 'These colours are too close together: many scanners won’t read this code. Make the dark colour darker or the light colour lighter.' }
  if (luminance(style.fg) > luminance(light)) return { level: 'warning', message: 'The dark modules are lighter than the background. Some scanners can’t read a code like that. Try the other way round.' }
  if (style.bg === 'none') return { level: 'warning', message: 'A transparent background only works if it sits on something light.' }
  if (ratio < 4.5) return { level: 'warning', message: 'The contrast is lowish. It should still scan, but test it before you print it.' }
  if (style.quiet < 2) return { level: 'warning', message: 'A border of less than 2 modules can stop scanners finding the code.' }
  return { level: 'ok', message: 'Good contrast.' }
}

// ── Shapes ──────────────────────────────────────────────────────────────────
const n = (value: number) => String(Math.round(value * 1000) / 1000)

/** A rounded rectangle as a path, clockwise (a filled shape) or anticlockwise (a hole, with the non-zero rule). */
function rect(x: number, y: number, w: number, h: number, r: number, clockwise = true): string {
  const arc = (dx: number, dy: number) => (r > 0 ? `a${n(r)} ${n(r)} 0 0 ${clockwise ? 1 : 0} ${n(dx)} ${n(dy)}` : '')
  const wide = n(w - 2 * r)
  const tall = n(h - 2 * r)
  if (clockwise) {
    return `M${n(x + r)} ${n(y)}h${wide}${arc(r, r)}v${tall}${arc(-r, r)}h-${wide}${arc(-r, -r)}v-${tall}${arc(r, -r)}z`
  }
  return `M${n(x + r)} ${n(y)}${arc(-r, r)}v${tall}${arc(r, r)}h${wide}${arc(r, -r)}v-${tall}${arc(-r, -r)}h-${wide}z`
}

/** A rectangle with a different radius on each corner, clockwise from the top left. */
function cornerRect(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number): string {
  const arc = (r: number, dx: number, dy: number) => (r > 0 ? `a${n(r)} ${n(r)} 0 0 1 ${n(dx)} ${n(dy)}` : '')
  return (
    `M${n(x + tl)} ${n(y)}h${n(w - tl - tr)}${arc(tr, tr, tr)}v${n(h - tr - br)}${arc(br, -br, br)}` +
    `h-${n(w - br - bl)}${arc(bl, -bl, -bl)}v-${n(h - bl - tl)}${arc(tl, tl, -tl)}z`
  )
}

const EYE_RADII: Record<EyeShape, [outer: number, hole: number, core: number]> = {
  square: [0, 0, 0],
  rounded: [2, 1.2, 1],
  circle: [3.5, 2.5, 1.5]
}

function eye(x: number, y: number, shape: EyeShape): string {
  const [outer, hole, core] = EYE_RADII[shape]
  return rect(x, y, 7, 7, outer) + rect(x + 1, y + 1, 5, 5, hole, false) + rect(x + 2, y + 2, 3, 3, core)
}

/** Which modules belong to one of the three corner eyes. */
const inEye = (size: number, row: number, col: number) => (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7)

/** The whole code as one path, in module units, with the blank border added around it. */
export function qrPath(matrix: QrMatrix, style: QrStyle): string {
  const q = style.quiet
  const { size } = matrix
  let d = eye(q, q, style.eye) + eye(q + size - 7, q, style.eye) + eye(q, q + size - 7, style.eye)

  if (style.shape === 'square') {
    // Runs along each row, to keep the path short.
    for (let row = 0; row < size; row++) {
      let start = -1
      for (let col = 0; col <= size; col++) {
        const dark = col < size && matrix.isDark(row, col) && !inEye(size, row, col)
        if (dark && start < 0) start = col
        if (!dark && start >= 0) {
          d += `M${q + start} ${q + row}h${col - start}v1h-${col - start}z`
          start = -1
        }
      }
    }
  } else if (style.shape === 'rounded' && style.merge) {
    // Modules touch, and a corner is only rounded if nothing is next to it on either side of it.
    const dark = (row: number, col: number) => row >= 0 && col >= 0 && row < size && col < size && matrix.isDark(row, col) && !inEye(size, row, col)
    const radius = 0.4
    const overlap = 0.02 // a sliver over each joined edge, so no hairline shows between neighbours
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (!dark(row, col)) continue
        const up = dark(row - 1, col)
        const down = dark(row + 1, col)
        const left = dark(row, col - 1)
        const right = dark(row, col + 1)
        const x = q + col - (left ? overlap : 0)
        const y = q + row - (up ? overlap : 0)
        const w = 1 + (left ? overlap : 0) + (right ? overlap : 0)
        const h = 1 + (up ? overlap : 0) + (down ? overlap : 0)
        d += cornerRect(x, y, w, h, !left && !up ? radius : 0, !right && !up ? radius : 0, !right && !down ? radius : 0, !left && !down ? radius : 0)
      }
    }
  } else {
    const [inset, radius] = style.shape === 'dots' ? [0.03, 0.47] : [0.04, 0.3]
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (matrix.isDark(row, col) && !inEye(size, row, col)) d += rect(q + col + inset, q + row + inset, 1 - 2 * inset, 1 - 2 * inset, radius)
      }
    }
  }
  return d
}

/** The code as a scalable SVG. The colours are checked hex values, so nothing else can get into it. */
export function qrSvg(matrix: QrMatrix, style: QrStyle = DEFAULT_STYLE): string {
  const fg = normaliseHex(style.fg) ?? DEFAULT_STYLE.fg
  const bg = style.bg === 'none' ? undefined : (normaliseHex(style.bg) ?? DEFAULT_STYLE.bg)
  const total = matrix.size + style.quiet * 2
  const crisp = style.shape === 'square' && style.eye === 'square' ? ' shape-rendering="crispEdges"' : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${crisp}>` +
    (bg ? `<rect width="${total}" height="${total}" fill="${bg}"/>` : '') +
    `<path d="${qrPath(matrix, style)}" fill="${fg}"/></svg>`
  )
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = normaliseHex(hex) ?? '#000000'
  return [parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255]
}
