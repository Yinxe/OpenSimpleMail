import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { BadRequestException } from '@nestjs/common'

/**
 * SSRF guard for user-supplied mail server hosts.
 *
 * A self-hosted instance usually talks to public IMAP/SMTP servers, but the
 * account form lets anyone point the server at any address. Without a check an
 * authenticated user could make this process open connections to loopback, the
 * LAN or cloud metadata endpoints. Private networks are refused by default and
 * can be re-enabled with `ALLOW_PRIVATE_MAIL_HOSTS=true` (or per host through
 * `MAIL_HOST_ALLOWLIST`) for people who run their own mail server.
 *
 * The check happens when the account is saved. DNS is re-resolved by the mail
 * client when it connects, so a hostile DNS server could still rebind; the
 * guard is a practical barrier, not a sandbox.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
])

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa']

export interface MailHostGuardOptions {
  allowPrivate: boolean
  allowlist: string[]
}

function ipv4IsPrivate(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
  const [a = 0, b = 0] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a === 192 && b === 0) return true // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true // multicast and reserved
  return false
}

function ipv6IsPrivate(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (value === '::1' || value === '::') return true
  // IPv4-mapped addresses (::ffff:127.0.0.1) inherit the IPv4 rules.
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped?.[1]) return ipv4IsPrivate(mapped[1])
  const first = value.split(':')[0] ?? ''
  if (first.startsWith('fc') || first.startsWith('fd')) return true // unique local
  if (/^fe[89ab]/.test(first)) return true // link-local fe80::/10
  if (first.startsWith('ff')) return true // multicast
  return false
}

/** True for loopback, LAN, link-local, CGNAT, multicast and reserved ranges. */
export function isPrivateAddress(address: string): boolean {
  const value = address.trim()
  const family = isIP(value)
  if (family === 4) return ipv4IsPrivate(value)
  if (family === 6) return ipv6IsPrivate(value)
  return false
}

export function isBlockedHostname(host: string): boolean {
  const value = host.trim().toLowerCase().replace(/\.$/, '')
  if (BLOCKED_HOSTNAMES.has(value)) return true
  return BLOCKED_SUFFIXES.some((suffix) => value.endsWith(suffix))
}

/**
 * Throw a BadRequestException when the host may not be used as a mail server.
 * Unresolvable hostnames are allowed: they cannot reach anything, and the
 * connection attempt will report a clearer error than a DNS lookup here.
 */
export async function assertAllowedMailHost(
  host: string,
  options: MailHostGuardOptions,
): Promise<void> {
  const value = host.trim().toLowerCase()
  if (!value) return
  if (options.allowPrivate) return
  if (options.allowlist.includes(value)) return

  if (isBlockedHostname(value)) {
    throw new BadRequestException(`不允许使用该服务器地址：${host.trim()}`)
  }

  const bare = value.replace(/^\[|\]$/g, '')
  if (isIP(bare)) {
    if (isPrivateAddress(bare)) {
      throw new BadRequestException(
        `不允许连接内网地址 ${host.trim()}；如果这是你自己的邮件服务器，请设置 ALLOW_PRIVATE_MAIL_HOSTS=true 或把它加入 MAIL_HOST_ALLOWLIST`,
      )
    }
    return
  }

  let addresses: { address: string }[]
  try {
    addresses = await lookup(bare, { all: true, verbatim: true })
  } catch {
    // ENOTFOUND / EAI_AGAIN: nothing to connect to, let the client report it.
    return
  }

  const blocked = addresses.find((entry) => isPrivateAddress(entry.address))
  if (blocked) {
    throw new BadRequestException(
      `不允许连接内网地址 ${host.trim()}（解析到 ${blocked.address}）；如果这是你自己的邮件服务器，请设置 ALLOW_PRIVATE_MAIL_HOSTS=true 或把它加入 MAIL_HOST_ALLOWLIST`,
    )
  }
}
