# Hengopp

Et presist, klientbasert 2D-planleggingsverktøy for å plassere bilder, rammer og andre objekter
på en vegg eller annen todimensjonal flate.

Appen er fullstendig klientbasert i denne versjonen: ingen database, ingen innlogging, ingen
servertilkobling. Prosjektet lagres i `localStorage` og kan eksporteres/importeres som JSON.

## Kom i gang

```bash
npm install
npm run dev            # utviklingsserver på http://127.0.0.1:5173
npm run build          # typesjekk + produksjonsbygg
npm run preview        # server produksjonsbygget

npm run lint           # ESLint
npm test               # Vitest (enhetstester)
npm run e2e            # Playwright (ende-til-ende)
npm run visual-check   # skjermbilder + konsollfeil, krever kjørende preview
```

`npm run e2e` bygger og starter preview-serveren selv. I miljøer med forhåndsinstallert Chromium
kan man peke Playwright dit med `CHROMIUM_PATH=/sti/til/chromium npm run e2e`.

## Arkitektur

### Prinsipper

- **Millimeter er den interne enheten.** `displayUnit` (`cm`/`mm`) påvirker bare parsing,
  visning og formatering. Enhetsbytte endrer aldri geometrien.
- **Zoom endrer aldri modellverdier.** Viewporten er en ren transformasjon
  `skjerm = modell × scale + offset` (`src/geometry/coordinates.ts`).
- **1 px betyr 1 skjermpiksel.** Modell-laget bruker `vector-effect="non-scaling-stroke"`,
  og alt UI (håndtak, guider, etiketter, utvalgsrammer) tegnes i skjermkoordinater i et eget
  SVG-lag uten transform.
- **Skjermbaserte terskler.** Snapping (8 px aktivering / 12 px frigjøring) og
  kontrollhåndtak regnes i piksler og konverteres til modellkoordinater via zoomnivået, slik at
  opplevelsen er lik ved alle zoomnivåer.
- **Transaksjoner.** Pågående dra-, skalerings- og feltredigeringer er midlertidige. Bare det
  ferdige resultatet blir én historikkhandling.

### Tilstandsdeling

Tilstanden er delt i fire uavhengige lag slik at pointermove aldri rører dokumentet:

| Lag | Fil | Innhold |
| --- | --- | --- |
| Dokument + historikk | `src/state/project-store.ts` | `HengoppProject`, `past`/`future`, transaksjons-API |
| Interaksjon | `src/state/interaction-store.ts` | selection, nøkkelobjekt, gruppenivå, hover, drag-preview, snapguider, marquee |
| Viewport | `src/state/viewport-store.ts` | scale/offset, «100 %»-referanse, zoom og panorering |
| UI | `src/state/ui-store.ts` | modaler, bekreftelser, ikke-blokkerende varsler |

Under en draoperasjon skrives geometrien til `interaction.preview` (per objekt), aldri til
dokumentet. Hver objektnode abonnerer selektivt på sin egen preview, så bare objektene som
faktisk flyttes rerendres. Ved slutt committes resultatet som én handling og autosave kjører.

### Geometri

Alle geometriske algoritmer er React-frie og enhetstestet isolert:

```
src/geometry/
  coordinates.ts   modell ⇄ skjerm, zoom rundt et punkt, «tilpass til flate»
  bounds.ts        rektangler, bounding box, ankerpunkt, figur-treff, ankerbegrensning
  grid.ts          celle- og gyllent-snitt-rutenett, faseforskyvning ved desimale celletall
  snapping.ts      snapkandidater, snapmål, kandidatvalg med hysterese og semantisk prioritet
  alignment.ts     énakset justering mot flaten eller nøkkelobjektet
  distribution.ts  fordeling mot utvalg eller flate, kant- eller ankerbasert
  resizing.ts      åtte håndtak, ratio-lås, skalering fra sentrum, mapping av barn
  groups.ts        nestede grupper, bounding box, nivåoppløsning, sykkelvern
  zorder.ts        lagrekkefølge for blokker, normalisering av z-verdier
  measurements.ts  fire avstander til flatens kanter
  label-layout.ts  plassering av målelapper langs egen linje uten overlapp
```

#### Rutenett med desimale celletall

Et celletall `N = heltall + brøkdel` over lengden `L` gir cellestørrelse `L / N`. Den avkuttede
cellen plasseres ved å faseforskyve et konseptuelt uendelig rutenett:

| Justering | Fase |
| --- | --- |
| start (venstre/topp) | `0` |
| sentrer | `(brøkdel × celle) / 2` |
| slutt (høyre/bunn) | `brøkdel × celle` |

Sentrering gir dermed symmetrisk avkutting i begge ender.

#### Justering og fordeling

Justering virker på **én akse om gangen**: venstre/midtstill/høyre endrer bare x, topp/midtstill/bunn
bare y. Det gjør det mulig å justere vannrett uten å røre loddrett plassering.

| Valg | Betydning |
| --- | --- |
| Referanse: `Flaten` | Hvert objekt plasseres mot flatens kant eller midtlinje |
| Referanse: `Det sist valgte objektet` | Nøkkelobjektet står stille; de andre flyttes til det |
| Basis for midtstilling: `midtpunkter` | Midtstilling bruker objektenes omsluttende rektangel |
| Basis for midtstilling: `ankerpunkter` | Midtstilling bruker objektenes ankerpunkt |

Fordeling er en egen meny med samme oppbygning: referanse (de ytterste objektene eller flaten),
hva avstanden måles mellom (kantene eller ankerpunktene), og – ved flatereferanse – om det skal
være like mye luft ytterst.

#### Målelapper

En målelapp tegnes som et bånd med spiss tupp i hver ende, langs sin egen målelinje, slik at linja
visuelt løper inn i og ut av lappen. Bakgrunnen er objektets egen fyllfarge gjort lysere
(`labelBackgroundColor`), med objektets kantfarge som ramme, så det er tydelig hvilket objekt lappen
hører til selv når flere ligger i samme område.

En lapp kan gli langs sin egen linje uten å miste mening. `layoutLabels()` bruker den ene
frihetsgraden: hver lapp plasseres etter tur så nær ønsket posisjon som mulig, og den første
posisjonen som er klar av alle tidligere plasserte vinner. Finnes ingen slik posisjon, velges den med
minst overlapp. Festede målinger plasseres først og beholder dermed plassen sin.

#### Ankerpunkt

Ankerpunktet snapper **per akse**. Hver akse har sine egne kandidatlinjer (`anchorSnapLines`):
rutenettlinjene, objektets midtlinje og de to ytterkantene. Én regel gir dermed alle tilfellene:

| Snappet | Resultat |
| --- | --- |
| begge akser | et skjæringspunkt (rutenett × rutenett, rutenett × kant, midtlinje × kant …) |
| én akse | fritt punkt langs én enkelt linje |
| ingen | helt fri plassering |

Terskelen er i skjermpiksler, men begrenses til en tredel av den minste avstanden mellom to
nabolinjer (`anchorSnapThreshold`). Uten det ville tette rutenett dekke hele aksen med snapsoner og
gjøre fri plassering umulig. `Alt` slår av snappingen helt, som ellers i appen.

#### Lagrekkefølge

Rekkefølgeknappene flytter alltid hele utvalget som én sammenhengende blokk i forhold til de andre
objektene, og beholder utvalgets interne rekkefølge (`computeReorder`). Det finnes ingen innstilling
for dette – det er alltid oppførselen.

#### Snapping

Snappingmotoren får et geometrisk snapshot og returnerer `{ deltaXMm, deltaYMm, xGuide, yGuide }`.
X og Y beregnes uavhengig. Kandidaten med minst skjermavstand vinner; ved praktisk talt lik
avstand brukes en semantisk prioritet (anker↔anker → lik kanttype → sentrum↔sentrum → anker↔kant
→ kant↔kant → flaterutenett). Prioritet overstyrer aldri en merkbart nærmere kandidat. En aktiv
snap beholdes til avstanden overstiger frigjøringsterskelen (hysterese), slik at guiden ikke
flimrer. `Alt` deaktiverer snapping midlertidig.

### Persistens

Dokumentformatet er versjonert (`schemaVersion`) og valideres med Zod ved innlasting og import.
Lagringsnøkkel: `hengopp.project.v1`, med `hengopp.project.v1.backup` som siste gyldige
sikkerhetskopi. Ugyldige eller skadde data krasjer aldri appen – de gir et varsel og et nytt
prosjekt, eventuelt gjenopprettet fra sikkerhetskopien. `migrateProject()` løfter eldre
`schemaVersion` til gjeldende format. Autosave er debouncet og kjører bare etter committede
handlinger, aldri under `pointermove`.

## Tastatur

| Snarvei | Handling |
| --- | --- |
| `Ctrl/Cmd + Z` | Angre |
| `Ctrl/Cmd + Shift + Z`, `Ctrl/Cmd + Y` | Gjør om |
| Piltaster | Flytt med endringssteget |
| `Shift` + piltast | 10 × steget |
| `Alt` + piltast | 1/10 av steget |
| `Delete` / `Backspace` | Slett utvalget |
| `Ctrl/Cmd + D` | Dupliser |
| `Ctrl/Cmd + G` / `Ctrl/Cmd + Shift + G` | Grupper / løs opp |
| `Ctrl/Cmd + A` | Velg alle på aktivt gruppenivå |
| `Escape` | Avbryt draoperasjon, lukk dialog, gå ett gruppenivå ut |
| `Mellomrom` + dra, midtre museknapp + dra | Panorer |
| Musehjul | Zoom rundt pekeren (`Ctrl/Cmd` + hjul, altså pinch på styreflate, zoomer også lerretet) |

Under flytting: `Shift` låser til dominerende akse, `Alt` slår av snapping.
Under skalering: `Shift` beholder forholdet, `Alt` skalerer fra sentrum (og slår av snapping).

## Touch

Alle desktopfunksjoner som er avhengige av modifikatortaster har touch-alternativer:
flervalgsmodus, snapping av/på og gruppehandlinger ligger i toppmenyen, håndtakene har 26 px
trefflate, dobbelttapp åpner redigering, pinch zoomer og to fingre panorerer.

## Zoom: bare lerretet, aldri siden

Appen er et fast, vindusstort oppsett med eget zoomsystem på lerretet. Nettleserens sidezoom ville
skalert menyen og dialogene også, og etterlatt en tilstand appen verken ser eller kan nullstille.
Derfor er den slått av på alle veier inn – ikke bare over lerretet, men også over toppmenyen:

- `user-scalable=no, maximum-scale=1` i `<meta name="viewport">` (Chrome/Android).
- `touch-action: pan-x pan-y` på `html`, `body` og `#root`: paneler kan fortsatt rulles, men pinch
  og dobbelttapp-zoom er utelukket. Lerretet har `touch-action: none` og håndterer selv pinch.
- `useBrowserZoom()` (`src/hooks/useBrowserZoom.ts`) avbryter det CSS ikke rekker: Safaris
  `gesturestart`/`gesturechange`/`gestureend`, hjulhendelser med `Ctrl`/`Cmd` (pinch på styreflate)
  og `touchmove` med mer enn én finger.

Over lerretet blir `Ctrl`/`Cmd` + hjul til lerretzoom i stedet for sidezoom. Nettleserens
tastatursnarveier for zoom (`Ctrl/Cmd` + `+`/`-`/`0`) er reservert av nettleseren og kan ikke
avbrytes av siden.

## Toppmeny og rulling

Toppmenyen er delt i seksjoner (Prosjekt, Objekter, Presisjon, Plassering, Grupper, Rekkefølge,
Historikk, Visning). Hver seksjon har overskriften over innholdet og sin egen dempede bakgrunnsfarge.

Siden ruller aldri: `html`, `body`, `#root` og `.app` har `overflow: hidden`, og seksjonene brytes
til flere rader i stedet for å rulle sideveis. Toppmenyen har `max-height: 50vh` med egen loddrett
rulling som siste sikring på svært små skjermer, slik at ingen kontroll blir utilgjengelig.

## Tester

- **Enhetstester** (`src/tests/`, Vitest): enheter og parsing, rutenett inkl. desimale celler og
  transponering, bounding box og skalering, snapping (terskel, hysterese, prioritet, ekskludering),
  justering (begge akser, begge referanser, begge midtstillingsbaser), fordeling (alle modi),
  plassering av målelapper, ankerets snaplinjer og terskel, historikk og persistens.
- **Ende-til-ende** (`e2e/`, Playwright): to prosjekter – `desktop` (1440 × 900) og `narrow-touch`
  (390 × 780 med touch). Dekker oppsett, oppretting, flytting, skalering, undo/redo, flervalg,
  justering, fordeling, gruppering, målelinjer, lagrekkefølge, rutenettoppsett, zoom/panorering,
  import/eksport og reload.

## Kjente begrensninger

- Bare rektangel og oval som figurtyper.
- Grupper bruker ikke transformmatriser; skalering skjer ved å kartlegge etterkommere mot
  gruppens bounding box.
- Ett prosjekt om gangen i `localStorage`.
- Angre-historikken er begrenset til de ti siste handlingene.
