import { type ChildProcessByStdio, spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import type {
  AccountDto,
  ContactDto,
  MailboxDto,
  MessagePageDto,
  UnifiedMessagePageDto,
  UserDto,
} from '@osm/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PORT = 4300 + Math.floor(Math.random() * 300)
const BASE = `http://127.0.0.1:${PORT}/api`
const ORIGIN = 'http://localhost:5173'
const DB_DIR = join(process.cwd(), '.tmp')
const DB_PATH = join(DB_DIR, `e2e-${process.pid}-${Date.now()}.db`)

interface AuthResponse {
  user: UserDto
}

interface JsonResponse<T> {
  status: number
  body: T
  headers: Headers
}

class ApiClient {
  private cookie = ''

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.cookie) headers.set('cookie', this.cookie)
    const method = (init.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD' && !headers.has('origin')) {
      headers.set('origin', ORIGIN)
    }
    if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    const response = await fetch(`${BASE}${path}`, { ...init, headers })
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';')[0] ?? ''
      if (pair.startsWith('osm_session=')) {
        this.cookie = pair.endsWith('=') ? '' : pair
      }
    }
    return response
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<JsonResponse<T>> {
    const response = await this.request(path, init)
    const text = await response.text()
    return {
      status: response.status,
      body: (text ? JSON.parse(text) : null) as T,
      headers: response.headers,
    }
  }
}

function post(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) }
}

let server: ChildProcessByStdio<null, Readable, Readable>
const logs: string[] = []

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/health`)
      if (response.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Server did not start.\n${logs.join('')}`)
}

beforeAll(async () => {
  if (!existsSync(join(process.cwd(), 'dist', 'main.js'))) {
    throw new Error('dist/main.js is missing; run `npm run build` before the e2e tests')
  }
  mkdirSync(DB_DIR, { recursive: true })
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_PATH: DB_PATH,
      APP_SECRET: 'e2e-test-secret-with-more-than-24-characters',
      WEB_ORIGIN: ORIGIN,
      DEMO_ENABLED: 'true',
      ADMIN_RECOVERY_PASSWORD: 'recovery-password-123',
      COOKIE_SECURE: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk: Buffer) => logs.push(chunk.toString()))
  server.stderr.on('data', (chunk: Buffer) => logs.push(chunk.toString()))
  await waitForServer()
})

afterAll(async () => {
  if (server && !server.killed) {
    server.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 300))
    if (!server.killed) server.kill('SIGKILL')
  }
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${DB_PATH}${suffix}`, { force: true })
  }
})

describe('first-run setup', () => {
  const admin = new ApiClient()
  const adminEmail = `admin-${Date.now()}@example.com`

  it('starts uninitialized and blocks the application', async () => {
    const config = await admin.json<{
      initialized: boolean
      allowRegistration: boolean
      siteName: string
    }>('/auth/config')
    expect(config.status).toBe(200)
    expect(config.body.initialized).toBe(false)
    expect(config.body.allowRegistration).toBe(false)

    const accounts = await admin.json('/accounts')
    expect(accounts.status).toBe(412)

    const register = await admin.json('/auth/register', {
      ...post({ name: 'Too Early', email: 'early@example.com', password: 'a-strong-password' }),
    })
    expect(register.status).toBe(412)
  })

  it('creates the administrator and stores the initial configuration', async () => {
    const setup = await admin.json<AuthResponse>('/setup', {
      ...post({
        siteName: 'E2E Mail',
        allowRegistration: true,
        demoEnabled: true,
        admin: { name: 'E2E Admin', email: adminEmail, password: 'admin-password' },
      }),
    })
    expect(setup.status).toBe(200)
    expect(setup.body.user.email).toBe(adminEmail)
    expect(setup.body.user.isAdmin).toBe(true)

    const me = await admin.json<AuthResponse>('/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user.isAdmin).toBe(true)

    const config = await admin.json<{
      initialized: boolean
      siteName: string
      allowRegistration: boolean
    }>('/auth/config')
    expect(config.body.initialized).toBe(true)
    expect(config.body.siteName).toBe('E2E Mail')
    expect(config.body.allowRegistration).toBe(true)

    const duplicate = await admin.json('/setup', {
      ...post({
        siteName: 'Again',
        allowRegistration: true,
        demoEnabled: true,
        admin: { name: 'Again', email: 'again@example.com', password: 'admin-password' },
      }),
    })
    expect(duplicate.status).toBe(409)
  })

  it('lets only administrators change system settings', async () => {
    const settings = await admin.json<{ allowRegistration: boolean; demoEnabled: boolean }>(
      '/admin/settings',
    )
    expect(settings.status).toBe(200)
    expect(settings.body.allowRegistration).toBe(true)

    const updated = await admin.json<{ siteName: string; allowRegistration: boolean }>(
      '/admin/settings',
      {
        method: 'PATCH',
        body: JSON.stringify({ allowRegistration: false, siteName: 'E2E Mail Hub' }),
      },
    )
    expect(updated.status).toBe(200)
    expect(updated.body.allowRegistration).toBe(false)
    expect(updated.body.siteName).toBe('E2E Mail Hub')

    const blocked = await admin.json('/auth/register', {
      ...post({ name: 'Blocked', email: 'blocked@example.com', password: 'a-strong-password' }),
    })
    expect(blocked.status).toBe(403)

    const reopen = await admin.json('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ allowRegistration: true }),
    })
    expect(reopen.status).toBe(200)

    const member = new ApiClient()
    const memberRegister = await member.json<AuthResponse>('/auth/register', {
      ...post({
        name: 'Member',
        email: `member-${Date.now()}@example.com`,
        password: 'a-strong-password',
      }),
    })
    expect(memberRegister.status).toBe(201)
    expect(memberRegister.body.user.isAdmin).toBe(false)

    const forbidden = await member.json('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ allowRegistration: false }),
    })
    expect(forbidden.status).toBe(403)
  })

  it('recovers an administrator with the environment password and rotates the session', async () => {
    const oldSession = new ApiClient()
    await oldSession
      .json('/auth/login', { ...post({ email: adminEmail, password: 'admin-password' }) })
      .then((response) => expect(response.status).toBe(200))

    const wrong = await new ApiClient().json('/auth/recover', {
      ...post({
        email: adminEmail,
        recoveryPassword: 'not-the-recovery-password',
        newPassword: 'new-admin-password',
      }),
    })
    expect(wrong.status).toBe(401)

    const recovered = await admin.json<AuthResponse>('/auth/recover', {
      ...post({
        email: adminEmail,
        recoveryPassword: 'recovery-password-123',
        newPassword: 'new-admin-password',
      }),
    })
    expect(recovered.status).toBe(200)
    expect(recovered.body.user.isAdmin).toBe(true)

    // Every session created before the recovery must be invalidated.
    const oldMe = await oldSession.json('/auth/me')
    expect(oldMe.status).toBe(401)

    const oldPassword = await new ApiClient().json('/auth/login', {
      ...post({ email: adminEmail, password: 'admin-password' }),
    })
    expect(oldPassword.status).toBe(401)

    const newPassword = await new ApiClient().json<AuthResponse>('/auth/login', {
      ...post({ email: adminEmail, password: 'new-admin-password' }),
    })
    expect(newPassword.status).toBe(200)
    expect(newPassword.body.user.isAdmin).toBe(true)

    const nonAdmin = new ApiClient()
    const created = await nonAdmin.json<AuthResponse>('/auth/register', {
      ...post({
        name: 'Not Admin',
        email: `not-admin-${Date.now()}@example.com`,
        password: 'a-strong-password',
      }),
    })
    expect(created.status).toBe(201)
    const rejected = await nonAdmin.json('/auth/recover', {
      ...post({
        email: created.body.user.email,
        recoveryPassword: 'recovery-password-123',
        newPassword: 'another-password',
      }),
    })
    expect(rejected.status).toBe(401)
  })
})

describe('authentication', () => {
  const email = `e2e-${Date.now()}@example.com`
  const client = new ApiClient()

  it('registers a local account and keeps a session', async () => {
    const registered = await client.json<AuthResponse>('/auth/register', {
      ...post({ name: 'E2E User', email, password: 'a-strong-password' }),
    })
    expect(registered.status).toBe(201)
    expect(registered.body.user.email).toBe(email)
    expect(registered.body.user.isDemo).toBe(false)

    const me = await client.json<AuthResponse>('/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe(email)
  })

  it('rejects duplicate registration and invalid input', async () => {
    const duplicate = await client.json<{ message: string }>('/auth/register', {
      ...post({ name: 'E2E User', email, password: 'a-strong-password' }),
    })
    expect(duplicate.status).toBe(409)

    const invalid = await client.json<{ message: string[] }>('/auth/register', {
      ...post({ name: '', email: 'nope', password: 'short' }),
    })
    expect(invalid.status).toBe(400)
  })

  it('rejects a wrong password and accepts the right one', async () => {
    const wrong = await client.json('/auth/login', {
      ...post({ email, password: 'not-the-password' }),
    })
    expect(wrong.status).toBe(401)

    const login = await client.json<AuthResponse>('/auth/login', {
      ...post({ email, password: 'a-strong-password' }),
    })
    expect(login.status).toBe(200)
  })

  it('blocks unauthenticated mailbox access', async () => {
    const anonymous = new ApiClient()
    const response = await anonymous.json('/accounts')
    expect(response.status).toBe(401)
  })

  it('rejects cross-origin state changes', async () => {
    const response = await client.json('/auth/login', {
      method: 'POST',
      headers: { origin: 'http://evil.example' },
      body: JSON.stringify({ email, password: 'a-strong-password' }),
    })
    expect(response.status).toBe(403)
  })

  it('logs out and invalidates the cookie', async () => {
    const logout = await client.json('/auth/logout', { method: 'POST' })
    expect(logout.status).toBe(204)
    const me = await client.json('/auth/me')
    expect(me.status).toBe(401)
  })
})

describe('user preferences', () => {
  const client = new ApiClient()

  beforeAll(async () => {
    const registered = await client.json<AuthResponse>('/auth/register', {
      ...post({
        name: 'Preference User',
        email: `prefs-${Date.now()}@example.com`,
        password: 'a-strong-password',
      }),
    })
    expect(registered.status).toBe(201)
  })

  it('returns the defaults for a new user', async () => {
    const response = await client.json<{
      refreshSeconds: number
      pageSize: number
      autoMarkRead: boolean
      loadRemoteImages: boolean
      desktopNotifications: boolean
      defaultView: string
      density: string
    }>('/preferences')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      refreshSeconds: 60,
      pageSize: 30,
      autoMarkRead: true,
      loadRemoteImages: false,
      desktopNotifications: false,
      defaultView: 'account',
      density: 'comfortable',
    })
  })

  it('persists partial updates', async () => {
    const updated = await client.json<{ refreshSeconds: number; density: string }>('/preferences', {
      method: 'PATCH',
      body: JSON.stringify({
        refreshSeconds: 15,
        pageSize: 50,
        autoMarkRead: false,
        loadRemoteImages: true,
        desktopNotifications: true,
        defaultView: 'unified',
        density: 'compact',
      }),
    })
    expect(updated.status).toBe(200)
    expect(updated.body.refreshSeconds).toBe(15)
    expect(updated.body.density).toBe('compact')

    const persisted = await client.json<{
      pageSize: number
      defaultView: string
      desktopNotifications: boolean
    }>('/preferences')
    expect(persisted.body.pageSize).toBe(50)
    expect(persisted.body.defaultView).toBe('unified')
    expect(persisted.body.desktopNotifications).toBe(true)
  })

  it('rejects out-of-range values and unauthenticated access', async () => {
    const invalid = await client.json('/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ refreshSeconds: 2, pageSize: 5, defaultView: 'nope' }),
    })
    expect(invalid.status).toBe(400)

    const anonymous = await new ApiClient().json('/preferences')
    expect(anonymous.status).toBe(401)
  })
})

describe('demo mailbox', () => {
  const client = new ApiClient()
  let account: AccountDto

  beforeAll(async () => {
    const login = await client.json<AuthResponse>('/auth/demo', { method: 'POST' })
    expect(login.status).toBe(200)
    expect(login.body.user.isDemo).toBe(true)

    const accounts = await client.json<AccountDto[]>('/accounts')
    account = accounts.body[0] as AccountDto
    expect(account.kind).toBe('demo')
  })

  it('lists folders and paginates messages', async () => {
    const folders = await client.json<MailboxDto[]>(`/accounts/${account.id}/mailboxes`)
    expect(folders.status).toBe(200)
    expect(folders.body.length).toBeGreaterThanOrEqual(6)
    const inbox = folders.body.find((item) => item.specialUse === '\\Inbox')
    expect(inbox?.unread).toBeGreaterThan(0)

    const page = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=INBOX&page=1&pageSize=5`,
    )
    expect(page.status).toBe(200)
    expect(page.body.messages).toHaveLength(5)
    expect(page.body.total).toBeGreaterThan(5)
  })

  it('paginates the unified inbox', async () => {
    const first = await client.json<UnifiedMessagePageDto>('/messages/unified?page=1&pageSize=3')
    expect(first.status).toBe(200)
    expect(first.body.messages).toHaveLength(3)
    expect(first.body.total).toBeGreaterThan(3)
    expect(first.body.messages.every((item) => Boolean(item.accountId))).toBe(true)

    const second = await client.json<UnifiedMessagePageDto>('/messages/unified?page=2&pageSize=3')
    expect(second.body.messages).toHaveLength(3)
    const firstKeys = new Set(first.body.messages.map((item) => `${item.accountId}:${item.uid}`))
    expect(
      second.body.messages.every((item) => !firstKeys.has(`${item.accountId}:${item.uid}`)),
    ).toBe(true)
  })

  it('reads a message, then marks it read and starred', async () => {
    const page = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=INBOX&page=1&pageSize=1`,
    )
    const message = page.body.messages[0]
    if (!message) throw new Error('demo inbox is empty')

    const detail = await client.json<{ subject: string; html: string | null }>(
      `/accounts/${account.id}/messages/${message.uid}?mailbox=INBOX`,
    )
    expect(detail.status).toBe(200)
    expect(detail.body.subject).toBe(message.subject)
    expect(typeof detail.body.html === 'string' || detail.body.html === null).toBe(true)

    const flags = await client.json(
      `/accounts/${account.id}/messages/${message.uid}/flags?mailbox=INBOX`,
      post({ seen: true, flagged: true }),
    )
    expect(flags.status).toBe(204)

    const updated = await client.json<{ unread: boolean; starred: boolean }>(
      `/accounts/${account.id}/messages/${message.uid}?mailbox=INBOX`,
    )
    expect(updated.body.unread).toBe(false)
    expect(updated.body.starred).toBe(true)
  })

  it('marks every message in a mailbox as read', async () => {
    const before = await client.json<MailboxDto[]>(`/accounts/${account.id}/mailboxes`)
    const inbox = before.body.find((item) => item.path === 'INBOX')
    expect(inbox?.unread).toBeGreaterThan(0)

    const marked = await client.json(
      `/accounts/${account.id}/mailboxes/read`,
      post({ mailbox: 'INBOX' }),
    )
    expect(marked.status).toBe(204)

    const after = await client.json<MailboxDto[]>(`/accounts/${account.id}/mailboxes`)
    expect(after.body.find((item) => item.path === 'INBOX')?.unread).toBe(0)

    const page = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=INBOX&page=1&pageSize=50`,
    )
    expect(page.body.messages.every((item) => !item.unread)).toBe(true)
  })

  it('applies bulk read, move and delete operations', async () => {
    const page = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=INBOX&page=1&pageSize=5`,
    )
    const uids = page.body.messages.slice(0, 3).map((item) => item.uid)
    expect(uids).toHaveLength(3)

    const flags = await client.json(
      `/accounts/${account.id}/messages/bulk/flags`,
      post({ mailbox: 'INBOX', uids, seen: false }),
    )
    expect(flags.status).toBe(204)

    const afterFlags = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=INBOX&page=1&pageSize=50`,
    )
    const changed = afterFlags.body.messages.filter((item) => uids.includes(item.uid))
    expect(changed).toHaveLength(3)
    expect(changed.every((item) => item.unread)).toBe(true)

    const moved = await client.json(
      `/accounts/${account.id}/messages/bulk/move`,
      post({ mailbox: 'INBOX', uids, destination: 'Archive' }),
    )
    expect(moved.status).toBe(204)

    const archive = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=Archive&page=1&pageSize=50`,
    )
    expect(archive.body.messages.filter((item) => uids.includes(item.uid))).toHaveLength(3)

    const deleted = await client.json<{ movedTo?: string }>(
      `/accounts/${account.id}/messages/bulk/delete`,
      post({ mailbox: 'Archive', uids }),
    )
    expect(deleted.status).toBe(200)
    expect(deleted.body.movedTo).toBe('Trash')
  })

  it('aggregates starred messages in the virtual starred mailbox', async () => {
    const page = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=INBOX&page=1&pageSize=50`,
    )
    const candidates = page.body.messages.filter((item) => !item.starred)
    const first = candidates[0]
    const second = candidates[1]
    if (!first || !second) throw new Error('demo inbox is too small')

    const setFlag = (uid: number, flagged: boolean) =>
      client.json(`/accounts/${account.id}/messages/${uid}/flags?mailbox=INBOX`, post({ flagged }))

    expect((await setFlag(first.uid, true)).status).toBe(204)
    expect((await setFlag(second.uid, true)).status).toBe(204)

    const starred = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=__starred__&page=1&pageSize=50`,
    )
    expect(starred.status).toBe(200)
    expect(starred.body.mailbox).toBe('__starred__')
    const firstHit = starred.body.messages.find((item) => item.uid === first.uid)
    expect(firstHit?.mailbox).toBe('INBOX')
    expect(firstHit?.starred).toBe(true)
    expect(starred.body.messages.every((item) => item.starred)).toBe(true)

    // Search inside the starred view keeps the flagged filter.
    const search = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=__starred__&page=1&pageSize=50&q=${encodeURIComponent(
        first.subject.slice(0, 4),
      )}`,
    )
    expect(search.status).toBe(200)
    expect(search.body.messages.every((item) => item.starred)).toBe(true)

    // Deleting a starred message moves it to Trash and drops it from the view.
    const deleted = await client.json<{ movedTo?: string }>(
      `/accounts/${account.id}/messages/${second.uid}?mailbox=INBOX`,
      { method: 'DELETE' },
    )
    expect(deleted.body.movedTo).toBe('Trash')
    const afterDelete = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=__starred__&page=1&pageSize=50`,
    )
    expect(afterDelete.body.messages.some((item) => item.uid === second.uid)).toBe(false)

    // Un-starring removes the message from the view as well.
    expect((await setFlag(first.uid, false)).status).toBe(204)
    const afterUnstar = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=__starred__&page=1&pageSize=50`,
    )
    expect(afterUnstar.body.messages.some((item) => item.uid === first.uid)).toBe(false)
  })

  it('searches messages and downloads an attachment', async () => {
    const search = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=INBOX&page=1&pageSize=20&q=${encodeURIComponent(
        '设计',
      )}`,
    )
    expect(search.status).toBe(200)
    expect(search.body.messages.length).toBeGreaterThan(0)

    const page = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=INBOX&page=1&pageSize=50`,
    )
    const invoice = page.body.messages.find((item) => item.subject.includes('账单'))
    expect(invoice).toBeDefined()

    const detail = await client.json<{
      attachments: { index: number; filename: string }[]
    }>(`/accounts/${account.id}/messages/${invoice?.uid}?mailbox=INBOX`)
    const attachment = detail.body.attachments[0]
    expect(attachment?.filename).toMatch(/\.pdf$/)

    const download = await client.request(
      `/accounts/${account.id}/messages/${invoice?.uid}/attachments/${attachment?.index}?mailbox=INBOX`,
    )
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toContain('application/pdf')
    expect(download.headers.get('content-disposition')).toContain('attachment')
    const bytes = await download.arrayBuffer()
    expect(bytes.byteLength).toBeGreaterThan(100)
  })

  it('sends mail with an attachment and files it in Sent', async () => {
    const form = new FormData()
    form.append('to', 'friend@example.com')
    form.append('subject', 'E2E test message')
    form.append('text', 'Hello from the e2e suite')
    form.append('attachments', new Blob(['attachment body'], { type: 'text/plain' }), 'note.txt')

    const sent = await client.json<{ messageId: string }>(`/accounts/${account.id}/send`, {
      method: 'POST',
      body: form,
    })
    expect(sent.status).toBe(200)
    expect(sent.body.messageId).toMatch(/@opensimplemail\.local>$/)

    const contacts = await client.json<ContactDto[]>('/contacts?q=friend')
    expect(contacts.status).toBe(200)
    expect(contacts.body[0]?.email).toBe('friend@example.com')

    const sentFolder = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=Sent&page=1&pageSize=5`,
    )
    const message = sentFolder.body.messages.find((item) => item.subject === 'E2E test message')
    expect(message).toBeDefined()
    expect(message?.hasAttachments).toBe(true)
  })

  it('moves a message to Archive and then to Trash', async () => {
    const page = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=INBOX&page=1&pageSize=1`,
    )
    const message = page.body.messages[0]
    if (!message) throw new Error('demo inbox is empty')

    const moved = await client.json(
      `/accounts/${account.id}/messages/${message.uid}/move`,
      post({ mailbox: 'INBOX', destination: 'Archive' }),
    )
    expect(moved.status).toBe(204)

    const archive = await client.json<MessagePageDto>(
      `/accounts/${account.id}/messages?mailbox=Archive&page=1&pageSize=50`,
    )
    expect(archive.body.messages.some((item) => item.uid === message.uid)).toBe(true)

    const deleted = await client.json<{ movedTo?: string }>(
      `/accounts/${account.id}/messages/${message.uid}?mailbox=Archive`,
      { method: 'DELETE' },
    )
    expect(deleted.status).toBe(200)
    expect(deleted.body.movedTo).toBe('Trash')
  })

  it('creates, updates and removes an IMAP account without connecting', async () => {
    const created = await client.json<AccountDto>('/accounts', {
      ...post({
        name: 'Test IMAP',
        email: 'imap-test@example.com',
        username: 'imap-test@example.com',
        password: 'app-password',
        imap: { host: 'imap.example.com', port: 993, secure: true },
        smtp: { host: 'smtp.example.com', port: 465, secure: true },
        signature: '— Yinx',
        skipTest: true,
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body.hasPassword).toBe(true)
    expect(created.body.signature).toBe('— Yinx')
    expect(JSON.stringify(created.body)).not.toContain('app-password')

    const updated = await client.json<AccountDto>(`/accounts/${created.body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Renamed IMAP',
        signature: '— Yinx\nSent from OpenSimpleMail',
      }),
    })
    expect(updated.status).toBe(200)
    expect(updated.body.name).toBe('Renamed IMAP')
    expect(updated.body.signature).toBe('— Yinx\nSent from OpenSimpleMail')

    const removed = await client.json(`/accounts/${created.body.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(204)

    const list = await client.json<AccountDto[]>('/accounts')
    expect(list.body.some((item) => item.id === created.body.id)).toBe(false)
  })
})
