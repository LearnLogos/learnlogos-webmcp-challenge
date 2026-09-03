/* eslint-disable @typescript-eslint/no-require-imports -- Next standalone emits CommonJS. */
const { cpSync } = require('node:fs')
const { join, resolve } = require('node:path')

function prepareStandalone(root) {
  const projectRoot = resolve(root)
  cpSync(
    join(projectRoot, '.next/static'),
    join(projectRoot, '.next/standalone/.next/static'),
    { recursive: true },
  )
}

function main() {
  const root = process.cwd()
  try {
    prepareStandalone(root)
    require(join(root, '.next/standalone/server.js'))
  } catch {
    process.stderr.write('Unable to prepare or start the standalone contest server.\n')
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = { prepareStandalone }
