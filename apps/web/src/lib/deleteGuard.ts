/**
 * Per-tab delete confirmation preference. Deliberately session-scoped: the
 * user asked for the choice to last only for the current session, so it is
 * kept in sessionStorage instead of the server-side preferences table.
 */

const KEY_PREFIX = 'osm.delete-confirm-skip.'

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function isDeleteConfirmSkipped(userId: string | null | undefined): boolean {
  if (!userId) return false
  return storage()?.getItem(`${KEY_PREFIX}${userId}`) === '1'
}

export function setDeleteConfirmSkipped(userId: string, skipped: boolean): void {
  const store = storage()
  if (!store) return
  const key = `${KEY_PREFIX}${userId}`
  if (skipped) store.setItem(key, '1')
  else store.removeItem(key)
}
