/**
 * Converts sanitized message HTML into a small, render-friendly document model.
 *
 * The full render mode keeps the original layout inside an iframe. The simple
 * mode uses these blocks instead: it drops styling, tables and images while
 * keeping the reading order, links and enough structure for long newsletters.
 */

export interface ContentLink {
  type: 'link'
  text: string
  href: string
}

export type ContentInline = string | ContentLink

export type ContentBlockKind = 'paragraph' | 'heading' | 'quote' | 'list-item' | 'divider'

export interface ContentBlock {
  kind: ContentBlockKind
  inlines: ContentInline[]
}

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'CENTER',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'HEADER',
  'MAIN',
  'NAV',
  'P',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'UL',
  'OL',
])

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

const SKIP_TAGS = new Set([
  'AUDIO',
  'CANVAS',
  'EMBED',
  'HEAD',
  'IFRAME',
  'IMG',
  'INPUT',
  'NOSCRIPT',
  'OBJECT',
  'SCRIPT',
  'SELECT',
  'STYLE',
  'SVG',
  'TEXTAREA',
  'TITLE',
  'VIDEO',
])

interface ParseContext {
  blocks: ContentBlock[]
  current: ContentInline[]
  kind: ContentBlockKind
  quoteDepth: number
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ')
}

function isHidden(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true
  if (element.getAttribute('aria-hidden') === 'true') return true
  const style = element.getAttribute('style')?.toLowerCase() ?? ''
  return /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/.test(style)
}

function safeHref(value: string | null): string | null {
  if (!value) return null
  const href = value.trim()
  if (!href || href.startsWith('#')) return null
  return /^(https?:|mailto:)/i.test(href) ? href : null
}

function pushText(inlines: ContentInline[], value: string): void {
  if (!value) return
  const last = inlines[inlines.length - 1]
  if (typeof last === 'string') {
    inlines[inlines.length - 1] = (last + value).replace(/ {2,}/g, ' ')
    return
  }
  inlines.push(value)
}

function trimInlines(inlines: ContentInline[]): ContentInline[] {
  const result: ContentInline[] = []
  for (const inline of inlines) {
    if (typeof inline === 'string') {
      const text = inline.replace(/[ \t]+/g, ' ')
      if (!text) continue
      if (result.length === 0) {
        const leadingTrimmed = text.replace(/^\s+/, '')
        if (!leadingTrimmed) continue
        pushText(result, leadingTrimmed)
      } else {
        pushText(result, text)
      }
      continue
    }
    const text = inline.text.trim()
    if (!text) continue
    result.push({ ...inline, text })
  }

  const last = result[result.length - 1]
  if (typeof last === 'string') result[result.length - 1] = last.replace(/\s+$/, '')
  return result.filter((inline) => (typeof inline === 'string' ? inline.length > 0 : true))
}

function collectText(element: Element): string {
  let result = ''
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? ''
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const child = node as Element
    if (child.tagName === 'BR') {
      result += ' '
      continue
    }
    if (SKIP_TAGS.has(child.tagName) || isHidden(child)) continue
    result += collectText(child)
  }
  return normalizeText(result)
}

function pushAnchor(anchor: Element, out: ContentInline[]): void {
  const href = safeHref(anchor.getAttribute('href'))
  const text = collectText(anchor).trim()
  if (href && text) out.push({ type: 'link', text, href })
  else if (text) pushText(out, text)
}

function collectInline(element: Element, out: ContentInline[]): void {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(out, normalizeText(node.textContent ?? ''))
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue

    const child = node as Element
    if (SKIP_TAGS.has(child.tagName) || isHidden(child)) continue

    if (child.tagName === 'BR') {
      pushText(out, '\n')
      continue
    }

    if (child.tagName === 'A') {
      pushAnchor(child, out)
      continue
    }

    if (child.tagName === 'HR') continue
    collectInline(child, out)
  }
}

function collectRow(row: Element): ContentInline[] {
  const out: ContentInline[] = []
  const cells = Array.from(row.children).filter(
    (cell) => cell.tagName === 'TD' || cell.tagName === 'TH',
  )
  cells.forEach((cell, index) => {
    if (index > 0) pushText(out, ' · ')
    collectInline(cell, out)
  })
  return trimInlines(out)
}

function hasBlockContent(element: Element): boolean {
  return Boolean(
    element.querySelector(
      'table, p, div, section, article, ul, ol, blockquote, h1, h2, h3, h4, h5, h6',
    ),
  )
}

function flush(context: ParseContext, kind?: ContentBlockKind): void {
  const inlines = trimInlines(context.current)
  if (inlines.length > 0) {
    const resolved = kind ?? (context.quoteDepth > 0 ? 'quote' : context.kind)
    context.blocks.push({ kind: resolved, inlines })
  }
  context.current = []
  context.kind = 'paragraph'
}

function walkChildren(element: Element, context: ParseContext): void {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(context.current, normalizeText(node.textContent ?? ''))
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue

    const child = node as Element
    const tag = child.tagName
    if (SKIP_TAGS.has(tag) || isHidden(child)) continue

    if (tag === 'BR') {
      pushText(context.current, '\n')
      continue
    }

    if (tag === 'HR') {
      flush(context)
      context.blocks.push({ kind: 'divider', inlines: [] })
      continue
    }

    if (tag === 'A') {
      pushAnchor(child, context.current)
      continue
    }

    if (HEADING_TAGS.has(tag)) {
      flush(context)
      walkChildren(child, context)
      flush(context, 'heading')
      continue
    }

    if (tag === 'LI') {
      flush(context)
      walkChildren(child, context)
      flush(context, 'list-item')
      continue
    }

    if (tag === 'BLOCKQUOTE') {
      flush(context)
      context.quoteDepth += 1
      walkChildren(child, context)
      flush(context, 'quote')
      context.quoteDepth -= 1
      continue
    }

    if (tag === 'TR') {
      flush(context)
      if (hasBlockContent(child)) {
        walkChildren(child, context)
        flush(context)
      } else {
        const row = collectRow(child)
        if (row.length > 0) context.blocks.push({ kind: 'paragraph', inlines: row })
      }
      continue
    }

    if (BLOCK_TAGS.has(tag)) {
      flush(context)
      walkChildren(child, context)
      flush(context)
      continue
    }

    collectInline(child, context.current)
  }
}

function blockToText(block: ContentBlock): string {
  const text = block.inlines
    .map((inline) => (typeof inline === 'string' ? inline : inline.text))
    .join('')
  return text.replace(/[ \t]+/g, ' ').trim()
}

export function textToBlocks(text: string | null | undefined): ContentBlock[] {
  if (!text?.trim()) return []
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((chunk) => ({
      kind: 'paragraph' as const,
      inlines: [chunk.replace(/[ \t]+\n/g, '\n').trim()],
    }))
    .filter((block) => block.inlines[0])
}

export function htmlToBlocks(html: string | null | undefined): ContentBlock[] {
  if (!html?.trim()) return []
  if (typeof DOMParser === 'undefined') {
    return textToBlocks(html.replace(/<[^>]+>/g, ' '))
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const context: ParseContext = { blocks: [], current: [], kind: 'paragraph', quoteDepth: 0 }
  walkChildren(doc.body, context)
  flush(context)
  return context.blocks
}

export function messageToBlocks(message: {
  html: string | null
  text: string | null
}): ContentBlock[] {
  const fromHtml = htmlToBlocks(message.html)
  if (fromHtml.length > 0) return fromHtml
  return textToBlocks(message.text)
}

export function htmlToPlainText(html: string | null | undefined): string {
  return htmlToBlocks(html).map(blockToText).filter(Boolean).join('\n\n')
}
