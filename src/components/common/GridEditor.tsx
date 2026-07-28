import type { GridAlign, GridDefinition } from '@/models/grid'
import { GRID_PRESETS } from '@/models/grid'
import { canTranspose, hasFractionalCells, transposeGrid, MAX_GRID_COUNT } from '@/geometry/grid'
import { PlainNumberField } from './NumberField'
import { Segmented } from './Segmented'
import { IconButton } from './IconButton'

type Props = {
  grid: GridDefinition
  onChange: (grid: GridDefinition) => void
  /** Renders the on/off checkbox (surface grid). */
  showToggle?: boolean
  idPrefix: string
}

function presetIdOf(grid: GridDefinition): string {
  if (grid.mode === 'golden') return 'golden'
  const match = GRID_PRESETS.find(
    (p) => p.mode === 'cells' && p.cols === grid.cols && p.rows === grid.rows,
  )
  return match?.id ?? 'custom'
}

const H_ALIGN_OPTIONS: { value: GridAlign; label: string; title: string }[] = [
  { value: 'start', label: 'Venstre', title: 'Start fra venstre – hele celler fra venstre kant' },
  { value: 'center', label: 'Sentrer', title: 'Sentrer – symmetrisk avkutting på begge sider' },
  { value: 'end', label: 'Høyre', title: 'Start fra høyre – hele celler fra høyre kant' },
]

const V_ALIGN_OPTIONS: { value: GridAlign; label: string; title: string }[] = [
  { value: 'start', label: 'Topp', title: 'Start fra toppen – hele celler fra toppen' },
  { value: 'center', label: 'Sentrer', title: 'Sentrer – symmetrisk avkutting oppe og nede' },
  { value: 'end', label: 'Bunn', title: 'Start fra bunnen – hele celler fra bunnen' },
]

/** Shared grid editor used for both the surface grid and each object's internal grid. */
export function GridEditor({ grid, onChange, showToggle, idPrefix }: Props) {
  const preset = presetIdOf(grid)
  const isGolden = grid.mode === 'golden'
  const fractionalCols = hasFractionalCells(grid.cols)
  const fractionalRows = hasFractionalCells(grid.rows)

  return (
    <div className="stack">
      {showToggle ? (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={grid.enabled}
            data-testid={`${idPrefix}-enabled`}
            onChange={(e) => onChange({ ...grid, enabled: e.target.checked })}
          />
          <span>Vis rutenett på flaten</span>
        </label>
      ) : null}
      {showToggle ? <hr className="msep" /> : null}

      <div className="stack" aria-disabled={showToggle && !grid.enabled}>
        <div className="field">
          <span className="field__label">Oppsett</span>
          <div className="row" style={{ gap: 4 }}>
            {GRID_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn"
                aria-pressed={preset === p.id}
                data-testid={`${idPrefix}-preset-${p.id}`}
                onClick={() =>
                  onChange({
                    ...grid,
                    enabled: true,
                    mode: p.mode,
                    cols: p.mode === 'cells' ? p.cols : grid.cols,
                    rows: p.mode === 'cells' ? p.rows : grid.rows,
                  })
                }
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="btn"
              aria-pressed={preset === 'custom'}
              data-testid={`${idPrefix}-preset-custom`}
              onClick={() => onChange({ ...grid, enabled: true, mode: 'cells' })}
            >
              Egendefinert
            </button>
          </div>
        </div>

        {isGolden ? (
          <p className="hint">
            Gylne snitt viser guider ved 38,1966 % og 61,8034 % på begge akser. Celleantall,
            transponering og fasejustering gjelder ikke for dette oppsettet.
          </p>
        ) : (
          <>
            <div className="popover__row">
              <PlainNumberField
                label="Ruter vannrett"
                value={grid.cols}
                min={1}
                max={MAX_GRID_COUNT}
                testId={`${idPrefix}-cols`}
                onCommit={(cols) => onChange({ ...grid, enabled: true, mode: 'cells', cols })}
              />
              <span aria-hidden="true" style={{ paddingBottom: 8 }}>
                ×
              </span>
              <PlainNumberField
                label="Ruter loddrett"
                value={grid.rows}
                min={1}
                max={MAX_GRID_COUNT}
                testId={`${idPrefix}-rows`}
                onCommit={(rows) => onChange({ ...grid, enabled: true, mode: 'cells', rows })}
              />
              <div style={{ paddingBottom: 1 }}>
                <IconButton
                  icon="transpose"
                  label="Transponer rutenettet"
                  hint="Bytter vannrett og loddrett antall"
                  disabled={!canTranspose(grid)}
                  data-testid={`${idPrefix}-transpose`}
                  onClick={() => onChange(transposeGrid(grid))}
                />
              </div>
            </div>

            <p className="hint">Desimaltall er tillatt, for eksempel 10 × 3,5. Begge verdier må være minst 1.</p>

            {fractionalCols || fractionalRows ? (
              <>
                <hr className="msep" />
                <div className="popover__row">
                  <Segmented
                    label="Avkuttet celle vannrett"
                    value={grid.hAlign}
                    options={H_ALIGN_OPTIONS}
                    disabled={!fractionalCols}
                    testId={`${idPrefix}-halign`}
                    onChange={(hAlign) => onChange({ ...grid, hAlign })}
                  />
                  <Segmented
                    label="Avkuttet celle loddrett"
                    value={grid.vAlign}
                    options={V_ALIGN_OPTIONS}
                    disabled={!fractionalRows}
                    testId={`${idPrefix}-valign`}
                    onChange={(vAlign) => onChange({ ...grid, vAlign })}
                  />
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
