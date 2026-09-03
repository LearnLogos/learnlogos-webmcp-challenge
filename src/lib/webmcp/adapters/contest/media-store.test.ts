import { mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createContestMediaStore } from './media-store'

const DIGEST = createHash('sha256').update('0123456789').digest('hex')
const CAPTIONS = '1\n00:00:00,000 --> 00:00:02,000\nCaption text.\n'
const CAPTION_DIGEST = createHash('sha256').update(CAPTIONS).digest('hex')
const asset = (overrides = {}) => ({
  segmentId: 'approved-segment',
  version: '1',
  fileName: 'approved.mp4',
  sha256: DIGEST,
  captionFile: 'approved.srt',
  captionSha256: CAPTION_DIGEST,
  ...overrides,
})

async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'webmcp-media-'))
  await writeFile(join(root, 'approved.mp4'), Buffer.from('0123456789'))
  await writeFile(join(root, 'approved.srt'), CAPTIONS)
  const store = createContestMediaStore({
    root,
    assets: [asset()],
  })
  return { root, store }
}

describe('contest media store', () => {
  it('serves only an allowlisted complete clip with hardened headers', async () => {
    const { store } = await harness()
    const response = await store.serve('approved-segment', null)

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('video/mp4')
    expect(response?.headers.get('content-length')).toBe('10')
    expect(response?.headers.get('accept-ranges')).toBe('bytes')
    expect(response?.headers.get('cache-control')).toBe('private, no-store')
    expect(await response?.text()).toBe('0123456789')
    expect(await store.serve('unknown-segment', null)).toBeNull()
  })

  it('serves one bounded byte range and rejects reconstruction-style ranges', async () => {
    const { store } = await harness()
    const partial = await store.serve('approved-segment', 'bytes=2-5')

    expect(partial?.status).toBe(206)
    expect(partial?.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(partial?.headers.get('content-length')).toBe('4')
    expect(await partial?.text()).toBe('2345')

    const multiple = await store.serve('approved-segment', 'bytes=0-1,4-5')
    const outside = await store.serve('approved-segment', 'bytes=20-30')
    expect(multiple?.status).toBe(416)
    expect(outside?.headers.get('content-range')).toBe('bytes */10')
  })

  it('rejects bytes that no longer match the approved digest', async () => {
    const { root, store } = await harness()
    await writeFile(join(root, 'approved.mp4'), Buffer.from('changed'))

    await expect(store.serve('approved-segment', null)).rejects.toThrow('digest')
  })

  it('serves digest-bound captions as WebVTT', async () => {
    const { root, store } = await harness()
    const response = await store.serveCaptions('approved-segment')

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    expect(await response?.text()).toBe(
      'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nCaption text.\n',
    )
    await writeFile(join(root, 'approved.srt'), 'changed')
    await expect(store.serveCaptions('approved-segment')).rejects.toThrow('digest')
  })

  it('rejects unsafe filenames, duplicate IDs, and symlink escapes', async () => {
    const { root } = await harness()
    expect(() => createContestMediaStore({
      root,
      assets: [asset({ segmentId: 'unsafe-segment', fileName: '../private.mp4' })],
    })).toThrow()
    expect(() => createContestMediaStore({
      root,
      assets: [
        asset({ segmentId: 'same-segment' }),
        asset({ segmentId: 'same-segment' }),
      ],
    })).toThrow('Duplicate')

    await symlink('/etc/passwd', join(root, 'linked.mp4'))
    const linked = createContestMediaStore({
      root,
      assets: [asset({ segmentId: 'linked-segment', fileName: 'linked.mp4' })],
    })
    await expect(linked.serve('linked-segment', null)).rejects.toThrow('regular file')
  })
})
