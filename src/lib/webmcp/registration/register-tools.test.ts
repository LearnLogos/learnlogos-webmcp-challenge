import { describe, expect, it, vi } from 'vitest'
import { registerWebMcpTools, type WebMcpTool } from './register-tools'

const TOOL: WebMcpTool = {
  name: 'learnlogos.search_training.v1',
  description: 'Search training.',
  execute: vi.fn(),
}

describe('registerWebMcpTools', () => {
  it('does nothing when WebMCP is disabled', async () => {
    const registerTool = vi.fn()

    const registration = await registerWebMcpTools({
      enabled: false,
      modelContext: { registerTool },
      tools: [TOOL],
    })

    expect(registration.status).toBe('disabled')
    expect(registerTool).not.toHaveBeenCalled()
  })

  it('degrades safely when the browser does not expose WebMCP', async () => {
    const registration = await registerWebMcpTools({
      enabled: true,
      modelContext: null,
      tools: [TOOL],
    })

    expect(registration.status).toBe('unsupported')
    expect(registration.registeredCount).toBe(0)
  })

  it('registers tools with one abort signal and unregisters on cleanup', async () => {
    const signals: AbortSignal[] = []
    const registerTool = vi.fn(async (_tool, options) => {
      signals.push(options.signal)
    })

    const registration = await registerWebMcpTools({
      enabled: true,
      modelContext: { registerTool },
      tools: [TOOL, { ...TOOL, name: 'learnlogos.get_segment.v1' }],
    })

    expect(registration.status).toBe('registered')
    expect(registration.registeredCount).toBe(2)
    expect(signals[0]).toBe(signals[1])
    expect(signals[0].aborted).toBe(false)

    registration.dispose()
    expect(signals[0].aborted).toBe(true)
  })

  it('aborts partial registration when a browser registration rejects', async () => {
    const signals: AbortSignal[] = []
    const registerTool = vi.fn(async (_tool, options) => {
      signals.push(options.signal)
      if (signals.length === 2) throw new Error('duplicate tool')
    })

    await expect(registerWebMcpTools({
      enabled: true,
      modelContext: { registerTool },
      tools: [TOOL, { ...TOOL, name: 'learnlogos.get_segment.v1' }],
    })).rejects.toThrow('duplicate tool')

    expect(signals[0].aborted).toBe(true)
  })
})
