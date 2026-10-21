import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ParsedMessage } from './message-parser'
import { ParsedMessageCache, parsedCacheKey } from './parsed-cache'

const directories: string[] = []

async function entry(size: number, text = 'hello'): Promise<ParsedMessage> {
  const dir = await mkdtemp(join(tmpdir(), 'osm-cache-'))
  directories.push(dir)
  await writeFile(join(dir, '0.bin'), Buffer.alloc(size, 1))
  return {
    dir,
    text,
    attachments: [
      {
        filename: 'file.bin',
        contentType: 'application/octet-stream',
        size,
        cid: null,
        related: false,
        path: join(dir, '0.bin'),
      },
    ],
  }
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('ParsedMessageCache', () => {
  it('returns a cached message and keeps the directory', async () => {
    const cache = new ParsedMessageCache(1024 * 1024)
    const message = await entry(1024)
    const key = parsedCacheKey('account', 'INBOX', 1)

    cache.set(key, message)
    expect(cache.get(key)).toBe(message)
    expect(await readdir(message.dir)).toContain('0.bin')
  })

  it('evicts the least recently used entry and deletes its files', async () => {
    const cache = new ParsedMessageCache(2 * 1024 * 1024)
    const first = await entry(1024 * 1024)
    const second = await entry(1024 * 1024)
    const third = await entry(1024 * 1024)

    cache.set(parsedCacheKey('account', 'INBOX', 1), first)
    cache.set(parsedCacheKey('account', 'INBOX', 2), second)
    cache.set(parsedCacheKey('account', 'INBOX', 3), third)

    expect(cache.get(parsedCacheKey('account', 'INBOX', 1))).toBeNull()
    expect(cache.get(parsedCacheKey('account', 'INBOX', 2))).toBe(second)
    // The evicted entry's files are removed asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await readdir(first.dir).catch(() => [])).toEqual([])
  })

  it('does not cache a message larger than the whole budget', async () => {
    const cache = new ParsedMessageCache(1024)
    const message = await entry(4096)
    const key = parsedCacheKey('account', 'INBOX', 9)

    cache.set(key, message)
    expect(cache.get(key)).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await readdir(message.dir).catch(() => [])).toEqual([])
  })
})
