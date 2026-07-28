import { useRef, useState } from 'react'
import { Popover } from '@/components/common/Popover'
import { Segmented } from '@/components/common/Segmented'
import { Icon } from '@/components/icons/Icon'
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
    // The selection is part of the key: a pending confirmation must never carry
    // over to a different set of objects.
    const key = `${axis}-${reference}-${target}-${outerGap}-${selection.join(',')}`
    const confirmed = pendingRef.current === key
    const done = distributeSelection({ axis, reference, target, outerGap }, confirmed)
    pendingRef.current = done ? null : key
  }

  const reset = () => {
    pendingRef.current = null
  }

  return (
    <Popover
      icon="distribute"
      label="Fordeling"
      hint="Gi objektene like avstander"
      showLabel
      disabled={selection.length === 0}
      title="Fordeling"
      testId="distribute-popover"
    >
      {() => (
        <div className="stack" style={{ width: 300 }}>
          <Segmented
            label="Referanse"
            stacked
            value={reference}
            testId="distribute-reference"
            options={[
              { value: 'selection', label: 'De ytterste objektene' },
              { value: 'surface', label: 'Flaten' },
            ]}
            onChange={(v) => {
              setReference(v)
              reset()
            }}
          />

          <hr className="msep" />

          <Segmented
            label="Juster avstand mellom …"
            stacked
            value={target}
            testId="distribute-target"
            options={[
              { value: 'edges', label: 'Kantene' },
              { value: 'anchors', label: 'Ankerpunktene' },
            ]}
            onChange={(v) => {
              setTarget(v)
              reset()
            }}
          />

          {reference === 'surface' ? (
            <>
              <hr className="msep" />
              <Segmented
                label="Luft ved flatens kanter"
                stacked
                value={outerGap ? 'yes' : 'no'}
                testId="distribute-outer"
                options={[
                  { value: 'yes', label: 'Lik ytterluft' },
                  { value: 'no', label: 'Uten ytterluft' },
                ]}
                onChange={(v) => {
                  setOuterGap(v === 'yes')
                  reset()
                }}
              />
            </>
          ) : null}

          <hr className="msep" />

          <div className="stack" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn btn--action"
              disabled={disabled}
              data-testid="distribute-horizontal"
              onClick={() => run('x')}
            >
              <Icon name="distributeH" />
              <span>Fordel vannrett</span>
            </button>
            <button
              type="button"
              className="btn btn--action"
              disabled={disabled}
              data-testid="distribute-vertical"
              onClick={() => run('y')}
            >
              <Icon name="distributeV" />
              <span>Fordel loddrett</span>
            </button>
          </div>

          <p className="hint">
            {disabled
              ? `Velg minst ${minimum} objekter for denne fordelingen.`
              : reference === 'selection'
                ? 'De to ytterste objektene står stille. Resten fordeles jevnt mellom dem.'
                : 'Objektene fordeles jevnt over hele flaten.'}
          </p>
        </div>
      )}
    </Popover>
  )
}
