import { Popover } from '@/components/common/Popover'
import { ALIGN_H, ALIGN_LABELS, ALIGN_V, type AlignH, type AlignV } from '@/geometry/alignment'
import { alignSelection } from '@/state/commands'
import { useInteractionStore } from '@/state/interaction-store'

/** Mini diagram showing where the objects end up relative to the key object. */
function AlignGlyph({ h, v }: { h: AlignH; v: AlignV }) {
  const x = h === 'left' ? 4 : h === 'anchor' ? 12 : 20
  const y = v === 'top' ? 4 : v === 'anchor' ? 12 : 20
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" focusable="false">
      <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke="#c3c5ca" />
      {h === 'anchor' ? <line x1={12} y1={2.5} x2={12} y2={21.5} stroke="#2f6fd0" strokeDasharray="2 2" /> : null}
      {v === 'anchor' ? <line x1={2.5} y1={12} x2={21.5} y2={12} stroke="#2f6fd0" strokeDasharray="2 2" /> : null}
      {h !== 'anchor' ? <line x1={x} y1={2.5} x2={x} y2={21.5} stroke="#2f6fd0" /> : null}
      {v !== 'anchor' ? <line x1={2.5} y1={y} x2={21.5} y2={y} stroke="#2f6fd0" /> : null}
      <rect
        x={h === 'left' ? 4 : h === 'anchor' ? 8 : 12}
        y={v === 'top' ? 4 : v === 'anchor' ? 8 : 12}
        width="8"
        height="8"
        fill="#cfe0f5"
        stroke="#14161a"
      />
    </svg>
  )
}

export function AlignPopover() {
  const selection = useInteractionStore((s) => s.selection)
  const disabled = selection.length < 2

  return (
    <Popover
      icon="align"
      label="Juster"
      hint="Juster mot nøkkelobjektet (sist valgte)"
      showLabel
      disabled={disabled}
      title="Juster mot nøkkelobjektet"
      testId="align-popover"
    >
      {(close) => (
        <div className="stack" style={{ width: 210 }}>
          <div className="matrix" role="group" aria-label="Justeringsmatrise">
            {ALIGN_V.map((v) =>
              ALIGN_H.map((h) => (
                <button
                  key={`${v}-${h}`}
                  type="button"
                  aria-label={ALIGN_LABELS[`${v}-${h}`]}
                  title={ALIGN_LABELS[`${v}-${h}`]}
                  data-testid={`align-${v}-${h}`}
                  disabled={disabled}
                  onClick={() => {
                    alignSelection(h, v)
                    close()
                  }}
                >
                  <AlignGlyph h={h} v={v} />
                </button>
              )),
            )}
          </div>
          <p className="hint">
            Nøkkelobjektet – det sist valgte – står stille. Alle andre valgte enheter flyttes mot det.
            Midtre kolonne og rad bruker ankerpunktene.
          </p>
        </div>
      )}
    </Popover>
  )
}
