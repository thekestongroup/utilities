/**
 * Cookies, for the few harmless options each tool can remember ("save as my defaults").
 *
 * Cookies travel to the server with page requests (GitHub Pages doesn't read them, but the
 * browser sends them), so nothing sensitive is ever put in one: no setup keys, no passwords, no
 * files. Tools choose which options may be saved; see lib/defaults.ts.
 */
export interface CookieAttributes {
  /** Where the cookie applies. Defaults to the site's base path. */
  path?: string
  /** Seconds until it expires. Zero or negative deletes it. */
  maxAge?: number
  secure?: boolean
}

export function serializeCookie(name: string, value: string, attributes: CookieAttributes = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
  parts.push(`Path=${attributes.path ?? '/'}`)
  if (attributes.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(attributes.maxAge)}`)
  parts.push('SameSite=Lax')
  if (attributes.secure) parts.push('Secure')
  return parts.join('; ')
}

export function parseCookies(header: string): Record<string, string> {
  const jar: Record<string, string> = {}
  for (const piece of header.split(';')) {
    const index = piece.indexOf('=')
    if (index < 0) continue
    const name = piece.slice(0, index).trim()
    if (!name) continue
    try {
      jar[decodeURIComponent(name)] = decodeURIComponent(piece.slice(index + 1).trim())
    } catch {
      // A cookie from somewhere else that isn't encoded the way we write ours: ignore it.
    }
  }
  return jar
}

const basePath = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'

export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  return parseCookies(document.cookie)[name]
}

const YEAR = 365 * 24 * 60 * 60

export function writeCookie(name: string, value: string, maxAge = YEAR): void {
  if (typeof document === 'undefined') return
  document.cookie = serializeCookie(name, value, { path: basePath(), maxAge, secure: location.protocol === 'https:' })
}

export function deleteCookie(name: string): void {
  writeCookie(name, '', 0)
}
