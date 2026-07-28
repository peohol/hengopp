/** True when the event originates from a field where typing must win over shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.isContentEditable) return true
  if (target.getAttribute('role') === 'textbox') return true
  return false
}

export function isMetaOrCtrl(e: KeyboardEvent | MouseEvent | PointerEvent): boolean {
  return e.metaKey || e.ctrlKey
}

export const MOD_LABEL = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
  ? '⌘'
  : 'Ctrl'

export function shortcut(...parts: string[]): string {
  return parts.join(' + ')
}
