import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { MessageTooLargeError, parseMessage } from './message-parser'

const directories: string[] = []

async function scratchDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'osm-parser-'))
  directories.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function wrapBase64(value: Buffer): string {
  return (value.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

function buildMessage(options: {
  attachment?: { filename: string; contentType: string; content: Buffer }
  inlineImage?: { cid: string; content: Buffer }
}): Buffer {
  const lines: string[] = [
    'From: Alice <alice@example.com>',
    'To: Bob <bob@example.com>',
    'Subject: Parser fixture',
    'Date: Tue, 20 Oct 2026 10:00:00 +0000',
    'Message-ID: <fixture@example.com>',
    'MIME-Version: 1.0',
  ]

  if (options.inlineImage) {
    const image = options.inlineImage
    lines.push(
      'Content-Type: multipart/related; boundary="rel"',
      '',
      '--rel',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>logo: <img src="cid:logo"></p>',
      '--rel',
      'Content-Type: image/png',
      'Content-ID: <logo>',
      'Content-Disposition: inline; filename="logo.png"',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(image.content),
      '--rel--',
    )
  } else if (options.attachment) {
    const attachment = options.attachment
    lines.push(
      'Content-Type: multipart/mixed; boundary="mix"',
      '',
      '--mix',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Hello body',
      '--mix',
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(attachment.content),
      '--mix--',
    )
  } else {
    lines.push('Content-Type: text/plain; charset=utf-8', '', 'Hello body')
  }

  return Buffer.from(`${lines.join('\r\n')}\r\n`)
}

describe('parseMessage', () => {
  it('extracts attachments to disk instead of keeping them in memory', async () => {
    const content = Buffer.alloc(2 * 1024 * 1024, 7)
    const dir = await scratchDir()
    const parsed = await parseMessage(
      Readable.from([
        buildMessage({
          attachment: { filename: 'invoice.pdf', contentType: 'application/pdf', content },
        }),
      ]),
      { dir },
    )

    expect(parsed.subject).toBe('Parser fixture')
    expect(parsed.text?.trim()).toBe('Hello body')
    expect(parsed.attachments).toHaveLength(1)

    const attachment = parsed.attachments[0]
    expect(attachment?.filename).toBe('invoice.pdf')
    expect(attachment?.contentType).toBe('application/pdf')
    expect(attachment?.size).toBe(content.byteLength)
    expect(attachment?.path).toBeTruthy()
    const written = await readFile(attachment?.path as string)
    expect(written.byteLength).toBe(content.byteLength)
    expect(written.equals(content)).toBe(true)
  })

  it('keeps cid links in the html and reports inline images', async () => {
    const dir = await scratchDir()
    const parsed = await parseMessage(
      Readable.from([
        buildMessage({
          inlineImage: { cid: 'logo', content: Buffer.from('fake-png-bytes') },
        }),
      ]),
      { dir },
    )

    expect(parsed.html).toContain('cid:logo')
    expect(parsed.attachments[0]?.cid).toBe('logo')
    expect(parsed.attachments[0]?.contentType).toBe('image/png')
  })

  it('rejects a message above the byte budget', async () => {
    const dir = await scratchDir()
    const source = Readable.from([
      buildMessage({
        attachment: {
          filename: 'big.bin',
          contentType: 'application/octet-stream',
          content: Buffer.alloc(64 * 1024, 1),
        },
      }),
    ])

    await expect(parseMessage(source, { dir, maxBytes: 1024 })).rejects.toBeInstanceOf(
      MessageTooLargeError,
    )
  })
})
