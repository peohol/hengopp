import { Popover } from '@/components/common/Popover'
import { GridEditor } from '@/components/common/GridEditor'
import { useProjectStore } from '@/state/project-store'

export function GridPopover() {
  const grid = useProjectStore((s) => s.doc.surfaceGrid)
  const commit = useProjectStore((s) => s.commit)

  return (
    <Popover
      icon="grid"
      label="Flaterutenett"
      hint="Del flaten i ruter, eller vis gylne snitt"
      active={grid.enabled}
      title="Flaterutenett"
      testId="grid-popover"
    >
      {() => (
        <div style={{ minWidth: 330 }}>
          <GridEditor
            grid={grid}
            showToggle
            idPrefix="surface-grid"
            onChange={(next) => commit((draft) => void (draft.surfaceGrid = next))}
          />
        </div>
      )}
    </Popover>
  )
}
