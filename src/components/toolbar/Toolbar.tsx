import { useState } from 'react'
import { IconButton } from '@/components/common/IconButton'
import { Segmented } from '@/components/common/Segmented'
import { Popover } from '@/components/common/Popover'
import { SurfacePopover } from '@/components/popovers/SurfacePopover'
import { GridPopover } from '@/components/popovers/GridPopover'
import { StepPopover } from '@/components/popovers/PrecisionPopover'
import { AlignPopover } from '@/components/popovers/AlignPopover'
import { DistributePopover } from '@/components/popovers/DistributePopover'
import { ProjectMenu } from '@/components/popovers/ProjectMenu'
import { ObjectFields } from './ObjectFields'
import { useProjectStore, selectCanRedo, selectCanUndo } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { useUiStore } from '@/state/ui-store'
import {
  deleteSelection,
  duplicateSelection,
  groupSelection,
  redo,
  reorderSelection,
  undo,
  ungroupSelection,
} from '@/state/commands'
import { zoomPercent } from '@/geometry/coordinates'
import { MOD_LABEL } from '@/utils/keyboard'
import type { Unit } from '@/models/project'

export function Toolbar() {
  const doc = useProjectStore((s) => s.doc)
  const patch = useProjectStore((s) => s.patch)
  const canUndo = useProjectStore(selectCanUndo)
  const canRedo = useProjectStore(selectCanRedo)
  const selection = useInteractionStore((s) => s.selection)
  const multiSelectMode = useInteractionStore((s) => s.multiSelectMode)
  const setMultiSelectMode = useInteractionStore((s) => s.setMultiSelectMode)
  const viewport = useViewportStore((s) => s.viewport)
  const baseScale = useViewportStore((s) => s.baseScale)

  const hasSelection = selection.length > 0
  const hasGroupSelected = selection.some((id) => doc.groups[id])

  return (
    <header className="toolbar" data-testid="toolbar">
      <div className="toolbar__inner">
        <div className="toolbar__brand">
          <span>Hengopp</span>
        </div>

        <div className="tgroup">
          <ProjectMenu />
          <Segmented<Unit>
            label="Enhet"
            value={doc.displayUnit}
            hideLabel
            testId="unit"
            options={[
              { value: 'cm', label: 'cm', title: 'Vis mål i centimeter' },
              { value: 'mm', label: 'mm', title: 'Vis mål i millimeter' },
            ]}
            onChange={(unit) => patch((draft) => void (draft.displayUnit = unit))}
          />
          <SurfacePopover />
          <GridPopover />
        </div>

        <div className="tgroup">
          <span className="tgroup__label">Objekter</span>
          <IconButton
            icon="newObject"
            label="Nytt objekt"
            hint="Opprett rektangel eller oval"
            showLabel
            data-testid="new-object"
            onClick={() => useUiStore.getState().openObjectDialog({ mode: 'create' })}
          />
          <ObjectFields />
          <IconButton
            icon="duplicate"
            label="Dupliser"
            hint={`${MOD_LABEL} + D`}
            disabled={!hasSelection}
            data-testid="duplicate"
            onClick={duplicateSelection}
          />
          <IconButton
            icon="trash"
            label="Slett"
            hint="Delete"
            disabled={!hasSelection}
            data-testid="delete"
            onClick={deleteSelection}
          />
        </div>

        <div className="tgroup">
          <span className="tgroup__label">Presisjon</span>
          <StepPopover />
          <IconButton
            icon="snapGrid"
            label="Snap til rutenett"
            hint="Hold Alt for å slå av snapping midlertidig"
            active={doc.settings.snapToGrid}
            data-testid="snap-grid"
            onClick={() => patch((draft) => void (draft.settings.snapToGrid = !draft.settings.snapToGrid))}
          />
          <IconButton
            icon="snapObjects"
            label="Snap til objekter"
            hint="Kanter, midtlinjer og ankerpunkt"
            active={doc.settings.snapToObjects}
            data-testid="snap-objects"
            onClick={() =>
              patch((draft) => void (draft.settings.snapToObjects = !draft.settings.snapToObjects))
            }
          />
          <IconButton
            icon="multiSelect"
            label="Flervalgsmodus"
            hint="Trykk på objekter for å legge til eller fjerne dem fra utvalget"
            active={multiSelectMode}
            data-testid="multi-select"
            onClick={() => setMultiSelectMode(!multiSelectMode)}
          />
        </div>

        <div className="tgroup">
          <span className="tgroup__label">Organisering</span>
          <AlignPopover />
          <DistributePopover />
          <IconButton
            icon="group"
            label="Grupper"
            hint={`${MOD_LABEL} + G`}
            disabled={selection.length < 2}
            data-testid="group"
            onClick={groupSelection}
          />
          <IconButton
            icon="ungroup"
            label="Løs opp gruppe"
            hint={`${MOD_LABEL} + Shift + G`}
            disabled={!hasGroupSelected}
            data-testid="ungroup"
            onClick={ungroupSelection}
          />
          <IconButton
            icon="forward"
            label="Flytt ett nivå frem"
            disabled={!hasSelection}
            data-testid="z-forward"
            onClick={() => reorderSelection('forward')}
          />
          <IconButton
            icon="backward"
            label="Flytt ett nivå bak"
            disabled={!hasSelection}
            data-testid="z-backward"
            onClick={() => reorderSelection('backward')}
          />
          <Popover
            icon="layers"
            label="Lagrekkefølge"
            hint="Helt fremst og helt bakerst"
            disabled={!hasSelection}
            title="Lagrekkefølge"
            testId="z-popover"
          >
            {(close) => (
              <div className="stack">
                <button
                  type="button"
                  className="btn"
                  data-testid="z-front"
                  onClick={() => {
                    reorderSelection('front')
                    close()
                  }}
                >
                  Flytt helt fremst
                </button>
                <button
                  type="button"
                  className="btn"
                  data-testid="z-back"
                  onClick={() => {
                    reorderSelection('back')
                    close()
                  }}
                >
                  Flytt helt bakerst
                </button>
                <p className="hint">Et flervalg flyttes som én sammenhengende blokk.</p>
              </div>
            )}
          </Popover>
        </div>

        <div className="tgroup">
          <span className="tgroup__label">Historikk</span>
          <IconButton
            icon="undo"
            label="Angre"
            hint={`${MOD_LABEL} + Z`}
            disabled={!canUndo}
            data-testid="undo"
            onClick={undo}
          />
          <IconButton
            icon="redo"
            label="Gjør om"
            hint={`${MOD_LABEL} + Shift + Z`}
            disabled={!canRedo}
            data-testid="redo"
            onClick={redo}
          />
        </div>

        <div className="tgroup">
          <span className="tgroup__label">Visning</span>
          <IconButton
            icon="zoomOut"
            label="Zoom ut"
            data-testid="zoom-out"
            onClick={() => useViewportStore.getState().zoomBy(1 / 1.25)}
          />
          <ZoomField percent={zoomPercent(viewport, baseScale)} />
          <IconButton
            icon="zoomIn"
            label="Zoom inn"
            data-testid="zoom-in"
            onClick={() => useViewportStore.getState().zoomBy(1.25)}
          />
          <IconButton
            icon="fit"
            label="Tilpass flaten til tilgjengelig plass"
            data-testid="zoom-fit"
            onClick={() => useViewportStore.getState().fitToSurface(doc.surface.widthMm, doc.surface.heightMm)}
          />
          <IconButton
            icon="help"
            label="Hjelp og tastatursnarveier"
            data-testid="help"
            onClick={() => useUiStore.getState().setHelpOpen(true)}
          />
        </div>
      </div>
    </header>
  )
}

function ZoomField({ percent }: { percent: number }) {
  const [text, setText] = useState('')
  const display = text || `${Math.round(percent)}`
  return (
    <div className="field">
      <label className="visually-hidden" htmlFor="zoom-percent">
        Zoomprosent
      </label>
      <div className="field__row">
        <input
          id="zoom-percent"
          className=""
          type="text"
          inputMode="numeric"
          style={{ width: 52, textAlign: 'right' }}
          value={display}
          data-testid="zoom-percent"
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => {
            const value = Number(text)
            if (Number.isFinite(value) && value > 0) useViewportStore.getState().setZoomPercent(value)
            setText('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setText('')
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <span className="field__suffix">%</span>
      </div>
    </div>
  )
}
