import { createReadStream } from 'node:fs'
import { connect } from 'node:net'
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { APP_CONFIG, type AppConfig } from '../config/app.config'

/**
 * Optional ClamAV scanning for outgoing attachments.
 *
 * When `CLAMAV_HOST` is set, every uploaded attachment is streamed to clamd
 * with the INSTREAM protocol before the message is composed. A positive result
 * blocks the send; an unreachable scanner also blocks it, because silently
 * forwarding an unscanned file would defeat the point of enabling the check.
 */
@Injectable()
export class ClamAvService {
  private readonly logger = new Logger(ClamAvService.name)

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.clamavHost)
  }

  async scanFile(path: string, filename: string): Promise<void> {
    if (!this.enabled) return

    let result: string
    try {
      result = await this.scanStream(path)
    } catch (error) {
      this.logger.warn(`ClamAV scan failed for ${filename}: ${(error as Error).message}`)
      throw new ServiceUnavailableException('附件扫描服务不可用，邮件未发送')
    }

    if (result.includes('FOUND')) {
      const signature = result.replace(/^stream:\s*/, '').replace(/\s+FOUND$/, '')
      this.logger.warn(`ClamAV blocked ${filename}: ${signature}`)
      throw new BadRequestException(`附件「${filename}」检测到病毒：${signature}`)
    }
    if (result.includes('ERROR')) {
      this.logger.warn(`ClamAV error for ${filename}: ${result}`)
      throw new ServiceUnavailableException('附件扫描失败，邮件未发送')
    }
  }

  private scanStream(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.config.clamavHost, port: this.config.clamavPort })
      let response = ''
      let settled = false

      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        socket.destroy()
        if (error) reject(error)
        else resolve(response.trim())
      }

      socket.setTimeout(15_000, () => finish(new Error('timeout')))
      socket.on('error', (error) => finish(error))
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8')
        if (response.includes('\0') || response.includes('\n')) finish()
      })

      socket.on('connect', () => {
        socket.write('zINSTREAM\0')
        const stream = createReadStream(path)
        stream.on('data', (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          const header = Buffer.alloc(4)
          header.writeUInt32BE(buffer.length, 0)
          // Respect backpressure so a large attachment is not buffered twice.
          if (!socket.write(Buffer.concat([header, buffer]))) {
            stream.pause()
            socket.once('drain', () => stream.resume())
          }
        })
        stream.on('end', () => socket.write(Buffer.alloc(4)))
        stream.on('error', (error) => finish(error))
      })
    })
  }
}
