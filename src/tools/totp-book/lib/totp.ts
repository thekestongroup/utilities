/**
 * RFC 6238 TOTP on top of RFC 4226 HOTP, using the Web Crypto API.
 * Import the key once with `importKey` and reuse it for every code.
 */
export type Algorithm = 'SHA-1' | 'SHA-256' | 'SHA-512'
export type Digits = 6 | 8

export const ALGORITHMS: Algorithm[] = ['SHA-1', 'SHA-256', 'SHA-512']

export function importKey(secret: Uint8Array, algorithm: Algorithm): Promise<CryptoKey> {
  // `extractable: false`: the key can sign but its bytes can't be read back out.
  return crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: algorithm }, false, ['sign'])
}

/** Counter for a moment in time: floor(unixSeconds / period). */
export function counterFor(unixSeconds: number, period: number): number {
  return Math.floor(unixSeconds / period)
}

function counterBytes(counter: number): ArrayBuffer {
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  view.setUint32(0, Math.floor(counter / 2 ** 32))
  view.setUint32(4, counter >>> 0)
  return buffer
}

/** RFC 4226 dynamic truncation of an HMAC, as a number below 10^digits. */
export function truncate(hmac: Uint8Array, digits: number): number {
  const offset = hmac[hmac.length - 1]! & 0x0f
  const binary =
    ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!
  return (binary >>> 0) % 10 ** digits
}

/** HOTP value for one counter, as a number. */
export async function hotp(key: CryptoKey, counter: number, digits: number): Promise<number> {
  const signature = await crypto.subtle.sign('HMAC', key, counterBytes(counter))
  return truncate(new Uint8Array(signature), digits)
}

/** The code for a moment in time, padded with leading zeros. */
export async function totp(key: CryptoKey, unixSeconds: number, period: number, digits: number): Promise<string> {
  return padCode(await hotp(key, counterFor(unixSeconds, period), digits), digits)
}

export function padCode(value: number, digits: number): string {
  return String(value).padStart(digits, '0')
}

/** "482913" → "482 913"; 8 digits → "4829 1337". */
export function groupCode(code: string): string {
  const half = Math.ceil(code.length / 2)
  return code.length >= 6 ? `${code.slice(0, half)} ${code.slice(half)}` : code
}

/**
 * Codes for `count` consecutive counters starting at `firstCounter`, as
 * compact numbers (index i is counter firstCounter + i). Signs in batches
 * so the browser can run the HMACs together.
 */
export async function generateCodes(
  key: CryptoKey,
  firstCounter: number,
  count: number,
  digits: number,
  onProgress?: (done: number) => void,
  batchSize = 2048
): Promise<Uint32Array> {
  const codes = new Uint32Array(count)
  for (let start = 0; start < count; start += batchSize) {
    const size = Math.min(batchSize, count - start)
    const signatures = new Array<Promise<ArrayBuffer>>(size)
    for (let i = 0; i < size; i++) {
      signatures[i] = crypto.subtle.sign('HMAC', key, counterBytes(firstCounter + start + i))
    }
    const results = await Promise.all(signatures)
    for (let i = 0; i < size; i++) codes[start + i] = truncate(new Uint8Array(results[i]!), digits)
    onProgress?.(start + size)
  }
  return codes
}

/**
 * Compares a code typed in with the codes for a few steps either side of now. Offset 0 means it is
 * the current code; -1 means it is the previous one (the typed code is a step old, so the
 * device it came from is a step behind), and +1 that it is the next (the device is a step ahead).
 */
export async function matchOffset(key: CryptoKey, typed: string, unixSeconds: number, period: number, digits: number, window = 2): Promise<number | undefined> {
  const wanted = typed.replace(/\s+/g, '')
  if (wanted.length !== digits || !/^\d+$/.test(wanted)) return undefined
  const counter = counterFor(unixSeconds, period)
  for (const offset of [0, -1, 1, -2, 2].filter((o) => Math.abs(o) <= window)) {
    if (padCode(await hotp(key, counter + offset, digits), digits) === wanted) return offset
  }
  return undefined
}
