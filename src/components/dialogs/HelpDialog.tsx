import { Modal } from '@/components/common/Modal'
import { useUiStore } from '@/state/ui-store'
import { MOD_LABEL } from '@/utils/keyboard'

const ROWS: [string, string][] = [
  [`${MOD_LABEL} + Z`, 'Angre'],
  [`${MOD_LABEL} + Shift + Z / ${MOD_LABEL} + Y`, 'Gjør om'],
  ['Piltaster', 'Flytt valgte objekter med endringssteget'],
  ['Shift + piltast', 'Flytt 10 × endringssteget'],
  ['Alt + piltast', 'Flytt 1/10 av endringssteget'],
  ['Delete / Backspace', 'Slett valgte objekter'],
  [`${MOD_LABEL} + D`, 'Dupliser valgte objekter'],
  [`${MOD_LABEL} + G`, 'Grupper'],
  [`${MOD_LABEL} + Shift + G`, 'Løs opp gruppe'],
  [`${MOD_LABEL} + A`, 'Velg alle på aktivt gruppenivå'],
  [`${MOD_LABEL} + L`, 'Lås eller lås opp utvalget'],
  ['M', 'Målelinjeverktøyet av og på'],
  ['V', 'Tilbake til vanlig valgverktøy'],
  ['Escape', 'Forlat verktøy, avbryt draoperasjon, lukk dialog eller gå ett gruppenivå ut'],
  ['Enter', 'Bekreft verdien i et inputfelt'],
  ['Mellomrom + dra', 'Panorer arbeidsflaten'],
  ['Midtre museknapp + dra', 'Panorer arbeidsflaten'],
  ['Musehjul', 'Zoom rundt musepekeren'],
  [`${MOD_LABEL} + musehjul`, 'Nettleserens egen zoom'],
  [`${MOD_LABEL}/Ctrl + klikk`, 'Legg til eller fjern objekt i utvalget'],
  ['Dra på tomt område', 'Seleksjonsrektangel (velger objekter helt innenfor)'],
  ['Alt under flytting', 'Slå av snapping midlertidig'],
  ['Shift under flytting', 'Lås til dominerende akse'],
  [
    'Shift under skalering',
    'Behold forholdet – den retningen du drar mest i, styrer og endres i hele steg',
  ],
  ['Alt under skalering', 'Skaler fra sentrum (snapping er da av)'],
  ['Dobbeltklikk objekt', 'Åpne redigeringsdialogen'],
  ['Dobbeltklikk gruppe', 'Gå inn i gruppen'],
  ['Klikk i en linjal', 'Lag en skillelinje der du klikker'],
  ['Klikk på skillelinje', 'Lås eller lås opp posisjonen'],
  ['Dobbeltklikk skillelinje', 'Oppgi nøyaktig posisjon fra valgfri kant'],
  ['Alt under måling', 'Fri måling uten snapping'],
  ['Shift under måling', 'Lås målelinjen til vannrett eller loddrett'],
  ['Klikk på målelinje', 'Fest lengdemålene så de blir stående'],
]

export function HelpDialog() {
  const open = useUiStore((s) => s.helpOpen)
  const setOpen = useUiStore((s) => s.setHelpOpen)
  if (!open) return null

  return (
    <Modal
      title="Hjelp og tastatursnarveier"
      onClose={() => setOpen(false)}
      testId="help-dialog"
      footer={
        <button type="button" className="btn btn--primary" onClick={() => setOpen(false)}>
          Lukk
        </button>
      }
    >
      <div className="stack">
        <p className="hint">
          Hengopp arbeider internt i millimeter. Enheten du velger påvirker bare visning og input – aldri
          geometrien. Zoom endrer heller aldri lagrede verdier.
        </p>
        <table className="shortcuts">
          <tbody>
            {ROWS.map(([keys, description]) => (
              <tr key={keys}>
                <td>
                  <span className="kbd">{keys}</span>
                </td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          På touch: bruk flervalgsmodus i toppmenyen for å velge flere objekter, pinch for å zoome, to fingre
          for å panorere og dobbelttapp for å redigere. Skillelinjer lages ved å tappe en linjal, og hver linje
          har et håndtak du kan dra i – det trengs ingen hovering.
        </p>
        <p className="hint">
          Et låst objekt kan ikke flyttes, skaleres eller få endret avstandsvisning på lerretet, og blir aldri
          med på justering, fordeling, seleksjonsrektangel eller flervalg. Alt annet – navn, farge, rutenett,
          rekkefølge og sletting – fungerer som før. Hold pekeren over objektet og klikk hengelåsen for å låse
          opp igjen.
        </p>
      </div>
    </Modal>
  )
}
