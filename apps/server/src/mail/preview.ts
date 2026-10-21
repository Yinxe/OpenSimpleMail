/**
 * Best-effort preview text from a partial RFC 5322 source.
 *
 * List fetches ask IMAP for the first few kilobytes of each message, which is
 * enough to read the top-level headers and the beginning of the first text
 * part. Anything truncated, binary or unexpected simply yields no preview.
 */

interface MessagePart {
  headers: string
  body: string
}

function splitHeaders(text: string): MessagePart | null {
  const crlf = text.indexOf('\r\n\r\n')
  if (crlf >= 0) return { headers: text.slice(0, crlf), body: text.slice(crlf + 4) }
  const lf = text.indexOf('\n\n')
  if (lf >= 0) return { headers: text.slice(0, lf), body: text.slice(lf + 2) }
  return null
}

function headerValue(headers: string, name: string): string | undefined {
  const match = headers.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'))
  return match?.[1]?.trim()
}

function boundaryOf(headers: string): string | null {
  const contentType = headerValue(headers, 'content-type') ?? ''
  return /boundary="?([^";]+)"?/i.exec(contentType)?.[1] ?? null
}

function findTextPart(headers: string, body: string, depth = 0): MessagePart | null {
  const contentType = headerValue(headers, 'content-type') ?? 'text/plain'
  if (/^multipart\//i.test(contentType)) {
    const boundary = boundaryOf(headers)
    if (!boundary || depth > 2) return null
    for (const chunk of body.split(`--${boundary}`)) {
      const part = splitHeaders(chunk.replace(/^\r?\n/, ''))
      if (!part) continue
      const found = findTextPart(part.headers, part.body, depth + 1)
      if (found) return found
    }
    return null
  }

  const disposition = headerValue(headers, 'content-disposition') ?? ''
  if (!/^text\//i.test(contentType) || /attachment/i.test(disposition)) return null
  return { headers, body }
}

function decodeQuotedPrintable(value: string): Buffer {
  const withoutSoftBreaks = value.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let index = 0; index < withoutSoftBreaks.length; index += 1) {
    const char = withoutSoftBreaks[index] as string
    if (char === '=' && /^[0-9a-f]{2}$/i.test(withoutSoftBreaks.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(withoutSoftBreaks.slice(index + 1, index + 3), 16))
      index += 2
    } else {
      bytes.push(char.charCodeAt(0) & 0xff)
    }
  }
  return Buffer.from(bytes)
}

function decodeBuffer(buffer: Buffer, charset: string | undefined): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer)
  } catch {
    return buffer.toString('utf8')
  }
}

function decodeText(part: MessagePart): string {
  const encoding = headerValue(part.headers, 'content-transfer-encoding')?.toLowerCase()
  const charset = /charset="?([^";\s]+)/i.exec(headerValue(part.headers, 'content-type') ?? '')?.[1]

  if (encoding === 'base64') {
    return decodeBuffer(Buffer.from(part.body.replace(/\s+/g, ''), 'base64'), charset)
  }
  if (encoding === 'quoted-printable') {
    return decodeBuffer(decodeQuotedPrintable(part.body), charset)
  }
  return part.body
}

function cleanText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

export function previewFromSource(source: Buffer): string {
  if (source.length === 0) return ''
  const top = splitHeaders(source.toString('utf8'))
  if (!top) return ''
  const part = findTextPart(top.headers, top.body)
  if (!part) return ''
  return cleanText(decodeText(part))
}
