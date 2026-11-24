/// <reference lib="webworker" />
import { generateCodes, importKey, type Algorithm } from './lib/totp'

export interface GenerateRequest {
  secret: Uint8Array
  algorithm: Algorithm
  digits: number
  volumes: { firstCounter: number; count: number }[]
}

export type GenerateMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'volume'; index: number; codes: Uint32Array }
  | { type: 'done' }
  | { type: 'error'; message: string }

const post = (message: GenerateMessage, transfer: Transferable[] = []) => self.postMessage(message, { transfer })

self.onmessage = async (event: MessageEvent<GenerateRequest>) => {
  const { secret, algorithm, digits, volumes } = event.data
  try {
    const key = await importKey(secret, algorithm)
    secret.fill(0) // the CryptoKey is all that's needed from here
    const total = volumes.reduce((sum, v) => sum + v.count, 0)
    let finished = 0
    let lastReport = 0
    for (let index = 0; index < volumes.length; index++) {
      const v = volumes[index]!
      const codes = await generateCodes(key, v.firstCounter, v.count, digits, (done) => {
        const now = performance.now()
        if (now - lastReport > 80) {
          lastReport = now
          post({ type: 'progress', done: finished + done, total })
        }
      })
      finished += v.count
      post({ type: 'volume', index, codes }, [codes.buffer])
    }
    post({ type: 'progress', done: total, total })
    post({ type: 'done' })
  } catch {
    // Deliberately no details: nothing derived from the key goes into messages.
    post({ type: 'error', message: 'Generating the codes failed.' })
  }
}
