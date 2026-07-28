import { useRef, useState } from 'react'
import { Modal } from '@/components/common/Modal'
import { LengthField } from '@/components/common/NumberField'
import { ColorField } from '@/components/common/ColorField'
import { Segmented } from '@/components/common/Segmented'
import type { Unit } from '@/models/project'
import { DEFAULT_SURFACE } from '@/models/project'
import { useProjectStore } from '@/state/project-store'
import { useViewportStore } from '@/state/viewport-store'
import { useUiStore } from '@/state/ui-store'

/** First-run surface setup. Sensible defaults, clearly editable later. */
export function SetupDialog() {
  const doc = useProjectStore((s) => s.doc)
  const patch = useProjectStore((s) => s.patch)
  const open = useUiStore((s) => s.setupDialogOpen)
  const startRef = useRef<HTMLInputElement>(null)

  const [unit, setUnit] = useState<Unit>(doc.displayUnit)
  const [widthMm, setWidthMm] = useState(doc.surface.widthMm || DEFAULT_SURFACE.widthMm)
  const [heightMm, setHeightMm] = useState(doc.surface.heightMm || DEFAULT_SURFACE.heightMm)
  const [color, setColor] = useState(doc.surface.color)

  if (!open) return null

  const finish = () => {
    patch((draft) => {
      draft.displayUnit = unit
      draft.surface.widthMm = widthMm
      draft.surface.heightMm = heightMm
      draft.surface.color = color
      draft.isDraftSetup = false
    })
    useViewportStore.getState().fitToSurface(widthMm, heightMm)
    useUiStore.getState().setSetupDialogOpen(false)
  }

  return (
    <Modal
      title="Sett opp flaten"
      narrow
      testId="setup-dialog"
      initialFocusRef={startRef}
      onClose={() => {
        patch((draft) => void (draft.isDraftSetup = false))
        useUiStore.getState().setSetupDialogOpen(false)
      }}
      footer={
        <button type="button" className="btn btn--primary" data-testid="setup-save" onClick={finish}>
          Kom i gang
        </button>
      }
    >
      <div className="stack">
        <p className="hint">
          Flaten er som regel en vegg. Alle objekter plasseres relativt til den. Du kan endre alt senere fra
          toppmenyen.
        </p>
        <Segmented<Unit>
          label="Enhet"
          value={unit}
          testId="setup-unit"
          options={[
            { value: 'cm', label: 'cm' },
            { value: 'mm', label: 'mm' },
          ]}
          onChange={setUnit}
        />
        <div className="popover__row">
          <LengthField
            label="Bredde"
            valueMm={widthMm}
            unit={unit}
            stepMm={10}
            positiveOnly
            testId="setup-width"
            onCommit={setWidthMm}
          />
          <LengthField
            label="Høyde"
            valueMm={heightMm}
            unit={unit}
            stepMm={10}
            positiveOnly
            testId="setup-height"
            onCommit={setHeightMm}
          />
        </div>
        <ColorField label="Flatefarge" value={color} testId="setup-color" onChange={setColor} />
      </div>
    </Modal>
  )
}
