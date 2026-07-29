import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/common/Modal'
import { LengthField } from '@/components/common/NumberField'
import { ColorField } from '@/components/common/ColorField'
import { Segmented } from '@/components/common/Segmented'
import { GridEditor } from '@/components/common/GridEditor'
import {
  DEFAULT_ANCHOR,
  DEFAULT_OBJECT_FILL,
  DEFAULT_OBJECT_OPACITY,
  type Anchor,
  type SceneObject,
  type Shape,
} from '@/models/object'
import { DEFAULT_OBJECT_GRID, type GridDefinition } from '@/models/grid'
import { constrainAnchor } from '@/geometry/bounds'
import { anchorSnapLines, anchorSnapThreshold, interiorGridLines } from '@/geometry/grid'
import { deriveBorderColor } from '@/utils/colors'
import { newObjectId } from '@/utils/ids'
import { roundMm } from '@/utils/units'
import { addObject, updateObject } from '@/state/doc-actions'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useUiStore, type ObjectDialogState } from '@/state/ui-store'

const PREVIEW_HEIGHT = 220
const PREVIEW_PADDING = 26
/** Screen-space snap threshold for the anchor marker. */
const ANCHOR_SNAP_PX = 10

type Draft = {
  name: string
  shape: Shape
  widthMm: number
  heightMm: number
  fillColor: string
  /** 0–1 internally; the field itself works in whole percent. */
  fillOpacity: number
  internalGrid: GridDefinition
  anchor: Anchor
}

function draftFromObject(o: SceneObject): Draft {
  return {
    name: o.name,
    shape: o.shape,
    widthMm: o.widthMm,
    heightMm: o.heightMm,
    fillColor: o.fillColor,
    fillOpacity: o.fillOpacity,
    internalGrid: { ...o.internalGrid },
    anchor: { ...o.anchor },
  }
}

function emptyDraft(): Draft {
  return {
    name: '',
    shape: 'rectangle',
    widthMm: 400,
    heightMm: 300,
    fillColor: DEFAULT_OBJECT_FILL,
    fillOpacity: DEFAULT_OBJECT_OPACITY,
    internalGrid: { ...DEFAULT_OBJECT_GRID },
    anchor: { ...DEFAULT_ANCHOR },
  }
}

/** Percent in, 0–1 out — clamped, so a stray value can never leave the range. */
function opacityFromPercent(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_OBJECT_OPACITY
  return Math.min(1, Math.max(0, Math.round(percent) / 100))
}

/**
 * Thin wrapper so the editor is remounted (with a fresh draft) whenever the
 * dialog opens for a different object. Draft state never leaks between opens.
 */
export function ObjectDialog() {
  const state = useUiStore((s) => s.objectDialog)
  const doc = useProjectStore((s) => s.doc)
  if (!state) return null
  if (state.mode === 'edit' && !doc.objects[state.objectId]) return null
  return <ObjectEditor key={state.mode === 'edit' ? state.objectId : 'create'} state={state} />
}

function ObjectEditor({ state }: { state: NonNullable<ObjectDialogState> }) {
  const doc = useProjectStore((s) => s.doc)
  const nameRef = useRef<HTMLInputElement>(null)

  const existing = state.mode === 'edit' ? doc.objects[state.objectId] : undefined
  const [initial] = useState<Draft>(() => (existing ? draftFromObject(existing) : emptyDraft()))
  const [draft, setDraft] = useState<Draft>(initial)

  const borderColor = deriveBorderColor(draft.fillColor)
  const nameError = draft.name.trim() === '' ? 'Navn er obligatorisk' : null
  const sizeError = draft.widthMm <= 0 || draft.heightMm <= 0 ? 'Bredde og høyde må være større enn 0' : null
  const valid = !nameError && !sizeError
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  const close = useCallback(() => useUiStore.getState().closeObjectDialog(), [])

  const requestClose = useCallback(() => {
    if (!dirty) {
      close()
      return
    }
    useUiStore.getState().askConfirm({
      title: 'Forkast endringene?',
      message: 'Du har endringer som ikke er lagret.',
      confirmLabel: 'Forkast',
      danger: true,
      onConfirm: close,
    })
  }, [close, dirty])

  useEffect(() => {
    // The name is mandatory, so it gets focus when creating a new object.
    if (state.mode === 'create') nameRef.current?.focus()
  }, [state.mode])

  const save = () => {
    if (!valid) return
    const name = draft.name.trim()
    if (state.mode === 'create') {
      const id = newObjectId()
      const { activeGroupId, setSelection } = useInteractionStore.getState()
      const object: SceneObject = {
        id,
        name,
        shape: draft.shape,
        // New objects are placed in the middle of the surface.
        xMm: roundMm(doc.surface.widthMm / 2 - draft.widthMm / 2),
        yMm: roundMm(doc.surface.heightMm / 2 - draft.heightMm / 2),
        widthMm: draft.widthMm,
        heightMm: draft.heightMm,
        fillColor: draft.fillColor,
        fillOpacity: draft.fillOpacity,
        locked: false,
        borderColor,
        anchor: draft.anchor,
        internalGrid: draft.internalGrid,
        parentGroupId: activeGroupId,
        zIndex: 0,
      }
      useProjectStore.getState().commit((d) => addObject(d, object))
      setSelection([id], id)
    } else {
      useProjectStore.getState().commit((d) =>
        updateObject(d, state.objectId, {
          name,
          shape: draft.shape,
          widthMm: draft.widthMm,
          heightMm: draft.heightMm,
          fillColor: draft.fillColor,
          fillOpacity: draft.fillOpacity,
          borderColor,
          anchor: draft.anchor,
          internalGrid: draft.internalGrid,
        }),
      )
    }
    close()
  }

  return (
    <Modal
      title={state.mode === 'create' ? 'Nytt objekt' : `Rediger «${existing?.name}»`}
      onClose={requestClose}
      testId="object-dialog"
      footer={
        <>
          <button type="button" className="btn" data-testid="object-cancel" onClick={requestClose}>
            Avbryt
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!valid}
            data-testid="object-save"
            onClick={save}
          >
            Lagre
          </button>
        </>
      }
    >
      <div className="dialog-grid">
        <div className="stack">
          <div className="field">
            <label className="field__label" htmlFor="object-name">
              Navn (obligatorisk)
            </label>
            <input
              id="object-name"
              ref={nameRef}
              className="input"
              value={draft.name}
              autoComplete="off"
              data-testid="object-name"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'object-name-err' : undefined}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            {nameError ? (
              <span className="field__error" id="object-name-err" role="alert">
                {nameError}
              </span>
            ) : null}
          </div>

          <Segmented<Shape>
            label="Figurtype"
            value={draft.shape}
            testId="object-shape"
            options={[
              { value: 'rectangle', label: 'Rektangel' },
              { value: 'ellipse', label: 'Oval' },
            ]}
            onChange={(shape) =>
              setDraft({
                ...draft,
                shape,
                anchor: constrainAnchor(shape, draft.anchor.u, draft.anchor.v),
              })
            }
          />

          <div className="popover__row">
            <LengthField
              label="Bredde"
              valueMm={draft.widthMm}
              unit={doc.displayUnit}
              stepMm={doc.settings.movementStepMm}
              positiveOnly
              testId="object-width"
              onCommit={(widthMm) => setDraft({ ...draft, widthMm })}
            />
            <LengthField
              label="Høyde"
              valueMm={draft.heightMm}
              unit={doc.displayUnit}
              stepMm={doc.settings.movementStepMm}
              positiveOnly
              testId="object-height"
              onCommit={(heightMm) => setDraft({ ...draft, heightMm })}
            />
          </div>

          <div className="row">
            <ColorField
              label="Fyllfarge"
              value={draft.fillColor}
              testId="object-fill"
              onChange={(fillColor) => setDraft({ ...draft, fillColor })}
            />
            <div className="field">
              <span className="field__label">Border (beregnet)</span>
              <div className="row" style={{ gap: 6 }}>
                <span className="swatch" style={{ background: borderColor }} aria-hidden="true" />
                <span className="hint" data-testid="object-border">
                  {borderColor} · alltid 1 px
                </span>
              </div>
            </div>
          </div>

          <OpacityField
            value={draft.fillOpacity}
            onChange={(fillOpacity) => setDraft({ ...draft, fillOpacity })}
          />

          <details className="section" open>
            <summary>Internt rutenett</summary>
            <GridEditor
              grid={draft.internalGrid}
              idPrefix="object-grid"
              onChange={(internalGrid) => setDraft({ ...draft, internalGrid })}
            />
          </details>
        </div>

        <div className="stack">
          <div className="section">
            <p className="section__title">Forhåndsvisning og ankerpunkt</p>
            <AnchorPreview
              draft={draft}
              borderColor={borderColor}
              onAnchorChange={(anchor) => setDraft({ ...draft, anchor })}
            />
            <p className="hint" style={{ marginTop: 8 }}>
              Dra ankermarkøren. Hver akse snapper for seg til rutenettlinjene, objektets midtlinjer og
              ytterkantene – så du treffer både skjæringspunkter og frie punkter langs én enkelt linje.
              Hold Alt for å slå av snappingen. Posisjonen lagres normalisert
              (u {draft.anchor.u.toFixed(3)}, v {draft.anchor.v.toFixed(3)}) og beholdes når objektet endrer
              størrelse.
            </p>
            <button
              type="button"
              className="btn"
              data-testid="anchor-center"
              onClick={() => setDraft({ ...draft, anchor: { u: 0.5, v: 0.5 } })}
            >
              Sentrer ankerpunktet
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Fill opacity as whole percent. The slider is the quick way, the number field
 * the exact one; both write the same clamped 0–1 value.
 */
function OpacityField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const percent = Math.round(value * 100)
  return (
    <div className="field">
      <label className="field__label" htmlFor="object-opacity">
        Opasitet
      </label>
      <div className="row" style={{ gap: 8 }}>
        <input
          id="object-opacity"
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          className="slider"
          data-testid="object-opacity"
          onChange={(e) => onChange(opacityFromPercent(Number(e.target.value)))}
        />
        <div className="field__row" style={{ flex: '0 0 auto' }}>
          <input
            type="text"
            inputMode="numeric"
            style={{ width: 44, textAlign: 'right' }}
            value={String(percent)}
            aria-label="Opasitet i prosent"
            data-testid="object-opacity-value"
            onChange={(e) => {
              const next = Number(e.target.value.replace(/[^\d]/g, ''))
              if (Number.isFinite(next)) onChange(opacityFromPercent(next))
            }}
          />
          <span className="field__suffix">%</span>
        </div>
      </div>
    </div>
  )
}

type PreviewProps = {
  draft: Draft
  borderColor: string
  onAnchorChange: (anchor: Anchor) => void
}

/**
 * Fixed-size preview. The object keeps its aspect ratio, never exceeds the
 * preview area and stays centred with breathing room.
 */
function AnchorPreview({ draft, borderColor, onAnchorChange }: PreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 240, height: PREVIEW_HEIGHT })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const apply = () => setSize({ width: el.clientWidth || 240, height: PREVIEW_HEIGHT })
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const availableW = Math.max(20, size.width - PREVIEW_PADDING * 2)
  const availableH = Math.max(20, size.height - PREVIEW_PADDING * 2)
  const scale = Math.min(availableW / Math.max(draft.widthMm, 1), availableH / Math.max(draft.heightMm, 1))
  const w = draft.widthMm * scale
  const h = draft.heightMm * scale
  const x = (size.width - w) / 2
  const y = (size.height - h) / 2

  const grid = interiorGridLines(draft.internalGrid, draft.widthMm, draft.heightMm)
  const snapLines = useMemo(
    () => anchorSnapLines(draft.internalGrid, draft.widthMm, draft.heightMm),
    [draft.internalGrid, draft.widthMm, draft.heightMm],
  )
  /** Snapped lines under the marker while dragging, in millimetres. */
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })

  const ax = x + draft.anchor.u * w
  const ay = y + draft.anchor.v * h

  const handlePointer = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || w <= 0 || h <= 0) return
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    let u = (px - x) / w
    let v = (py - y) / h

    // Each axis snaps on its own, using a screen-space threshold. Two snapped
    // axes give an intersection, one lets the anchor slide along a single line.
    // Alt suspends snapping entirely, exactly as it does on the canvas.
    const snap = (lines: number[], valueMm: number): number | null => {
      if (e.altKey) return null
      const threshold = anchorSnapThreshold(lines, scale, ANCHOR_SNAP_PX)
      let best: { pos: number; d: number } | null = null
      for (const pos of lines) {
        const d = Math.abs(pos - valueMm) * scale
        if (d <= threshold && (!best || d < best.d)) best = { pos, d }
      }
      return best ? best.pos : null
    }
    const snappedX = snap(snapLines.x, u * draft.widthMm)
    const snappedY = snap(snapLines.y, v * draft.heightMm)
    if (snappedX !== null) u = snappedX / draft.widthMm
    if (snappedY !== null) v = snappedY / draft.heightMm

    setGuides({ x: snappedX, y: snappedY })
    onAnchorChange(constrainAnchor(draft.shape, u, v))
  }

  const endDrag = () => setGuides({ x: null, y: null })

  return (
    <div ref={wrapRef}>
      <svg
        ref={svgRef}
        className="preview"
        width={size.width}
        height={size.height}
        data-testid="object-preview"
        role="group"
        aria-label="Forhåndsvisning med ankerpunkt"
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          handlePointer(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0) return
          handlePointer(e)
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {draft.shape === 'ellipse' ? (
          <ellipse
            cx={x + w / 2}
            cy={y + h / 2}
            rx={w / 2}
            ry={h / 2}
            fill={draft.fillColor}
            fillOpacity={draft.fillOpacity}
            stroke={borderColor}
            strokeWidth={1}
          />
        ) : (
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={draft.fillColor}
            fillOpacity={draft.fillOpacity}
            stroke={borderColor}
            strokeWidth={1}
          />
        )}

        {draft.internalGrid.enabled ? (
          <g stroke="#14161a" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="4 3">
            {grid.vertical.map((vx) => (
              <line key={`v${vx}`} x1={x + (vx / draft.widthMm) * w} y1={y} x2={x + (vx / draft.widthMm) * w} y2={y + h} />
            ))}
            {grid.horizontal.map((hy) => (
              <line key={`h${hy}`} x1={x} y1={y + (hy / draft.heightMm) * h} x2={x + w} y2={y + (hy / draft.heightMm) * h} />
            ))}
          </g>
        ) : null}

        {/* Guides for the lines the anchor is currently snapped to. */}
        <g pointerEvents="none" stroke="#2f6fd0" strokeWidth={1}>
          {guides.x !== null ? (
            <line
              x1={x + (guides.x / draft.widthMm) * w}
              y1={y - 6}
              x2={x + (guides.x / draft.widthMm) * w}
              y2={y + h + 6}
              data-testid="anchor-guide-x"
            />
          ) : null}
          {guides.y !== null ? (
            <line
              x1={x - 6}
              y1={y + (guides.y / draft.heightMm) * h}
              x2={x + w + 6}
              y2={y + (guides.y / draft.heightMm) * h}
              data-testid="anchor-guide-y"
            />
          ) : null}
        </g>

        <g data-testid="anchor-marker" style={{ cursor: 'grab' }}>
          <circle cx={ax} cy={ay} r={12} fill="transparent" />
          <circle cx={ax} cy={ay} r={7} fill="#f4dc9a" stroke="#14161a" strokeWidth={1} />
          <path
            d={`M${ax - 11} ${ay}H${ax - 4}M${ax + 4} ${ay}H${ax + 11}M${ax} ${ay - 11}V${ay - 4}M${ax} ${ay + 4}V${ay + 11}`}
            stroke="#14161a"
            strokeWidth={1}
          />
        </g>
      </svg>
    </div>
  )
}
