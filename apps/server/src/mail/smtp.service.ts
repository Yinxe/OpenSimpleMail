import { Injectable } from '@nestjs/common'
import nodemailer, { type Transporter } from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type { MailCredentials, OutgoingMessage } from './mail.types'

export interface SentMail {
  messageId: string
  accepted: string[]
  raw: Buffer
}

@Injectable()
export class SmtpService {
  async verify(creds: MailCredentials): Promise<void> {
    const transport = this.createTransport(creds)
    try {
      await transport.verify()
    } finally {
      transport.close()
    }
  }

  async send(creds: MailCredentials, message: OutgoingMessage): Promise<SentMail> {
    const transport = this.createTransport(creds)
    try {
      const composer = new MailComposer({
        from: { name: creds.name, address: creds.email },
        to: message.to,
        cc: message.cc || undefined,
        bcc: message.bcc || undefined,
        subject: message.subject,
        text: message.text || undefined,
        html: message.html || undefined,
        inReplyTo: message.inReplyTo || undefined,
        references: message.references?.length ? message.references : undefined,
        // `path` makes nodemailer stream each file while it composes the
        // message, so the uploads are never copied into the heap.
        attachments: message.attachments.map((attachment) => ({
          filename: attachment.filename,
          path: attachment.path,
          contentType: attachment.contentType,
        })),
      })
      const raw = await composer.compile().build()
      const recipients = [message.to, message.cc, message.bcc].filter(Boolean).join(', ')
      const info = await transport.sendMail({
        envelope: { from: creds.email, to: recipients },
        raw,
      })
      return {
        messageId: info.messageId,
        accepted: (info.accepted ?? []).map(String),
        raw,
      }
    } finally {
      transport.close()
    }
  }

  private createTransport(creds: MailCredentials): Transporter {
    return nodemailer.createTransport({
      host: creds.smtp.host,
      port: creds.smtp.port,
      secure: creds.smtp.secure,
      auth: { user: creds.username, pass: creds.password },
      connectionTimeout: 20_000,
      greetingTimeout: 12_000,
      socketTimeout: 90_000,
      tls: { servername: creds.smtp.host },
    })
  }
}
