import { useRef, useState } from 'react'
import { Popover } from '@/components/common/Popover'
import { Segmented } from '@/components/common/Segmented'
import {
  minimumEntities,
  type DistributeReference,
  type DistributeTarget,
} from '@/geometry/distribution'
import { distributeSelection } from '@/state/commands'
import { useInteractionStore } from '@/state/interaction-store'

export function DistributePopover() {
  const selection = useInteractionStore((s) => s.selection)
  const [reference, setReference] = useState<DistributeReference>('selection')
  const [target, setTarget] = useState<DistributeTarget>('edges')
  const [outerGap, setOuterGap] = useState(true)
  /** Set after a warning, so the second click confirms an overlapping result. */
  const pendingRef = useRef<string | null>(null)

  const minimum = minimumEntities({ reference, outerGap })
  const disabled = selection.length < minimum

  const run = (axis: 'x' | 'y') => {
    const key = `${axis}-${reference}-${target}-${outerGap}`
    const confirmed = pendingRef.current === key
    const done = distributeSelection({ axis, reference, target, outerGap }, confirmed)
    pendingRef.current = done ? null : key
  }

  return (
    <Popover
      icon="distribute"
      label="Fordel"
      hint="Fordel objekter med like avstander"
      showLabel
      disabled={selection.length < 2}
      title="Fordel"
      testId="distribute-popover"
    >
      {() => (
        <div className="stack" style={{ minWidth: 300 }}>
          <Segmented
            label="Referanse"
            value={reference}
            testId="distribute-reference"
            options={[
              { value: 'selection', label: 'Ytterste valgte' },
              { value: 'surface', label: 'Hele flaten' },
            ]}
            onChange={(v) => {
              setReference(v)
              pendingRef.current = null
            }}
          />
          <Segmented
            label="Måltype"
            value={target}
            testId="distribute-target"
            options={[
              { value: 'edges', label: 'Kanter' },
              { value: 'anchors', label: 'Ankerpunkt' },
            ]}
            onChange={(v) => {
              setTarget(v)
              pendingRef.current = null
            }}
          />
          {reference === 'surface' ? (
            <Segmented
              label="Luft ved flatens kanter"
              value={outerGap ? 'yes' : 'no'}
              testId="distribute-outer"
              options={[
                { value: 'yes', label: 'Lik ytterluft' },
                { value: 'no', label: 'Uten ytterluft' },
              ]}
              onChange={(v) => {
                setOuterGap(v === 'yes')
                pendingRef.current = null
              }}
            />
          ) : null}

          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={disabled}
              data-testid="distribute-horizontal"
              onClick={() => run('x')}
            >
              Fordel horisontalt
            </button>
            <button
              type="button"
              className="btn"
              disabled={disabled}
              data-testid="distribute-vertical"
              onClick={() => run('y')}
            >
              Fordel vertikalt
            </button>
          </div>
          {disabled ? (
            <p className="hint">Velg minst {minimum} enheter for denne fordelingen.</p>
          ) : (
            <p className="hint">
              {reference === 'selection'
                ? 'De to ytterste valgte enhetene står stille. Resten fordeles jevnt mellom dem.'
                : 'Enhetene fordeles i forhold til hele flaten.'}
            </p>
          )}
        </div>
      )}
    </Popover>
  )
}
