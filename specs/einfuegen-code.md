# Umsetzungsplan „Einfügen" — dateigenau, gegen den tatsächlichen Code geprüft (Rev. 4)

Bezug: `E:\docs\specs\einfuegen-req.md` (Anforderung, jüngere Fassung), `E:\docs\FEATURE-SPEC-DOCX-ODT.md`
(Rahmenbedingungen). Code-Stand erneut vollständig geprüft am **2026-07-05** in `E:\docs`.

Rolle dieses Dokuments: Es beantwortet, was am **bestehenden Code** fehlt bzw. falsch ist
(nicht nur „Tests fehlen", sondern ein konkreter, reproduzierbarer Export-Absturz-Bug **und**
ein Zielkonflikt mit einem inzwischen existierenden Datenschutz-Test), legt fest, welche
Dateien geändert/neu angelegt werden, spezifiziert die ProseMirror-Schema-/Commands-
Änderungen, die Toolbar-Änderungen (optional) sowie die Import-/Export-Anpassungen für OOXML
(DOCX) und ODF (ODT). Alle Zeilenangaben wurden gegen den tatsächlichen Dateiinhalt am
o. g. Datum verifiziert.

> **Warum „Rev. 2":** Eine erste Fassung dieses Plans entstand, **bevor** die Nachbarfeatures
> „Kopieren"/„Ausschneiden" samt Testinfrastruktur gemergt wurden. Sie behauptete u. a.
> „`grep -rn 'paste|clipboard' src/` liefert keinen einzigen Treffer" und „keine Paste-/
> Clipboard-Tests in `tests/e2e`". **Beides ist heute falsch** (siehe 0.2). Genau davor warnt
> `einfuegen-req.md` Abschnitt 0 ausdrücklich. Diese Fassung korrigiert den Befund gegen den
> Ist-Stand, statt ihn fortzuschreiben, und ergänzt die in der ersten Fassung **fehlende**,
> aber jetzt zwingende Datenschutz-Entscheidung (Abschnitt 1).
>
> **Warum „Rev. 3":** Re-Verifikation am 2026-07-05 (nachdem `clipboard.ts` zuletzt an
> diesem Tag angefasst wurde). Alle Kernbefunde von Rev. 2 gelten unverändert (Live-Export-Bug
> 0.4 real, `clipboard-privacy.test.ts` weiter grün und `navigator.clipboard`-verbietend,
> `schema.ts` braucht keine Änderung, `paste.ts`/`imageFallback.ts`/`clipboardRead.ts`
> existieren weiterhin **nicht** — Glob leer). Korrigiert wurden nur: (a) eine **inzwischen
> überholte Empfehlung** — in `WordEditor.tsx` existiert nun bereits ein extrahierter
> `useAutoDismiss`-Helper, den die Paste-Rückmeldung nur noch **wiederverwendet** statt einen
> zweiten Effekt zu bauen (5.3); (b) diverse **verschobene Zeilennummern** in `WordEditor.tsx`
> (der Helper wurde herausgezogen, `Toolbar` bekommt `cutError`/`setCutError` jetzt als Props)
> und in `clipboard-privacy.test.ts`; (c) ein **Datei-Verweisfehler** — die Konstante
> `SKIP_WEBKIT_ROUNDTRIP` liegt in `clipboard.spec.ts:83`, **nicht** in
> `clipboard-roundtrip.spec.ts` (dort steht der WebKit-Skip nur als inline-String, Zeilen
> 32/85/150/264). Details in 0.5.
>
> **Warum „Rev. 4":** Kritische Prüfung dieser Datei gegen (a) den Ist-Code **und** (b) den
> tatsächlichen `prosemirror-view`/`prosemirror-model`-Bibliothekscode in `node_modules`
> (nicht nur gegen dessen öffentliche Typdeklarationen), zusätzlich zum Abgleich gegen die
> inzwischen auf 23 Grenzfälle erweiterte `einfuegen-req.md`. Ergebnis: die Architektur aus
> Rev. 3 trägt, aber vier Punkte waren **falsch, unvollständig oder unbelegt** und sind hier
> korrigiert (Details in 0.6):
> 1. **Stale Zeilenverweis:** „`clipboardTextSerializer`-Prop in `WordEditor.tsx:116`
>    verdrahtet" (0.2) — tatsächlich Zeile **124**. Korrigiert.
> 2. **Echter Korrektheitsfehler, nicht nur ein Zeilenversatz:** `plainTextClipboardParser`
>    (5.2) erzeugte Text-Knoten **ohne** die am Cursor aktiven Marks. Das hätte die
>    Klartext-Einfügung (3.1/3.3) gegenüber dem **heutigen** ProseMirror-Default (der genau
>    das über `$context.marks()` tut, siehe 0.6) **regressiert** und Anforderung 3.3/Grenzfall
>    21 direkt verletzt. Jetzt explizit spezifiziert (5.2) inkl. eigenem Unit-Test.
> 3. **Falsche/unvollständige Funktionssignaturen:** `clipboardTextParser` und
>    `transformPasted` haben laut `prosemirror-view`s tatsächlichem `EditorProps`-Typ einen
>    dritten `plain: boolean`-Parameter, den Rev. 3 nirgends erwähnte. Ergänzt (5.2), inkl.
>    einer daraus folgenden **Vereinfachung** von 3.3 (Ctrl+Umschalt+V erzwingt den
>    Klartext-Pfad bereits nativ, siehe 0.6 Punkt 3).
> 4. **Grenzfälle 20–23 fehlten vollständig** in Abschnitt 9 (dort stand noch „alle 19", die
>    Tabelle endete bei 19), obwohl `einfuegen-req.md` sie seit der letzten Überarbeitung
>    enthält. Ergänzt, mit dem Befund, dass 20/22/23 bereits **strukturell** durch bestehende
>    ProseMirror-Mechanismen abgedeckt sind (0.6) und nur noch Tests brauchen, während 21
>    direkt an Korrektur 2 hängt.
> 5. **Race Condition beim asynchronen Bild-Blob-Einfügen** (5.2/5.5): `insertImageFile` durfte
>    die Zielposition nicht erst nach dem `await FileReader`-Schritt aus `view.state.selection`
>    lesen, sonst kann zwischenzeitliches Tippen/Klicken das Bild an eine veraltete Position
>    einfügen. Jetzt: Position wird **synchron vor** dem `await` eingefroren, für Paste genauso
>    wie für Drop.

---

## 0. Verifizierter Ist-Zustand (Code-Recherche, korrigiert)

### 0.1 Was diese Fassung gegenüber der ersten korrigiert

| Frühere (falsche) Behauptung | Tatsächlicher Befund (verifiziert) |
|---|---|
| „Kein Treffer für `paste`/`clipboard` in `src`" | **Falsch.** 9 Treffer, u. a. `shared/editor/clipboard.ts`, `clipboard-privacy.test.ts`, `clipboard.test.ts`, `WordEditor.tsx`, `commands.ts`, `schema.ts` (Grep bestätigt). |
| „Keine Paste-/Clipboard-E2E-Tests" | **Falsch.** `tests/e2e/clipboard.spec.ts`, `cut.spec.ts`, `clipboard-roundtrip.spec.ts`, `selection-regression.spec.ts` existieren. |
| „Kontextmenü-Nichtunterdrückung ungetestet" | **Falsch.** `clipboard.spec.ts:~129–143` prüft `event.defaultPrevented === false`. |
| Datenschutz-Invariante nicht erwähnt | **Lücke.** `clipboard-privacy.test.ts` verbietet `navigator.clipboard` **statisch in ganz `src`** — kollidiert direkt mit den in der ersten Fassung geplanten `navigator.clipboard.readText()/read()`-Aufrufen. Siehe Abschnitt 1. |
| Diverse Zeilennummern | Veraltet, da Dateien seither gewachsen sind — hier durchgehend neu belegt. |

### 0.2 Copy/Cut-Infrastruktur existiert bereits (Abgrenzung — NICHT anfassen)

- `src/formats/shared/editor/clipboard.ts` — `clipboardTextSerializer(slice, view)`, in
  `WordEditor.tsx:124` als `clipboardTextSerializer`-Prop verdrahtet (Rev. 3 zitierte hier
  fälschlich Zeile 116 — korrigiert, siehe Titelblatt „Warum Rev. 4"). Betrifft nur die
  **Ausgabe** (Kopieren/Ausschneiden), nicht das Einfügen.
- `commands.ts` — `cutSelection()` (Zeilen 149–166), `canCut()` (126–128). `insertImage()`
  (66–74), `insertHardBreak()` (83–90).
- `WordEditor.tsx` — Keymap (**Zeilen 85–107**) mit `Mod-z/Mod-y/Mod-Shift-z/Enter/Shift-Enter/
  Mod-b/Mod-i/Mod-u/Shift-Delete`. Der Kommentar **86–92** warnt ausdrücklich, dass
  `Mod-c/Mod-x/Mod-v` **nicht** gebunden sein dürfen. Plugin-Array **Zeilen 83–114**. Neu seit
  Rev. 2: ein extrahierter `useAutoDismiss`-Helper (**Zeilen 52–63**, aufgerufen in **74**) und
  der `cutError`-State in **Zeile 71**; `Toolbar` erhält `cutError`/`setCutError` inzwischen als
  **Props** (Render-Aufruf **170**), der rote `role="alert"`-Hinweis wird jetzt **in**
  `Toolbar.tsx:157–161` gerendert (nicht mehr in `WordEditor.tsx`).
- **Native Strg+V für INTERN kopierten Inhalt ist bereits getestet**: `clipboard.spec.ts:123`
  (`ControlOrMeta+v`), `clipboard-roundtrip.spec.ts`. Das ist der einzige belegte Teil von
  „Einfügen" (deckt sich mit `einfuegen-req.md` 0.1).
- Tests real: `clipboard-privacy.test.ts`, `clipboard.test.ts`, `commands.test.ts`,
  `cross-format-clipboard-content.test.ts`, `docx/__tests__/cut-roundtrip.test.ts`,
  `odt/__tests__/cut-roundtrip.test.ts`.
- Cross-Format-Rundreise ist bereits als **`test.fixme`** hinterlegt
  (`clipboard-roundtrip.spec.ts:134–145`, „blocked — no export-format picker exists yet") —
  d. h. `einfuegen-req.md` 5.3 („zurückgestellt bis `speichern-unter-format`") ist im Code
  schon so kodiert und ist zu **spiegeln**, nicht zu „erfüllen".

### 0.3 Was für „Einfügen" selbst weiterhin FEHLT (per Grep/Glob verifiziert)

Grep über `src` nach `isEmbeddableImageSrc|imageFallback|createPastePlugin|pasteAsPlainText|
transformPastedHTML|clipboardTextParser|handlePaste|handleDrop` → **kein Treffer**. Konkret:

- **Kein Paste-Plugin, keine Paste-`EditorProps`.** Die in diesem Plan vorgesehenen Module
  `src/formats/shared/editor/paste.ts` und `src/formats/shared/imageFallback.ts` existieren
  noch nicht.
- **Kein Einfügen-Toolbar-Button** in `Toolbar.tsx` (Buttons: Ausschneiden, Absatzformat,
  F/K/U/S, Text-/Hervorhebungsfarbe, Ausrichtung, Listen, Tabelle 277–289, Bild 291–294;
  `handleImagePick` 124–135).
- **Keine Klartext-Semantik** (Leerzeile vs. `hard_break`), keine HTML-Bereinigung, kein
  Bild-Blob-Paste (`image/*` ohne HTML), kein „Einfügen ohne Formatierung".

### 0.4 LIVE-BUG bestätigt: Export bricht bei nicht-`data:`-Bildquelle ab

Reproduzierbar **unabhängig** von Einfügen, aber genau der Zustand, den die naheliegendste
Paste-Umsetzung erzeugen würde. Belegkette mit **korrigierten** Zeilennummern:

- `src/formats/shared/schema.ts:67–80` — `image.parseDOM` übernimmt `img[src]`
  **ungefiltert** (`src: el.getAttribute('src')`), unabhängig vom URL-Schema.
- `src/formats/docx/writer.ts:74–94` (`imageParagraphXml`), Aufruf `images.add(src)` in
  **Zeile 76** — ungeprüft.
- `src/formats/odt/writer.ts:176–183` (`case 'image'` in `blockToOdt`), Aufruf
  `images.add(src)` in **Zeile 178** — ungeprüft.
- `src/formats/docx/imageCollector.ts:20` und `src/formats/odt/imageCollector.ts:19` —
  `ImageCollector.add` matcht `src` gegen `/^data:([^;]+);base64,(.*)$/s` und **wirft**
  `„Bilder müssen als data-URL vorliegen, um eingebettet zu werden."`, sonst.
- `src/app/DocumentWorkspace.tsx:68–95` (`handleExport`) fängt die Exception ab und zeigt sie
  sichtbar (`setExportError`, 89–90; Render `exportError` in Zeile 123) — das Dokument bleibt
  aber bis zur manuellen Entfernung des Bild-Knotens **dauerhaft nicht mehr exportierbar**.
- Verifiziert: `isEmbeddableImageSrc`/`imageFallback` existieren **nirgends** in `src`.

Heute nur über künstlich konstruiertes `ProseMirrorJSON` erreichbar (der App-eigene Bildweg
`Toolbar.tsx:124–135` nutzt immer `FileReader.readAsDataURL`, liefert also stets `data:`).
**Sobald Paste/Drop ein externes `<img src="https://…">` durch `schema.ts`s bestehende Regel
laufen lässt, wird der Bug bei jedem Web-Copy-Paste ausgelöst.** Behebung ist Teil dieses
Tickets (`einfuegen-req.md` 0.7/3.12, Freigabevoraussetzung).

### 0.5 Re-Verifikation 2026-07-05 — was seit Rev. 2 driftete (und was nicht)

Punktuelle Nachprüfung jeder in diesem Plan referenzierten Datei/Symbol. **Unverändert
gültig** (keine Anpassung nötig, gegen Ist-Stand bestätigt):

- `schema.ts` — alle Belege stimmen weiter: `heading.content='inline*'` (**28**),
  `image.parseDOM`/`img[src]` ungefiltert (**67–80**, `src` in **73**), `unsupported_block`
  (**92–113**), `bullet_list`/`ordered_list` `group:'block'` (**115**/**124**),
  `list_item.content='block+'` (**147**), `cellContent:'block+'` via `tableNodes` (**154**).
  ⇒ Abschnitt 4 („keine Schema-Änderung") steht.
- `docx/writer.ts` — `imageParagraphXml` (**74–94**), ungeprüftes `images.add(src)` in **76**.
  `odt/writer.ts` — `case 'image'` (**176–183**), ungeprüftes `images.add(src)` in **178**.
  Beide Writer importieren **kein** `prosemirror-*`/React (nur `jszip` + lokale Module) ⇒
  der Dependency-Schnitt aus 2.5 gilt, `imageFallback.ts` gehört nach `shared/`, nicht
  `shared/editor/`.
- `docx/imageCollector.ts:20` und `odt/imageCollector.ts:19` werfen weiterhin
  „Bilder müssen als data-URL vorliegen…" ⇒ Live-Bug 0.4 real, Export-Härtung (Abschnitt 6)
  bleibt Freigabevoraussetzung.
- `DocumentWorkspace.tsx` — `handleExport` (**68–95**), `setExportError` in **90**, sichtbarer
  `exportError`-Render in **123**.
- `clipboard-privacy.test.ts` — verbietet `navigator.clipboard` weiter statisch in ganz `src`;
  einziger Treffer im `src` sind die **Kommentar**-Zeilen von `clipboard.ts` (durch
  `stripComments` neutralisiert) ⇒ Test grün. `paste.ts`/`imageFallback.ts`/`clipboardRead.ts`
  weiter nicht existent (Glob leer).
- `playwright.config.ts` — `testMatch:/clipboard.*\.spec\.ts/` in **44**/**51**;
  `Tablet` (`iPad Mini`) **ohne** `permissions` (**36**), `Desktop Chrome`/`Mobile` **mit**
  (**34**/**35**) ⇒ Namenskonvention `clipboard-paste.spec.ts` (8.2) bleibt zwingend.
- `clipboard-roundtrip.spec.ts` — Cross-Format-`test.fixme` (**134–145**); zusätzlich ein
  Tab-Zeichen-`test.fixme` (**247**). `selection-regression.spec.ts` — der Kopieren-Regressions-
  fall steht in **88–110**.

**Korrigiert gegenüber Rev. 2** (nur diese Punkte, oben in den betroffenen Abschnitten
eingearbeitet):

1. **Überholte Empfehlung → jetzt Wiederverwendung.** `WordEditor.tsx` besitzt inzwischen
   einen extrahierten `useAutoDismiss(value, setValue, ms=4000)`-Helper (**52–63**, aufgerufen
   in **74** für `cutError`). Die Rev.-2-Formulierung in 5.3 („`useEffect` generalisieren oder
   zweiten ergänzen … bevorzugt eine kleine Hilfsfunktion") ist damit erledigt: `pasteNotice`
   ruft schlicht **denselben** Helper auf — eine Zeile, kein neuer Effekt.
2. **Verschobene Zeilennummern `WordEditor.tsx`** (der Helper wurde herausgezogen): Keymap
   **85–107** (statt 77–99), Keymap-Kommentar **86–92** (statt 78–84), Plugin-Array **83–114**
   (statt 75–106), `cutError`-State **71** (statt 58), `dispatchTransaction` **125–132** (statt
   117–124). `reconcileSelectionOnClick` unverändert **43–50**.
3. **`Toolbar` bekommt `cutError`/`setCutError` als Props** (Signatur `Toolbar.tsx:22–26`,
   Render des roten Hinweises **157–161**). Für `pasteNotice` bestehen damit zwei saubere
   Optionen — beide privacy-neutral (siehe 5.3): entweder als **Prop an `Toolbar`**
   durchreichen (konsistent mit `cutError`) **oder** als volle Statuszeile **unter** der
   Toolbar in `WordEditor.tsx` rendern. Dieser Plan wählt Letzteres (volle Breite, amber,
   `role="status"`), weil ein externes Bild eine dokumentweite Info ist, kein Toolbar-lokaler
   Fehler.
4. **`clipboard-privacy.test.ts`-Zeilen** (Abschnitt 1): `ALLOWED` in **32** (statt 23),
   `stripComments` **43–45** (statt 34–36).
5. **Datei-Verweisfehler behoben** (3.3 / Abschnitt 9, Zeile 18): die Konstante
   `SKIP_WEBKIT_ROUNDTRIP` ist in **`clipboard.spec.ts:83`** definiert (dort mehrfach genutzt).
   In `clipboard-roundtrip.spec.ts` steht der WebKit-Skip nur als inline-String
   (Zeilen **32/85/150/264**), **nicht** als benannte Konstante.
6. **Kontextmenü-Guard-Zeilen**: der Regressionstest „natives Kontextmenü wird von keinem
   App-Handler unterdrückt" steht aktuell in `clipboard.spec.ts` **~129–143** (MouseEvent +
   `defaultPrevented`-Check **135–141**), früher als „130–142" zitiert.

### 0.6 Neu für Rev. 4: Verifikation gegen den tatsächlichen `prosemirror-*`-Bibliothekscode

Rev. 3 leitete das Verhalten von `transformPasted`/`clipboardTextParser`/`handleDrop` allein
aus den öffentlichen `.d.ts`-Signaturen und aus Analogieschlüssen ab. Für Rev. 4 wurde
zusätzlich der tatsächliche Quellcode in `node_modules/prosemirror-view/src/{clipboard,
input}.ts` und `node_modules/prosemirror-model/src/from_dom.ts` gelesen (Version wie in
`package-lock.json` installiert). Vier Befunde ändern den Plan konkret:

1. **Mark-Vererbung bei Klartext-Einfügen ist heute Bibliotheks-Default, kein Zufall.**
   `prosemirror-view/src/clipboard.ts:55–64` — wenn kein eigener `clipboardTextParser`
   greift, baut ProseMirror die Absätze aus reinem Text selbst und ruft dabei explizit
   `let marks = $context.marks()` und dann `schema.text(block, marks)` auf **jeden** so
   erzeugten Textknoten auf (Zeile 59/64). Das ist der Mechanismus hinter Anforderung
   3.3/Grenzfall 21 („Standard-Strg+V erbt die umgebenden Marks") — er existiert **schon
   heute**, ganz ohne eigenen Code. **Konsequenz:** Sobald `paste.ts` einen eigenen
   `clipboardTextParser` registriert (5.2), tritt genau dieser Default-Zweig **nicht mehr**
   in Kraft (`clipboard.ts:55–58`: `if (parsed) { slice = parsed }` — der eigene Parser
   gewinnt vollständig und unwiderruflich). Repliziert `plainTextClipboardParser` die
   Mark-Übernahme nicht selbst, **regressiert** die eigene Umsetzung genau das Verhalten, das
   sie laut Anforderung erhalten soll. Das war in Rev. 3 nicht spezifiziert (5.2 gab nur eine
   Signatur ohne Implementierungsdetail) — korrigiert in 5.2 unten.
2. **`clipboardTextParser`/`transformPasted` haben einen dritten `plain`-Parameter.**
   Die tatsächlichen `EditorProps`-Typen (`prosemirror-view/src/index.ts:715/720`):
   `clipboardTextParser?: (text, $context, plain: boolean, view) => Slice` und
   `transformPasted?: (slice, view, plain: boolean) => Slice`. `plain` ist dabei **nicht**
   „Nutzer hat Strg+Umschalt+V gedrückt", sondern ProseMirrors eigenes, breiteres Signal
   „kein HTML vorhanden **oder** der native Shift-Heuristik-Fall aus Punkt 3 unten" — für
   3.3 bleibt deshalb weiterhin ein eigenes, präziseres Flag nötig (siehe 5.2), aber die
   Funktionssignaturen müssen den dritten Parameter kennen, sonst entsteht ein
   TS-Typfehler bei `npm run build` (`tsc -b`, Anforderung 8.3).
3. **Strg/Cmd+Umschalt+V wird von `prosemirror-view` bereits nativ als „bevorzugt Klartext"
   erkannt — ganz ohne eigenen Code.** `prosemirror-view/src/input.ts:679` (Paste-Handler)
   und `:716` (Drop-Handler init für den `paste`-DOM-Event-Zweig): `let plain =
   view.input.shiftKey && view.input.lastKeyCode != 45` (45 = Insert-Taste, damit
   Umschalt+Einfg — der klassische Windows-Einfügen-Shortcut — **nicht** fälschlich als
   „Klartext gewünscht" gewertet wird). `view.input.shiftKey` wird von `prosemirror-view`
   selbst über eigene `keydown`/`keyup`-Listener geführt (`input.ts:109/140/282`) — **bevor**
   unser Plugin überhaupt ins Spiel kommt. Bei aktivem `shiftKey` wird `parseFromClipboard`
   mit `plainText=true` aufgerufen, wodurch `asText = true` wird (`clipboard.ts:47`) —
   **unabhängig davon, ob `text/html` im Clipboard vorhanden ist**: das native
   `transformPastedHTML` wird für einen Strg+Umschalt+V-Paste dann **gar nicht erst
   aufgerufen**, weil der HTML-Zweig komplett übersprungen wird. **Konsequenz für 3.3:**
   Der in Rev. 3 geplante eigene `keydown`-Listener (der ein `plainPasteUntil`-Flag setzt)
   bleibt nötig — aber **nur noch** für den zusätzlichen Schritt „Marks entfernen +
   nicht-erste Blöcke zu `paragraph` reduzieren" (`stripToPlainText`), **nicht** mehr dafür,
   das HTML zu unterdrücken — das erledigt `prosemirror-view` bereits selbst, zuverlässiger
   als es ein eigener DOM-`keydown`-Listener könnte (kein Race zwischen „Listener hat gefeuert"
   und „Paste-Event kommt an", weil beide auf demselben internen `view.input`-Zustand
   basieren). Macht 3.3 einfacher und robuster als in Rev. 3 angenommen — **zu testen, nicht
   nur zu behaupten** (8.2, neuer Testfall).
4. **Grenzfälle 20/22/23 sind teils schon strukturell abgedeckt, ohne dass Rev. 3 das
   festgestellt hätte** (Rev. 3 erwähnte diese drei Fälle gar nicht, weil `einfuegen-req.md`
   zum Zeitpunkt von Rev. 3 noch bei 19 Grenzfällen stand):
   - **Grenzfall 23 (leere Zwischenablage):** `parseFromClipboard` bricht bereits mit
     `if (!html && !text) return null` ab (`clipboard.ts:46`); unser eigener `handlePaste`
     (5.2) findet ohne `text/html` und ohne Bild-Datei ebenfalls nichts und liefert `false`
     zurück ⇒ die gesamte Kette bleibt ein sauberer No-Op. Kein neuer Code nötig, nur ein
     Test.
   - **Grenzfall 22, Teilfall „nur `text/uri-list`, kein `File`":** `getText()`
     (`input.ts:701–705`) fällt bereits selbst auf `text/uri-list` zurück, wenn weder
     `text/plain` noch `Text` gesetzt ist (Zeilenumbrüche werden durch Leerzeichen ersetzt)
     — der resultierende String läuft dann als gewöhnlicher Klartext durch **denselben**
     `clipboardTextParser`-Pfad wie ein normaler Text-Drop. Der geplante `handleDrop` (5.2)
     gibt für einen Drop ohne `File` ohnehin `false` zurück und blockiert diesen Fallback
     nicht. **Teilfall „zusätzlich `text/html` vorhanden":** läuft stattdessen durch den
     normalen HTML-Zweig inkl. `sanitizePastedHtml`/Bild-Fallback (3.4/3.12) — beide in der
     Anforderung genannten Alternativen sind damit strukturell abgedeckt; **zu verifizieren
     per Test, nicht anzunehmen** (8.2, neuer Testfall).
   - **Grenzfall 20 (Hyperlink ohne Link-Mark):** `prosemirror-model/src/from_dom.ts`,
     `NodeContext.addElement` (~481–518): für ein Tag ohne passende `parseDOM`-Regel
     (`<a>` hat im Schema keine) und außerhalb der hartkodierten `ignoreTags`-Liste
     (`head/noscript/object/script/style/title`, `from_dom.ts:325–327` — `a` ist **nicht**
     darin) wird der `!rule`-Zweig genommen: der Inhalt wird **transparent** in den
     umgebenden Kontext übernommen (`readStyles` liest nur erkannte Inline-Styles,
     `href`/`onclick` werden nie zu Attributen eines erzeugten Knotens). Ergebnis: sichtbarer
     Linktext bleibt, die Verlinkung entfällt — exakt das in Grenzfall 20 geforderte
     Verhalten, **schon heute, ganz ohne Schema- oder Sanitizer-Änderung**. Bonus-Erkenntnis:
     `object`/`script`/`style` werden von ProseMirrors Default-Parser bereits vollständig
     samt Inhalt verworfen (`ignoreTags`), was die Sicherheitsargumentation aus Abschnitt 7
     stützt, sie aber **nicht** ersetzt (der eigentliche Rest-Risiko-Fall — `onerror` auf
     einem erkannten `img[src]`-Tag — wird nicht durch dieses Default-Verhalten, sondern
     erst durch `sanitizePastedHtml` neutralisiert, siehe Abschnitt 7). **Zu verifizieren per
     Test, nicht anzunehmen** (8.2, neuer Testfall).
   - **Grenzfall 21 (Mark-Übernahme):** siehe Punkt 1 oben — hängt direkt an der
     `plainTextClipboardParser`-Korrektur und braucht **aktive** Umsetzung, ist also der
     einzige der vier neuen Grenzfälle, der ohne Code-Anpassung tatsächlich **brechen**
     würde.

   Vollständig eingearbeitet in Abschnitt 9 (Tabelle jetzt „alle 23" statt „alle 19") und in
   die Testpläne 8.1/8.2.

---

## 1. ENTSCHEIDENDE Vorab-Entscheidung: `navigator.clipboard` vs. `clipboard-privacy.test.ts`

`einfuegen-req.md` 3.10/0.6/8.2-#1 verlangt, dass **vor** dem Coden verbindlich entschieden
wird, ob `navigator.clipboard` verwendet wird. Der Grund ist ein realer, heute grüner Test:

`src/formats/shared/editor/__tests__/clipboard-privacy.test.ts` liest **alle** `.ts/.tsx`
unter `src`, entfernt Kommentare (`stripComments`, Zeilen 43–45) und **schlägt fehl**, sobald
irgendeine Datei außer sich selbst den String `navigator.clipboard` enthält. Ausnahmeliste
`ALLOWED` (Zeile 32) enthält aktuell **nur** die Testdatei selbst (0 legitime Treffer).

Die erste Fassung dieses Plans nutzte `navigator.clipboard.readText()` (für „Einfügen ohne
Formatierung") **und** `navigator.clipboard.read()` (für den Toolbar-Button). **Beides würde
diesen Test rot machen** und damit gegen `einfuegen-req.md` 8.3 (alle Tests grün) sowie 3.10
(kein stillschweigendes Aushebeln) verstoßen. Das ist der wichtigste Fehler der ersten Fassung.

### 1.1 Verbindliche Entscheidung (P0)

**Für die Freigabe von `einfuegen` (P0) wird `navigator.clipboard` NICHT verwendet
(Weg 1 aus `einfuegen-req.md` 3.10).** Damit bleibt `clipboard-privacy.test.ts` **unverändert
grün** und die Invariante (Zwischenablageninhalt wird nur lokal ins Dokument eingefügt,
niemals protokolliert/persistiert/übertragen) bleibt voll erhalten.

- **Standard-Einfügen (Strg+V, Kontextmenü):** läuft ohnehin über den nativen Paste-Event —
  kein `navigator.clipboard`.
- **„Einfügen ohne Formatierung" (Strg+Umschalt+V):** wird ebenfalls über den **nativen
  Paste-Event** realisiert (siehe 3.3), **nicht** über `navigator.clipboard.readText()`. Ein
  per `keydown` gesetztes „Plain-Modus"-Flag steuert `transformPasted` so, dass sämtliche
  Marks entfernt und alle Nicht-Erst-Blöcke zu `paragraph` reduziert werden. Der native
  Paste-Event liefert die Daten — kein skriptbarer Clipboard-Zugriff nötig.

### 1.2 Konsequenz für die optionalen Toolbar-Buttons (#4/#5, P1)

Ein Toolbar-**Klick** kann die Zwischenablage technisch **nur** über `navigator.clipboard.read()/
readText()` lesen (`document.execCommand('paste')` ist in Browsern aus Sicherheitsgründen
blockiert — anders als das für Ausschneiden genutzte `execCommand('cut')`). Diese Buttons sind
laut Anforderung **Nice-to-have, kein Blocker** und daher **P1**. Werden sie später umgesetzt,
gilt Weg 2 aus 3.10, eng und begründet:

1. Den einen lesenden Aufruf in eine **eigene, minimale** Datei kapseln (z. B.
   `src/formats/shared/editor/clipboardRead.ts`), diese in die `ALLOWED`-Liste von
   `clipboard-privacy.test.ts` aufnehmen **mit begründendem Kommentar**.
2. Zusätzlich einen Test ergänzen, der belegt, dass der gelesene Wert ausschließlich per
   `view.dispatch` ins Dokument fließt und **nirgends** geloggt/persistiert/gesendet wird.

Da #4/#5 **außerhalb** der P0-Abnahme liegen, bleibt die Datenschutz-Invariante für das
tatsächliche Release von `einfuegen` **unangetastet**. Das ist die Antwort auf die offene
Frage `einfuegen-req.md` 8.2-#1.

---

## 2. Architektur-Entscheidung & Leitplanken

1. **Neues Modul `src/formats/shared/editor/paste.ts`** bündelt die gesamte Einfügen-/Drop-
   Logik als ProseMirror-Plugin + reine Hilfsfunktionen. `WordEditor.tsx` bindet nur ein —
   analog `pagination.ts` → `createPaginationPlugin()`.
2. **Kein globaler `document`-Listener.** Alle Logik hängt an ProseMirror-`EditorProps`
   (`handlePaste`, `handleDrop`, `transformPastedHTML`, `transformPasted`,
   `clipboardTextParser`) plus **einem** `keydown`-Listener auf `view.dom` (Plain-Modus-Flag,
   siehe 3.3). Damit ist Grenzfall 10 (Paste in einem anderen Feld darf das Dokument nicht
   ändern) strukturell erfüllt; verifiziert, dass die App außer dem versteckten Datei-Input
   kein weiteres Texteingabefeld hat (`DocumentWorkspace.tsx`/`FormatPicker.tsx`).
3. **Kein `contextmenu`-`preventDefault()`.** Natives Kontextmenü bleibt erreichbar; der
   bestehende Regressionstest (`clipboard.spec.ts:~129–143`) bleibt gültig und muss grün
   bleiben.
4. **Schema-Erweiterungen sind nicht nötig** (Detailbegründung Abschnitt 4).
5. **`imageFallback.ts` lebt dependency-frei in `src/formats/shared/`** (nicht in
   `shared/editor/`). Grund: die Writer (`docx/writer.ts`, `odt/writer.ts`) importieren
   **keinerlei** `prosemirror-model`/`-view`/React (verifiziert: nur `jszip`, lokale
   `xmlUtil`/`styleRegistry`/`imageCollector`/`documentModel`-**Typen**). `imageFallback.ts`
   darf diesen Schnitt nicht brechen: es exportiert nur reine Funktionen und wird von
   `paste.ts` **und** beiden Writern importiert. `paste.ts` dagegen bringt zwangsläufig
   `prosemirror-model` mit — deshalb liegt der Fallback bewusst getrennt.
6. **Bestehendes Feedback-Muster wiederverwenden.** `WordEditor.tsx` hat bereits einen
   sichtbaren, **automatisch nach 4000 ms verschwindenden** Hinweis-Kanal: den `cutError`-State
   (Zeile 71) plus den **inzwischen extrahierten** `useAutoDismiss`-Helper (Zeilen 52–63,
   aufgerufen in 74), gerendert in `Toolbar.tsx:157–161` als `role="alert"`. Die Paste-
   Rückmeldung nutzt **dasselbe Muster** (eigener `pasteNotice`-State, `role="status"` in
   Amber) und **denselben `useAutoDismiss`-Helper** — kein zweiter Effekt, kein neues Banner
   mit manuellem Schließen-Button.

---

## 3. Verbindliche Design-Entscheidungen zu offenen Fragen der Spezifikation

### 3.1 Klartext-Zeilenumbrüche (Anforderung 3.3)
- **Leerzeilen-getrennte Blöcke → eigener `paragraph`.**
- **Einzelner Zeilenumbruch innerhalb eines Blocks → `hard_break`**, kein neuer Absatz.
- `\r\n`/`\r` werden vor der Aufteilung normalisiert. `\t` bleibt unangetastet (Grenzfall 6).
- Ersetzt ProseMirrors Bibliotheks-Default (jeder `\n` ⇒ eigener Absatz) durch eine eigene
  `clipboardTextParser`-Implementierung. Diese Wahl erfüllt 3.1 und 3.3 widerspruchsfrei: ein
  Klartext-Paste **ohne** Leerzeile mitten in einen Absatz fügt reinen Inline-Inhalt ein.

### 3.2 Bilder mit externer URL beim Einfügen (Anforderung 3.4/3.5/3.12)
- **Kein Netzwerk-Fetch/Einbettung.** `fetch()` scheitert meist an CORS und würde eine
  synchrone Nutzeraktion von Netzwerklaufzeit abhängig machen (Grenzfall 4: „UI friert nicht
  ein").
- **Fallback:** `<img>` wird durch sichtbaren Platzhaltertext ersetzt (`imageFallbackText`):
  `[Bild: <alt>]` falls `alt`, sonst `[Bild nicht eingebettet]`. Umgebender Text bleibt
  vollständig erhalten. Zusätzlich sichtbarer, nicht-blockierender `pasteNotice` (Anforderung
  3.9).
- **Verteidigung in der Tiefe:** unabhängig davon wird der Export gehärtet (Abschnitt 6),
  damit ein nicht-`data:`-Bild **niemals** den Export abbricht — egal über welchen Pfad der
  Knoten entstand.

### 3.3 „Einfügen ohne Formatierung" (Anforderung 3.7, Slug `einfuegen-unformatiert`) — OHNE `navigator.clipboard`
- **Mechanismus (deterministisch, Privacy-konform) — vereinfacht gegenüber Rev. 3, siehe 0.6
  Punkt 3:** `prosemirror-view` erkennt Strg/Cmd+Umschalt+V bereits **selbst**
  (`input.ts:679/716`: `view.input.shiftKey && view.input.lastKeyCode != 45`) und ruft
  `parseFromClipboard` dafür mit `plainText=true` auf, wodurch `asText=true` wird
  (`clipboard.ts:47`) — der `text/html`-Zweig (und damit `transformPastedHTML`) wird für diese
  Tastenkombination **gar nicht erst erreicht**, unabhängig von unserem eigenen Code. Das
  eigene Plugin muss deshalb nur noch die **zusätzliche** Anforderung aus 3.7 umsetzen (jede
  Zeichenformatierung entfernen, nicht nur HTML ignorieren):
  1. Ein `keydown`-Capture-Listener auf `view.dom` erkennt dieselbe Kombination
     `(ctrlKey || metaKey) && shiftKey && key ∈ {v, V}` und setzt ein Flag mit Zeitfenster
     (`plainPasteUntil = Date.now() + 1000`). Er ruft **kein** `preventDefault()` auf — der
     native Paste-Event (der ohnehin schon im `asText`-Zweig landet, siehe oben) läuft normal
     weiter.
  2. `transformPasted(slice, view, plain)` (dritter Parameter laut tatsächlicher
     `prosemirror-view`-Signatur, 0.6 Punkt 2) prüft **unser eigenes** Flag — **nicht** den von
     ProseMirror übergebenen `plain`-Parameter, der auch für ein reines Klartext-Clipboard ohne
     jede Sondertaste `true` wäre (0.6 Punkt 2) und damit Grenzfall 21 fälschlich mit-treffen
     würde. Ist unser Flag aktiv, wird der Slice „geplättet" (`stripToPlainText`): **alle Marks
     entfernt**, jeder `heading` (und sonstiger nicht-`paragraph`-Textblock) zu `paragraph`
     konvertiert. Danach wird das Flag zurückgesetzt, um eine unmittelbar folgende normale
     Einfügung nicht zu beeinflussen.
  3. **Korrektur gegenüber Rev. 3:** der reine `text/plain`-Pfad ist **nicht** grundsätzlich
     markenfrei — im Normalfall (Plain-Modus-Flag **inaktiv**) übernimmt `clipboardTextParser`
     bewusst die am Cursor aktiven Marks (siehe 5.2, deckt Grenzfall 21). Erst wenn das eigene
     Plain-Modus-Flag aktiv ist, entfernt `stripToPlainText` diese Marks wieder. Der Slice sorgt
     über offene Ränder dafür, dass **nur der erste** Block den Blocktyp der Zielposition
     übernimmt, alle weiteren werden `paragraph` (einzige widerspruchsfreie Lesart des Singular
     „Absatzformat der Zielposition"; entspricht Word/LibreOffice).
- **Kein neues, konsumierendes Keymap-Binding.** `Mod-Shift-v` wird **nicht** an ein Command
  gebunden, das den Event verschluckt — sonst unterbliebe der native Paste. Das Flag wird rein
  über den `keydown`-Listener gesetzt. (Der Keymap-Kommentar in `WordEditor.tsx:86–92` bleibt
  respektiert: weder `Mod-v` noch `Mod-c`/`Mod-x` werden angefasst.)
- **Browser-/Automatisierungsgrenze:** In Chromium/Firefox feuert Strg+Umschalt+V zuverlässig
  einen Paste-Event, und `view.input.shiftKey` wird zuverlässig gesetzt (interner
  `prosemirror-view`-Zustand, kein eigener Timing-abhängiger Code). In WebKit/Safari ist das
  Verhalten inkonsistent und in Playwright nicht zuverlässig treibbar — dieselbe Klasse
  dokumentierter Grenzen wie beim bestehenden `SKIP_WEBKIT_ROUNDTRIP` (Konstante in
  **`clipboard.spec.ts:83`**; in `clipboard-roundtrip.spec.ts` steht derselbe Skip als
  inline-String in Zeilen 32/85/150/264). Wird dokumentiert, nicht verschwiegen. Der
  (P1-)Toolbar-Button (#5) wäre die WebKit-freundliche Alternative — dann jedoch mit
  `navigator.clipboard` und der Privacy-Regelung aus 1.2.
- Leere Zwischenablage ⇒ nativer No-Op (Ausnahme 3.9, Grenzfall 23 — strukturell bereits durch
  `parseFromClipboard`s `if (!html && !text) return null` gesichert, siehe 0.6 Punkt 4). Kein
  `navigator.clipboard`-Zugriff ⇒ kein „Berechtigung verweigert"-Fall auf diesem Pfad.

### 3.4 Toolbar-Buttons „Einfügen"/„Einfügen ohne Formatierung" (Anforderung 1 #4/#5)
Explizit **Nice-to-have, kein Blocker**. Eingeordnet als **P1** (Abschnitt 5.4), nicht
Voraussetzung für die P0-Abnahme von `einfuegen`. Benötigen `navigator.clipboard` ⇒ Privacy-
Regelung 1.2.

### 3.5 Kontextmenü (Anforderung 1 #2)
**Kein eigenes Kontextmenü.** Natives Menü bleibt. Regressionsschutz besteht bereits
(`clipboard.spec.ts:~129–143`) und bleibt Teil der Suite.

---

## 4. ProseMirror-Schema — Detailplan

**Keine Änderung an `src/formats/shared/schema.ts` nötig.** Belegt (Zeilen korrigiert):

- **Verschachtelte Listen:** `list_item.content = 'block+'` (**Zeile 147**, bewusst so, siehe
  Kommentar 139–145 — **nicht** `paragraph block*`, das war eine Falschangabe der ersten
  Fassung), `bullet_list`/`ordered_list` sind `group: 'block'` (115/124). Eine eingefügte
  `<ul><li>…<ul>…</ul></li></ul>`-Struktur passt ProseMirrors Slice-„Fit" automatisch ein.
- **Tabellenzellen:** `cellContent: 'block+'` aus `tableNodes({ tableGroup: 'block', … })`
  (Zeile 154) erlaubt beliebige Block-Inhalte inkl. verschachtelter `table` — Grenzfall 7
  („kein Absturz") strukturell erfüllt; „lesbar" separat per Test.
- **Überschrift:** `heading.content = 'inline*'` (**Zeile 28**). Mehrabsätziger Paste in eine
  Überschrift spaltet automatisch auf (Rest → nachfolgender Absatz). **Per Test zu
  verifizieren** (8.2), nicht annehmen.
- **`unsupported_block`** (Zeilen 92–113, `div[data-unsupported-kind]`, `content: 'block+'`):
  neu seit der ersten Fassung. Konsequenz für Paste: fremdes `text/html` enthält praktisch nie
  `data-unsupported-kind` (das ist ein App-internes Attribut) — der Fall ist unkritisch, wird
  aber in `sanitizePastedHtml` nicht gesondert behandelt (kein aktiver Inhalt).

Deckt ein Test hier ein Fehlverhalten auf, ist das ein Nachtrag, kein vorab angenommener Fakt.

---

## 5. Datei-für-Datei-Umsetzungsplan

### 5.1 NEU: `src/formats/shared/imageFallback.ts`

Dependency-frei, von `paste.ts` **und** beiden Writern importiert (Begründung 2.5).

```ts
/** Platzhaltertext, wenn ein Bild nicht eingebettet werden kann, weil sein `src`
 *  keine `data:`-URL ist (externes HTTP(S)-Bild aus Paste/Drop o. Ä.). Einzige
 *  Quelle der Wahrheit für den Paste-Hinweis UND den DOCX/ODT-Export-Fallback. */
export function imageFallbackText(alt: string | null | undefined): string {
  const trimmed = (alt ?? '').trim()
  return trimmed ? `[Bild: ${trimmed}]` : '[Bild nicht eingebettet]'
}

/** True für genau die `src`-Werte, die ImageCollector.add() beider Formate akzeptiert. */
export function isEmbeddableImageSrc(src: string): boolean {
  return /^data:[^;]+;base64,/i.test(src)
}
```

`isEmbeddableImageSrc` ist die **einzige** Prüfregel für „ist dieses `src` einbettbar" —
verwendet von `paste.ts` und beiden Writern, damit dieselbe Regel nicht an vier Stellen
divergiert. (Das Regex ist bewusst etwas lockerer als das `DATA_URL_PATTERN` der Collectoren,
prüft aber genau deren notwendige Vorbedingung `^data:…;base64,`.)

### 5.2 NEU: `src/formats/shared/editor/paste.ts`

Zentrales Modul. Exportierte Bausteine (Signaturen verbindlich, Implementierung in Prosa
darunter):

```ts
import { Slice, Fragment, type ResolvedPos, type Schema } from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { wordSchema } from '../schema'
import { imageFallbackText, isEmbeddableImageSrc } from '../imageFallback'

/** Rein: teilt Klartext in Absätze (leerzeilengetrennt) aus Zeilen (einfach-umbruch-
 *  getrennt). Ohne ProseMirror-Typen — unabhängig unit-testbar. */
export function splitPlainTextIntoParagraphs(text: string): string[][] {
  return text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((block) => block.split('\n'))
}

/** clipboardTextParser: baut den einzufügenden Slice (3.1). Ein Chunk ⇒ rein-inline,
 *  randoffen (verschmilzt mit dem umgebenden Absatz), `hard_break` je Einzelumbruch.
 *  Mehrere Chunks ⇒ mehrere `paragraph`, Ränder offen.
 *
 *  KORREKTUR Rev. 4 (0.6 Punkt 1): jeder erzeugte Textknoten bekommt `$context.marks()`
 *  als Marks mitgegeben — genau der Mechanismus, den `prosemirror-view`s eigener Default
 *  ohne registrierten `clipboardTextParser` verwendet (`clipboard.ts:59/64`,
 *  `schema.text(block, marks)`). Registriert dieses Modul einen eigenen Parser, greift
 *  jener Default-Zweig **nicht mehr** (`clipboard.ts:56–58`: `if (parsed) slice = parsed`) —
 *  ohne diese Zeile würde Grenzfall 21 (Mark-Übernahme beim Klartext-Einfügen) regressieren.
 *  Im Plain-Modus (3.3/3.7) werden diese Marks anschließend von `stripToPlainText` wieder
 *  entfernt — die Reihenfolge (erst anreichern, dann ggf. strippen) hält beide Anforderungen
 *  in genau einer Code-Stelle auseinander, statt die Entscheidung zweimal zu treffen. */
export function plainTextClipboardParser(text: string, $context: ResolvedPos, schema: Schema): Slice

/** transformPastedHTML: entfernt aktive Inhalte (siehe Abschnitt 7) und ersetzt jedes
 *  <img> mit nicht-einbettbarem src durch imageFallbackText. Rest bleibt der bestehenden
 *  schema.ts-parseDOM überlassen. */
export function sanitizePastedHtml(html: string): string

/** transformPasted: Knoten-Ebene, Defense-in-Depth. Ersetzt jeden überlebenden
 *  nicht-einbettbaren `image`-Knoten durch einen `paragraph` mit Platzhaltertext (nicht
 *  durch bloßen `text`, da `image` `group:'block'` ist). Deckt den Drop-Pfad und jeden
 *  künftigen Pfad ab, der sanitizePastedHtml umgeht. */
export function sanitizePastedSlice(slice: Slice, schema: Schema): Slice

/** transformPasted im Plain-Modus (3.3): entfernt ALLE Marks und macht jeden Nicht-
 *  paragraph-Textblock zu `paragraph`. */
export function stripToPlainText(slice: Slice, schema: Schema): Slice

export interface PastePluginOptions {
  /** Sichtbare, nicht-blockierende Rückmeldung (3.9) — z. B. externes Bild ersetzt,
   *  Bild-Blob nicht dekodierbar. */
  onNotice: (message: string) => void
}

/** Das in WordEditor.tsx eingehängte Plugin. Enthält zusätzlich den keydown-Listener
 *  für den Plain-Modus (3.3) via `view`-Plugin-Hook (props.handleDOMEvents.keydown). */
export function createPastePlugin(options: PastePluginOptions): Plugin

/** Bild-Blob → data-URL → `image`-Knoten in EINER Transaktion (ein Undo-Schritt, 3.8).
 *  `at` ist für BEIDE Aufrufer (Paste **und** Drop) verpflichtend und wird vom jeweiligen
 *  `handlePaste`/`handleDrop`-Callback SYNCHRON, vor dem `await` auf den Data-URL, aus
 *  `view.state.selection`/`posAtCoords` ermittelt (siehe Korrektur unten) — `insertImageFile`
 *  liest die Zielposition selbst nie aus `view.state` zum Zeitpunkt der Auflösung, weil der
 *  Nutzer zwischen Auslösen und `FileReader`-Resultat weitergetippt/geklickt haben könnte
 *  (Grenzfall 9: „keine Race Condition mit der Selection-Sync-Logik"). `tr.replaceRangeWith`
 *  statt `tr.replaceSelectionWith`, damit eine seither veränderte `state.selection` die
 *  Einfügeposition nicht verfälscht. Attrs (`src`/`alt`) identisch zu
 *  `commands.ts::insertImage`, damit die Standardgröße gleich bleibt. */
export async function insertImageFile(view: EditorView, file: File, at: { from: number; to: number }): Promise<void>
```

Plugin-`props` (Kern):

```ts
props: {
  transformPastedHTML: (html) => sanitizePastedHtml(html),
  // Dritter Parameter `plainFromPM` ist ProseMirrors EIGENES, breiteres Signal (0.6 Punkt 2:
  // u. a. auch wahr für ein Clipboard ohne jedes HTML) — dafür wird bewusst NICHT dieser
  // Parameter, sondern unser eigenes, präziseres `plainModeActive()`-Flag befragt, sonst
  // würde jeder normale Klartext-Paste (Grenzfall 21) fälschlich in den Plain-Modus fallen.
  transformPasted: (slice, _view, _plainFromPM) =>
    plainModeActive() ? stripToPlainText(slice, wordSchema) : sanitizePastedSlice(slice, wordSchema),
  clipboardTextParser: (text, $context, _plainFromPM) => plainTextClipboardParser(text, $context, wordSchema),

  // 3.3: keydown setzt das Plain-Flag, OHNE preventDefault (nativer Paste läuft weiter).
  // Ergänzt (nicht ersetzt) prosemirror-views eigene Shift-Erkennung (0.6 Punkt 3): jene
  // sorgt bereits dafür, dass bei dieser Tastenkombination gar kein HTML gelesen wird; dieses
  // Flag steuert nur noch das zusätzliche Mark-/Blocktyp-Strippen in `transformPasted` oben.
  handleDOMEvents: {
    keydown(_view, event) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'v' || event.key === 'V')) {
        plainPasteUntil = Date.now() + 1000
      }
      return false
    },
  },

  // 3.5: reine Bild-Zwischenablage (kein text/html). Zielposition (die aktuelle Selektion)
  // wird HIER, synchron, eingefroren — nicht erst nach dem await in insertImageFile.
  handlePaste(view, event) {
    const dt = event.clipboardData
    if (!dt || dt.types.includes('text/html')) return false
    const file = Array.from(dt.items).find((i) => i.type.startsWith('image/'))?.getAsFile()
    if (!file) return false
    const { from, to } = view.state.selection
    insertImageFile(view, file, { from, to }).catch(() =>
      options.onNotice('Bild aus der Zwischenablage konnte nicht eingefügt werden.'))
    return true // synchron true; prosemirror-view ruft preventDefault() selbst auf
  },

  // 1 #6: reiner Datei-Drop (Text/HTML-Drops laufen bereits durch transformPasted[HTML]).
  // Der Ablegepunkt wird ebenfalls synchron aus dem DragEvent ermittelt, nicht erst später.
  handleDrop(view, event) {
    const dt = event.dataTransfer
    if (!dt || dt.files.length === 0 || dt.types.includes('text/html')) return false
    const file = Array.from(dt.files).find((f) => f.type.startsWith('image/'))
    if (!file) return false
    const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
    insertImageFile(view, file, { from: at, to: at }).catch(() =>
      options.onNotice('Bild konnte nicht eingefügt werden.'))
    return true
  },
}
```

**`plainPasteUntil`** ist eine modul-/closure-lokale `number`-Variable (kein persistenter
State, kein Logging von Inhalt). `plainModeActive()` = `Date.now() < plainPasteUntil`; nach dem
Verbrauch in `transformPasted` wird `plainPasteUntil = 0` gesetzt.

**`sanitizePastedHtml`/`sanitizePastedSlice`/`stripToPlainText`** nutzen `isEmbeddableImageSrc`
aus `../imageFallback` (kein zweites Regex). Details zur Sicherheit: Abschnitt 7.

**Wichtig (Regressionssicherheit):** `transformPasted`/`transformPastedHTML`/
`clipboardTextParser` greifen **nur beim tatsächlichen Einfügen** in `view.dom`, nie beim
Import/Anzeigen. Für **intern** kopierten Inhalt gewinnt der `text/html`-Pfad (Grenzfall 11);
dessen Bilder sind stets `data:` (einbettbar) und werden von den Sanitizern **nicht** angefasst
— daher bleibt `clipboard-roundtrip.spec.ts` grün (siehe Abschnitt 10).

### 5.3 GEÄNDERT: `src/formats/shared/editor/WordEditor.tsx`

- Import `createPastePlugin` aus `./paste`.
- Neuer Feedback-State analog `cutError` (Zeile 71):
  ```tsx
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)
  ```
  Auto-Dismiss: **den bereits vorhandenen** `useAutoDismiss`-Helper (Zeilen 52–63) einfach ein
  zweites Mal aufrufen — direkt neben dem bestehenden `useAutoDismiss(cutError, setCutError)`
  (Zeile 74):
  ```tsx
  useAutoDismiss(pasteNotice, setPasteNotice)
  ```
  (Rev.-2-Hinweis „useEffect generalisieren oder zweiten ergänzen" ist damit erledigt — der
  Helper existiert seit der Extraktion; **kein** neuer Effekt, keine Duplikation.)
- Plugin-Array (83–114) ergänzen um `createPastePlugin({ onNotice: setPasteNotice })`
  (sinnvoll neben `dropCursor()`/`gapCursor()` einordnen). Da `setPasteNotice` (useState-
  Setter) stabil ist, ist die Übergabe im einmaligen `useEffect` unproblematisch.
- **Keine** Ergänzung an der `keymap` (85–107) — Plain-Modus läuft über `handleDOMEvents.keydown`
  im Plugin (3.3), nicht über ein konsumierendes Binding.
- Render: Status-Region **unterhalb der Toolbar** (direkt nach dem `{viewRef.current &&
  <Toolbar … />}`-Aufruf in Zeile 170), nur wenn gesetzt:
  ```tsx
  {pasteNotice && (
    <div role="status" className="px-3 py-1.5 text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200">
      {pasteNotice}
    </div>
  )}
  ```
  `role="status"` (nicht `role="alert"` wie der rote `cutError`), da informativ, nicht
  blockierend — Export bleibt möglich (Bild wurde ja durch Platzhalter ersetzt). **Alternative**
  (gleichwertig, Privacy-neutral): `pasteNotice`/`setPasteNotice` analog `cutError`/`setCutError`
  als **Props an `Toolbar`** durchreichen (Signatur `Toolbar.tsx:22–26`) und dort rendern. Dieser
  Plan bevorzugt die volle Statuszeile unter der Toolbar, weil der häufigste Auslöser (externes
  Bild → Platzhalter) eine dokumentweite Info ist.
- **Keine Änderung** an `reconcileSelectionOnClick` (43–50): Paste läuft immer über eine
  reguläre, von `dispatchTransaction` (125–132) verarbeitete Transaktion — auch der asynchrone
  Bild-Zweig dispatcht am Ende normal. Der Selection-Sync-Bug entsteht nur bei DOM-Mutation
  **ohne** Transaktion; das ist hier nirgends der Fall. Ein Regressionstest bestätigt es
  trotzdem (8.2 #11).

### 5.4 GEÄNDERT (P1, optional): `src/formats/shared/editor/Toolbar.tsx`

Nicht erforderlich für die Freigabe von `einfuegen`. Falls umgesetzt (Datenschutz-Regelung
1.2 zwingend):

- Zwei Buttons „Einfügen"/„Einfügen ohne Formatierung" nach dem Muster der bestehenden
  (`handleImagePick`-Stil, 124–135).
- „Einfügen": liest über die gekapselte `clipboardRead.ts` (siehe 1.2) `ClipboardItem[]`,
  Priorität `text/html` → `text/plain` → `image/*`; HTML **durch `sanitizePastedHtml`** dann
  `DOMParser.fromSchema(wordSchema).parse(...)` (Wiederverwendung, keine zweite Sanitisierung),
  Klartext über `plainTextClipboardParser`, Bild über `insertImageFile`. Verweigerte
  Berechtigung → sichtbare Meldung (Pflicht laut Anforderung 1 #4).
- „Einfügen ohne Formatierung": setzt das Plain-Flag und liest analog; Ergebnis über
  `stripToPlainText`.
- Kein Klick-Handler darf still fehlschlagen (3.9).

### 5.5 `src/formats/shared/editor/commands.ts`
**Keine strukturelle Änderung.** `insertImage` (66–74) bleibt für den Datei-Auswahl-Weg.
`insertImageFile` in `paste.ts` erzeugt denselben `image`-Knoten (gleiche Attrs), nur über
`tr.replaceRangeWith(at.from, at.to, node)` statt `tr.replaceSelectionWith(node)` — sowohl weil
der Drop-Fall eine von `state.selection` abweichende Zielposition in **derselben** Transaktion
treffen muss (sonst zwei Undo-Schritte, Anforderung 3.8) als auch weil selbst der Paste-Fall die
Position **vor** dem asynchronen `FileReader`-Schritt einfrieren muss (5.2-Korrektur, Grenzfall
9) statt sie bei Auflösung erneut aus `view.state.selection` zu lesen. Kommen künftig Attribute
zu `insertImage` hinzu, ist `insertImageFile` synchron mitzupflegen (gemeinsamer Review, auch
ohne geteilte Funktion).

### 5.6 `src/formats/shared/schema.ts`
**Keine Änderung** — siehe Abschnitt 4.

---

## 6. Import/Export-Anpassungen OOXML (DOCX) und ODF (ODT) — Export-Härtung

Zweiter Schutzwall gegen den Live-Bug 0.4, **erforderlich, nicht optional**, unabhängig von der
Paste-Sanitisierung.

### 6.1 `src/formats/docx/writer.ts` — `imageParagraphXml` (aktuell Zeilen 74–94, `images.add` in 76)

```ts
import { imageFallbackText, isEmbeddableImageSrc } from '../shared/imageFallback'

function imageParagraphXml(node: JsonNode, images: ImageCollector, rels: RelationshipRegistry): string {
  const src = String(node.attrs?.src ?? '')
  if (!isEmbeddableImageSrc(src)) {
    // Ein nicht-data-URL-Bild darf den Export NIE abbrechen (einfuegen-req.md 3.12).
    const fallback = escapeXml(imageFallbackText(String(node.attrs?.alt ?? '')))
    return `<w:p>${paragraphPropsXml('left')}<w:r><w:t xml:space="preserve">${fallback}</w:t></w:r></w:p>`
  }
  const fileName = images.add(src)
  // … unverändert ab hier (relId/cx/cy/Drawing-XML, aktuelle Zeilen 77–92)
}
```

### 6.2 `src/formats/odt/writer.ts` — `blockToOdt`, `case 'image'` (aktuell Zeilen 176–183, `images.add` in 178)

```ts
import { imageFallbackText, isEmbeddableImageSrc } from '../shared/imageFallback'

case 'image': {
  const src = String(node.attrs?.src ?? '')
  if (!isEmbeddableImageSrc(src)) {
    return `<text:p>${escapeXml(imageFallbackText(String(node.attrs?.alt ?? '')))}</text:p>`
  }
  const fileName = images.add(src)
  // … unverändert ab hier (width/height/draw:frame-XML, aktuelle Zeilen 179–182)
}
```

### 6.3 Build-Warnung (verbindlich)
`tsconfig.app.json` hat `noUnusedLocals: true` **und** `noUnusedParameters: true`. Eine
ungenutzte lokale Variable (z. B. ein deklariertes, aber im Fallback-Zweig nicht verwendetes
`alt`) lässt `npm run build` (`tsc -b && vite build`) **scheitern** — Vitest/Playwright prüfen
das nicht. Die obigen Fassungen vermeiden das (der Fallback verwendet `alt` direkt und einmalig;
im DOCX-Fall bleibt der bestehende `alt`-Gebrauch im Embeddable-Zweig). **Nach dieser Änderung
`npm run build` tatsächlich laufen lassen** (Anforderung 8.3).

### 6.4 `imageCollector.ts` (beide Formate)
**Keine Änderung.** Die strikte `add()`-Prüfung (throw bei nicht-`data:`) bleibt als Fail-Fast
erhalten; sie wird nur nicht mehr erreicht, weil beide Writer `isEmbeddableImageSrc` **davor**
prüfen.

### 6.5 Rundreise-Verhalten
- **Externes Bild (Platzhalter):** exportiert jetzt fehlerfrei; beim Reimport kommt der
  Platzhaltertext als normaler `paragraph`/`text` zurück (nie ein `image`-Knoten geschrieben).
  Das ist **kein** Rundreiseverlust im Sinne der Anforderung — der **Text** übersteht die
  Rundreise („Textverlust ist es nicht", 5.).
- **Eingebettete (Data-URI-)Bilder aus Paste (3.5/5.2 Testfall 5):** **keine** Writer-Änderung
  nötig — sie laufen durch denselben `images.add(src)`-Pfad wie ein Toolbar-Bild.

---

## 7. Sicherheit — keine Skript-/Style-Injektion über eingefügtes HTML (Anforderung 3.11)

`sanitizePastedHtml(html)` bereinigt **vor** dem schema-basierten Parsen, statt sich allein auf
die parseDOM-Whitelist zu verlassen:

1. HTML in ein **detached** `DOMParser`-Dokument parsen (`new DOMParser().parseFromString(html,
   'text/html')`). Ein so erzeugtes Dokument lädt keine Ressourcen und führt keine Skripte aus.
2. Entfernen: `<script>`, `<style>`, `<meta>`, `<link>`, `<iframe>`, `<object>`, `<embed>`.
3. Alle `on*`-Attribute (`onerror`, `onclick`, …) und alle `href`/`src`/`xlink:href` mit
   `javascript:`-Schema entfernen.
4. Office-Conditional-Comments (`<!--[if …]>…<![endif]-->`) und sonstige Kommentarknoten
   entfernen (Kommentarknoten iterieren und löschen; deckt die `mso-*`-„Suppe" mit ab).
5. `<img>` mit nicht-`isEmbeddableImageSrc(src)` durch einen Textknoten `imageFallbackText(alt)`
   ersetzen (der umgebende Text bleibt erhalten).
6. `document.body.innerHTML` zurückgeben.

`sanitizePastedSlice` (Knoten-Ebene) ist der zweite Wall für Pfade, die (6) umgehen (Drop,
künftige Pfade). **Test:** Injektionsversuch (`<img src=x onerror=alert(1)>`, `<script>…`) ⇒
kein Skript ausgeführt, umgebender Text erhalten (8.1/8.2 #15).

---

## 8. Tests

### 8.1 Unit-Tests (Vitest, jsdom)

Neue Datei `src/formats/shared/editor/__tests__/paste.test.ts`:

| Funktion | Testfälle |
|---|---|
| `splitPlainTextIntoParagraphs` | 1 Chunk/1 Zeile; 1 Chunk/N Zeilen; 2 leerzeilengetrennte Chunks; `\r\n`-Normalisierung; `\t` bleibt (Grenzfall 6); Emoji/BMP-außerhalb bleiben ganze Surrogatpaare (Grenzfall 5) |
| `plainTextClipboardParser` | 1-Chunk ⇒ rein inline (kein neuer `paragraph`); Mehr-Chunk ⇒ `paragraph` mit `hard_break` je Einzelumbruch; **Rev. 4:** aufgerufen mit einem `$context`, dessen Cursor in fett/kursivem Text steht ⇒ erzeugter `text`-Knoten trägt dieselben Marks (Grenzfall 21, 0.6 Punkt 1 — Regressionstest gegen den `prosemirror-view`-Default-Mechanismus, den dieser Parser ersetzt) |
| `sanitizePastedHtml` | entfernt `<script>`/`<style>`/`<iframe>`; entfernt `on*`/`javascript:` (inkl. `<a href="javascript:…">`, Grenzfall 20); entfernt `<!--[if …]>…<![endif]-->` (Fixture mit `mso-list`); ersetzt `<img src="https://…">` durch Platzhalter; lässt `<img src="data:…">`, `p`/`strong`/`ul`/`table` unverändert |
| `sanitizePastedSlice` | Slice mit nicht-einbettbarem `image` ⇒ `paragraph`+Platzhalter, keine Fragment-Validierungsfehler; `data:`-Bild bleibt |
| `stripToPlainText` | Slice mit Marks + `heading` ⇒ markenfrei, `heading`→`paragraph` |
| `imageFallbackText`/`isEmbeddableImageSrc` | mit/ohne `alt`; `data:…;base64,…` ⇒ true; `https://…`/`blob:…`/leer ⇒ false |

Neue Datei `src/formats/shared/__tests__/imageFallback.test.ts` optional (oder obige Zeile).

Ergänzung der bestehenden Roundtrip-Unit-Tests (`docx/__tests__/roundtrip.test.ts`,
`odt/__tests__/roundtrip.test.ts` — Muster: dortige `doc()`/`paragraph()`-Helper): neuer Fall
„`image`-Knoten mit `https://`-URL exportiert **ohne Exception**, Ergebnis enthält
Platzhaltertext statt Bild-XML" — direkter Regressionstest für 0.4/6.

### 8.2 E2E-Tests (Playwright)

**Dateiname `tests/e2e/clipboard-paste.spec.ts`** (nicht `paste.spec.ts`!). Grund:
`playwright.config.ts` bindet die Cross-Browser-Projekte **Desktop Safari (Clipboard)** und
**Desktop Firefox (Clipboard)** über `testMatch: /clipboard.*\.spec\.ts/` — nur mit `clipboard`
im Namen laufen die Paste-Tests auch in WebKit/Firefox (deckt Grenzfall 18). Aufbau wie
`selection-regression.spec.ts` (`goto('/')` → „verstanden" → ODT/DOCX-Karte „Neu erstellen" →
`.ProseMirror`). Zentrale Technik (Anforderung 6.1): synthetischer `ClipboardEvent` mit
`DataTransfer` per `page.evaluate(...)`:

```ts
async function pasteHtml(page, html, text) {
  await page.evaluate(({ html, text }) => {
    const dt = new DataTransfer()
    dt.setData('text/html', html)
    if (text) dt.setData('text/plain', text)
    document.querySelector('.ProseMirror').dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, { html, text })
}
```

Testfälle (Nummerierung folgt `einfuegen-req.md`):

1. **3.1** Einfügen mitten im Absatz ⇒ Text davor/danach exakt, Cursor dahinter.
2. **3.2** Einfügen über Selektion (Wort/Absatz/`Strg+A`) ⇒ ersetzt.
3. **3.3** Klartext ohne HTML: kein Leerzeilen-Block bleibt im `<p>`; zwei Blöcke ⇒ zwei `<p>`;
   Einzelumbruch ⇒ `<br>` (`hard_break`), kein neues `<p>`.
4. **3.4** Formatiertes HTML (F/K/U/S/Farbe/Highlight/H1–H6/Listen/`data:`-Bild/Tabelle) ⇒
   sinnvoll übernommen.
5. **3.4/3.12** `<img src="https://example.invalid/x.png">` ⇒ Bild erscheint **nicht**,
   Platzhalter sichtbar, umgebender Text erhalten, **Export danach wirft nicht** (deckt 0.4+6).
6. **3.5** Bild-Zwischenablage ohne HTML (`DataTransfer` mit `image/png`-`File`) ⇒ `image`-
   Knoten mit Data-URI.
7. **3.6** Mehrabsätziger Paste in `list_item` (keine Duplizierung/kein Aufbrechen);
   verschachteltes `<ul><li>…<ul>…` ⇒ verschachtelte Liste; Paste in Tabellenzelle bleibt in
   der Zelle; mehrzeilig in `heading` ⇒ Rest in Folgeabsatz.
8. **3.7** Strg+Umschalt+V: `keydown`(Ctrl+Shift+V) armen, dann Paste-Event mit HTML-Marks ⇒
   Ergebnis rein Text ohne Marks, im Absatzformat der Zielposition; erster Block behält
   Zielblocktyp, weitere `paragraph`.
9. **3.8** Paste → `Strg+Z` (Originalzustand inkl. Selektion) → `Strg+Y`; ein Paste = **ein**
   Undo-Eintrag; gilt auch für den asynchronen Bild-Zweig (#6).
10. **3.9** Externes Bild ⇒ `pasteNotice` erscheint (`role="status"`) und verschwindet
    automatisch; leerer Paste ⇒ kein Hinweis, keine Änderung.
11. **Pflicht-Regressionstest (Selection-Sync × Paste)** — **in `selection-regression.spec.ts`**
    (bestehender Describe-Block, Muster: der Kopieren-Fall Zeilen 88–110): tippen → Paste (HTML)
    über `Strg+A`-Selektion → Klick zum Neupositionieren → `Enter` → weitertippen ⇒ kein
    Komplettverlust. (Anforderung 2/Grenzfall 14.)
12. **Grenzfälle 1–3** (Anfang/Ende/leeres Dokument), **9** (mehrfach schnelles Paste).
13. **Grenzfall 15** Injektion (`<img src=x onerror=…>`, `<script>…`) ⇒ kein Skript, Text
    erhalten (deckt Abschnitt 7 auf E2E-Ebene).
14. **Drag & Drop** (1 #6): `drop` mit `text/html` ⇒ kein Absturz, Inhalt erscheint; `drop` mit
    reinem Bild-`File` ⇒ `image`-Knoten am Drop-Punkt.
15. **Kontextmenü-Guard**: bereits vorhanden (`clipboard.spec.ts:~129–143`) — **nicht** neu
    schreiben, nur im Plan referenzieren.
16. **Grenzfall 20** (Hyperlink ohne Link-Mark): Paste-HTML `<p>Vor <a href="https://x.test">Link-Text</a> nach</p>`
    ⇒ „Vor Link-Text nach" bleibt vollständig sichtbar, kein `href` im Dokument, keine Navigation
    ausgelöst; zusätzlich `<a href="javascript:alert(1)">X</a>` ⇒ kein Skript, Text „X" erhalten
    (Doppelbefund mit #13, deckt 0.6 Punkt 4).
17. **Grenzfall 21** (Mark-Übernahme): Cursor in bereits fett formatiertem Text positionieren,
    reinen Klartext (nur `text/plain`) einfügen ⇒ eingefügter Text ist **ebenfalls fett**
    (Standard-Strg+V erbt, 0.6 Punkt 1); direkt danach dieselbe Sequenz mit Strg+Umschalt+V
    („Einfügen ohne Formatierung") ⇒ eingefügter Text ist **nicht** fett. Beide Ergebnisse in
    einem Test gegenübergestellt, damit die Abgrenzung belegt, nicht nur behauptet ist.
18. **Grenzfall 22** (Drop mit `text/uri-list`, ohne `File`): `drop`-Event mit `DataTransfer`,
    das nur `text/uri-list` (z. B. `https://example.test/bild.png`) gesetzt hat, kein
    `text/plain`, kein `text/html`, keine `File` ⇒ die URL erscheint als sichtbarer Text am
    Drop-Punkt (deckt den `getText()`-Fallback aus 0.6 Punkt 4); zusätzlich derselbe Drop mit
    **zusätzlich** gesetztem `text/html` (`<img src="https://…">`) ⇒ verhält sich wie Testfall 5
    (Platzhalter, Export bricht nicht ab).
19. **Grenzfall 23** (leere Zwischenablage, expliziter No-Op): `paste`-Event mit einem
    `DataTransfer`, das **keinen** Eintrag gesetzt hat (kein `text/plain`, kein `text/html`,
    kein `image/*`, keine `File`) ⇒ Dokumentinhalt und Cursor-Position exakt unverändert, **kein**
    `pasteNotice`. Abgegrenzt von einem zweiten Testfall mit `text/plain: '   \n'` (nur
    Leerzeichen/Zeilenumbruch) ⇒ das ist reiner, nicht-leerer Text (3.3) und wird regulär als
    Absatz/`hard_break` eingefügt, **kein** No-Op.

**Nicht automatisierbar (Anforderung 6.3, manuell):** Copy-Paste aus real installiertem
Word/LibreOffice (Grenzfall 16) — protokolliert in 12. IME-Komposition (Grenzfall 8):
strukturell keine Interferenz, da die Hooks nur auf `paste`/`drop`/`keydown(Shift+V)`, nicht auf
`compositionupdate` reagieren. RTF-only (Grenzfall 17): ProseMirror verarbeitet nur
`text/html`/`text/plain` ⇒ Fallback auf Klartext oder No-Op, per Test befunden.

### 8.3 Rundreise-Tests (Anforderung 5)
- **5.1 Baseline:** `docx.spec.ts`, `odt.spec.ts`, beide `roundtrip.test.ts`,
  `clipboard-roundtrip.spec.ts` müssen **vor und nach** den Änderungen grün bleiben (Abschnitt
  10 begründet, warum).
- **5.2 Feature-Rundreise:** je Testfall 1–8 nach dem Einfügen exportieren
  (`page.waitForEvent('download')` wie in `docx.spec.ts`), mit `JSZip`/`zipInspect.ts` laden,
  Inhalt im XML prüfen, reimportieren, erneut prüfen. Für DOCX **und** ODT.
- **5.3 Cross-Format:** bleibt **zurückgestellt** — als `test.fixme` spiegeln (wie
  `clipboard-roundtrip.spec.ts:134–145`), nicht als erfüllt markieren. Abhängigkeit:
  `speichern-unter-format`.

---

## 9. Grenzfälle-Mapping (Anforderung Abschnitt 4 — alle 23)

> Rev. 3 endete hier bei 19 Grenzfällen, weil `einfuegen-req.md` zu dem Zeitpunkt noch nicht
> um 20–23 erweitert war (siehe Titelblatt „Warum Rev. 4" Punkt 4). Nachgetragen unten.

| # | Grenzfall | Umsetzung |
|---|---|---|
| 1 | Position 0 | Standard-`replaceSelection`, Test 8.2 #12 |
| 2 | Dokumentende | wie #1 |
| 3 | Leeres Dokument | wie #1 (leerer `paragraph` wird ersetzt/erweitert) |
| 4 | Große Textmenge | Keine Sonderbehandlung; kein Netzwerk-Fetch (3.2); `pagination.ts` entkoppelt |
| 5 | BMP-außerhalb (Emoji/ZWJ) | Alle `paste.ts`-Funktionen auf JS-Strings ohne manuelle Indizierung ⇒ Test 8.1 |
| 6 | Tab-Zeichen | Kein Code rührt `\t` an ⇒ Test 8.1 |
| 7 | Verschachtelte Tabelle | Schema erlaubt es (Abschnitt 4) ⇒ Test „kein Absturz, lesbar" |
| 8 | IME-Komposition | strukturell keine Interferenz (8.2), nur eingeschränkt automatisierbar |
| 9 | Wiederholtes schnelles Paste | jede Transaktion unabhängig, kein geteilter State außer dem kurzlebigen Plain-Flag ⇒ Test 8.2 #12 |
| 10 | Fokus außerhalb Editor | Plugin-Scoping (2.2) ⇒ strukturell ausgeschlossen |
| 11 | `text/html`+`text/plain` gleichzeitig | HTML gewinnt (Browser-Default) — `clipboardTextParser` greift nur ohne HTML; per Test bestätigt |
| 12 | Bild ohne HTML | 3.5 implementiert (5.2/8.2 #6) |
| 13 | Externes `<img src=https…>` | Platzhalter + `pasteNotice`, Text erhalten, Export wirft nicht (8.2 #5) |
| 14 | Paste + Toolbar-Aktion danach | Selection-Sync-Regressionstest 8.2 #11 |
| 15 | Skript-Injektion | Abschnitt 7, Test 8.2 #13 |
| 16 | Echtes Word/LibreOffice | manuell (Abschnitt 12), höchste inhaltliche Priorität |
| 17 | Nur `text/rtf` | ProseMirror ignoriert RTF ⇒ Klartext-Fallback/No-Op, per Test befunden |
| 18 | Browser-Matrix (Chrome/FF/WebKit/Edge) | Dateiname `clipboard-paste.spec.ts` ⇒ Safari/FF-Clipboard-Projekte greifen; WebKit-Grenzen (`SKIP_WEBKIT_ROUNDTRIP`) dokumentiert |
| 19 | Touch/Mobile-Menü | `Mobile`/`Tablet`-Projekte rudimentär; native Menü-Interaktion als Automatisierungsgrenze dokumentiert |
| 20 | Hyperlink ohne Link-Mark | Schema kennt keine Link-Mark ⇒ `prosemirror-model`s Default-Fallback für unbekannte Tags übernimmt den Linktext transparent, `href` entfällt (0.6 Punkt 4) — **kein neuer Code**, Test 8.2 #16 |
| 21 | Mark-Übernahme bei Klartext-Einfügen | `plainTextClipboardParser` hängt `$context.marks()` an jeden Textknoten (5.2-Korrektur, 0.6 Punkt 1) — **echte Codeänderung nötig**, sonst Regression; Test 8.1 + 8.2 #17 |
| 22 | Drop mit `text/uri-list`, ohne `File` | `prosemirror-view`s `getText()` fällt selbst auf `text/uri-list` zurück (0.6 Punkt 4) und läuft dann durch denselben Klartext-Pfad wie #21 — **kein neuer Code**, Test 8.2 #18 |
| 23 | Leere Zwischenablage (expliziter No-Op) | `parseFromClipboard` bricht bereits vor jedem Slice-Aufbau ab (0.6 Punkt 4), unser `handlePaste` findet ebenfalls nichts ⇒ sauberer No-Op — **kein neuer Code**, Test 8.2 #19 |

---

## 10. Regressionssicherheit (Anforderung 5.1) — warum bestehende Tests grün bleiben

- **Interner Copy→Paste (`clipboard-roundtrip.spec.ts`):** intern kopierter Inhalt landet als
  `text/html`; dessen Bilder sind `data:` (einbettbar) ⇒ `sanitizePastedHtml`/
  `sanitizePastedSlice` lassen sie unangetastet, `transformPasted` (Nicht-Plain-Modus) ändert
  nichts an markiertem Text ⇒ identisches Ergebnis wie heute.
- **`clipboardTextParser`** greift nur, wenn **kein** `text/html` vorliegt — bei internem Paste
  also nie (Grenzfall 11).
- **Kontextmenü-Guard (`clipboard.spec.ts:~129–143`)** bleibt gültig: es wird **kein**
  `contextmenu`-Handler und **kein** `preventDefault()` ergänzt.
- **`clipboard-privacy.test.ts`** bleibt grün: P0 fügt **kein** `navigator.clipboard` in `src`
  hinzu (Abschnitt 1).
- **Baseline-Import/-Export (`docx.spec.ts`/`odt.spec.ts`/`roundtrip.test.ts`):** die neuen
  `EditorProps` feuern nur bei echten Paste-/Drop-Events in `view.dom`, nicht beim Import/
  Anzeigen; die Writer-Härtung ändert für einbettbare `data:`-Bilder nichts.
- **`tsc -b`**: die Writer-Snippets vermeiden ungenutzte Locals/Parameter (6.3).

Diese Punkte sind **vor und nach** der Umsetzung zu prüfen (Abnahme 12).

---

## 11. Reihenfolge der Umsetzung (Kern zuerst)

1. **Datenschutz-Entscheidung festhalten** (Abschnitt 1) — bevor Code entsteht; im Backlog die
   Abhängigkeit zu `clipboard-privacy.test.ts` notieren.
2. **Bugfix + Härtung zuerst (unabhängig vom Rest):** `imageFallback.ts` anlegen; `docx/
   writer.ts`/`odt/writer.ts` härten (Abschnitt 6) + Unit-Tests; **`npm run build` ausführen**.
3. `paste.ts` reine Funktionen (`splitPlainTextIntoParagraphs`, `plainTextClipboardParser`,
   `sanitizePastedHtml`, `sanitizePastedSlice`, `stripToPlainText`) + Unit-Tests (8.1).
4. Plugin verdrahten (`transformPasted[HTML]`/`clipboardTextParser`/`handleDOMEvents.keydown`),
   `WordEditor.tsx` (State + Status-Region), E2E #1–#5, #7, #11, #13.
5. `handlePaste`/`handleDrop` + `insertImageFile` (Bild-Blobs), E2E #6, #14.
6. Plain-Modus-Feinschliff (3.3), E2E #8, #10.
7. Rundreise-Tests (8.3) DOCX + ODT; Cross-Format als `test.fixme` spiegeln.
8. Grenzfall-Restliste (Abschnitt 9) einzeln abhaken.
9. Optional/P1: Toolbar-Buttons (5.4) inkl. `clipboardRead.ts` + Privacy-`ALLOWED`-Eintrag.
10. Manuelle Prüfschritte durchführen und Ergebnis nachtragen (Abschnitt 12).

---

## 12. Abnahme-Checkliste und offene Punkte (Bezug: `einfuegen-req.md` 7/8)

- [ ] Datenschutz-Entscheidung (Abschnitt 1) getroffen, dokumentiert; `clipboard-privacy.test.ts`
      **unverändert grün** (P0 ohne `navigator.clipboard`).
- [ ] Export-Absturz-Bug (0.4) durch gehärtete Writer + Unit-Test geschlossen; `npm run build`
      läuft danach fehlerfrei (`noUnusedLocals`/`noUnusedParameters`, 6.3).
- [ ] Alle E2E-Fälle 8.2 + Rundreise 8.3 automatisiert vorhanden und grün.
- [ ] Sicherheits-Bereinigung (Abschnitt 7) durch Injektionstest belegt.
- [ ] Selection-Sync × Paste-Regressionstest **in `selection-regression.spec.ts`** grün und
      dauerhaft Teil der Suite.
- [ ] Baseline-Rundreise (5.1) vor **und** nach den Änderungen grün (Abschnitt 10).
- [ ] Feature-Rundreise (5.2) DOCX **und** ODT grün.
- [ ] Cross-Format (5.3) als `test.fixme` „blockiert durch `speichern-unter-format`" markiert,
      nicht als erfüllt.
- [ ] Jeder Grenzfall aus Abschnitt 9 einzeln befundet (funktioniert / dokumentiert nicht
      unterstützt / repariert) — **alle 23**, insbesondere 20–23 (0.6), nicht nur 1–19.
- [ ] Mark-Übernahme (Grenzfall 21) durch Unit- **und** E2E-Test belegt, nicht nur behauptet —
      `plainTextClipboardParser` hängt `$context.marks()` an (5.2-Korrektur, 0.6 Punkt 1).
- [ ] Async-Bild-Einfügen (`insertImageFile`) fängt die Zielposition synchron **vor** dem
      `FileReader`-`await` ab (5.2-Korrektur) — durch Test „tippen zwischen Auslösen und
      Bild-Auflösung verändert die Einfügeposition nicht" belegt (Grenzfall 9).
- [ ] Manuelle Prüfschritte durchgeführt und dokumentiert:
  1. Echtes Copy-Paste aus lokal installiertem Word bzw. LibreOffice Writer (Grenzfall 16) —
     wer, wann, Version, Ausgang.
  2. Reale IME-Komposition (Grenzfall 8) — nur strukturelle Begründung.
  3. `Mobile`/`Tablet`-Playwright-Projekte für Touch-Paste — nice-to-have.
  4. Track-Changes/Kommentare beim Einfügen — laut `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 13 erst
     nach Phase 3; dann diese Datei um „Einfügen bei aktiver Aufzeichnung" ergänzen.

**Offene Fragen aus `einfuegen-req.md` 8.2 — hier beantwortet:**
1. `navigator.clipboard` für 3.7/#4? ⇒ **P0: nein** (Abschnitt 1.1); **P1-Toolbar: ja, eng
   gekapselt + `ALLOWED`-Eintrag** (1.2).
2. WebKit/Safari Teil der Matrix? ⇒ Ja über die Clipboard-Projekte, sofern der Spec-Name
   `clipboard-paste.spec.ts` lautet (8.2); Paste-Automatisierung in WebKit ist die dokumentierte
   Grenze.
3. Verschachtelte Liste/Tabelle + mehrabsätziger Paste in `heading` (3.6) ⇒ **beobachtetes**
   Verhalten per Test festhalten (8.2 #7), nicht annehmen.
4. Cross-Format (5.3) ⇒ zurückgestellt bis `speichern-unter-format`, im Backlog verlinkt.

Erst wenn alle Punkte erfüllt sind, darf der Backlog-Status von `einfuegen` (und, sofern
mitumgesetzt, `einfuegen-unformatiert`) von „nicht vertrauenswürdig" auf „vorhanden" wechseln —
sonst bleibt er „teilweise" mit Verweis auf die offenen Punkte oben.

---

## 13. Umsetzungsstand (2026-07-05) — was tatsächlich implementiert und getestet ist

Umgesetzt und automatisiert grün (Build + Lint + Unit + E2E über Desktop Chrome, Mobile, Tablet,
Desktop Safari/WebKit; Firefox bewusst abgegrenzt, siehe unten):

- [x] **Datenschutz-Entscheidung (Abschnitt 1):** P0 ohne `navigator.clipboard`. Verifiziert per
  `clipboard-privacy.test.ts` (unverändert grün) und Code-Review von `paste.ts` (kein Treffer).
- [x] **Export-Absturz-Bug (0.4/3.12) geschlossen:** `imageFallback.ts` + Guard in `docx/writer.ts`
  und `odt/writer.ts`. Belegt durch: die migrierten `roundtrip.test.ts`-Fälle (kein Wurf mehr,
  Platzhaltertext, Original-URL verschwindet) **und** neue externe-Validierungs-Fälle
  (`docx/__tests__/external-validation.test.ts` via mammoth, `odt/__tests__/external-validation.test.ts`
  gegen das offizielle OASIS-ODF-1.3-Schema).
- [x] **Klartext-Semantik (3.3)** inkl. Mark-Vererbung (Grenzfall 21): Unit (`paste.test.ts`) + E2E.
- [x] **Sicherheits-Bereinigung (Abschnitt 7):** Skript/`on*`/`javascript:`/Conditional-Comments —
  Unit + E2E-Injektionstest (kein Alert, Text erhalten).
- [x] **Externes Bild → Platzhalter + sichtbare `pasteNotice` (3.9):** im Plugin verdrahtet
  (HTML- und Slice-Pfad), E2E belegt.
- [x] **Bild-Blob-Paste (3.5)** und **Drag & Drop (1 #6)** inkl. `text/uri-list`-Drop (Grenzfall 22):
  E2E (Chromium-scoped, da eine `DataTransfer` mit `File`/DragEvent-`dataTransfer` nur dort
  zuverlässig synthetisch konstruierbar ist — dokumentierte Automatisierungsgrenze).
- [x] **Plain-Modus Strg+Umschalt+V (3.7):** E2E (Marks entfernt, Blocktyp reduziert).
- [x] **Undo = ein Schritt (3.8):** E2E.
- [x] **Async-Bild-Position synchron eingefroren (5.2-Korrektur):** `insertImageFile` liest `at`
  vom Aufrufer, nicht nach dem `await`; Race-Test „drei schnelle Pastes = drei Undo-Schritte" (E2E).
- [x] **Selection-Sync × Paste-Regressionstest** dauerhaft in `tests/e2e/selection-regression.spec.ts`.
- [x] **Feature-Rundreise (5.2)** für DOCX **und** ODT über echten Datei-Export/-Reimport: formatierter
  Text/Überschrift/Liste, externes Bild → Platzhalter, Tab-Zeichen, Tabelle mit `colspan` (Grenzfall 25) —
  in `clipboard-paste.spec.ts` (parametrisiert je Format), plus Punkt 12 (externe Validierung, s. o.).
- [x] **Struktur-Kontexte (3.6):** Paste in Listenpunkt, Tabellenzelle und mehrabsätzig in Überschrift — E2E.
- [x] **Grenzfälle einzeln befundet:** 1–3 (Position/leer), 4 (große Menge + Paginierung), 7
  (verschachtelte Tabelle), 9 (schnelles/async Race), 10 (Fokus außerhalb Editor), 11 (HTML>Plain),
  17 (RTF-only No-Op), 20 (Hyperlink ohne Link-Mark), 21 (Mark-Übernahme), 22 (uri-list-Drop),
  23 (leere Zwischenablage), 24 (Node-Selektion wird ersetzt) — je ein E2E- oder Unit-Test.
- [x] **Baseline-Rundreise (5.1)** vor/nach unverändert grün.
- [x] **Paste-E2E-Datei** heißt `clipboard-paste.spec.ts` (Namenskonvention erfüllt).

Bewusst zurückgestellt / dokumentierte Einschränkung (nicht als „erledigt" getarnt):

- **Cross-Format-Rundreise (5.3):** blockiert durch fehlendes `speichern-unter-format`, gespiegelt als
  `test.fixme` in `clipboard-roundtrip.spec.ts` — bleibt zurückgestellt, nicht erfüllt markiert.
- **Manuelles Copy-Paste aus real installiertem Word/LibreOffice (Grenzfall 16):** in dieser
  automatisierten Umgebung nicht durchführbar — als **offener manueller Prüfschritt** ausgewiesen, nicht
  als bestanden. Die Word-`mso-*`-/Conditional-Comment-Bereinigung ist strukturell + per Unit/E2E-Test
  abgedeckt, ersetzt aber die reale Stichprobe nicht.
- **IME-Komposition (Grenzfall 8):** strukturell keine Interferenz (die Hooks reagieren nur auf
  `paste`/`drop`/`keydown(Shift+V)`, nicht auf `compositionupdate`) — nur begründet, nicht automatisiert.
- **Firefox-Automatisierung:** synthetische `ClipboardEvent`/`DragEvent` tragen in Firefox keine
  `clipboardData`/`dataTransfer` (read-only null) → die synthetischen Paste-/Drop-Tests sind dort per
  `test.skip` abgegrenzt (kein Produktfehler; Chromium/WebKit/Mobile/Tablet decken den Pfad ab).
- **P1-Toolbar-Buttons (#4/#5):** außerhalb der P0-Abnahme von `einfuegen` (Abschnitt 1.2), nicht umgesetzt.
