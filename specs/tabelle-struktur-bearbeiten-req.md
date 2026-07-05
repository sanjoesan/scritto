# Anforderungsspezifikation: „Tabellenstruktur bearbeiten" — Zeile einfügen, Zeile löschen, Spalte einfügen, Spalte löschen

Status: **Entwurf zur Freigabe, nicht vertrauenswürdig bis einzeln über echte
Browser-Bedienung verifiziert.** Diese Datei vereinheitlicht vier bisher getrennte,
aber technisch und UI-seitig untrennbare Anforderungsdateien
(`specs/zeile-einfuegen-req.md`, `specs/zeile-loeschen-req.md`,
`specs/spalte-einfuegen-req.md`, `specs/spalte-loeschen-req.md`) zu **einem**
zusammenhängenden Bedienblock „Tabellenstruktur bearbeiten" in der Editor-Toolbar. Sie
übernimmt deren Code-Recherche (am 2026-07-05 unabhängig gegen den aktuellen Quellstand
`E:\docs\src` erneut nachvollzogen, siehe Abschnitt 0), **behebt aber eine Inkonsistenz
zwischen den vier Vorlagen** (unterschiedliche Antworten auf „was passiert, wenn die
letzte Zeile/Spalte gelöscht wird" — siehe Abschnitt 2.7) und schließt eine bisher in
keiner der vier Vorlagen beantwortete Tastatur-Bedienbarkeitsfrage (Abschnitt 1, Punkt 8;
in `specs/tabelle-einfuegen-req.md` Abschnitt 2.9 bereits als offenes Risiko für den
bestehenden „⊞ Tabelle"-Button identifiziert, hier für vier **neue** Buttons verbindlich
beantwortet).

**Geltungsbereich:** genau vier Aktionen — „Zeile oberhalb einfügen", „Zeile unterhalb
einfügen", „Zeile löschen", „Spalte links einfügen", „Spalte rechts einfügen", „Spalte
löschen" (sechs Bedienelemente, vier fachliche Operationen) — als **ein**
zusammenhängender Bedienblock in `src/formats/shared/editor/Toolbar.tsx`, für DOCX **und**
ODT identisch (gemeinsamer Editor, siehe Abschnitt 0).

**Ausdrücklich NICHT Teil dieser Datei** (eigene Backlog-Slugs, `specs/FEATURE-BACKLOG.md`
Abschnitt 3.2):
- **Zellen verbinden / Zellen teilen** (`zellen-verbinden`, `zellen-teilen`) — das
  **Erzeugen/Auflösen** von `colspan`/`rowspan` ist ein separates Folge-Feature. Diese
  Datei behandelt verbundene Zellen **ausschließlich als Grenzfall**: Was passiert, wenn
  eine Zeile/Spalte eingefügt oder gelöscht wird, während **bereits** verbundene Zellen
  existieren (z. B. aus einem importierten Dokument) — siehe Abschnitt 2.6 und Abschnitt 3.
- **Tabelle einfügen** (`tabelle-einfuegen`) — aktuell feste 2×2-Größe ohne Dialog
  (`Toolbar.tsx:277-289`, `insertTable(2, 2)`); ein Größenwahl-Dialog ist eigenes Ticket
  (`specs/tabelle-einfuegen-req.md`). Hier nur als Ausgangspunkt relevant: Der neue
  Bedienblock erscheint direkt neben diesem bestehenden Button.
- **Tabelle löschen** (`tabelle-loeschen`) — eigener Slug für das *gezielte* Entfernen
  einer kompletten Tabelle unabhängig vom Inhalt. Hier nur insofern relevant, als das
  Löschen der letzten Zeile/Spalte laut Abschnitt 2.7 **automatisch** zum selben Ergebnis
  führt (Tabelle verschwindet) — ohne dass Nutzer:innen den Button „Tabelle löschen"
  explizit betätigen müssen.
- **Tabelleneigenschaften/-formatvorlagen, Kopfzeile wiederholen, Text↔Tabelle,
  Tabellenformel/-sortierung/-autoanpassung, Zeichnen** — jeweils eigene, nicht
  betroffene Backlog-Einträge.

Stil und Gliederung orientieren sich an den vier Ausgangsdateien und an
`specs/dokument-darstellung-req.md`. **Zeilennummern sind Momentaufnahmen** (Stand
2026-07-05) und bei Umsetzung per Symbolsuche neu zu verankern — das gilt für jede Zahl in
dieser Datei.

---

## 0. Verifizierter Ist-Stand

Unabhängig gegen den aktuellen Quellstand geprüft (nicht nur aus den vier Ausgangsdateien
übernommen): `Toolbar.tsx:277-289` enthält weiterhin **genau einen** Tabellen-Button
(„⊞ Tabelle", `onMouseDown` → `insertTable(2, 2)`); `commands.ts:3,6` importiert/
re-exportiert aus `prosemirror-tables` **nur** `isInTable`; eine Volltextsuche über
`src/` nach `addRowBefore|addRowAfter|deleteRow|addColumnBefore|addColumnAfter|
deleteColumn|selectedRect` liefert **keinen** Treffer außerhalb von
`commands.ts`/`Toolbar.tsx` selbst (die die Namen nicht verwenden); `src/index.css` enthält
**keine** `.selectedCell`-Regel. Der Backlog-Status „fehlt" für alle vier betroffenen Slugs
(`zeile-einfuegen`, `zeile-loeschen`, `spalte-einfuegen`, `spalte-loeschen`, alle Priorität
1, `FEATURE-BACKLOG.md` Zeilen 183–186) ist damit **bestätigt zutreffend**.

| # | Fundstelle | Befund |
|---|---|---|
| 1 | `Toolbar.tsx:277-289` | Ein Tabellen-Button, `insertTable(2, 2)` fest verdrahtet, `aria-pressed={isInTable(view.state)}`, `title`+`aria-label` gesetzt, Auslösung über `onMouseDown`+`e.preventDefault()` (**nicht** `onClick`) — Projektkonvention, damit die Editor-Selektion beim Klick erhalten bleibt. Kein Kontextmenü, keine Tastenkombination für Tabellenoperationen. |
| 2 | `Toolbar.tsx:143-156` (Ausschneiden-Button, `ScissorsIcon`) | **Direkt kopierbares Vorbild** für alle sechs neuen Buttons: `disabled={!canCut(view.state)}`, Tailwind `disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`, SVG-Icon (kein Emoji/Unicode), `title`+`aria-label`. Für diese Datei tritt `isInTable(view.state)` bzw. eine eigene Guard-Funktion an die Stelle von `canCut`. |
| 3 | `commands.ts:92-102` (`insertTable`) | Einzige vorhandene Tabellenlogik der App; erzeugt Zellen über `createAndFill()` (immer mind. ein leerer Absatz je Zelle). Kein `addRow*`/`addColumn*`/`delete*`-Wrapper vorhanden. |
| 4 | `package.json` (`prosemirror-tables ^1.8.5`) | Liefert `addRowBefore`, `addRowAfter`, `deleteRow`, `addColumnBefore`, `addColumnAfter`, `deleteColumn`, `deleteTable`, `selectedRect`, `TableMap`, `CellSelection` fix und fertig — **keine** davon aktuell importiert. Umsetzungskern ist Verdrahtung + Grenzfall-Behandlung, nicht Neuentwicklung. |
| 5 | `deleteRow`/`deleteColumn` (Bibliotheks-Guard, in `dist/index.js` verifiziert) | Beide verweigern (kein Dispatch, `return false`) das Löschen, wenn die Selektion **alle** Zeilen bzw. **alle** Spalten umfasst — der dispatch-lose Verfügbarkeits-Check liefert dabei **fälschlich `true`**. Zentrale Falle für einen stillen Fehlschlag (siehe Abschnitt 2.7). |
| 6 | `WordEditor.tsx:8,109-110` | `columnResizing()` und `tableEditing()` aktiv → `CellSelection` per Maus-Drag funktioniert bereits, ist aber **visuell unsichtbar** (keine `.selectedCell`-CSS-Regel, Befund unten). Keymap (`:85-108`) bindet **kein** `Tab`/`Shift-Tab`. |
| 7 | `WordEditor.tsx:117-121` | Dokumentierte, bewusste Projektentscheidung: **kein** eigenes Kontextmenü, kein `contextmenu`-Listener — natives Browser-Kontextmenü bleibt erreichbar. Gilt projektweit, nicht pro Feature verschieden zu handhaben. |
| 8 | `src/index.css` | Keine `.selectedCell`-Regel, kein `.tableWrapper { overflow-x }`. Eine per Maus markierte Zellauswahl ist **unsichtbar**; eine breite Tabelle kann mangels `overflow-x` auf schmalen Viewports den Editor-Container sprengen. Beides ist als **Voraussetzung** für einen sicher bedienbaren Löschvorgang zu bauen (man muss sehen, was man löscht), nicht optional. |
| 9 | `docx/writer.ts:158-201`, `odt/writer.ts:110-175` | Beide Writer leiten `colCount` korrekt aus der **Summe der `colspan`-Werte der ersten Zeile** ab und erzeugen für vertikale/horizontale Verbindungen korrekte Fortsetzungs-/Platzhalterzellen (`w:vMerge`/`table:covered-table-cell`). **Bereits korrekt**, nicht Gegenstand eines Bugfixes — Regressionsschutz-Pflicht für alle vier Operationen (Abschnitt 4). |
| 10 | `odt/reader.ts:301-321` | Überspringt `<table:covered-table-cell/>` bewusst und rekonstruiert `rowspan`/`colspan` aus dem Anker-Attribut — für ODF spezifikationskonform und durch mehrere reale Fixtures (`tableCoveredContent.odt` u. a.) empirisch bestätigt, **kein** offener Bug. |
| 11 | `docx/reader.ts:309-360` | Robuste `vMerge`→`rowspan`-Rekonstruktion über ein `anchors[]`-Array, `MAX_TABLE_NESTING_DEPTH = 25` gegen pathologisch verschachtelte Tabellen. |
| 12 | `schema.ts:154` | `tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} })` — Standard-`colspan`/`rowspan`/`colwidth`, mehrere Absätze/verschachtelte Tabellen je Zelle erlaubt; kein eigener Header-Zell-Pfad wird von `insertTable` genutzt. `doc: { content: 'block+' }` verlangt **mindestens einen** Block — relevant für „letzte Tabelle im Dokument entfernt" (Abschnitt 2.7). |
| 13 | `DocumentWorkspace.tsx:68-95` | Genau **ein** „Exportieren"-Button, gebunden an das beim Öffnen gewählte Formatmodul — **kein** Cross-Format-Export über die UI. Cross-Format-Rundreisen sind deshalb nur auf Adapter-/Objektebene nachweisbar (Abschnitt 4), keine Produktlücke dieses Features. |
| 14 | `tests/e2e/selection-regression.spec.ts` | Einziger vorhandener Tabellen-E2E-Test (Selection-Sync bei Zellwechsel per Klick, nutzt bereits `getByRole('button', { name: 'Tabelle einfügen' })`). Kein Test für Zeilen-/Spaltenoperationen. |
| 15 | `docx/__tests__/roundtrip.test.ts`, `odt/__tests__/roundtrip.test.ts` | Bestehende Tabellen-Tests konstruieren JSON direkt, prüfen nur Schreiben/Lesen inkl. `colspan`/`rowspan` — **kein** Test ruft `addRow*`/`deleteRow`/`addColumn*`/`deleteColumn` auf. |
| 16 | `playwright.config.ts:34-36` | Drei Projekte: **Desktop Chrome**, **Mobile** (Pixel 7, Touch), **Tablet** (iPad Mini) — jede neue Bedienoberfläche muss auf allen dreien nachgewiesen werden. |

**Fazit:** Alle vier Operationen fehlen vollständig in der UI, obwohl die
zugrundeliegende Bibliothek und die Export-/Import-Pfade die Kernlogik bereits tragfähig
mitbringen. Die eigentliche Arbeit ist (a) ein gemeinsamer, konsistent gestalteter
Bedienblock, (b) die in Abschnitt 2.7 getroffene, vereinheitlichte Entscheidung für den
„letzte Zeile/Spalte"-Grenzfall, (c) sichtbare Zellauswahl-Markierung als Voraussetzung
für sicheres Löschen, (d) Tastaturbedienbarkeit der neuen Buttons und (e) der vollständige
Rundreise-Nachweis für alle vier Operationen einzeln und in Kombination.

---

## 1. Bedienelemente / Menüpunkte (Soll)

Alle sechs Bedienelemente bilden **einen** zusammenhängenden Block direkt neben dem
bestehenden „⊞ Tabelle"-Button, durch einen Trenner (`Toolbar.tsx:275`,
`<div className="w-px h-5 ..." />`, bereits als Muster vorhanden) optisch abgesetzt.

| # | Element | Auslösung | Soll |
|---|---|---|---|
| 1 | „Zeile oberhalb einfügen" | Klick/Tap/Tastatur, Cursor oder Selektion in einer Tabellenzelle | Fügt eine neue, leere Zeile unmittelbar **oberhalb** der Bezugszeile ein (`addRowBefore`). |
| 2 | „Zeile unterhalb einfügen" | wie oben | Fügt eine neue, leere Zeile unmittelbar **unterhalb** der Bezugszeile ein (`addRowAfter`). |
| 3 | „Zeile löschen" | wie oben | Entfernt die/alle von der Selektion betroffene(n) Zeile(n) (`deleteRow`, mit eigener Guard-Behandlung, Abschnitt 2.7). |
| 4 | „Spalte links einfügen" | wie oben | Fügt eine neue, leere Spalte unmittelbar **links** der Bezugsspalte ein (`addColumnBefore`). |
| 5 | „Spalte rechts einfügen" | wie oben | Fügt eine neue, leere Spalte unmittelbar **rechts** der Bezugsspalte ein (`addColumnAfter`). |
| 6 | „Spalte löschen" | wie oben | Entfernt die/alle von der Selektion betroffene(n) Spalte(n) (`deleteColumn`, mit eigener Guard-Behandlung, Abschnitt 2.7). |
| 7 | Deaktivierter Zustand außerhalb einer Tabelle | — | Alle sechs Buttons sind **immer sichtbar**, aber `disabled`, wenn `isInTable(view.state)` `false` liefert (Muster: Ausschneiden-Button, `Toolbar.tsx:147,153`). Der `title`/`aria-label` erklärt den Grund sichtbar und für Screenreader (z. B. `title="Zeile oberhalb einfügen (nur innerhalb einer Tabelle verfügbar)"` bzw. äquivalent per zusätzlichem `aria-describedby`), **kein** kommentarloses Ausgrauen ohne Begründung. Konsistent für alle sechs Buttons — nicht gemischt (manche ausblenden, andere deaktivieren). |
| 8 | Tastaturaktivierung (Enter **und** Leertaste) | Tastatur, Button per Tab fokussiert | **Verbindlich zu lösen, nicht nur zu dokumentieren:** Da alle Toolbar-Buttons aus Projektkonvention über `onMouseDown`+`preventDefault()` auslösen (Selektionserhalt), feuert ein per **Enter** aktivierter, fokussierter `<button>` browserübergreifend **kein** `mousedown`-Ereignis (nur `click`), während Leertaste zusätzlich ein synthetisches `mousedown`/`mouseup` erzeugt. Ohne Gegenmaßnahme wären die sechs neuen Buttons per Maus und Leertaste, aber **nicht** per Enter auslösbar — ein stiller, rein tastaturseitiger Fehlschlag (Verstoß gegen `specs/UX-INVARIANTEN.md` §1.3, die explizit `onClick`-Aktivierung verlangt). **Anforderung:** zusätzlich zu `onMouseDown` (für Mausklick/Selektionserhalt) einen gleichwertigen `onKeyDown`-Handler für `Enter`/`Space` (oder eine äquivalente `onClick`-Bindung, die bei bereits per `onMouseDown` verarbeiteten Klicks nicht doppelt auslöst) ergänzen, sodass alle sechs Buttons nachweislich per Maus, Leertaste **und** Enter funktionieren. Dies war in `specs/tabelle-einfuegen-req.md` Abschnitt 2.9 bereits für den bestehenden „⊞ Tabelle"-Button als offenes Risiko identifiziert und dort noch nicht gelöst — hier für sechs **neue** Buttons verbindlich vorausgesetzt, nicht wiederholt offengelassen. |
| 9 | Berühungsbedienung (Mobile/Tablet) | Antippen | Auf den Projekten **Mobile** (Pixel 7) und **Tablet** (iPad Mini) (`playwright.config.ts:34-36`) muss mindestens der Grundfall „Cursor per Tipp in eine Zelle setzen, Button antippen" für alle sechs Bedienelemente funktionieren. Tap-Ziele ≥ 40 px (siehe Abschnitt 7, Responsiveness). Eine `CellSelection` per Touch-Drag ist wünschenswert, aber **nicht** Voraussetzung für die Abnahme (Mehrfachauswahl bleibt primär ein Desktop-Maus-Anwendungsfall). |
| 10 | Kontextmenü (Rechtsklick) | Rechtsklick auf Tabellenzelle | **Kein Soll-Bestandteil.** Projektweite, bereits getroffene Entscheidung (`WordEditor.tsx:117-121`): kein eigenes Kontextmenü, natives Browser-Kontextmenü bleibt erreichbar. Gilt einheitlich für alle sechs Aktionen — nicht pro Aktion neu verhandeln. |
| 11 | Icons | — | Jeder Button trägt ein **eigenes, eindeutig unterscheidbares Inline-SVG-Icon** (kein Emoji/Unicode-Glyph — Vorbild `ScissorsIcon`, `Toolbar.tsx:33-53`) und ein aussagekräftiges `aria-label` (z. B. „Zeile oberhalb einfügen", „Spalte rechts einfügen"). Insert-oben/-unten bzw. links/rechts müssen sich optisch klar unterscheiden (z. B. Pfeilrichtung), nicht nur durch Tooltip-Text. |
| 12 | Sichtbare Markierung der Selektion (Voraussetzung für sicheres Löschen) | — | `tableEditing()` setzt bereits die Klasse `selectedCell` bei einer `CellSelection`, sie ist aber **unstyled** (Befund 0, #8) → **Pflicht, zu bauen:** eine Overlay-Regel (`.ProseMirror .selectedCell::after`, hell-/dunkelmodustauglich, `pointer-events: none`), damit vor jedem Löschklick sichtbar ist, welche Zelle(n)/Zeile(n)/Spalte(n) betroffen sind. Ohne das ist „Spalte/Zeile löschen" ein Löschen „ins Blinde". |

---

## 2. Gewünschtes Verhalten im Detail

### 2.1 Zeile oberhalb einfügen
- Bezugspunkt: die Zeile, die die aktuelle Cursor-Position bzw. den Beginn der aktuellen
  `CellSelection` enthält.
- Neue, leere Zeile erscheint unmittelbar **davor**, mit exakt der effektiven Spaltenzahl
  der Tabelle an dieser Stelle (inkl. korrekter Berücksichtigung von `colspan` in
  Nachbarzeilen — `addRowBefore` leistet dies bibliotheksseitig, siehe Grenzfall 3).
- **View-Sync (Pflicht):** Der Cursor bleibt in der **gleichen logischen Zelle**, die nun
  eine Zeile weiter unten im Dokument steht. Die Ansicht scrollt automatisch so, dass diese
  Zelle **sichtbar** bleibt (`scrollIntoView`-Verhalten) — insbesondere relevant bei langen,
  über mehrere A4-Seiten laufenden Tabellen (`specs/dokument-darstellung-req.md`
  Abschnitt 2.1, Paginierung), wo eine neue Zeile die Zeilenposition auf der Seite
  verschiebt. Kein „Zeile eingefügt, aber Ansicht springt woanders hin".
- Bei `CellSelection` über mehrere Zeilen: **verbindlich genau eine** neue Zeile relativ zur
  **obersten** markierten Zeile (nicht eine Zeile pro markierter Zeile — siehe Abschnitt 2.5
  für die identische Regel bei Spalten).

### 2.2 Zeile unterhalb einfügen
- Spiegelbildlich zu 2.1: neue Zeile unmittelbar **danach**; bei Mehrzeilen-Selektion
  relativ zur **untersten** markierten Zeile.
- View-Sync-Pflicht identisch zu 2.1.
- Zusätzlich: Tab-Taste in der letzten Zelle der letzten Zeile fügt äquivalent eine neue
  Zeile unterhalb an und setzt den Cursor in deren erste Zelle (Detailverhalten und
  Tastenbindung sind Gegenstand von `specs/zeile-einfuegen-req.md` Abschnitt 3.8/Grenzfall 4
  — hier nur als Anforderung referenziert, damit „Zeile unterhalb einfügen" über die
  Toolbar **und** über Tab konsistent zum selben Ergebnis führen).

### 2.3 Zeile löschen
- Betroffene Zeile(n): Bei kollabiertem Cursor die **gesamte** Zeile dieser Zelle; bei
  `CellSelection` innerhalb einer Zeile (auch nur Teilspalten) ebenfalls die **gesamte**
  Zeile; bei `CellSelection` über mehrere Zeilen **alle** vollständig oder teilweise
  berührten Zeilen in **einem** Schritt.
- **View-Sync (Pflicht):** Cursor landet in einer sinnvollen Zelle der **nachfolgenden**
  Zeile (gleiche Spaltenposition); existiert keine nachfolgende Zeile, in der
  **vorhergehenden**. Die Ansicht scrollt so, dass diese Zelle sichtbar ist. Wurde die
  gesamte Tabelle entfernt (Abschnitt 2.7), landet der Cursor sichtbar im
  nachfolgenden/vorhergehenden/neu eingefügten Absatz.
- Sonderfall „Selektion = alle Zeilen" bzw. „einzige verbleibende Zeile": siehe Abschnitt
  2.7 (verbindliche Entscheidung).
- Verbundene Zellen: siehe Abschnitt 2.6.

### 2.4 Spalte links einfügen
- Bezugspunkt: die Spalte der aktuellen Zelle bzw. des linken Randes der aktuellen
  `CellSelection`.
- Neue, leere Spalte erstreckt sich über **alle** Zeilen der Tabelle (nicht nur die
  aktuelle Zeile).
- **View-Sync (Pflicht):** Cursor bleibt in der gleichen logischen Zelle (jetzt eine Spalte
  weiter rechts); Ansicht scrollt horizontal so, dass diese Zelle sichtbar bleibt —
  insbesondere bei bereits breiten Tabellen, die den Seiteninhalt ausfüllen (siehe
  Grenzfall 3, „sehr breite Tabelle").
- Bei `CellSelection` über mehrere Spalten: **verbindlich genau eine** neue Spalte relativ
  zur **linken** Grenze der Selektion (Vereinheitlichung gegenüber der in
  `spalte-einfuegen-req.md` Abschnitt 3.3 noch offen gelassenen Frage — siehe Abschnitt 2.5).

### 2.5 Spalte rechts einfügen
- Spiegelbildlich zu 2.4: neue Spalte unmittelbar rechts der Bezugsspalte; bei
  Mehrfachauswahl relativ zur **rechten** Grenze der Selektion.
- **Vereinheitlichte Mehrfachauswahl-Entscheidung (verbindlich, ersetzt den in
  `spalte-einfuegen-req.md` Abschnitt 3.3 offen gelassenen Klärungspunkt):** Für **beide**
  Einfüge-Richtungen (Zeile wie Spalte) gilt durchgängig: Eine markierte Mehrfachauswahl
  führt zum Einfügen von **genau einem** neuen Element (einer Zeile bzw. einer Spalte),
  **nicht** einem Element pro markierter Zeile/Spalte. Begründung: „Einfügen" ist als
  Einzel-Einfüge-Operation zu verstehen; eine „N Zeilen/Spalten auf einmal einfügen"-Funktion
  wäre ein eigenständiges Feature. Das entspricht dem Standardverhalten von
  `addRowBefore`/`addRowAfter`/`addColumnBefore`/`addColumnAfter` und macht das Verhalten
  über beide Dimensionen hinweg **konsistent und vorhersagbar** (anstatt bei Zeilen
  „1 Zeile" und bei Spalten uneinheitlich „N Spalten" zu liefern).

### 2.6 Spalte löschen
- Betroffene Spalte(n): Bei kollabiertem Cursor die **gesamte** Spalte über die volle
  Tabellenhöhe; bei `CellSelection` innerhalb einer Spalte (auch Teilhöhe) ebenfalls die
  **gesamte** Spalte; bei `CellSelection` über mehrere Spalten **alle** erfassten Spalten in
  einem Schritt.
- **View-Sync (Pflicht):** Cursor landet in einer sinnvollen Zelle der Nachbarspalte (rechts,
  oder links falls die rechteste Spalte gelöscht wurde); Ansicht bleibt fokussiert und
  scrollt bei Bedarf.
- Sonderfall „Selektion = alle Spalten" bzw. „einzige verbleibende Spalte": siehe Abschnitt
  2.7.

### 2.7 Verbundene Zellen (`colspan`/`rowspan`) bei Einfügen/Löschen — verbindliche Regeln
Zellen verbinden/teilen ist ein separates Folge-Feature (siehe Kopfabschnitt), aber
**bereits verbundene** Zellen (aus importierten Dokumenten oder einem künftigen
`zellen-verbinden`) müssen von allen vier Operationen korrekt behandelt werden:

- **Zeile einfügen innerhalb eines vertikalen Merge-Bereichs (`rowspan`):** Der
  Merge-Bereich wird um eine Zeile **verlängert** (Bibliotheksverhalten von
  `addRowBefore`/`addRowAfter`), keine zerrissene/verwaiste Fortsetzungszelle.
- **Zeile einfügen neben einer horizontal verbundenen Zeile (`colspan`):** Die neue Zeile
  hat unabhängig davon **immer** so viele Zellen wie die effektive Spaltenzahl der Tabelle
  — kein Auf-/Absplitten.
- **Zeile löschen, wenn sie Ankerzeile einer `rowspan`-Zelle ist:** Der Zellinhalt
  **wandert** in die nächste noch vorhandene, von der Verbindung erfasste Zeile,
  `rowspan` wird dekrementiert — **kein Inhaltsverlust**.
- **Zeile löschen, wenn sie nur von einem `rowspan` überdeckt wird (nicht Anker):** Nur
  `rowspan` der Ankerzelle sinkt um 1, Inhalt bleibt unberührt.
- **Zeile löschen mit reiner `colspan`-Zelle (keine `rowspan`-Beteiligung):** Die Zelle
  verschwindet vollständig mit der Zeile (keine Migration nötig, da horizontal begrenzt).
- **Spalte einfügen, wenn eine `colspan`-Zelle über die Einfügeposition hinwegreicht:**
  **Keine** neue Zelle in dieser Zeile — stattdessen wird der `colspan`-Wert der
  bestehenden Zelle um 1 erhöht. In anderen Zeilen ohne diese Verbindung wird ganz normal
  eine neue Zelle eingefügt. Diese Entscheidung fällt **pro Zeile unabhängig** — eine
  Tabelle mit unregelmäßigen Merges bekommt in derselben Aktion eine Mischung aus
  „Zelle verbreitert" und „neue Zelle eingefügt". Das ist **gewünschtes** Verhalten, kein
  Fehler.
- **Spalte einfügen bei überlappendem `rowspan`:** Die Colspan-Erweiterung wirkt korrekt
  auch für alle vom `rowspan` überdeckten Folgezeilen (die verbundene Zelle wird nur
  **einmal** verbreitert, nicht pro Zeile erneut).
- **Spalte löschen, wenn eine `colspan`-Zelle über die gelöschte Spalte hinausragt:** Nur
  der `colspan`-Wert sinkt, Inhalt bleibt vollständig erhalten.
- **Spalte löschen, wenn die gelöschte Spalte exakt von einer `colspan`-Zelle ausgefüllt
  wird:** Zelle wird vollständig entfernt.
- **Spalte löschen mit `rowspan`-Zelle innerhalb der gelöschten Spalte:** Zelle wird über
  alle betroffenen Zeilen vollständig entfernt, die **Zeilenanzahl** der Tabelle ändert
  sich dabei **nicht**.
- **Kombinierte Zellen (gleichzeitig `colspan` UND `rowspan`, also ein rechteckiger
  Merge-Block über mehrere Zeilen und Spalten):** Jede der obigen Regeln muss **in
  Kombination** korrekt bleiben — z. B. Spalte einfügen mitten durch einen
  2×2-Merge-Block darf diesen nicht in zwei unabhängige, inkonsistente Zellen zerreißen,
  sondern muss ihn (je nach Einfügeposition) entweder korrekt verbreitern oder unverändert
  lassen. Dies ist der härteste Grenzfall dieser Spezifikation und **muss** mit einem
  eigenen, konkret konstruierten Testfall belegt werden (Abschnitt 5), nicht nur über die
  einfacheren Einzelfälle angenommen werden.

### 2.8 Letzte verbleibende Zeile/Spalte bzw. Selektion = alle Zeilen/Spalten (vereinheitlichte, verbindliche Entscheidung)
**Ausgangslage:** `deleteRow` und `deleteColumn` aus `prosemirror-tables` verweigern beide
identisch (kein Dispatch, `return false`) das Löschen, sobald die Selektion **alle** Zeilen
bzw. **alle** Spalten umfasst — sei es durch eine Tabelle mit nur einer verbleibenden
Zeile/Spalte oder durch eine `CellSelection`, die die gesamte Breite/Höhe markiert. Der
dispatch-lose Verfügbarkeits-Check liefert in diesem Zustand **fälschlich `true`** (Befund 0,
#5) — ein naiver `disabled`-Zustand würde die Buttons also aktiv anzeigen, obwohl ein Klick
ein stiller No-Op wäre.

**Die vier Ausgangsdateien widersprachen sich hier** — `zeile-loeschen-req.md` (Abschnitt
2.4) entschied sich primär für „gesamte Tabelle entfernen" (mit „Button deaktivieren" als
zulässiger Alternative, aber ohne feste Wahl), während `spalte-loeschen-req.md` (Abschnitt
2, Zeile 3, Abschnitt 3.6) sich für „Button deaktivieren, keine Autoentfernung" entschied.
Diese Datei trifft die Entscheidung **verbindlich und einheitlich für beide Dimensionen**:

> **Entscheidung: „Zeile löschen" auf der letzten verbleibenden Zeile bzw. „Spalte löschen"
> auf der letzten verbleibenden Spalte entfernt die gesamte Tabelle — für beide Operationen
> identisch, ohne Button-Deaktivierung als Sonderfall.**

**Begründung:** Das ist das Referenzverhalten sowohl von Word als auch von LibreOffice
Writer (Löschen der letzten Zeile *oder* letzten Spalte entfernt die Tabelle als Ganzes) —
die naheliegende, von Nutzer:innen erwartete Konsequenz, kein überraschendes Verhalten. Eine
uneinheitliche Lösung (Zeilen: Tabelle weg: Spalten: Button grau) wäre für Nutzer:innen
willkürlich und schwer zu erklären, zumal beide Fälle exakt derselben zugrunde liegenden
Bibliotheks-Guard-Bedingung entspringen. Zusätzlich vermeidet die Autoentfernung eine
zweite, separat zu erklärende Deaktivierungs-Bedingung neben „außerhalb der Tabelle"
(Abschnitt 1, #7) — die Buttons „Zeile/Spalte löschen" sind **ausschließlich** wegen
`isInTable(state) === false` deaktiviert, sonst nie.

**Konsequenzen dieser Entscheidung:**
- Umsetzung **nicht** über den bloßen Aufruf von `deleteRow`/`deleteColumn` (die tun in
  diesem Fall nichts), sondern über eine **eigene Vorprüfung** (Guard-Bedingung über
  `selectedRect` nachbilden) mit anschließendem Entfernen des gesamten Tabellenknotens.
- Ist die Tabelle das **einzige** Element im Dokument, wird automatisch ein leerer
  Standard-Absatz eingesetzt (Schema verlangt `content: 'block+'`, mindestens ein Block,
  `schema.ts:14`) — der Editor bleibt bedienbar (Cursor aktiv, Tippen sofort möglich).
- Cursor/View-Sync: Nach der Auto-Entfernung landet der Cursor sichtbar im
  nachfolgenden/vorhergehenden/neu eingefügten Absatz an der Stelle, an der die Tabelle
  stand — niemals in einem leeren/undefinierten Dokumentzustand.
- Undo/Redo: Tabellenentfernung + ggf. Absatz-Einfügen ist **ein einziger** Undo-Schritt;
  Strg+Z stellt die komplette Tabelle inkl. Inhalt und Cursor-Position exakt wieder her.
- Diese Autoentfernung macht den zuvor in `spalte-loeschen-req.md` diskutierten
  „Tabelle löschen"-Verweis in der Tooltip-Meldung überflüssig — es gibt in diesem Zustand
  **keinen** deaktivierten Button, der auf ein anderes Feature verweisen müsste.
- Betrifft **beide** Operationen identisch: eine 1×n-Tabelle, deren letzte Zeile gelöscht
  wird, verschwindet vollständig; eine n×1-Tabelle, deren letzte Spalte gelöscht wird,
  ebenso; eine 1×1-Tabelle verschwindet bei **jeder** der beiden Aktionen.

---

## 3. Grenzfälle

1. **Keine Tabelle aktiv** (Cursor im Fließtext): Alle sechs Buttons sichtbar, aber
   `disabled`, Tooltip erklärt den Grund (Abschnitt 1, #7). Kein Klick möglich, keine
   Konsole-Exception.
2. **Letzte verbleibende Zeile löschen** (Tabelle hat genau eine Zeile) bzw. **letzte
   verbleibende Spalte löschen** (Tabelle hat genau eine Spalte): gesamte Tabelle wird
   entfernt (Abschnitt 2.8), Cursor in gültigem Absatz; bei einziger Tabelle im Dokument
   bleibt automatisch ein leerer Absatz übrig.
3. **`CellSelection` über ALLE Zeilen bzw. ALLE Spalten** (auch bei mehrzeiliger/
   mehrspaltiger Tabelle): identisch zu Grenzfall 2 zu behandeln (Abschnitt 2.8) — **kein**
   stiller No-Op, da der dispatch-lose Bibliotheks-Check hier fälschlich „möglich" meldet.
4. **Tabelle mit horizontal verbundenen Zellen (`colspan`)**, Zeile oberhalb/unterhalb der
   verbundenen Zeile einfügen: Merge bleibt unverändert, neue Zeile hat korrekte effektive
   Spaltenzahl (Abschnitt 2.7).
5. **Tabelle mit vertikal verbundenen Zellen (`rowspan`)**, Zeile innerhalb des
   Merge-Bereichs einfügen: Merge wird um eine Zeile verlängert (Abschnitt 2.7); Rundreise
   muss den verlängerten Merge erhalten (Abschnitt 4).
6. **Zeile oberhalb der bisherigen ersten Zeile einfügen**, insbesondere wenn Zeile 1
   `colspan`/`rowspan` enthält: Da beide Writer `colCount` aus Zeile 0 ableiten (Befund 0,
   #9), muss die effektive Spaltenzahl nach dem Einfügen exakt gleich bleiben — dedizierter
   Regressionstest für **beide** Formate (Abschnitt 4).
7. **Ankerzeile einer `rowspan`-Zelle löschen:** Inhalt wandert in die nächste erfasste
   Zeile, `rowspan` dekrementiert, kein Inhaltsverlust (Abschnitt 2.7).
8. **Nur überdeckte Zeile einer `rowspan`-Verbindung löschen** (Anker bleibt bestehen):
   `rowspan` der Ankerzelle sinkt um 1, Inhalt unverändert.
9. **Spalte mit `colspan`-Zelle löschen**, die über die gelöschte Spalte hinausragt:
   `colspan` reduziert, Inhalt bleibt; deckt die gelöschte Spalte die Zelle exakt ab, wird
   sie komplett entfernt (Abschnitt 2.7).
10. **Spalte mit `rowspan`-Zelle löschen:** Zelle über alle betroffenen Zeilen entfernt,
    Zeilenanzahl bleibt gleich (Abschnitt 2.7).
11. **Kombinierter Merge-Block (`colspan` UND `rowspan` gleichzeitig)** — Zeile bzw. Spalte
    einfügen oder löschen, die mitten durch einen mehrzeiligen/-spaltigen Merge-Block
    verläuft: Struktur darf **nicht zerreißen** (keine hängende/verwaiste Teilzelle ohne
    gültigen Anker) — härtester Grenzfall, siehe Abschnitt 2.7, zwingend mit eigenem
    Testfall zu belegen (Abschnitt 5).
12. **Einfügen/Löschen am Tabellenanfang** (erste Zeile/Spalte): Position relativ zur
    ersten Zeile/Spalte korrekt, keine Off-by-one-Fehler bei nachfolgenden Operationen.
13. **Einfügen/Löschen am Tabellenende** (letzte Zeile/Spalte, bei mehr als einer
    verbleibenden): Tabelle bleibt bestehen, Cursor an sinnvoller Position, kein
    Sonderfall aus Abschnitt 2.8.
14. **Tabelle direkt am Dokumentanfang/-ende:** Jede der vier Operationen (inkl. der
    Auto-Entfernung aus Abschnitt 2.8) lässt den Editor danach normal bedienbar
    (Cursor per `gapCursor` vor/nach der Tabelle setzbar), kein inkonsistenter Zustand.
15. **Sehr breite Tabelle** (viele Spalten, > 5–7, sodass sie den Seiteninhalt bereits
    ausfüllt/überschreitet, vgl. `spalte-einfuegen-req.md` Grenzfall 4.7 und
    `specs/dokument-darstellung-req.md` Abschnitt 2.1): Spalte einfügen/löschen bleibt
    bedienbar und performant; kein Content-Verlust, auch wenn die Tabelle optisch über den
    Seitenrand hinausragt oder horizontal scrollbar wird — das zugrundeliegende
    Seiten-Darstellungsverhalten selbst ist nicht Gegenstand dieser Datei.
16. **Sehr lange Tabelle** (viele Zeilen, > 10, ggf. über mehrere A4-Seiten paginiert):
    Zeile in der Mitte einfügen/löschen verändert ausschließlich die betroffene Stelle,
    alle übrigen Zeilen bleiben unverändert und korrekt positioniert; Paginierung
    (`pagination.ts`) berechnet nach der Strukturänderung korrekt neu (Zusammenspiel mit
    `specs/dokument-darstellung-req.md`).
17. **Verschachtelte Tabelle** (Tabelle in einer Zelle): Operation auf die **äußere**
    Tabelle angewendet darf die innere Tabelle in der betroffenen Zelle nicht beschädigen
    (verschwindet ggf. mit einer gelöschten Zeile/Spalte, bleibt sonst unverändert);
    Operation **innerhalb** der inneren Tabelle wirkt sich nur auf diese aus, nicht auf die
    äußere.
18. **Reale Fremddatei mit exotischer Tabellenstruktur** (unregelmäßige `gridSpan`/
    `vMerge` bzw. `covered-table-cell`-Kombinationen, konkrete Kandidaten:
    `tests/fixtures/external/odt/tableCoveredContent.odt`, `tableComplex_DOC_LO41.odt`,
    `tableRowDeletionTest.odt`, `table-column-delete-with-merge.odt`, sowie ein
    vergleichbarer DOCX-Korpus aus `src/formats/docx/__tests__/external-fixtures.test.ts`):
    importieren, je eine Operation ausführen → kein Absturz, keine stille Korruption; wo
    eine Struktur nicht sicher interpretierbar ist, sichtbare Fehlermeldung statt stillem
    Fehlschlag (siehe Abschnitt 6, Zustands-Feedback).
19. **Wiederholtes, schnelles Auslösen** derselben oder verschiedener Operationen in Folge:
    jede Aktion ein eigener Undo-Schritt, keine doppelte Einfügung/Löschung durch
    Event-Race, keine Race Condition mit der Selection-Sync-Reconciliation aus
    `WordEditor.tsx`.
20. **Undo/Redo jeder Operation als genau ein Schritt** — auch bei Mehrzeilen-/
    Mehrspalten-Selektion und beim Sonderfall „ganze Tabelle entfernt" (Abschnitt 2.8).
    Gemischte Sequenzen (einfügen → löschen → Undo → Undo → Redo) liefern exakt den
    erwarteten Zwischenzustand, keine kumulierten Abweichungen.
21. **Selection-Sync-Regression:** Jede der vier Operationen, unmittelbar gefolgt von einem
    Klick zur Neupositionierung in eine verbleibende/neue Zelle und weiterem Tippen, darf
    **keinen** unbeabsichtigten Datenverlust/keine Fehlplatzierung erzeugen (bekannter
    Selection-Sync-Bug, Tabellen als „Hauptverdachtsfall").
22. **Tastaturaktivierung der sechs Buttons:** Button per Tab fokussieren (kein Klick),
    dann Enter **und** separat Leertaste drücken → Aktion löst in beiden Fällen zuverlässig
    aus (Abschnitt 1, #8) — explizit zu verifizieren, nicht anzunehmen.
23. **Mobile/Tablet-Bedienung:** Grundfall (Cursor per Tipp setzen, Button antippen) für
    alle sechs Bedienelemente auf den Projekten „Mobile" (Pixel 7) und „Tablet"
    (iPad Mini) funktionsfähig, Tap-Ziele ≥ 40 px, kein horizontaler Layout-Overflow durch
    eine breite Tabelle.
24. **Bild oder mehrabsätziger/formatierter Inhalt in einer gelöschten Zeile/Spalte:**
    Inhalt verschwindet vollständig mit der Struktur, keine verwaiste Bilddatei im
    späteren Export-Zip, kein verwaister Knoten im Dokumentmodell.
25. **Track-Changes-Abhängigkeit (zukünftig, außerhalb des aktuellen Scopes):** Sobald eine
    Änderungsverfolgung existiert, müssen alle vier Operationen als nachverfolgbare
    Strukturänderung markiert werden, statt sofort endgültig zu wirken — nur als künftige
    Abhängigkeit vermerkt, kein Bauauftrag dieser Datei.

---

## 4. Rundreise / Regressionsschutz

Grundregel: **Datei (oder im Editor erzeugte Tabelle) → Operation über echte Bedienung
auslösen → als DOCX **und** als ODT exportieren → reimportieren → Struktur/Inhalt
entspricht exakt dem Zustand nach der Operation im Editor, sonst keine Abweichung.**
Export-Prüfung erfolgt über einen **unabhängigen** Parser bzw. Roh-XML-Assertion
(`JSZip.loadAsync` + Textprüfung von `word/document.xml`/`content.xml`), nicht nur über
den eigenen Reader (sonst könnten sich Schreib- und Lesefehler gegenseitig verdecken).

### 4.1 Baseline (darf durch keine der vier Operationen brechen)
- Reale DOCX-/ODT-Datei mit Tabelle (inkl. mindestens einer `rowspan`- und einer
  `colspan`-Zelle) **unverändert** hochladen → exportieren → reimportieren → Inhalt
  entspricht dem Original. Bestehende Unit-Tests
  (`describe('DOCX/ODT round trip: tables')`) müssen weiterhin grün bleiben.
- Diese Baseline muss **vor und nach** jeder Änderung an der Tabellenlogik bestehen, damit
  ein späterer Rundreisefehler eindeutig einer der vier neuen Operationen zugeordnet werden
  kann.

### 4.2 Feature-Rundreise je Operation (DOCX **und** ODT, je über echte Bedienung)
1. Zeile oberhalb/unterhalb einer einfachen Tabelle einfügen → Export enthält die neue
   Zeile an korrekter Position, übrige Zeilen unverändert.
2. Zeile innerhalb eines `rowspan`-Bereichs einfügen → Export zeigt den verlängerten Merge
   (Roh-XML: Anzahl `<w:tc>`/`<table:table-cell>`+`<table:covered-table-cell>` je Zeile =
   `colCount`).
3. Zeile **vor** der bisherigen ersten Zeile einer Tabelle mit `colspan`/`rowspan`
   einfügen → Export-Spaltenzahl bleibt exakt gleich (dedizierter Regressionstest,
   Grenzfall 6).
4. Zeile löschen (Grundfall, Ankerzeile eines `rowspan`, nur überdeckte Zeile, reine
   `colspan`-Zeile, letzte verbleibende Zeile) → je einzeln über Export/Reimport
   nachgewiesen, inkl. Bild-in-gelöschter-Zeile-Fall (keine verwaiste Bilddatei im Zip).
5. Spalte links/rechts einer einfachen Tabelle einfügen → Export enthält die neue Spalte,
   `<w:gridCol>`/`<table:table-column>`-Anzahl korrekt erhöht.
6. Spalte neben einer horizontal verbundenen Zeile einfügen (Zelle wird verbreitert statt
   neue Zelle erzeugt, Abschnitt 2.7) → Export zeigt korrekte, gemischte Struktur je Zeile.
7. Spalte löschen (Grundfall, `colspan`-Reduktion, `colspan`-Komplettverlust,
   `rowspan`-Spalte, letzte verbleibende Spalte) → je einzeln über Export/Reimport
   nachgewiesen.
8. Kombinierter Merge-Block (`colspan` + `rowspan`) → Zeile bzw. Spalte mitten hindurch
   einfügen/löschen → Export zeigt eine strukturell konsistente, nicht zerrissene
   Merge-Struktur (Grenzfall 11 — **Pflicht-Roh-XML-Prüfung** für beide Formate, da hier
   das größte Risiko einer stillen Korruption liegt).
9. „Ganze Tabelle entfernt"-Fall (Abschnitt 2.8) → Export enthält **keine** leere/kaputte
   Tabellenstruktur mehr, umgebende Absätze bleiben unverändert; bei einziger Tabelle
   bleibt der automatisch eingefügte leere Absatz erhalten.
10. Reale Fremddatei (Grenzfall 18) → eine der vier Operationen ausführen → Export/Reimport
    → übriger Inhalt unverändert.
11. Mehrfache, unterschiedliche Operationen nacheinander (z. B. Zeile einfügen, dann Spalte
    löschen, dann erneut Zeile löschen) ohne Zwischen-Export → abschließender Export zeigt
    exakt den erwarteten kumulierten Zustand, kein „zufälliges Zurückkommen" gelöschter
    Elemente.

### 4.3 Cross-Format
Da die App **keinen** Formatwähler beim Export bietet (Befund 0, #13; ein geöffnetes
Dokument wird immer in sein Ursprungsformat re-exportiert), sind Cross-Format-Rundreisen
(DOCX → Operation → als ODT, und umgekehrt) **nicht** über echte Browser-Bedienung
durchführbar, sondern ausschließlich auf **Adapter-/Objektebene** (`readX(...)` → Operation
per Transaktion auf dem `body`-JSON → `writeY(...)` → `readY(...)`). Das ist eine
dokumentierte, produktbedingte Testgrenze, keine Lücke dieses Features — bei der
Verifikation explizit zu vermerken, nicht stillschweigend zu übergehen oder fälschlich als
UI-Bug zu werten. Für jede der vier Operationen ist mindestens ein Cross-Format-Testfall in
beiden Richtungen auf dieser Ebene zu führen.

**Abnahmemaßstab:** Formatierungsverluste bei Cross-Format-Konvertierung sind zu
dokumentieren und akzeptabel; **Struktur- oder Textverlust ist es nicht.** Eine falsch
berechnete Spaltenzahl oder ein zerrissener/verlorener Merge gilt als Strukturverlust und
ist ein Abnahme-Blocker.

---

## 5. Tests (Soll)

Kein Test wird durch diese Datei implementiert — sie legt fest, was nötig ist, bevor der
Backlog-Status auf „vorhanden" wechseln darf.

### 5.1 Unit-Tests
- **Command-Ebene** (`src/formats/shared/editor/__tests__/commands.test.ts`, erweitert):
  je Operation ein direkter Test gegen einen mit `EditorState.create` konstruierten
  Zustand — Grundfall, Merge-Erweiterung/-Migration/-Dekrement (Abschnitt 2.7),
  Mehrfachselektion (Abschnitt 2.5), Guard-Fall „letzte Zeile/Spalte" (Abschnitt 2.8),
  Tab-Verkettung (Zeile einfügen am Tabellenende). Unabhängig vom Browser, schnelle
  Regressionsprüfung.
- **Reader/Writer-Regression** (`docx/__tests__/roundtrip.test.ts`,
  `odt/__tests__/roundtrip.test.ts`, erweitert): dedizierte, benannte Tests für die
  Grenzfälle 6, 9, 11 (Spaltenzahl nach Zeile-1-Einfügen, `colspan`-Reduktion,
  kombinierter Merge-Block) — bestehende, bereits grüne Tests dürfen nicht durch diese
  Erweiterung verändert werden.
- **Cross-Format-Adapter** (neue Datei, z. B.
  `src/formats/shared/__tests__/table-structure-cross-format-roundtrip.test.ts`): je
  Operation ein Test auf Objektebene für beide Richtungen (Abschnitt 4.3).

### 5.2 E2E-Tests (Playwright, echte Bedienung — kein isolierter Command-Aufruf)
Neue Datei(en), z. B. `tests/e2e/table-structure.spec.ts`, durchgängig über
`page.getByRole('button', { name: '...' })`, `page.mouse` für `CellSelection`,
`page.keyboard` für Tab/Enter/Leertaste:
1. Je Operation der Grundfall (Cursor in einer Zelle, Klick auf den jeweiligen Button) →
   Struktur zählbar über `.ProseMirror tr`/`td` geprüft, nicht nur visuell.
2. Je Operation eine `CellSelection`-Variante (Teilbereich, mehrere Zeilen/Spalten, alle
   Zeilen/Spalten) gemäß Abschnitt 2.
3. Merge-Grenzfälle (4–11 aus Abschnitt 3), inkl. des kombinierten `colspan`+`rowspan`-
   Blocks als eigener, benannter Test.
4. „Letzte Zeile/Spalte löscht Tabelle"-Fall (Abschnitt 2.8) inkl. automatisch
   eingefügtem Absatz bei einziger Tabelle.
5. Deaktivierter Button-Zustand außerhalb einer Tabelle (alle sechs Buttons einzeln).
6. Tastaturaktivierung: jeden der sechs Buttons per Tab fokussieren, einmal mit Enter,
   einmal mit Leertaste auslösen (Grenzfall 22) — **kein** Test darf sich auf
   Playwrights `click()` beschränken, da dieses eine vollständige Maus-Ereignisfolge
   simuliert und die Enter-Lücke (Abschnitt 1, #8) damit unentdeckt ließe.
7. **Pflicht-Regressionstest Selection-Sync** (dauerhaft Teil von
   `tests/e2e/selection-regression.spec.ts` oder der neuen Datei): je Operation → Klick
   zur Neupositionierung → Enter/Tippen → Dokument konsistent.
8. Undo/Redo je Operation, inkl. gemischter Sequenzen (Grenzfall 20).
9. Sichtbare `CellSelection`-Markierung (Abschnitt 1, #12) vor jedem Löschvorgang.
10. Mobile/Tablet: Grundfall aller sechs Bedienelemente auf beiden Touch-Projekten
    (Grenzfall 23).
11. Reale Fremddatei-Fixtures (Grenzfall 18) je Operation.
12. Große/lange Tabelle (Grenzfall 15/16): Operation in der Mitte, UI bleibt
    reaktionsfähig, Paginierung bleibt korrekt.

### 5.3 Rundreise-Tests
Wie in Abschnitt 4 beschrieben, je Operation als E2E-Test über echten
`filechooser`-Upload und echten `page.waitForEvent('download')`, mit Roh-XML-Prüfung via
`JSZip.loadAsync`; Cross-Format auf der in Abschnitt 4.3 beschriebenen Adapter-Ebene.

---

## 6. Abnahmekriterien (Definition of Done)

Der Backlog-Status der vier betroffenen Slugs (`zeile-einfuegen`, `zeile-loeschen`,
`spalte-einfuegen`, `spalte-loeschen`) darf erst dann gemeinsam auf **vorhanden** wechseln,
wenn:

1. Alle sechs Bedienelemente aus Abschnitt 1 existieren, als ein zusammenhängender Block
   in der Toolbar sichtbar sind, per Maus, Leertaste **und** Enter auslösbar sind
   (Abschnitt 1, #8) und außerhalb einer Tabelle konsistent deaktiviert sind mit sichtbarer
   Begründung.
2. Jede der vier Operationen das in Abschnitt 2 beschriebene Detailverhalten (inkl.
   View-Sync, Mehrfachselektion gemäß der vereinheitlichten Ein-Element-Regel) exakt
   erfüllt.
3. Die vereinheitlichte Entscheidung aus Abschnitt 2.8 (letzte Zeile/Spalte → gesamte
   Tabelle entfernt, identisch für beide Dimensionen) implementiert und über Grenzfall 2/3
   nachgewiesen ist — **kein** stiller No-Op.
4. Alle Grenzfälle aus Abschnitt 3 einzeln geprüft und ihr Verhalten dokumentiert sind
   (auch wenn das Ergebnis „bewusst so, dokumentiert" statt „behoben" lautet), insbesondere
   der kombinierte Merge-Block (Grenzfall 11).
5. Die sichtbare `CellSelection`-Markierung (Abschnitt 1, #12) gebaut und für alle
   Löschvorgänge nachgewiesen ist.
6. Die Rundreise-Anforderungen aus Abschnitt 4 (Baseline, Feature-Rundreise je Operation,
   Cross-Format auf Adapter-Ebene) für DOCX **und** ODT über einen unabhängigen Parser
   bestätigt sind.
7. Alle Testfälle aus Abschnitt 5 automatisiert vorliegen, über echte Browser-Interaktion
   (nicht nur Command-/Unit-Ebene) laufen und grün sind — inklusive des dauerhaften
   Selection-Sync-Regressionstests je Operation.
8. Mobile-/Tablet-Bedienbarkeit (Grenzfall 23) für alle sechs Bedienelemente auf beiden
   Touch-Projekten nachgewiesen ist.
9. Undo/Redo für jede Operation als genau ein Schritt funktioniert, auch in gemischten
   Sequenzen (Grenzfall 20).
10. Kein während der Verifikation gefundener Fehler ohne Ticket/Vermerk zurückbleibt.

Andernfalls verbleibt der Status auf „fehlt" bzw. wird bei Teilerfüllung explizit auf
„teilweise" gesetzt, mit den konkret fehlenden Teilpunkten hier nachgetragen — ein
„vorhanden" darf nie auf einer ungeprüften Annahme beruhen.

---

## 7. UX-Invarianten-Durchgang (`specs/UX-INVARIANTEN.md` §1 — Punkt für Punkt)

1. **View-Sync:** Jede der vier Operationen ändert Dokumentstruktur und -selektion und
   muss die Ansicht nachführen: nach Zeile/Spalte einfügen bleibt der Cursor sichtbar in
   der ursprünglichen logischen Zelle (jetzt ggf. verschoben), die Ansicht scrollt bei
   Bedarf mit (Abschnitt 2.1–2.6). Nach Löschen landet der Cursor sichtbar in einer
   Nachbarzelle bzw. — im Sonderfall „Tabelle entfernt" (Abschnitt 2.8) — im umgebenden
   Absatz. **Lücke identifiziert und geschlossen:** Keine der vier Ausgangsdateien
   forderte explizit ein automatisches horizontales/vertikales Scrollen bei Operationen an
   sehr breiten/langen Tabellen — hier als Pflichtanforderung ergänzt (Abschnitt 2.1/2.4,
   Grenzfall 15/16), da sonst „Zeile eingefügt, aber außerhalb des Sichtfelds" eine
   plausible, aber bisher unspezifizierte Lücke wäre. **Anforderung ergänzt, nicht
   erfüllt behauptet** — muss bei Umsetzung nachgewiesen werden.
2. **Zustands-Feedback:** Erfolgreiches Einfügen/Löschen ist selbst die sichtbare
   Bestätigung (neue/fehlende Struktur), kein zusätzlicher Dialog nötig (konsistent mit
   Referenzverhalten Word/LibreOffice — kein Bestätigungsdialog vor destruktivem Löschen,
   Undo ist das Sicherheitsnetz). Schlägt eine Operation aus unerwartetem Grund fehl (z. B.
   eine strukturell inkonsistente Fremdtabelle, Grenzfall 18), muss eine **sichtbare**
   Meldung erfolgen statt eines stillen No-Ops — **kein** Teil-Erfolg (entweder
   vollständige Operation oder unveränderter Zustand plus Hinweis). Der deaktivierte
   Button-Zustand außerhalb einer Tabelle trägt eine sichtbare Begründung (Abschnitt 1,
   #7). **Erfüllt / wie beschrieben umzusetzen.**
3. **Fokus/Tastatur:** Alle sechs Buttons sind per Tab erreichbar und müssen sich per
   Enter **und** Leertaste auslösen lassen — dies ist die zentrale, in keiner der vier
   Ausgangsdateien vollständig gelöste Lücke (in `tabelle-einfuegen-req.md` Abschnitt 2.9
   nur für den bestehenden Button als Risiko benannt) und wird hier verbindlich als
   Bauauftrag festgeschrieben (Abschnitt 1, #8, Grenzfall 22). **Lücke geschlossen durch
   explizite Anforderung**, nicht als bereits erfüllt behauptet.
4. **Responsiveness:** Alle sechs Buttons müssen auf 320–768 px sichtbar/erreichbar sein
   (Toolbar ist bereits `flex flex-wrap`, `Toolbar.tsx:141`, umbricht also grundsätzlich),
   Tap-Ziele ≥ 40 px, kein horizontaler Overflow des Gesamtlayouts durch eine breite
   Tabelle (Abschnitt 1, #9, #12; Grenzfall 15/23; Zusammenspiel mit der in
   `specs/dokument-darstellung-req.md` bereits gebauten Auto-Fit-to-Width-Mechanik).
   Getestet auf den Mobile-/Tablet-Playwright-Projekten. **Anforderung konkret, Nachweis
   bei Umsetzung erforderlich.**
5. **Persistenz (für Salamanido invertiert):** Sämtliche Tabellenstruktur lebt
   ausschließlich im In-Memory-Dokumentmodell; keine der vier Operationen persistiert
   irgendetwas in `localStorage`/`IndexedDB`. Ein Reload verwirft jede
   Zwischenstruktur-Änderung, sofern nicht zuvor exportiert — das ist bewusst so
   (Datenschutz-Kernprinzip) und **kein** Fehlverhalten. **Erfüllt** durch Bauart (keine
   Persistenz-Schicht existiert für Dokumentinhalt).
6. **Konsistenz:** Alle Tooltips/`aria-label` auf Deutsch („Zeile oberhalb einfügen" etc.,
   keine Mischsprache); Hell- und Dunkelmodus-Klassen konsistent mit dem bestehenden
   Ausschneiden-Button-Muster (`disabled:opacity-40`, `dark:hover:bg-neutral-800` usw.);
   einheitliche SVG-Icon-Sprache statt Emoji/Unicode (Abschnitt 1, #11). **Anforderung
   konkret, Nachweis bei Umsetzung erforderlich.**

---

## 8. Journey-Durchgang (`specs/UX-INVARIANTEN.md` §2)

1. **Nutzer:in klickt in eine Zelle einer bestehenden Tabelle → will darunter eine neue
   Zeile.** *Erwartung:* Der Bedienblock „Tabelle" in der Toolbar ist sofort sichtbar,
   „Zeile unterhalb einfügen" ist aktiv (nicht ausgegraut), ein Klick fügt sofort eine
   sichtbare, leere Zeile ein, der Cursor bleibt an der ursprünglichen Stelle (jetzt
   unverändert an ihrer Position, da die neue Zeile danach kommt) → als Anforderung in
   Abschnitt 2.2 festgehalten.
2. **Nutzer:in hat aus Versehen die falsche Zeile eingefügt → drückt Strg+Z.**
   *Erwartung:* Genau die eingefügte Zeile verschwindet wieder, keine sonstige Änderung,
   Cursor an der Stelle vor dem Einfügen → Abschnitt 2, Grenzfall 20.
3. **Nutzer:in markiert mehrere Zellen einer Spalte über Maus-Drag, um sie zu löschen.**
   *Erwartung:* Die markierten Zellen sind **sichtbar hervorgehoben** (nicht unsichtbar wie
   im aktuellen Ist-Zustand, Befund 0 #8), bevor geklickt wird — sonst ist unklar, was
   gelöscht wird → als Pflichtanforderung in Abschnitt 1, #12 festgehalten.
4. **Nutzer:in löscht die letzte verbleibende Spalte einer Tabelle.** *Erwartung:*
   Irgendetwas Sinnvolles passiert — nicht ein Button, der klickbar aussieht, aber nichts
   tut. Die Tabelle verschwindet komplett (wie in Word/LibreOffice), der Cursor landet im
   umgebenden Text → verbindlich entschieden in Abschnitt 2.8, nicht offen gelassen.
5. **Nutzer:in fügt eine Spalte in eine bereits sehr breite Tabelle ein, die schon fast
   die ganze Seite ausfüllt.** *Erwartung:* Die Tabelle wächst sichtbar; wenn die neue
   Spalte außerhalb des sichtbaren Bereichs liegt, scrollt die Ansicht automatisch dorthin,
   damit die neue Spalte sofort sichtbar/bearbeitbar ist, statt dass Nutzer:in erst
   manuell suchen muss → Abschnitt 2.4, View-Sync-Pflicht.
6. **Nutzer:in bedient den Editor ausschließlich per Tastatur** (z. B. wegen
   Sehbehinderung oder Vorliebe für Tastaturbedienung): Tab zum Toolbar-Bereich, weiter
   zum gewünschten Tabellen-Button, Enter drückt. *Erwartung:* Die Aktion löst zuverlässig
   aus — genau wie bei einem Mausklick. Ohne das wäre die gesamte Funktion für
   tastaturgestützte Nutzer:innen faktisch unerreichbar → Abschnitt 1, #8, als
   verbindlicher Bauauftrag festgehalten, nicht als Restrisiko stehen gelassen.
7. **Nutzer:in importiert ein reales Word-Dokument mit einer komplexen Tabelle
   (verbundene Zellen aus einer Kopfzeile), will eine Zeile in der Mitte löschen.**
   *Erwartung:* Die Tabelle bleibt danach optisch und strukturell intakt — keine
   zerrissenen Zellen, kein Absturz, und beim erneuten Speichern (Export) bleibt die
   Struktur für ein anderes Programm (z. B. echtes Word) korrekt lesbar → Abschnitt 2.7,
   Grenzfall 11, Rundreise-Anforderung Abschnitt 4.2, Punkt 8.
8. **Nutzer:in arbeitet am Smartphone unterwegs, tippt in eine Tabellenzelle und will eine
   Spalte einfügen.** *Erwartung:* Der passende Button ist auf dem schmalen Bildschirm
   erreichbar (nicht durch Umbruch verdeckt oder zu klein zum Treffen), ein Antippen fügt
   die Spalte ein wie am Desktop → Abschnitt 1, #9, Grenzfall 23.

---

Referenz: `specs/UX-INVARIANTEN.md` (verbindliche Methodik für jede `req.md`). Diese Datei
ersetzt inhaltlich `specs/zeile-einfuegen-req.md`, `specs/zeile-loeschen-req.md`,
`specs/spalte-einfuegen-req.md` und `specs/spalte-loeschen-req.md` als konsolidierte
Anforderungsgrundlage für den Bedienblock „Tabellenstruktur bearbeiten"; die vier
Ausgangsdateien bleiben als Code-Recherche-Referenz und Testfall-Fundus bestehen, ihr
Freigabestatus richtet sich ab sofort nach dieser Datei.

---

## 9. Umsetzungsstand (Dev, 2026-07-05)

**Umgesetzt:**
- `commands.ts`: Insert-Kommandos direkt aus `prosemirror-tables` re-exportiert
  (`addRowBefore/After`, `addColumnBefore/After` — behandeln colspan/rowspan bibliotheks-
  seitig korrekt). `deleteRowOrTable`/`deleteColumnOrTable` mit eigenem Guard: die
  Bedingung „Selektion umfasst alle Zeilen/Spalten" (`rect.top===0 && rect.bottom===map.height`
  bzw. `left===0 && right===map.width`) spiegelt exakt die Refuse-Bedingung der Lib; in
  genau diesem Zustand wird die **ganze Tabelle** entfernt (statt stillem No-Op, §2.8) und —
  falls die Tabelle das einzige Blockelement war — ein leerer Absatz eingesetzt; alles in
  **einer** Transaktion (ein Undo-Schritt).
- `Toolbar.tsx`: sechs Buttons als ein Block mit je eigenem Inline-SVG-Icon (kein Emoji,
  §1 #11), `disabled` außerhalb einer Tabelle mit sichtbarer Begründung im `title`/`aria-label`
  (§1 #7). **Tastaturaktivierung (§1 #8) gelöst** über `onMouseDown`+`preventDefault`
  (Selektionserhalt, kein Fokusklau) **plus** `onClick` (führt das Kommando aus — feuert bei
  Mausklick, Enter **und** Leertaste, ohne Doppelauslösung). View-Sync über `runTable`
  (`tr.scrollIntoView()`, §2.1–2.6). Tap-Ziele `min-w-10 min-h-10` (=40 px, §7).
- `index.css`: sichtbare `.selectedCell`-Overlay-Regel (`::after`, `pointer-events:none`,
  hell/dunkel), damit vor dem Löschen erkennbar ist, was markiert ist (§1 #12).

**Tests:** `src/formats/shared/editor/__tests__/table-structure.test.ts` (Command-Ebene inkl.
Guard, Merge, Nicht-in-Tabelle), `src/formats/shared/__tests__/table-structure-roundtrip.test.ts`
(Feature-Rundreise DOCX **und** ODT je Operation + Merge-Integrität + „Tabelle entfernt"),
`tests/e2e/table-structure.spec.ts` (echte Bedienung auf Desktop Chrome/Mobile/Tablet:
disabled↔enabled, Insert/Delete Zeile+Spalte, letzte Zeile→Tabelle weg, **Tastatur-Enter/Space**,
Undo, sichtbare `.selectedCell`-Markierung).

**Bewusste Scope-Grenze (kein DoD-§6-Punkt):** Das in §2.2 *referenzierte* „Tab in der letzten
Zelle fügt eine Zeile an" (aus `zeile-einfuegen-req.md`) ist **noch nicht** umgesetzt — es ist
in §6 kein hartes Abnahmekriterium; die vier Operationen sind vollständig über die sechs
Buttons bedienbar. Nachziehen als Folge-Schritt.

**Ehrliche Testnotiz (kein Produktmangel):** Der Undo-E2E-Test wartet bewusst ~600 ms vor dem
Löschen, weil `prosemirror-history` Doc-Änderungen innerhalb `newGroupDelay` (~500 ms) zu
**einem** Undo-Schritt gruppiert — im schnellen Testlauf würden Tabelle-Einfügen und
Zeile-Löschen sonst zu einem Schritt verschmelzen (ein Undo entfernte dann die ganze Tabelle).
Reale Nutzer:innen agieren Sekunden auseinander → getrennte Schritte. Gleiche dokumentierte
Mechanik wie beim Einfügen-Undo-Test.

**Nachbesserung nach 1. QA-Durchgang (QA-FAIL → Lücken geschlossen):** Der erste QA-Lauf
bemängelte zu Recht fehlende Testabdeckung an den härtesten Spec-Punkten. Ergänzt:
- **Kombinierter colspan+rowspan-Merge-Block (§2.7/§3 Nr. 11):** Unit-Tests bauen einen
  2×2-Merge-Block und prüfen nach Spalte-/Zeile-Einfügen/Löschen, dass `TableMap.get()` gelingt
  (wirft bei zerrissenem Raster) und die effektiven Maße stimmen; rowspan-Anker-Löschung
  migriert Inhalt (kein Verlust). Verhalten damit **verifiziert**, nicht angenommen.
- **Cross-Format-Adapter (§4.3)** + **unabhängige Roh-XML-Prüfung (§4)** + **reale
  Fixtures (§3 Nr. 18):** neue Datei `table-structure-cross-format-roundtrip.test.ts` —
  DOCX-Herkunft→ODT und ODT-Herkunft→DOCX je Operation; Roh-`document.xml`/`content.xml`
  via `JSZip` (`<w:tr>`/`<w:gridSpan>`/`<w:vMerge>` bzw. `<table:table-row>`/
  `<table:covered-table-cell>`); reale ODT-Fixtures (`tableCoveredContent.odt`,
  `tableRowDeletionTest.odt`, `table-column-delete-with-merge.odt`) überstehen Operation +
  Rundreise ohne Absturz/Korruption.
- **E2E ergänzt:** „letzte Spalte löscht Tabelle" im Browser, Undo der Auto-Tabellenentfernung
  als **ein** Schritt, lange (mehrseitige) Tabelle bleibt bei Operationen korrekt/reaktionsfähig,
  Teilauswahl→genau-ein-Element (Unit).
