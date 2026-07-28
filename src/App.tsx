import { useEffect, useRef } from 'react'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { Canvas } from '@/components/canvas/Canvas'
import { CanvasStatus, GroupBreadcrumb } from '@/components/canvas/CanvasChrome'
import { ObjectDialog } from '@/components/dialogs/ObjectDialog'
import { SetupDialog } from '@/components/dialogs/SetupDialog'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { HelpDialog } from '@/components/dialogs/HelpDialog'
import { Notices } from '@/components/Notices'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { flushSave, useProjectStore } from '@/state/project-store'
import { useUiStore } from '@/state/ui-store'
import { isOutsideSurface } from '@/components/canvas/scene-helpers'

export function App() {
  useKeyboardShortcuts()

  const doc = useProjectStore((s) => s.doc)
  const storageNotice = useProjectStore((s) => s.storageNotice)
  const outsideNoticeRef = useRef<string | null>(null)

  // First run: ask for the surface up front.
  useEffect(() => {
    if (useProjectStore.getState().doc.isDraftSetup) {
      useUiStore.getState().setSetupDialogOpen(true)
    }
  }, [])

  // Surface storage problems / recovery as a non-blocking notice.
  useEffect(() => {
    if (!storageNotice) return
    useUiStore.getState().notify('warning', storageNotice)
    useProjectStore.getState().setStorageNotice(null)
  }, [storageNotice])

  // Non-blocking warning when objects end up outside the surface.
  useEffect(() => {
    const count = Object.values(doc.objects).filter((o) =>
      isOutsideSurface(
        { x: o.xMm, y: o.yMm, width: o.widthMm, height: o.heightMm },
        doc.surface.widthMm,
        doc.surface.heightMm,
      ),
    ).length

    const ui = useUiStore.getState()
    if (count > 0) {
      const message =
        count === 1
          ? '1 objekt ligger helt eller delvis utenfor flaten. Det er markert med stiplet rød ramme.'
          : `${count} objekter ligger helt eller delvis utenfor flaten. De er markert med stiplet rød ramme.`
      if (outsideNoticeRef.current) {
        const existing = ui.notices.find((n) => n.id === outsideNoticeRef.current)
        if (existing && existing.message === message) return
        ui.dismissNotice(outsideNoticeRef.current)
      }
      outsideNoticeRef.current = ui.notify('warning', message)
    } else if (outsideNoticeRef.current) {
      ui.dismissNotice(outsideNoticeRef.current)
      outsideNoticeRef.current = null
    }
  }, [doc.objects, doc.surface.widthMm, doc.surface.heightMm])

  // Never lose a pending autosave.
  useEffect(() => {
    const onUnload = () => flushSave()
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
    }
  }, [])

  return (
    <div className="app">
      <Toolbar />
      <main className="workspace-wrapper">
        <Canvas />
        <GroupBreadcrumb />
        <CanvasStatus />
        <Notices />
      </main>
      <ObjectDialog />
      <SetupDialog />
      <ConfirmDialog />
      <HelpDialog />
    </div>
  )
}
