# Anforderungen: „Einfügen" (Zwischenablage → Cursor-Position)

Status: Laut Backlog (`specs/FEATURE-BACKLOG.md`, Abschnitt 2.1 „Zwischenablage", Slug
`einfuegen`, Priorität 1) als „vorhanden" markiert. Diese Einstufung gilt als **nicht
vertrauenswürdig** und muss vollständig verifiziert werden, bevor sie erneut als
„vorhanden" bestätigt werden darf. Stil und Tiefe orientieren sich an
`E:\docs\FEATURE-SPEC-DOCX-ODT.md`.

Geltungsbereich: ausschließlich die Funktion „Inhalt der Zwischenablage an der
Cursor-Position einfügen" im gemeinsamen DOCX/ODT-Editor (`src/formats/shared/editor/`).
Das eng verwandte, laut Backlog fehlende Feature „Einfügen ohne Formatierung"
(`einfuegen-unformatiert`, Priorität 2) wird als Abgrenzung mitbehandelt (Abschnitt 3.7),
ist aber **kein** Bestandteil der Freigabe von `einfuegen` selbst.

Wie in `FEATURE-SPEC-DOCX-ODT.md` festgelegt: DOCX und ODT teilen sich denselben
ProseMirror-Editor. Jede Anforderung unten gilt für **beide** Formate, inklusive
Rundreise (Import → Einfügen → Export → Re-Import → Inhalt bleibt erhalten).

**Abgrenzung zu den bereits abgenommenen Nachbarfeatures:** „Ausschneiden"
(`ausschneiden`) und „Kopieren" (`kopieren`) sind inzwischen umgesetzt **und** getestet
(siehe Abschnitt 0.1). Der native Strg+V-Pfad für **innerhalb** von Salamanido kopierten
Inhalt wird dadurch bereits heute mitgeprüft. Der eigentlich noch offene, für dieses
Ticket neu abzusichernde Kern von „Einfügen" ist daher: **Einfügen aus externen bzw.
Nicht-Text-Quellen**, die Klartext-Semantik, die Bild-Zwischenablage, „Einfügen ohne
Formatierung", die Sicherheits-/Datenschutz-Randbedingungen sowie die Export-Härtung
(Abschnitt 0.7). Diese Fokussierung ist verbindlich, damit weder bereits erledigte
Copy/Cut-Arbeit doppelt gemacht noch „Einfügen" fälschlich als fertig gewertet wird, nur
weil internes Copy→Paste schon funktioniert.

---

## 0. Verifizierter Ist-Zustand (Code-Recherche, Stand 2026-07-05)

Diese Spezifikation beruht auf tatsächlicher, an diesem Tag erneut durchgeführter
Durchsicht des Codes, **nicht** auf der Backlog-Beschreibung und **nicht** auf einer
früheren Fassung dieser Datei (eine vorige Fassung behauptete „keinerlei Treffer für
paste/clipboard im gesamten src-Verzeichnis" und „keine Tests" — beides ist inzwischen
**überholt**, siehe 0.1, und wurde hier korrigiert statt übernommen).

Eine erneute, punktuelle Nachprüfung am 2026-07-05 (nachdem `clipboard.ts` zuletzt am
selben Tag angefasst wurde) hat jeden der Befunde 0.1–0.7 einzeln bestätigt: `paste.ts`/
`imageFallback.ts` existieren weiterhin **nicht** (Glob leer); für `transformPasted`,
`transformPastedHTML`, `clipboardTextParser`, `handlePaste`, `handleDrop`,
`isEmbeddableImageSrc`, `imageFallback` gibt es in `src` **keinen** Treffer; die
`img[src]`-`parseDOM`-Regel und die ungeprüften `images.add(src)`-Aufrufe in beiden
Writern samt der werfenden `ImageCollector.add`-Prüfung (Live-Bug 0.7) sind unverändert
vorhanden; `DocumentWorkspace.handleExport` fängt die geworfene Exception in `catch`
tatsächlich sichtbar über `setExportError(err instanceof Error ? err.message : String(err))`
ab. Ebenfalls neu verifiziert: `prosemirror-tables`' `tableNodes(...)` (in `schema.ts`
eingebunden) unterstützt `colspan`/`rowspan` bereits auf Schemaebene, und sowohl
`docx/writer.ts`+`docx/reader.ts` als auch `odt/writer.ts`+`odt/reader.ts` lesen/schreiben
diese Attribute nachweislich (Grep-Treffer in beiden Formaten und in
`external-validation.test.ts`) — verbundene Zellen sind also strukturell abbildbar, nur der
Einfügen-Pfad einer *extern* verbundenen Tabelle ist ungetestet (siehe 3.6, Grenzfall 25).
Die Zeilenangaben unten sind
bewusst grob gehalten, weil die Dateien weiter wachsen; die referenzierten Symbole, nicht
Zeilennummern, sind maßgeblich.

### 0.1 Was inzwischen existiert (Copy/Cut-Infrastruktur, geprüft)
- `src/formats/shared/editor/clipboard.ts` — `clipboardTextSerializer(slice, view)`,
  in `WordEditor.tsx` als `EditorProps.clipboardTextSerializer` verdrahtet. Erzeugt die
  `text/plain`-Repräsentation für **Kopieren/Ausschneiden** (Tab-getrennte Tabellenzellen,
  `- `/`1. `-Listenmarker, `hard_break` → `\n`). Betrifft die **Ausgabe** in die
  Zwischenablage, **nicht** das Einfügen.
- `cutSelection()` in `commands.ts` (Toolbar-Scheren-Button + `Shift-Delete`-Keymap),
  `canCut()`, sichtbare Fehlermeldung bei blockiertem Ausschneiden.
- Tests existieren real: `tests/e2e/clipboard.spec.ts` (Kopieren), `tests/e2e/cut.spec.ts`
  (Ausschneiden), `tests/e2e/clipboard-roundtrip.spec.ts` (Copy/Paste + Datei-Rundreise),
  `src/formats/shared/editor/__tests__/clipboard.test.ts`,
  `.../clipboard-privacy.test.ts`,
  `src/formats/shared/__tests__/cross-format-clipboard-content.test.ts`,
  `src/formats/{docx,odt}/__tests__/cut-roundtrip.test.ts`.
- **Nativer Strg+V wird dadurch bereits ausgeführt:** In `clipboard.spec.ts` und
  `clipboard-roundtrip.spec.ts` wird nach dem Kopieren tatsächlich `ControlOrMeta+V`
  gedrückt und das Ergebnis geprüft. **Aber:** dort wird ausschließlich **innerhalb von
  Salamanido kopierter** Inhalt wieder eingefügt — kein externes Word/LibreOffice-/Web-HTML,
  kein reiner Klartext mit Zeilenumbruch-Semantik, kein Bild-Blob.

### 0.2 Was für „Einfügen" selbst NICHT existiert (verifiziert per Grep/Glob)
- **Kein Paste-Plugin / keine Paste-Hooks.** In `src` gibt es **keinen** Treffer für
  `transformPasted`, `transformPastedHTML`, `clipboardTextParser`, `handlePaste`,
  `handleDrop`, `createPastePlugin`, `pasteAsPlainText`. Die im Umsetzungsplan
  (`einfuegen-code.md`) vorgesehenen Module `src/formats/shared/editor/paste.ts` und
  `src/formats/shared/imageFallback.ts` **existieren noch nicht** (Glob: kein Treffer).
- **Kein Toolbar-Button „Einfügen"** in `Toolbar.tsx`.
- **Kein eigenes Kontextmenü, kein `contextmenu`-`preventDefault()`** — das native
  Browser-Kontextmenü (inkl. „Einfügen") bleibt erreichbar. Dass es nicht unterdrückt
  wird, ist inzwischen **getestet** (`clipboard.spec.ts`, „natives Kontextmenü wird von
  keinem App-Handler unterdrückt", prüft `event.defaultPrevented === false`).
- `Mod-c`/`Mod-x`/`Mod-v`/`Mod-Shift-v` sind in der Keymap (`WordEditor.tsx`) **bewusst
  nicht** gebunden; ein Kommentar dort warnt, dass keine spätere Keymap-Erweiterung sie
  versehentlich verschlucken darf. `keymap(baseKeymap)` bindet keines dieser Kürzel.

### 0.3 Was der native Strg+V heute tatsächlich tut
Einfügen läuft heute ausschließlich über **ProseMirrors Standard-Zwischenablage-
Verarbeitung** plus die `parseDOM`-Regeln in `src/formats/shared/schema.ts`. Es gibt
keinerlei projekteigene Nachbearbeitung. Für **internen** Inhalt funktioniert das (0.1);
für **externe** Quellen ist das Verhalten **ungetestet und teils riskant** (0.4–0.7).

### 0.4 Umfang der `schema.ts`-`parseDOM`-Regeln (schmal)
Erkannt werden nur: `p`, `h1`–`h6`, `strong`/`b`, `em`/`i`, `u`, `s`/`strike`,
`ul`/`ol`/`li`, `img[src]`, `br`, `div[data-unsupported-kind]`, die Inline-Styles
`font-weight`, `font-style`, `text-decoration`, `color`, `background-color`, sowie die
Tabellen-Regeln von `prosemirror-tables`. Alles andere (z. B. `span` ohne erkannten Stil,
`blockquote`, Word-`mso-*`-Konstrukte, verschachtelte `div`-Wrapper, Fußnoten-/Kommentar-
Marken aus kopiertem Word-Text) fällt auf ProseMirrors Default zurück (Klartext-Reduktion
oder Verwerfen). Das genaue Ergebnis ist **nicht getestet**.

### 0.5 Bild-Zwischenablage ohne HTML — nicht behandelt
Ein reiner `image/*`-Clipboard-Eintrag (Screenshot, „Bild kopieren" ohne begleitendes
`text/html`) wird von ProseMirrors Default **nicht** als Bild eingefügt, weil kein
Datei-/Blob-Handling im Paste-Pfad existiert (im Unterschied zum Toolbar-Bild-Button, der
`FileReader.readAsDataURL` nutzt). Als **fehlend** zu behandeln, nicht als vorhanden.

### 0.6 Datenschutz-Invariante (aktiv erzwungen)
`clipboard-privacy.test.ts` erzwingt statisch, dass `navigator.clipboard` **nirgends** in
`src` verwendet wird (Copy/Cut/Paste laufen rein über den nativen, nicht skriptbaren
Browser-Mechanismus). Diese Invariante ist heute grün. **Wichtige Konsequenz für dieses
Ticket:** Der native Strg+V berührt `navigator.clipboard` nicht und ist unproblematisch.
Die geplante Umsetzung von „Einfügen ohne Formatierung" (Abschnitt 3.7) und ein optionaler
Toolbar-Einfügen-Button (Abschnitt 1, #4) benötigen jedoch programmatischen Zugriff
(`navigator.clipboard.readText()`/`read()`) — das würde diesen Test **brechen**. Siehe
Abschnitt 3.10 für die daraus folgende, verbindliche Entscheidung.

### 0.7 LIVE-BUG: Export bricht bei Bild mit Nicht-`data:`-Quelle komplett ab
Heute schon reproduzierbar, **unabhängig** vom Einfügen — und genau der Zustand, den die
naheliegendste Einfügen-Umsetzung (externes `<img src="https://…">` unverändert durch die
bestehende `img[src]`-Regel laufen lassen) erzeugen würde:
- `schema.ts` übernimmt `img[src]` **ungefiltert**, egal welches URL-Schema.
- `docx/writer.ts` und `odt/writer.ts` rufen für jedes Bild ungeprüft `images.add(src)`.
- `ImageCollector.add` (beide Formate) matcht `src` gegen `^data:[^;]+;base64,…` und
  **wirft** `„Bilder müssen als data-URL vorliegen, um eingebettet zu werden."`, sonst.
- `DocumentWorkspace.handleExport` fängt die Exception zwar sichtbar ab, aber das Dokument
  bleibt bis zur manuellen Entfernung des Bild-Knotens **dauerhaft nicht mehr
  exportierbar**.
- Verifiziert: `isEmbeddableImageSrc`/`imageFallback` existieren **nirgends** in `src`
  (Grep: kein Treffer) — die im Umsetzungsplan vorgesehene Härtung ist **nicht** angewandt.

**Dieser Bug ist Bestandteil der Einfügen-Anforderung** (Abschnitt 3.12), nicht optional:
Einfügen darf niemals einen Zustand erzeugen, aus dem heraus das Dokument nicht mehr
exportierbar ist.

### Konsequenz
Diese Datei beschreibt den **Soll-Zustand**, gegen den 0.1–0.7 zu prüfen sind. Es ist
ausdrücklich zu erwarten, dass die Verifikation mehrere Punkte als **nicht erfüllt**
einstuft (externe HTML-Bereinigung, Klartext-Semantik, Bild-Paste, „Einfügen ohne
Formatierung", Export-Härtung) und daraus echte Implementierungsarbeit entsteht — der
Backlog-Status bleibt bis dahin **nicht vertrauenswürdig**.

---

## 1. Menüpunkte / Bedienelemente (Soll-Zustand)

| # | Element | Auslösung | Aktueller Stand (verifiziert) | Soll |
|---|---|---|---|---|
| 1 | Einfügen (Standard) | Strg+V / Cmd+V | Nativer ProseMirror-Default; **intern** kopierter Inhalt via `clipboard-roundtrip.spec.ts` mitgeprüft, **externer** Inhalt ungetestet | Fügt zuverlässig an der Cursor-Position bzw. anstelle der Selektion ein (Abschnitt 3), unabhängig von der Quelle |
| 2 | Einfügen (Kontextmenü) | Rechtsklick → „Einfügen" | Nativ; „nicht unterdrückt" ist getestet | Identisches Ergebnis zu Strg+V |
| 3 | Einfügen ohne Formatierung | Strg+Umschalt+V / Cmd+Umschalt+V | **Fehlt** (Backlog `einfuegen-unformatiert` = „fehlt", Prio 2); kein Binding, kein Button | Muss ergänzt werden: reduziert auf reinen Text im Zielabsatzformat (3.7); Umsetzungsentscheidung siehe 3.10 (Datenschutz) |
| 4 | Toolbar-Button „Einfügen" | Klick | **Fehlt** | Nice-to-have, kein Blocker. Falls ergänzt: nutzt `navigator.clipboard.read()`, zeigt bei verweigerter Berechtigung eine sichtbare Fehlermeldung (nie stiller Fehlschlag, `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.4) und unterliegt der Datenschutz-Entscheidung aus 3.10 |
| 5 | Toolbar-Button „Einfügen ohne Formatierung" | Klick | Fehlt | Nice-to-have, analog #4 |
| 6 | Drag & Drop von Text/Bild aus externer Quelle | Ziehen + Ablegen | `dropCursor()`-Plugin aktiv (nur visuelle Einfügemarke), **kein** `handleDrop`; unverifiziert | Definiert festlegen: mindestens kein Crash, idealerweise gleiches Ergebnis wie Einfügen per Zwischenablage (3.6 / Abschnitt 4) |
| 7 | Touch/Mobile: „Einfügen" aus dem Betriebssystem-Auswahlmenü | Tippen | Unverifiziert | Auf „Mobile"/„Tablet"-Projekten (`playwright.config.ts`) mindestens rudimentär prüfen; native Menü-Interaktion ist eine dokumentierte Automatisierungsgrenze (siehe Abschnitt 6). **Nuance:** Das `Tablet`-Projekt (`devices['iPad Mini']`) besitzt im Gegensatz zu `Desktop Chrome`/`Mobile` **keine** `permissions: ['clipboard-read','clipboard-write']` — dort trägt nur der deterministische synthetische Paste-Event (Abschnitt 6.1), nicht der Tastenkürzel-/OS-Menü-Weg |

**Klarstellung Kontextmenü/Tastenkombination:** Da der Editor ein natives
`contenteditable` (via ProseMirror) ist, sind Strg+V und das native Rechtsklick-Menü
**immer verfügbar**, solange kein JavaScript sie unterdrückt. Die Verifikation muss
bestätigen, dass **kein** Plugin/Keymap-Eintrag diese nativen Wege blockiert — für das
Kontextmenü ist dieser Regressionsschutz bereits vorhanden und muss erhalten bleiben.

---

## 2. Geltende Randbedingungen aus der Haupt-Spezifikation

Diese Datei ergänzt, ersetzt aber nicht `FEATURE-SPEC-DOCX-ODT.md`, insbesondere:

- **Abschnitt 2** („Ausschneiden/Kopieren/Einfügen — intern **und** extern") und der dort
  geforderte Testfall 4 („Einfügen von extern kopiertem, formatiertem Text").
- **Abschnitt 2 / 20.2**, Selection-Sync-Bug: Einfügen ist ein **Hauptverdachtsfall**, da
  eine Paste-Operation die Selektion ersetzt/verschiebt. Jede Einfügen-Testsequenz muss
  zusätzlich prüfen, dass die Editor-Selektion danach konsistent ist (Tippen direkt nach
  dem Einfügen darf nichts Falsches löschen).
- **Abschnitt 18** (Import-Robustheit): das dortige Prinzip „sichtbarer Inhalt darf nie
  ersatzlos verschwinden; mindestens der reine Text bleibt erhalten" gilt für eingefügten
  Inhalt **gleichermaßen** wie für importierten.
- **Abschnitt 19** (Export-Robustheit & Rundreise) — gilt für jeden über Einfügen erzeugten
  Inhalt genauso wie für über die Toolbar erzeugten.
- **Abschnitt 20.4** („Kein stiller Fehlschlag") — uneingeschränkt.
- **README-Datenschutzprinzip** (rein client-seitig, keine Übertragung von
  Dokumentinhalten, kein `localStorage`/`IndexedDB`) — für Einfügen konkretisiert in 3.10.

---

## 3. Gewünschtes Verhalten im Detail

### 3.1 Grundfall: Einfügen an leerer Cursor-Position (keine Selektion)
- Inhalt wird **genau an der Cursor-Position** eingefügt, nicht an zufälliger Stelle.
- Text davor und danach im selben Absatz bleibt exakt erhalten (Zeichen für Zeichen,
  keine Verschiebung, keine doppelte/fehlende Leerstelle).
- Der Cursor steht nach dem Einfügen unmittelbar **hinter** dem eingefügten Inhalt.

### 3.2 Einfügen über eine bestehende Selektion
- Die Selektion wird durch den eingefügten Inhalt **ersetzt** (nicht ergänzt).
- Gilt auch für Selektionen über einen ganzen Absatz, mehrere Absätze, eine ganze
  Tabellenzelle oder das gesamte Dokument (Strg+A / `AllSelection`).
- Direkt folgendes Tippen darf sich **nicht** auf eine stale Selektion auswirken
  (Regressionsschutz, siehe Abschnitt 2).

### 3.3 Einfügen von reinem Text (Zwischenablage nur `text/plain`)
Aus Notizprogramm, Terminal, Adresszeile o. Ä. Die Zeilenumbruch-Semantik ist **verbindlich
festzulegen und zu testen** (ProseMirrors Default wickelt *jeden* `\n` in ein eigenes `<p>`
und unterscheidet nicht zwischen Leerzeile und einfachem Umbruch — das ist **nicht** das
gewünschte Verhalten):
- **Leerzeilen-getrennte Blöcke → jeweils ein eigener Absatz** (`paragraph`).
- **Einzelner Zeilenumbruch innerhalb eines Blocks → `hard_break`** (Zeilenumbruch,
  Umschalt+Enter-Äquivalent), **kein** neuer Absatz. Diese Wahl ist die einzige, die 3.1
  (Text davor/danach im selben Absatz bleibt erhalten) und diese Klartext-Regel
  widerspruchsfrei zugleich erfüllt: Klartext ohne Leerzeile mitten in einen Absatz fügt
  reinen Inline-Inhalt ein (keine neue Absatzgrenze).
- `\r\n`/`\r` werden vor der Aufteilung normalisiert.
- **Kein Zeichen darf verloren gehen** — keine abgeschnittene letzte Zeile, kein
  verschluckter erster/letzter Buchstabe (bekanntes Fehlerbild naiver Clipboard-Handler).
- **Mark-Übernahme an der Einfügemarke verbindlich festlegen:** Wird reiner Text mitten
  in einen bereits formatierten Textlauf (z. B. fett) eingefügt, ist das erwartete
  Verhalten zu bestimmen und zu testen — ProseMirrors Default übernimmt die am
  Cursor aktiven Marks (`storedMarks`/umgebende Marks), sodass der eingefügte Klartext die
  umgebende Zeichenformatierung *erbt*. Das ist das gewünschte Verhalten für den Standard-
  Strg+V (Klartext fügt sich nahtlos in den Kontext ein) und ausdrücklich der Unterschied
  zu „Einfügen ohne Formatierung" (3.7), das **jede** Zeichenformatierung — auch die geerbte
  — entfernt. Beide Fälle sind getrennt zu prüfen, damit die Abgrenzung belegt ist und nicht
  nur behauptet wird.

### 3.4 Einfügen von extern kopiertem, formatiertem HTML
Quelle z. B. Webseite, echte Microsoft-Word-Instanz, LibreOffice Writer oder eine andere
Salamanido-Instanz.
- Von `schema.ts` erkannte Formate (fett, kursiv, unterstrichen, durchgestrichen,
  Textfarbe, Hervorhebungsfarbe, Überschriften 1–6, Aufzählungs-/nummerierte Listen,
  Bilder mit direktem `src`, Zeilenumbrüche, Tabellen) müssen **sinnvoll übernommen**
  werden — sichtbar gleichwertig zur Quelle.
- Nicht abbildbare Formatierung (Word-`mso-*`-Stile, Schriftart/-größe, mehrspaltiges
  Layout, Kommentare/Änderungsverfolgung in der Zwischenablage, verschachtelte
  `div`/`span`-Wrapper ohne erkannten Stil) muss **sauber auf den nächstliegenden
  unterstützten Zustand reduziert** werden — der **Text selbst darf nie verloren gehen**,
  auch wenn die Formatierung vereinfacht wird (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 18).
- Bilder mit **externer URL** (`<img src="https://…">`, kein Data-URI): siehe 3.12 — es
  gilt ein definierter Fallback (sichtbarer Platzhaltertext, umgebender Text bleibt
  erhalten, sichtbarer, nicht-blockierender Hinweis statt stillem Verschwinden). Ein
  externer/kaputter Bildverweis darf beim Export **niemals** eine ungültige oder gar keine
  Datei erzeugen (Live-Bug 0.7).

### 3.5 Einfügen von Bild-Inhalten direkt aus der Zwischenablage (kein HTML)
- Szenario: Screenshot-Tool / „Bild kopieren" legt nur einen `image/*`-Eintrag ab (kein
  `text/html`).
- Laut Befund 0.5 erzeugt der native Pfad hier heute **kein** sichtbares Ergebnis.
- **Soll:** Bild wird — wie beim Toolbar-Weg — als `image`-Knoten mit Data-URI an der
  Cursor-Position eingefügt, mit sinnvoller Standardgröße (`FEATURE-SPEC-DOCX-ODT.md`
  Abschnitt 7). Ist dieses Verhalten nicht vorhanden, ist das **eine fehlende Funktion**,
  die — analog zum Prinzip in `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 9/17 — als solche
  **dokumentiert** werden muss, statt stillschweigend als „vorhanden" zu gelten.
- **Verbindlich wegen der asynchronen Natur des Lesevorgangs:** Ein Bild-Blob aus der
  Zwischenablage lässt sich niemals synchron in eine Data-URI umwandeln (Datei-/Blob-Lesen
  ist inhärent asynchron). Die Zielposition (Cursor-Position bzw. zu ersetzende Selektion)
  ist deshalb **im Moment des Auslösens** festzuhalten, nicht erst nach Abschluss des
  Lesevorgangs. Tippt oder klickt die Nutzerin zwischen Auslösen und Fertigstellung weiter,
  darf das Bild **weder** an eine inzwischen veraltete Position wandern **noch** frisch
  eingegebenen Text überschreiben — das gilt für den Paste-Pfad genauso wie für den
  Datei-Drop (Abschnitt 4). Siehe Grenzfall 9.

### 3.6 Einfügen in strukturierten Kontexten
- **In einer Liste** (`list_item`): eingefügter mehrabsätziger Inhalt darf die Liste nicht
  unkontrolliert aufbrechen oder Listenelemente duplizieren; eingefügte eigene Listen
  (verschachteltes `ul`/`ol`) müssen als verschachtelte Liste ankommen **oder** lesbar
  linearisiert werden (tatsächliches Verhalten befunden und dokumentiert).
- **In einer Tabellenzelle**: eingefügter Inhalt bleibt auf die Zelle beschränkt (kein
  Aufbrechen der Tabellenstruktur); eine komplette externe Tabelle in eine Zelle ist ein
  Grenzfall (verschachtelte Tabelle) — siehe Abschnitt 4.
- **Einfügen einer externen Tabelle mit verbundenen Zellen** (`colspan`/`rowspan`, z. B.
  aus Word/LibreOffice kopiert): da `colspan`/`rowspan` bereits auf Schemaebene
  (`prosemirror-tables`' `tableNodes(...)`) sowie in beiden Writern/Readern unterstützt
  sind (Abschnitt 0, Verifizierung vom 2026-07-05), ist dies **kein** Grenzfall mangelnder Abbildbarkeit, sondern ein
  konkret zu testender Normalfall — siehe Grenzfall 25.
- **Einfügen bei einer Node-Selektion** (kein Text-Cursor, sondern ein ganzer Knoten ist
  markiert — z. B. ein angeklicktes `image` oder eine per Tabellenwerkzeug selektierte
  Tabelle/Zelle): der markierte Knoten wird durch den eingefügten Inhalt **ersetzt**,
  analog zu 3.2, nicht danebengesetzt oder verworfen — siehe Grenzfall 24.
- **In einer Überschrift**: `heading` erlaubt laut Schema nur `inline*`; mehrabsätziger
  Inhalt darf keinen ungültig verschachtelten Blockinhalt erzeugen — zu prüfen, wie
  ProseMirror aufteilt (erwartet: Rest wandert in einen nachfolgenden Absatz).
- **In Kopf-/Fußzeile**, sobald diese laut `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 9 bedienbar
  sind: identisches Verhalten zum Haupttext (Nachtrag, sobald diese UI existiert).

### 3.7 Einfügen ohne Formatierung (`einfuegen-unformatiert`, aktuell „fehlt")
- Eigene Tastenkombination (Strg+Umschalt+V) und/oder Toolbar-Befehl.
- Ergebnis: reiner Text ohne jede Zeichenformatierung (kein Fett/Kursiv/Farbe/Link),
  eingefügt im **Absatzformat der Zielposition**.
- Mehrere Absätze aus der Quelle bleiben als mehrere Absätze erhalten (nur die
  Zeichenformatierung wird entfernt, nicht die Absatzstruktur). Bei mehreren neu
  entstehenden Blöcken übernimmt sinnvollerweise **nur der erste** den Blocktyp der
  Zielposition (z. B. bleibt eine Überschrift eine Überschrift), alle weiteren werden
  `paragraph` — dies als konkretes Soll festlegen und testen, nicht offen lassen.
- Datenschutz-/Umsetzungsentscheidung: siehe 3.10.

### 3.8 Undo/Redo
- Ein Einfügen-Vorgang (gleich welcher Größe, gleich welcher Quelle) ist **ein einziger
  Undo-Schritt** — Strg+Z macht die komplette Einfügung in einem Schritt rückgängig, nicht
  zeichenweise. Das gilt ausdrücklich auch für den asynchronen Bild-Blob-Pfad (3.5) und den
  Datei-Drop (Abschnitt 4): eine einzelne Transaktion, ein Undo-Eintrag.
- Nach Undo: Cursor/Selektion entspricht dem Zustand unmittelbar vor dem Einfügen.
- Redo stellt den eingefügten Zustand identisch wieder her.

### 3.9 Rückmeldeverhalten (kein stiller Fehlschlag)
- Wird das Einfügen verweigert oder schlägt fehl (verweigerte Zwischenablage-Berechtigung
  bei einem programmatischen Pfad; ein Format wird erkannt, aber nicht verarbeitet; ein
  externes Bild wird durch Platzhalter ersetzt), muss eine **sichtbare, nicht-blockierende**
  Rückmeldung erfolgen — niemals ein Tastendruck/Klick ohne jede Reaktion.
- **Ausnahme:** eine **leere** Zwischenablage beim Auslösen ist ein regulärer No-Op, keine
  Fehlermeldung nötig. „Leer" ist hier konkret definiert als: das `ClipboardEvent`/
  `DataTransfer` enthält **keinen** verwertbaren Eintrag (kein `text/plain`, kein
  `text/html`, kein `image/*`, keine `File`) — nicht etwa „nur Leerzeichen/Zeilenumbrüche
  im Text", was ein regulärer, nicht-leerer Text-Einfügefall bleibt (3.3) und **kein** Grund
  für eine No-Op-Behandlung ist. Siehe Grenzfall 23.

### 3.10 Datenschutz (verbindlich)
- Zu keinem Zeitpunkt darf eingefügter Zwischenablageninhalt geloggt, an Telemetrie/
  Fehlerberichte gesendet oder in `localStorage`/`IndexedDB` gespiegelt werden (README-
  Datenschutzprinzip). Reiner Code-Review-Punkt zusätzlich zum Verhaltenstest.
- **Klarstellung zur bestehenden Invariante (Befund 0.6):** Der native Strg+V nutzt
  `navigator.clipboard` **nicht** und ist unproblematisch. „Einfügen ohne Formatierung"
  (3.7) und ein optionaler Toolbar-Button (#4/#5) benötigen jedoch
  `navigator.clipboard.readText()`/`read()`. Da `clipboard-privacy.test.ts` diese API
  aktuell **überall** in `src` verbietet, ist **vor** der Umsetzung eine der beiden Wege
  verbindlich zu wählen und zu dokumentieren:
  1. „Einfügen ohne Formatierung" ohne `navigator.clipboard` umsetzen (z. B. über den
     nativen `paste`-Event-Pfad mit anschließender Mark-Entfernung), **oder**
  2. den Privacy-Test **eng** und **begründet** lockern (Datei in der `ALLOWED`-Liste, mit
     Kommentar), wobei die eigentliche Invariante — Zwischenablageninhalt wird
     ausschließlich lokal ins Dokument eingefügt, **niemals** protokolliert/persistiert/
     übertragen — unverändert gilt und der `readText()`-Aufruf rein lesend, ohne jede
     Speicherung, erfolgt.
  Ein stillschweigendes Aushebeln der Invariante (oder ein „grün durch Test-Aufweichung
  ohne Begründung") ist unzulässig.

### 3.11 Sicherheit — keine Skript-/Style-Injektion über eingefügtes HTML
Einfügen ist im Unterschied zu Kopieren/Ausschneiden eine **Eingangs**-Schnittstelle für
fremdes, potenziell bösartiges HTML.
- Eingefügtes `text/html` darf **niemals** aktive Inhalte in die Anwendung bringen:
  `<script>`, `<style>`, `<meta>`, `<link>`, Inline-Event-Handler (`onerror`, `onclick`, …),
  `javascript:`-URLs und Office-Conditional-Comments (`<!--[if …]>…<![endif]-->`) müssen
  entfernt bzw. neutralisiert werden.
- Die schema-basierte `parseDOM`-Verarbeitung wirkt bereits als Whitelist (unbekannte Tags/
  Attribute überleben nicht als aktive Knoten); dies allein reicht als Sicherheitsargument
  jedoch **nicht** aus und muss durch eine explizite Bereinigung vor dem Parsen **und** durch
  Tests (Injektionsversuch → kein Skript ausgeführt, umgebender Text erhalten) belegt werden.

### 3.12 Export-Robustheit nach Einfügen (Live-Bug 0.7)
- Kein über Einfügen/Drop erzeugter Knoten darf das Dokument nicht mehr exportierbar machen.
- Konkret: Ein `image`-Knoten mit **nicht-einbettbarer** Quelle (kein `data:…;base64,…`)
  darf beim DOCX-/ODT-Export **nicht** zu einer geworfenen Exception oder ungültigen Datei
  führen. Erwartetes Verhalten: das Bild wird bereits beim Einfügen durch sichtbaren
  Platzhaltertext ersetzt (3.4/3.5); zusätzlich ist der Export als zweiter Schutzwall so zu
  härten, dass eine solche Quelle in Platzhaltertext statt in einen Abbruch mündet.
- Dieser Punkt ist **Freigabevoraussetzung**, kein Nice-to-have (Abschnitt 8).

---

## 4. Grenzfälle (müssen einzeln befundet werden)

| # | Grenzfall | Erwartetes Verhalten |
|---|---|---|
| 1 | Einfügen an Position 0 (Dokumentanfang) | Inhalt erscheint vor dem bisherigen ersten Zeichen, keine führende Leerzeile |
| 2 | Einfügen am Dokumentende | Inhalt hängt korrekt an, Cursor landet danach |
| 3 | Einfügen in leeres Dokument (nur ein leerer Absatz) | Leerer Startabsatz wird sinnvoll ersetzt/erweitert, kein doppelter Leerabsatz |
| 4 | Sehr große Textmenge (mehrere Seiten) | UI friert nicht ein, Editor bleibt bedienbar, Undo bleibt ein Schritt; **zusätzlich**: die Seitenumbruch-/Paginierungsberechnung (`pageLayout.ts`/`pagination.ts`, `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 8) muss den neuen, deutlich längeren Inhalt korrekt auf mehrere Seiten verteilen — nicht nur „UI hängt nicht", sondern auch „Seitenzahl/-umbruch stimmt danach" |
| 5 | Zeichen außerhalb des BMP (Emoji, seltene Unicode-Zeichen, ZWJ-Sequenzen) | Zeichen bleiben erhalten, keine zerschnittenen Surrogatpaare |
| 6 | Tabulatorzeichen (`\t`) im Klartext | Bleibt als Tab-Zeichen erhalten, wird nicht zu Leerzeichen (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 4/15) |
| 7 | Verschachtelte Tabelle (Tabelle-in-Tabelle aus der Quelle) | Kein Absturz; mindestens linearisierter/lesbarer Inhalt (Haupt-Spez. Abschnitt 6) |
| 8 | Offene IME-Komposition beim Einfügen (asiatische Eingabemethode) | Kein Datenverlust der Komposition, kein Crash (strukturell zu begründen, nur eingeschränkt automatisierbar) |
| 9 | Wiederholtes schnelles Einfügen (mehrfach Strg+V); **sowie** der asynchrone Bild-Blob-Pfad (3.5), wenn zwischen dem Auslösen und dem Abschluss des Lesevorgangs weitergetippt oder geklickt wird | Jede Einfügung ein eigener Undo-Schritt, keine Race Condition mit der Selection-Sync-Logik. Für den Bild-Blob-Pfad zusätzlich verbindlich: die Zielposition wird **synchron beim Auslösen** festgehalten, nicht erst nach Abschluss des asynchronen Lesevorgangs — ein zwischenzeitlicher Tastendruck/Klick darf weder die Bildposition verfälschen noch frisch eingegebenen Text überschreiben |
| 10 | Fokus außerhalb des Editors (z. B. Farbwähler-/Datei-Input fokussiert) | Einfügen wirkt nur bei tatsächlich fokussiertem ProseMirror-Editor; ein Paste-Event in einem anderen Feld darf den Dokumentinhalt nicht verändern |
| 11 | Zwischenablage enthält `text/html` **und** `text/plain` mit unterschiedlichem Inhalt | HTML-Variante hat Vorrang (Standard-Browserverhalten), muss bestätigt werden |
| 12 | Bild-Zwischenablage ohne HTML (3.5) | Klar als „funktioniert" oder „fehlt" befunden, nicht offen |
| 13 | Externes `<img src="https://…">` (3.4/3.12) | Bild erscheint nicht, Platzhaltertext + sichtbarer Hinweis, umgebender Text erhalten, **Export danach schlägt nicht fehl** |
| 14 | Einfügen direkt gefolgt von Toolbar-Aktion (z. B. Fett auf den eingefügten Text) | Funktioniert wie auf jeder Selektion — Selection-Sync-Regressionstest gilt explizit mit |
| 15 | Skript-Injektionsversuch (`<img src=x onerror=…>`, `<script>…`) (3.11) | Kein Skript ausgeführt, aktive Inhalte entfernt, umgebender Text erhalten |
| 16 | Cross-Origin/Cross-App Copy-Paste aus echtem Word/LibreOffice (tatsächlich installiert, nicht simuliert) | Mindestens Klartext korrekt, Formatierung so gut wie im Schema abbildbar — **höchste inhaltliche Priorität**, da Hauptanwendungsfall |
| 17 | Zwischenablage enthält nur `text/rtf` (manche Programme legen zusätzlich RTF ab) | ProseMirror verarbeitet nur `text/html`/`text/plain`; Ergebnis (Fallback auf Klartext oder No-Op) muss befunden und dokumentiert werden, kein Absturz |
| 18 | Browser-/Plattform-Unterschiede (Chrome/Firefox/Safari-WebKit/Edge) | Kernverhalten je unterstütztem Browser mindestens einmal geprüft; bekannte Automatisierungsgrenzen (WebKit-Clipboard in Playwright) dokumentiert, nicht verschwiegen. **Harte Voraussetzung:** Die dedizierte Paste-E2E-Datei muss dem Muster `/clipboard.*\.spec\.ts/` genügen, sonst laufen die Projekte `Desktop Safari (Clipboard)`/`Desktop Firefox (Clipboard)` sie **gar nicht** an und die Cross-Browser-Abdeckung ist nur scheinbar erfüllt (siehe Abschnitt 6, Punkt 7) |
| 19 | Touch/Mobile-Einfügen über das native Auswahlmenü (Abschnitt 1, #7) | Auf Tablet/Mobile mindestens rudimentär bedienbar; native Menü-Interaktion als Automatisierungsgrenze dokumentiert |
| 20 | Eingefügter Hyperlink (`<a href="…">Text</a>`) aus Webseite/Word | Das Schema kennt **noch keine** Link-Mark (`hyperlink-einfuegen`, Backlog Prio 1, Status „fehlt"); erwartet: **sichtbarer Linktext bleibt vollständig erhalten**, die Verlinkung selbst entfällt (kein `javascript:`-Ziel überlebt, 3.11). Dieses Verhalten ist zu befunden und zu dokumentieren; sobald die Link-Mark existiert, wird der Fall auf „URL erhalten" verschärft |
| 21 | Text davor/danach mit aktiver Zeichenformatierung, dann Klartext-Einfügen (Mark-Übernahme, 3.3) | Standard-Strg+V erbt die umgebenden Marks; „Einfügen ohne Formatierung" (3.7) erbt sie nicht — beide Ergebnisse getrennt geprüft |
| 22 | Drag & Drop eines Bildes/Links aus einem anderen Browserfenster (`DataTransfer` mit `text/uri-list`, oft zusätzlich `text/html`, aber **ohne** `File`-Eintrag) | Kein Absturz; das Verhalten ist zu befunden und festzulegen: entweder identisch zu einem externen `<img src="https://…">` (Platzhaltertext + Hinweis, kein Netzwerk-Fetch, Export bricht nicht ab, 3.4/3.12) oder — falls nur `text/uri-list` ankommt — als sichtbarer Link-/URL-Text erhalten. Ein reiner URL-Drop darf weder still verschwinden noch ein nicht-einbettbares `image` erzeugen |
| 23 | Leere Zwischenablage beim Auslösen von Strg+V (kein `text/plain`, kein `text/html`, kein `image/*`, kein `File` im `DataTransfer` — z. B. nach Systemstart ohne vorherigen Kopiervorgang) | Regulärer No-Op laut 3.9-Ausnahme: Dokumentinhalt und Cursor-Position bleiben exakt unverändert, **keine** sichtbare Fehlermeldung. Abzugrenzen von einer Zwischenablage, die nur Leerzeichen/einen einzelnen Zeilenumbruch als `text/plain` enthält — das ist reiner, nicht-leerer Text (3.3) und wird regulär eingefügt |
| 24 | Einfügen, während eine **Node-Selektion** aktiv ist (kein Text-Cursor): ein per Klick markiertes `image` (`image` ist laut `schema.ts` `group: 'block'` ohne `selectable: false`, also per Default als eigener Knoten selektierbar) oder eine über die Tabellenwerkzeuge markierte Zelle/Zeile/Spalte/ganze Tabelle | Der selektierte Knoten wird durch den eingefügten Inhalt **ersetzt** (Verallgemeinerung von 3.2 auf Node- statt Text-Selektionen) — kein Nebeneinander von altem Knoten und neuem Inhalt, kein stiller Fehlschlag, kein Crash. Bei einer markierten ganzen Tabelle/Zeile/Spalte: Ergebnis konkret befunden und dokumentiert (z. B. „Tabelle wird ersetzt" vs. „Einfügen wird für diese Selektionsart abgelehnt mit sichtbarer Rückmeldung", 3.9) |
| 25 | Einfügen einer externen Tabelle mit verbundenen Zellen (`colspan`/`rowspan`, z. B. aus einer echten Word-/LibreOffice-Instanz kopiert, Grenzfall 16) | Da `colspan`/`rowspan` bereits auf Schemaebene (`prosemirror-tables`' `tableNodes(...)`) sowie in `docx`/`odt`-Writer **und** -Reader nachweislich unterstützt sind (Abschnitt 0, Verifizierung vom 2026-07-05), ist **kein** Rückfall auf eine flache Tabelle ohne Verbindung akzeptabel, ohne dass das explizit als Einschränkung dokumentiert wird — Soll ist die verbundene Struktur zu übernehmen und die Rundreise (5.2) besteht damit inklusive der Verbindung |

---

## 5. Rundreise-Anforderung

Zwei getrennte, beide verpflichtende Prüfungen.

### 5.1 Baseline-Rundreise (Regressionsschutz — darf durch Einfügen-Arbeit nicht brechen)
Existiert unabhängig vom Einfügen bereits (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 1.2/1.3/19,
`tests/e2e/docx.spec.ts`/`odt.spec.ts`, Reader/Writer-`roundtrip.test.ts`) und muss vor
**und** nach jeder Änderung an der Einfügen-Logik weiterhin bestehen:
1. Reale DOCX-Datei unverändert hochladen (kein Einfügen-Vorgang) → sofort exportieren →
   erneut importieren → Inhalt entspricht inhaltlich dem Original.
2. Dasselbe mit einer realen ODT-Datei.
3. Beide bleiben grün, nachdem an der Einfügen-Funktion etwas geändert wurde — insbesondere
   dürfen neu registrierte Paste-`EditorProps` (`transformPastedHTML`, `transformPasted`,
   `handleDrop`, …) nicht mit `columnResizing()`/`tableEditing()`/`dropCursor()`/
   `gapCursor()`/Pagination kollidieren und nicht beim reinen Import/Anzeigen greifen.

### 5.2 Feature-Rundreise (Einfügen selbst)
Für **jede** Kombination unten: per Zwischenablage einfügen → als DOCX exportieren →
reimportieren → Inhalt/Formatierung erhalten; **und** identisch als ODT:
1. Reiner mehrabsätziger Text (inkl. `hard_break` aus einfachem Zeilenumbruch, 3.3).
2. Formatierter Text (fett, kursiv, unterstrichen, durchgestrichen, Textfarbe,
   Hervorhebungsfarbe) aus externer HTML-Quelle.
3. Überschriften (mind. zwei Ebenen) aus externer Quelle.
4. Aufzählungs- und nummerierte Liste aus externer Quelle.
5. Bild (Data-URI-`<img>`) aus externer Quelle **sowie** Bild-Blob (3.5) — muss als
   eingebettetes Bild die Rundreise überstehen.
6. Ergebnis von „Einfügen ohne Formatierung" (sobald implementiert, 3.7).
7. Einfügen **innerhalb** einer bestehenden Tabellenzelle bzw. eines Listenpunkts (Struktur
   muss die Rundreise überstehen, nicht nur der reine Text).
8. Externes `<img src="https://…">` (3.12): Export **wirft nicht**, exportierte Datei
   enthält den Platzhaltertext statt Bild-XML, Reimport ergibt lesbaren Text.
9. Tab-Zeichen (Grenzfall 6): bleibt nach Export/Reimport erhalten.
10. Doppelte Rundreise an einem Dokument, das mehrere obige Ergebnisse gleichzeitig
    enthält (kumulativer Verlust prüfen, analog `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 19,
    Testfall 3).
11. Externe Tabelle mit verbundenen Zellen (`colspan`/`rowspan`, Grenzfall 25) — Verbindung
    bleibt nach Export/Reimport erhalten, nicht nur die flachen Zellinhalte.
12. Mindestens eine der obigen Kombinationen zusätzlich durch die bereits bestehende
    **externe** Validierung laufen lassen (`src/formats/docx/__tests__/external-validation.test.ts`,
    `src/formats/odt/__tests__/external-validation.test.ts`) statt sich ausschließlich auf
    den eigenen Reader zu verlassen (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 19) — sonst
    besteht die Gefahr, dass sich ein Schreibfehler im Writer und ein passender Lesefehler
    im eigenen Reader gegenseitig unsichtbar ausgleichen und die Rundreise fälschlich grün
    erscheint.

### 5.3 Cross-Format-Rundreise — Anforderung, aktuell durch fehlende Abhängigkeit blockiert
Ziel-Anforderung: in ein ursprünglich als DOCX importiertes Dokument einfügen und als ODT
exportieren (und umgekehrt), ohne kumulativen Textverlust.
- **Ehrliche Einschränkung:** Cross-Format-Export ist heute **nicht** möglich, weil das
  Feature „Zielformat beim Export wählen" (Backlog `speichern-unter-format`, Status
  „fehlt", Prio 2) noch nicht existiert — der Export erfolgt immer im Ursprungsformat.
  Entsprechend sind die Cross-Format-Fälle in `clipboard-roundtrip.spec.ts` als
  `test.fixme` (blockiert) hinterlegt.
- Diese Anforderung bleibt bestehen, ist aber bis zur Umsetzung von `speichern-unter-format`
  als **zurückgestellt** zu kennzeichnen. Bis dahin wird sie durch die
  **gleich**-Format-Rundreisen (5.2) plus die formatunabhängige Reader/Writer-Cross-Content-
  Prüfung abgedeckt. Sie darf **nicht** stillschweigend als erfüllt markiert werden.

**Abnahmekriterium:** Formatierungsverluste bei Cross-Format sind zu dokumentieren und
akzeptabel; **Textverlust ist es nicht** — weder bei 5.1 noch 5.2 noch 5.3.

---

## 6. Testplan-Hinweise (E2E, Playwright)

Aufbau wie die bestehenden Suiten (`tests/e2e/clipboard.spec.ts`, `cut.spec.ts`,
`selection-regression.spec.ts`): `page.goto('/')` → Privacy-Banner wegklicken → Dokument
per „Neu erstellen" öffnen → `page.locator('.ProseMirror')`. Für Einfügen zusätzlich:

1. **Bevorzugt — deterministisch, ohne OS-Zwischenablage/Berechtigungen:** im
   Browser-Kontext ein `ClipboardEvent('paste', { clipboardData: <DataTransfer> })` bzw.
   `DragEvent('drop', …)` direkt auf das fokussierte `.ProseMirror`-Element dispatchen
   (`page.evaluate(...)`), mit frei wählbarem `text/html`- und/oder `text/plain`-Inhalt und
   für 3.5/Drop mit einem echten `File`/`Blob`. Plattform- und browserunabhängig stabil,
   bildet exakt ProseMirrors Paste-Pfad nach.
2. **Ergänzend — realistischer, weniger portabel:** `context.grantPermissions(['clipboard-read','clipboard-write'])`
   plus `navigator.clipboard.writeText(...)` und echtes `page.keyboard.press('ControlOrMeta+V')`.
   Bekannte, im Repo bereits dokumentierte Einschränkung: Clipboard-Permissions/-API sind in
   Playwrights WebKit/Firefox unzuverlässig — die bestehenden Copy-/Cut-Tests überspringen den
   Tastenkürzel-Rundlauf dort explizit (`SKIP_WEBKIT_ROUNDTRIP`). Für „Desktop Chrome"
   verpflichtend, für „Mobile"/„Tablet" nice-to-have. Diese Grenze ist zu **dokumentieren**,
   nicht zu verschweigen.
3. **Manuell/exploratory:** mindestens einmal aus einer echten, lokal installierten Word-
   oder LibreOffice-Writer-Instanz formatierten Text kopieren und einfügen (Grenzfall 16) —
   automatisiertes Vortäuschen von „Word-HTML" deckt die reale `mso-*`-Stil-Suppe nicht ab.
   Ergebnis (wer, wann, Version, Ausgang) protokollieren.
4. Jeder Einfügen-Test führt direkt im Anschluss eine Tipp-/Formatierungsaktion aus und
   prüft deren korrektes Ergebnis (Selection-Sync-Regressionsschutz, Abschnitt 2), nicht nur
   den Zustand unmittelbar nach dem Einfügen.
5. Rundreise-Tests (Abschnitt 5) laufen als Reader/Writer-Unit-Tests **und** als E2E-Test
   über echte Bedienung inkl. echtem Datei-Download/-Upload — reine
   `ProseMirrorJSON`-Fixtures reichen nicht (Haupt-Spez. Abschnitt 17/21).
6. Der Selection-Sync-Regressionstest mit **Paste** als auslösender Aktion gehört dauerhaft
   in `selection-regression.spec.ts` (im bestehenden Regressions-Describe-Block), nicht nur
   in eine neue `paste.spec.ts`.
7. **Verbindliche Namenskonvention der Paste-E2E-Datei.** `playwright.config.ts` bindet die
   Cross-Browser-Projekte `Desktop Safari (Clipboard)` und `Desktop Firefox (Clipboard)` über
   `testMatch: /clipboard.*\.spec\.ts/` (die übrigen Projekte laufen nur auf Chromium/Mobile/
   Tablet). Damit die WebKit-/Firefox-Abdeckung aus Grenzfall 18 **tatsächlich** greift, muss
   die dedizierte Paste-Spec einen Dateinamen mit `clipboard`-Präfix tragen (z. B.
   `clipboard-paste.spec.ts`) — eine Datei namens `paste.spec.ts` liefe **still** nur auf
   Chromium/Mobile/Tablet und täuschte eine Cross-Browser-Prüfung nur vor. Dieser Punkt ist
   Teil des Abnahmekriteriums (Abschnitt 8.3), nicht bloß eine Stilfrage.

---

## 7. Test-/Status-Matrix — Zusammenfassung (Ist gegen Soll)

| Bereich | Unit (Reader/Writer/Parser) | E2E (echte Bedienung) | Rundreise (Datei) | Ist-Status |
|---|---|---|---|---|
| Nativer Strg+V, **intern** kopierter Inhalt | n/a | vorhanden (`clipboard-roundtrip.spec.ts`) | vorhanden (gleich-Format) | überwiegend abgedeckt |
| Kontextmenü nicht unterdrückt | n/a | vorhanden | n/a | abgedeckt |
| Klartext-Semantik (Leerzeile vs. `hard_break`) | **fehlt** | **fehlt** | **fehlt** | offen |
| Externes formatiertes HTML (Marks/Listen/Tabellen) | **fehlt** | **fehlt** | **fehlt** | offen |
| Sicherheits-Bereinigung (Skript/Style/Conditional-Comment) | **fehlt** | **fehlt** | n/a | offen |
| Externes Bild → Platzhalter, Export bricht nicht ab (0.7/3.12) | **fehlt** | **fehlt** | **fehlt** | **offen, Live-Bug** |
| Bild-Zwischenablage ohne HTML (3.5) | **fehlt** | **fehlt** | **fehlt** | offen |
| Einfügen ohne Formatierung (3.7) | **fehlt** | **fehlt** | **fehlt** | offen (Feature fehlt) |
| Undo/Redo als ein Schritt (3.8) | **fehlt** | **fehlt** | n/a | offen |
| Struktur-Kontexte (Liste/Tabelle/Überschrift) | **fehlt** | **fehlt** | **fehlt** | offen |
| Selection-Sync × Paste-Regressionstest | n/a | **fehlt** (bestehender Test deckt Toolbar+Klick+Enter, nicht Paste) | n/a | offen |
| Datenschutz (kein Logging; `navigator.clipboard`-Entscheidung 3.10) | vorhanden (`clipboard-privacy.test.ts`) | n/a | n/a | vorhanden, aber bei 3.7-Umsetzung neu zu bewerten |
| Cross-Format-Rundreise (5.3) | teilweise (Cross-Content-Unit) | blockiert (`speichern-unter-format` fehlt) | blockiert | zurückgestellt |
| Browser-/Touch-Matrix (Grenzfall 18/19) | n/a | teilweise (dokumentierte WebKit-Grenze) | n/a | teilweise |

**Fazit:** Für den **externen** und **Nicht-Text**-Anteil von „Einfügen" existiert derzeit
**keine** Absicherung, und ein realer Export-Absturz (0.7) ist offen. Der native Strg+V für
intern kopierten Inhalt ist der einzige bereits belegte Teilbereich. Der Backlog-Status
„vorhanden" ist damit nicht gerechtfertigt.

---

## 8. Freigabekriterium & offene Entscheidungen

### 8.1 Verbindliche Entscheidungen (aus der Verifikation abgeleitet, hier als Soll fixiert)
- **Klartext-Zeilenumbruch:** Leerzeile → neuer Absatz; einfacher Umbruch → `hard_break`
  (3.3).
- **Externes Bild:** kein Netzwerk-Fetch; Ersetzung durch sichtbaren Platzhaltertext +
  nicht-blockierenden Hinweis; Export zusätzlich gehärtet (3.4/3.12).
- **Kontextmenü:** kein eigenes Kontextmenü; natives Menü bleibt, Nicht-Unterdrückung ist
  regressionsgesichert (Abschnitt 1, #2).
- **Toolbar-Buttons #4/#5:** Nice-to-have, **kein** Blocker für die Freigabe von
  `einfuegen`.
- **„Einfügen ohne Formatierung"/Datenschutz:** Umsetzungsweg nach 3.10 verbindlich wählen
  und dokumentieren, bevor Code entsteht.

### 8.2 Offene Punkte, die vor „vorhanden" beantwortet sein müssen
1. Wird `navigator.clipboard` für 3.7/#4 verwendet (dann Privacy-Test eng + begründet
   anpassen) oder bewusst vermieden? — Entscheidung hier nachtragen.
2. Ist Safari/WebKit Teil der unterstützten Browsermatrix? Falls ja, gesonderte
   Verifikation trotz Playwright-Clipboard-Grenzen.
3. Tatsächliches Verhalten bei verschachtelter eingefügter Liste/Tabelle und bei
   mehrabsätzigem Paste in eine Überschrift (3.6) — beobachtetes Verhalten festhalten, nicht
   annehmen.
4. Cross-Format-Rundreise (5.3): bleibt zurückgestellt bis `speichern-unter-format`
   existiert — Abhängigkeit im Backlog verlinken.

### 8.3 Der Backlog-Status von `einfuegen` darf erst wieder auf „vorhanden" (unqualifiziert), wenn:
- alle offenen Bereiche der Matrix (Abschnitt 7) als automatisierte, dauerhaft in der Suite
  verbleibende Tests vorliegen und grün sind,
- die Grenzfälle aus Abschnitt 4 einzeln befundet sind (funktioniert / dokumentiert nicht
  unterstützt / repariert),
- der **Live-Export-Bug 0.7/3.12** geschlossen und durch Unit- **und** E2E-Test gedeckt ist
  **und** `npm run build` (`tsc -b`, wegen `noUnusedLocals`/`noUnusedParameters`) danach
  fehlerfrei durchläuft,
- die Sicherheits-Bereinigung (3.11) durch einen Injektions-Test belegt ist,
- die Datenschutz-Entscheidung (3.10) getroffen, dokumentiert und die Invariante
  (kein Logging/Persistieren/Übertragen) durch Test/Review gesichert ist,
- die Baseline-Rundreise (5.1) nicht gebrochen wurde und die Feature-Rundreise (5.2) für
  DOCX **und** ODT besteht, inklusive der verbundenen Tabellenzellen (5.2 Punkt 11) und
  mindestens einmal über die bestehende externe Validierung (5.2 Punkt 12),
- der Selection-Sync-Regressionstest mit **Paste**-Sequenz existiert und grün ist,
- Cross-Format (5.3) entweder erfüllt **oder** ausdrücklich als „blockiert durch
  `speichern-unter-format`" dokumentiert ist,
- die Paste-E2E-Datei der Namenskonvention `/clipboard.*\.spec\.ts/` genügt und die
  Cross-Browser-Projekte (`Desktop Safari (Clipboard)`/`Desktop Firefox (Clipboard)`) sie
  nachweislich anlaufen (Abschnitt 6, Punkt 7 / Grenzfall 18) — eine nur auf Chromium
  laufende Paste-Suite gilt für die Browser-Matrix als **nicht** erfüllt.

Andernfalls ist der Status auf **teilweise** zu setzen und die konkret fehlenden Teilpunkte
sind hier nachzutragen (analog `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 17/21). „Einfügen ohne
Formatierung" (`einfuegen-unformatiert`) wechselt nur dann von „fehlt", wenn 3.7 samt 3.10
umgesetzt und getestet ist.
