import { ImapFlow } from 'imapflow'
import type { MailCredentials } from './mail.types'

export interface ImapClientOptions {
  /** Opens a throwaway connection that never enters the pool (credential checks). */
  verifyOnly?: boolean
  /**
   * Let ImapFlow start IDLE whenever the connection is otherwise idle. The pool
   * keeps this off because it issues commands on the same socket; the new-mail
   * watcher keeps it on so the server pushes EXISTS instead of us polling.
   */
  autoIdle?: boolean
}

export function createImapClient(
  creds: MailCredentials,
  options: ImapClientOptions = {},
): ImapFlow {
  const { verifyOnly = false, autoIdle = false } = options
  return new ImapFlow({
    host: creds.imap.host,
    port: creds.imap.port,
    secure: creds.imap.secure,
    auth: { user: creds.username, pass: creds.password },
    logger: false,
    clientInfo: { name: 'OpenSimpleMail', version: '0.1.0', vendor: 'OpenSimpleMail' },
    disableAutoIdle: !autoIdle,
    // QQ Mail / 163 are known to drop connections when COMPRESS, ENABLE or
    // BINARY extensions are negotiated. None of them are required by this app.
    disableCompression: true,
    disableAutoEnable: true,
    disableBinary: true,
    verifyOnly,
    connectionTimeout: 20_000,
    greetingTimeout: 12_000,
    // Keep the socket alive longer than the 5-minute pool idle close; a shorter
    // timeout would tear down healthy idle connections (and used to crash Node).
    socketTimeout: 10 * 60 * 1000,
    tls: { servername: creds.imap.host },
  })
}
