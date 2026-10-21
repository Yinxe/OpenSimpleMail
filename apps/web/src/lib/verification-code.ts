/**
 * Heuristic verification-code extraction for webmail messages.
 *
 * The extractor works on plain text (the caller supplies the visible text of
 * the HTML part). It only accepts a code when a verification keyword sits near
 * it, which keeps invoice numbers, tracking numbers and promo codes out.
 */

export type VerificationSource = 'subject' | 'body'

export interface VerificationCandidate {
  code: string
  score: number
  keyword: string
  context: string
  source: VerificationSource
}

/** Structured expiry so the reader can render it in the active language. */
export type VerificationExpiry =
  | { kind: 'duration'; amount: number; unit: 'minutes' | 'hours' }
  | { kind: 'time'; time: string }

export interface VerificationResult {
  code: string | null
  candidates: VerificationCandidate[]
  context: string | null
  expiry: VerificationExpiry | null
  source: VerificationSource | null
}

interface KeywordMatch {
  index: number
  end: number
  weight: number
  label: string
}

interface CandidateSeed {
  code: string
  raw: string
  start: number
  end: number
  source: VerificationSource
  text: string
}

const KEYWORDS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  {
    pattern: /(?:短信|邮箱|登录|安全|动态|手机|验证)?验证码/g,
    weight: 10,
    label: '验证码',
  },
  {
    pattern:
      /校验码|验证代码|确认码|确认代码|动态码|动态密码|一次性密码|临时密码|授权码|登录码|登录代码|安全代码/g,
    weight: 9,
    label: '校验码',
  },
  {
    pattern:
      /verification\s+code|security\s+code|one[-\s]?time\s+(?:code|password)|confirmation\s+code|login\s+code|authentication\s+code|two[-\s]?factor|2FA/gi,
    weight: 10,
    label: 'verification code',
  },
  { pattern: /\bOTP\b/gi, weight: 9, label: 'OTP' },
  { pattern: /\bpasscode\b/gi, weight: 9, label: 'passcode' },
  { pattern: /\bcode\s*(?:is|:|=|：)/gi, weight: 7, label: 'code' },
  { pattern: /\bcode\b/gi, weight: 3, label: 'code' },
]

const NEGATIVE_CONTEXT =
  /订单|发票|金额|价格|运费|邮编|电话|手机号|身份证|快递|物流|优惠|折扣|促销|优惠券|兑换券|积分|邀请|推广|工单|预订|预约|\b(?:order|invoice|amount|price|zip|phone|telephone|tracking|shipment|coupon|promo|discount|voucher|gift|referral|invite|invitation|ticket|reservation|booking)\b/i

const TECH_CONTEXT = /版本|version|release|build|issue|pull request|commit|pr\s*#/i

const EXPIRY_PATTERNS: Array<{
  pattern: RegExp
  absolute?: boolean
}> = [
  {
    pattern:
      /(?:有效期(?:为)?|有效|expires?\s+in|valid\s+for)\s*(\d{1,3})\s*(分钟|分|小时|minutes?|mins?|hours?)/i,
  },
  {
    pattern: /(\d{1,3})\s*(分钟|分|小时|minutes?|mins?|hours?)\s*(?:内|后)?\s*(?:有效|失效|过期)/i,
  },
  {
    pattern: /(?:有效期至|expires?\s+at|valid\s+until)\s*([0-2]?\d[:：][0-5]\d)/i,
    absolute: true,
  },
]

function normalizeInput(value: string): string {
  return value
    .replace(/[\uFF10-\uFF19]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[\uFF21-\uFF3A\uFF41-\uFF5A]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
}

function findKeywordMatches(text: string): KeywordMatch[] {
  const matches: KeywordMatch[] = []
  for (const keyword of KEYWORDS) {
    const pattern = new RegExp(
      keyword.pattern.source,
      keyword.pattern.flags.includes('g') ? keyword.pattern.flags : `${keyword.pattern.flags}g`,
    )
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0
      matches.push({
        index,
        end: index + match[0].length,
        weight: keyword.weight,
        label: keyword.label,
      })
    }
  }
  return matches.sort((left, right) => left.index - right.index || right.weight - left.weight)
}

function nearestKeyword(
  matches: KeywordMatch[],
  start: number,
  end: number,
): { match: KeywordMatch; distance: number } | null {
  let best: { match: KeywordMatch; distance: number } | null = null
  for (const match of matches) {
    const distance =
      match.end <= start ? start - match.end : match.index >= end ? match.index - end : 0
    if (distance > 80) continue
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && match.weight > best.match.weight)
    ) {
      best = { match, distance }
    }
  }
  return best
}

function contextAround(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEnd = text.indexOf('\n', end)
  let from = lineStart
  let to = lineEnd === -1 ? text.length : lineEnd

  // Include the closest non-empty line before the code, skipping blank lines.
  let previousEnd = lineStart - 1
  for (let step = 0; step < 3 && previousEnd > 0; step += 1) {
    const previousStart = text.lastIndexOf('\n', previousEnd - 1) + 1
    const previousLine = text.slice(previousStart, previousEnd).trim()
    if (previousLine) {
      if (previousLine.length <= 80) from = previousStart
      break
    }
    previousEnd = previousStart - 1
  }

  // Do the same for the closest non-empty line after the code.
  let nextLineEnd = lineEnd
  for (let step = 0; step < 3 && nextLineEnd !== -1; step += 1) {
    const nextStart = nextLineEnd + 1
    const nextEnd = text.indexOf('\n', nextStart)
    const nextLine = text.slice(nextStart, nextEnd === -1 ? text.length : nextEnd).trim()
    if (nextLine) {
      if (nextLine.length <= 80) to = nextEnd === -1 ? text.length : nextEnd
      break
    }
    nextLineEnd = nextEnd
  }

  if (to - from > 180) {
    from = Math.max(from, start - 60)
    to = Math.min(to, end + 60)
  }

  let snippet = text.slice(from, to).replace(/\s+/g, ' ').trim()
  if (!snippet) {
    const fallbackFrom = Math.max(0, start - 50)
    const fallbackTo = Math.min(text.length, end + 50)
    snippet = text.slice(fallbackFrom, fallbackTo).replace(/\s+/g, ' ').trim()
  }
  return `${from > 0 ? '…' : ''}${snippet}${to < text.length ? '…' : ''}`.slice(0, 180)
}

function isStandaloneLine(text: string, start: number, end: number): boolean {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEnd = text.indexOf('\n', end)
  const before = text.slice(lineStart, start)
  const after = text.slice(end, lineEnd === -1 ? text.length : lineEnd)
  return before.trim() === '' && after.trim() === ''
}

function isSalutation(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 12), start)
  const after = text.slice(end, Math.min(text.length, end + 12))
  if (/(?:亲爱的|尊敬的|\b(?:dear|hi|hello))\s*$/i.test(before)) return true
  return (
    /^\s*(?:，|,)?\s*(?:您好|你好)/.test(after) ||
    /^\s*(?:，|,)?\s*(?:hi|hello|dear)\b/i.test(after)
  )
}

function maxLetterRun(value: string): number {
  let longest = 0
  let current = 0
  for (const char of value) {
    if (/[A-Z]/i.test(char)) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }
  return longest
}

function collectSeeds(text: string, source: VerificationSource): CandidateSeed[] {
  const seeds: CandidateSeed[] = []
  const seen = new Set<string>()

  const add = (raw: string, start: number, end: number) => {
    const code = raw.replace(/[ -]/g, '')
    if (code.length < 4 || code.length > 8) return
    if (!/^[A-Za-z0-9]+$/.test(code)) return
    if (!/\d/.test(code)) return
    if (/^[A-Za-z]+$/.test(code)) return
    if (seen.has(`${start}:${end}`)) return
    seen.add(`${start}:${end}`)
    seeds.push({ code, raw, start, end, source, text })
  }

  for (const match of text.matchAll(/(?<![A-Za-z0-9])(\d{4,8})(?![A-Za-z0-9])/g)) {
    add(match[1], match.index ?? 0, (match.index ?? 0) + match[0].length)
  }

  for (const match of text.matchAll(
    /(?<![A-Za-z0-9])(\d{2,4}(?:[ -]\d{2,4}){1,2})(?![A-Za-z0-9])/g,
  )) {
    add(match[1], match.index ?? 0, (match.index ?? 0) + match[0].length)
  }

  for (const match of text.matchAll(/(?<![A-Za-z0-9])(\d(?:[ -]\d){3,7})(?![A-Za-z0-9])/g)) {
    add(match[1], match.index ?? 0, (match.index ?? 0) + match[0].length)
  }

  for (const match of text.matchAll(/(?<![A-Za-z0-9])([A-Z0-9]{4,8})(?![A-Za-z0-9])/gi)) {
    const raw = match[1]
    if (!/[A-Z]/i.test(raw) || !/\d/.test(raw)) continue
    add(raw, match.index ?? 0, (match.index ?? 0) + match[0].length)
  }

  return seeds
}

function scoreSeed(
  seed: CandidateSeed,
  keywords: KeywordMatch[],
  hasExpiry: boolean,
): number | null {
  const nearest = nearestKeyword(keywords, seed.start, seed.end)
  if (!nearest) return null

  const around = seed.text.slice(
    Math.max(0, seed.start - 36),
    Math.min(seed.text.length, seed.end + 36),
  )
  const numeric = /^\d+$/.test(seed.code)
  const isolated = isStandaloneLine(seed.text, seed.start, seed.end)
  const salutation = isSalutation(seed.text, seed.start, seed.end)

  // A mixed-case word followed by a greeting is a recipient name, not a code.
  if (salutation && !numeric) return null

  let score = nearest.match.weight
  score += Math.max(0, 8 - nearest.distance / 12)
  if (seed.source === 'subject') score += 3
  if (seed.code.length === 6) score += 1
  else if (seed.code.length === 8) score += 0.5
  if (seed.raw !== seed.code) score += 1
  if (hasExpiry) score += 1
  if (numeric) score += 2
  else score -= 1
  if (isolated) score += 2.5
  if (salutation) score -= 5

  if (!numeric) {
    const hasLower = /[a-z]/.test(seed.code)
    const hasUpper = /[A-Z]/.test(seed.code)
    if (hasLower) score -= 1
    if (hasLower && hasUpper) score -= 1
    if (maxLetterRun(seed.code) >= 3) score -= 4
    if (seed.code.length === 8 && (seed.code.match(/[A-Za-z]/g)?.length ?? 0) >= 4) score -= 2
    if (!isolated) score -= 2
    if (nearest.distance > 5) score -= (nearest.distance - 5) * 1.5
  }

  if (/^(\d)\1+$/.test(seed.code)) score -= 3
  if (NEGATIVE_CONTEXT.test(around)) score -= 10
  if (TECH_CONTEXT.test(around)) score -= 3
  if (
    /^\d{4}$/.test(seed.code) &&
    /^(?:19|20)\d{2}$/.test(seed.code) &&
    /(年|月|日|date|20\d\d)/i.test(around)
  ) {
    score -= 5
  }

  return score
}

function findExpiry(text: string): VerificationExpiry | null {
  for (const entry of EXPIRY_PATTERNS) {
    const match = entry.pattern.exec(text)
    if (!match) continue
    if (entry.absolute) {
      return { kind: 'time', time: (match[1] ?? '').replace('：', ':') }
    }
    const amount = Number(match[1])
    if (!Number.isFinite(amount) || amount <= 0) continue
    const unit = match[2] ?? ''
    const minutes = /^(分钟|分|minute|min)/i.test(unit)
    return { kind: 'duration', amount, unit: minutes ? 'minutes' : 'hours' }
  }
  return null
}

export function findVerificationCode(input: {
  subject?: string | null
  text?: string | null
  htmlText?: string | null
}): VerificationResult {
  const subject = normalizeInput(input.subject ?? '')
  const bodyText = normalizeInput(input.text ?? '')
  const bodyHtml = normalizeInput(input.htmlText ?? '')
  const allText = [subject, bodyText, bodyHtml].filter(Boolean).join('\n\n')
  const expiry = findExpiry(allText)

  const seeds = [
    ...(subject ? collectSeeds(subject, 'subject') : []),
    ...(bodyText ? collectSeeds(bodyText, 'body') : []),
    ...(bodyHtml ? collectSeeds(bodyHtml, 'body') : []),
  ]

  const candidates: VerificationCandidate[] = []
  for (const seed of seeds) {
    const keywords = findKeywordMatches(seed.text)
    const score = scoreSeed(seed, keywords, Boolean(expiry))
    if (score === null || score < 9.5) continue
    candidates.push({
      code: seed.code,
      score,
      keyword: nearestKeyword(keywords, seed.start, seed.end)?.match.label ?? 'code',
      context: contextAround(seed.text, seed.start, seed.end),
      source: seed.source,
    })
  }

  const occurrences = new Map<string, number>()
  for (const candidate of candidates) {
    const key = candidate.code.toUpperCase()
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1)
  }
  for (const candidate of candidates) {
    const repeat = occurrences.get(candidate.code.toUpperCase()) ?? 1
    candidate.score += Math.min(3, (repeat - 1) * 1.5)
  }

  candidates.sort((left, right) => right.score - left.score || left.code.localeCompare(right.code))

  const byCode = new Map<string, VerificationCandidate>()
  for (const candidate of candidates) {
    const key = candidate.code.toUpperCase()
    const existing = byCode.get(key)
    if (!existing) {
      byCode.set(key, candidate)
      continue
    }

    // The body is the authoritative source for the exact casing of a code.
    const candidateIsBody = candidate.source === 'body'
    const existingIsBody = existing.source === 'body'
    if (candidateIsBody && !existingIsBody) {
      byCode.set(key, { ...candidate, score: Math.max(candidate.score, existing.score) })
      continue
    }
    if (!candidateIsBody && existingIsBody) {
      existing.score = Math.max(existing.score, candidate.score)
      continue
    }
    if (candidateIsBody === existingIsBody && candidate.score > existing.score) {
      byCode.set(key, candidate)
    }
  }

  const unique = [...byCode.values()].sort((left, right) => right.score - left.score)
  const primary = unique[0] ?? null
  const bodyContext =
    primary?.source === 'body'
      ? primary.context
      : primary
        ? candidates.find(
            (candidate) =>
              candidate.code.toUpperCase() === primary.code.toUpperCase() &&
              candidate.source === 'body',
          )?.context
        : null

  return {
    code: primary?.code ?? null,
    candidates: unique.slice(0, 4),
    context: primary ? (bodyContext ?? primary.context) : null,
    expiry: primary ? expiry : null,
    source: primary?.source ?? null,
  }
}
