# Anforderungsspezifikation: „Tabelle erstellen/löschen" — Größenwahl beim Einfügen & vollständiges Löschen

Status: **Entwurf zur Freigabe, nicht vertrauenswürdig bis einzeln über echte
Browser-Bedienung verifiziert.** Diese Datei fasst zwei eng zusammengehörige, bisher nur
getrennt beschriebene Vorgänger-Anforderungen (`specs/tabelle-einfuegen-req.md`,
`specs/tabelle-loeschen-req.md`) zu **einem** Nutzer-Erlebnis „Tabelle erstellen/löschen"
zusammen und aktualisiert beide gegen den **tatsächlichen, seither deutlich weiterentwickelten**
Code-Stand (die Vorgänger-Features `specs/tabelle-struktur-bearbeiten-req.md` und
`specs/zellen-verbinden-req.md` sind seitdem gebaut und abgenommen — sie haben
Infrastruktur geschaffen, die hier direkt wiederverwendet wird, siehe Abschnitt 0).

**Rollentrennung (verbindlich, `specs/UX-INVARIANTEN.md` Abschnitt 3):** Diese Datei ist aus
**Nutzersicht** geschrieben, kennt den Implementierungsaufwand bewusst nicht und fordert
deshalb die offensichtlichen Nutzererwartungen ein (Tastatur-/Touch-Zugänglichkeit,
sichtbarer Zustand, Undo als Sicherheitsnetz, kein stiller Fehlschlag), statt sie
wegzurationalisieren. **Kein Code, keine Tests** — nur die Anforderung, an der sich
Umsetzung (Dev) und Abnahme (QA) messen lassen.

**Geltungsbereich — genau zwei Funktionen:**
1. **Größenwahl beim Einfügen:** Der bestehende Button „⊞ Tabelle" fügt aktuell **immer** eine
   feste 2×2-Tabelle ein (`Toolbar.tsx:427-439`, `insertTable(2, 2)`, verifiziert unten). Er
   muss stattdessen eine Zeilen-/Spaltenauswahl anbieten, bevor eingefügt wird.
2. **Tabelle löschen:** Ein neuer, eigenständiger, immer-in-einer-Tabelle-verfügbarer Weg, die
   **ganze** Tabelle zu entfernen, unabhängig davon, was innerhalb gerade markiert ist.

**Ausdrücklich NICHT Teil dieser Datei** (eigene, bereits abgenommene bzw. separate
Backlog-Slugs): Zeile/Spalte einfügen/löschen (`specs/tabelle-struktur-bearbeiten-req.md`,
bereits umgesetzt) und Zellen verbinden/teilen (`specs/zellen-verbinden-req.md`, bereits
umgesetzt). Beide werden hier nur insofern erwähnt, als der neue Löschen-Button **dieselbe**,
bereits gebaute und getestete Kernlogik (`deleteEnclosingTable`) wiederverwendet, die diese
beiden Vorgänger-Features intern bereits nutzen — siehe Abschnitt 0, Punkt 3.

Stil und Gliederung orientieren sich an `specs/tabelle-struktur-bearbeiten-req.md` und
`specs/zellen-verbinden-req.md` (identischer Detailgrad, identische Abschnittsnummerierung
inkl. §7 UX-Invarianten-Durchgang und §8 Journey-Durchgang). **Zeilennummern sind
Momentaufnahmen** (Stand 2026-07-05, gegen `E:\docs\src` frisch verifiziert) und bei
Umsetzung per Symbolsuche neu zu verankern.

---

## 0. Verifizierter Ist-Stand

Jede Zeile unten wurde durch direktes Lesen des aktuellen Quellcodes bestätigt — nicht aus den
Vorgänger-Dateien übernommen, da sich seit deren Entstehung viel geändert hat.

| # | Fundstelle | Befund |
|---|---|---|
| 1 | `Toolbar.tsx:427-439` | Der Button „⊞ Tabelle" (`title`/`aria-label="Tabelle einfügen"`, `aria-pressed={isInTable(view.state)}`) löst ausschließlich über `onMouseDown` + `e.preventDefault()` aus und ruft **fest verdrahtet** `run(view, insertTable(2, 2))` auf — keine Rückfrage, keine Größenwahl. **Wichtiger, zusätzlicher Befund gegenüber der Vorfassung:** Anders als die acht neueren Tabellen-Buttons (`TableOpButton`, siehe Punkt 4) hat **dieser** Button **kein** `onClick` — nur `onMouseDown`. Ein per **Enter** aktivierter, fokussierter `<button>` erzeugt browserübergreifend **kein** `mousedown`-Ereignis, nur ein `click` (Leertaste erzeugt zusätzlich ein synthetisches `mousedown`/`mouseup`). Dieser Button ist damit **aktuell wahrscheinlich nicht per Enter auslösbar** — eine Lücke, die `specs/tabelle-einfuegen-req.md` Abschnitt 2.9 bereits 2026-07-04 als offenes Risiko benannt hatte und die bis heute **nicht behoben** wurde (verifiziert: der Button ist seither unverändert). Da dieser Button ohnehin umgebaut wird, um den Dialog zu öffnen, ist dies **jetzt zu beheben**, nicht erneut nur zu dokumentieren. |
| 2 | `commands.ts:183-193` | `insertTable(rows, cols)` ist bereits **vollständig parametrisiert**: erzeugt `rows` Zeilen mit je `cols` Zellen über `table_cell.createAndFill()!` (sofort beschreibbar, Z. 186) und ersetzt die aktuelle Selektion (`state.tr.replaceSelectionWith(table)`, Z. 189). Die UI nutzt nur `insertTable(2, 2)` — keine Änderung an dieser Funktion nötig, nur an der Toolbar-Anbindung. |
| 3 | `commands.ts:195-220` | **`deleteEnclosingTable()` existiert bereits** und ist genau das, was für „Tabelle löschen" gebraucht wird: löscht den gesamten umschließenden Tabellenknoten (`selectedRect(state)` → `tablePos = rect.tableStart - 1` → `state.tr.delete(tablePos, tablePos + tableNode.nodeSize)`), fügt bei Bedarf einen leeren Absatz ein, falls das Dokument sonst leer wäre (`tr.doc.childCount === 0`, Schema verlangt `content: 'block+'`), setzt den Cursor sinnvoll über `TextSelection.near(...)` und ruft `scrollIntoView()` — alles in **einer** Transaktion (ein Undo-Schritt). **Aber:** Die Funktion ist **nicht exportiert** und aktuell **ausschließlich intern** aus `deleteRowOrTable`/`deleteColumnOrTable` (Z. 230-248) erreichbar, und zwar nur dann, wenn deren Selektion **alle** Zeilen bzw. **alle** Spalten abdeckt. Es gibt **keinen** eigenständigen, immer-in-der-Tabelle-verfügbaren Weg, sie direkt aufzurufen. Für diese Anforderung muss sie **exportiert** und an einen eigenen Button gebunden werden. |
| 4 | `Toolbar.tsx:218-261` (`TableOpButton`) | Bereits etablierte, **direkt wiederverwendbare** Button-Komponente für alle acht bestehenden Tabellen-Buttons (sechs Struktur- + zwei Merge/Split-Buttons): `onMouseDown`+`preventDefault()` (Selektionserhalt) **plus** `onClick` (führt das Kommando aus — feuert zuverlässig bei Mausklick, Leertaste **und** Enter, ohne Doppelauslösung); optionale `isEnabled`/`disabledHint`-Props für abweichende Aktivierungsbedingungen (Default: `isInTable`); `title`/`aria-label` mit sichtbarem Deaktivierungsgrund; Tap-Ziel `min-w-10 min-h-10` (= 40 px). Dieselbe Komponente ist der naheliegende Baustein für den neuen „Tabelle löschen"-Button. |
| 5 | **Kritischster Einzelbefund — `isInTable` erkennt eine `NodeSelection` auf der ganzen Tabelle nicht** (`node_modules/prosemirror-tables/dist/index.js:390-394`, `commands.ts:2` `NodeSelection` bereits importiert) | `isInTable(state)` klettert von `state.selection.$head` aus die **Vorfahren** hoch und prüft `tableRole === 'row'` (Z. 392). Ist die **ganze Tabelle selbst** als `NodeSelection` markiert (Zustand, der laut ProseMirror-Konvention entsteht, wenn ein Cursor am Anfang des Absatzes direkt **nach** einer Tabelle steht und Backspace gedrückt wird — `baseKeymap`, `WordEditor.tsx:229`), zeigt `$head` auf die Position **vor** der Tabelle; die Tabelle selbst ist an dieser Position kein Vorfahre, sondern der nachfolgende Knoten. **`isInTable` liefert in diesem Zustand `false`.** Selbst die fertige Bibliotheksfunktion `deleteTable` (`dist/index.js:1832-1839`) hilft hier nicht: sie klettert von `state.selection.$anchor` aus `$pos.node(d)` für `d > 0` hoch und findet eine Tabelle nur, wenn die NodeSelection-Tabelle **innerhalb einer anderen** Tabelle liegt (verschachtelter Fall) — bei einer Top-Level-Tabelle ist `$pos.depth` zu gering, die Schleife läuft nicht, `deleteTable` liefert `false`. Zusätzlich würde `selectedRect(state)` (von `deleteEnclosingTable` nach dem `isInTable`-Gate aufgerufen, `commands.ts:204`) über `selectionCell(state)` (`dist/index.js:398-405`) in diesem Zustand eine `RangeError` werfen, da weder eine `CellSelection` noch eine Zell-`NodeSelection` noch ein `cellAround`/`cellNear`-Treffer vorliegt. **Konsequenz:** Ein „Tabelle löschen"-Button, dessen Aktivierung/Ausführung sich naiv auf `isInTable`/`deleteTable` verlässt, ist in genau diesem — keineswegs seltenen — Backspace-nach-Tabelle-Zustand entweder fälschlich deaktiviert oder löst einen stillen No-Op/Absturz aus. Dies ist **kein** theoretisches Altrisiko aus der Vorfassung, sondern am heutigen Code direkt durch Lesen der Bibliotheksquelle bestätigt. |
| 6 | `WordEditor.tsx:205,206-228,229-231,238` | `history()` (Undo/Redo), Keymap ohne `Tab`/`Shift-Tab`-Bindung, `keymap(baseKeymap)` (Standard-Backspace/Delete, erzeugt u. a. die NodeSelection aus Punkt 5), `columnResizing()`/`tableEditing()`, `gapCursor()`. Kein eigener `contextmenu`-Listener (dokumentierte, bewusste Projektentscheidung, Kommentar ab Z. 243). |
| 7 | `src/index.css` (`.selectedCell::after`, ca. Z. 116-134) | Sichtbares Mehrzellen-Auswahl-Overlay bereits vorhanden (aus dem Merge/Split-Feature) — für „Tabelle löschen" nicht zwingend Voraussetzung (die ganze Tabelle verschwindet unabhängig von der genauen Innenauswahl), aber relevant für den Grenzfall „Klick löschen bei aktiver `CellSelection`" (Abschnitt 3). |
| 8 | `schema.ts:14,171` | `doc: { content: 'block+' }` verlangt mindestens einen Block (relevant für „Tabelle ist einziger Dokumentinhalt", Abschnitt 2.11/2.13); `tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} })` — Tabellen sind überall erlaubt, wo Absätze erlaubt sind, **auch innerhalb einer Tabellenzelle** → verschachtelte Tabellen sind schemaseitig zulässig (relevant für Einfügen **und** Löschen, Abschnitt 2.13). |
| 9 | `src/app/PrivacyModal.tsx` | Einziges vorhandenes Modal-Muster im Projekt: `fixed inset-0 z-50`-Overlay, zentrierte Karte, ein Button. **Kein** Escape-Schließen, **kein** Klick-außerhalb-Schließen, **keine** Fokus-Falle — taugt nur als **Styling-Vorlage**. Der neue Größenwahl-Dialog muss diese Mechanismen **komplett neu** bauen. |
| 10 | `specs/FEATURE-BACKLOG.md:181,189` | `tabelle-einfuegen`: „Fügt eine Tabelle mit wählbarer Zeilen-/Spaltenzahl ein.", Status **„teilweise"**, Priorität 1. `tabelle-loeschen`: „Entfernt die komplette Tabelle inklusive Inhalt.", Status **„fehlt"**, Priorität 1. Beide durch obige Befunde bestätigt zutreffend. |
| 11 | `playwright.config.ts:34-36` | Drei Projekte, die jede UI-Änderung abdecken müssen: **Desktop Chrome**, **Mobile** (Pixel 7, Touch), **Tablet** (iPad Mini). |
| 12 | Reale Testfixtures (per Glob bestätigt vorhanden) | `tests/fixtures/external/docx/bug57031.docx` (große Tabelle mit `gridSpan`/`vMerge`), `TestTableColumns.docx`, `TestTableCellAlign.docx`, `deep-table-cell.docx`, `table-alignment.docx`, `table-indent.docx`, `table_footnotes.docx`; `tests/fixtures/external/odt/BigTable.odt`, `crazyTable.odt`, `subTables.odt`/`subTables2.odt`/`subTables3-nested.odt`/`subTables3-onlyOneColumn.odt`/`subTables4.odt`/`table-within-textBox-within-frame.odt` (verschachtelt), `table-column-delete-with-merge.odt`/`table-column-delete-with-merge-2-times.odt`/`tableCoveredContent.odt`/`tableOps.odt`/`tableRowDeletionTest.odt` (exotische Merge-Strukturen), `OOStyledTable.odt`/`coloredTable_MSO15.odt`/`TableFunkyBackground.odt`/`feature_attributes_tables*.odt` (Stil/Formatierung), `TableWidth.odt`/`tableNotFullWidth.odt` (Breitenangaben), `simple-table.odt`/`simpleTable.odt`/`simple_table.odt`/`simple-table-with-lists.odt`/`listsInTable.odt`/`table.odt`/`table_simple.odt`/`TestTextTable.odt`/`doc_heading_table.odt`/`empty4table.odt` (Basisabdeckung). |

**Fazit:** Der größte Teil der technischen Grundlage existiert bereits und ist bereits durch
die Vorgänger-Features gehärtet (`insertTable`, `deleteEnclosingTable`, `TableOpButton`,
sichtbare Zellauswahl). Die eigentliche Arbeit dieser Anforderung ist (a) ein neuer,
zugänglicher Größenwahl-Weg vor dem Einfügen, (b) das Exportieren/Verdrahten von
`deleteEnclosingTable` an einen eigenen, immer verfügbaren Button, (c) die **verbindliche
Behebung** der NodeSelection-Lücke aus Punkt 5 — sonst ist „Tabelle löschen" ausgerechnet in
einem alltäglichen Zustand kaputt —, und (d) die Behebung der Enter-Tastatur-Lücke aus Punkt 1
am bestehenden Einfüge-Button, die seit ihrer Entdeckung ungelöst blieb.

---

## 1. Menüpunkte/Bedienelemente

| # | Element | Ist-Zustand | Soll |
|---|---|---|---|
| 1 | Button „Tabelle einfügen" (bisher „⊞ Tabelle") | Löst **direkt** `insertTable(2, 2)` aus, nur `onMouseDown` (Punkt 0.1) | Öffnet einen **Größenwahl-Dialog** statt direkt einzufügen; löst zuverlässig per Maus, Leertaste **und** Enter aus (ergänztes `onClick`-Muster wie `TableOpButton`, Punkt 0.1/0.4). Feste 2×2-Direkteinfügung entfällt vollständig. |
| 2 | Größenwahl-Dialog | existiert nicht | Ein neu gebautes, eigenständiges Overlay (Styling-Vorbild `PrivacyModal.tsx`, Mechanik komplett neu: Escape/Klick-außerhalb/Fokus-Falle/Fokus-Rückgabe, siehe Abschnitt 2.1) mit **zwei gleichwertigen Eingabewegen zum selben Zustand** (Abschnitt 2.2): einem Maus-/Touch-Rasterauswähler und zwei beschrifteten Zahlenfeldern „Zeilen"/„Spalten". |
| 3 | Zahlenfelder „Zeilen"/„Spalten" | existieren nicht | Ganzzahlig, `min=1`, `max=20` (Begründung Abschnitt 2.3); vorbelegt mit 3×3; per Tab erreichbar, per Screenreader über `<label>` benannt; einzige für Tastatur-/Screenreader-Nutzer:innen **erforderliche** Bedienoberfläche (siehe Punkt 4). |
| 4 | Raster-Auswähler | existiert nicht | Sichtbares Gitter (z. B. 10 Spalten × 8 Zeilen Vorschau) zum schnellen Ziehen/Antippen einer Fläche für Maus- und Touch-Nutzer:innen — **kein Ersatz**, sondern **Beschleuniger** für die Zahlenfelder (schreibt in dieselben zwei Werte, keine zweite Quelle der Wahrheit). **Bewusst nicht eigenständig tastaturbedienbar** (kein 2D-Tastaturraster mit Pfeiltasten-Navigation) — Begründung Abschnitt 2.2: Word selbst bietet für sein Raster ebenfalls keine Tastatur-/Screenreader-Bedienung an und verweist stattdessen auf einen Zahlen-Dialog; genau diese Rolle übernehmen hier die Zahlenfelder, sodass **niemand** auf das Raster angewiesen ist. |
| 5 | Bestätigen/Abbrechen | existiert nicht | „Einfügen"-Button (bzw. Enter in einem Zahlenfeld) übernimmt die aktuellen Zahlenfeld-Werte; „Abbrechen", Escape und Klick außerhalb schließen **ohne** Dokumentänderung. Ein Klick/Tap direkt auf eine Rasterzelle fügt **sofort** mit genau dieser Größe ein und schließt den Dialog (Begründung Abschnitt 2.2). |
| 6 | Button „Tabelle löschen" | existiert nicht (`deleteEnclosingTable` ist nur intern erreichbar, Punkt 0.3) | Neuer, eigener `TableOpButton` direkt neben „Tabelle einfügen", eigenes SVG-Icon (Tabellenrahmen mit deutlichem „×"/Durchstreichung, optisch klar von den bestehenden Zeilen-/Spalten-Löschen-Icons unterscheidbar). Ruft die **exportierte** `deleteEnclosingTable()` auf. |
| 7 | Aktivierungsbedingung „Tabelle löschen" | — | **Nicht** der bloße `isInTable`-Default des `TableOpButton` (Punkt 0.4), da dieser die in Punkt 0.5 beschriebene NodeSelection-auf-Tabelle nicht erkennt. Aktiv, wenn `isInTable(state)` **oder** die aktuelle Selektion eine `NodeSelection` ist, deren Knoten `type.name === 'table'` ist. Deaktiviert nur, wenn wirklich **keine** Tabelle betroffen sein kann. |
| 8 | Kein Bestätigungsdialog vor dem Löschen | — | **Bewusste Entscheidung, unverändert aus der Vorgänger-Spec übernommen:** kein blockierender Zusatzdialog vor dem Löschen. Undo ist das alleinige Sicherheitsnetz — konsistent mit „Bild löschen" (ohne Rückfrage) und mit Word/LibreOffice-Referenzverhalten. Ein Zusatzdialog widerspräche dem reibungsarmen Verhalten, das auch der neue Größenwahl-Dialog beim **Einfügen** nicht unnötig verlangsamen soll (siehe Abschnitt 1, #5: Raster-Klick fügt in einem Schritt ein). |
| 9 | Kontextmenü (Rechtsklick) | existiert projektweit nicht (`WordEditor.tsx:243`ff., dokumentierte Entscheidung) | **Kein Soll-Bestandteil**, konsistent mit allen bisherigen Tabellen-Features. |
| 10 | Tastaturaktivierung beider betroffener Buttons (Enter **und** Leertaste) | „Tabelle einfügen" aktuell wahrscheinlich **nicht** per Enter auslösbar (Punkt 0.1); „Tabelle löschen" existiert noch nicht | Beide Buttons müssen sich per Maus, Leertaste **und** Enter zuverlässig auslösen lassen — over das etablierte `TableOpButton`-Muster (`onMouseDown`+`preventDefault()` **plus** `onClick`), nicht nur über `onMouseDown`. **Verbindlich zu beheben, nicht nur zu dokumentieren.** |
| 11 | Touch-Bedienung (Mobile/Tablet) | ungeprüft, da beide Funktionen noch nicht existieren | Antippen von „Tabelle einfügen" öffnet den Dialog; Antippen einer Rasterzelle **oder** Ausfüllen der Zahlenfelder + Antippen von „Einfügen" fügt ein; Antippen von „Tabelle löschen" löscht — auf **allen drei** Playwright-Projekten (Punkt 0.11), nicht nur Desktop Chrome. Tap-Ziele ≥ 40 px (Rasterzellen mindestens so groß wie die etablierten `min-w-10 min-h-10`-Buttons, oder mit ausreichendem Innenabstand, damit auch auf einem Touch-Bildschirm eine einzelne Zelle zuverlässig getroffen wird). |
| 12 | Sichtbarer/deaktivierter Zustand außerhalb einer Tabelle | — | „Tabelle löschen" ist deaktiviert mit sichtbarer Begründung (`title`/`aria-label`, `TableOpButton`-Muster), wenn weder `isInTable` noch die Tabellen-NodeSelection-Bedingung zutrifft — kein kommentarloses Ausgrauen, kein Klick, der wirkungslos bleibt. |

---

## 2. Gewünschtes Verhalten im Detail

### 2.1 Der Größenwahl-Dialog: Öffnen, Schließen, Fokus
- Klick/Tap auf „Tabelle einfügen" öffnet **immer** zuerst den Dialog — es gibt keinen Modus,
  der ohne Rückfrage sofort eine Tabelle einfügt.
- Der Dialog ist ein eigenständiges Overlay über dem Editor. Da `PrivacyModal.tsx` nur das
  visuelle Styling liefert (Abschnitt 0, Punkt 9), müssen **alle** Mechanismen neu gebaut
  werden: Escape schließt ohne Änderung, Klick außerhalb der Dialogkarte schließt ohne
  Änderung, der Fokus wird beim Öffnen in den Dialog gelenkt (erstes interaktives Element,
  sinnvollerweise das erste Zahlenfeld) und beim Schließen **zuverlässig an den Editor
  zurückgegeben** (Fokus-Falle: Tab im Dialog verlässt den Dialog nicht in die Toolbar
  dahinter).
- **Selektion über die Dialog-Lebensdauer hinweg festhalten:** Der bestehende Button nutzt
  `onMouseDown`+`preventDefault()`, um die Editor-Selektion beim Öffnen nicht zu verlieren.
  Das eigentliche Einfügen geschieht beim Dialog-Weg aber **später** (Klick auf „Einfügen"
  bzw. auf eine Rasterzelle), wenn der Fokus zwischenzeitlich im Dialog lag. Die
  Cursor-Position/Selektion zum Öffnungszeitpunkt muss deshalb gemerkt und beim tatsächlichen
  Einfügen wiederhergestellt werden — sonst landet die Tabelle an unerwarteter Stelle oder
  ersetzt eine falsche Selektion (siehe Grenzfall „Selektion über Dialog-Lebensdauer").

### 2.2 Zwei gleichwertige Eingabewege zum selben Zustand
- **Zahlenfelder (verbindlicher, immer vorhandener Weg):** zwei beschriftete `<input
  type="number">`-Felder „Zeilen" und „Spalten", `min=1`, `max=20`, ganzzahlig, vorbelegt mit
  3×3. Per Tab erreichbar, per Screenreader über ein `<label>` benannt. Bestätigen per Klick
  auf „Einfügen" oder per Enter in einem der Felder ruft `insertTable(rows, cols)` mit genau
  den eingegebenen (validierten) Werten auf und schließt den Dialog.
- **Raster-Auswähler (Beschleuniger für Maus/Touch, kein Ersatz):** ein sichtbares Gitter (z. B.
  10 Spalten × 8 Zeilen als Vorschau-Obergrenze des Rasters selbst — die eigentliche
  Maximalgröße von 20×20, Abschnitt 2.3, bleibt über die Zahlenfelder erreichbar, auch wenn
  sie größer als das sichtbare Raster ist). Bewegen der Maus (bzw. Ziehen des Fingers bei
  Touch) über das Raster hebt die überstrichene N×M-Fläche sichtbar hervor und zeigt eine
  Live-Beschriftung „N × M" an; dieselbe Aktion aktualisiert **live** die beiden Zahlenfelder,
  so dass Maus-/Touch- und Zahlenfeld-Zustand nie auseinanderlaufen.
- **Zwei bewusst unterschiedliche Bestätigungs-Ebenen (Produktentscheidung, begründet):** Ein
  Klick/Tap **direkt auf eine Rasterzelle** fügt **sofort** mit genau dieser Größe ein und
  schließt den Dialog — analog zum vertrauten, schnellen Word/Google-Docs-Verhalten, bei dem
  das Klicken im Raster selbst die Bestätigung ist. Ein Eintippen in die Zahlenfelder fügt
  dagegen **nicht** bei jedem Tastendruck ein, sondern **erst** nach explizitem Klick auf
  „Einfügen" bzw. Enter — hier lohnt sich ein zusätzlicher, expliziter Bestätigungsschritt,
  weil Zahlenfelder anders als ein Rasterklick tatsächlich einen Tippfehler enthalten können
  (siehe Grenzfall „ungültige Eingabe"), der vor dem Einfügen korrigierbar bleiben muss.
- **Warum kein reines Raster ohne Zahlenfelder genügt (PO-Entscheidung, verbindlich):** Ein
  Hover-Raster ist für Tastatur- und Screenreader-Nutzer:innen strukturell unzugänglich (kein
  etabliertes Muster für eine per Pfeiltasten navigierbare 2D-Rasterauswahl ohne erheblichen
  Zusatzaufwand; selbst Word bietet dafür keine Tastaturbedienung, sondern einen separaten
  Zahlen-Dialog). Ein reines Zahlenfeld-Paar ohne Raster wäre für Maus-/Touch-Nutzer:innen
  dagegen langsamer als die vertraute visuelle Vorschau. Die Kombination erfüllt beides, ohne
  dass eine Nutzergruppe einen Kompromiss eingehen muss.

### 2.3 Grenzen: Minimum, Maximum, Standardwert (begründet)
- **Minimum: 1×1.** Es gibt keinen fachlichen Grund, eine 1×1-Tabelle zu verbieten — sie ist
  schemakonform (`table` mit genau einer `table_row` mit genau einer `table_cell`) und kann
  ein legitimer Anwendungsfall sein (z. B. ein umrandetes Textfeld). Die zuvor feste
  2×2-Größe war kein UX-Minimum, sondern ein zufälliger Implementierungs-Defaultwert.
- **Maximum: 20 Zeilen × 20 Spalten.** Begründung: Bereits die Vorgänger-Anforderung
  `specs/tabelle-einfuegen-req.md` (Grenzfall 3.4) benannte 20×20 als „große, gerade noch
  zulässige" Referenzgröße, die performant bleiben muss — diese Spezifikation macht diese
  Grenze **verbindlich** statt implizit. 20×20 deckt praktisch jeden realistischen
  Einfüge-Bedarf ab (eine größere Datentabelle entsteht in der Praxis eher durch schrittweises
  Erweitern über die bereits vorhandenen „Zeile/Spalte einfügen"-Buttons als durch einen
  einzigen, riesigen Einfüge-Vorgang); eine höhere Grenze erhöht das Risiko, dass ein
  Tippfehler (z. B. eine zusätzliche Null) eine UI-einfrierende Tabelle erzeugt, ohne dafür
  einen echten Nutzen zu bieten. Eingabe über die Zahlenfelder oberhalb von 20 wird mit einer
  sichtbaren Fehlermeldung abgelehnt (siehe Grenzfall „zu große Eingabe"), **nicht** still auf
  20 gekappt (stilles Kappen wäre ein überraschendes, nicht dem Tippfehler entsprechendes
  Ergebnis).
- **Standardwert: 3×3.** Größer als die alte feste 2×2 (macht sichtbar, dass jetzt eine
  echte Größe gewählt werden kann), aber immer noch klein genug, um ein reiner Klick auf
  „Einfügen" ohne weitere Eingabe ein sinnvolles, sofort überschaubares Ergebnis liefert.
- **Das sichtbare Rastergitter selbst** (Abschnitt 2.2) darf kleiner als die absolute
  Maximalgröße sein (z. B. 10×8 als Vorschau) — das ist eine bewusste, dokumentierte
  UI-Grenze der Vorschau, keine Einschränkung der tatsächlich erreichbaren Maximalgröße, die
  über die Zahlenfelder weiterhin bis 20×20 reicht.

### 2.4 Eingabevalidierung
- Ganzzahlige Werte ≥ 1 und ≤ 20 für beide Felder. Nicht-numerische, negative, `0`- oder
  leere Eingabe sowie Werte > 20 werden **vor** dem Einfügen abgefangen: eine sichtbare, per
  Screenreader angekündigte Fehlermeldung (`role="alert"`, wiederverwendbares Muster: das
  bereits vorhandene `role="alert"`-Fehlerbanner für „Ausschneiden", `Toolbar.tsx` ca.
  Z. 307-311) erscheint, **keine** Tabelle wird eingefügt, kein stiller Fehlschlag, kein
  JS-Fehler.
- Der Raster-Weg (Abschnitt 2.2) kann strukturell keine ungültige Eingabe erzeugen (jede
  Rasterzelle entspricht einem gültigen Wert ≤ der sichtbaren Vorschau-Obergrenze) und braucht
  daher keine eigene Validierung.

### 2.5 Einfügen an der Cursor-Position
- Die Tabelle wird an der beim Öffnen des Dialogs festgehaltenen Cursor-Position bzw. anstelle
  der dortigen Selektion eingefügt (`insertTable`, `commands.ts:189`,
  `replaceSelectionWith`). Markierter Text wird dabei **ersetzt**, nicht zusammengeführt —
  Standard-ProseMirror-Verhalten, hier bestätigtes, gewolltes Verhalten.
- Nach dem Einfügen liegt der Cursor in einer sinnvollen Zelle (typischerweise der ersten),
  der Editor ist ohne weiteren Klick sofort bedienbar; die Ansicht scrollt so, dass die neue
  Tabelle sichtbar ist (View-Sync-Pflicht, `specs/UX-INVARIANTEN.md` §1.1).

### 2.6 Sofortige Bearbeitbarkeit nach dem Einfügen
- Jede Zelle enthält bereits einen leeren Absatz (`createAndFill()`, `commands.ts:186`) und
  ist unmittelbar anklick- und beschreibbar, unabhängig von der gewählten Zeilen-/Spaltenzahl
  (1×1 bis 20×20).
- Zellinhalt bleibt selbst formatierbar und kann mehrere Absätze enthalten
  (`cellContent: 'block+'`).

### 2.7 Undo/Redo des Einfügens
- Einfügen (über jeden der beiden Wege) ist **ein** Undo-Schritt. Strg+Z direkt danach entfernt
  die komplette Tabelle wieder und stellt Cursor-/Textzustand her. Strg+Y stellt sie inklusive
  der gewählten Größe wieder her.

### 2.8 Tabelle löschen: Grundverhalten
- Cursor irgendwo innerhalb einer Tabelle (beliebige Zelle, unabhängig von Zeilen-/
  Spaltenposition) → Klick/Tap auf „Tabelle löschen" entfernt den **kompletten** Tabellenknoten
  samt allen Zeilen, Zellen und deren Inhalt (Text, Formatierung, Bilder, verschachtelte
  Listen/Tabellen).
- **Unabhängig davon, was innerhalb der Tabelle gerade markiert ist:** ein einzelner
  Cursor, eine `CellSelection` über einen Teilbereich, eine `CellSelection` über die gesamte
  Tabelle — in **allen** Fällen verschwindet die **ganze** Tabelle, nicht nur eine
  Teilauswahl. Das unterscheidet „Tabelle löschen" grundsätzlich von „Zeile löschen"/„Spalte
  löschen" (die sich auf die konkrete Selektion beziehen, `specs/tabelle-struktur-bearbeiten-req.md`).
- Text/Inhalt **vor** und **nach** der Tabelle bleibt vollständig und unverändert erhalten.

### 2.9 NodeSelection-auf-Tabelle (Pflichtfall, kein stiller Fehlschlag) — kritischster Punkt
- Zusätzlich zum „Cursor in einer Zelle"-Fall muss der Zustand behandelt werden, in dem die
  **gesamte Tabelle als ein Objekt** markiert ist (`NodeSelection` auf dem `table`-Knoten).
  Verifiziert (Abschnitt 0, Punkt 5): Dieser Zustand ist **kein theoretischer Randfall** —
  Backspace am Anfang des Absatzes direkt nach einer Tabelle erzeugt ihn über das
  Standard-`baseKeymap`-Verhalten.
- **Verifiziert als aktuell unzureichend:** Weder `isInTable(state)` noch die
  Bibliotheksfunktion `deleteTable` erkennen/behandeln diesen Zustand für eine
  Top-Level-Tabelle korrekt (Abschnitt 0, Punkt 5, mit exakten Zeilenverweisen in
  `prosemirror-tables`). Ein `TableOpButton` mit dem Standard-`isEnabled=isInTable` wäre in
  diesem Zustand **fälschlich deaktiviert**.
- **Anforderung (Pflicht, beide Teile):**
  1. Der Button „Tabelle löschen" muss in diesem Zustand **aktiv** sein — die
     Aktivierungsbedingung muss `isInTable(state)` **oder** „Selektion ist eine
     `NodeSelection` mit `node.type.name === 'table'`" prüfen (Abschnitt 1, #7).
  2. Ein Klick in diesem Zustand muss die Tabelle **tatsächlich und vollständig entfernen**,
     nicht wirkungslos bleiben. Da `selectedRect`/`selectionCell` hier eine `RangeError`
     werfen würden (Abschnitt 0, Punkt 5), braucht dieser Fall einen eigenen Codepfad, der die
     Position/den Knoten direkt aus der `NodeSelection` selbst nimmt (deren `.from`/`.node`
     sind bereits bekannt — kein `selectedRect`-Aufruf nötig), statt sich auf die für den
     „Cursor in Zelle"-Fall gebaute Logik zu verlassen.
- Ergebnis muss in **beiden** Auslösewegen identisch sein (gleicher Cursor-Zustand danach,
  gleicher Undo-Schritt) — kein Nutzer-sichtbarer Unterschied danach, welcher der beiden
  Zustände vorher vorlag.

### 2.10 Abgrenzung zu Zeile/Spalte löschen
- „Zeile löschen"/„Spalte löschen" entfernen bereits **heute** automatisch die ganze Tabelle,
  wenn ihre Selektion alle Zeilen bzw. alle Spalten abdeckt (`deleteRowOrTable`/
  `deleteColumnOrTable`, `commands.ts:230-248`, ruft intern `deleteEnclosingTable()` auf,
  Abschnitt 0, Punkt 3). „Tabelle löschen" nutzt **dieselbe** Kernfunktion — das Ergebnis
  (welche Struktur verschwindet, wie der Cursor danach steht) ist in allen drei Auslösewegen
  identisch, es gibt keine Sonderbehandlung, die nur für den neuen Button gilt.
- „Tabelle löschen" ist aber **unabhängig** von einer bestimmten Selektionsform nutzbar —
  während „Zeile/Spalte löschen" nur bei einer Selektion greift, die *zufällig* die ganze
  Tabelle abdeckt, funktioniert „Tabelle löschen" bei **jeder** Cursor-Position innerhalb der
  Tabelle. Das ist der eigentliche Nutzen dieses neuen Buttons: die zuvor nur implizit/zufällig
  erreichbare Ganz-Tabelle-Entfernung wird zu einem expliziten, auffindbaren Weg.

### 2.11 Cursor-/Fokus-Verhalten nach dem Löschen
- Cursor landet an einer sinnvollen, deterministischen Stelle (Anfang des nachfolgenden
  Absatzes bzw. Ende des vorhergehenden, falls kein Nachfolger existiert); der Editor ist
  sofort ohne weiteren Klick weiter bedienbar.
- **Tabelle ist einziger Dokumentinhalt:** Da `doc: { content: 'block+' }` mindestens einen
  Block verlangt, hinterlässt das Löschen der letzten/einzigen Tabelle einen leeren
  Standard-Absatz an ihrer Stelle — kein ungültiger/leerer Dokumentzustand, kein Absturz
  (bereits durch `deleteEnclosingTable`, `commands.ts:211-214`, abgedeckt — hier zu
  **bestätigen**, nicht neu zu bauen).
- **Tabelle am Dokumentanfang/-ende:** Cursor-Zielregel greift auch hier, kein Inhaltsverlust
  davor/danach, `gapCursor` bleibt konsistent.

### 2.12 Undo/Redo des Löschens
- Löschen (über jeden der beiden Aktivierungswege aus Abschnitt 2.9) ist **ein**
  Undo-Schritt. Strg+Z stellt die Tabelle **exakt** wieder her: gleiche Zeilen-/Spaltenzahl,
  gleiche verbundenen Zellen (`colspan`/`rowspan`), derselbe Zellinhalt inklusive
  Formatierung, enthaltener Bilder/Listen, sowie eine sinnvoll wiederhergestellte Cursor-
  Position. Strg+Y entfernt die Tabelle erneut vollständig.
- Funktioniert korrekt in gemischten Sequenzen (Einfügen → Tippen → Löschen → Undo → Undo →
  Redo) ohne Verschmelzung mit einer unmittelbar vorausgehenden, unabhängigen Aktion.

### 2.13 Verschachtelte Tabellen (Einfügen **und** Löschen)
- **Einfügen mit Cursor bereits in einer Tabellenzelle:** Da `cellContent: 'block+'`
  (Abschnitt 0, Punkt 8) eine Tabelle als Kind-Inhalt einer Zelle zulässt, entsteht eine
  **verschachtelte** Tabelle (wie in Word/LibreOffice). Das ist **zugelassenes, dokumentiertes
  Verhalten**, keine Verhinderung/Rückfrage nötig — kein Absturz, unabhängig von der gewählten
  Innen-Größe.
- **Löschen mit Cursor in einer inneren (verschachtelten) Tabelle:** „Tabelle löschen"
  entfernt **nur** die innere Tabelle; die äußere Tabelle und deren übrige Zellen bleiben
  vollständig erhalten (die betroffene Zelle erhält idealerweise einen leeren Absatz an
  Stelle der inneren Tabelle).
- **Löschen mit Cursor in einer Zelle der äußeren Tabelle** (außerhalb der verschachtelten
  Tabelle): entfernt die äußere Tabelle samt allem Inhalt, **einschließlich** jeder darin
  verschachtelten Tabelle — erwartetes Verhalten, kein separater Rettungsmechanismus, aber
  auch kein Absturz.

### 2.14 Mobile/Touch (beide Funktionen)
- **Einfügen:** Antippen von „Tabelle einfügen" öffnet den Dialog sichtbar; Antippen eines
  Zahlenfelds öffnet die native Bildschirmtastatur; Antippen einer Rasterzelle fügt sofort mit
  dieser Größe ein (Abschnitt 2.2); Antippen von „Einfügen" bestätigt die Zahlenfeld-Werte.
- **Löschen:** Antippen einer Zelle setzt den Cursor, Antippen von „Tabelle löschen" entfernt
  die Tabelle.
- Beides muss auf **allen drei** Playwright-Projekten funktionieren (Desktop Chrome, Mobile/
  Pixel 7, Tablet/iPad Mini), nicht nur auf Desktop Chrome.

### 2.15 Tastaturaktivierung beider Buttons
- „Tabelle einfügen" **und** „Tabelle löschen" müssen sich per Maus, Leertaste **und** Enter
  gleichermaßen zuverlässig auslösen lassen, sobald sie per Tab fokussiert sind. Das etablierte
  `TableOpButton`-Muster (`onMouseDown`+`preventDefault()` **plus** `onClick`) ist hierfür die
  vorgesehene Lösung (bereits an acht bestehenden Tabellen-Buttons bewährt, Abschnitt 0,
  Punkt 4) — der bestehende Einfüge-Button muss auf dieses Muster **migriert** werden
  (Abschnitt 0, Punkt 1), nicht nur um den Dialog ergänzt werden, ohne die Enter-Lücke zu
  schließen.
- Im Dialog selbst: Tab-Reihenfolge Zahlenfeld „Zeilen" → Zahlenfeld „Spalten" → „Abbrechen" →
  „Einfügen" (oder eine gleichwertige, konsistente Reihenfolge); Enter in einem Zahlenfeld löst
  „Einfügen" aus, Escape löst „Abbrechen" aus.

---

## 3. Grenzfälle

1. **Dialog abbrechen** (Escape/„Abbrechen"/Klick außerhalb): keine Tabelle, Cursor-Position
   und Selektion bleiben exakt wie vor dem Öffnen erhalten.
2. **Ungültige Zahlenfeld-Eingabe** (0, negativ, nicht-numerisch, leer, Dezimalzahl): sichtbare
   Fehlermeldung, keine Tabelle eingefügt, kein stiller No-Op, kein JS-Fehler.
3. **Zu große Eingabe** (> 20 in einem der Felder): sichtbare Fehlermeldung statt stillem
   Kappen auf 20 oder UI-Einfrieren.
4. **Minimalfall 1×1:** Einfügen über beide Wege funktioniert identisch zu größeren Tabellen;
   die entstehende Tabelle ist sofort beschreibbar und ebenso über „Tabelle löschen" wieder
   entfernbar wie jede größere.
5. **Maximalfall 20×20:** Einfügen, Scrollen, Bearbeiten bleiben performant (kein spürbares
   Einfrieren); Export/Reimport in vertretbarer Zeit (< 3 s).
6. **Einfügen bei aktiver Textselektion:** markierter Text wird ersetzt (kein Zusammenführen),
   entspricht dokumentiertem, gewolltem Verhalten (Abschnitt 2.5).
7. **Selektion über die Dialog-Lebensdauer:** Dialog öffnen, per Klick ins Dokument
   zurückklicken (Fokus verlässt den Dialog nicht vollständig, z. B. via Klick außerhalb, der
   noch nicht schließt, o. Ä.), dann „Einfügen" → Tabelle landet an der beim Öffnen
   festgehaltenen bzw. zuletzt gültigen Position, nicht an einer unvorhersehbaren Stelle
   (Abschnitt 2.1).
8. **Am Dokumentanfang/-ende einfügen bzw. löschen:** Cursor-Positionierung davor/danach bleibt
   möglich, Dokument voll editierbar, `gapCursor`-Verhalten konsistent.
9. **Verschachtelte Tabelle durch aktives Einfügen** (Cursor bereits in einer Zelle):
   zugelassenes Verhalten (Abschnitt 2.13), kein Absturz, unabhängig von der Größe.
10. **Einfügen innerhalb eines Listenelements:** definiertes, getestetes Verhalten (Liste
    unterbrechen vs. Tabelle als Kind des Listenelements), kein zufälliges Schema-Ergebnis.
11. **NodeSelection auf ganzer Tabelle** (Cursor am Anfang des Absatzes direkt nach einer
    Tabelle, ein Backspace): Button „Tabelle löschen" **aktiv**, Klick entfernt die Tabelle
    vollständig, **kein** stiller No-Op — der wichtigste Einzel-Testfall dieser Spezifikation
    (Abschnitt 2.9).
12. **Klick bei Cursor außerhalb jeder Tabelle** (kein Löschziel vorhanden, auch keine
    Tabellen-NodeSelection): Button deaktiviert, kein Klick möglich; ein deaktivierter Button
    darf **nicht** versehentlich die nächstgelegene Tabelle im Dokument löschen.
13. **Zwei aufeinanderfolgende Tabellen ohne trennenden Absatz:** Löschen der einen darf die
    andere nicht mitentfernen oder mit ihr verschmelzen.
14. **Verschachtelte Tabelle löschen** (innen vs. außen, siehe Abschnitt 2.13): beide Richtungen
    einzeln testen, kein Absturz.
15. **Tabelle mit `CellSelection` über einen Teilbereich löschen:** die ganze Tabelle
    verschwindet, nicht nur die markierten Zellen (Abschnitt 2.8).
16. **Tabelle ist einziges Dokumentelement, sofort nach dem Einfügen wieder gelöscht** (ohne
    zwischenzeitliche Eingabe): Dokument bleibt gültig (mindestens ein leerer Absatz), kein
    Crash.
17. **Sehr große Tabelle löschen** (> 10 Spalten, > 20 Zeilen, reale Fixtures `BigTable.odt`,
    `crazyTable.odt`): Löschen bleibt performant, Undo stellt die komplette Struktur korrekt
    wieder her.
18. **Tabelle mit Bild in einer Zelle löschen, danach exportieren:** keine verwaisten
    Bilddateien/Relationship-Einträge im Export-Zip.
19. **Tabelle mit einer Liste in einer Zelle löschen:** Liste verschwindet vollständig mit,
    keine losgelöste Listendefinition im Export.
20. **Mehrfaches, schnelles Klicken/Antippen** (auf „Tabelle einfügen", auf eine Rasterzelle,
    auf „Tabelle löschen"): kein doppeltes Einfügen/Löschen durch Event-Bubbling oder
    Doppelauslösung.
21. **Undo/Redo über mehrere Zyklen** (löschen → Undo → Redo → Undo → …): Tabelle bleibt bei
    jedem Schritt strukturell bit-genau identisch, kein schleichender Strukturverlust.
22. **Tabelle mit gemischter Formatierung löschen** (mehrere Absätze, fett/kursiv/Ausrichtung
    je Absatz derselben Zelle): beim Löschen verschwindet alles, beim Undo kommt alles inkl.
    Formatierungsdetails zurück.
23. **Selection-Sync-Regressionsmuster:** Text in einer Zelle eingeben → per Klick den Cursor
    in eine andere Zelle neu positionieren → sofort „Tabelle löschen" auslösen → Tabelle
    verschwindet vollständig, keine stale Selektion führt zu falschem Ziel oder Crash (Tabellen
    gelten laut `FEATURE-SPEC-DOCX-ODT.md` als „Hauptverdachtsfall" des Selection-Sync-Bugs).
24. **Löschen unmittelbar nach dem Einfügen** (kein Klick dazwischen): funktioniert ebenso
    zuverlässig wie das Löschen einer bereits länger bestehenden Tabelle.
25. **Reale Fremddatei mit exotischer Tabellenstruktur importieren, dann löschen**
    (`table-column-delete-with-merge.odt`, `tableCoveredContent.odt`, `tableOps.odt`,
    `tableRowDeletionTest.odt` — ungewöhnliche `colspan`/`covered-table-cell`-Strukturen): kein
    Absturz, vollständige Entfernung trotz ungewöhnlicher Ausgangsstruktur.
26. **Spaltenzahl überschreitet die Seitenbreite** (z. B. 15–20 Spalten auf A4): visuell
    verifizieren, ob die Tabelle über die Seite hinausragt, gestaucht wird oder horizontal
    scrollbar ist — kein Content-Verlust in jedem Fall.
27. **Touch-Bedienung** (Mobile/Tablet, Abschnitt 2.14): Größenwahl-Dialog und Löschen-Button
    funktionieren auf beiden Touch-Projekten ebenso wie auf Desktop Chrome.
28. **Enter-Taste auf beiden fokussierten Buttons** (Abschnitt 2.15): Button per Tab
    fokussieren (kein Klick), Enter drücken → Dialog öffnet sich bzw. Tabelle wird gelöscht.
    Explizit zu verifizieren, **nicht** anzunehmen — reagiert ein Button nicht, ist das ein zu
    behebender Bedienbarkeits-Bug, kein hinnehmbarer Grenzfall (ohne funktionierendes Enter
    hätte eine rein tastaturgestützte Person keinen zuverlässigen Weg zu beiden Funktionen).

---

## 4. Rundreise-Anforderung (Pflicht für Abnahme, DOCX **und** ODT)

Grundregel: **Tabelle mit gewählter Zeilen-/Spaltenzahl im Editor erzeugen bzw. löschen →
unverändert exportieren → erneut importieren → Ergebnis entspricht inhaltlich exakt dem
Zustand im Editor nach der Aktion.** Export-Prüfung über einen **unabhängigen** Parser bzw.
Roh-XML-Assertion (`JSZip.loadAsync` + Textprüfung von `word/document.xml`/`content.xml`),
nicht nur über den eigenen Reader.

### 4.1 Größenwahl beim Einfügen
1. Über den Dialog (Zahlenfelder) eine 4×3-Tabelle einfügen, jede Zelle mit unterschiedlichem
   Text füllen, als DOCX exportieren → exakt 4 `<w:tr>`, je Zeile exakt 3 `<w:tc>`,
   Zellinhalte an der richtigen Position.
2. Dasselbe über den Raster-Weg (Klick/Tap auf die 4×3-Zelle) → identisches Ergebnis wie über
   die Zahlenfelder.
3. Dasselbe als ODT: `content.xml` enthält exakt 4 `<table:table-row>`, je Zeile exakt 3
   `<table:table-cell>`; `<table:table-column>`-Anzahl stimmt.
4. 1×1- und 20×20-Tabelle je einmal über den Dialog einfügen, exportieren, reimportieren →
   Struktur exakt erhalten (Grenzfälle 4/5).
5. Rundreise mit anschließendem erneuten Import → identische Zeilen-/Spaltenzahl und
   Zellinhalte.

### 4.2 Tabelle löschen
1. Einfache Tabelle (2×2, mit Absatz davor und danach) einfügen, sofort über den neuen Button
   löschen → als DOCX exportieren → reimportieren → nur die beiden umgebenden Absätze
   vorhanden, keine Tabellenreste im XML.
2. Dasselbe als ODT.
3. Tabelle mit Inhalt (Text, Formatierung, Bild, verschachtelter Liste) befüllen, dann über
   den neuen Button löschen → DOCX- **und** ODT-Rundreise: weder Tabellen- noch Zellinhalt
   taucht im reimportierten Dokument wieder auf, umgebender Text unverändert.
4. **Löschen über den NodeSelection-Pfad** (Abschnitt 2.9): Cursor per Backspace-Auslösung in
   den NodeSelection-Zustand bringen, über den Button löschen, exportieren, reimportieren →
   Tabelle fehlt vollständig, kein Rest-XML.
5. Zwei Tabellen im Dokument, nur eine löschen → die verbleibende Tabelle bleibt vollständig
   und unverändert erhalten (DOCX und ODT).
6. Verschachtelte Tabelle: äußere Tabelle löschen (mit innerer Tabelle darin) → komplette
   Struktur fehlt; nur die innere löschen → äußere Tabelle bleibt mit übrigen Zellen
   vollständig erhalten.
7. Reale Fremddateien (Abschnitt 0, Punkt 12) importieren, enthaltene Tabelle über den
   tatsächlichen Toolbar-Button löschen, exportieren, reimportieren, prüfen, dass die Tabelle
   fehlt und aller übrige Inhalt erhalten blieb — mindestens `bug57031.docx`, `BigTable.odt`,
   je eine verschachtelte (`subTables.odt`) und eine exotische Merge-Fixture
   (`tableCoveredContent.odt`).
8. Cross-Format doppelte Rundreise: im Editor erzeugte, dann gelöschte Tabelle als ODT
   exportieren → reimportieren → als DOCX exportieren → reimportieren → Tabelle bleibt über
   beide Konvertierungen korrekt abwesend.

**Abnahmemaßstab:** Formatierungsverluste außerhalb der gelöschten/eingefügten Tabelle sind
nicht akzeptabel; Struktur- oder Textverlust am **übrigen** Dokument ist ein Abnahme-Blocker.

---

## 5. Testfälle (Soll)

Kein Test wird durch diese Datei implementiert — sie legt fest, was vor einem Statuswechsel
auf „vorhanden"/„verifiziert" nachzuweisen ist. E2E-Tests durchgängig über **echte**
Browser-Interaktion (`page.getByRole`, `page.keyboard`, `page.mouse`, echter
`filechooser`-Upload, echter `page.waitForEvent('download')`), nicht über isolierte
Command-Aufrufe.

### 5.1 Unit-Tests
- `insertTable(rows, cols)` mit variablen, gültigen Kombinationen (1×1, 3×3, 20×20) — Zellenzahl,
  sofortige Beschreibbarkeit jeder Zelle.
- Validierungslogik des Dialogs (0, negativ, nicht-numerisch, leer, > 20) — Fehlerzustand statt
  Einfügung.
- `deleteEnclosingTable()` (exportiert) — Grundfall (Cursor in Zelle), Sonderfall „Tabelle ist
  einziger Dokumentblock" (Ersatz-Absatz wird eingefügt), Cursor-Zielposition nach dem Löschen.
- **Pflicht-Unit-Test: NodeSelection-auf-Tabelle-Fall** (Abschnitt 2.9) — einen Zustand
  konstruieren, in dem `state.selection instanceof NodeSelection` und der Knoten vom Typ
  `table` ist; verifizieren, dass die neue Aktivierungsbedingung `true` liefert und das
  Lösch-Kommando die Tabelle tatsächlich entfernt (nicht `false` zurückgibt, kein
  `RangeError`).
- Verschachtelte Tabellen: Löschen der inneren vs. der äußeren Tabelle, je als eigener
  Unit-Test.
- Ein-Schritt-Undo für Einfügen **und** Löschen (History-Gruppierung).

### 5.2 E2E-Tests (Playwright, echte Bedienung)
Neue Datei(en), z. B. `tests/e2e/table-insert-size.spec.ts` und
`tests/e2e/table-delete.spec.ts`:
1. Klick auf „Tabelle einfügen" → Dialog öffnet sich sichtbar, Fokus liegt auf dem ersten
   Zahlenfeld.
2. Zeilen=4, Spalten=3 in die Zahlenfelder eingeben, „Einfügen" → Tabelle mit genau 4
   sichtbaren Zeilen und 3 sichtbaren Spalten (Zählung über `.ProseMirror tr`/`td`).
3. Klick/Tap direkt auf eine 4×3-Rasterzelle → identisches Ergebnis wie Testfall 2, Dialog
   schließt sofort.
4. Dialog mit Standardwerten (3×3) direkt bestätigen → sinnvolle Standardgröße eingefügt.
5. Ungültige Eingabe (0, negativ, Text, leer, > 20) → Fehlermeldung sichtbar, keine Tabelle
   eingefügt.
6. Dialog öffnen, Escape → kein DOM-Element verändert, Editor-Fokus/Cursor unverändert; ebenso
   „Abbrechen" und Klick außerhalb.
7. 1×1- und 20×20-Tabelle je über den Dialog einfügen → korrekte Struktur, UI bleibt bei 20×20
   reaktionsfähig.
8. Undo/Redo direkt nach dem Einfügen → Tabelle verschwindet vollständig bzw. wird
   wiederhergestellt.
9. Toolbar-Button „Tabelle einfügen" per Tab fokussieren (kein Klick), Enter **und** separat
   Leertaste drücken → Dialog öffnet sich in beiden Fällen (deckt die in Abschnitt 0, Punkt 1
   verifizierte Lücke).
10. „Tabelle löschen": Cursor in einer beliebigen Zelle → Klick entfernt die komplette Tabelle
    inkl. Inhalt.
11. `CellSelection` über mehrere Zellen (Maus-Drag) → Klick entfernt die ganze Tabelle, nicht
    nur die markierten Zellen.
12. **Pflicht-Testfall NodeSelection:** Cursor ans Ende eines Absatzes vor einer Tabelle bzw.
    an den Anfang des Absatzes danach setzen, Backspace drücken, um die NodeSelection auf die
    Tabelle zu erzeugen → Button „Tabelle löschen" ist **aktiv**, Klick entfernt die Tabelle
    vollständig, **kein** stiller No-Op.
13. „Tabelle löschen" außerhalb jeder Tabelle → Button deaktiviert, kein Klick möglich.
14. Toolbar-Button „Tabelle löschen" per Tab fokussieren, Enter **und** Leertaste drücken →
    Tabelle wird in beiden Fällen gelöscht.
15. Undo/Redo direkt nach dem Löschen, auch über mehrere Zyklen.
16. Verschachtelte Tabelle: innere und äußere Tabelle je einzeln als Löschziel (beide
    Richtungen).
17. Selection-Sync-Regressionstest im Tabellenkontext unmittelbar vor dem Löschen (Grenzfall
    23).
18. Vollständiger Rundreisetest DOCX (Abschnitt 4.1/4.2) über echten `filechooser`-Upload und
    echten Download, inkl. Validierung über einen unabhängigen Parser.
19. Vollständiger Rundreisetest ODT ebenso.
20. Reale Fremddatei-Fixtures (Abschnitt 4.2, Punkt 7) importieren, löschen, Rundreise prüfen.
21. Touch-Grundfall auf „Mobile" (Pixel 7) und „Tablet" (iPad Mini): Dialog per Tap öffnen,
    Rasterzelle antippen bzw. Zahlenfelder befüllen und „Einfügen" antippen; „Tabelle löschen"
    antippen.
22. Große Tabelle (20×20) löschen → UI bleibt reaktionsfähig, Undo stellt die komplette Struktur
    korrekt wieder her.
23. Bild in gelöschter Tabelle → exportierte Datei enthält keine verwaisten Bilddateien/
    Relationship-Einträge.
24. Zusammenspiel mit „Zeile löschen"/„Spalte löschen" (bereits existierender Feature-Block):
    Löschen der letzten Zeile/Spalte entfernt bereits heute automatisch die ganze Tabelle über
    denselben `deleteEnclosingTable`-Pfad — ein Regressionstest bestätigt, dass beide Wege
    (automatisch über Zeile/Spalte, explizit über „Tabelle löschen") zum identischen Ergebnis
    führen.

### 5.3 Rundreise-Tests
Wie in Abschnitt 4 beschrieben, über echten `filechooser`-Upload und `page.waitForEvent(
'download')`, Roh-XML-Prüfung via `JSZip.loadAsync`, für **beide** Formate.

---

## 6. Definition of Done

Der Backlog-Status von `tabelle-einfuegen` (aktuell „teilweise") und `tabelle-loeschen`
(aktuell „fehlt") darf erst gemeinsam geändert werden, wenn:

1. Der Größenwahl-Dialog existiert, verdrahtet ist und über die Testfälle 1–9 aus Abschnitt
   5.2 nachgewiesen ist — die feste 2×2-Direkteinfügung ist vollständig ersetzt.
2. Beide Eingabewege (Zahlenfelder, Raster) funktionieren gleichwertig und schreiben in
   denselben Zustand (Abschnitt 2.2), mit den begründeten Grenzen 1×1 bis 20×20 und
   Standardwert 3×3 (Abschnitt 2.3).
3. Der Button „Tabelle löschen" existiert, ist per Klick, Leertaste und Enter auslösbar und
   ruft die **exportierte** `deleteEnclosingTable()` auf.
4. Der NodeSelection-auf-Tabelle-Pflichtfall (Abschnitt 2.9, Grenzfall 11, Testfall 12) korrekt
   behandelt ist: Button aktiv, Klick wirksam, kein `RangeError`, kein stiller No-Op — dies ist
   der zentrale, nicht verhandelbare Abnahmepunkt dieser Spezifikation.
5. Die Enter-Tastatur-Lücke am (umgebauten) Einfüge-Button (Abschnitt 0, Punkt 1) tatsächlich
   behoben ist, nicht nur erneut dokumentiert (Testfall 9).
6. Undo/Redo für Einfügen **und** Löschen als je genau ein Schritt funktioniert, auch über
   mehrere Zyklen und in gemischten Sequenzen.
7. Verschachtelte Tabellen (Einfügen mit Cursor in Zelle; Löschen innen/außen) korrekt und
   getestet sind.
8. Alle Grenzfälle aus Abschnitt 3 einzeln geprüft und ihr tatsächliches Verhalten dokumentiert
   ist.
9. Die Rundreise-Anforderungen aus Abschnitt 4 für DOCX **und** ODT, inklusive der realen
   Fixture-Dateien, über einen unabhängigen Parser nachgewiesen sind.
10. Mobile-/Tablet-Bedienbarkeit (Größenwahl-Dialog **und** Löschen-Button) auf beiden
    Touch-Projekten nachgewiesen ist, nicht nur auf Desktop Chrome.
11. Das Zusammenspiel mit dem bereits bestehenden „letzte Zeile/Spalte entfernt Tabelle"-
    Verhalten (Abschnitt 2.10, Testfall 24) bestätigt konsistent ist.
12. Kein während der Verifikation gefundener Fehler ohne Vermerk zurückbleibt.

Andernfalls verbleibt der Status bei „teilweise"/„fehlt" bzw. wird explizit mit den konkret
fehlenden Teilpunkten nachgetragen — ein „vorhanden"/„verifiziert" darf nie auf einer
ungeprüften Annahme beruhen.

---

## 7. UX-Invarianten-Durchgang (`specs/UX-INVARIANTEN.md` §1 — Punkt für Punkt)

1. **View-Sync:** Einfügen (über beide Wege) muss die Ansicht zur neu eingefügten Tabelle
   führen (`scrollIntoView`, analog zum etablierten `run`/`runTable`-Muster); Löschen muss die
   Ansicht zur neuen Cursor-Position nach dem Entfernen führen. **Anforderung konkret in
   Abschnitt 2.5/2.11, Nachweis bei Umsetzung erforderlich.**
2. **Zustands-Feedback:** Die neue/fehlende Tabellenstruktur ist selbst die sichtbare
   Bestätigung, kein zusätzlicher Erfolgsdialog nötig. Ungültige Zahlenfeld-Eingabe zeigt eine
   sichtbare, per Screenreader angekündigte Fehlermeldung (`role="alert"`, Abschnitt 2.4) statt
   eines stillen Fehlschlags. Kein Bestätigungsdialog vor dem Löschen (bewusste Entscheidung,
   Abschnitt 1, #8) — Undo ist das Sicherheitsnetz. **Erfüllt / wie beschrieben umzusetzen.**
3. **Fokus/Tastatur:** Beide betroffenen Buttons müssen per Tab erreichbar sein und sich per
   Enter **und** Leertaste auslösen lassen (Abschnitt 2.15) — **konkrete, verifizierte Lücke am
   bestehenden Einfüge-Button** (Abschnitt 0, Punkt 1), hier verbindlich zu schließen, nicht
   nur zu dokumentieren. Der Dialog selbst fängt den Fokus (Fokus-Falle), Escape schließt,
   Fokus kehrt beim Schließen zum Editor zurück (Abschnitt 2.1) — eine **Lücke gegenüber dem
   einzigen bisherigen Modal-Muster** (`PrivacyModal.tsx` hat all das nicht, Abschnitt 0,
   Punkt 9), hier als Pflichtanforderung ergänzt, nicht stillschweigend übernommen. Das
   Rastergitter selbst ist bewusst **nicht** eigenständig tastaturbedienbar — begründet in
   Abschnitt 2.2, da die Zahlenfelder den vollständigen, gleichwertigen Tastaturweg
   garantieren.
4. **Responsiveness:** Dialog und beide Buttons müssen auf 320–768 px sichtbar/erreichbar
   sein, Tap-Ziele ≥ 40 px (Rasterzellen eingeschlossen, Abschnitt 1, #11), kein horizontaler
   Layout-Overflow. Getestet auf Mobile-/Tablet-Playwright-Projekten. **Anforderung konkret,
   Nachweis bei Umsetzung erforderlich.**
5. **Persistenz (für Salamanido invertiert):** Weder die Dialog-Eingabe noch die
   Tabellenstruktur werden in `localStorage`/`IndexedDB` persistiert; alles lebt ausschließlich
   im In-Memory-Dokumentmodell. Ein Reload verwirft jede Zwischenänderung, sofern nicht zuvor
   exportiert — bewusst so (Datenschutz-Kernprinzip), kein Fehlverhalten. **Erfüllt durch
   Bauart.**
6. **Konsistenz:** Deutsche Beschriftungen („Tabelle einfügen", „Zeilen", „Spalten",
   „Einfügen", „Abbrechen", „Tabelle löschen"), keine Mischsprache; Hell-/Dunkelmodus für
   Dialog **und** neuen Button konsistent mit dem bestehenden `TableOpButton`-Stil und dem
   `.selectedCell`-Overlay; einheitliche SVG-Icon-Sprache (kein Emoji/Unicode) für „Tabelle
   löschen", optisch klar von den bestehenden Zeilen-/Spalten-Löschen-Icons unterscheidbar.
   **Anforderung konkret, Nachweis bei Umsetzung erforderlich.**

---

## 8. Journey-Durchgang (`specs/UX-INVARIANTEN.md` §2)

1. **Nutzer:in will eine kleine 2-Spalten-Liste als Tabelle anlegen.** Klick auf „Tabelle
   einfügen" → Dialog öffnet sich, Nutzer:in zieht die Maus über das Raster bis „5 × 2"
   angezeigt wird, klickt → Tabelle erscheint sofort mit genau dieser Größe, Cursor steht in
   der ersten Zelle, bereit zum Tippen → Abschnitt 2.2/2.5/2.6.
2. **Nutzer:in braucht eine größere Datentabelle (12 Spalten), die über das sichtbare Raster
   hinausgeht.** Erwartung: Die Zahlenfelder erlauben trotzdem die Eingabe von 12, auch wenn
   das Raster selbst nur 10 Spalten zeigt — kein Gefühl, „nicht weiterzukommen" → Abschnitt
   2.2/2.3.
3. **Nutzer:in fügt aus Versehen eine falsche Größe ein → drückt sofort Strg+Z.** Erwartung:
   Die komplette Tabelle verschwindet wieder, der Dialog muss nicht erneut geöffnet werden, um
   es zu korrigieren → Abschnitt 2.7.
4. **Nutzer:in hat eine Tabelle mitten im Fließtext, die nicht mehr gebraucht wird.** Cursor
   in eine beliebige Zelle setzen, „Tabelle löschen" klicken → die ganze Tabelle verschwindet
   sofort, Text davor und danach bleibt exakt erhalten, Cursor landet direkt danach, sofort
   weiter tippbar → Abschnitt 2.8/2.11.
5. **Nutzer:in steht mit dem Cursor direkt nach einer Tabelle und drückt aus Gewohnheit
   Backspace, um sie zu entfernen (wie man es von anderen Editoren kennt).** Der Browser
   markiert dabei die ganze Tabelle als Objekt, statt sie sofort zu löschen. Erwartung: Der
   Button „Tabelle löschen" ist in genau diesem Moment **sichtbar aktiv** (nicht ausgegraut),
   ein Klick entfernt die Tabelle zuverlässig — kein Button, der in genau dem Moment, in dem
   er gebraucht wird, scheinbar nicht verfügbar ist → Abschnitt 2.9, der wichtigste Einzelfall
   dieser Spezifikation.
6. **Nutzer:in bedient den Editor ausschließlich per Tastatur.** Tab zu „Tabelle einfügen",
   Enter → Dialog öffnet sich, Tab zu den Zahlenfeldern, Werte eintippen, Enter → Tabelle wird
   eingefügt. Später: Tab zu „Tabelle löschen", Enter → Tabelle verschwindet. Erwartung: Beide
   Aktionen funktionieren zuverlässig ohne jede Maus, genau wie bei Mausklick — **kein**
   Restrisiko, wie es am unveränderten Ist-Zustand des bisherigen Buttons bestand → Abschnitt
   2.15, als verbindlicher Bauauftrag festgehalten.
7. **Nutzer:in arbeitet am Smartphone unterwegs und will schnell eine 3×3-Tabelle einfügen.**
   Antippen von „Tabelle einfügen" öffnet den Dialog groß und bedienbar; Antippen der
   passenden Rasterzelle fügt sofort ein, ohne dass eine Bildschirmtastatur eingeblendet werden
   muss → Abschnitt 2.14.
8. **Nutzer:in importiert ein reales Word-Dokument mit einer komplexen, verschachtelten
   Tabelle und will nur die innere Tabelle entfernen, ohne die äußere zu beschädigen.** Cursor
   in eine Zelle der inneren Tabelle setzen, „Tabelle löschen" klicken → nur die innere
   Tabelle verschwindet, die äußere bleibt mit allen übrigen Zellen intakt → Abschnitt 2.13.
9. **Nutzer:in exportiert nach dem Einfügen einer neuen Tabelle und öffnet die Datei später
   erneut (bzw. lädt sie erneut hoch).** Erwartung: Die Tabelle hat exakt die beim Einfügen
   gewählte Zeilen-/Spaltenzahl, kein Zellinhalt fehlt → Abschnitt 4.1, Rundreise-Pflicht.

---

Referenz: `specs/UX-INVARIANTEN.md` (verbindliche Methodik für jede `req.md`). Diese Datei
ersetzt inhaltlich `specs/tabelle-einfuegen-req.md` und `specs/tabelle-loeschen-req.md` als
konsolidierte Anforderungsgrundlage für „Tabelle erstellen/löschen"; die beiden
Ausgangsdateien bleiben als Code-Recherche-Referenz und Testfall-Fundus bestehen (insbesondere
die dort bereits verifizierten, hier übernommenen Fixture-Listen), ihr Freigabestatus richtet
sich ab sofort nach dieser Datei. Sie baut auf den bereits abgenommenen
`specs/tabelle-struktur-bearbeiten-req.md` und `specs/zellen-verbinden-req.md` auf, insbesondere
deren §9 „Umsetzungsstand", aus dem die wiederverwendbaren `TableOpButton`-/
`.selectedCell`-/`deleteEnclosingTable`-Bausteine stammen.

---

## 9. Umsetzungsstand (Dev, Stand 2026-07-09; Erstfassung 2026-07-05)

**Status: umgesetzt, QA-Nacharbeit vom 2026-07-09 eingearbeitet (Tap-Targets ≥40px,
vollständige §4.1/§4.2-Rundreisen inkl. Reimport, reale Fixtures, §5.2.22–24), lokal grün,
Re-QA ausstehend.**

### 9.1 Was gebaut wurde
- **`src/formats/shared/editor/TableSizeDialog.tsx` (neu):** barrierefreier Größenwahl-Dialog.
  Zwei gleichwertige Eingabewege in denselben Zustand (§2.2): zwei `aria-label`-benannte
  `type=number`-Felder „Zeilen"/„Spalten" (Grenzen 1–20, Default 3×3, `parseDim`-Validierung mit
  sichtbarer `role="alert"`-Meldung, §2.3/§2.4) **und** ein 6×7-Vorschauraster (jede Zelle ein
  40×40-px-Button mit `title="N × M"` — Tap-Target-Minimum §1.11/§2.14; §2.3 erlaubt explizit
  ein kleineres Vorschauraster als das 20×20-Maximum, und 40px-Zellen × 7 Spalten passen auch
  auf ein 412px-Phone-Viewport; Hover schreibt die Felder live, Klick/Tap fügt sofort ein). Modal
  komplett selbst gebaut (Styling-Anlehnung an `PrivacyModal.tsx`, Mechanik neu, §2.1): Fokus
  beim Öffnen aufs erste Feld, **Fokus-Falle** (Tab zykliert nur über die vier echten Tab-Stops;
  Rasterzellen sind `tabIndex=-1`, bewusst keine Tastatur-2D-Navigation §1.4), **Escape** und
  **Klick außerhalb** (Backdrop-`mousedown`) schließen ohne Einfügen. Fokusrückgabe an den Editor
  übernimmt der Aufrufer (`WordEditor`) via `view.focus()`.
- **`src/formats/shared/editor/commands.ts`:** `deleteEnclosingTable()` **exportiert** und die
  Entfern-Logik in den geteilten Helper `dispatchTableRemoval()` ausgelagert (identisches
  Verhalten für alle Löschwege). Neu: `canDeleteTable(state)` (= `isInTable` **oder**
  `NodeSelection` auf einem `table`-Knoten, §2.9) und `deleteTableAtSelection()` (eigener
  Codepfad für die Tabellen-`NodeSelection`, der die Position direkt aus `sel.from`/`sel.node`
  nimmt und `selectedRect`/`selectionCell` — die dort eine `RangeError` würfen — **umgeht**;
  sonst Delegation an `deleteEnclosingTable`).
- **`src/formats/shared/editor/Toolbar.tsx`:** Der Button „⊞ Tabelle" öffnet jetzt den Dialog
  (statt fest 2×2) und ist auf das `onMouseDown`+`preventDefault` **plus** `onClick`-Muster
  migriert → **Enter- und Leertaste-Lücke geschlossen** (§0.1/§2.15). Neuer `TableOpButton`
  „Tabelle löschen" (`isEnabled={canDeleteTable}`, Kommando `deleteTableAtSelection()`, eigenes
  SVG-Icon `IconTableDelete` = Tabelle mit ganzflächigem X, klar von Zeilen-/Spalten-Löschen
  unterscheidbar).
- **`src/formats/shared/editor/WordEditor.tsx`:** Dialog-State + Rendering; Öffnen über
  `onOpenTableDialog`; beim Bestätigen `insertTable(rows, cols)` an der (durch den Backdrop
  stabil gehaltenen) Editor-Selektion, danach `view.focus()`. Kein separates Selektions-Sichern
  nötig, weil der Vollflächen-Backdrop Editor-Klicks während der Dialog-Lebensdauer abfängt
  (§2.1, deckt Grenzfall 7).

### 9.2 Testabdeckung
- **Unit (`__tests__/table-delete.test.ts`, 13 Tests):** `deleteEnclosingTable` (Cursor in Zelle,
  einzige-Tabelle→Ersatzabsatz, false außerhalb); `canDeleteTable` (Zelle/NodeSelection/außerhalb);
  **`deleteTableAtSelection` im NodeSelection-Fall — kein `RangeError`, kein `false`, Tabelle weg**
  (der §2.9-Pflichtnachweis); verschachtelt (innen vs. außen); Ein-Schritt-Undo/Redo. Einfüge-
  Größen sind über `insertTable` bereits in bestehenden Tests abgedeckt.
- **E2E (`table-insert-size.spec.ts` + `table-delete.spec.ts`, je auf Desktop Chrome / Mobile /
  Tablet):** Dialog öffnet + Fokus; Zahlenfeld-Einfügen 4×3; Raster-Klick 4×3; Default 3×3;
  1×1 und 20×20; Validierung (0/21/leer → Fehler, nichts eingefügt); Escape/Abbrechen/Klick-außen;
  Undo/Redo; **Enter UND Leertaste** am Einfüge-Button; **Tap-Target-Test** (§1.11/§2.14: alle
  Rasterzellen, Felder und Buttons des Dialogs ≥40px, Dialog passt horizontal ins Viewport).
  Rundreisen Einfügen (§4.1): DOCX **und** ODT 4×3 mit **unterschiedlichem Text in jeder der 12
  Zellen** → Roh-XML exakt 4 Zeilen × 12 Zellen **in Dokumentreihenfolge**, ODT zusätzlich exakt
  3 `table:table-column` → **Reimport** über die echte Upload-UI → Struktur und Zellinhalte an
  denselben Positionen; Raster-Weg exportiert identisch (§4.1.2); 1×1 (DOCX) und 20×20 (ODT)
  Export **und** Reimport strukturidentisch (§4.1.4).
  Löschen: deaktiviert außerhalb/aktiv in Zelle; ganze Tabelle aus Zelle;
  CellSelection (Teilbereich **und** alle Zellen); Enter UND Leertaste; Undo/Redo mit
  Inhaltswiederherstellung; verschachtelt (innere weg, äußere bleibt); Selection-Sync.
  Rundreisen Löschen (§4.2): DOCX+ODT Grundfall inkl. **Reimport** (nur die zwei Absätze übrig);
  Tabelle **mit Inhalt** (Text, fettes Wort, Bild über den echten Upload, Aufzählungsliste)
  löschen → kein Tabellen-/Zellinhalt im XML, **keine verwaisten `word/media/`-Dateien,
  `document.xml.rels`-Einträge bzw. `Pictures/`-Dateien/Manifest-Einträge** (§4.2.3/§5.2.23);
  **zwei Tabellen, eine löschen** → die andere übersteht Export+Reimport vollständig (§4.2.5);
  **reale Fremddateien** `bug57031.docx`, `BigTable.odt`, `subTables.odt` (verschachtelt),
  `tableCoveredContent.odt` (covered cells): alle Tabellen über den echten Button löschen →
  Export ohne Tabellen-Markup, Reimport behält den übrigen Inhalt (§4.2.7/§5.2.20); doppelte
  native Rundreise (§4.2.8, angepasst — siehe 9.3); **20×20 löschen**: UI reaktionsfähig, Undo
  stellt 20×20 samt Zellinhalt wieder her (§5.2.22); **gemischte Formatierung**: Löschen lässt
  Formatierung außerhalb unangetastet, Undo stellt `em` in der Zelle wieder her (Abnahmemaßstab
  §4); Regression §2.10/§5.2.24: „letzte Zeile löschen", „letzte Spalte löschen" und der
  explizite Button enden im identischen Dokumentzustand (DoD 11).

### 9.3 Ehrliche Befunde / Abweichungen
- **§2.9 Tabellen-`NodeSelection` ist über die UI in diesem Editor NICHT erreichbar — und zwar
  by design von `prosemirror-tables`:** `tableEditing()` läuft mit dem Default
  `allowTableNodeSelection: false`; seine Selektions-Normalisierung (`normalizeSelection` im
  `appendTransaction`-Hook) wandelt **jede** entstehende Ganz-Tabellen-`NodeSelection` sofort in
  eine die ganze Tabelle überspannende `CellSelection` um. Empirisch bestätigt (temporäre
  View-Sonde): die Tabelle bekommt nie `.ProseMirror-selectednode`; Backspace/Delete an der
  Tabellengrenze mergen bzw. setzen den Cursor in eine Zelle. Die vom PO angenommene
  „Backspace-nach-Tabelle → NodeSelection"-Journey (§8 Nr. 5) tritt hier also faktisch nicht ein.
  **Konsequenz:** Der `NodeSelection`-Zweig von `canDeleteTable`/`deleteTableAtSelection` bleibt
  als **defensiver Safeguard** bestehen (verhindert den `RangeError` aus
  `selectedRect`/`selectionCell`, falls der Zustand je programmatisch oder durch künftige
  Bibliotheks-Änderungen entsteht) und ist **per Unit-Test direkt und vollständig abgedeckt**
  (dort wird die `NodeSelection` programmatisch konstruiert, was die Normalisierung umgeht);
  ein E2E-Reproduktionsversuch über die Tastatur wurde bewusst durch den erreichbaren „ganze
  Tabelle per CellSelection über alle Zellen"-Test (§2.8) ersetzt, statt einen nicht
  eintretenden Zustand vorzutäuschen.
- **§4.2.8 Cross-Format-Rundreise ist so nicht bedienbar:** Die App hat keinen
  Cross-Format-Export — der eine „Exportieren"-Button exportiert stets im geöffneten Format
  (dieselbe App-Grenze wurde bereits bei `specs/ausschneiden-qa.md` §4.4 festgestellt und in
  `tests/e2e/cut.spec.ts` dokumentiert). Angepasst auf das real Bedienbare: **doppelte native
  Rundreise** (Export → Reimport → erneuter Export → erneuter Reimport), die nachweist, dass
  die gelöschte Tabelle über zwei volle Konvertierungszyklen abwesend bleibt und der übrige
  Inhalt erhalten bleibt. Ein echter Cross-Format-Test wird nachgezogen, sobald ein
  Format-Konvertierungs-Feature existiert.
- **Während der QA-Nacharbeit gefundener und behobener Grundlagen-Bug (Paginierung):** Die
  Fixture-Rundreisen (§4.2.7) scheiterten zunächst an „element is not stable" — mehrseitige
  Dokumente (z. B. `BigTable.odt`) **sprangen dauerhaft** (~2 Hz, Seitenhöhe flip-floppte um
  `PAGE_GAP_PX`). Ursache in `pagination.ts`: `measureAndBuildDecorations` maß
  `view.dom.children` und damit **die eigenen Seiten-Spacer-Widgets mit** (Höhen verfälscht,
  Indizes verschoben) — jede Messung ergab andere Umbrüche als die vorige, Endlos-Schleife.
  Fix: Messung je Top-Level-Dokumentknoten über `view.nodeDOM` (Widgets werden nie
  mitgemessen), eine Messrunde konvergiert. Dieser Bug betraf reale mehrseitige Dokumente in
  Produktion (zappelnde Darstellung, instabile Klickziele) und ist mit den
  Fixture-E2E-Tests jetzt dauerhaft abgesichert.
- **Nicht-numerische/negative Eingabe** wird bereits vom `type=number`-Feld browserseitig an der
  *Eingabe* gehindert, erreicht die App-Validierung also gar nicht; E2E prüft daher die real
  erreichbaren Ungültig-Fälle (0, >20, leer). Die `parseDim`-Abwehr gegen nicht-numerischen Text
  bleibt defensiv vorhanden.
- **Interaktion mit Vorgänger-Features:** Da „⊞ Tabelle" nicht mehr direkt einfügt, wurden alle
  bestehenden Tests, die das als Fixture nutzten (cut/clipboard/clipboard-paste/bild-groesse/
  document-display/selection-regression/table-structure/table-merge-split), auf den gemeinsamen
  Helper `tests/e2e/fixtures/table-helpers.ts` (`insertTableViaDialog`, Default 2×2) umgestellt —
  Verhalten unverändert.
- Kein separater Löschen-Bestätigungsdialog (bewusst, §1 #8; Undo ist das Sicherheitsnetz).
