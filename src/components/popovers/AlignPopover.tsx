import { useState } from 'react'
import { Popover } from '@/components/common/Popover'
import { Segmented } from '@/components/common/Segmented'
import { Icon, type IconName } from '@/components/icons/Icon'
import {
  minimumEntities,
  type AlignAxis,
  type AlignCenterBasis,
  type AlignMode,
  type AlignReference,
} from '@/geometry/alignment'
import { alignSelection } from '@/state/commands'
import { useInteractionStore } from '@/state/interaction-store'

type AlignAction = {
  axis: AlignAxis
  mode: AlignMode
  icon: IconName
  /** Short label — the column heading says which axis it belongs to. */
  label: string
  /** Full name used for the tooltip and the accessible name. */
  title: string
  testId: string
}

const HORIZONTAL: AlignAction[] = [
  { axis: 'x', mode: 'start', icon: 'alignLeft', label: 'Venstrejuster', title: 'Venstrejuster', testId: 'align-left' },
  { axis: 'x', mode: 'center', icon: 'alignCenterX', label: 'Midtstill', title: 'Midtstill vannrett', testId: 'align-center-x' },
  { axis: 'x', mode: 'end', icon: 'alignRight', label: 'Høyrejuster', title: 'Høyrejuster', testId: 'align-right' },
]

const VERTICAL: AlignAction[] = [
  { axis: 'y', mode: 'start', icon: 'alignTop', label: 'Toppjuster', title: 'Toppjuster', testId: 'align-top' },
  { axis: 'y', mode: 'center', icon: 'alignMiddleY', label: 'Midtstill', title: 'Midtstill loddrett', testId: 'align-middle-y' },
  { axis: 'y', mode: 'end', icon: 'alignBottom', label: 'Bunnjuster', title: 'Bunnjuster', testId: 'align-bottom' },
]

export function AlignPopover() {
  const selection = useInteractionStore((s) => s.selection)
  const [reference, setReference] = useState<AlignReference>('surface')
  const [centerBasis, setCenterBasis] = useState<AlignCenterBasis>('bounds')

  const minimum = minimumEntities(reference)
  const tooFew = selection.length < minimum

  const column = (heading: string, actions: AlignAction[]) => (
    <div className="menu-col">
      <span className="field__label">{heading}</span>
      {actions.map((a) => (
        <button
          key={a.testId}
          type="button"
          className="menu-btn"
          title={a.title}
          aria-label={a.title}
          disabled={tooFew}
          data-testid={a.testId}
          onClick={() => alignSelection({ axis: a.axis, mode: a.mode, reference, centerBasis })}
        >
          <Icon name={a.icon} />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  )

  return (
    <Popover
      icon="align"
      label="Justering"
      hint="Juster mot flaten eller mot det sist valgte objektet"
      showLabel
      disabled={selection.length === 0}
      title="Justering"
      testId="align-popover"
    >
      {() => (
        <div className="stack" style={{ width: 300 }}>
          <div className="menu-grid">
            {column('Vannrett', HORIZONTAL)}
            {column('Loddrett', VERTICAL)}
          </div>

          <hr className="msep" />

          <Segmented
            label="Referanse"
            stacked
            value={reference}
            testId="align-reference"
            options={[
              { value: 'surface', label: 'Flaten' },
              { value: 'key', label: 'Det sist valgte objektet' },
            ]}
            onChange={setReference}
          />

          <hr className="msep" />

          <Segmented
            label="Basis for midtstilling"
            stacked
            value={centerBasis}
            testId="align-center-basis"
            options={[
              { value: 'bounds', label: 'Objektenes midtpunkter' },
              { value: 'anchor', label: 'Objektenes ankerpunkter' },
            ]}
            onChange={setCenterBasis}
          />

          <p className="hint">
            {tooFew
              ? 'Velg minst to objekter for å justere mot det sist valgte.'
              : reference === 'surface'
                ? 'Hvert objekt justeres mot flaten. Vannrett justering endrer bare x-posisjonen, loddrett bare y-posisjonen.'
                : 'Det sist valgte objektet står stille; de andre flyttes til det. Bare den valgte aksen endres.'}
            {centerBasis === 'anchor' ? ' Grupper har ikke eget ankerpunkt og bruker midtpunktet sitt.' : ''}
          </p>
        </div>
      )}
    </Popover>
  )
}
