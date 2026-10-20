import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  'html',
  'head',
  'body',
  'style',
  'link',
  'center',
  'font',
  'img',
  'hr',
  'u',
  's',
  'span',
  'div',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'colgroup',
  'col',
  'caption',
  'blockquote',
  'pre',
  'code',
  'figure',
  'figcaption',
  'picture',
  'source',
  'video',
  'audio',
]

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  '*': [
    'style',
    'class',
    'title',
    'dir',
    'lang',
    'align',
    'valign',
    'width',
    'height',
    'bgcolor',
    'border',
    'cellpadding',
    'cellspacing',
    'role',
    'colspan',
    'rowspan',
  ],
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'title', 'border'],
  font: ['color', 'face', 'size'],
  table: ['width', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'align'],
  td: ['width', 'height', 'bgcolor', 'align', 'valign', 'colspan', 'rowspan'],
  th: ['width', 'height', 'bgcolor', 'align', 'valign', 'colspan', 'rowspan'],
}

const CID_PATTERN = /cid:([^"'\s<>)]+)/gi

/**
 * Email HTML is untrusted. Scripts, event handlers and dangerous URLs are removed
 * here; the reader additionally renders it in a sandboxed iframe with a strict CSP.
 */
export function sanitizeEmailHtml(html: string, inlineImages: Map<string, string>): string {
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'cid'],
    allowedSchemesByTag: { img: ['http', 'https', 'cid', 'data'] },
    allowProtocolRelative: false,
    // Emails need <style> for layout. The reader renders them in a sandboxed
    // iframe with `default-src 'none'`, so CSS cannot load remote resources.
    allowVulnerableTags: true,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
    },
  })

  if (inlineImages.size === 0) return clean
  return clean.replace(CID_PATTERN, (match, rawCid: string) => {
    const cid = decodeURIComponent(rawCid)
    return inlineImages.get(cid) ?? inlineImages.get(cid.replace(/^<|>$/g, '')) ?? match
  })
}
