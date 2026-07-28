import { useEffect } from 'react'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useUiStore } from '@/state/ui-store'
import {
  deleteSelection,
  duplicateSelection,
  exitGroupLevel,
  groupSelection,
  nudgeSelection,
  redo,
  selectAllOnLevel,
  undo,
  ungroupSelection,
} from '@/state/commands'
import { isTypingTarget } from '@/utils/keyboard'
import { roundMm } from '@/utils/units'

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Global shortcuts. Never fire while the user types or a dialog is open. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const modalOpen = () => {
      const ui = useUiStore.getState()
      return !!ui.objectDialog || !!ui.confirm || ui.helpOpen || ui.setupDialogOpen
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return

      if (e.code === 'Space' && !e.repeat && !modalOpen()) {
        useInteractionStore.getState().setSpacePanArmed(true)
        e.preventDefault()
        return
      }

      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }

      if (modalOpen()) return

      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAllOnLevel()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelection()
        return
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (useInteractionStore.getState().selection.length === 0) return
        e.preventDefault()
        deleteSelection()
        return
      }

      if (e.key === 'Escape') {
        const interaction = useInteractionStore.getState()
        if (interaction.mode !== 'idle') return // handled by the canvas
        if (exitGroupLevel()) {
          e.preventDefault()
          return
        }
        if (interaction.selection.length > 0) {
          e.preventDefault()
          interaction.clearSelection()
        }
        return
      }

      const arrow = ARROWS[e.key]
      if (arrow) {
        const { selection } = useInteractionStore.getState()
        if (selection.length === 0) return
        e.preventDefault()
        const step = useProjectStore.getState().doc.settings.movementStepMm
        const factor = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
        const distance = roundMm(step * factor)
        nudgeSelection(arrow[0] * distance, arrow[1] * distance)
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') useInteractionStore.getState().setSpacePanArmed(false)
    }

    const onBlur = () => useInteractionStore.getState().setSpacePanArmed(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
