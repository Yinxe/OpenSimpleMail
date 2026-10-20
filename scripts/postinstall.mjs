import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `npm ci --omit=dev` (Docker runtime) has no TypeScript, so the shared package
// cannot be rebuilt there. It is copied from the build stage instead.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')

if (!existsSync(tsc)) {
  console.log('[postinstall] TypeScript not installed; skipping @osm/shared build')
  process.exit(0)
}

const result = spawnSync(
  process.execPath,
  [tsc, '-p', join(root, 'packages/shared/tsconfig.json')],
  {
    stdio: 'inherit',
  },
)
process.exit(result.status ?? 0)
