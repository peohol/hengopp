import { Popover } from '@/components/common/Popover'
import { LengthField } from '@/components/common/NumberField'
import { ColorField } from '@/components/common/ColorField'
import { useProjectStore } from '@/state/project-store'

export function SurfacePopover() {
  const doc = useProjectStore((s) => s.doc)
  const commit = useProjectStore((s) => s.commit)

  return (
    <Popover
      icon="surface"
      label="Flate"
      hint="Bredde, høyde og farge på flaten"
      showLabel
      title="Flate"
      testId="surface-popover"
    >
      {() => (
        <div className="stack">
          <div className="popover__row">
            <LengthField
              label="Bredde"
              valueMm={doc.surface.widthMm}
              unit={doc.displayUnit}
              stepMm={doc.settings.movementStepMm}
              positiveOnly
              testId="surface-width"
              onCommit={(v) => commit((draft) => void (draft.surface.widthMm = v))}
            />
            <LengthField
              label="Høyde"
              valueMm={doc.surface.heightMm}
              unit={doc.displayUnit}
              stepMm={doc.settings.movementStepMm}
              positiveOnly
              testId="surface-height"
              onCommit={(v) => commit((draft) => void (draft.surface.heightMm = v))}
            />
          </div>
          <ColorField
            label="Flatefarge"
            value={doc.surface.color}
            testId="surface-color"
            onChange={(hex) => commit((draft) => void (draft.surface.color = hex))}
          />
          <p className="hint">
            Flaten er grunnflaten alle objekter er relative til. Objekter flyttes ikke automatisk hvis
            flaten gjøres mindre – de markeres i stedet som utenfor flaten.
          </p>
        </div>
      )}
    </Popover>
  )
}
