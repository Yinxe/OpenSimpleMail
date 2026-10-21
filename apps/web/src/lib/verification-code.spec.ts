import { describe, expect, it } from 'vitest'
import { findVerificationCode } from './verification-code'

function find(input: { subject?: string; text?: string; htmlText?: string }) {
  return findVerificationCode(input)
}

describe('findVerificationCode', () => {
  it('extracts a Chinese verification code and its expiry', () => {
    const result = find({ text: '你的登录验证码是 482913，10 分钟内有效。请勿转发。' })
    expect(result.code).toBe('482913')
    expect(result.expiry).toBe('10 分钟内有效')
    expect(result.context).toContain('482913')
  })

  it('extracts an English verification code', () => {
    const result = find({
      subject: 'Your verification code',
      text: 'Your verification code is 482913. It expires in 10 minutes.',
    })
    expect(result.code).toBe('482913')
    expect(result.expiry).toBe('10 分钟内有效')
  })

  it('accepts the shorter "code is" phrasing', () => {
    expect(find({ text: 'Your code is 731204' }).code).toBe('731204')
  })

  it('joins spaced digits', () => {
    expect(find({ text: '验证码：4 8 2 9 1 3' }).code).toBe('482913')
    expect(find({ text: '验证码：482 913' }).code).toBe('482913')
  })

  it('accepts full-width digits', () => {
    expect(find({ text: '验证码：４８２９１３' }).code).toBe('482913')
  })

  it('extracts an alphanumeric security code', () => {
    expect(find({ text: 'Your security code is A1B2C3' }).code).toBe('A1B2C3')
  })

  it('uses the subject when the body has no code', () => {
    expect(find({ subject: '登录验证码 739201', text: '请回到登录页完成验证。' }).code).toBe(
      '739201',
    )
  })

  it('keeps additional candidates', () => {
    const result = find({ text: '验证码 482913，备用验证码 731204。' })
    expect(result.code).toBe('482913')
    expect(result.candidates.map((candidate) => candidate.code)).toContain('731204')
  })

  it('ignores invoice and order numbers', () => {
    expect(find({ text: '订单号 20261021，金额 ¥128.00，发票编号 INV-2026-1021。' }).code).toBe(
      null,
    )
    expect(find({ text: 'Invoice total: 128000' }).code).toBe(null)
  })

  it('ignores postal codes and phone numbers', () => {
    expect(find({ text: '邮编 200000，电话 13800138000。' }).code).toBe(null)
  })

  it('ignores promo codes', () => {
    expect(find({ text: 'Use promo code SAVE20 at checkout.' }).code).toBe(null)
  })

  it('ignores dates and version numbers', () => {
    expect(find({ text: 'Release date: 2026-10-21, version 1.2.3.' }).code).toBe(null)
  })
})
