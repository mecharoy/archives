/* A thin IndexedDB layer. No library, no migrations framework — five object
   stores and a version number. Everything the app knows lives here, so the
   phone works with no signal and the Sheet is a copy, not the source. */

const DB_NAME = 'sitekhata'
const DB_VERSION = 1

export type StoreName = 'kv' | 'masters' | 'entries' | 'outbox' | 'blobs'
const STORES: StoreName[] = ['kv', 'masters', 'entries', 'outbox', 'blobs']

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close()
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        tx.onabort = () => reject(tx.error)
      })
  )
}

export const dbGet = <T>(store: StoreName, id: string): Promise<T | undefined> =>
  run<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>)

export const dbAll = <T>(store: StoreName): Promise<T[]> =>
  run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)

export const dbPut = <T extends { id: string }>(store: StoreName, value: T): Promise<unknown> =>
  run(store, 'readwrite', (s) => s.put(value))

export const dbDel = (store: StoreName, id: string): Promise<unknown> =>
  run(store, 'readwrite', (s) => s.delete(id))

export async function dbPutMany<T extends { id: string }>(store: StoreName, values: T[]): Promise<void> {
  if (!values.length) return
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    for (const v of values) os.put(v)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function dbClear(store: StoreName): Promise<void> {
  await run(store, 'readwrite', (s) => s.clear())
}

/* kv is for small settings and drafts; values are cloned structurally. */
export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await dbGet<{ id: string; v: T }>('kv', key)
  return row ? row.v : fallback
}

export const kvSet = <T>(key: string, v: T): Promise<unknown> => dbPut('kv', { id: key, v })
export const kvDel = (key: string): Promise<unknown> => dbDel('kv', key)

export function uid(): string {
  const c = globalThis.crypto
  if (c && 'randomUUID' in c) return c.randomUUID()
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
