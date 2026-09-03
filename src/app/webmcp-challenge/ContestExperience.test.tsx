/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContestExperience from './ContestExperience'

const ENVELOPE = {
  data: { query: 'search', results: [], total: 0 },
  persona: {
    id: 'webmcp-contest-learner',
    displayName: 'WebMCP Challenge Learner',
    accessBoundary: 'approved-contest-content-only',
  },
}

const RESULT_ENVELOPE = {
  ...ENVELOPE,
  data: {
    query: 'scaling',
    total: 1,
    results: [{
      segmentId: 'shortcut-program-scaling-v1',
      title: 'Set Exact Program Scaling',
      summary: 'Set an exact interface scaling percentage and save that command for quick reuse.',
      source: {
        webinarTitle: 'The Ultimate Logos Shortcut List, Part 1/5',
        webinarDate: '2026-04-23',
        excerptStartMs: 152_960,
        excerptEndMs: 227_862,
        citation: 'LearnLogos, “The Ultimate Logos Shortcut List, Part 1/5,” webinar, April 23, 2026, 02:32.960–03:47.862.',
      },
      logosVersion: null,
      access: 'free',
      relevance: 1,
      whyMatched: 'Matched approved contest training metadata.',
      contentClassification: 'public-contest',
    }],
  },
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'modelContext')
})

describe('contest browser experience', () => {
  it('starts with a verified demonstration question and visible isolation notice', () => {
    render(<ContestExperience />)

    const question = screen.getByLabelText('Learning question') as HTMLSelectElement
    expect(question.tagName).toBe('SELECT')
    expect(question.options).toHaveLength(8)
    expect(Array.from(question.options, ({ text }) => text)).toEqual([
      'How do I set program scaling to a specific percentage?',
      'How can I make the Logos interface larger?',
      'How do I save a scaling command to Favorites?',
      'How do I change scaling from the toolbar?',
      'How do I jump to my next reading?',
      'How do I use the reading-plan calendar?',
      'How do I mark my reading progress complete?',
      'How do I move to the next reading in my plan?',
    ])
    expect(question.value)
      .toBe('How do I set program scaling to a specific percentage?')
    expect(screen.getByText(/isolated from the production LearnLogos website/i)).toBeTruthy()
  })

  it('registers the search tool and aborts its registration when unmounted', async () => {
    let registrationSignal: AbortSignal | undefined
    const registerTool = vi.fn(async (_tool, options) => { registrationSignal = options.signal })
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } })

    const view = render(<ContestExperience />)
    await waitFor(() => expect(screen.getByTestId('webmcp-status').textContent).toContain('registered'))

    expect(registerTool).toHaveBeenCalledTimes(1)
    expect(registrationSignal?.aborted).toBe(false)
    view.unmount()
    expect(registrationSignal?.aborted).toBe(true)
  })

  it('degrades safely when WebMCP is not supported', async () => {
    render(<ContestExperience />)

    await waitFor(() => expect(screen.getByTestId('webmcp-status').textContent).toContain('unsupported'))
  })

  it('automatically searches one best result when a guided question is selected', async () => {
    const fetcher = vi.fn(async () => Response.json(ENVELOPE))
    vi.stubGlobal('fetch', fetcher)
    render(<ContestExperience />)

    fireEvent.change(screen.getByLabelText('Learning question'), {
      target: { value: 'How do I use the reading-plan calendar?' },
    })

    await waitFor(() => expect(screen.getByTestId('contest-result').textContent)
      .toContain('WebMCP Challenge Learner'))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/api/webmcp/contest/search', expect.objectContaining({
      body: JSON.stringify({
        question: 'How do I use the reading-plan calendar?',
        limit: 1,
      }),
    }))
  })

  it('renders approved result metadata without exposing media paths or digests', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(RESULT_ENVELOPE)))
    render(<ContestExperience />)

    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Search training' })) })

    await waitFor(() => expect(screen.getByText('Set Exact Program Scaling')).toBeTruthy())
    expect(screen.getByText(RESULT_ENVELOPE.data.results[0].summary)).toBeTruthy()
    expect(screen.getByText(RESULT_ENVELOPE.data.results[0].source.citation)).toBeTruthy()
    expect(document.body.textContent).not.toContain('6828810d')
    expect(document.body.textContent).not.toContain('.mp4')
    expect(document.body.textContent).not.toContain('https://')
  })

  it('renders only the server-issued relative playback grant', async () => {
    const token = `${'a'.repeat(30)}.${'b'.repeat(43)}`
    const playback = {
      url: `/api/webmcp/contest/media/shortcut-program-scaling-v1?grant=${token}`,
      captionsUrl: `/api/webmcp/contest/captions/shortcut-program-scaling-v1?grant=${token}`,
      expiresAt: 1_800_000_120_000,
    }
    const envelope = {
      ...RESULT_ENVELOPE,
      data: {
        ...RESULT_ENVELOPE.data,
        results: [{ ...RESULT_ENVELOPE.data.results[0], playback }],
      },
    }
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(envelope)))
    render(<ContestExperience />)

    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Search training' })) })

    const player = await screen.findByLabelText('Play Set Exact Program Scaling')
    expect(screen.getByLabelText('Public content and licensing').textContent).toContain(
      'LearnLogos-owned narration, captions, and instructional graphics',
    )
    expect(screen.getByLabelText('Public content and licensing').textContent).toContain(
      'not sponsored or endorsed by Logos',
    )
    expect(player.getAttribute('src')).toBe(playback.url)
    expect(player.getAttribute('preload')).toBe('metadata')
    expect(player.querySelector('track')?.getAttribute('src')).toBe(playback.captionsUrl)
  })

  it('shows a generic error without rendering an untrusted response body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { error: 'private backend detail' },
      { status: 500 },
    )))
    render(<ContestExperience />)

    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Search training' })) })

    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toBe('The contest search is temporarily unavailable.'))
    expect(document.body.textContent).not.toContain('private backend detail')
  })
})
