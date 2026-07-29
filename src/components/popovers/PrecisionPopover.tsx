import { Popover } from '@/components/common/Popover'
import { LengthField } from '@/components/common/NumberField'
import { useProjectStore } from '@/state/project-store'
import { STEP_PRESETS, formatLength } from '@/utils/units'

/** Change step (arrow keys, the +/- buttons in numeric inputs and free drag). */
export function StepPopover() {
  const doc = useProjectStore((s) => s.doc)
  const patch = useProjectStore((s) => s.patch)
  const presets = STEP_PRESETS[doc.displayUnit]

  return (
    <Popover
      icon="unit"
      label={`Steg ${formatLength(doc.settings.movementStepMm, doc.displayUnit)}`}
      hint="Endringssteg for piltaster, +/- knapper og draoperasjoner"
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
          <hr className="msep" />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={doc.settings.quantiseDrag}
              data-testid="quantise-drag"
              onChange={(e) => patch((draft) => void (draft.settings.quantiseDrag = e.target.checked))}
            />
            <span>Bruk steget også ved fri flytting og skalering med mus og finger</span>
          </label>
          <hr className="msep" />
          <p className="hint">
            Endringssteget brukes av piltaster og pluss/minus. Står valget over på – som det gjør fra
            start – endres både posisjon og størrelse i hele steg når du drar i lerretet, og nøyaktige
            verdier settes i feltene for posisjon og størrelse. Snapping er en egen mekanisme som
            gjelder uansett.
          </p>
        </div>
      )}
    </Popover>
  )
}
