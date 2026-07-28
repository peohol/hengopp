import { Popover } from '@/components/common/Popover'
import { LengthField } from '@/components/common/NumberField'
import { useProjectStore } from '@/state/project-store'
import { STEP_PRESETS, formatLength } from '@/utils/units'

/** Movement step (used by arrow keys and the +/- buttons in numeric inputs). */
export function StepPopover() {
  const doc = useProjectStore((s) => s.doc)
  const patch = useProjectStore((s) => s.patch)
  const presets = STEP_PRESETS[doc.displayUnit]

  return (
    <Popover
      icon="unit"
      label={`Steg ${formatLength(doc.settings.movementStepMm, doc.displayUnit)}`}
      hint="Endringssteg for piltaster og +/- knapper"
      showLabel
      title="Endringssteg"
      testId="step-popover"
    >
      {() => (
        <div className="stack">
          <div className="row" style={{ gap: 4 }}>
            {presets.map((stepMm) => (
              <button
                key={stepMm}
                type="button"
                className="btn"
                aria-pressed={doc.settings.movementStepMm === stepMm}
                data-testid={`step-${stepMm}`}
                onClick={() => patch((draft) => void (draft.settings.movementStepMm = stepMm))}
              >
                {formatLength(stepMm, doc.displayUnit)}
              </button>
            ))}
          </div>
          <LengthField
            label="Egendefinert steg"
            valueMm={doc.settings.movementStepMm}
            unit={doc.displayUnit}
            stepMm={1}
            positiveOnly
            testId="step-custom"
            onCommit={(v) => patch((draft) => void (draft.settings.movementStepMm = v))}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={doc.settings.quantiseDrag}
              data-testid="quantise-drag"
              onChange={(e) => patch((draft) => void (draft.settings.quantiseDrag = e.target.checked))}
            />
            <span>Bruk steget også ved fri flytting med mus og finger</span>
          </label>
          <p className="hint">
            Endringssteget brukes av piltaster og pluss/minus. Snapping er en egen mekanisme – som standard
            er flytting kontinuerlig med snapping.
          </p>
        </div>
      )}
    </Popover>
  )
}
