/**
 * Local draft persistence for the composer.
 *
 * Drafts are scoped by user, compose mode and source message so that opening a
 * different reply never overwrites an unrelated draft. Attachments are not
 * persisted here: the File objects cannot be serialised, and silently restoring
 * a draft without its attachments would be worse than telling the user.
 */

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export interface ComposeDraft {
  version: 1
  mode: ComposeMode
  sourceKey: string
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  html: string
  savedAt: number
}

const KEY_PREFIX = 'osm.draft.v1.'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const PRUNE_INTERVAL_MS = 60_000

let lastPrune = 0

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    // Storage can be disabled by browser privacy settings.
    return null
  }
}

export function composeDraftKey(userId: string, mode: ComposeMode, sourceKey: string): string {
  return `${KEY_PREFIX}${userId}.${mode}.${sourceKey}`
}

export function loadDraft(key: string): ComposeDraft | null {
  const store = storage()
  const raw = store?.getItem(key)
  if (!raw) return null

  try {
    const draft = JSON.parse(raw) as Partial<ComposeDraft>
    const valid =
      draft.version === 1 &&
      typeof draft.savedAt === 'number' &&
      typeof draft.html === 'string' &&
      typeof draft.to === 'string' &&
      typeof draft.cc === 'string' &&
      typeof draft.bcc === 'string' &&
      typeof draft.accountId === 'string' &&
      typeof draft.subject === 'string'
    if (!valid || Date.now() - (draft.savedAt ?? 0) > MAX_AGE_MS) {
      store?.removeItem(key)
      return null
    }
    return draft as ComposeDraft
  } catch {
    store?.removeItem(key)
    return null
  }
}

export function saveDraft(
  key: string,
  draft: Omit<ComposeDraft, 'version' | 'savedAt'>,
): number | null {
  const store = storage()
  if (!store) return null

  const savedAt = Date.now()
  const payload: ComposeDraft = { version: 1, ...draft, savedAt }
  try {
    store.setItem(key, JSON.stringify(payload))
    pruneExpiredDrafts(store)
    return savedAt
  } catch {
    // Quota exceeded: keep the composer usable and let the caller decide.
    return null
  }
}

export function clearDraft(key: string): void {
  try {
    storage()?.removeItem(key)
  } catch {
    // Ignore unavailable storage.
  }
}

function pruneExpiredDrafts(store: Storage): void {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now

  const stale: string[] = []
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index)
    if (!key?.startsWith(KEY_PREFIX)) continue
    try {
      const draft = JSON.parse(store.getItem(key) ?? '') as Partial<ComposeDraft>
      if (typeof draft.savedAt !== 'number' || now - draft.savedAt > MAX_AGE_MS) stale.push(key)
    } catch {
      stale.push(key)
    }
  }
  for (const key of stale) store.removeItem(key)
}
