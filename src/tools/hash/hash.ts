/**
 * Checksums of bytes and files, all in the browser. SHA-1/256/384/512 use Web Crypto; MD5 and
 * CRC-32 aren't in it, so they are written here (and work through a file in pieces).
 */
export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512' | 'crc32'

export const ALGORITHMS: { id: HashAlgorithm; name: string; hexLength: number; note?: string }[] = [
  { id: 'md5', name: 'MD5', hexLength: 32, note: 'Broken for security: only good for spotting accidents.' },
  { id: 'sha1', name: 'SHA-1', hexLength: 40, note: 'Broken for security: only good for spotting accidents.' },
  { id: 'sha256', name: 'SHA-256', hexLength: 64 },
  { id: 'sha384', name: 'SHA-384', hexLength: 96 },
  { id: 'sha512', name: 'SHA-512', hexLength: 128 },
  { id: 'crc32', name: 'CRC-32', hexLength: 8, note: 'Catches accidents only; trivial to fake.' }
]

const SUBTLE: Partial<Record<HashAlgorithm, string>> = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

// ── CRC-32 (the one used by zip, PNG and Ethernet) ──────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export class Crc32 {
  private value = 0xffffffff
  update(data: Uint8Array): this {
    let c = this.value
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
    this.value = c
    return this
  }
  digest(): string {
    return ((this.value ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
  }
}

// ── MD5 (RFC 1321) ──────────────────────────────────────────────────────────
const MD5_SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

export class Md5 {
  private state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  private block = new Uint8Array(64)
  private used = 0
  private total = 0

  update(data: Uint8Array): this {
    this.total += data.length
    let offset = 0
    while (offset < data.length) {
      const take = Math.min(64 - this.used, data.length - offset)
      this.block.set(data.subarray(offset, offset + take), this.used)
      this.used += take
      offset += take
      if (this.used === 64) {
        this.process(this.block)
        this.used = 0
      }
    }
    return this
  }

  private process(block: Uint8Array) {
    const m = new Uint32Array(16)
    for (let i = 0; i < 16; i++) m[i] = block[i * 4]! | (block[i * 4 + 1]! << 8) | (block[i * 4 + 2]! << 16) | (block[i * 4 + 3]! << 24)
    let [a, b, c, d] = this.state as [number, number, number, number]
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const sum = (a + f + MD5_K[i]! + m[g]!) >>> 0
      const s = MD5_SHIFTS[(i >> 4) * 4 + (i % 4)]!
      a = d
      d = c
      c = b
      b = (b + ((sum << s) | (sum >>> (32 - s)))) >>> 0
    }
    this.state = [(this.state[0]! + a) >>> 0, (this.state[1]! + b) >>> 0, (this.state[2]! + c) >>> 0, (this.state[3]! + d) >>> 0]
  }

  digest(): string {
    const bitsLow = (this.total * 8) >>> 0
    const bitsHigh = Math.floor((this.total * 8) / 2 ** 32) >>> 0
    const padLength = (this.used < 56 ? 56 : 120) - this.used
    const tail = new Uint8Array(padLength + 8)
    tail[0] = 0x80
    new DataView(tail.buffer).setUint32(padLength, bitsLow, true)
    new DataView(tail.buffer).setUint32(padLength + 4, bitsHigh, true)
    this.update(tail)
    const out = new Uint8Array(16)
    const view = new DataView(out.buffer)
    this.state.forEach((word, i) => view.setUint32(i * 4, word, true))
    return hex(out)
  }
}

// ── Putting it together ─────────────────────────────────────────────────────
export async function hashBytes(algorithm: HashAlgorithm, data: Uint8Array): Promise<string> {
  if (algorithm === 'md5') return new Md5().update(data).digest()
  if (algorithm === 'crc32') return new Crc32().update(data).digest()
  const digest = await crypto.subtle.digest(SUBTLE[algorithm]!, data as BufferSource)
  return hex(new Uint8Array(digest))
}

export async function hashText(algorithms: HashAlgorithm[], text: string): Promise<Record<string, string>> {
  const data = new TextEncoder().encode(text)
  const out: Record<string, string> = {}
  for (const algorithm of algorithms) out[algorithm] = await hashBytes(algorithm, data)
  return out
}

/**
 * Hashes a file. MD5 and CRC-32 read it in pieces; the SHA family needs the whole file in memory
 * (Web Crypto has no streaming), so very large files may not work with those.
 */
export async function hashFile(algorithms: HashAlgorithm[], file: File, onProgress?: (fraction: number) => void): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const md5 = algorithms.includes('md5') ? new Md5() : undefined
  const crc = algorithms.includes('crc32') ? new Crc32() : undefined
  if (md5 || crc) {
    const piece = 4 * 1024 * 1024
    for (let offset = 0; offset < file.size; offset += piece) {
      const chunk = new Uint8Array(await file.slice(offset, offset + piece).arrayBuffer())
      md5?.update(chunk)
      crc?.update(chunk)
      onProgress?.(Math.min(1, (offset + piece) / Math.max(1, file.size)))
    }
    if (md5) out.md5 = md5.digest()
    if (crc) out.crc32 = crc.digest()
  }
  const sha = algorithms.filter((a) => SUBTLE[a])
  if (sha.length) {
    const data = new Uint8Array(await file.arrayBuffer())
    for (const algorithm of sha) out[algorithm] = await hashBytes(algorithm, data)
  }
  onProgress?.(1)
  return out
}

/**
 * Finds a checksum in whatever was pasted: just the hash, "hash  filename" (sha256sum), or
 * "SHA256 (file) = hash". Which algorithm it is comes from its length.
 */
export function parseExpected(text: string): { hash: string; algorithm: HashAlgorithm } | undefined {
  const lengths = new Map(ALGORITHMS.map((a) => [a.hexLength, a.id]))
  for (const token of text.match(/[0-9a-fA-F]{8,128}/g) ?? []) {
    const algorithm = lengths.get(token.length)
    if (algorithm) return { hash: token.toLowerCase(), algorithm }
  }
  return undefined
}
