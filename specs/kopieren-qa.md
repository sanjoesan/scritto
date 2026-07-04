# Testplan (QA): Feature „Kopieren“

Bezug: `E:\docs\specs\kopieren-req.md` (Anforderung, „erneuter, kritischer
Verifikationsdurchlauf“), `E:\docs\specs\kopieren-code.md` (Code-Audit),
`E:\docs\FEATURE-SPEC-DOCX-ODT.md` (Referenzkonventionen). Code- und Teststand gegen die
Arbeitskopie in `E:\docs` geprüft: alle unten genannten Dateien wurden einzeln gelesen
(`src/formats/shared/editor/clipboard.ts`, die `__tests__`-Dateien, `tests/e2e/clipboard*.spec.ts`,
`tests/e2e/selection-regression.spec.ts`, `playwright.config.ts`, die DOCX/ODT-Roundtrip-Tests).

## Rolle & Status dieses Dokuments — WICHTIG (überarbeitet)

**Dieses Dokument wurde vollständig überarbeitet.** Die Vorfassung war ein *Vorab-Plan* aus
einer Zeit, in der noch kein Kopier-Code existierte — sie markierte jede Testdatei mit
„(neu)“ und behauptete in ihrem Blocker-Abschnitt wörtlich „**Kein Code existiert noch.**“.
**Das ist überholt und war sachlich falsch geworden**, genau wie die alten Fassungen von
`kopieren-req.md`/`kopieren-code.md`, bevor sie neu verankert wurden. Der tatsächliche Stand:

- Der Kopier-Code **existiert** (`clipboard.ts`, `schema.ts hard_break.leafText`, der
  `clipboardTextSerializer`-Prop in `WordEditor.tsx`).
- **Alle** in diesem Plan beschriebenen Tests **existieren bereits** und sind implementiert
  (Unit, E2E, Datei-Rundreise, Cross-Format-Datenebene, Selection-Sync-Kopiervariante,
  DOCX/ODT-Reader-Writer-Rundreise inkl. der copy/paste-geformten `describe`-Blöcke).
- Die Browsermatrix (5 Playwright-Projekte inkl. der gescopten Clipboard-Zusatzprojekte
  Safari+Firefox) **existiert** in `playwright.config.ts`.

Damit ist der Charakter dieses Testplans jetzt identisch mit dem der Anforderung: ein
**Verifikations- und Auditplan gegen tatsächlich vorhandene Tests**, nicht eine Bauanleitung
für etwas Nichtexistentes. QA-Aufgabe ist nachzuweisen, dass (a) die vorhandenen Tests
tatsächlich **grün** sind (nicht nur existieren), (b) sie das SOLL aus `kopieren-req.md`
Abschnitte 1–5 **vollständig** abdecken, (c) die als **blockiert** markierten Cross-Format-
Fälle sauber als `test.fixme` (nie als „bestanden“) geführt sind, und (d) die ehrlich
begrenzte WebKit-Abdeckung **nicht** als „Safari automatisiert grün“ überverkauft wird.

Grundprinzip (siehe Auftrag): Unit-Tests allein reichen nicht. Für jeden Testfall aus
`kopieren-req.md`, der eine echte Nutzerinteraktion beschreibt (Tastenkombination, Klick,
Drag, Datei-Upload, Datei-Export), existiert ein **echter, im Browser laufender
Playwright-Test**, der die Oberfläche tatsächlich bedient (`page.keyboard.type`/`.press`,
`page.mouse`, `locator.click`, `input.setInputFiles`, `page.waitForEvent('download')`) und
das Ergebnis aus dem sichtbaren DOM, der echten Zwischenablage oder — bei Rundreise-Fällen —
aus der **tatsächlich heruntergeladenen Datei** (via `JSZip` geöffnet) prüft. Kein Testfall
stellt Kopieren durch einen internen `editorView.dispatch(...)`- oder Funktionsaufruf nach.

---

## 0. Ist-Zustand: was bereits existiert (verifizierte Bestandsaufnahme)

| Artefakt | Datei | Status (am Code geprüft) |
|---|---|---|
| Klartext-Serializer | `src/formats/shared/editor/clipboard.ts` | vorhanden; behandelt den `table_row`-Lauf aus `CellSelection.content()` |
| `hard_break.leafText = () => '\n'` | `src/formats/shared/schema.ts` | vorhanden (Root-Cause-Fix „Befund A“) |
| Serializer verdrahtet | `WordEditor.tsx` (`clipboardTextSerializer`-Prop) | vorhanden |
| Unit: Serializer | `src/formats/shared/editor/__tests__/clipboard.test.ts` (9 Tests) | vorhanden; **eine Lücke**, s. 2.1.1 |
| Unit: Datenschutz-Scan | `src/formats/shared/editor/__tests__/clipboard-privacy.test.ts` | vorhanden (Scope-Präzisierung s. 2.4) |
| Unit: Cross-Format-Textparität | `src/formats/shared/__tests__/cross-format-clipboard-content.test.ts` | vorhanden |
| Unit: DOCX-Rundreise (copy/paste-geformt) | `src/formats/docx/__tests__/roundtrip.test.ts` (4 `describe`-Blöcke) | vorhanden |
| Unit: ODT-Rundreise (copy/paste-geformt) | `src/formats/odt/__tests__/roundtrip.test.ts` (dieselben 4 Blöcke) | vorhanden |
| E2E: Kopieren | `tests/e2e/clipboard.spec.ts` (642 Z., 17 Testfälle) | vorhanden |
| E2E: Datei-Rundreise | `tests/e2e/clipboard-roundtrip.spec.ts` (R-1/R-2/R-6/R-7 + 4× `fixme`) | vorhanden |
| E2E: Selection-Sync-Kopiervariante | `tests/e2e/selection-regression.spec.ts` (4. Test) | vorhanden |
| Browsermatrix | `playwright.config.ts` (5 Projekte) | vorhanden |

**Kein Testartefakt ist mehr „neu anzulegen“.** Der Rest dieses Dokuments verifiziert diese
Bestände und benennt die wenigen echten Verbesserungen (2.1.1, 2.4, WebKit-Ehrlichkeit).

### 0.1 Testumgebung

| Ebene | Befehl | Runner | Ort |
|---|---|---|---|
| Unit/Modell | `npm test` (`vitest run`) | Vitest | `src/**/__tests__/*.test.ts` |
| E2E (echter Browser) | `npm run test:e2e` (`playwright test`) | Playwright gegen `npm run build && npm run preview` (`playwright.config.ts`) | `tests/e2e/*.spec.ts` |

### 0.2 Browsermatrix — reale Abdeckung (ehrlich, **nicht** überverkauft)

Die fünf Projekte in `playwright.config.ts`:

| Projekt | Engine | Scope | Clipboard-Permission | Reale Kopier-Abdeckung |
|---|---|---|---|---|
| `Desktop Chrome` | Chromium | ganze Suite | `permissions:['clipboard-read','clipboard-write']` | **vollständig** inkl. Technik B (`clipboard.read()`, T-15; `readText()`, Abschnitt 6/6) |
| `Mobile` (Pixel 7) | Chromium | ganze Suite | wie oben | Touch-Rundlauf **vollständig** |
| `Tablet` (iPad Mini) | WebKit | ganze Suite | keine (WebKit) | nur paste-freie Teilmenge (s. u.) |
| `Desktop Safari (Clipboard)` | WebKit | `testMatch:/clipboard.*\.spec\.ts/` | keine (WebKit) | **nur paste-freie Teilmenge** |
| `Desktop Firefox (Clipboard)` | Firefox | `testMatch:/clipboard.*\.spec\.ts/` | keine, In-Page-Tastatur-Rundlauf | **voller Kopieren→Einfügen-Rundlauf** |

**Kritische Ehrlichkeitsauflage (`kopieren-code.md` Finding 5.2/5.6):** Nahezu jeder
aussagekräftige Kopiertest in `clipboard.spec.ts` trägt
`test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)`. Auf WebKit (also `Tablet`
**und** `Desktop Safari (Clipboard)`) laufen real **nur** die paste-freien Tests:
Kontextmenü-Nichtunterdrückung (Testfall 3/4), Undo-Neutralität (Testfall 3/3),
Fokus-Isolation. Der Projektname `Desktop Safari (Clipboard)` suggeriert also mehr, als
ausgeführt wird — das ist so zu **berichten**, nicht zu kaschieren:

- **Firefox** ist von den `webkit`-Skips **nicht** betroffen und fährt den vollen
  Paste-Rundlauf → es ist die **einzige** automatisierte Nicht-Chromium-Engine, die den
  Kopieren→Einfügen-Rundlauf prüft. **QA-Handlungspunkt:** beim Verifikationslauf explizit
  bestätigen, dass `Desktop Firefox (Clipboard)` **grün** ist.
- **Echtes Apple Safari / echtes Firefox auf realer Hardware** bleibt manueller
  Abnahmepunkt (`kopieren-req.md` Grenzfall 11 / DoD (d); Abschnitt 6 unten). Playwright-
  WebKit ist keine 1:1-Kopie von Safari.

### 0.3 Zwei Testtechniken (je Testfall im Code vermerkt)

- **Technik A (In-Page-Tastatur-Rundlauf):** Auswählen → `ControlOrMeta+c` → Cursor
  umsetzen → `ControlOrMeta+v` → resultierenden DOM prüfen. Nutzt die echte
  System-Zwischenablage über native Browser-Tastenbehandlung **ohne** Permissions-API,
  läuft daher engine-unabhängig (auf WebKit trotzdem geskippt, s. 0.2 — dort ist der
  Rundlauf in Playwright unzuverlässig, nicht die Technik prinzipiell falsch).
- **Technik B (Rohzugriff `navigator.clipboard.read()`/`readText()`):** nur für
  MIME-genaue Prüfungen (`text/html`+`text/plain`-Nachweis, tab-getrennter Klartext),
  **nur `Desktop Chrome`**, im Test mit `test.skip(browserName !== 'chromium', …)` markiert.
  Dies ist **kein** App-Aufruf von `navigator.clipboard` (Datenschutzprinzip bleibt gewahrt) —
  es ist reiner Test-Lesezugriff auf die Zwischenablage aus dem Testskript.

---

## 1. Determinismus — Race-Conditions vermeiden (verbindlich für ALLE E2E-Tests)

Dies ist die zentrale Qualitätsauflage des Auftrags und der Grund, warum die vorhandenen
Specs `clipboard.spec.ts`, `clipboard-roundtrip.spec.ts`, `selection-regression.spec.ts`
und `cut.spec.ts` einem **gemeinsamen, dokumentierten Wartemuster** folgen. Jeder neue oder
geänderte Kopier-Test **muss** es einhalten; ein Verstoß gilt als Flake-Risiko und ist im
Review zu blockieren.

### 1.1 Selektions-Sync abwarten (`settle`) — die Kernregel

ProseMirror erfährt eine native, tastaturgetriebene Cursor-/Selektionsbewegung
(`Home`, `End`, `Ctrl+Home`, `Ctrl+End`, `ArrowLeft`/`ArrowRight`) **nur** über das
**asynchrone** `selectionchange`-Event des Browsers. Wird die nächste Taste ohne
menschliche Reaktionszeit sofort gedrückt — wie es eine `press()`-Kette mit Delay 0 tut —
kann sie der Sync-Aufholung **vorauslaufen** und noch auf der alten Position wirken. Eine
echte Tippkadenz löst das nie aus. Deshalb existiert in `clipboard.spec.ts` der Helfer:

```ts
async function settle(page: Page) {
  await page.waitForTimeout(50) // gibt dem in-flight selectionchange-Sync Zeit zu landen
}
```

**Pflicht:** Nach **jeder** nativen Caret-/Selektionsbewegung, auf die eine weitere
Tastenaktion folgt, steht ein `await settle(page)` **vor** der Folgetaste. Belegstellen in
den vorhandenen Specs: `clipboard.spec.ts` Testfall 1 (Z. 97–99: `End` → `settle` → `type`),
Testfall 2, 2.2/2, 2.2/4, Grenzfall 6/12, T-5, T-14, Grenzfall 7; identisches Muster in
`selection-regression.spec.ts` (`waitForTimeout(50)` nach `End`, Z. 34/72/103) und
`clipboard-roundtrip.spec.ts` (`settle`, Z. 41/46/93/98/105). Der Kopiervorgang selbst
(`ControlOrMeta+c`) verändert die Selektion nicht (`kopieren-req.md` Abschnitt 2.1) und
braucht danach kein `settle` — das `settle` gehört immer an die **Bewegung**, nicht an das
Kopieren.

### 1.2 Weitere Determinismus-Regeln (im Bestand belegt, verbindlich)

- **Undo-Gruppierung (`prosemirror-history`):** Vor einem Test, der einen einzelnen
  Undo-Schritt isolieren muss (Testfall 3/3), steht ein `await page.waitForTimeout(600)`
  **nach** dem Tippen und **vor** der Folgeaktion, damit `prosemirror-history` die
  Transaktionen nicht in **einen** Undo-Schritt zusammenfasst (~500 ms Fenster).
  Beleg: `clipboard.spec.ts:324`.
- **Shift+Pfeil-Selektion mit `{ delay: 20 }`:** Zeichengenaue Selektionsaufbauten
  (`T-5` Formatgrenze, Grenzfall 12) drücken `ArrowLeft`/`ArrowRight` mit einem kleinen
  `delay`, damit jede Selektionserweiterung einzeln synchronisiert und keine Zeichen
  „verschluckt“ werden. Beleg: `clipboard.spec.ts:349/356/508/520`.
- **Asynchrone Bild-Einfügung abwarten:** `FileReader.readAsDataURL` (in
  `Toolbar.tsx handleImagePick`) ist async. Nach `input.setInputFiles(...)` **nie** sofort
  weitertippen, sondern die resultierende `insertImage()`-Transaktion abwarten:
  `await expect(editor.locator('img')).toHaveCount(1)`. Beleg: `clipboard.spec.ts:283/598`.
  Danach steht die Selektion als `NodeSelection` **auf** dem Bild — vor dem Weitertippen
  `ControlOrMeta+End` + `settle`, sonst ersetzt das Tippen das Bild.
- **Kein blindes `waitForTimeout` als Ersatz für eine Zusicherung:** Wo ein sichtbarer
  Zustand prüfbar ist, wird `await expect(...)` (auto-retry) verwendet, nicht ein fester
  Timeout. `settle` ist ausschließlich für die *nicht* beobachtbare `selectionchange`-
  Aufholung reserviert.
- **Dirty-Close-Dialog deterministisch bestätigen:** Tests, die zum Format-Picker
  zurücknavigieren, während das Quelldokument „dirty“ ist, registrieren **vor** der
  Navigation `page.on('dialog', d => d.accept())` (bzw. `page.once(...)`), damit der native
  `window.confirm(...)` aus `DocumentWorkspace.handleClose()` nicht blockiert.
  Beleg: `clipboard.spec.ts:65`, `clipboard-roundtrip.spec.ts:26`.

---

## 2. Unit-Tests (Vitest)

### 2.1 Serializer: `src/formats/shared/editor/__tests__/clipboard.test.ts`

Reine Node-Ebene, kein DOM, kein `EditorView` (`fakeView = {} as EditorView`, da
`clipboardTextSerializer` sein `view`-Argument nie liest). Der `serialize(...nodes)`-Helfer
baut eine `Slice(Fragment.from(nodes), 0, 0)`. **Vorhandene, verifizierte Fälle (9):**

1. 2×2-Tabelle → `A1\tB1\nA2\tB2` (tab-/zeilengetrennt).
2. Tabelle mit `colspan`/`rowspan` → voller Zellinhalt erhalten.
3. Bullet-Liste → `- Eins\n- Zwei\n- Drei`.
4. Nummerierte Liste mit `start: 5` → `5. Erstens\n6. Zweitens`.
5. Verschachtelte Liste → Unterpunkt eingerückt, strukturell vom Oberpunkt unterscheidbar.
6. `hard_break` in Absatz → `Zeile1\nZeile2` (Regression Befund A).
7. Mehrere Top-Level-Blöcke (Überschrift+Absatz+Liste) → Leerzeilen-getrennt.
8. Leere Slice → `''` ohne Exception.
9. Regression: `hard_break.spec.leafText` ist definiert und liefert `'\n'`.

#### 2.1.1 (Substanz, HOCH) Echte Lücke: der nackte `table_row`-Lauf ist unit-ungetestet

`kopieren-code.md` Finding 5.1: Die wertvollste Verzweigung von `clipboard.ts`
(`rowRun`/`flushRowRun`, Z. 29–46) behandelt den Fall, dass `CellSelection.content()` eine
Slice liefert, deren Top-Level-Fragment ein **nackter Lauf von `table_row`-Knoten** ist
(nicht in ein `table` gehüllt). Die vorhandenen Unit-Fälle bauen **ausschließlich volle
`table`-Knoten** (Fall 1/2) — nie einen Zeilen-Lauf auf Slice-Ebene. Diese Kernverzweigung
ist real **nur** über das E2E T-14a abgedeckt, das auf WebKit geskippt ist. **Empfehlung:**
zwei plattformunabhängige Unit-Fälle ergänzen (schließt die einzige ungetestete
Kernverzweigung):

```ts
it('serialisiert einen nackten table_row-Lauf (CellSelection.content-Form) tab-/zeilengetrennt', () => {
  const cell = (t: string) => wordSchema.nodes.table_cell.create(null, paragraph(t))
  const row = (a: string, b: string) => wordSchema.nodes.table_row.create(null, [cell(a), cell(b)])
  const slice = new Slice(Fragment.from([row('A1', 'B1'), row('A2', 'B2')]), 1, 1)
  expect(clipboardTextSerializer(slice, fakeView)).toBe('A1\tB1\nA2\tB2')
})

it('flusht einen Zeilen-Lauf korrekt, wenn ein normaler Block dazwischenliegt', () => {
  const cell = (t: string) => wordSchema.nodes.table_cell.create(null, paragraph(t))
  const row = (a: string, b: string) => wordSchema.nodes.table_row.create(null, [cell(a), cell(b)])
  const slice = new Slice(Fragment.from([row('A1', 'B1'), paragraph('X'), row('A2', 'B2')]), 1, 1)
  expect(clipboardTextSerializer(slice, fakeView)).toBe('A1\tB1\n\nX\n\nA2\tB2')
})
```

#### 2.1.2 (klein) Assertions schärfen (`kopieren-code.md` Finding 5.3)

- Fall 2 (`colspan`/`rowspan`) prüft nur `toContain`. Exakt möglich und aussagekräftiger:
  `expect(serialize(table)).toBe('Verbunden\nNormal\tZwei')` — hält zugleich fest, dass ein
  tab-/zeilengetrenntes Klartextraster Spannen bewusst **nicht** durch Auffüllen ausdrückt.
- Ergänzen: `hard_break` **innerhalb** einer Tabellenzelle → wird durch `rowToPlainText`s
  `.replace(/\n/g,' ')` (clipboard.ts:70) zu **einem Leerzeichen** (Zelle „a⏎b“ → `"a b"`,
  nicht `"a\nb"`), damit die Tab-/Zeilenstruktur der Tabelle nicht zerbricht. Ein kurzer
  Fall dokumentiert diese bewusste Entscheidung.
- Optional: ein Fall für `unsupported_block` (generischer `default`-Zweig, clipboard.ts:60).

### 2.2 Reader/Writer-Rundreise DOCX **und** ODT (Auftrag Pillar 1) — vorhanden

Kopieren/Einfügen **innerhalb** des Editors erzeugt keinen eigenen Codepfad: es entstehen
dieselben `wordSchema`-Knoten wie bei getipptem Inhalt. Ein „Rundreise-Test für Kopieren“
auf Reader/Writer-Ebene bedeutet daher: **exakt die Knotenstrukturen, die ein
Kopieren/Einfügen gemäß `kopieren-req.md` Abschnitt 2.2 erzeugt**, durch
`writeDocx`/`readDocx` bzw. `writeOdt`/`readOdt` schicken und Verlustfreiheit prüfen.

**Vorhandene, verifizierte `describe`-Blöcke** — je 4 in `docx/__tests__/roundtrip.test.ts`
**und** identisch gespiegelt in `odt/__tests__/roundtrip.test.ts`:

1. `content shape produced by copy/paste of a partially-bold word` — Fett/Nicht-Fett-Grenze
   mitten im Wort bleibt erhalten (zwei Runs mit exakter Zeichengrenze). ↔ req 2.2 Testfall 3.
2. `mixed-blocktype selection (heading + paragraph + list)` — `heading`/`paragraph`/
   `bullet_list` bleiben als getrennte Blocktypen erhalten. ↔ req 2.2 Testfall 4 / req 4 Testfall 3.
3. `whole-cell table selection (as produced by a CellSelection copy/paste)` — Tabelle inkl.
   `colspan` überlebt als eigenständige Slice. ↔ req 3 Testfall 2 / Grenzfall 5.
4. `an inserted-standalone image (image-only selection)` — Bild bleibt isoliert, kein
   Nachbartext wird eingemischt. ↔ req 5 Grenzfall 6.

Zusätzlich decken die **bestehenden** Rundreise-Tests `hard_break` (`w:br`/`text:line-break`,
`roundtrip.test.ts` „preserves hard_break“) und **Tab-Zeichen/Mehrfach-Leerzeichen auf
Datenmodell-Ebene** ab („preserves runs of multiple spaces and tab characters“) — die
Datenmodell-Rundreise für `\t`, die der E2E-Fall (N/A, s. 3.3) nicht leisten kann.

### 2.3 Cross-Format-Textparität (Datenebene) — vorhanden

`src/formats/shared/__tests__/cross-format-clipboard-content.test.ts` schickt denselben
copy/paste-geformten `WordDocumentContent` einmal durch `writeDocx→readDocx` und einmal
durch `writeOdt→readOdt` und prüft **inhaltliche Textgleichheit** (`extractText(viaDocx) ===
extractText(viaOdt)`, Erwartung `'Berichtfett Text.Punkt'`). Legitimer Unit-Fall (rein
datenmodellseitig, keine UI) und der einzige automatisierte Nachweis für `kopieren-req.md`
Abschnitt 4 Testfälle 4/5 (DOCX↔ODT) **unabhängig** vom UI-Blocker (fehlender
Export-Format-Picker, s. 3.4/7).

### 2.4 Datenschutz-Scan (`kopieren-req.md` Abschnitt 5, Grenzfall 15) — vorhanden

`src/formats/shared/editor/__tests__/clipboard-privacy.test.ts` scannt rekursiv `src/`,
strippt Kommentare (damit *dokumentierende* Nennung der API nicht als *Nutzung* zählt),
schließt sich selbst über eine `ALLOWED`-Menge aus, und schlägt fehl, sobald irgendeine
`.ts`/`.tsx`-Datei `navigator.clipboard` real nutzt. **Präzisierung (Finding 5.4):** Der
Scan prüft *nur* die `navigator.clipboard`-Nichtnutzung. Die weitergehende
No-Logging-/No-Persistence-Garantie (kein `console.log`/`fetch`/Analytics/`localStorage`/
`IndexedDB` mit Zwischenablageninhalt) ruht auf dem **Fehlen jedes Capture-Pfads** plus dem
manuellen Review-Punkt (Abschnitt 6), nicht auf diesem Scan. Der Testname/Kommentar sollte
das ehrlich abgrenzen; optional den Scan um `clipboard.ts`-spezifische Muster
(`console\.`, `fetch\(`, `localStorage|indexedDB`) erweitern — reine Härtung, kein
Funktionsfehler.

---

## 3. E2E-Tests — echte Playwright-Browserbedienung (Auftrag Pillar 2)

Gemeinsamer `beforeEach` (aus dem Bestand): `page.on('dialog', d => d.accept())` → `goto('/')`
→ Banner „verstanden“ → auf Chromium `context.grantPermissions([...])` → Format-Karte
(`odtCard`/`docxCard`) „Neu erstellen“. Helfer: `settle` (s. 1.1), `watchForConsoleErrors`
(sammelt `pageerror`+Konsolen-`error`, Assertion am Testende), `pickColor` (setzt
`<input type=color>` React-konform über den nativen Value-Setter).

### 3.1 `tests/e2e/clipboard.spec.ts` — vorhandenes Test-Inventar

| ID / Testname (Bestand) | req-Bezug | Technik | WebKit |
|---|---|---|---|
| Testfall 1: Strg/Cmd+C legt Inhalt ab (Rundlauf via Einfügen), Dokument unverändert | 1 (1/2), 2.1 | A | skip |
| Testfall 2 / Grenzfall 1: Strg+C ohne Selektion lässt Zwischenablage unangetastet | 5 Grenzfall 1 | A | skip |
| Testfall 3/4 / Grenzfall 13: `contextmenu`-Event → `defaultPrevented === false` | 1 (4), 5 Grenzfall 13 | DOM-Event | **läuft** |
| Testfall 2.2/2: Fett+Textfarbe+Hervorhebung kombiniert bleiben erhalten (`strong span span`) | 2.2 Testfall 2 | A | skip |
| Testfall 2.2/4: Überschrift+Absatz+Liste bleiben unterscheidbar (`h2`/`> p`/`li`) | 2.2 Testfall 4 | A | skip |
| Testfall 3/2 + Gegenprobe: ganze Zellen → Tabelle beim Einfügen; Textauswahl in Zelle → keine neue Tabelle | 3 Testfall 2, 5 Grenzfall 5 | A + Maus-Drag | skip |
| Grenzfall 6: allein markiertes Bild kopieren nimmt keinen Nachbartext mit | 5 Grenzfall 6 | A | skip |
| Testfall 3/3: Kopieren erzeugt keinen eigenen Undo-Schritt (600 ms-Gruppierungswait) | 3 Testfall 3 | A | **läuft** |
| Grenzfall 12: schnelles Wechsel-Kopieren — letzter Vorgang gewinnt | 5 Grenzfall 12 | A | skip |
| Fokus-Isolation: Strg+C bei fokussiertem Farbwähler wirft nicht, leakt nichts | 3 Testfall 4 | A | **läuft** |
| Abschnitt 6/6: Tabelle als `text/plain` → `readText()` enthält `A1\tB1` | 2.1, 6 | B | nur Chromium |
| T-14a: Tabelle → natives `<textarea>` → `A1\tB1\nA2\tB2` | 6 | A + `<textarea>`-Ziel | skip |
| T-14b: Liste → natives `<textarea>` → `- Eins\n- Zwei` | 6 | A + `<textarea>`-Ziel | skip |
| T-15: `clipboard.read()` enthält `text/html` **und** `text/plain` | 2.1 (Multi-MIME) | B | nur Chromium |
| T-5: Teilselektion an der Fett/Nicht-Fett-Grenze bleibt unformatiert (kein Off-by-one) | 2.2 Testfall 3, 5 Grenzfall 3 | A | skip |
| T-12: Strg+C bei fokussiertem `input[type=file]` wirft nicht, leakt Markertext nicht | 3 Testfall 4 | A | skip |
| Grenzfall 7: Kopieren mit ~3 MB-Bild in Selektion — hartes Zeitbudget `< 5000 ms` | 5 Grenzfall 7 | A | skip |
| Tablet-Viewport: Selektion + C/V unter Touch-Emulation | 1 Testfall 5 | A | skip (Touch-Rundlauf via Mobile/Chromium) |

**Techniknotiz zu Testfall 3/2 (heikelster Fall):** Ein reiner `locator.click()` erzeugt nur
`TextSelection`; `prosemirror-tables` stuft erst durch echtes Ziehen über eine Zellgrenze
(`page.mouse.down/move({steps:5})/up` zwischen zwei Zell-`boundingBox`-Mitten) zu
`CellSelection` hoch. Das Einfügen erfolgt in ein **neues, tabellenloses** Dokument —
andernfalls schlösse ProseMirror den offenen Zeilen-Lauf gegen die umgebende Quelltabelle
(diese wüchse in-place statt eine zweite zu bilden). Der Bild-Fall (Grenzfall 6) wählt das
Bild bewusst per Tastatur (`Home`→`ArrowLeft` = `selectNodeBackward`) statt per Klick, weil
das 1×1-Fixture-`<img>` unzuverlässig zu treffen ist.

### 3.2 `tests/e2e/clipboard-roundtrip.spec.ts` — Datei-Rundreise (vorhanden)

Struktur wie `docx.spec.ts`/`odt.spec.ts`: Dokument aufbauen → `getByRole('button',{name:
'Exportieren'}).click()` → `page.waitForEvent('download')` → heruntergeladene Datei mit
`fs.readFile((await download.path())!)` lesen → mit `JSZip.loadAsync` öffnen → **echten**
`word/document.xml` bzw. `content.xml`-Inhalt prüfen (nicht den DOM vor Export).

- **R-1 (DOCX):** zusammengesetztes Dokument (Überschrift 1 + teils fetter Absatz) →
  markieren → kopieren → in **zweites, neues, leeres** Dokument einfügen → DOCX exportieren →
  im XML `Bericht` + `Formatierter Text.` (nach Tag-Strip) + `<w:b/>` + `Heading1|w:pStyle`.
- **R-2 (ODT):** analog → `content.xml` mit `fo:font-weight="bold"` + `text:h`.
- **R-6:** Zwischenablage überlebt Schließen von Dokument A und Öffnen eines frischen B
  (dokumentierter Ersatzweg, da die App nur **ein** aktives Dokument zeigt).
- **R-7 (parametrisiert):** je Merkmal aus req 2.2 (Kursiv `<w:i/>`, Unterstrichen `<w:u `,
  Durchgestrichen `<w:strike/>`, Bullet-Liste `numPr|w:numId`, Nummerierte Liste
  `numPr|w:numId`): kopieren/einfügen → DOCX-Export → Markup im echten XML vorhanden.

**`test.fixme` (korrekt als BLOCKIERT geführt, nicht „bestanden“):**
- **R-3** DOCX→ODT, **R-4** ODT→DOCX, **R-5** DOCX→ODT→DOCX: blockiert durch die fehlende
  Export-Format-Wahl in der UI (`DocumentWorkspace.tsx handleExport` ist ans Ursprungsformat
  gebunden). Gehört zu `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 1.3, **nicht** zu „Kopieren“
  (`kopieren-code.md` Abschnitt 0.4, Handoff Abschnitt 6). Scharf schalten, sobald der
  Format-Picker existiert.
- **Tab-Zeichen**-Rundreise: `test.fixme` mit Begründung — es gibt **keinen** Tastatur-/
  Toolbar-Weg, ein literales `\t` in `.ProseMirror` einzugeben (Tab wechselt den Fokus).
  Produktlücke, an req/code zurückzumelden; Datenmodell-Rundreise für `\t` bleibt in
  `docx/__tests__/roundtrip.test.ts` (s. 2.2).

### 3.3 `tests/e2e/selection-regression.spec.ts` — Selection-Sync × Kopieren (vorhanden)

Vierter Test im bestehenden `describe`: `Alles auswählen → Fett → Ctrl+A → Ctrl+C → Klick
zum Neupositionieren → End → settle(50 ms) → Enter → tippen` → beide Absätze überleben
(`p`-Count = 2). Beweist, dass ein zwischengeschaltetes Kopieren die Selektions-Sync **nicht**
korrumpiert (`kopieren-req.md` Abschnitt 3, Testfall 1 / Pflicht-Regressionstest). Bewusst in
dieser Datei (etablierter Ort für Selection-Sync-Regressionen), nicht in `clipboard.spec.ts`.

### 3.4 Was E2E **nicht** leisten kann (bewusst, dokumentiert)

- **Cross-Format-Rundreise** (R-3/4/5): UI-Blocker, s. 3.2 → `test.fixme`.
- **Tab-Zeichen kopieren**: kein Eingabeweg → `test.fixme`; Datenebene deckt es ab.
- **Kopf-/Fußzeile/Fußnote/Kommentar** (Grenzfall 14): `WordEditor.tsx` rendert nur
  `doc.content.body`; zurückgestellt bis diese Bereiche eine Editor-UI erhalten.

---

## 4. Manuelle / ergänzende Prüfungen (nicht automatisierbar)

| # | Prüfung | Bezug | Warum manuell |
|---|---|---|---|
| 1 | Datenschutz-Code-Review bei jedem PR, der `clipboard.ts`/`schema.ts` berührt: kein Logging/`fetch`/Analytics/`localStorage`/`IndexedDB` mit Zwischenablageninhalt | req 5 Grenzfall 15 | teils durch 2.4 automatisiert, Review bleibt zusätzlich verlangt |
| 2 | Cross-App: aus Salamanido kopieren, in **echtes** Word/LibreOffice Writer einfügen, Grundformatierung prüfen | req 2.3 Testfälle 1–3 | echte Desktop-Zielanwendung außerhalb Playwright |
| 3 | **Echtes** Safari (macOS-Hardware) und **echtes** Firefox | req 5 Grenzfall 11, DoD (d) | Playwright-WebKit ≠ Apple Safari (s. 0.2) |
| 4 | Kopieren bei aktiver IME-Komposition (ostasiatische Eingabemethoden) | req 5 Grenzfall 9 | IME systemnah nicht zuverlässig aus Playwright auslösbar |
| 5 | Sehr großes Bild (mehrere MB): UI-Einfrieren mit Profiler beobachten | req 5 Grenzfall 7 | Grenzfall 7 liefert nur den harten Zeitbudget-Assert (< 5 s), ersetzt die Profiler-Beobachtung nicht |

---

## 5. Traceability-Matrix (Anforderung → tatsächlich vorhandener Test)

| `kopieren-req.md` | Abgedeckt durch |
|---|---|
| Abschnitt 1, Testfälle 1–5 (Strg/Cmd+C, Kontextmenü, Touch) | clipboard.spec Testfall 1, 3/4, Tablet-Viewport |
| Abschnitt 1, Testfall 6 (Strg+Einfg) | **offen/zu dokumentieren** — kein Test; als „verifizieren oder als nicht unterstützt dokumentieren“ im Verifikationslauf klären (s. 7) |
| Abschnitt 1, Testfall 7 (kein `navigator.clipboard`) | clipboard-privacy.test.ts |
| Abschnitt 2.1 (leere Selektion, Multi-MIME) | Testfall 2/Grenzfall 1, T-15, Abschnitt 6/6 |
| Abschnitt 2.2, Testfälle 1–4 | 2.2/2, 2.2/4, T-5; Reader/Writer 2.2 (4 Blöcke DOCX+ODT) |
| Abschnitt 2.3, Testfälle 1–3 (Cross-App) | Manuelle Prüfung 2 |
| Abschnitt 3, Testfälle 1–4 (Interferenzen) | selection-regression (Kopiervariante), Testfall 3/2 + Gegenprobe, Testfall 3/3, Fokus-Isolation/T-12 |
| Abschnitt 4, Testfälle 1–3/6/7 (Rundreise) | R-1, R-2, R-6, R-7; 2.3 (Cross-Format-Datenebene) |
| Abschnitt 4, Testfälle 4/5 (Cross-Format UI) | R-3/R-4/R-5 `test.fixme` (blockiert, s. 3.2/7) |
| Abschnitt 5, Grenzfälle 1/3/5/6/7/12/13 | Testfall 2, T-5, Testfall 3/2+Gegenprobe, Grenzfall 6, Grenzfall 7, Grenzfall 12, Testfall 3/4 |
| Abschnitt 5, Grenzfall 2 (Strg+A großes Dok) | teilweise über Grenzfall 7 (Zeitbudget); Performance-Beobachtung Manuell 5 |
| Abschnitt 5, Grenzfälle 9/11 | Manuelle Prüfungen 4/3 |
| Abschnitt 5, Grenzfall 10 (Permission verweigert/Iframe) | kein Pflichttest (Deployment ist Top-Level, kein Embed) — optionaler T-16, s. 7 |
| Abschnitt 5, Grenzfall 14 (Kopf-/Fußzeile) | zurückgestellt (keine Editor-UI), s. 3.4 |
| Abschnitt 5, Grenzfall 15 (Datenschutz) | clipboard-privacy.test.ts + Manuelle Prüfung 1 |
| Abschnitt 6 (Bedienelement-Übersicht) | Testfall 1 (Z.1/2), Testfall 3/4 (Z.2), „kein Button“ (Entscheidung, kein Test), Tablet (Z.5), T-14/Abschnitt 6/6 (Z.6/8), T-15 (Multi-MIME) |

**Bewusst kein Test (Entscheidung, dokumentiert):** kein Kopier-Toolbar-Button →
kein Button-Klick-Test (`kopieren-req.md` Abschnitt 8, Punkt 1).

---

## 6. Bekannte Blocker & offene Restaufgaben (korrigiert)

1. ~~„Kein Code existiert noch.“~~ **Gestrichen — war falsch.** Code und Tests existieren
   vollständig (Abschnitt 0). Der Verifikationslauf setzt keinen noch zu schreibenden
   Produktionscode voraus; er belegt Grün-Stand und schließt die kleinen Test-/Doku-Lücken
   (2.1.1, 2.1.2, 2.4).
2. **Cross-Format-Export-UI fehlt** (`kopieren-code.md` Abschnitt 0.4): R-3/R-4/R-5 bleiben
   `test.fixme`, bis `DocumentWorkspace.tsx` einen Export-Format-Wähler erhält — Übergabe an
   `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 1.3, **kein** Kopieren-Blocker.
3. **WebKit-Abdeckungsrealität** (0.2): `Desktop Safari (Clipboard)` fährt nur die
   paste-freie Teilmenge; im Bericht **nicht** als „Safari automatisiert grün“ ausgeben.
   Real-Hardware-Safari/-Firefox bleibt manueller Abnahmepunkt (Manuelle Prüfung 3).
4. **Strg+Einfg (Ctrl+Insert)** (req 1, Testfall 6): noch kein Test — im Verifikationslauf
   entweder als funktionierender Zweitweg nachweisen **oder** als „nicht unterstützt“
   dokumentieren; keine kommentarlose Lücke.
5. **Verweis-Drift** (`kopieren-code.md` Finding 5.5): Code-Kommentare zeigen auf
   `kopieren-req.md Abschnitt 1, Zeile 71` — das `navigator.clipboard`-Nicht-Soll steht in
   der aktuellen req in der Tabelle **Abschnitt 1, Zeile 8** (um Z. 100). Kommentare auf den
   **stabilen Anker** („Abschnitt 1, Tabellenzeile 8 ‚Programmatischer Zugriff …
   navigator.clipboard‘“) umstellen. Reine Doku, kein Verhalten.

---

## 7. Verifikations-Runbook (so wird „grün“ belegt, nicht behauptet)

Reihenfolge (DoD verlangt **nachweislich** grün, nicht nur vorhanden):

1. **Unit/Modell:** `npm test` — muss `clipboard.test.ts` (inkl. der Ergänzungen 2.1.1/2.1.2),
   `clipboard-privacy.test.ts`, `cross-format-clipboard-content.test.ts`,
   `docx|odt/__tests__/roundtrip.test.ts` (copy/paste-Blöcke + `hard_break` + Tab) grün zeigen.
2. **E2E Chromium:** `npm run test:e2e -- --project="Desktop Chrome"` — voller Rundlauf inkl.
   Technik B (T-15 `clipboard.read()`, Abschnitt 6/6 `readText()`).
3. **E2E Firefox:** `--project="Desktop Firefox (Clipboard)"` — der **einzige** automatisierte
   Nicht-Chromium-Paste-Rundlauf; muss grün sein (0.2/Finding 5.2).
4. **E2E WebKit/Safari:** `--project="Desktop Safari (Clipboard)"` — erwartet grün, aber
   **bewusst nur** die paste-freie Teilmenge; im Bericht als solche kennzeichnen.
5. **E2E Mobile/Tablet:** Touch-Rundlauf (Mobile/Chromium vollständig; Tablet/WebKit im
   Rahmen der dokumentierten Grenze).
6. **Rundreise:** `clipboard-roundtrip.spec.ts` R-1/R-2/R-6/R-7 grün; R-3/R-4/R-5 + Tab als
   `test.fixme` (blockiert, **nicht** „bestanden“).
7. **Manuell:** reale Safari-/Firefox-Hardware (Grenzfall 11), Cross-App-Einfügen,
   IME-Komposition, Datenschutz-Review; Strg+Einfg klären (Punkt 6.4).

---

## 8. Abnahmekriterien für diesen Testplan

Der Testplan gilt als abgearbeitet, wenn:

1. Alle Unit-Tests (Abschnitt 2, inkl. der ergänzten Fälle 2.1.1) existieren und grün sind
   (`npm test`).
2. Alle E2E-Tests (Abschnitt 3) auf `Desktop Chrome` und `Desktop Firefox (Clipboard)` grün
   sind, `Desktop Safari (Clipboard)` grün **im Umfang seiner paste-freien Teilmenge**
   (ehrlich so berichtet), `Tablet`/`Mobile` für die Touch-Fälle — ausgenommen die
   dokumentierten `test.fixme`-Fälle.
3. Jeder E2E-Test die Determinismus-Regeln aus Abschnitt 1 einhält (`settle` nach jeder
   nativen Caret-/Selektionsbewegung; 600 ms vor isoliertem Undo; `{delay}` bei
   zeichengenauer Selektion; Bild-Einfügung via `toHaveCount` abgewartet) — im Review als
   Blockierkriterium.
4. Die Traceability-Matrix (Abschnitt 5) keine Lücke ohne Begründung zeigt; die offenen
   Punkte (Strg+Einfg, Grenzfall 10/Iframe) im Bericht als geklärt/bewusst-offen geführt sind.
5. Die manuellen Prüfungen (Abschnitt 4) durchgeführt und ihr Ergebnis dokumentiert sind
   (nicht „ausstehend“).
6. Die Handoffs (Abschnitt 6: Cross-Format-Export-UI; Real-Hardware; Verweis-Drift) an die
   jeweils zuständige Stelle gemeldet sind, ohne sie in diesem Ticket zu „bestehen“.

Erst danach darf der Backlog-Status von `kopieren` von „nicht vertrauenswürdig“ auf
„verifiziert“ wechseln (`kopieren-req.md` Abschnitt 8).
