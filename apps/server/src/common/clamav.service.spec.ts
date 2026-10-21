import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppConfig } from '../config/app.config'
import { ClamAvService } from './clamav.service'

/** Minimal clamd stand-in that parses INSTREAM chunks and replies once. */
function startFakeClamd(reply: string): Promise<{ port: number; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer((socket: Socket) => {
      let buffer = Buffer.alloc(0)
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)])
        if (buffer.subarray(0, 10).toString() === 'zINSTREAM\0') buffer = buffer.subarray(10)
        for (;;) {
          if (buffer.length < 4) return
          const size = buffer.readUInt32BE(0)
          if (size === 0) {
            socket.end(`${reply}\0`)
            return
          }
          if (buffer.length < 4 + size) return
          buffer = buffer.subarray(4 + size)
        }
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ port: typeof address === 'object' && address ? address.port : 0, server })
    })
  })
}

function configFor(port: number, host = '127.0.0.1'): AppConfig {
  return { clamavHost: host, clamavPort: port } as AppConfig
}

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'osm-clamav-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ClamAvService', () => {
  it('does nothing when no host is configured', async () => {
    const service = new ClamAvService(configFor(0, ''))
    expect(service.enabled).toBe(false)
    await expect(service.scanFile(join(dir, 'missing.bin'), 'missing.bin')).resolves.toBeUndefined()
  })

  it('accepts a clean file', async () => {
    const { port, server } = await startFakeClamd('stream: OK')
    const file = join(dir, 'clean.txt')
    writeFileSync(file, 'hello world')
    const service = new ClamAvService(configFor(port))
    await expect(service.scanFile(file, 'clean.txt')).resolves.toBeUndefined()
    server.close()
  })

  it('blocks a file reported as infected', async () => {
    const { port, server } = await startFakeClamd('stream: Eicar-Test-Signature FOUND')
    const file = join(dir, 'eicar.txt')
    writeFileSync(file, 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR')
    const service = new ClamAvService(configFor(port))
    await expect(service.scanFile(file, 'eicar.txt')).rejects.toThrow(/Eicar-Test-Signature/)
    server.close()
  })

  it('fails closed when the scanner is unreachable', async () => {
    const service = new ClamAvService(configFor(1))
    const file = join(dir, 'clean.txt')
    writeFileSync(file, 'hello')
    await expect(service.scanFile(file, 'clean.txt')).rejects.toThrow(/扫描服务不可用/)
  })

  it('fails closed when clamd reports an error', async () => {
    const { port, server } = await startFakeClamd('INSTREAM size limit exceeded. ERROR')
    const file = join(dir, 'big.txt')
    writeFileSync(file, 'hello')
    const service = new ClamAvService(configFor(port))
    await expect(service.scanFile(file, 'big.txt')).rejects.toThrow(/扫描失败/)
    server.close()
  })
})
