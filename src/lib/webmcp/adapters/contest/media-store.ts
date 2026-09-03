import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { z } from 'zod'

const MAX_MEDIA_BYTES = 100 * 1_024 * 1_024
const MAX_CAPTION_BYTES = 2 * 1_024 * 1_024
const assetSchema = z.object({
  segmentId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  version: z.string().trim().min(1).max(32),
  fileName: z.string().regex(/^[a-z0-9-]{3,80}\.mp4$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  captionFile: z.string().regex(/^[a-z0-9-]{3,80}\.srt$/),
  captionSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

interface MediaStoreOptions {
  root: string
  assets: z.infer<typeof assetSchema>[]
}

interface ByteRange {
  start: number
  end: number
}

function parseRange(value: string | null, size: number): ByteRange | null | 'invalid' {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2])) return 'invalid'
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix < 1) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)
    || start < 0 || start >= size || requestedEnd < start) return 'invalid'
  return { start, end: Math.min(requestedEnd, size - 1) }
}

function mediaHeaders(length: number): Headers {
  return new Headers({
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'content-length': String(length),
    'content-type': 'video/mp4',
    'x-content-type-options': 'nosniff',
  })
}

function rangeNotSatisfiable(size: number): Response {
  const headers = mediaHeaders(0)
  headers.set('content-range', `bytes */${size}`)
  return new Response(null, { status: 416, headers })
}

function within(root: string, path: string): boolean {
  const child = relative(root, path)
  return child !== '' && !child.startsWith('..') && !isAbsolute(child)
}

async function sha256(handle: FileHandle, size: number): Promise<string> {
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(64 * 1_024)
  let position = 0
  while (position < size) {
    const length = Math.min(buffer.length, size - position)
    const { bytesRead } = await handle.read(buffer, 0, length, position)
    if (!bytesRead) throw new Error('Contest media could not be verified')
    hash.update(buffer.subarray(0, bytesRead))
    position += bytesRead
  }
  return hash.digest('hex')
}

async function safeFile(
  root: string,
  fileName: string,
  expectedDigest: string,
  maximumSize = MAX_MEDIA_BYTES,
) {
  const candidate = resolve(root, fileName)
  const canonicalRoot = await realpath(root)
  const details = await lstat(candidate)
  if (details.isSymbolicLink() || !details.isFile()) throw new Error('Contest media must be a regular file')
  const canonicalFile = await realpath(candidate)
  if (!within(canonicalRoot, canonicalFile)) throw new Error('Contest media must be a regular file')
  const handle = await open(canonicalFile, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stats = await handle.stat()
    if (!stats.isFile() || stats.size < 1 || stats.size > maximumSize) {
      throw new Error('Contest media must be a bounded regular file')
    }
    if (await sha256(handle, stats.size) !== expectedDigest) {
      throw new Error('Contest media digest mismatch')
    }
    return { handle, size: stats.size }
  } catch (error) {
    await handle.close().catch(() => undefined)
    throw error
  }
}

async function captionResponse(root: string, fileName: string, digest: string): Promise<Response> {
  const { handle } = await safeFile(root, fileName, digest, MAX_CAPTION_BYTES)
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(await handle.readFile())
    const webVtt = `WEBVTT\n\n${source.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`
    return new Response(webVtt, {
      headers: {
        'cache-control': 'private, no-store',
        'content-type': 'text/vtt; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    })
  } finally {
    await handle.close()
  }
}

export function createContestMediaStore(options: MediaStoreOptions) {
  const root = resolve(options.root)
  if (!isAbsolute(options.root) || root !== options.root || root === '/') {
    throw new Error('Contest media root must be a dedicated absolute directory')
  }
  const assets = options.assets.map((asset) => assetSchema.parse(asset))
  const byId = new Map(assets.map((asset) => [asset.segmentId, asset]))
  if (byId.size !== assets.length) throw new Error('Duplicate contest media segment')
  return {
    async serve(segmentId: string, rangeHeader: string | null): Promise<Response | null> {
      const asset = byId.get(segmentId)
      if (!asset) return null
      const { handle, size } = await safeFile(root, asset.fileName, asset.sha256)
      const requested = parseRange(rangeHeader, size)
      if (requested === 'invalid') {
        await handle.close()
        return rangeNotSatisfiable(size)
      }
      const range = requested ?? { start: 0, end: size - 1 }
      const headers = mediaHeaders(range.end - range.start + 1)
      if (requested) headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`)
      const stream = handle.createReadStream({ start: range.start, end: range.end, autoClose: true })
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: requested ? 206 : 200,
        headers,
      })
    },
    async serveCaptions(segmentId: string): Promise<Response | null> {
      const asset = byId.get(segmentId)
      if (!asset) return null
      return captionResponse(root, asset.captionFile, asset.captionSha256)
    },
  }
}
