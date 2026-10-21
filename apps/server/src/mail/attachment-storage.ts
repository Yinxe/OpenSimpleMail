import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Request } from 'express'
import type { StorageEngine } from 'multer'
import { diskStorage } from 'multer'
import type { AppConfig } from '../config/app.config'

const REQUEST_DIR = Symbol('open-simple-mail.upload-dir')

type UploadRequest = Request & { [REQUEST_DIR]?: string }

/**
 * Owns the scratch directory used by the mail pipeline. Nothing in here is
 * authoritative: outgoing uploads are deleted once the message is sent, and
 * extracted attachments are a cache that may disappear at any time.
 *
 * Keeping both trees on disk is what bounds the process memory footprint: a
 * 25 MB outgoing message or a 40 MB incoming one never has to sit in the heap.
 */
export class AttachmentStorage {
  private prepared: Promise<void> | null = null

  constructor(private readonly config: AppConfig) {}

  get uploadRoot(): string {
    return join(this.config.attachmentDir, 'upload')
  }

  get cacheRoot(): string {
    return join(this.config.attachmentDir, 'cache')
  }

  /**
   * Recreates the scratch tree. Leftovers from a killed process cannot be
   * attributed to anyone, so the first caller of the process wipes them.
   */
  prepare(): Promise<void> {
    this.prepared ??= this.reset().catch((error: unknown) => {
      this.prepared = null
      throw error
    })
    return this.prepared
  }

  /** Directory for the extracted attachments of one message. */
  cacheDir(accountId: string, mailbox: string, uid: number): string {
    const mailboxHash = createHash('sha1').update(mailbox).digest('hex').slice(0, 12)
    return join(this.cacheRoot, accountId, `${uid}-${mailboxHash}`)
  }

  /**
   * Multer storage that streams each upload straight to disk instead of
   * buffering it in memory. All files of one request share a directory so a
   * single removal cleans up after the request.
   */
  uploadEngine(): StorageEngine {
    return diskStorage({
      destination: (req, _file, callback) => {
        const request = req as UploadRequest
        void this.prepare()
          .then(async () => {
            request[REQUEST_DIR] ??= join(this.uploadRoot, randomUUID())
            // Multer only creates a destination it was given as a string, so
            // the per-request directory has to be made here.
            await mkdir(request[REQUEST_DIR], { recursive: true })
            callback(null, request[REQUEST_DIR])
          })
          .catch((error: unknown) => callback(error as Error, ''))
      },
      filename: (_req, _file, callback) => callback(null, `${randomUUID()}.bin`),
    })
  }

  /** Removes the upload directory of a finished request. */
  async removeUploads(files: Express.Multer.File[]): Promise<void> {
    const directories = new Set(files.map((file) => dirname(file.path)))
    await Promise.all([...directories].map((directory) => this.remove(directory)))
  }

  async remove(directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }

  private async reset(): Promise<void> {
    await this.remove(this.uploadRoot)
    await this.remove(this.cacheRoot)
    await mkdir(this.uploadRoot, { recursive: true })
    await mkdir(this.cacheRoot, { recursive: true })
  }
}
