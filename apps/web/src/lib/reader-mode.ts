export type ReaderMode = 'full' | 'text' | 'code'

const STORAGE_KEY = 'osm:reader-mode'

export const READER_MODES: Array<{ value: ReaderMode }> = [
  { value: 'full' },
  { value: 'text' },
  { value: 'code' },
]

export function readReaderMode(): ReaderMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'full' || stored === 'text' || stored === 'code') return stored
  } catch {
    // Storage can be unavailable in private windows.
  }
  return 'full'
}

export function writeReaderMode(mode: ReaderMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Ignore quota and privacy-mode failures.
  }
}
