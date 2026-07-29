import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LengthField } from '@/components/common/NumberField'
import { Segmented } from '@/components/common/Segmented'
import type { GuideOrigin } from '@/models/guide'
import { guidePosFromOrigin, guideValueFromOrigin, surfaceExtentFor } from '@/geometry/guides'
import { setGuidePos, toggleGuideLock } from '@/state/doc-actions'
import { deleteGuide } from '@/state/commands'
import { useProjectStore } from '@/state/project-store'
import { useUiStore } from '@/state/ui-store'

const MARGIN = 8

/**
 * Exact position for a guide line, opened by double clicking (or double
 * tapping) it. The position can be given from either surface edge, which is how
 * people actually describe a wall: "40 cm from the ceiling".
 */
export function GuidePopover() {
  const state = useUiStore((s) => s.guideDialog)
  const doc = useProjectStore((s) => s.doc)
  const guide = state ? doc.guides.find((g) => g.id === state.guideId) : undefined
  if (!state || !guide) return null
  return <GuideEditor key={guide.id} guideId={guide.id} anchor={state.anchor} />
}

function GuideEditor({ guideId, anchor }: { guideId: string; anchor: { x: number; y: number } }) {
  const doc = useProjectStore((s) => s.doc)
  const commit = useProjectStore((s) => s.commit)
  const close = useUiStore((s) => s.closeGuideDialog)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [origin, setOrigin] = useState<GuideOrigin>('start')

  const guide = doc.guides.find((g) => g.id === guideId)
  const vertical = guide?.axis === 'x'
  const sizeMm = guide ? surfaceExtentFor(doc.surface, guide.axis) : 0

  useLayoutEffect(() => {
    const update = () => {
      const el = panelRef.current
      if (!el) return
      const width = el.offsetWidth || 260
      const height = el.offsetHeight || 180
      setPosition({
        left: Math.max(MARGIN, Math.min(window.innerWidth - width - MARGIN, anchor.x + 12)),
        top: Math.max(MARGIN, Math.min(window.innerHeight - height - MARGIN, anchor.y + 12)),
      })
    }
    update()
    const raf = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
    }
  }, [anchor.x, anchor.y])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return
      close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [close])

  if (!guide || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="popover"
      ref={panelRef}
      role="dialog"
      aria-label="Skillelinje"
      data-testid="guide-popover"
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? 'visible' : 'hidden',
        minWidth: 250,
      }}
    >
      <p className="popover__title">{vertical ? 'Loddrett skillelinje' : 'Vannrett skillelinje'}</p>
      <div className="stack">
        <Segmented<GuideOrigin>
          label="Mål posisjonen fra"
          value={origin}
          stacked
          testId="guide-origin"
          options={
            vertical
              ? [
                  { value: 'start', label: 'Venstre kant' },
                  { value: 'end', label: 'Høyre kant' },
                ]
              : [
                  { value: 'start', label: 'Toppen' },
                  { value: 'end', label: 'Bunnen' },
                ]
          }
          onChange={setOrigin}
        />
        <LengthField
          label={vertical ? 'X-posisjon' : 'Y-posisjon'}
          valueMm={guideValueFromOrigin(guide.posMm, origin, sizeMm)}
          unit={doc.displayUnit}
          stepMm={doc.settings.movementStepMm}
          testId="guide-position"
          onCommit={(value) =>
            commit((draft) => setGuidePos(draft, guideId, guidePosFromOrigin(value, origin, sizeMm)))
          }
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={guide.locked}
            data-testid="guide-locked"
            onChange={() => commit((draft) => toggleGuideLock(draft, guideId))}
          />
          <span>Lås posisjonen</span>
        </label>
        <hr className="msep" />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn btn--danger"
            data-testid="guide-remove"
            onClick={() => {
              deleteGuide(guideId)
              close()
            }}
          >
            Fjern
          </button>
          <button type="button" className="btn" data-testid="guide-close" onClick={close}>
            Lukk
          </button>
        </div>
        <p className="hint">
          Posisjonen holdes innenfor flaten. Ved dragning brukes endringssteget, og linjen snapper til
          objekter, andre skillelinjer og rutenettet – hold Alt for fri plassering. Låsen gjelder dragning
          på lerretet; en verdi du skriver inn her brukes uansett.
        </p>
      </div>
    </div>,
    document.body,
  )
}
