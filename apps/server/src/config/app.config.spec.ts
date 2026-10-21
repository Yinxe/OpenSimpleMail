import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAppConfig } from './app.config'

const originalDatabasePath = process.env.DATABASE_PATH

afterEach(() => {
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH
  else process.env.DATABASE_PATH = originalDatabasePath
})

describe('loadAppConfig', () => {
  it('anchors a relative database path to the project root, not the cwd', () => {
    // Vitest runs with apps/server as the working directory.
    const projectRoot = resolve(process.cwd(), '../..')
    process.env.DATABASE_PATH = 'data/open-simple-mail.db'

    expect(loadAppConfig().databasePath).toBe(resolve(projectRoot, 'data/open-simple-mail.db'))
  })

  it('keeps an absolute database path unchanged', () => {
    process.env.DATABASE_PATH = '/tmp/open-simple-mail-test.db'

    expect(loadAppConfig().databasePath).toBe('/tmp/open-simple-mail-test.db')
  })
})
