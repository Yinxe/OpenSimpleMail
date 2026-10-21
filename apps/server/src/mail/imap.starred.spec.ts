import type { FetchMessageObject, ListResponse } from 'imapflow'
import { describe, expect, it } from 'vitest'
import { ImapProvider } from './imap.provider'
import type { MailCredentials } from './mail.types'

const creds: MailCredentials = {
  accountId: 'starred-spec',
  name: 'Starred Spec',
  email: 'starred@example.com',
  username: 'starred@example.com',
  password: 'secret',
  imap: { host: '127.0.0.1', port: 1, secure: false },
  smtp: { host: '127.0.0.1', port: 1, secure: false },
}

interface FakeFolder {
  path: string
  specialUse?: string
  listed?: boolean
  noSelect?: boolean
  uids: number[]
}

/**
 * Minimal ImapFlow stand-in. Like the real server, it only honours UID ranges
 * when the option object says so: sequence numbers and UIDs are different
 * namespaces, which is exactly the bug the starred view used to hit.
 */
function fakeClient(folders: FakeFolder[]) {
  const searches: { mailbox: string; criteria: unknown }[] = []
  let current = folders[0]?.path ?? 'INBOX'
  const client = {
    async list(): Promise<ListResponse[]> {
      return folders.map((folder) => ({
        path: folder.path,
        specialUse: folder.specialUse,
        listed: folder.listed ?? true,
        flags: new Set([
          ...(folder.noSelect ? ['\\Noselect'] : ['\\HasNoChildren']),
          ...(folder.specialUse ? [folder.specialUse] : []),
        ]),
      })) as unknown as ListResponse[]
    },
    async getMailboxLock(path: string) {
      current = path
      return { release: () => undefined }
    },
    async search(criteria: unknown) {
      searches.push({ mailbox: current, criteria })
      return folders.find((folder) => folder.path === current)?.uids ?? []
    },
    async *fetch(range: number[] | string, _query: unknown, options?: { uid?: boolean }) {
      if (!options?.uid) return
      const wanted = Array.isArray(range) ? range : []
      const folder = folders.find((item) => item.path === current)
      for (const uid of wanted) {
        if (!folder?.uids.includes(uid)) continue
        yield {
          uid,
          seq: folder.uids.indexOf(uid) + 1,
          envelope: { subject: `Message ${uid}`, from: [], to: [] },
          flags: new Set(['\\Flagged']),
          internalDate: new Date('2026-10-20T10:00:00Z'),
          size: 1024,
          bodyStructure: undefined,
        } as unknown as FetchMessageObject
      }
    },
  }
  return { client, searches }
}

function providerWith(folders: FakeFolder[], accountId = 'starred-spec') {
  const { client, searches } = fakeClient(folders)
  const provider = Object.create(ImapProvider.prototype) as unknown as {
    creds: MailCredentials
    pool: { withClient: (creds: MailCredentials, run: (client: unknown) => unknown) => unknown }
    logger: { warn: (message: string) => void }
    listMessages: (options: {
      mailbox: string
      page: number
      pageSize: number
    }) => Promise<{ messages: { uid: number; mailbox?: string }[]; total: number }>
  }
  // The merged result is cached per account for a couple of minutes, so each
  // test gets its own account id.
  provider.creds = { ...creds, accountId }
  provider.pool = { withClient: (_creds, run) => run(client) }
  provider.logger = { warn: () => undefined }
  return { provider, searches, client }
}

describe('ImapProvider starred view', () => {
  it('collects flagged messages from every folder except trash, junk and drafts', async () => {
    const { provider, searches } = providerWith(
      [
        { path: 'INBOX', specialUse: '\\Inbox', uids: [101, 102] },
        { path: 'Sent', specialUse: '\\Sent', uids: [] },
        { path: 'Trash', specialUse: '\\Trash', uids: [900] },
        { path: 'Archive', uids: [103] },
      ],
      'starred-multi',
    )

    const page = await provider.listMessages({ mailbox: '__starred__', page: 1, pageSize: 30 })

    expect(page.total).toBe(3)
    expect(page.messages.map((message) => message.uid).sort()).toEqual([101, 102, 103])
    expect(page.messages.every((message) => message.mailbox !== undefined)).toBe(true)
    expect(searches.map((item) => item.mailbox)).toEqual(['INBOX', 'Sent', 'Archive'])
    expect(searches[0]?.criteria).toMatchObject({ flagged: true })
  })

  it('returns nothing when the mailbox holds no flagged mail', async () => {
    const { provider } = providerWith(
      [{ path: 'INBOX', specialUse: '\\Inbox', uids: [] }],
      'starred-empty',
    )

    const page = await provider.listMessages({ mailbox: '__starred__', page: 1, pageSize: 30 })

    expect(page.total).toBe(0)
    expect(page.messages).toEqual([])
  })

  it('searches a \\Flagged folder once instead of walking every folder', async () => {
    const { provider, searches } = providerWith(
      [
        { path: 'Starred', specialUse: '\\Flagged', uids: [7, 8] },
        { path: 'INBOX', specialUse: '\\Inbox', uids: [7] },
      ],
      'starred-folder',
    )

    const page = await provider.listMessages({ mailbox: '__starred__', page: 1, pageSize: 30 })

    expect(page.messages.map((message) => message.uid)).toEqual([8, 7])
    expect(searches.map((item) => item.mailbox)).toEqual(['Starred'])
  })
})
