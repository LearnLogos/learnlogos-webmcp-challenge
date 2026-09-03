export interface WebMcpExecutionOptions {
  signal: AbortSignal
}

export interface WebMcpTool {
  name: string
  title?: string
  description: string
  inputSchema?: object
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
  execute: (input: object, options: WebMcpExecutionOptions) => unknown | Promise<unknown>
}

export interface ModelContextRegistration {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void>
}

export interface WebMcpRegistration {
  status: 'disabled' | 'unsupported' | 'registered'
  registeredCount: number
  dispose: () => void
}

interface RegisterToolsOptions {
  enabled: boolean
  modelContext: ModelContextRegistration | null
  tools: WebMcpTool[]
}

function inactiveRegistration(status: 'disabled' | 'unsupported'): WebMcpRegistration {
  return { status, registeredCount: 0, dispose: () => undefined }
}

export async function registerWebMcpTools(options: RegisterToolsOptions): Promise<WebMcpRegistration> {
  if (!options.enabled) return inactiveRegistration('disabled')
  if (!options.modelContext) return inactiveRegistration('unsupported')

  const controller = new AbortController()
  try {
    for (const tool of options.tools) {
      await options.modelContext.registerTool(tool, { signal: controller.signal })
    }
  } catch (error) {
    controller.abort()
    throw error
  }

  return {
    status: 'registered',
    registeredCount: options.tools.length,
    dispose: () => controller.abort(),
  }
}
