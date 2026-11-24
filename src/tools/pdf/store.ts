import type { PageItem, SourceFile } from './lib/pages'

/**
 * "Keep my PDFs on this device": the files being edited and the page list are stored in this
 * browser's IndexedDB (not a cookie, which is far too small), only if the user turns it on, and only
 * ever read back by this page. Nothing is uploaded. Turning it off deletes it.
 */
export interface SavedProject {
  sources: SourceFile[]
  items: PageItem[]
  savedAt: number
}

const DB_NAME = 'keston-utilities'
const STORE = 'pdf-project'
const KEY = 'current'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

/** False if the browser refused (private window, no space). */
export async function saveProject(project: SavedProject): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.put(project, KEY))
    return true
  } catch {
    return false
  }
}

export async function loadProject(): Promise<SavedProject | undefined> {
  try {
    return (await run<SavedProject | undefined>('readonly', (store) => store.get(KEY))) ?? undefined
  } catch {
    return undefined
  }
}

export async function deleteProject(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(KEY))
  } catch {
    // Nothing to delete, or no storage.
  }
}
