import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { prepareStandalone } = require('./scripts/start-standalone.cjs') as {
  prepareStandalone: (root: string) => void
}

describe('standalone launcher', () => {
  it('copies generated static assets into the standalone runtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'webmcp-standalone-'))
    await mkdir(join(root, '.next/static/chunks'), { recursive: true })
    await writeFile(join(root, '.next/static/chunks/app.js'), 'safe-static-asset')

    prepareStandalone(root)

    await expect(readFile(
      join(root, '.next/standalone/.next/static/chunks/app.js'),
      'utf8',
    )).resolves.toBe('safe-static-asset')
  })
})
