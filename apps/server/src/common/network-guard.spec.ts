import { describe, expect, it } from 'vitest'
import { assertAllowedMailHost, isBlockedHostname, isPrivateAddress } from './network-guard'

const strict = { allowPrivate: false, allowlist: [] }

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fd12::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('blocks %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '2606:4700::1111'])(
    'allows %s',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false)
    },
  )
})

describe('isBlockedHostname', () => {
  it('rejects loopback and internal names', () => {
    expect(isBlockedHostname('localhost')).toBe(true)
    expect(isBlockedHostname('mail.localhost')).toBe(true)
    expect(isBlockedHostname('nas.local')).toBe(true)
    expect(isBlockedHostname('metadata.google.internal')).toBe(true)
  })

  it('allows ordinary mail hostnames', () => {
    expect(isBlockedHostname('imap.gmail.com')).toBe(false)
    expect(isBlockedHostname('mail.example.co.uk')).toBe(false)
  })
})

describe('assertAllowedMailHost', () => {
  it('rejects loopback literals', async () => {
    await expect(assertAllowedMailHost('127.0.0.1', strict)).rejects.toThrow(/内网/)
    await expect(assertAllowedMailHost('[::1]', strict)).rejects.toThrow(/内网/)
  })

  it('rejects private hostnames without a DNS round trip', async () => {
    await expect(assertAllowedMailHost('localhost', strict)).rejects.toThrow(/不允许/)
  })

  it('allows public literals', async () => {
    await expect(assertAllowedMailHost('8.8.8.8', strict)).resolves.toBeUndefined()
  })

  it('honours the allowlist and the global opt-in', async () => {
    await expect(
      assertAllowedMailHost('127.0.0.1', { allowPrivate: false, allowlist: ['127.0.0.1'] }),
    ).resolves.toBeUndefined()
    await expect(
      assertAllowedMailHost('192.168.1.5', { allowPrivate: true, allowlist: [] }),
    ).resolves.toBeUndefined()
  })
})
