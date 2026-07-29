import { useEffect } from 'react'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useUiStore } from '@/state/ui-store'
import {
  deleteSelection,
  duplicateSelection,
  exitGroupLevel,
  groupSelection,
  movableSelection,
  nudgeSelection,
  redo,
  selectAllOnLevel,
  setTool,
  toggleMeasureTool,
  toggleSelectionLock,
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

      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        toggleSelectionLock()
        return
      }

      // Unmodified tool shortcuts: M measures, V returns to selecting.
      if (!mod && !e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        toggleMeasureTool()
        return
      }
      if (!mod && !e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        setTool('select')
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
        if (interaction.tool !== 'select') {
          e.preventDefault()
          setTool('select')
          return
        }
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
        // A locked object stays put, so the key press is left to the browser
        // rather than swallowed for nothing.
        if (movableSelection().length === 0) return
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

    // Ctrl/Cmd held arms deletion of a hovered measuring line, so the canvas
    // needs to know about the modifier even when no key press is a shortcut.
    const trackModifier = (e: KeyboardEvent) =>
      useInteractionStore.getState().setDeleteArmed(e.metaKey || e.ctrlKey)

    const onBlur = () => {
      const interaction = useInteractionStore.getState()
      interaction.setSpacePanArmed(false)
      interaction.setDeleteArmed(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keydown', trackModifier)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keyup', trackModifier)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keydown', trackModifier)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keyup', trackModifier)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
