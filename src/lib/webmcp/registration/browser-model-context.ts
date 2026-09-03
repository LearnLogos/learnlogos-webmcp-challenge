import type { ModelContextRegistration } from './register-tools'

interface ObjectWithModelContext {
  modelContext?: ModelContextRegistration
}

function modelContextFrom(value: object): ModelContextRegistration | undefined {
  return (value as ObjectWithModelContext).modelContext
}

export function resolveBrowserModelContext(
  currentDocument: object,
  currentNavigator: object,
): ModelContextRegistration | null {
  return modelContextFrom(currentDocument) ?? modelContextFrom(currentNavigator) ?? null
}
