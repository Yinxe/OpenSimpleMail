import { describe, expect, it } from 'vitest'
import { sanitizeEmailHtml } from './message-sanitizer'

describe('sanitizeEmailHtml', () => {
  it('removes scripts, event handlers and javascript: links', () => {
    const html = `
      <div onclick="steal()">hello</div>
      <script>alert(1)</script>
      <a href="javascript:alert(1)">click</a>
      <img src="x" onerror="alert(1)">
    `
    const clean = sanitizeEmailHtml(html, new Map())
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('javascript:')
    expect(clean).toContain('hello')
  })

  it('keeps layout styles and rewrites links to a new tab', () => {
    const clean = sanitizeEmailHtml(
      '<p style="color:#333"><a href="https://example.com">Example</a></p>',
      new Map(),
    )
    expect(clean).toContain('style="color:#333"')
    expect(clean).toContain('target="_blank"')
    expect(clean).toContain('rel="noopener noreferrer nofollow"')
  })

  it('inlines cid images when a data URI is available', () => {
    const images = new Map([['logo', 'data:image/png;base64,AAAA']])
    const clean = sanitizeEmailHtml('<img src="cid:logo" alt="logo">', images)
    expect(clean).toContain('data:image/png;base64,AAAA')
    expect(clean).not.toContain('cid:logo')
  })

  it('rejects data: links and meta refresh', () => {
    const clean = sanitizeEmailHtml(
      '<a href="data:text/html,<script>alert(1)</script>">x</a><meta http-equiv="refresh" content="0;url=https://evil.example">',
      new Map(),
    )
    expect(clean).not.toContain('data:text/html')
    expect(clean).not.toContain('http-equiv')
  })

  it('drops disallowed tags such as iframes and forms', () => {
    const clean = sanitizeEmailHtml(
      '<iframe src="https://evil.example"></iframe><form action="/x"><input></form><p>ok</p>',
      new Map(),
    )
    expect(clean).not.toContain('iframe')
    expect(clean).not.toContain('form')
    expect(clean).toContain('ok')
  })
})
