import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { useUiStore } from '@/state/ui-store'

export type HengoppDebugApi = {
  project: typeof useProjectStore
  interaction: typeof useInteractionStore
  viewport: typeof useViewportStore
  ui: typeof useUiStore
}

declare global {
  interface Window {
    __hengopp?: HengoppDebugApi
  }
}

/**
 * Read-only handle on the stores. Used by the end-to-end tests to convert
 * millimetres to screen pixels and to assert on document state.
 */
export function installDebugApi(): void {
  if (typeof window === 'undefined') return
  window.__hengopp = {
    project: useProjectStore,
    interaction: useInteractionStore,
    viewport: useViewportStore,
    ui: useUiStore,
  }
}
