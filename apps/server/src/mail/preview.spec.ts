import { describe, expect, it } from 'vitest'
import { previewFromSource } from './preview'

function source(headers: string, body: string): Buffer {
  return Buffer.from(`${headers}\r\n\r\n${body}`, 'utf8')
}

describe('previewFromSource', () => {
  it('reads a plain text body', () => {
    const buffer = source('Content-Type: text/plain; charset=utf-8', 'Hello   world\r\nsecond line')
    expect(previewFromSource(buffer)).toBe('Hello world second line')
  })

  it('decodes quoted-printable', () => {
    const buffer = source(
      'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable',
      'Hello=20world=0A=0Dsecond',
    )
    expect(previewFromSource(buffer)).toBe('Hello world second')
  })

  it('decodes base64', () => {
    const buffer = source(
      'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64',
      Buffer.from('Hello world', 'utf8').toString('base64'),
    )
    expect(previewFromSource(buffer)).toBe('Hello world')
  })

  it('picks the text part of multipart/alternative and strips HTML', () => {
    const body = [
      '--abc',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Plain preview',
      '--abc',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>HTML preview</p>',
      '--abc--',
    ].join('\r\n')
    const buffer = source('Content-Type: multipart/alternative; boundary="abc"', body)
    expect(previewFromSource(buffer)).toBe('Plain preview')
  })

  it('strips tags when only HTML is available', () => {
    const buffer = source(
      'Content-Type: text/html; charset=utf-8',
      '<style>p{color:red}</style><p>Hello&nbsp;<strong>world</strong></p>',
    )
    expect(previewFromSource(buffer)).toBe('Hello world')
  })

  it('returns an empty preview when the headers are truncated', () => {
    expect(previewFromSource(Buffer.from('Content-Type: text/plain'))).toBe('')
  })
})
