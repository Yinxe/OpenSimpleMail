import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { type Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { type AddressObject, type AttachmentStream, MailParser } from 'mailparser'

/** Raised when the raw message exceeds the configured download budget. */
export class MessageTooLargeError extends Error {
  readonly code = 'MESSAGE_TOO_LARGE'

  constructor() {
    super('message too large')
    this.name = 'MessageTooLargeError'
  }
}

export interface ParsedAttachment {
  filename: string | null
  contentType: string
  /** Decoded size in bytes. */
  size: number
  cid: string | null
  related: boolean
  /** Absolute path of the extracted bytes, or null when the file could not be written. */
  path: string | null
}

export interface ParsedMessage {
  subject?: string
  from?: AddressObject[]
  to?: AddressObject[]
  cc?: AddressObject[]
  bcc?: AddressObject[]
  replyTo?: AddressObject[]
  date?: Date
  messageId?: string
  inReplyTo?: string
  references?: string[]
  text?: string
  html?: string
  attachments: ParsedAttachment[]
  /** Directory holding the extracted attachments. */
  dir: string
}

export interface ParseMessageOptions {
  /** Directory that receives one file per attachment. */
  dir: string
  /** Hard cap for the raw message; exceeding it rejects with MessageTooLargeError. */
  maxBytes?: number
}

/**
 * Parses a raw message from a stream. Attachment bodies are written to disk as
 * they arrive instead of being collected into buffers, so memory stays flat
 * no matter how large the attachments are.
 */
export async function parseMessage(
  source: Readable,
  options: ParseMessageOptions,
): Promise<ParsedMessage> {
  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY
  await mkdir(options.dir, { recursive: true })

  const parser = new MailParser()
  const attachments: ParsedAttachment[] = []
  const writes: Promise<void>[] = []

  const finished = new Promise<void>((resolve, reject) => {
    parser.once('end', () => resolve())
    parser.once('error', reject)
  })

  parser.on('data', (data: { type: string } & Partial<AttachmentStream>) => {
    if (data.type !== 'attachment' || !data.content) return
    const attachmentStream = data as AttachmentStream
    const index = attachments.length
    const path = join(options.dir, `${index}.bin`)
    const attachment: ParsedAttachment = {
      filename: attachmentStream.filename ?? null,
      contentType: attachmentStream.contentType || 'application/octet-stream',
      size: 0,
      cid: attachmentStream.cid ?? null,
      related: attachmentStream.related === true,
      path,
    }
    attachments.push(attachment)

    let bytes = 0
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length
        callback(null, chunk)
      },
    })

    const write = pipeline(attachmentStream.content, counter, createWriteStream(path))
      .then(() => {
        attachment.size = bytes
      })
      .catch((error: unknown) => {
        attachment.path = null
        // The parser is waiting for this attachment to be consumed; without
        // destroying it the whole parse would hang on a broken disk write.
        parser.destroy(error instanceof Error ? error : new Error(String(error)))
        throw error
      })
    writes.push(write)

    // Let the parser continue once the attachment stream has been drained.
    attachmentStream.content.once('end', () => attachmentStream.release?.())
  })

  let received = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      if (received > maxBytes) {
        callback(new MessageTooLargeError())
        return
      }
      callback(null, chunk)
    },
  })

  source.once('error', (error) => parser.destroy(error))
  // Errors surface through the parser events and the attachment writes below.
  void pipeline(source, limiter, parser).catch(() => undefined)

  await finished
  await Promise.all(writes)

  const headers = parser.headers instanceof Map ? parser.headers : new Map()
  const text = parser.text === false ? undefined : parser.text
  const html = parser.html === false ? undefined : parser.html

  return {
    dir: options.dir,
    subject: asString(headers.get('subject')),
    from: asAddresses(headers.get('from')),
    to: asAddresses(headers.get('to')),
    cc: asAddresses(headers.get('cc')),
    bcc: asAddresses(headers.get('bcc')),
    replyTo: asAddresses(headers.get('reply-to')),
    date: headers.get('date') instanceof Date ? (headers.get('date') as Date) : undefined,
    messageId: asString(headers.get('message-id')),
    inReplyTo: asString(headers.get('in-reply-to')),
    references: asStringList(headers.get('references')),
    text,
    html,
    attachments,
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

function asStringList(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return undefined
}

function asAddresses(value: unknown): AddressObject[] | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return value.filter(isAddressObject)
  return isAddressObject(value) ? [value] : undefined
}

function isAddressObject(value: unknown): value is AddressObject {
  if (!value || typeof value !== 'object') return false
  return Array.isArray((value as AddressObject).value)
}
