# Anforderungsspezifikation & Testplan: Feature „Kopieren“

Status: **Laut Feature-Backlog „vorhanden“ — gilt als nicht vertrauenswürdig, muss
vollständig verifiziert werden**, bevor der Status bestätigt werden darf. Diese Fassung
ist ein **erneuter, kritischer Verifikationsdurchlauf**: seit der ersten Fassung dieses
Dokuments existiert projekteigener Kopier-Code **und** eine Testsuite (siehe Abschnitt 0).
Dieser Durchlauf übernimmt diese Implementierung **nicht ungeprüft**, sondern legt fest,
was unabhängig nachgewiesen sein muss, damit „vorhanden“ auf „verifiziert“ wechseln darf.

Bezug: `E:\docs\specs\FEATURE-BACKLOG.md`, Abschnitt 2.1 „Zwischenablage“, Slug
`kopieren`, Priorität **1** (essenziell/fundamental). Backlog-Beschreibung: „Kopiert die
Selektion in die Zwischenablage.“ Stil und Tiefe orientieren sich an
`E:\docs\FEATURE-SPEC-DOCX-ODT.md`.

Geltungsbereich: Es geht ausschließlich um **Kopieren** (Selektion → Zwischenablage,
Dokument bleibt unverändert). Ausschneiden (`ausschneiden`) und Einfügen (`einfuegen`)
sind eigene Backlog-Einträge mit eigenem Verifikationsbedarf (siehe
`specs/ausschneiden-req.md`, `specs/einfuegen-req.md`), werden hier aber an den Stellen
mitbehandelt, an denen ohne sie keine Aussage über Kopieren möglich ist — der Erfolg
eines Kopiervorgangs ist nur durch anschließendes Einfügen/Auslesen der Zwischenablage
prüfbar, und Ausschneiden teilt sich mit Kopieren denselben Serialisierungspfad
(`prosemirror-view` bindet intern `handlers.copy = editHandlers.cut`, verifiziert im
installierten Paketquelltext).

---

## 0. Ist-Zustand (verifizierte Bestandsaufnahme im Code)

Geprüft am aktuellen Stand: `src/formats/shared/editor/WordEditor.tsx`,
`src/formats/shared/editor/Toolbar.tsx`, `src/formats/shared/editor/commands.ts`,
`src/formats/shared/editor/clipboard.ts`, `src/formats/shared/schema.ts`,
`playwright.config.ts`, `tests/e2e/*.spec.ts`, `src/**/__tests__/*`, `README.md`.

**Wichtig — die erste Fassung dieses Dokuments war an dieser Stelle überholt.** Sie
behauptete, es existiere „kein einziger projekteigener Code-Pfad für Kopieren“ und „keine
einzige automatisierte Testabdeckung“. Beides ist **nicht mehr zutreffend**. Der tatsächliche
Stand:

- **Projekteigener Kopier-Code existiert.** `src/formats/shared/editor/clipboard.ts`
  stellt einen `clipboardTextSerializer` bereit (Klartext-Repräsentation für Tabellen,
  Listen und Zeilenumbrüche) und ist in `WordEditor.tsx` als `EditorProps.clipboardTextSerializer`
  verdrahtet. Zusätzlich setzt `schema.ts` `hard_break.leafText = () => '\n'`, damit
  Zeilenumbrüche in der Klartext-Zwischenablage nicht verlorengehen.
- **Kopieren läuft — bewusst — ausschließlich über den nativen Pfad.** In der Keymap
  (`WordEditor.tsx`) sind `Mod-c`/`Mod-x`/`Mod-v` **absichtlich nicht** gebunden;
  Kopieren/Ausschneiden/Einfügen werden vom nativen `copy`/`cut`/`paste`-Handler von
  `prosemirror-view` auf der `contenteditable`-Fläche verarbeitet. Es gibt **keinen**
  eigenen `navigator.clipboard`-Aufruf im gesamten Projekt (siehe Abschnitt 1 und
  Datenschutzprinzip unten) — das ist gewollt und wird per Test abgesichert.
- **Es gibt keinen Toolbar-Button „Kopieren“ — bewusst nicht** (Entscheidung in
  Abschnitt 1 und 8). `Toolbar.tsx` enthält einen Button „Ausschneiden“ (Scheren-SVG,
  deaktiviert bei leerer Selektion, mit sichtbarer Fehlerrückmeldung) — dieser gehört zum
  Feature `ausschneiden`, **nicht** zu Kopieren, und darf nicht mit einem Kopier-Button
  verwechselt werden.
- **Testabdeckung existiert bereits** (muss aber in diesem Durchlauf unabhängig als
  ausreichend und grün bestätigt werden, siehe Abschnitt 7):
  - Unit: `src/formats/shared/editor/__tests__/clipboard.test.ts` (Serializer: 2×2-Tabelle
    tab-/zeilengetrennt, `colspan`/`rowspan`, Bullet-/nummerierte/verschachtelte Liste,
    `hard_break`→Zeilenumbruch, Mehrblock-Trennung, leere Slice ohne Exception).
  - Unit: `src/formats/shared/editor/__tests__/clipboard-privacy.test.ts` (statischer Scan:
    **kein** `navigator.clipboard`-Zugriff in `src/`).
  - Unit: `src/formats/shared/__tests__/cross-format-clipboard-content.test.ts`
    (Text-Parität DOCX vs. ODT für ein Kopier-typisches Dokument).
  - E2E: `tests/e2e/clipboard.spec.ts` und `tests/e2e/clipboard-roundtrip.spec.ts`
    (echte Browser-Bedienung mit echter System-Zwischenablage).
  - E2E: `tests/e2e/selection-regression.spec.ts` enthält eine **Kopier-Variante** des
    Selection-Sync-Regressionstests.
  - `playwright.config.ts` enthält gescopte Zusatzprojekte „Desktop Safari (Clipboard)“ und
    „Desktop Firefox (Clipboard)“ für die Browsermatrix.
- **Datenschutzprinzip laut `README.md` (Zeilen 11–12):** kein Server, keine Übertragung
  von Dateiinhalten, kein `localStorage`, kein `IndexedDB`, keine Cookies mit
  Dokumentdaten. Für Kopieren gilt daraus abgeleitet: **niemals** Zwischenablageninhalt
  protokollieren, an Telemetrie/Fehlerberichte weiterreichen oder außerhalb der
  System-Zwischenablage des Nutzergeräts persistieren.

**Fazit Bestandsaufnahme:** „vorhanden“ ist inzwischen mehr als ein reiner Bibliotheks-
Default — es gibt gezielten Code (Klartext-Serialisierung, `leafText`-Fix) und eine
Testsuite. Der Status bleibt dennoch **nicht vertrauenswürdig**, bis dieser Durchlauf
jeden Punkt unten unabhängig gegenprüft (nicht nur den Testberichten glaubt): dass die
Tests tatsächlich grün sind, dass sie das hier geforderte SOLL abdecken (nicht nur einen
Teil), und dass die in Abschnitt 4/7 als **blockiert** markierten Lücken (Cross-Format-
Export-UI) klar als solche geführt werden — nicht als „bestanden“ getarnt.

---

## 1. Bedienelemente / Auslöser für Kopieren

Jeder unterstützte Weg muss zum **identischen** Ergebnis führen (gleicher
Zwischenablageninhalt, gleiches Verhalten, keine Dokumentänderung):

| # | Auslöser | Aktueller Stand | Soll |
|---|---|---|---|
| 1 | Strg+C (Windows/Linux) | nativer `prosemirror-view`-Handler, `Mod-c` bewusst nicht in Keymap | Muss funktionieren; darf durch kein eigenes Keymap-Binding verdeckt/blockiert werden. Verifiziert per E2E (`clipboard.spec.ts`, Testfall 1). |
| 2 | Cmd+C (macOS) | nativer Handler | Muss identisch zu Strg+C funktionieren (Playwright: `ControlOrMeta+c`). |
| 3 | Rechtsklick → natives Kontextmenü „Kopieren“ | vorhanden (nativ), **kein** eigenes Kontextmenü, **kein** `contextmenu`-`preventDefault()` | Muss erreichbar bleiben; kein App-Handler darf das Menü unterdrücken. Regressionsgesichert (`clipboard.spec.ts`, Testfall 3/4; Grenzfall 13). |
| 4 | Toolbar-Button „Kopieren“ | **bewusst nicht vorhanden** | **Entscheidung: kein Button.** Begründung: Die Toolbar ist bewusst auf Befehle beschränkt, die *ohne* Tastenkombination/Kontextmenü gar nicht existierten (Fett, Ausrichtung, Farbe, Liste, Tabelle, Bild). Auch Rückgängig/Wiederholen haben **keinen** Button (nur Keymap). Kopieren hat — wie Undo/Redo — einen vollständigen nativen Weg; ein Button könnte ohnehin nur `execCommand('copy')` auslösen (funktional identisch zu Strg+C) und brächte nur Wartungsaufwand (Fokus, Disabled-Zustand, i18n) ohne Fähigkeitsgewinn. (Analog, aber **abweichend** von `ausschneiden`: Ausschneiden hat einen Button, weil es destruktiv ist, eine sichtbare Fehlerrückmeldung braucht und `Shift-Delete`/`execCommand('cut')` erfordert.) |
| 5 | Menüband-/Ribbon-Eintrag „Start → Zwischenablage → Kopieren“ | nicht vorhanden | **Entfällt bewusst:** Die App hat kein Ribbon-Menüsystem, nur eine flache Toolbar. Keine stille Lücke — hier explizit dokumentiert. |
| 6 | Touch-Gerät: Auswahlgriffe + „Kopieren“ aus dem mobilen Kontextmenü | teil-verifiziert | Auf Touch-Viewport (Playwright-Projekte „Mobile“/Pixel 7 = Chromium, „Tablet“/iPad Mini = WebKit) muss zumindest die Tastatur-/Zwischenablage-Mechanik unter Touch-Emulation funktionieren. Das native mobile Auswahl-Popup selbst ist aus Playwright nicht antippbar — **dokumentierte Automatisierungsgrenze** (`clipboard.spec.ts`, Tablet-Testfall), kein stiller blinder Fleck. |
| 7 | Sekundäres Windows-Kürzel Strg+Einfg (Ctrl+Insert) | ungeprüft, keine eigene Bindung | Verifizieren, ob der Browser das nativ auf `copy` abbildet; falls nicht, **bewusst als „nicht unterstützt“ dokumentieren**, statt stillschweigend nichts zu tun. |
| 8 | Programmatischer Zugriff der App über `navigator.clipboard` | **nicht vorhanden, nicht vorgesehen** | Bewusst **kein** Soll-Verhalten. Kopieren erfolgt ausschließlich über native Browser-Mechanismen; die App ruft **an keiner Stelle** `navigator.clipboard.writeText/write/read` auf (Datenschutz/Architektur, siehe Abschnitt 0 und `clipboard-privacy.test.ts`). Diese Zeile ist die verbindliche Nicht-Soll-Festlegung, auf die sich `clipboard.ts` und `WordEditor.tsx` im Code beziehen. |

**Testfälle**
1. Strg+C bei vorhandener Selektion → Zwischenablage enthält den selektierten Inhalt
   (nachweisbar durch anschließendes Einfügen an anderer Stelle/in anderes Programm),
   Dokument bleibt unverändert.
2. Cmd+C auf macOS analog (Playwright `ControlOrMeta+c` deckt beide ab).
3. Rechtsklick → natives Kontextmenü öffnet sich, „Kopieren“ funktioniert.
4. Kein globaler `contextmenu`-Handler der App unterdrückt das Menü
   (`event.defaultPrevented === false`; Grep-/E2E-Check, muss Dauerzustand bleiben).
5. Touch-Viewport: Selektion + Kopieren/Einfügen funktioniert unter Touch-Emulation
   (Mobile/Chromium vollständig; Tablet/WebKit im Rahmen der dokumentierten Grenze).
6. Strg+Einfg: entweder als funktionierender Zweitweg nachgewiesen **oder** als „nicht
   unterstützt“ dokumentiert — keine kommentarlose Lücke.
7. Statischer Nachweis, dass **kein** `navigator.clipboard`-Aufruf in `src/` existiert
   (`clipboard-privacy.test.ts`).

---

## 2. Gewünschtes Verhalten im Detail

### 2.1 Grundverhalten
- Kopieren verändert das Dokument **nicht** (im Gegensatz zu Ausschneiden). Nach dem
  Kopieren sind Inhalt, Selektion und Cursor-Position **exakt unverändert**. Dies ist beim
  reinen `copy`-Pfad strukturell garantiert: `prosemirror-view` ruft im Copy-Zweig weder
  `dispatch` noch `setSelection` auf (nur der `cut`-Zweig löscht anschließend) — muss aber
  per Regressionstest gegen versehentliche künftige Änderungen abgesichert bleiben.
- Kopieren erzeugt **keinen** Undo-Eintrag (keine Transaktion). Ein Strg+Z unmittelbar
  nach einem Kopiervorgang wirkt auf die letzte tatsächliche Inhaltsänderung, nicht auf
  „Kopieren rückgängig machen“.
- Ist die Selektion leer (nur Cursor, kein markierter Text), passiert beim Auslösen von
  Strg+C **nichts** — insbesondere wird **nicht** automatisch die aktuelle Zeile/der
  aktuelle Absatz kopiert, und der bisherige Zwischenablageninhalt bleibt **unangetastet**
  (Word/LibreOffice-Konvention: leere Selektion → No-Op). Als Soll festgelegt und per Test
  abzusichern.
- Die Zwischenablage wird beim Kopieren mit **mehreren Repräsentationen** befüllt
  (Multi-MIME) durch den nativen ProseMirror-Handler:
  - `text/html` — die Selektion als HTML-Fragment inkl. Inline-Formatierung (über den
    Standard-`DOMSerializer` aus den `toDOM`-Definitionen des Schemas), geeignet zum
    Einfügen in Rich-Text-Ziele (dieselbe App, Word, LibreOffice Writer, Google Docs,
    E-Mail-Editoren).
  - `text/plain` — reine Textrepräsentation, für die das Projekt einen **eigenen**
    `clipboardTextSerializer` (`clipboard.ts`) setzt, damit strukturierte Inhalte nicht zu
    einer ununterscheidbaren Absatzkette zerfallen (siehe 2.2, Klartext-Spalte). Geeignet
    für Adresszeile, Terminal, Editoren ohne Rich-Text.
- Kopieren funktioniert für **jede** Selektionsart aus `FEATURE-SPEC-DOCX-ODT.md`
  Abschnitt 2: Maus-Ziehauswahl (`TextSelection`), Doppelklick (Wort), Dreifachklick
  (Absatz), Umschalt+Pfeil, Strg+A (`AllSelection`), Bildauswahl (`NodeSelection`),
  Zellauswahl (`CellSelection` aus `prosemirror-tables`).

### 2.2 Formatierte und strukturierte Inhalte
Kopieren muss für jede der folgenden Formatierungen/Strukturen den Inhalt **inklusive**
seiner Formatierung in `text/html` übernehmen und in `text/plain` eine **sinnvolle,
strukturierte** Klartextform liefern:

| Inhalt | `text/html` (Rich-Text-Ziele) | `text/plain` (Klartext-Ziele) |
|---|---|---|
| Fett/Kursiv/Unterstrichen/Durchgestrichen | entsprechendes Inline-Tag (`strong`/`em`/`u`/`s`) | reiner Text |
| Schriftfarbe (`textColor`) / Hervorhebung (`highlight`) | `span` mit `color`/`background-color`, Farbwert **exakt** erhalten | reiner Text |
| Absatzausrichtung / Formatvorlage (Überschrift 1–6) | Blockstruktur erkennbar (`<h1>`–`<h6>`, `<p style="text-align:…">`) | Blöcke durch Leerzeile getrennt |
| Listen (Bullet/nummeriert, ein-/mehrstufig) | `<ul>`/`<ol start>`/`<li>`-Struktur | `- `/`n. `-Marker, verschachtelte Ebenen eingerückt, **nicht** flache Absatzkette |
| Tabellen (ganze Tabelle, Zellbereich, Zeilen-/Spaltenausschnitt) | `<table>`/`<tr>`/`<td>` inkl. `colspan`/`rowspan` | Zellen tab-getrennt, Zeilen zeilengetrennt (`A1\tB1\nA2\tB2`), **nicht** je Zelle eine eigene Zeile |
| Bilder (`image`) | eigenständiges `<img>`-Element, nicht nur Platzhaltertext | leer (ProseMirror-Standard; kein Textverlust im umgebenden Text) |
| Zeilenumbruch (`hard_break`, Umschalt+Enter) vs. Absatzumbruch | `<br>` vs. neuer Block | `\n` (durch `hard_break.leafText`) vs. Leerzeile — bleiben unterscheidbar |
| Hoch-/Tiefstellen, Schriftart/-größe, Hyperlink | **noch nicht im Schema** — „sobald implementiert“ analog erhalten | — |
| Tab-Zeichen im Fließtext | **derzeit N/A** — es gibt keinen In-App-Weg, ein `\t` per Tastatur einzufügen (Tab wechselt Fokus / Zellnavigation), und die Reader erkennen `w:tab`/`text:tab` nicht. Der Testfall ist erst nach Einführung eines Tabstopp-Features sinnvoll ausführbar; Datenmodell-Rundreise für `\t` bleibt separat abgedeckt (`docx/__tests__/roundtrip.test.ts`). |

**Testfälle**
1. Für jede umsetzbare Zeile: Inhalt anlegen → markieren → kopieren → an anderer Stelle im
   selben Dokument einfügen → Ergebnis entspricht dem Original (Formatierung, Struktur).
2. Kombination mehrerer Formate im selben Textlauf (fett **und** farbig **und**
   hervorgehoben) kopieren → alle drei bleiben nach dem Einfügen erhalten
   (`clipboard.spec.ts`, Testfall 2.2/2).
3. Teilselektion, die exakt an einer Formatgrenze beginnt/endet (z. B. nur die
   nicht-fette zweite Hälfte eines teils fett gesetzten Wortes) → Formatgrenze bleibt
   korrekt, kein Verrutschen um ein Zeichen (`clipboard.spec.ts`, T-5).
4. Selektion über mehrere Blocktypen (Überschrift + Standardabsatz + Liste) → alle bleiben
   nach Einfügen unterscheidbar (`clipboard.spec.ts`, Testfall 2.2/4).
5. Tabelle als `text/plain` in ein unabhängiges natives `<textarea>` einfügen → zeigt
   tab-/zeilengetrennte Struktur; Liste ebenso mit `- `-Markern (T-14a/T-14b).
6. `navigator.clipboard.read()` nach Kopieren mit Formatierung enthält **sowohl**
   `text/html` **als auch** `text/plain` (nur Desktop Chrome technisch prüfbar, T-15).

### 2.3 Kopieren innerhalb vs. außerhalb der App
- **Intern** (kopieren + einfügen innerhalb derselben Editor-Instanz): verlustfrei für
  alle Merkmale aus 2.2.
- **App → externes Ziel** (Word, LibreOffice Writer, E-Mail, `<textarea>`): mindestens der
  Text bleibt vollständig erhalten; Grundformatierung wird via `text/html` übernommen,
  sofern das Ziel HTML-Einfügung unterstützt; ein Klartext-Ziel erhält sinnvollen,
  strukturierten Text ohne HTML-Tag-Reste/Steuerzeichen-Müll.
- **Externes Ziel → App** (Kopieren aus Word/LibreOffice/Webseite, Einfügen in Salamanido):
  Aufgabe des Backlog-Eintrags `einfuegen`; hier nur relevant, soweit der Rundreise-Test in
  Abschnitt 4 beide Richtungen verkettet.

**Testfälle**
1. Formatierten Text aus Salamanido in ein HTML-fähiges Ziel einfügen → Text vollständig,
   Grundformatierung sinnvoll übernommen.
2. Denselben Inhalt in ein reines Klartextfeld einfügen → lesbarer, strukturierter
   Klartext ohne sichtbare Tags.
3. Bild aus dem Editor kopieren, in eine bildfähige externe Anwendung einfügen → Bild
   kommt an (soweit das Ziel Bild-Einfügung aus der Zwischenablage unterstützt).

---

## 3. Zusammenspiel mit anderen Funktionen (Interferenzen)

- **Selection-Sync-Bug (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 2/20):** Kopieren darf die
  interne ProseMirror-Selektion nicht verändern/invalidieren. Nach einem Kopiervorgang
  muss ein nachfolgender Klick zum Neupositionieren weiterhin korrekt funktionieren
  (`reconcileSelectionOnClick` in `WordEditor.tsx` darf nicht durch ein zwischenzeitliches
  Kopieren gestört werden). **Pflicht-Regressionstest** existiert bereits als Kopier-Variante
  in `selection-regression.spec.ts` und muss dauerhaft grün bleiben.
- **Toolbar-Aktionen unmittelbar vor Kopieren:** z. B. Fett anwenden → kopieren → Ergebnis
  enthält die frisch angewendete Formatierung (kein Race zwischen Zustandsupdate und
  Clipboard-Serialisierung).
- **Undo/Redo:** Kopieren erzeugt **keinen** Undo-Schritt (siehe 2.1); Test: Kopieren,
  danach Strg+Z → Undo betrifft die letzte inhaltliche Änderung (`clipboard.spec.ts`,
  Testfall 3/3).
- **Tabellen-Zellauswahl (`prosemirror-tables`):** Kopieren einer `CellSelection` (mehrere
  **ganze** Zellen markiert) muss eine tabellenartige Struktur erzeugen; eine reine
  `TextSelection` **innerhalb** einer Zelle darf **keine** neue Tabelle erzeugen (siehe
  Abschnitt 5, Grenzfall 5; `clipboard.spec.ts`, Entscheidung-2.3-Testfall + Gegenprobe).
- **Fokus-Gating:** Kopieren wirkt nur, wenn der Fokus im Editor liegt. Ein Strg+C bei
  fokussiertem Nicht-Editor-Element (Farbwähler-Input, verstecktes `input[type=file]`)
  darf **keine** Editor-Inhalte in die Zwischenablage legen und **keine** JS-Exception
  auslösen (`clipboard.spec.ts`, Fokus-Isolation + T-12). Strukturell dadurch gegeben, dass
  ProseMirrors `copy`-Handler ausschließlich auf `view.dom` registriert ist.
- **Keine Tastenkombinations-Überschneidung:** `Mod-c` ist in der Keymap aktuell nicht
  gebunden — das muss so bleiben. Jede künftige Keymap-Erweiterung ist darauf zu prüfen,
  dass sie `Mod-c` nicht durch eine zu weit gefasste Bindung abfängt.

**Testfälle**
1. Selection-Sync-Regression mit Kopieren als auslösender Folgeaktion: Tippen → Alles
   auswählen → Fett → **Kopieren** → Klick zur Neupositionierung → Tippen → beide Absätze
   bleiben erhalten (Pflichttest, `selection-regression.spec.ts`).
2. Kopieren einer Zellauswahl → eingefügtes Ergebnis ist eine Tabelle; Gegenprobe:
   Textauswahl in einer Zelle → **keine** neue Tabelle.
3. Kopieren, danach Strg+Z → Undo betrifft die letzte inhaltliche Änderung, nicht das
   Kopieren.
4. Kopieren bei fokussiertem Nicht-Editor-Element → keine Exception, kein Inhaltsleck.

---

## 4. Rundreise-Anforderung (DOCX **und** ODT)

Kopieren selbst schreibt keine Datei. Die Rundreise-Anforderung bedeutet: **kopierter/
eingefügter Inhalt muss sich exakt wie regulär getippter Inhalt verhalten**, wenn das
Dokument anschließend exportiert und reimportiert wird — es darf keinen Unterschied machen,
ob ein Absatz getippt oder per Kopieren/Einfügen erzeugt wurde.

Für **beide** Formate und **beide** Ursprungsrichtungen gilt:

1. **Baseline-Invariante:** Datei A (DOCX oder ODT) hochladen → **ohne** Kopieraktion
   exportieren → Re-Import → Inhalt entspricht exakt A. (Allgemeine Anforderung aus
   `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 1.3/19; hier nur bestätigt, dass das bloße
   Vorhandensein des Copy-Serializers diese Basisrundreise nicht beeinträchtigt.)
2. Datei/neu erstelltes Dokument mit Inhalt → markieren → kopieren → **in ein zweites,
   neues, leeres Dokument** einfügen → als **DOCX** exportieren → heruntergeladene Datei
   öffnen und Inhalt prüfen (nicht nur den DOM vor Export) → Struktur/Formatierung erhalten
   (`clipboard-roundtrip.spec.ts`, R-1).
3. Dasselbe mit Export als **ODT** (R-2).
4. **Cross-Format DOCX→ODT** (Datei A war DOCX, Inhalt kopieren/einfügen, als ODT
   exportieren, reimportieren): **derzeit BLOCKIERT** — es gibt noch **keine**
   Export-Format-Wahl in der UI (`DocumentWorkspace.tsx` bindet das Modul einmalig ans
   Ursprungsformat). Dieser Blocker gehört inhaltlich zu `FEATURE-SPEC-DOCX-ODT.md`
   Abschnitt 1.3 („Export unabhängig vom Ursprungsformat“) und liegt **außerhalb** der
   Eigentümerschaft „Kopieren“. Status: als `test.fixme` geführt (R-3), gilt als
   **blockiert**, **nicht** als „fehlgeschlagen“ oder „übersprungen“.
5. **Cross-Format ODT→DOCX** (R-4) und **doppelte Cross-Format-Rundreise DOCX→ODT→DOCX**
   (R-5): ebenfalls durch denselben fehlenden Export-Format-Picker blockiert (`test.fixme`).
6. **Zwei geöffnete Dokumente / Dokumentwechsel:** Architektonisch zeigt die App **ein**
   aktives Dokument zur Zeit; „zwei gleichzeitig geöffnete Dokumente“ ist nicht vorgesehen.
   Getesteter Ersatzweg: Kopieren in Dokument A → über die Formatauswahl zurücknavigieren
   (dabei den nativen „ungespeichert verlassen?“-Dialog bestätigen) → neues Dokument B
   öffnen → einfügen → Inhalt kommt an. Die **System**-Zwischenablage ist browser-/OS-seitig
   und überlebt den Dokumentwechsel (`clipboard-roundtrip.spec.ts`, R-6).
7. **Parametrisierte Merkmals-Rundreise:** Für jede umsetzbare Zeile aus Abschnitt 2.2:
   Kopieren/Einfügen **plus** anschließender Datei-Export/Re-Import in **einem** kombinierten
   Szenario je Merkmal (kein Merkmal nur isoliert geprüft) — `clipboard-roundtrip.spec.ts`,
   R-7 (Kursiv, Unterstrichen, Durchgestrichen, Bullet-Liste, nummerierte Liste als
   DOCX-Export). Tab-Zeichen: `test.fixme` mit dokumentierter Begründung (siehe 2.2).

**Testfälle**
1. R-1 (DOCX) und R-2 (ODT): zusammengesetztes Dokument (Überschrift, teils fetter Absatz)
   kopieren/einfügen, exportieren, in der **echten** exportierten Datei (`word/document.xml`
   bzw. `content.xml`) Text **und** Formatierungs-Markup nachweisen.
2. R-6: Zwischenablage überlebt Schließen von A und Öffnen von B.
3. R-7: je Merkmal Kopieren/Einfügen → DOCX-Export → Markup vorhanden.
4. R-3/R-4/R-5: bleiben `test.fixme`, bis der Cross-Format-Export-Picker existiert; danach
   scharf schalten.

---

## 5. Grenzfälle

1. **Leere Selektion:** Strg+C ohne Selektion → keine Aktion, keine Fehlermeldung, bisheriger
   Zwischenablageninhalt **unverändert** (`clipboard.spec.ts`, Testfall 2/Grenzfall 1).
2. **Gesamtes Dokument (Strg+A → Kopieren):** auch bei langen Dokumenten (mehrere Seiten,
   viele Bilder) schließt der Vorgang in vertretbarer Zeit ab, UI friert nicht ein.
3. **Selektion exakt an einer Formatgrenze:** keine Verschiebung um ein Zeichen, keine
   doppelte/fehlende Randformatierung (`clipboard.spec.ts`, T-5).
4. **Selektion über Listen-/Tabellengrenzen hinweg:** definiertes, nicht abstürzendes
   Verhalten; mindestens der volle Text bleibt erhalten, auch wenn die resultierende
   Struktur vereinfacht ist. Konkretes Verhalten dokumentieren.
5. **Partielle Zellauswahl vs. ganze Zellen:** **Entscheidung getroffen** — das
   Standardverhalten von `prosemirror-tables` wird als Soll übernommen (kein Eigenbau):
   Textauswahl **innerhalb einer** Zelle bleibt `TextSelection` → Kopieren liefert reinen/
   formatierten Inline-Inhalt **ohne** `<table>`-Hülle; Ziehen über **mindestens zwei ganze**
   Zellen wird zu `CellSelection`, deren `content()` bereits korrekt geschachteltes
   `table`/`table_row`/`table_cell`-Markup inkl. `colspan`/`rowspan` erzeugt. Beide Fälle
   sind getrennt zu testen (Testfall + Gegenprobe, siehe Abschnitt 3).
6. **Bild allein markiert (`NodeSelection`):** nur das Bild landet in der Zwischenablage,
   kein umgebender Text wird mitgenommen oder verloren (`clipboard.spec.ts`, Grenzfall 6).
7. **Sehr großes Bild in der Selektion (mehrere MB):** Kopieren friert die UI nicht spürbar
   ein (harter Zeitbudget-Assert, `clipboard.spec.ts`, Grenzfall 7). **Hinweis:** Falls hier
   ein Einfrieren auftritt, liegt die Ursache im ungeprüften Bild-Insert-Pfad
   (`Toolbar.tsx handleImagePick` liest ohne Größenlimit), **nicht** im Copy-Handler.
8. **Kopieren unmittelbar nach Undo/Redo:** liefert exakt den aktuell sichtbaren Zustand.
9. **IME-Komposition aktiv (ostasiatische Eingabemethoden):** Kopieren bricht die
   Komposition nicht ab und erzeugt keinen korrupten Zwischenzustand.
10. **Zwischenablage-Berechtigung vom Browser verweigert:** Native, tastaturausgelöste
    Kopiervorgänge auf einer `contenteditable`-Fläche benötigen **keine** explizite
    `clipboard-write`-Permission — daher darf kein unbehandelter JS-Fehler entstehen. Zu
    bestätigen, dass der Deployment-Kontext (GitHub Pages,
    `https://sanjoesan.github.io/salamanido/`) diese Berechtigung nicht einschränkt.
11. **Browser-/Plattform-Unterschiede:** **Entscheidung getroffen** — Browsermatrix ist
    Chromium (Desktop Chrome, vollständig inkl. tiefer `clipboard.read()`-Prüfung), Chromium
    Mobile (Pixel 7, vollständiger Tastatur-Rundlauf), WebKit (iPad Mini/Tablet, Touch),
    **Desktop Safari (Clipboard)** und **Desktop Firefox (Clipboard)** als gescopte
    Zusatzprojekte. Technische Einschränkung (bestimmt die Technik, **nicht** die Abdeckung):
    Playwrights `grantPermissions(['clipboard-read','clipboard-write'])` ist CDP-basiert und
    nur unter Chromium zuverlässig; Firefox/WebKit werden über einen In-Page-Tastatur-Rundlauf
    (echte System-Zwischenablage, **ohne** Permissions-API) getestet; die tiefere
    MIME-Rohinhalts-Prüfung bleibt auf Chromium beschränkt. Edge ist durch die Chromium-Engine
    strukturell abgedeckt (nicht separat). **Offen bleibt:** echtes Apple Safari / echtes
    Firefox auf realer Hardware — die Playwright-WebKit-Engine ist keine 1:1-Kopie von Safari;
    ein manueller Testdurchlauf bleibt für die Abnahme empfohlen.
12. **Wiederholtes, schnelles Kopieren wechselnder Selektionen:** jede Ausführung
    überschreibt den vorherigen Inhalt korrekt, keine Vermischung/Race Condition
    (`clipboard.spec.ts`, Grenzfall 12).
13. **Rechtsklick-Kontextmenü durch kein globales Event-Handling verdeckt** (Dauerzustand,
    siehe Abschnitt 1, Testfall 4).
14. **Kopieren aus Kopf-/Fußzeile, Fußnote oder Kommentar:** zurückgestellt, bis diese
    Bereiche gemäß `FEATURE-SPEC-DOCX-ODT.md` Abschnitte 9/11/12 eine eigene Editor-UI
    erhalten (`WordEditor.tsx` rendert derzeit nur `doc.content.body`). Als Nachtrag
    vorzumerken, sobald die UI existiert — muss dann denselben Regeln folgen wie der Haupttext.
15. **Datenschutz:** Zu keinem Zeitpunkt darf Zwischenablageninhalt geloggt, an
    Analytics/Fehlerberichte gesendet oder in `localStorage`/`IndexedDB` gespiegelt werden
    (README-Prinzip). **Expliziter Code-Review-Punkt** bei jedem PR, der `clipboard.ts`
    berührt, **plus** automatischer Scan (`clipboard-privacy.test.ts`): kein
    `console.log`/`fetch`/Analytics mit Clipboard-Inhalt, kein `navigator.clipboard`-Aufruf.

---

## 6. Menü-/Bedienelement-Übersicht (Soll-Zustand je Element)

| # | Element | Aktueller Zustand | Soll / Verifikation |
|---|---|---|---|
| 1 | Strg+C / Cmd+C | nativer Handler, verdrahtet | per E2E verifiziert (Abschnitt 1/7) |
| 2 | Natives Rechtsklick-Kontextmenü „Kopieren“ | vorhanden, nicht unterdrückt | Dauer-Regressionstest, dass kein App-Handler es abfängt |
| 3 | Toolbar-Button „Kopieren“ | **bewusst nicht vorhanden** | keine Änderung — Entscheidung samt Begründung dokumentiert (Abschnitt 1/8) |
| 4 | Ribbon-Eintrag | nicht vorhanden | entfällt bewusst (kein Ribbon-System) |
| 5 | Touch-Kontextmenü „Kopieren“ | teil-verifiziert | Touch-Mechanik auf Mobile/Tablet, native Popup-Grenze dokumentiert |
| 6 | Strg+Einfg (Ctrl+Insert) | ungeprüft | verifizieren oder als „nicht unterstützt“ dokumentieren |
| 7 | `text/html` für externe Rich-Text-Ziele | ProseMirror-`DOMSerializer` aus Schema-`toDOM` | für alle Marks/Nodes aus 2.2 verifizieren |
| 8 | `text/plain` für Klartext-Ziele | projekteigener `clipboardTextSerializer` | Tabellen/Listen/`hard_break`-Struktur verifizieren (Unit + E2E) |
| 9 | `clipboardTextSerializer` (`clipboard.ts`) | vorhanden | Unit-Tests decken Tabelle/Liste/verschachtelt/`hard_break`/leere Slice ab |
| 10 | `hard_break.leafText` (`schema.ts`) | vorhanden | Regressionstest: liefert `'\n'` |
| 11 | Kein `navigator.clipboard` / kein Logging | konform | statischer Scan + manueller Review-Punkt |

---

## 7. Testplan — Zusammenfassung & Verifikationsstand

| Bereich | Unit-/Modelltests | E2E (echte Browser-Bedienung, echte Zwischenablage) | Rundreise (Datei-Export/Re-Import) |
|---|---|---|---|
| Grundverhalten (leere Selektion, Undo-Neutralität, Selektion unverändert) | teils (Serializer) | **vorhanden** (`clipboard.spec.ts`) | n/a |
| Zeichenformatierung beim Kopieren | — | **vorhanden** (Kombi fett/Farbe/Hervorhebung, Formatgrenze T-5) | **vorhanden** (R-7: Kursiv/Unterstr./Durchgestr.) |
| Absatz-/Listenstruktur beim Kopieren | **vorhanden** (`clipboard.test.ts`) | **vorhanden** (Überschrift+Absatz+Liste; text/plain-Marker) | **vorhanden** (R-7: Bullet/nummeriert) |
| Tabellen (ganze Zellen vs. Textteilauswahl) | **vorhanden** (colspan/rowspan) | **vorhanden** (Testfall + Gegenprobe; text/plain tab-sep) | offen (an Cross-Format gekoppelt) |
| Bilder | — | **vorhanden** (Bild allein, Performance) | offen |
| Cross-App (Salamanido → externes Ziel) | — | **vorhanden** (natives `<textarea>`, T-14a/b) | n/a |
| Selection-Sync-Interferenz × Kopieren | — | **vorhanden** (Kopier-Variante in `selection-regression.spec.ts`) | n/a |
| DOCX-Rundreise nach Kopieren/Einfügen | — | — | **vorhanden** (R-1, R-7) |
| ODT-Rundreise nach Kopieren/Einfügen | — | — | **vorhanden** (R-2) |
| Cross-Format-Rundreise (DOCX↔ODT) | — | — | **BLOCKIERT** (`test.fixme` R-3/4/5 — fehlende Export-Format-UI) |
| Browsermatrix (Chromium/Firefox/WebKit) | — | **vorhanden** (gescopte Safari-/Firefox-Projekte; WebKit-Rundlauf dokumentiert eingeschränkt) | n/a |
| Tab-Zeichen kopieren | Datenmodell (`docx/roundtrip.test.ts`) | **N/A** (`test.fixme` — kein In-App-Weg, ein Tab einzugeben) | N/A |
| Datenschutz (kein `navigator.clipboard`, kein Logging) | **vorhanden** (`clipboard-privacy.test.ts`) | n/a | manueller Review-Punkt |

**Fazit:** Anders als in der ersten Fassung behauptet, existiert für „Kopieren“ inzwischen
substanzielle Testabdeckung (Unit + E2E + Datei-Rundreise + Browsermatrix). Der Status
bleibt dennoch **nicht vertrauenswürdig**, bis dieser Verifikationsdurchlauf **unabhängig**
bestätigt hat, dass (a) alle genannten Tests tatsächlich grün laufen (nicht nur existieren),
(b) sie das SOLL aus den Abschnitten 1–5 **vollständig** abdecken, (c) die als **blockiert**
markierten Cross-Format-Fälle korrekt als `test.fixme` (nicht als „bestanden“) geführt sind,
und (d) der Real-Hardware-Nachweis für Safari/Firefox (Grenzfall 11) erbracht oder als
bewusst offene Restaufgabe dokumentiert ist.

---

## 8. Offene Fragen (beantwortet) / Definition of Done

Die ehemals offenen Fragen dieses Dokuments sind in diesem Durchlauf **entschieden**:

1. **Toolbar-Button für Kopieren?** → **Nein.** Kopieren bleibt bei nativen Wegen
   (Tastenkombination + Kontextmenü). Begründung: Konsistenz mit Undo/Redo (ebenfalls kein
   Button), kein Fähigkeitsgewinn, Vermeidung zusätzlichen Wartungsaufwands (Abschnitt 1,
   Punkt 4/5).
2. **Safari/WebKit Teil der Browsermatrix?** → **Ja, und zusätzlich Firefox**, mit
   engine-spezifischer Testtechnik (Chromium: Permissions-API + tiefe MIME-Prüfung;
   Firefox/WebKit: In-Page-Tastatur-Rundlauf ohne Permissions-API). Edge über Chromium
   abgedeckt. Real-Hardware-Safari/-Firefox bleibt manueller Abnahmepunkt (Grenzfall 11).
3. **Verhalten bei partieller Zellauswahl?** → **Standardverhalten von `prosemirror-tables`
   als Soll übernommen**, kein Eigenbau: Textauswahl in einer Zelle → keine Tabelle;
   Auswahl ganzer Zellen → Tabellenstruktur mit `colspan`/`rowspan` (Abschnitt 5,
   Grenzfall 5).

**Diese Spezifikation gilt erst als erfüllt (Status → „verifiziert“), wenn:**
- jeder umsetzbare Testfall aus den Abschnitten 1–5 als automatisierter, dauerhaft in der
  Suite verbleibender Test existiert **und nachweislich grün** ist (nicht nur vorhanden);
- die DOCX- **und** ODT-Rundreise (Abschnitt 4, R-1/R-2/R-7) grün ist;
- die Cross-Format-Rundreise (R-3/R-4/R-5) entweder scharf geschaltet und grün ist **oder**
  klar als durch die fehlende Export-Format-UI **blockiert** (`test.fixme`) geführt wird —
  niemals als „bestanden“ getarnt (dieser Blocker ist an das Feature „Export unabhängig vom
  Ursprungsformat“ zu übergeben, `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 1.3);
- der Datenschutz-Punkt (Abschnitt 5, Grenzfall 15) durch `clipboard-privacy.test.ts` **und**
  Code-Review bestätigt ist;
- die als **N/A** geführten Punkte (Tab-Zeichen; Kopf-/Fußzeile/Fußnote/Kommentar,
  Grenzfall 14) mit ihrer Begründung dokumentiert und mit dem jeweils blockierenden Feature
  verknüpft sind — statt stillschweigend zu fehlen;
- der Real-Hardware-Nachweis für Safari/Firefox (Grenzfall 11) erbracht oder als bewusst
  offene Restaufgabe festgehalten ist.

Erst dann darf der Backlog-Eintrag `kopieren` von „nicht vertrauenswürdig“ auf
„verifiziert“ wechseln.
