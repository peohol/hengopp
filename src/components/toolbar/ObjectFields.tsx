import { useEffect, useState } from 'react'
import { LengthField } from '@/components/common/NumberField'
import { IconButton } from '@/components/common/IconButton'
import { previewedSelectionBounds } from '@/components/canvas/scene-helpers'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useUiStore } from '@/state/ui-store'
import {
  beginGeometryEdit,
  cancelGeometryEdit,
  commitSelectionGeometry,
  previewSelectionGeometry,
  renameSelected,
  type GeometryField,
} from '@/state/commands'

/** Name, position and size of the current selection (its combined bounding box). */
export function ObjectFields() {
  const doc = useProjectStore((s) => s.doc)
  const selection = useInteractionStore((s) => s.selection)
  const preview = useInteractionStore((s) => s.preview)
  // While dragging or resizing the fields follow the transient geometry.
  const bounds = previewedSelectionBounds(doc, preview, selection)
  const single = selection.length === 1 ? selection[0] : null
  const singleObject = single ? doc.objects[single] : undefined
  const singleGroup = single ? doc.groups[single] : undefined
  const name = singleObject?.name ?? singleGroup?.name ?? ''
  const [nameText, setNameText] = useState(name)

  useEffect(() => setNameText(name), [name, single])

  const disabled = !bounds
  const step = doc.settings.movementStepMm

  const field = (label: string, key: GeometryField, value: number, positiveOnly?: boolean) => (
    <LengthField
      label={label}
      valueMm={value}
      unit={doc.displayUnit}
      stepMm={step}
      positiveOnly={positiveOnly}
      disabled={disabled}
      widthPx={62}
      testId={`prop-${key}`}
      onEditStart={beginGeometryEdit}
      onPreview={(v) => previewSelectionGeometry(key, v)}
      onCancel={cancelGeometryEdit}
      onCommit={(v) => commitSelectionGeometry(key, v)}
    />
  )

  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor="prop-name">
          Navn
        </label>
        <input
          id="prop-name"
          className="input"
          style={{ width: 132 }}
          value={selection.length > 1 ? `${selection.length} valgte` : nameText}
          disabled={selection.length !== 1}
          data-testid="prop-name"
          placeholder="Ingen valgt"
          onChange={(e) => setNameText(e.target.value)}
          onBlur={() => {
            const value = nameText.trim()
            if (value && value !== name) renameSelected(value)
            else setNameText(name)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setNameText(name)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </div>
      {field('X', 'x', bounds?.x ?? 0)}
      {field('Y', 'y', bounds?.y ?? 0)}
      {field('Bredde', 'width', bounds?.width ?? 0, true)}
      {field('Høyde', 'height', bounds?.height ?? 0, true)}
      <IconButton
        icon="edit"
        label="Rediger objekt"
        hint="Dobbeltklikk objektet for samme dialog"
        disabled={!singleObject}
        data-testid="edit-object"
        onClick={() => {
          if (singleObject) useUiStore.getState().openObjectDialog({ mode: 'edit', objectId: singleObject.id })
        }}
      />
    </>
  )
}
