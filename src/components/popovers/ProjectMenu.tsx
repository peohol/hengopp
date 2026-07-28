import { useRef } from 'react'
import { Popover } from '@/components/common/Popover'
import { useProjectStore } from '@/state/project-store'
import { useUiStore } from '@/state/ui-store'
import { useInteractionStore } from '@/state/interaction-store'
import { exportProjectJson, importProjectJson } from '@/state/persistence'
import { createEmptyProject } from '@/models/project'
import { newProjectId } from '@/utils/ids'

export function ProjectMenu() {
  const doc = useProjectStore((s) => s.doc)
  const commit = useProjectStore((s) => s.commit)
  const replaceDocument = useProjectStore((s) => s.replaceDocument)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const blob = new Blob([exportProjectJson(doc)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').toLowerCase() || 'hengopp'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (file: File) => {
    const text = await file.text()
    const parsed = importProjectJson(text)
    if (!parsed.ok) {
      useUiStore.getState().notify('error', `Import mislyktes. ${parsed.error}`)
      return
    }
    useUiStore.getState().askConfirm({
      title: 'Erstatt nåværende prosjekt?',
      message: `«${parsed.project.name}» erstatter prosjektet du har åpent nå. Handlingen kan angres.`,
      confirmLabel: 'Importer',
      onConfirm: () => {
        useInteractionStore.getState().setActiveGroup(null)
        replaceDocument(parsed.project)
        useUiStore.getState().notify('info', 'Prosjektet ble importert.')
      },
    })
  }

  return (
    <Popover icon="project" label="Prosjekt" hint="Navn, import, eksport og nullstilling" title="Prosjekt" testId="project-menu">
      {(close) => (
        <div className="stack" style={{ minWidth: 280 }}>
          <div className="field">
            <label className="field__label" htmlFor="project-name">
              Prosjektnavn
            </label>
            <input
              id="project-name"
              className="input"
              defaultValue={doc.name}
              data-testid="project-name"
              onBlur={(e) => {
                const value = e.target.value.trim()
                if (value && value !== doc.name) commit((draft) => void (draft.name = value))
                else e.target.value = doc.name
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
          </div>

          <button type="button" className="btn" data-testid="export-project" onClick={handleExport}>
            Eksporter som JSON
          </button>

          <button
            type="button"
            className="btn"
            data-testid="import-project"
            onClick={() => fileRef.current?.click()}
          >
            Importer fra JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            data-testid="import-file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void handleImportFile(file)
            }}
          />

          <button
            type="button"
            className="btn btn--danger"
            data-testid="reset-project"
            onClick={() => {
              close()
              useUiStore.getState().askConfirm({
                title: 'Nullstill prosjektet?',
                message: 'Alle objekter, grupper og målinger fjernes. Handlingen kan angres.',
                confirmLabel: 'Nullstill',
                danger: true,
                onConfirm: () => {
                  useInteractionStore.getState().setActiveGroup(null)
                  const fresh = createEmptyProject(newProjectId())
                  replaceDocument({ ...fresh, isDraftSetup: false, displayUnit: doc.displayUnit })
                },
              })
            }}
          >
            Nullstill prosjekt
          </button>

          <p className="hint">
            Prosjektet lagres automatisk i nettleseren. Eksporter til JSON for sikkerhetskopi eller for å
            flytte prosjektet til en annen maskin.
          </p>
        </div>
      )}
    </Popover>
  )
}
