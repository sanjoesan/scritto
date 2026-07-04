# Umsetzungsplan (Code-Ebene): Feature „Kopieren“

Bezug: `E:\docs\specs\kopieren-req.md` (Anforderung, neueste Fassung — selbst ein
„erneuter, kritischer Verifikationsdurchlauf"), `E:\docs\specs\kopieren-qa.md`
(Testplan), `E:\docs\FEATURE-SPEC-DOCX-ODT.md` (Referenzkonventionen). Code-Stand
gegen die Arbeitskopie in `E:\docs` geprüft (Dateien einzeln gelesen, `grep`/`find`
über `src/`, `tests/`, `playwright.config.ts` und die installierten
`prosemirror-*`-Pakete).

## Rolle & Status dieses Dokuments — WICHTIG

**Dieses Dokument wurde vollständig überarbeitet.** Die vorherige Fassung war ein
*Greenfield-Plan* („diese Datei neu anlegen", „jene Funktion neu schreiben") aus einer
Zeit, in der es noch keinen Kopier-Code gab. **Dieser Zustand ist überholt:** Feature
„Kopieren" ist **im Code bereits vollständig umgesetzt** — inklusive Tests,
Browsermatrix und Datei-Rundreise. Damit ist der Charakter dieses Dokuments jetzt
identisch mit dem der Anforderung: ein **Audit des tatsächlich vorhandenen Codes**, nicht
eine Bauanleitung für etwas Nichtexistentes.

Konkret war die alte Fassung an mehreren Stellen **sachlich falsch geworden** und wurde
korrigiert (Details in Abschnitt 1):

- Sie verlangte, `clipboard.ts`, `clipboard.test.ts`, `clipboard.spec.ts`,
  `clipboard-roundtrip.spec.ts`, `clipboard-privacy.test.ts` **neu anzulegen** — alle
  **existieren bereits**.
- Ihr vorgeschlagener `clipboardTextSerializer`-Quelltext war **schlechter als der
  real umgesetzte**: er behandelte den `CellSelection.content()`-Fall (nackter Lauf von
  `table_row`-Knoten ohne umschließendes `table`) **nicht** und hätte eine Zellbereichs-
  Kopie als `A1\nB1` statt `A1\tB1` serialisiert. Der echte Code (`clipboard.ts:29–46`)
  löst genau das.
- Sie behauptete „**Kein SVG-Icon im gesamten Projekt** … alle Toolbar-Symbole sind
  Unicode/Emoji". **Falsch:** `Toolbar.tsx:33–53` enthält heute ein echtes Inline-`<svg>`
  (`ScissorsIcon`) für den Ausschneiden-Button.
- Sie behauptete „`Toolbar.tsx` — **keine Änderung**". **Falsch:** die Toolbar hat
  inzwischen einen „Ausschneiden"-Button samt Fehler-Alert bekommen (Feature
  `ausschneiden`, nicht `kopieren` — aber die pauschale Aussage stimmt nicht mehr).
- Ihre Zeilennummern (`DocumentWorkspace.handleExport` „17–29", diverse `writer.ts`-
  Zeilen) und ihre `kopieren-req.md`-Zeilenverweise sind durch spätere Umbauten
  **verrutscht** und wurden neu verankert.

**Fazit vorab:** Kopieren ist **funktional vollständig und — soweit auditierbar —
korrekt umgesetzt**. Es gibt **keinen** offenen Produktions-Codefehler im Copy-Pfad. Der
verbleibende Handlungsbedarf ist ehrlich klein und liegt in **Testabdeckung,
Doku-/Verweis-Drift und einem Cross-Feature-Blocker außerhalb der Eigentümerschaft
„Kopieren"** — konkret und priorisiert in Abschnitt 5. Dieses Dokument erfindet keine
Arbeit, wo der Code bereits konform ist (Datenschutz-/Verify-Prinzip der Anforderung).

---

## 0. Verifizierter Ist-Zustand (dateigenaue Bestandsaufnahme)

Alles unten wurde am echten Code gelesen, nicht aus der alten Fassung übernommen.

### 0.1 Vorhandene Copy-spezifische Bausteine (existieren, geprüft korrekt)

| Baustein | Datei / Zeilen | Status |
|---|---|---|
| `hard_break.leafText = () => '\n'` | `src/formats/shared/schema.ts:51` (im Node `hard_break`, Z. 42–56) | vorhanden, korrekt — Root-Cause-Fix für „Befund A" (0.2) ist **eingebaut** |
| `clipboardTextSerializer` (Klartext-Serialisierung) | `src/formats/shared/editor/clipboard.ts` (ganze Datei, 1–99) | vorhanden, **korrekter als der alte Plan** (behandelt `table_row`-Lauf) |
| Serializer als `EditorView`-Prop verdrahtet | `src/formats/shared/editor/WordEditor.tsx:116` (`clipboardTextSerializer,`) | vorhanden, korrekt |
| Keymap-Kommentar „Mod-c/-x/-v bewusst nicht gebunden" | `WordEditor.tsx:78–84` | vorhanden |
| `insertHardBreak()` + `Shift-Enter`-Bindung | `commands.ts:83–90`; `WordEditor.tsx:89` | vorhanden (Testbarkeits-Ergänzung, Entscheidung 2.4) |
| Unit-Test Serializer | `src/formats/shared/editor/__tests__/clipboard.test.ts` (1–104) | vorhanden, grün-fähig; **eine Lücke**, s. 5.1 |
| Datenschutz-Scan | `src/formats/shared/editor/__tests__/clipboard-privacy.test.ts` (1–49) | vorhanden; Scope-Hinweis s. 5.4 |
| Cross-Format-Text-Parität (Datenmodell) | `src/formats/shared/__tests__/cross-format-clipboard-content.test.ts` (1–52) | vorhanden, korrekt |
| E2E Kopieren | `tests/e2e/clipboard.spec.ts` (1–642) | vorhanden; WebKit-Realität s. 5.2 |
| E2E Datei-Rundreise | `tests/e2e/clipboard-roundtrip.spec.ts` (1–292) | vorhanden; R-3/4/5 korrekt `test.fixme` |
| Selection-Sync-Kopier-Variante | `tests/e2e/selection-regression.spec.ts:84–110` | vorhanden, korrekt |
| Browsermatrix Safari+Firefox (gescoped) | `playwright.config.ts:37–53` | vorhanden |

### 0.2 Die zwei „Befunde" der alten Fassung sind **behobene** Root-Cause-Fixes (kein offener Bug mehr)

Beide sind jetzt Regressions-Absicherungen, nicht mehr To-dos:

- **Befund A (`hard_break` → leerer String statt `\n` in `text/plain`).** Ursache war das
  fehlende `leafText` an einem Leaf-Inline-Node (`Fragment.textBetween` liefert für einen
  Leaf ohne `leafText` `""`). **Behoben** in `schema.ts:51`. Der Fix wirkt nicht nur auf
  die Zwischenablage, sondern auf jede ProseMirror-Textextraktion (`Node.textContent`,
  `textBetween`). Regressionstest: `clipboard.test.ts:99–103` (`spec.leafText` definiert,
  liefert `'\n'`) und `clipboard.test.ts:77–85` (voller Absatz `"Zeile1\nZeile2"`).
- **Befund B (Tabellen/Listen im Klartext nicht von Absatzketten unterscheidbar).**
  Ursache war ProseMirrors Default `slice.content.textBetween(0, size, "\n\n")`.
  **Behoben** durch den eigenen `clipboardTextSerializer`. Regressionstests
  `clipboard.test.ts:24–59` (Tabelle `A1\tB1\nA2\tB2`, Bullet-/nummerierte Liste).

### 0.3 Der echte `clipboardTextSerializer` ist besser als der alte Plan (nicht schlechter)

`clipboard.ts:18–46` behandelt einen Sonderfall, den der alte Plan übersah:
`prosemirror-tables`' `CellSelection.content()` liefert eine `Slice`, deren
Top-Level-Fragment ein **nackter Lauf von `table_row`-Knoten** ist (nicht in ein `table`
gehüllt — die Hülle bleibt bewusst „offen", damit die Paste-Logik sie gegen den Zielkontext
neu schließen kann). Der alte Plan-Code hätte jede solche Zeile durch den generischen
`default`-Zweig (`node.textBetween(…, '\n')`) geschickt und eine 2×2-Zellauswahl zu
`"A1\nB1\n\nA2\nB2"` gemacht — ununterscheidbar von zwei getippten Zeilen. Der echte Code
sammelt aufeinanderfolgende `table_row`-Knoten (`rowRun`/`flushRowRun`) und serialisiert
sie tab-/zeilengetrennt (`A1\tB1\nA2\tB2`). Verifiziert durch das E2E-`<textarea>` T-14a
(`clipboard.spec.ts:409–446`). **Genau diese Verzweigung ist aber unit-technisch
ungetestet** — das ist Finding 5.1.

### 0.4 Cross-Feature-Blocker (weiter gültig, außerhalb Eigentümerschaft „Kopieren")

**Datei:** `src/app/DocumentWorkspace.tsx`, Funktion `handleExport` (**jetzt Zeilen
68–95**, nicht mehr „17–29"). Der Kern ist unverändert:

```ts
const blob = forcedError !== null
  ? await Promise.reject<Blob>(new Error(forcedError))
  : await module.exportFile(snapshot.content, snapshot.fileName)   // Z. 79–81
```

`module` ist beim Öffnen/Erstellen fest an das Ursprungsformat gebunden — `src/App.tsx:22`
löst `activeModule = findModuleById(active.moduleId)` einmalig auf, und es gibt **keine**
UI, um „Exportieren als …" mit einem anderen Zielformat auszulösen. Der Datenmodell-Layer
wäre bereit (`docxModule`/`odtModule` konsumieren beide dieselbe `WordDocumentContent`,
`registry.ts:6,48–50`), es fehlt nur die UI-Verdrahtung.

**Warum das „Kopieren" betrifft:** `kopieren-req.md` Abschnitt 4, Testfälle 4/5 verlangen
DOCX→ODT bzw. ODT→DOCX über Kopieren/Einfügen. Ohne Format-Wahl **nicht durchführbar**.
Gehört zu `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 1.3, **nicht** zu „Kopieren". Korrekt als
`test.fixme` geführt (`clipboard-roundtrip.spec.ts:134–147`, R-3/R-4/R-5), Verweis dort
zeigt bereits auf „kopieren-code.md Abschnitt 0.4/9". **Kein Handlungsbedarf in diesem
Ticket**, nur Weitergabe (Abschnitt 6).

### 0.5 Bestätigte Rahmenbedingungen (kein Fix, nur Dokumentation)

- **`hard_break` erzeugbar über `Shift-Enter`** (`WordEditor.tsx:89`) — der früher fehlende
  In-App-Erzeugungsweg existiert. Reader/Writer beider Formate übersetzen `hard_break`
  korrekt: DOCX `reader.ts:178,284–285` / `writer.ts:60–62` (`<w:br/>`); ODT
  `reader.ts:150–151` / `writer.ts:74` (`<text:line-break/>`). Datenmodell-Rundreise
  abgesichert: `docx/__tests__/roundtrip.test.ts:119–132`, `odt/__tests__/roundtrip.test.ts:121–132`.
- **Tab-Zeichen (`\t`) haben weiter kein Schema-Äquivalent und keinen Tastatur-
  Erzeugungsweg** (Tab wechselt Fokus / Zellnavigation). Der zugehörige E2E-Rundreisefall
  ist deshalb korrekt als `test.fixme` mit Begründung geführt
  (`clipboard-roundtrip.spec.ts:247–250`). Datenmodell-Rundreise für `\t` bleibt separat in
  `docx/__tests__/roundtrip.test.ts` abgedeckt. N/A, nicht stiller blinder Fleck.
- **Kopf-/Fußzeile:** `WordEditor.tsx:71` rendert nur `doc.content.body`; `header`/`footer`
  existieren im Datenmodell, haben aber keine Editor-UI. Grenzfall 14 bleibt
  zurückgestellt, wie in der Anforderung selbst.
- **Bildgröße unbegrenzt:** `Toolbar.tsx:124–135` (`handleImagePick`) liest ohne
  Größenlimit. Kein Copy-Bug; relevant nur als Ursachenhinweis für Grenzfall 7 (das E2E
  `clipboard.spec.ts:573–614` misst genau das mit hartem Zeitbudget-Assert < 5 s).

---

## 1. Korrekturen an der alten Fassung (Nachweis der Sachfehler)

Zur Nachvollziehbarkeit, was gegenüber der Vorversion geändert wurde und warum:

| Alte Behauptung | Realität im Code | Beleg |
|---|---|---|
| „`clipboard.ts` — **neu anlegen**" | existiert | `clipboard.ts` (99 Z.) |
| Plan-Serializer ohne `table_row`-Lauf-Behandlung | echter Code behandelt ihn | `clipboard.ts:29–46` |
| „Kein SVG-Icon im gesamten Projekt" | Inline-`<svg>` vorhanden | `Toolbar.tsx:33–53` (`ScissorsIcon`) |
| „`Toolbar.tsx` — keine Änderung" | Ausschneiden-Button + Alert ergänzt | `Toolbar.tsx:143–161` |
| „`WordEditor` Keymap: nur Shift-Enter neu" | zusätzlich `Shift-Delete: cutSelection` | `WordEditor.tsx:98` |
| „`handleExport` Zeilen 17–29" | Zeilen 68–95 | `DocumentWorkspace.tsx` |
| „`playwright.config` nur 3 Projekte" | 5 Projekte, Chrome/Mobile mit `permissions` | `playwright.config.ts:34–53` |
| Verweise „`kopieren-req.md` Zeile 71" | Zeilen verrutscht (s. 5.5) | req.md akt. |

Wichtig: Das Feature `ausschneiden` (Scheren-Button, `cutSelection`, `Shift-Delete`,
`cutError`) ist **nachträglich** neben Kopieren gelandet und teilt sich mit Kopieren den
**Serialisierungspfad** (`prosemirror-view` bindet intern `handlers.copy =
editHandlers.cut`). Das ist für Kopieren nur insofern relevant, als jede Änderung an
`clipboard.ts`/`schema.ts` **beide** Features trifft — Regressionstests beider Suiten
(`clipboard.spec.ts`, `cut.spec.ts`) müssen nach solchen Änderungen grün bleiben.

---

## 2. Architekturentscheidungen (bestätigt, bindend)

Alle vier Entscheidungen der Anforderung sind im Code umgesetzt und bleiben bindend:

1. **Kein eigener `navigator.clipboard`-Zugriff** — nirgends. Statisch abgesichert
   (`clipboard-privacy.test.ts`). Bestätigt: `grep -rn "navigator.clipboard" src/` findet
   nur den Teststring selbst.
2. **Alles über das native `copy`-DOM-Event** plus explizit gesetzten
   `clipboardTextSerializer` (`WordEditor.tsx:116`). `text/html` liefert ProseMirrors
   Standard-`DOMSerializer` aus den Schema-`toDOM`-Regeln — kein eigener
   `clipboardSerializer`/`transformCopied` (bewusst, s. Abschnitt 8).
3. **Kein Toolbar-Button für Kopieren** (Entscheidung 8.1 der Anforderung, dort bereits
   festgeschrieben). `Toolbar.tsx` bleibt für *Kopieren* unverändert.
4. **Kopieren erzeugt keine Transaktion / keinen Undo-Eintrag** und verändert **nie**
   `view.state.selection` — beim reinen `copy`-Pfad strukturell durch `prosemirror-view`
   garantiert (Abschnitt 8), regressionsgesichert durch `clipboard.spec.ts:317–336` (Undo-
   Neutralität) und `selection-regression.spec.ts:88–110` (Selektion überlebt Kopieren).

---

## 3. ProseMirror-Schema/Commands — Ist-Stand & Bewertung

- **Schema** (`src/formats/shared/schema.ts`): einzige Copy-relevante Ergänzung ist
  `hard_break.leafText` (Z. 51) — vorhanden, korrekt. Keine weiteren Nodes/Marks nötig:
  Hoch-/Tiefstellung, Schriftart/-größe, Hyperlink sind laut Anforderung 2.2 explizit
  „sobald implementiert" und **nicht** im Schema (bestätigt: kein `sup`/`sub`/`fontFamily`/
  `fontSize`/`link`-Mark). Alle vorhandenen Marks/Nodes haben vollständige
  `toDOM`/`parseDOM`-Paare (Z. 157–196 Marks, Z. 13–155 Nodes) → korrektes `text/html`.
- **`unsupported_block`** (`schema.ts:92–113`) fällt im Serializer in den generischen
  `default`-Zweig (`clipboard.ts:60–65`) und extrahiert seinen rekonstruierbaren Textinhalt
  — akzeptables Verhalten, aber ungetestet (kleiner Hinweis in 5.3).
- **Commands** (`src/formats/shared/editor/commands.ts`): `insertHardBreak()`
  (Z. 83–90) vorhanden — Testbarkeits-Voraussetzung, kein Copy-Kern. Signatur konsistent
  mit `insertImage`/`insertTable`. `cutSelection()` (Z. 149–166) und `canCut()`
  (Z. 126–128) gehören zu `ausschneiden`, nicht hierher.
- **`clipboard.ts`** — der eigentliche Copy-Code. Ein Export (`clipboardTextSerializer`),
  keine `Command`-Signatur (Kopieren erzeugt keine Transaktion). Struktur:
  `rowRun`-Gruppierung (18–46) → `nodeToPlainText` (48–66) → `rowToPlainText` (68–72,
  flacht zellinterne `\n` bewusst zu Leerzeichen ab, damit die Tab-/Zeilenstruktur einer
  Tabelle nicht durch Zellumbrüche zerbricht) → `tableToPlainText` (74–78) →
  `listToPlainText` (80–99, verschachtelt mit Einrückung, `start`-Attribut beachtet).
- **Keymap** (`WordEditor.tsx:77–99`): `Mod-c`/`Mod-x`/`Mod-v` **nicht** gebunden (korrekt,
  Kommentar Z. 78–84). Neu ggü. altem Plan: `Shift-Enter` (Z. 89, hard_break) und
  `Shift-Delete` (Z. 98, cut). Keine dieser Bindungen kollidiert mit `Mod-c`.

**Kein neuer Schema-/Command-Code für Kopieren nötig.** Der Ist-Stand deckt die
Anforderung ab.

---

## 4. Toolbar & Import/Export (OOXML/ODF) — Ist-Stand & Bewertung

### 4.1 Toolbar (`src/formats/shared/editor/Toolbar.tsx`)
Für **Kopieren**: keine Änderung (Entscheidung 2.3). Vorhanden ist ein *Ausschneiden*-
Button (Z. 143–161) mit `ScissorsIcon`-SVG (Z. 33–53), `disabled={!canCut(view.state)}`
und sichtbarem `cutError`-Alert (Z. 157–161) — gehört zu `ausschneiden`. Falls die
Produktentscheidung je auf „Kopier-Button" gedreht würde, wäre der Weg: Button analog
`MarkButton`, `onMouseDown={(e)=>{e.preventDefault(); document.execCommand('copy')}}`
(kein `navigator.clipboard`), `disabled={view.state.selection.empty}`, ohne neues Emoji.
Reine Option, **nicht** Teil dieses Plans.

### 4.2 DOCX (`src/formats/docx/*`) und ODT (`src/formats/odt/*`)
**Keine copy-spezifische Änderung nötig.** Kopieren+Einfügen innerhalb derselben
Editor-Instanz produziert dieselbe Node-JSON wie Tippen; Reader/Writer können einen
eingefügten Absatz nicht von einem getippten unterscheiden. Merkmalsweise geprüft:

| Merkmal | DOCX | ODT | Bewertung |
|---|---|---|---|
| `hard_break` | `reader.ts:178,284–285`, `writer.ts:60–62` | `reader.ts:150–151`, `writer.ts:74` | vollständig |
| `colspan`/`rowspan` | Writer/Reader-Pfade vorhanden | analog (`table:number-columns-spanned` …) | vollständig |
| Bilder | `imageCollector.ts` verarbeitet jede `image`-Node mit `data:`-URL | analog | vollständig |
| Formatierungs-Marks | vorhandene Reader/Writer-Pfade | analog | vollständig |

Nachgewiesen (nicht durch neuen Code, sondern durch Tests): Datenmodell-Parität
`cross-format-clipboard-content.test.ts`; Datei-Rundreise R-1 (DOCX) / R-2 (ODT) /
R-7 (parametrisiert je Merkmal) in `clipboard-roundtrip.spec.ts`.

**Cross-Feature-Risiko (nur dokumentiert, hier nicht zu fixen):**
`docx/imageCollector.ts:20` (und die ODT-Entsprechung) wirft eine Exception, wenn
`image.src` keine `data:`-URL ist (`DATA_URL_PATTERN` Z. 8). Für reines *Kopieren*
irrelevant (jede `image`-Node entsteht über `insertImage()` mit `data:`-URL, Kopieren
dupliziert nur bestehende Nodes). Relevant erst, wenn `einfuegen` externe `<img
src="https://…">` einschleust → späterer Export könnte abstürzen. Übergabe an
`einfuegen` (Abschnitt 6).

### 4.3 `playwright.config.ts`
5 Projekte (Z. 27–54): `Desktop Chrome` + `Mobile` (Pixel 7) mit
`permissions:['clipboard-read','clipboard-write']` (Z. 34–35 — nötig, weil Chromiums
`execCommand`-Pfad unter manchen Headless-CI-Konfigurationen ohne Grant still no-opped),
`Tablet` (iPad Mini/WebKit, Touch), sowie die gescopten Clipboard-Zusatzprojekte
`Desktop Safari (Clipboard)` (Z. 43–46) und `Desktop Firefox (Clipboard)` (Z. 50–53),
beide via `testMatch: /clipboard.*\.spec\.ts/`. Entspricht Entscheidung 8.2 der
Anforderung. **Aber:** siehe Finding 5.2 zur realen WebKit-Abdeckung.

---

## 5. Konkrete Findings — was JETZT noch offen/verbesserbar ist (priorisiert)

Nach Substanz geordnet (Schwerstes/Wichtigstes zuerst). Nichts davon ist ein offener
Copy-Produktionsfehler; es sind Test-/Robustheits-/Doku-Lücken.

### 5.1 (Substanz, hoch) Unit-Lücke: der `table_row`-Lauf (`CellSelection.content()`) ist nicht unit-getestet
Die subtilste und wertvollste Verzweigung von `clipboard.ts` (`rowRun`/`flushRowRun`,
Z. 29–46) wird **nur** durch das E2E T-14a (`clipboard.spec.ts:409–446`) abgedeckt — und
das ist auf WebKit `test.skip` (5.2). `clipboard.test.ts` baut ausschließlich volle
`table`-Knoten (Z. 24–43), nie einen nackten Zeilen-Lauf auf Slice-Ebene. **Fix:** in
`clipboard.test.ts` zwei Fälle ergänzen (reine Node-Ebene, kein DOM):

```ts
it('serializes a bare run of table_row nodes (CellSelection.content shape) tab/newline-separated', () => {
  const cell = (t: string) => wordSchema.nodes.table_cell.create(null, paragraph(t))
  const row = (a: string, b: string) => wordSchema.nodes.table_row.create(null, [cell(a), cell(b)])
  const slice = new Slice(Fragment.from([row('A1', 'B1'), row('A2', 'B2')]), 1, 1)
  expect(clipboardTextSerializer(slice, fakeView)).toBe('A1\tB1\nA2\tB2')
})

it('flushes a row-run correctly when interleaved with a normal block', () => {
  const cell = (t: string) => wordSchema.nodes.table_cell.create(null, paragraph(t))
  const row = (a: string, b: string) => wordSchema.nodes.table_row.create(null, [cell(a), cell(b)])
  const slice = new Slice(Fragment.from([row('A1', 'B1'), paragraph('X'), row('A2', 'B2')]), 1, 1)
  expect(clipboardTextSerializer(slice, fakeView)).toBe('A1\tB1\n\nX\n\nA2\tB2')
})
```

Das schließt die einzige real ungetestete Kernverzweigung und macht sie
plattformunabhängig (kein WebKit-Skip).

### 5.2 (Substanz, hoch) `Desktop Safari (Clipboard)` deckt den Kern-Rundlauf faktisch NICHT ab
Nahezu jeder aussagekräftige Kopiertest ist `test.skip(browserName === 'webkit',
SKIP_WEBKIT_ROUNDTRIP)` (`clipboard.spec.ts:83`, angewandt in Testfall 1, 2, 2.2/2,
2.2/4, 3/2, Gegenprobe, Grenzfall 6/7/12, T-5, T-12, T-14a/b). Auf WebKit laufen real nur
die **paste-freien** Tests: Kontextmenü (Z. 130–142), Undo-Neutralität (317–336),
Fokus-Isolation (368–380). Der `Desktop Safari (Clipboard)`-Projektname suggeriert also
mehr Abdeckung, als tatsächlich ausgeführt wird. **Das ist ehrlich zu führen, nicht zu
kaschieren:**
- **Firefox** (`Desktop Firefox (Clipboard)`) ist von diesen Skips **nicht** betroffen
  (nur `webkit` wird übersprungen) → Firefox fährt den vollen Kopieren→Einfügen-Rundlauf.
  **Handlungspunkt:** beim Verifikationslauf explizit bestätigen, dass das
  Firefox-Clipboard-Projekt **grün** ist — es ist die einzige Nicht-Chromium-Engine, die
  den Paste-Rundlauf automatisiert prüft.
- **Echtes Apple Safari / echtes Firefox auf realer Hardware** bleibt — wie in
  `kopieren-req.md` Grenzfall 11 / DoD (d) vorgesehen — **manueller Abnahmepunkt**. Im
  Testbericht/README so festhalten, nicht als „durch WebKit-Projekt automatisiert
  erledigt" ausgeben.
- Optional (Robustheit): prüfen, ob mindestens **ein** minimaler WebKit-Rundlauf (reiner
  Text, ohne Formatierung) mit einem In-Page-Tastatur-Rundlauf **ohne** `grantPermissions`
  stabilisierbar ist; falls nicht reproduzierbar grün, bleibt der Skip mit dieser
  begründeten Notiz bestehen (keine Flakes einbauen).

### 5.3 (klein) Assertions schärfen / Randfälle ergänzen
- `clipboard.test.ts:32–43` (colspan/rowspan) prüft nur `toContain`. Exakt möglich und
  aussagekräftiger: `expect(serialize(table)).toBe('Verbunden\nNormal\tZwei')` — hält
  zugleich fest, dass `colspan` **keine** Spalten auffüllt (bewusst akzeptiert, da ein
  tab-/zeilengetrenntes Klartextraster keine Spannen ausdrücken kann).
- Ergänzen: `hard_break` **innerhalb** einer Tabellenzelle → wird durch
  `rowToPlainText`'s `.replace(/\n/g,' ')` (Z. 70) zu einem Leerzeichen. Ein kurzer
  Unit-Fall dokumentiert diese bewusste Entscheidung (Zelle „a⏎b" → `"a b"`, nicht `"a\nb"`,
  damit die Tabellenstruktur intakt bleibt).
- Optional: ein Serializer-Fall für `unsupported_block` (generischer Zweig) als
  Vollständigkeitsnachweis.

### 5.4 (klein) Datenschutz-Scan: Scope präzise benennen
`clipboard-privacy.test.ts:45` grept ausschließlich nach dem String
`navigator.clipboard`. Der Datenschutz-Punkt der Anforderung (Abschnitt 5, Grenzfall 15)
verbietet darüber hinaus **Logging/Telemetrie/`localStorage`/`IndexedDB` mit
Zwischenablageninhalt**. Der Scan deckt das nicht ab — **muss er auch nicht zwingend**, da
es projektweit **keinen** Capture-Pfad gibt (nichts, was geloggt werden könnte). Aber der
Kommentar/Testname sollte das ehrlich abgrenzen: „prüft `navigator.clipboard`-Nichtnutzung;
die weitergehende No-Logging-/No-Persistence-Garantie ruht auf dem Fehlen jedes
Capture-Pfads plus Code-Review, nicht auf diesem Scan." (Reine Klarstellung, kein
Funktionsfehler.)

### 5.5 (klein, aber breit gestreut) Verweis-Drift in Code-Kommentaren
Mehrere Quelltext-Kommentare zeigen auf `specs/kopieren-req.md Abschnitt 1, Zeile 71`
(`clipboard.ts:13`, sinngemäß auch `schema.ts`, `WordEditor.tsx`,
`clipboard-privacy.test.ts`). In der **aktuellen** `kopieren-req.md` steht das
`navigator.clipboard`-Nicht-Soll aber in der Tabelle Abschnitt 1, **Zeile 8** (um Z. 100),
nicht in Z. 71 (dort steht heute der README-Datenschutz-Bullet). **Fix:** Verweise auf den
**stabilen Anker** umstellen (`Abschnitt 1, Tabellenzeile 8 „Programmatischer Zugriff …
navigator.clipboard"`) statt auf eine driftende Zeilennummer. Betrifft nur Kommentare,
kein Verhalten.

### 5.6 (Doku) `kopieren-req.md`-Nachträge sind größtenteils bereits eingepflegt
Die drei „offenen Fragen" der Anforderung (Toolbar-Button, Safari/Firefox-Matrix,
partielle Zellauswahl) sind in `kopieren-req.md` Abschnitt 8 **bereits entschieden**
eingetragen; Abschnitt 0 der Anforderung bildet den Ist-Code ab. **Rest-Nachtrag:** die
präzisierte WebKit-Abdeckungsrealität aus Finding 5.2 (nicht „Safari automatisiert grün",
sondern „Firefox automatisiert grün + WebKit nur paste-freie Teilmenge + reale Hardware
manuell") sollte in `kopieren-req.md` Grenzfall 11 / Testplan-Zeile „Browsermatrix"
nachgeschärft werden, damit der Statuswechsel „verifiziert" nicht auf einer zu optimistisch
gelesenen Safari-Zeile beruht.

---

## 6. Übergabe an andere Backlog-Einträge (nicht Teil dieses Plans)

- **Cross-Format-Export-UI fehlt** (0.4): `DocumentWorkspace.tsx` bräuchte einen zweiten
  Pfad `handleExportAs(targetModuleId)` → `findModuleById(targetModuleId).exportFile(
  document.content, …)`. Gehört zu `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 1.3. Schaltet
  R-3/R-4/R-5 scharf.
- **Bild-Normalisierung beim Einfügen** (4.2): `einfuegen` muss extern eingefügte `<img>`
  ohne `data:`-URL normalisieren oder `ImageCollector.add()` kontrolliert degradieren
  lassen (Bild überspringen statt werfen), sonst kann ein späterer Export abstürzen.
- **Real-Hardware Safari/Firefox** (5.2): manueller Abnahmedurchlauf; Playwright-WebKit ist
  keine 1:1-Kopie von Apple Safari.

---

## 7. Datenschutz (Code + Review)
Konform: **kein** `navigator.clipboard`-Aufruf im Projekt (statisch abgesichert,
`clipboard-privacy.test.ts`), dieser Plan führt keinen ein. Zusätzlich manueller
Review-Punkt bei jedem PR, der `clipboard.ts`/`schema.ts` berührt: kein
`console.log`/`fetch`/Analytics mit Zwischenablageninhalt, kein `localStorage`/`IndexedDB`
mit Dokumentdaten (README-Prinzip). Scope-Präzisierung siehe 5.4.

---

## 8. Bereits korrekt durch Bibliotheksverhalten (kein Code, nur Regressionstest)
Verifiziert am installierten `prosemirror-view`/`-model`/`-tables`-Quelltext (nicht nur
Doku). Als **Verhaltensgarantien** formuliert statt an driftende Zeilennummern gepinnt:

| Verhalten | Beleg / Mechanismus | Für Anforderung |
|---|---|---|
| Leere Selektion → keine Aktion | `prosemirror-view` copy-Handler springt bei leerer Selektion früh raus | Grenzfall 1 (`clipboard.spec.ts:106–128`) |
| Kopieren erzeugt keinen Undo-Eintrag | `view.dispatch(...)` nur im `cut`-Zweig, nie bei reinem `copy` | Testfall 3/3 (`clipboard.spec.ts:317–336`) |
| Selektion bleibt nach Kopieren unverändert | kein `setSelection`/`dispatch` im Copy-Pfad | `selection-regression.spec.ts:88–110` |
| Kopieren = Ausschneiden minus Löschen, gleicher Serialisierungspfad | `handlers.copy = editHandlers.cut` (identische Funktion) | bestätigt Anforderung Z. 17 f. |
| Multi-MIME (`text/html` + `text/plain`) | `data.setData("text/html", …)` + `setData("text/plain", …)` im selben Handler | Abschnitt 2.1 (T-15, `clipboard.spec.ts:473–492`) |
| Kontextmenü nicht unterdrückt | repo-weit kein `contextmenu`-Handler / `preventDefault` außerhalb `Toolbar`/`useBeforeUnloadWarning` | Grenzfall 13 (`clipboard.spec.ts:130–142`) |
| `Mod-c`/`Mod-x` nicht belegt | `WordEditor.tsx:77–99` geprüft (nur Shift-Enter/Shift-Delete neu, kein Mod-c) | Abschnitt 3 |
| Zellauswahl → `<table>`-Struktur | `CellSelection.content()` + `tableNodes(...)`-`toDOM` mit `colspan`/`rowspan` | Testfall 3/2 (`clipboard.spec.ts:207–243`) |
| `text/html` für alle Marks/Nodes | vollständige `toDOM`-Regeln (`schema.ts`) via Standard-`DOMSerializer` | Abschnitt 2.2 (E2E 2.2/2, 2.2/4) |
| Fokus-Gating | Copy-Handler nur auf `view.dom` registriert | T-12 (`clipboard.spec.ts:536–571`) |

Ein zusätzlicher `handleDOMEvents.copy`/`transformCopied`/`clipboardSerializer` würde
bereits korrektes Verhalten nur duplizieren und Divergenz zwischen Bildschirmdarstellung
und Zwischenablage riskieren — bewusst **nicht** vorhanden.

---

## 9. Verifikations-Runbook (so wird „grün" belegt, nicht behauptet)

Die Anforderung verlangt (DoD), dass Tests **nachweislich** grün sind, nicht nur
existieren. Reihenfolge:

1. **Unit/Modell:** `npm run test` — muss `clipboard.test.ts`,
   `clipboard-privacy.test.ts`, `cross-format-clipboard-content.test.ts`,
   `docx|odt/__tests__/roundtrip.test.ts` (hard_break) grün zeigen. Nach 5.1/5.3 die neuen
   Fälle mitlaufen lassen.
2. **E2E Chromium:** `npm run test:e2e -- --project="Desktop Chrome"` — voller Rundlauf
   inkl. tiefer MIME-Prüfung (T-15) und `readText`-Prüfung (Abschnitt 6/6).
3. **E2E Firefox:** `--project="Desktop Firefox (Clipboard)"` — der **einzige**
   automatisierte Nicht-Chromium-Paste-Rundlauf. Muss grün sein (Finding 5.2).
4. **E2E WebKit/Safari:** `--project="Desktop Safari (Clipboard)"` — erwartet grün, aber
   bewusst nur die paste-freie Teilmenge; im Bericht als solche kennzeichnen.
5. **E2E Mobile/Tablet:** Touch-Rundlauf (Mobile/Chromium vollständig; Tablet/WebKit im
   Rahmen der dokumentierten Grenze).
6. **Rundreise:** `clipboard-roundtrip.spec.ts` R-1/R-2/R-6/R-7 grün; R-3/R-4/R-5 als
   `test.fixme` (blockiert, **nicht** „bestanden") führen.
7. **Manuell:** reale Safari-/Firefox-Hardware (Grenzfall 11), Datenschutz-Review (7).

**Definition of Done (Statuswechsel „vorhanden" → „verifiziert"):** erst wenn 1–6
nachweislich grün, die Cross-Format-Fälle sauber als blockiert geführt, der
Datenschutz-Scan grün und der Real-Hardware-Punkt erbracht **oder** als bewusst offene
Restaufgabe dokumentiert ist. Bis dahin bleibt „nicht vertrauenswürdig" korrekt.

---

## 10. Umsetzungsreihenfolge (nur noch Rest-/Härtungsarbeit)

Kern („Kopieren funktioniert") ist erledigt. Verbleibend, schwerstes zuerst:

1. **Finding 5.1** — Unit-Fälle für den `table_row`-Lauf in `clipboard.test.ts` (schließt
   die einzige real ungetestete Kernverzweigung; höchster Verifikationswert).
2. **Finding 5.2** — Firefox-Clipboard-Projekt nachweislich grün belegen; WebKit-
   Abdeckungsrealität ehrlich im Bericht/`kopieren-req.md` (5.6) festhalten; reale-Hardware
   als manuellen Punkt führen.
3. **Finding 5.3** — Assertions schärfen (colspan exakt, hard_break-in-Zelle,
   `unsupported_block`).
4. **Finding 5.5** — Verweis-Drift in Code-Kommentaren auf stabile Anker umstellen.
5. **Finding 5.4** — Datenschutz-Scan-Scope im Kommentar präzisieren.
6. Vollständiger Verifikationslauf nach Abschnitt 9; Rückmeldung an Spec-Verantwortliche
   für die Rest-Nachträge (5.6).
7. Handoffs (Abschnitt 6) an `einfuegen` bzw. „Export unabhängig vom Ursprungsformat"
   melden — **nicht** in diesem Ticket umsetzen.
