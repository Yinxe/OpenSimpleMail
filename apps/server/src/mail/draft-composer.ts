import MailComposer from 'nodemailer/lib/mail-composer'
import type { DraftPayload, MailCredentials } from './mail.types'

/**
 * Compile a draft into a raw MIME message for `APPEND` to the Drafts folder.
 * Attachments are deliberately not part of a draft: the browser keeps them out
 * of local drafts too, so a server copy never silently loses them.
 */
export function compileDraft(creds: MailCredentials, draft: DraftPayload): Promise<Buffer> {
  const composer = new MailComposer({
    from: { name: creds.name, address: creds.email },
    to: draft.to || undefined,
    cc: draft.cc || undefined,
    bcc: draft.bcc || undefined,
    subject: draft.subject,
    text: draft.text || undefined,
    html: draft.html || undefined,
    inReplyTo: draft.inReplyTo || undefined,
    references: draft.references?.length ? draft.references : undefined,
  })
  return composer.compile().build()
}
