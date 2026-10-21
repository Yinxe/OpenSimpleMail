import { rm } from 'node:fs/promises'
import type { ParsedMessage } from './message-parser'

// Opening a message and then downloading three of its attachments used to
// download and parse the same source four times. The entry now keeps only the
// text body and the attachment metadata in memory; the bytes live on disk.
const TTL_MS = 10 * 60 * 1000
const MAX_ENTRIES = 12
const MAX_MEMORY_BYTES = 8 * 1024 * 1024

interface CacheEntry {
  message: ParsedMessage
  memoryBytes: number
  diskBytes: number
  storedAt: number
}

export function parsedCacheKey(accountId: string, mailbox: string, uid: number): string {
  return `${accountId}\u0000${mailbox}\u0000${uid}`
}

export class ParsedMessageCache {
  private readonly entries = new Map<string, CacheEntry>()
  // Two requests for the same message would otherwise extract their
  // attachments into the same directory at the same time.
  private readonly pending = new Map<string, Promise<ParsedMessage>>()
  // Bumped by clear(): a parse that started before the purge must not put its
  // entry back, its directory is gone.
  private generation = 0
  private memoryBytes = 0
  private diskBytes = 0

  constructor(private readonly maxDiskBytes: number) {}

  get(key: string): ParsedMessage | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (Date.now() - entry.storedAt > TTL_MS) {
      this.drop(key)
      return null
    }
    // Re-insert to refresh the LRU order.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.message
  }

  /**
   * Returns the cached message or runs `loader` once, sharing the in-flight
   * promise with any concurrent caller for the same key.
   */
  async load(key: string, loader: () => Promise<ParsedMessage>): Promise<ParsedMessage> {
    const cached = this.get(key)
    if (cached) return cached

    const inflight = this.pending.get(key)
    if (inflight) return inflight

    const generation = this.generation
    const promise = loader()
      .then((message) => {
        if (generation === this.generation) this.set(key, message)
        else void this.removeDir(message.dir)
        return message
      })
      .finally(() => this.pending.delete(key))
    this.pending.set(key, promise)
    return promise
  }

  set(key: string, message: ParsedMessage): void {
    const diskBytes = message.attachments.reduce((sum, item) => sum + item.size, 0)
    const memoryBytes = (message.text?.length ?? 0) + (message.html?.length ?? 0)

    this.drop(key)
    // One message larger than the whole budget is served once and not cached.
    if (diskBytes > this.maxDiskBytes) {
      void this.removeDir(message.dir)
      return
    }

    while (
      this.entries.size >= MAX_ENTRIES ||
      this.memoryBytes + memoryBytes > MAX_MEMORY_BYTES ||
      this.diskBytes + diskBytes > this.maxDiskBytes
    ) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (!oldest) break
      this.drop(oldest)
    }

    this.entries.set(key, { message, memoryBytes, diskBytes, storedAt: Date.now() })
    this.memoryBytes += memoryBytes
    this.diskBytes += diskBytes
  }

  /** Drops entries that have outlived the TTL and reports what is left. */
  stats(): { entries: number; memoryBytes: number; diskBytes: number } {
    const now = Date.now()
    for (const [key, entry] of [...this.entries]) {
      if (now - entry.storedAt > TTL_MS) this.drop(key)
    }
    return {
      entries: this.entries.size,
      memoryBytes: this.memoryBytes,
      diskBytes: this.diskBytes,
    }
  }

  /** Forgets every entry and removes the extracted files it owns. */
  async clear(): Promise<void> {
    const directories = [...this.entries.values()].map((entry) => entry.message.dir)
    this.generation += 1
    this.entries.clear()
    this.memoryBytes = 0
    this.diskBytes = 0
    await Promise.all(directories.map((directory) => this.removeDir(directory)))
  }

  drop(key: string): void {
    this.pending.delete(key)
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    this.memoryBytes = Math.max(0, this.memoryBytes - entry.memoryBytes)
    this.diskBytes = Math.max(0, this.diskBytes - entry.diskBytes)
    void this.removeDir(entry.message.dir)
  }

  private async removeDir(directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}
