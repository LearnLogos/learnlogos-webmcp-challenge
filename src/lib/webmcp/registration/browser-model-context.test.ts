import { describe, expect, it, vi } from 'vitest'
import { resolveBrowserModelContext } from './browser-model-context'

describe('browser model context resolution', () => {
  it('prefers the current document WebMCP surface', () => {
    const current = { registerTool: vi.fn() }
    const legacy = { registerTool: vi.fn() }

    expect(resolveBrowserModelContext(
      { modelContext: current },
      { modelContext: legacy },
    )).toBe(current)
  })

  it('uses the deprecated navigator surface only as a compatibility fallback', () => {
    const legacy = { registerTool: vi.fn() }

    expect(resolveBrowserModelContext({}, { modelContext: legacy })).toBe(legacy)
    expect(resolveBrowserModelContext({}, {})).toBeNull()
  })
})
