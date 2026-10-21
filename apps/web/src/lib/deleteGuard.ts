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

/**
 * `accountId` scopes the choice to one mailbox: the delete dialog's "do not ask
 * again" applies to the account being cleaned up, while the Settings switch
 * stays global (no account id).
 */
function keyFor(userId: string, accountId?: string | null): string {
  return accountId ? `${KEY_PREFIX}${userId}.${accountId}` : `${KEY_PREFIX}${userId}`
}

export function isDeleteConfirmSkipped(
  userId: string | null | undefined,
  accountId?: string | null,
): boolean {
  if (!userId) return false
  const store = storage()
  if (!store) return false
  if (accountId && store.getItem(keyFor(userId, accountId)) === '1') return true
  return store.getItem(keyFor(userId)) === '1'
}

export function setDeleteConfirmSkipped(
  userId: string,
  skipped: boolean,
  accountId?: string | null,
): void {
  const store = storage()
  if (!store) return
  const key = keyFor(userId, accountId)
  if (skipped) store.setItem(key, '1')
  else store.removeItem(key)
}
