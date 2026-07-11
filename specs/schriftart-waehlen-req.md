# Anforderungsspezifikation: „Schriftart wählen" (`schriftart-waehlen`)

Status: Laut Backlog (`specs/FEATURE-BACKLOG.md`, Zeile 97, Slug `schriftart-waehlen`,
Bereich „2.2 Zeichenformatierung", Titel „Schriftart wählen", Beschreibung „Wählt die
Schriftfamilie aus einer Liste installierter/eingebetteter Schriften.", Priorität
**1 – essenziell**) als **„fehlt"** geführt. Gemäß Aufgabenstellung gilt auch dieser
Status als **nicht vertrauenswürdig** und muss vollständig verifiziert werden, bevor er
im Backlog bestätigt werden darf — und zwar in beide Richtungen: Es muss geprüft werden,
dass wirklich **nichts** vorhanden ist (kein UI-Fragment, kein Datenmodell-Attribut, kein
hartkodierter Schriftart-Default, der „fehlt" fälschlich zu „teilweise" machen würde),
**und** es muss anschließend gegen genau diese Spezifikation gebaut und abgenommen werden.

**Code-Audit zum Zeitpunkt dieser Anforderungsdefinition (per Volltextsuche im aktuellen
`src`-Baum verifiziert, nicht nur aus einem früheren Durchlauf übernommen):** Der Status
„fehlt" ist zutreffend — es existiert **keinerlei** Spur der Funktion:

- `src/formats/shared/schema.ts` — die Marks `strong`, `em`, `underline`, `strike`,
  `textColor`, `highlight` sind definiert; eine Mark für Schriftfamilie fehlt komplett.
- `src/formats/shared/editor/Toolbar.tsx` — kein Dropdown/Combobox-Element für
  Schriftart vorhanden; im gesamten Repo existiert **kein** wiederverwendbares
  Combobox-/`role="listbox"`-Muster (Volltextsuche → 0 Treffer), die Komponente muss
  vollständig neu entworfen werden.
- `src/formats/shared/editor/commands.ts` — keine Funktion zum Setzen/Entfernen einer
  Schriftart-Mark.
- `src/formats/docx/reader.ts`, Funktion `marksFromRunProperties()` — wertet `w:b`,
  `w:i`, `w:u`, `w:strike`, `w:color`, `w:shd` aus, aber **kein** `w:rFonts`.
- `src/formats/docx/writer.ts`, Funktion `runPropertiesXml()` — erzeugt entsprechend
  keine `<w:rFonts .../>`-Ausgabe.
- `src/formats/docx/styleDefs.ts` — erzeugt **keinerlei** `w:rFonts`, auch nicht fest
  pro Überschriften-/Standard-Formatvorlage. Der bestehende Test
  `src/formats/docx/__tests__/styleDefs.test.ts` (Zeile 18) prüft sogar **explizit**, dass
  die `Normal`-Formatvorlage kein `w:rFonts` enthält
  (`getElementsByTagNameNS(w, 'rFonts')).toHaveLength(0)`). Es gibt damit — anders als bei
  der Schriftgröße, die über `HEADING_FONT_SIZES` bereits fest pro Ebene existiert
  (siehe `schriftgroesse-waehlen-req.md` 7.2) — **keinen** hartkodierten oder impliziten
  Schriftart-Default irgendwo im Code, mit dem eine neue Mark konkurrieren oder den sie
  überschreiben müsste. Das stützt Design-Entscheidung 2.4 (kein erfundener Default).
- `src/formats/odt/reader.ts`, Funktion `parseAutomaticStyles()`/Interface `RunStyle` —
  wertet `fo:font-weight`, `fo:font-style`, `style:text-underline-style`,
  `style:text-line-through-style`, `fo:color`, `fo:background-color` aus, aber **kein**
  `style:font-name` und keine `office:font-face-decls` (das Element wird nirgends
  referenziert).
- `src/formats/odt/styleRegistry.ts`, Interface `RunProps`/`buildTextStyleXml()` —
  entsprechend ohne Feld für Schriftart.
- `window.queryLocalFonts()` (Local Font Access API) wird im gesamten Repo nirgends
  referenziert — die optionale Systemschriften-Erweiterung (siehe 1.3) ist ebenfalls neu.

Diese Datei ist deshalb keine reine Verifikationsspezifikation für eine bestehende,
möglicherweise unvollständige Funktion (wie bei `datei-oeffnen-req.md` oder
`speichern-exportieren-req.md`), sondern der **verbindliche Bau- und Abnahme-Maßstab**
für eine komplett neu zu erstellende Funktion — Umsetzung und anschließende
Vollverifikation (echte Browser-Bedienung, keine isolierten Unit-Tests) sind beide
Gegenstand der Abschnitte 7 und 8.

> **Product-Owner-Review (dieser Durchlauf).** Diese Datei existierte bereits aus einem
> früheren Durchlauf; sie wurde hier nicht unbesehen übernommen, sondern erneut kritisch
> gegen den aktuellen Stand geprüft. Der Code-Audit oben wurde **erneut, direkt am
> lebenden Quellcode** nachvollzogen (`schema.ts`, `Toolbar.tsx`, `commands.ts`,
> `docx/reader.ts`, `docx/writer.ts`, `docx/__tests__/styleDefs.test.ts`, `odt/reader.ts`)
> und in jedem Punkt **bestätigt** — es existiert weiterhin keinerlei Spur einer
> `fontFamily`-Mark, keine Combobox/kein `role="listbox"`-Muster in der Toolbar, kein
> `w:rFonts` im DOCX-Reader/-Writer, kein `style:font-name`/`office:font-face-decls` im
> ODT-Reader, kein `queryLocalFonts()`-Aufruf im Repo. Ebenso wurden alle in Abschnitt 6
> als Fixture-Belege zitierten Dateien **erneut durch Entpacken verifiziert**, nicht nur
> aus der Vorfassung übernommen: `bug59058.docx` trägt tatsächlich `w:ascii="MinionPro-
> Regular"`/`"MinionPro-bold"`/`"MinionPro-It"` (nicht in der kuratierten Liste, siehe 1.2),
> `FruitDepot-SeasonalFruits4.odt` trägt in `content.xml`/`office:font-face-decls`
> tatsächlich die suffixierten Einträge `Arial1`/`Arial2`/`Tahoma1`. Der Backlog-Eintrag
> (`FEATURE-BACKLOG.md:97`, Bereich „2.2 Zeichenformatierung") wurde ebenfalls Wort für
> Wort gegengelesen und stimmt exakt mit der oben zitierten Beschreibung überein.
>
> **Eine gefundene und hier korrigierte Schwäche:** Der Abschnitt „Explizit nicht Teil
> dieser Anforderung" verwies für die Theme-Schriften-Abgrenzung fälschlich auf
> „Grenzfall 3.14" — das ist der benachbarte, aber andere Fall (`w:rFonts` nur mit
> `w:eastAsia`). Der tatsächliche Theme-Grenzfall trägt die Nummer 3.15; Abschnitt 5.4
> hatte das bereits korrekt, nur der Verweis oben war ein Zahlendreher. Korrigiert, statt
> unverändert weitergeführt. Zusätzlich wurde die Fixture-Liste in Abschnitt 6 um
> `bug59058.docx` ergänzt, das in Testfall 24 bereits konkret als Beispiel für eine nicht
> kuratierte Schriftart verwendet wird, in der bisherigen Fixture-Aufzählung dort aber
> fehlte.
>
> **Product-Owner-Review (erneuter, unabhängiger Durchlauf — nicht die Fortschreibung
> desselben Verfassers).** Der komplette Code-Audit oben wurde in diesem Durchlauf ein
> weiteres Mal, Zeile für Zeile am lebenden Quellcode nachvollzogen, nicht aus dem Vertrauen
> in die vorherige Fassung übernommen: `schema.ts` (Marks `strong`/`em`/`underline`/
> `strike`/`textColor`/`highlight` vorhanden, keine `fontFamily`-Mark), `Toolbar.tsx`
> (0 Treffer für `role="listbox"`/`combobox`), `commands.ts` (`applyMarkColor`/
> `clearMarkColor`, Zeilen 106–122, geben bei `empty` tatsächlich `return false` zurück —
> die in Zeile 9/Abschnitt 2.2 zitierte Warnung ist exakt zutreffend), `docx/reader.ts`
> Funktion `marksFromRunProperties` (Zeilen 100–115, wertet `w:b`/`w:i`/`w:u`/`w:strike`/
> `w:color`/`w:shd` aus, kein `w:rFonts`), `docx/writer.ts` (Funktion `runPropertiesXml`,
> Zeile 20), `odt/reader.ts` (`RunStyle`/`parseAutomaticStyles`, wertet `fo:font-weight` bis
> `fo:background-color` aus, kein `style:font-name`), `odt/styleRegistry.ts` (`RunProps`/
> `buildTextStyleXml`, kein Font-Feld), `odt/writer.ts` (Funktion `runPropsFromMarks`,
> Zeile 32) und `src/index.css` (`--font-sans`-Variable Zeile 4, `.ProseMirror`-Regel ohne
> eigenes `font-family` Zeilen 23–27) — in jedem Punkt **bestätigt**, keine Abweichung zur
> Vorfassung gefunden. Ebenfalls per Entpacken erneut nachvollzogen (nicht nur aus der
> Vorfassung zitiert): `Bug54771a.docx`/`Bug54771b.docx` tragen `w:rFonts
> w:asciiTheme="majorHAnsi"` (Überschrift) bzw. `"minorHAnsi"` (Fließtext, nur in
> `Bug54771a.docx`), `bug59058.docx` enthält tatsächlich `w:ascii="MinionPro-Regular"`/
> `"MinionPro-bold"`/`"MinionPro-It"` neben weiteren, ebenfalls nicht kuratierten Namen wie
> „Lucida Sans Unicode", und `FruitDepot-SeasonalFruits4.odt` enthält in
> `office:font-face-decls` tatsächlich `style:name="Arial1"` (→ `svg:font-family="Arial"`),
> `"Arial2"` (→ ebenfalls `"Arial"`, anderer `style:font-family-generic`) und `"Tahoma1"`
> (→ `"Tahoma"`). Der Backlog-Eintrag (`FEATURE-BACKLOG.md:97`, unter der Überschrift
> „### 2.2 Zeichenformatierung", Zeile 84) wurde ebenfalls erneut gegengelesen und stimmt
> exakt.
>
> **Zwei in diesem Durchlauf neu gefundene, hier korrigierte/ergänzte Schwächen** (die
> Vorfassung hatte beide unkommentiert gelassen, statt sie als Lücke zu benennen):
>
> 1. **Fehlender Verweis auf die noch offene, dateiübergreifende Standard-Schriftart-Frage.**
>    Abschnitt 2.4 formuliert hier eine „harte, nicht verhandelbare" Anforderung, dass
>    niemals ein Font-Default erfunden wird. Bei Gegenlesen von `neues-dokument-req.md`
>    Abschnitt 7, Punkt 3 („Schrift-Standard") zeigt sich: Genau diese Frage ist dort
>    **ausdrücklich noch offen** („Bleibt der Font-Default implizit … oder wird ein
>    Produktstandard … festgeschrieben?"), nicht bereits entschieden — anders als die
>    analoge Schriftgrößen-Frage, die `schriftgroesse-waehlen-req.md` 3.4 zutreffend als
>    „bereits abgenommene Entscheidung" zitiert. Diese Datei darf die neues-dokument-Frage
>    nicht stillschweigend für sich selbst vorwegnehmen: Die harte Anforderung in 2.4 ist
>    mit **beiden** möglichen Ausgängen jener offenen Frage verträglich, solange sie
>    „implizit bleibt" gewinnt — sollte stattdessen künftig ein fester Produkt-Standard
>    (z. B. „Calibri 11 pt"/„Liberation Sans 12 pt") beschlossen werden, muss Abschnitt 2.4
>    dieser Datei zwingend im selben Zug nachgezogen werden. Das ist jetzt in 2.4 explizit
>    als Abhängigkeit vermerkt, statt nur zufällig konsistent zu sein.
> 2. **Kopf-/Fußzeile als Testort war ohne Abhängigkeitshinweis formuliert.** Grenzfall 3.6
>    und Kriterium 4 in Abschnitt 6 nennen „Kopf-/Fußzeile" gleichrangig neben
>    Tabellenzelle/Listenpunkt/Überschrift als Ort, an dem eine Schriftart anzuwenden ist.
>    Tatsächlich sind `kopfzeile-bearbeiten`/`fusszeile-bearbeiten`
>    (`FEATURE-BACKLOG.md:250`/`251`) selbst noch als „fehlt" geführt — es gibt aktuell
>    **keine** UI, um eine Kopf-/Fußzeile im Editor überhaupt zu erstellen/zu befüllen.
>    Per Code-Lektüre bestätigt (`docx/reader.ts` Zeilen 509–510, `docx/writer.ts`
>    Zeilen 238–298: `w:headerReference`/`w:footerReference`/`header1.xml`/`footer1.xml`
>    werden bereits gelesen/geschrieben) existiert die Kopf-/Fußzeile-Unterstützung jedoch
>    bereits auf Datenmodell-/Reader-/Writer-Ebene und nutzt denselben Lauf-Parsing-Pfad
>    (`marksFromRunProperties`/Äquivalent) wie der Haupttext. Damit gilt präzisiert: Die
>    **Rundreise-Erhaltung** einer bereits in einer Fremddatei vorhandenen
>    Kopf-/Fußzeilen-Schriftart ist schon jetzt sinnvoll testbar (siehe Grenzfall 3.6,
>    Kriterium 4), das **aktive Setzen** einer neuen Schriftart über die Toolbar-Combobox,
>    während sich der Cursor in einem Kopf-/Fußzeilenbereich befindet, ist dagegen erst
>    testbar, sobald `kopfzeile-bearbeiten`/`fusszeile-bearbeiten` selbst existieren. Das
>    ist **kein** Abnahme-Blocker dieser Datei, aber eine wichtige Reihenfolge-Abhängigkeit
>    für die Testplanung, die vorher nirgends vermerkt war — jetzt ergänzt in Grenzfall 3.6.
>
> **Product-Owner-Review (dieser Durchlauf, erneut unabhängig).** Der Code-Audit oben
> wurde ein weiteres Mal vollständig am lebenden Quellcode nachvollzogen — nicht aus dem
> Vertrauen in die Vorfassung übernommen: `schema.ts` (Marks-Objekt Zeilen 157–197: `strong`/
> `em`/`underline`/`strike`/`textColor`/`highlight`, keine `fontFamily`-Mark), `Toolbar.tsx`
> (0 Treffer `role="listbox"`), `commands.ts` (`applyMarkColor`/`clearMarkColor`, Zeilen
> 106–122, `if (empty) return false` bestätigt), `docx/reader.ts`
> (`marksFromRunProperties`, Zeilen 100–115, kein `w:rFonts`), `docx/writer.ts`
> (`runPropertiesXml`, Zeile 20), `docx/styleDefs.ts`/`styleDefs.test.ts` (Zeile 18, Assertion
> auf 0 `rFonts`-Elemente bestätigt), `odt/reader.ts` (`RunStyle`/`parseAutomaticStyles`, kein
> `font-name`/`font-face-decls`-Zugriff), `odt/styleRegistry.ts` (`RunProps`/
> `buildTextStyleXml`, kein Font-Feld; Klasse `TextStyleRegistry` Zeile 22 bestätigt),
> `odt/writer.ts` (`runPropsFromMarks`, Zeile 32; `bodyStyles`/`chromeStyles`-Trennung in
> `writeOdt()` Zeilen 261–275 bestätigt), `src/index.css` (`--font-sans` Zeile 4,
> `.ProseMirror`-Regel ohne eigenes `font-family`) sowie repo-weit 0 Treffer für
> `queryLocalFonts` — in jedem Punkt **bestätigt**, keine Abweichung zur Vorfassung. Auch
> `FEATURE-BACKLOG.md:97` und alle zitierten Nachbardateien (`neues-dokument-req.md`
> Abschnitt 7 Punkt 3, `schriftgroesse-waehlen-req.md` 3.4/7.2, `schriftfarbe-req.md`
> Grenzfall 4.11) wurden gegengelesen und stimmen exakt mit den Zitaten oben überein.
>
> **Eine neu gefundene, hier ergänzte Lücke:** Beim erneuten Entpacken **aller** im Repo
> vorhandenen Font-relevanten ODT-Fixtures (nicht nur der bereits zitierten) fiel auf, dass
> `tests/fixtures/external/odt/FruitDepot-SeasonalFruits5.odt` — bisher in keiner Fassung
> dieser Datei erwähnt, obwohl bereits im Repo vorhanden — für mehrteilige Font-Namen einen
> `svg:font-family`-Wert liefert, der selbst bereits in literale Apostrophe eingeschlossen ist
> (`style:name="Andale Sans UI"` → `svg:font-family="'Andale Sans UI'"`, ebenso „Times New
> Roman"), während einwortige Namen (`Arial`, `Tahoma`) in derselben Datei unquotiert bleiben.
> Das ist ein von den bestehenden Grenzfällen 3.2/3.13/3.19 nicht abgedeckter Fall — jene
> behandeln Leerzeichen im Namen, fehlende Font-Face-Deklaration bzw. teilübergreifende
> Suffix-Kollisionen, aber keinen Wert, der die Anführungszeichen bereits **als Teil des
> dekodierten Attributwerts** mitbringt. Unbehandelt würde das zu einem sichtbar falschen,
> mit Apostrophen durchsetzten Anzeigenamen und zu einem beim Re-Export nicht mehr
> treffenden Schriftartnamen führen. Jetzt als Grenzfall 3.25, Testfall 26 und zusätzliche
> Fixture in Abschnitt 6 ergänzt, statt wie in der Vorfassung unentdeckt zu bleiben. Ebenfalls
> ergänzt: `CharacterParagraphFormat_MSO15.odt` (bislang unzitierte, aber vorhandene Fixture
> mit weiteren nicht kuratierten Namen `Calibri Light`/`Mangal`/`Microsoft YaHei`/`SimSun`)
> als zusätzlicher Beleg für Grenzfall 3.5.

Bezug: `E:\docs\specs\FEATURE-BACKLOG.md` (Slug `schriftart-waehlen`),
`E:\docs\FEATURE-SPEC-DOCX-ODT.md` Abschnitt 3 (Zeichenformatierung, Zeile „Schriftart:
Auswahl aus Liste, wird in DOCX/ODT korrekt referenziert") und Abschnitt 17, Zeile 18
(„Schriftart-/Schriftgrößen-Auswahl | fehlt"). An Stil und Detailtiefe von
`FEATURE-SPEC-DOCX-ODT.md` sowie den bereits vorliegenden Anforderungsdateien
`datei-oeffnen-req.md`, `speichern-exportieren-req.md`, `schriftfarbe-req.md` und
`schriftgroesse-waehlen-req.md` orientiert sich dieses Dokument; wo diese
Nachbar-Features denselben Grenzfall behandeln (Theme-Referenzen, Selection-Sync,
leere Selektion, Standardwert-Frage), ist die Behandlung hier bewusst parallel gehalten.

**Explizit nicht Teil dieser Anforderung** (separate Backlog-Einträge bzw. bewusste
Abgrenzung, siehe Abschnitt 5):

- `schriftgroesse-waehlen` (Schriftgröße) — eigener Slug, eigene Anforderungsdatei
  (`schriftgroesse-waehlen-req.md`, existiert bereits).
- `schrift-vergroessern` / `schrift-verkleinern`, `gross-kleinschreibung`,
  `zeichenabstand`, `texteffekte`, `formatierung-loeschen`, `formatvorlage-erstellen`,
  `formatvorlagen-satz` (Design-Schriftart-Paare wie in Word-Themes) — alle eigene,
  aktuell „fehlt"-geführte Slugs.
- Echtes Einbetten von Schriftart-**Binärdaten** (Glyphen) in die exportierte Datei
  (`w:embedTrueTypeFonts`/`word/fontTable.xml` in DOCX, entsprechende
  ODF-Erweiterungen) — siehe Abschnitt 5.2.
- Auflösung von **Theme-Schriften** (DOCX `w:asciiTheme`/`w:hAnsiTheme`/`w:cstheme` →
  `word/theme/theme1.xml`) auf die konkrete Schriftfamilie — nur Best-Effort/dokumentierter
  Fallback, siehe Abschnitt 5.4 und Grenzfall 3.15 (**korrigiert in diesem Durchlauf**: eine
  vorherige Fassung verwies hier fälschlich auf „Grenzfall 3.14", das ist der benachbarte,
  aber inhaltlich andere Fall „nur `w:eastAsia`, kein `w:ascii`/`w:hAnsi`"; der tatsächliche
  Theme-Grenzfall trägt die Nummer 3.15, siehe dort sowie 5.4, wo der Verweis bereits korrekt
  war).

---

## 1. Betroffene Menüpunkte/Bedienelemente (Soll-Zustand, neu zu bauen)

Da aktuell nichts existiert, beschreibt diese Tabelle den zu bauenden Soll-Zustand samt
vorgeschlagenem Ort im Code, nicht einen Ist-Zustand.

| # | Element | Vorgeschlagener Ort | Soll-Verhalten |
|---|---|---|---|
| 1 | Schriftart-Combobox in der Toolbar | `Toolbar.tsx`, direkt nach dem Absatzformat-Dropdown und vor den Fett/Kursiv/Unterstrichen/Durchgestrichen-Buttons (analog zur Position in Word/LibreOffice) | Editierbares Eingabefeld **mit** Dropdown-Liste (Combobox, nicht reines `<select>`), zeigt den Namen der an der Schreibmarke bzw. auf der Selektion aktiven Schriftart; Freitexteingabe erlaubt zusätzlich das manuelle Eintippen eines Schriftartnamens, der nicht in der kuratierten Liste steht (siehe 1.2 und 3.10). |
| 2 | Kuratierte Schriftarten-Liste | neu: `src/formats/shared/editor/fonts.ts` (o. ä.) | Statische, cross-platform sinnvolle Grundliste (mindestens: Arial, Times New Roman, Calibri, Georgia, Verdana, Tahoma, Courier New, Comic Sans MS sowie deren verbreitete Linux/LibreOffice-Gegenstücke Liberation Sans/Serif/Mono), da eine echte Auflistung „installierter" Schriftarten des Betriebssystems im Browser nicht zuverlässig/portabel möglich ist (siehe 5.3). |
| 3 | Optionale Erweiterung: echte System-Schriftarten | `fonts.ts`, progressive Erweiterung | Falls `window.queryLocalFonts()` (Local Font Access API) im aktuellen Browser verfügbar **und** vom Benutzer per Berechtigungsdialog erlaubt ist, wird die kuratierte Liste um die real installierten Schriftarten ergänzt. Ohne diese API (Firefox, Safari, oder Berechtigung verweigert) bleibt ausschließlich die kuratierte Liste aktiv — das ist **kein** Fehler, sondern dokumentiertes Fallback-Verhalten (siehe 3.12). |
| 4 | Abschnitt „Im Dokument verwendet" in der Dropdown-Liste | Combobox-Liste, eigene Gruppe oberhalb der kuratierten Liste | Enthält jede Schriftart, die im aktuell geöffneten Dokument tatsächlich per Mark referenziert wird — insbesondere Schriftarten aus importierten Fremddateien, die **nicht** in der kuratierten Liste stehen (z. B. eine firmenspezifische Schriftart aus einer echten Word-Datei). Diese Gruppe ist die konkrete Umsetzung des Backlog-Worts „**eingebetteter** Schriften": angezeigt werden die im hochgeladenen Dokument bereits eingebetteten/referenzierten Schriftart**namen**. Solche Einträge dürfen nicht kommentarlos verschwinden (siehe 3.5). |
| 5 | Live-Vorschau je Listeneintrag | Combobox-Liste | Jeder Eintrag wird, soweit die Schriftart im Browser verfügbar ist, in der eigenen Schriftart gerendert (`style="font-family: …"`); ist die Schriftart nicht verfügbar, greift der Browser automatisch auf eine Fallback-Schrift zurück — kein Absturz, kein leerer Eintrag. |
| 6 | Such-/Filterfunktion | Combobox-Eingabefeld | Tippen im Eingabefeld filtert die Liste per Teilstring-Suche (case-insensitive), live bei jedem Tastendruck. Kein Treffer → sichtbarer Hinweis „Keine Schriftart gefunden" statt leerer, wirkungsloser Liste (siehe 3.11). |
| 7 | Tastaturbedienung | Combobox | Per Tab erreichbar; Pfeil-hoch/-runter navigiert die gefilterte Liste; Enter übernimmt den markierten/eingetippten Eintrag; Escape schließt die Liste ohne Änderung und stellt den vorherigen Anzeigewert wieder her; **Tab bei geöffneter Liste** verschiebt den Fokus auf das nächste Toolbar-Element und schließt die Liste dabei wie ein Blur **ohne** stille Übernahme des lediglich hervorgehobenen Eintrags (siehe 4.8) — die Tastaturnavigation durch die Toolbar darf nie versehentlich eine Schriftart setzen. Volle ARIA-Semantik siehe 4.6. |
| 8 | „Gemischt"-Anzeige bei Mehrfachauswahl | Combobox-Anzeigewert | Steht die Selektion über mehrere Textläufe mit unterschiedlichen Schriftarten (oder Schriftart + schriftartlosem Text), zeigt das Eingabefeld einen leeren/neutralen Platzhalter statt fälschlich einer der beteiligten Schriftarten (analog zu Word). |
| 9 | Neue Commands-Funktion(en) | `src/formats/shared/editor/commands.ts` | `applyFontFamily(family: string)` (setzt/ersetzt die Mark auf Selektion bzw. als „stored mark" an der Schreibmarke) und `clearFontFamily()` (entfernt die Mark, fällt auf Basisformat zurück). **Achtung:** Das bestehende `applyMarkColor()`/`clearMarkColor()` (für `textColor`/`highlight`) bricht bei leerer Selektion mit `return false` ab und ist deshalb **kein** taugliches Vorbild — Schriftart verlangt Stored-Mark-Verhalten an der Schreibmarke (siehe 2.2), analog zu Fett/Kursiv über `toggleMark`. |
| 10 | Neue Schema-Mark `fontFamily` | `src/formats/shared/schema.ts` | Mark mit Attribut `{ family: string }`, `toDOM`/`parseDOM` analog zu `textColor` (`style="font-family: …"`), damit die Editor-Darstellung selbst die gewählte Schriftart sofort sichtbar rendert (siehe 2.6 — reine Datenmodell-Änderung ohne sichtbaren Effekt gilt als Defekt). |
| 11 | DOCX-Lese-/Schreibunterstützung | `docx/reader.ts` (`marksFromRunProperties`), `docx/writer.ts` (`runPropertiesXml`) | Lesen: `<w:rFonts w:ascii="…" .../>` innerhalb `w:rPr` → `fontFamily`-Mark (`w:ascii` zuerst, `w:hAnsi` als Fallback; Sonderfälle siehe 2.8, 3.13, 3.14). Schreiben: Mark → `<w:rFonts w:ascii="X" w:hAnsi="X" w:cs="X" w:eastAsia="X"/>` (alle vier Attribute konsistent auf denselben Namen, siehe 2.8). |
| 12 | ODT-Lese-/Schreibunterstützung | `odt/reader.ts` (`parseAutomaticStyles`/`RunStyle`), `odt/styleRegistry.ts` (`RunProps`/`buildTextStyleXml`), `odt/writer.ts` (`runPropsFromMarks`) | Lesen: `style:text-properties/@style:font-name` → Nachschlagen des zugehörigen `style:font-face`-Eintrags in `office:font-face-decls` (Attribut `svg:font-family`) → `fontFamily`-Mark. Fehlt der `font-face-decl`-Eintrag (kaputte/vereinfachte Fremddatei), wird ersatzweise der rohe `style:font-name`-Wert direkt übernommen (siehe 3.13). Schreiben: Mark → neuer `style:font-name`-Verweis in `style:text-properties` **plus** passender Eintrag in `office:font-face-decls` (`content.xml` und/oder `styles.xml`, je nachdem wo der Textlauf steht — analog zur bestehenden Trennung `bodyStyles`/`chromeStyles` in `writeOdt()`; siehe 2.9 und 3.19). |
| 13 | „Formatierung löschen"-Interaktion (Abgrenzung) | separater Slug `formatierung-loeschen` | Diese Datei fordert nur, dass `clearFontFamily()` isoliert funktioniert; die Verzahnung mit einem globalen „Formatierung löschen"-Button ist nicht Gegenstand dieser Datei, muss aber, sobald jener Button existiert, auch die Schriftart zurücksetzen. |
| 14 | „Schriftart entfernen"-Button | `src/formats/shared/editor/FontFamilyCombobox.tsx`, direkt neben dem Eingabefeld | Kleiner Icon-Button, der `clearFontFamily()` auslöst (entfernt die `fontFamily`-Mark auf der Selektion bzw. — bei leerer Selektion — an der Schreibmarke, analog zur Stored-Mark-Logik aus Zeile 9). Auf bereits schriftartlosem Text ein No-Op **ohne** Exception und **ohne** leeres `w:rFonts`/`style:font-name` im Export (siehe 3.16, Testfall 8). Trägt `title`/`aria-label="Schriftart entfernen"`. Das als Glyph verwendete „⌫" ist laut `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.1 rendering-kritisch (leeres Rechteck/Fragezeichen auf Systemen ohne Glyphenabdeckung) — auf mehreren Systemen prüfen, ggf. konsistent mit den bestehenden Farb-Entfernen-Buttons auf ein SVG-Icon umstellen (siehe 4.6). |

Es gibt **keinen** zusätzlichen Menüpunkt außerhalb der Toolbar (kein Kontextmenü-Eintrag,
kein Tastaturkürzel) für diese Funktion — sollte ein solcher künftig gefordert werden, ist
das ein separater Zusatz zu dieser Spezifikation.

---

## 2. Gewünschtes Verhalten im Detail

### 2.1 Anwenden auf eine bestehende Selektion
- Text markieren → Schriftart in der Combobox wählen oder eintippen + Enter/Klick auf
  Listeneintrag → die `fontFamily`-Mark wird **exakt** auf den markierten Bereich
  angewendet, bestehende Textläufe werden an den Selektionsgrenzen aufgeteilt (wie bei
  `toggleMark`/`applyMarkColor` für die bestehenden Marks).
- Text außerhalb der Selektion bleibt unverändert (weder Schriftart noch sonstige
  Formatierung).
- Der Fokus kehrt nach dem Anwenden **in den Editor** zurück und die Selektion bleibt
  erhalten, sodass eine direkt anschließende zweite Formatierungsaktion (z. B. zusätzlich
  Fett) ohne erneutes Markieren möglich ist (analog zum bestehenden `run()`-Muster in
  `Toolbar.tsx`, das nach jedem Befehl `view.focus()` aufruft).

### 2.2 Anwenden ohne Selektion (an der Schreibmarke)
- Ohne Selektion (Cursor blinkt) wirkt die Schriftartwahl als „stored mark" auf den
  **als Nächstes getippten** Text, analog zu Fett/Kursiv an der Schreibmarke — bereits
  vorhandener Text vor/nach der Schreibmarke bleibt unverändert.
- **Bewusste Abweichung vom Farbe-Muster (Regressionsgefahr):** `applyMarkColor`/
  `clearMarkColor` (`commands.ts`) geben bei leerer Selektion `false` zurück und wirken
  **nicht** an der Schreibmarke. Für `fontFamily` ist das **kein** akzeptables Vorbild;
  die Stored-Mark-Wirkung ist hier ausdrücklich gefordert (`FEATURE-SPEC-DOCX-ODT.md`
  Abschnitt 3, Testfall 2). Wird sie aus Zeitgründen zunächst nicht umgesetzt, muss das
  als bekannte Abweichung dokumentiert werden statt stillschweigend zu fehlen.
- Nach Verlassen des aktuellen Textlaufs (z. B. Pfeiltaste, Klick an andere Stelle) muss
  die „stored mark" verworfen bzw. durch die dort tatsächlich vorhandene Formatierung
  ersetzt werden (ProseMirror-Standardverhalten für Marks), nicht dauerhaft „kleben
  bleiben".
- Verhalten nach **Enter** (neuer Absatz) direkt nach dem Setzen einer Schriftart an der
  Schreibmarke muss eindeutig definiert und getestet sein (Übernahme in den neuen Absatz
  oder Rückfall auf Absatz-Basisformat — beides ist zulässig, **muss aber dokumentiert
  und konsistent mit dem Verhalten von Fett/Kursiv an derselben Stelle sein**, kein
  Sonderfall nur für Schriftart).

### 2.3 Anzeige der aktiven Schriftart
- Steht die Schreibmarke in bereits formatiertem Text (z. B. nach Import einer
  Fremddatei), zeigt die Combobox beim Fokussieren/bei jeder Cursor-Bewegung die
  tatsächlich aktive Schriftart an (nicht den zuletzt manuell gewählten Wert einer
  anderen Stelle). Das Ableiten aus `view.state` bei jeder Transaktion ist bereits durch
  die bestehende `forceRender`-Architektur der Toolbar gedeckt (analog `currentHeadingLevel()`).
- Text ohne explizite `fontFamily`-Mark zeigt den definierten Basis-/Standardwert (siehe
  2.4), niemals einen leeren, verwirrenden Zustand, der wie ein Fehler aussieht.
- Selektion über mehrere unterschiedliche Schriftarten → „Gemischt"-Anzeige (siehe
  Abschnitt 1, Zeile 8), keine geratene Einzelschriftart.

### 2.4 Basis-/Standardschriftart (harte Anforderung; Teilfrage geklärt)
- **Harte Anforderung (verbindlich, nicht verhandelbar):** Für Text **ohne** explizite
  Nutzeraktion wird **keine** `fontFamily`-Mark erzeugt und beim Export **kein**
  `w:rFonts`/`style:font-name` erfunden. Ein unverändert re-importiertes Dokument darf
  dadurch weder fälschlich `dirty: true` werden noch beim Export eine Standardschriftart
  einfügen, die im Original nicht vorhanden war (Rundreise-Risiko, vgl.
  `speichern-exportieren-req.md` Abschnitt 2.4/„Dirty durch Normalisierung"). Der
  verifizierte Ist-Zustand (kein hartkodiertes `w:rFonts`, siehe Audit oben) stützt diese
  Anforderung — es gibt nichts, was einen Default einschleusen könnte, und das soll so
  bleiben.
- **Abhängigkeit zu einer noch offenen, dateiübergreifenden Frage:** `neues-dokument-req.md`
  Abschnitt 7, Punkt 3 führt die Frage nach einem produktweiten Schrift-Standard noch als
  **offen**, nicht wie die analoge Schriftgrößen-Frage in `schriftgroesse-waehlen-req.md`
  3.4, die bereits als angenommene Entscheidung „kein Produktstandard" gilt. Die harte
  Anforderung oben gilt nur, solange jene Frage in Richtung „bleibt implizit" beantwortet
  wird oder offen bleibt. Wird stattdessen künftig produktweit ein fester Standard (z. B.
  „Calibri 11 pt") beschlossen, muss dieser Absatz im selben Zug überarbeitet werden — er
  ist dann nicht mehr aus sich heraus gültig.
- **Teilfrage geklärt (per Code-Lektüre in dieser Fassung verifiziert, nicht mehr offen):**
  Welche generische Basisschrift die reine **Editor-Darstellung** (`.ProseMirror`) für
  markenlosen Text verwendet, war in einer früheren Fassung dieser Datei als offene Frage
  markiert. Befund: `src/index.css` definiert unter `@theme` die Tailwind-Variable
  `--font-sans: system-ui, 'Segoe UI', Roboto, sans-serif;` (Zeile 4); die Regel
  `.ProseMirror` (Zeilen 23–27) setzt **kein** eigenes `font-family` und überschreibt diese
  Variable nicht — der contenteditable-Bereich erbt somit ausschließlich den
  Browser-/Tailwind-Stack. Es gibt **keinen** bewusst gesetzten WYSIWYG-Vorgabewert wie
  „Calibri 11 pt" (anders als z. B. bei der Schriftgröße, wo `HEADING_FONT_SIZES` einen
  festen Wert je Überschriften-Ebene vorgibt, siehe 7.2 in `schriftgroesse-waehlen-req.md`).
  Das ist eine reine Anzeigefrage ohne Auswirkung auf das Datenmodell — die harte
  Anforderung oben bleibt davon unberührt (kein CSS-Fallback-Wert wird jemals als
  `fontFamily`-Mark oder Export-Attribut geschrieben). Sollte sich der Tailwind-Basis-Stack
  künftig ändern, ist diese Zeile entsprechend nachzuführen; sie ist kein Abnahme-Blocker,
  parallel zur analog behandelten Standardgrößen-Frage in `schriftgroesse-waehlen-req.md`
  3.4 und zum Seitenlayout-Leerraum in `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 8.

### 2.5 Kombination mit anderen Zeichenformaten
- Schriftart + Fett + Kursiv + Schriftfarbe + Hervorhebung gleichzeitig auf demselben
  Textlauf müssen unabhängig voneinander gesetzt/entfernt werden können (Mark-Kombination
  wie bei den bestehenden Marks), keine gegenseitige Verdrängung.
- Reihenfolge der Anwendung (z. B. erst Fett, dann Schriftart, oder umgekehrt) darf das
  Ergebnis nicht beeinflussen (ProseMirror hält Marks intern in fester Rang-Reihenfolge,
  unabhängig von der Anwendungsreihenfolge — diese Eigenschaft ist zu bestätigen, nicht
  zu unterlaufen).

### 2.6 Live-Rendering im Editor
- Die Änderung muss **sofort sichtbar** im ProseMirror-Editor selbst gerendert werden
  (`toDOM` der neuen Mark setzt tatsächlich `font-family` im Browser-Rendering) — eine
  Implementierung, die nur das Datenmodell ändert, aber keinen sichtbaren Effekt im
  Editor hat, gilt als Defekt (vgl. das in diesem Projekt ausdrücklich unterschiedene
  Muster „nur Datenmodell" vs. „echte UI-Funktion" in `FEATURE-BACKLOG.md`).
- Ist die gewählte Schriftart im Browser/Betriebssystem der Bearbeiterin nicht
  installiert, muss die CSS-`font-family`-Deklaration eine sinnvolle generische
  Fallback-Familie enthalten (`serif`/`sans-serif`/`monospace`, passend zur gewählten
  Schriftart), damit der Text lesbar bleibt statt unsichtbar/verzerrt zu wirken.

### 2.7 Font-Name-Normalisierung
- Der beim Export geschriebene Name muss **exakt** dem von der Nutzer:in gewählten bzw.
  aus der Fremddatei gelesenen Namen entsprechen (keine Groß-/Kleinschreibungsänderung,
  keine Kürzung, keine Ersetzung durch einen „ähnlichen" Namen, kein automatisches
  `trim()` mitten im Namen).
- Enthält der Name Leerzeichen oder Sonderzeichen (z. B. „Times New Roman", „Segoe UI
  Symbol", ein Firmenname mit Umlaut oder mit Komma/Anführungszeichen), muss dieser
  sowohl im internen CSS (`font-family: "Times New Roman"`, korrekt gequotet) als auch in
  der exportierten XML-Struktur (Attributwert korrekt escaped) unverändert und
  ungefährlich erhalten bleiben (siehe auch 3.2, 3.3, 3.22).

### 2.8 DOCX-spezifische Konsistenz (`w:rFonts`)
- Alle vier möglichen Attribute (`w:ascii`, `w:hAnsi`, `w:cs`, `w:eastAsia`) werden beim
  Export konsistent auf denselben gewählten Namen gesetzt, um divergierendes Rendering
  zwischen lateinischem und anderem Schriftsystem in der Zielanwendung zu vermeiden. Beim
  Import gilt als kanonischer Wert `w:ascii`, ersatzweise `w:hAnsi`. Sind **weder**
  `w:ascii` **noch** `w:hAnsi` als konkreter Name vorhanden (nur `w:eastAsia`, oder nur
  Theme-Attribute wie `w:asciiTheme`), greifen die dokumentierten Fallbacks aus 3.14 —
  kein Absturz, kein leeres Attribut, keine erfundene Schriftart.

### 2.9 ODT-spezifische Konsistenz (`style:font-name` + `office:font-face-decls`)
- Jede neu referenzierte Schriftart muss **zwingend** sowohl als `style:font-name`-Attribut
  am Textstil **als auch** als eigener `style:font-face`-Eintrag in
  `office:font-face-decls` auftauchen (ODF verlangt diese Doppelverankerung für korrekte
  Interpretation durch LibreOffice/Word). Ein Export, der nur eines von beiden schreibt,
  gilt als Defekt.
- Analog zu den bestehenden Registries (`TextStyleRegistry`) ist eine Deduplizierung
  vorzunehmen — dieselbe Schriftart darf nicht mehrfach als eigener `font-face`-Eintrag
  auftauchen, wenn sie an mehreren Textstilen verwendet wird. Die
  `office:font-face-decls` sind pro Dokumentteil getrennt zu führen (Body →
  `content.xml`, Kopf-/Fußzeile → `styles.xml`), analog zur bestehenden
  `bodyStyles`/`chromeStyles`-Trennung (siehe 3.19).

### 2.10 Zusammenspiel mit Formatvorlagen und Theme-Standardschriften
- Überschriften und Standardabsätze tragen in echten DOCX/ODT-Dateien häufig eine
  **vorlagen-/theme-basierte** Standardschrift (DOCX: `w:minorHAnsi` = Fließtext,
  `w:majorHAnsi` = Überschriften, definiert in `word/theme/theme1.xml`; ODF: Vorlagen-Font
  im benannten Absatz-/Zeichenstil). Diese App schreibt aktuell **keine** solche
  Theme-Standardschrift (verifiziert: `styleDefs.ts` erzeugt kein `w:rFonts`) — die einzige
  Schriftquelle im eigenen Export ist die direkte `fontFamily`-Mark.
- Wird auf einen Textlauf **innerhalb** einer Überschrift, eines Listenpunkts oder eines
  vorformatierten Absatzes zusätzlich eine explizite Schriftart über die neue Combobox
  gesetzt (direkte/„lokale" Formatierung), **überschreibt diese direkte Formatierung
  sichtbar die Vorlagen-/Theme-Schrift** für genau diesen Textlauf — Standard-Word/ODF-
  Verhalten „direkte Formatierung schlägt Formatvorlage". Der Rest der Überschrift ohne
  expliziten `fontFamily`-Mark bleibt bei seiner Vorlagen-/Theme-Schrift.
- Wechsel der Formatvorlage (z. B. „Überschrift 1" → „Standard") ändert die implizite
  Vorlagenschrift, lässt aber einen zuvor explizit gesetzten `fontFamily`-Mark auf
  einzelnen Textläufen unangetastet (die explizite Schrift „gewinnt" weiterhin). Dies ist
  über echte Bedienung zu bestätigen, nicht nur über Code-Lektüre (parallel zu
  `schriftgroesse-waehlen-req.md` 2.4).

---

## 3. Grenzfälle (Edge Cases)

Jeder Fall ist einzeln zu verifizieren, für **beide** Formate (DOCX und ODT), sofern
nicht anders vermerkt:

| # | Grenzfall | Erwartetes Verhalten |
|---|---|---|
| 3.1 | Selektion über mehrere Textläufe mit unterschiedlichen Schriftarten | Combobox zeigt „gemischt"/leer; Anwenden einer neuen Schriftart vereinheitlicht die gesamte Selektion auf diese eine Schriftart. |
| 3.2 | Schriftartname mit Leerzeichen (z. B. „Times New Roman") | Bleibt bei Rundreise exakt erhalten, korrekt gequotet in CSS und XML-Attributwert. |
| 3.3 | Schriftartname mit Sonderzeichen/Umlauten (z. B. eine firmeneigene Schriftart „Müller Sans") | Bleibt exakt erhalten, keine Transliteration/Normalisierung. |
| 3.4 | Sehr lange kuratierte/erweiterte Schriftartenliste (z. B. via Local Font Access API mit hunderten Systemschriften) | UI bleibt performant bedienbar (kein spürbares Einfrieren beim Öffnen der Liste oder beim Tippen im Suchfeld); Rendering der Optionsliste ist zu deckeln/zu virtualisieren, falls nötig. |
| 3.5 | Schriftart aus importierter Fremddatei, die nicht in der kuratierten Liste steht (z. B. eine Corporate-Schriftart) | Erscheint als eigener Eintrag unter „Im Dokument verwendet" (siehe 1.4); wird beim unveränderten Re-Export **nicht** stillschweigend durch eine Listen-Schriftart ersetzt. |
| 3.6 | Schriftart auf Text in einer Tabellenzelle, einem Listenpunkt, einer Überschrift oder in Kopf-/Fußzeile anwenden | Funktioniert identisch zu normalem Fließtext; strukturelle Sonderfälle nur, wo Formatvorlagen-Übersteuerung greift (siehe 2.10), nicht bei der reinen Anwendung. **Kopf-/Fußzeile — Reihenfolge-Abhängigkeit beachten:** `kopfzeile-bearbeiten`/`fusszeile-bearbeiten` (eigene Slugs, `FEATURE-BACKLOG.md:250`/`251`) gelten selbst noch als „fehlt" — es gibt aktuell keine UI, um eine Kopf-/Fußzeile im Editor zu erstellen/zu befüllen. Da `docx/reader.ts`/`docx/writer.ts` `w:headerReference`/`w:footerReference`/`header1.xml`/`footer1.xml` bereits auf Datenmodell-Ebene lesen/schreiben (denselben Lauf-Parsing-Pfad wie der Haupttext nutzend), ist die **Rundreise-Erhaltung** einer in einer Fremddatei bereits vorhandenen Kopf-/Fußzeilen-Schriftart schon jetzt testbar; das **aktive Setzen** einer neuen Schriftart über die Toolbar-Combobox bei Cursor in einem Kopf-/Fußzeilenbereich ist dagegen erst möglich, sobald jene beiden Features existieren — kein Blocker dieser Datei, aber zu beachtende Testreihenfolge. |
| 3.7 | Undo/Redo einer Schriftartänderung | Strg+Z macht die Änderung vollständig rückgängig (auch nach mehreren nachfolgenden Tippschritten in der History), Strg+Y/Strg+Umschalt+Z stellt sie wieder her; genau ein Undo-Schritt pro bewusster Auswahl (kein Schwarm von Zwischenschritten). |
| 3.8 | Schriftart an der Schreibmarke in einem komplett leeren Dokument setzen, dann erstes Zeichen tippen | Erstes und alle folgenden Zeichen erhalten die gewählte Schriftart. |
| 3.9 | Dieselbe Schriftart erneut auf bereits so formatierten Text anwenden (No-Op) | Keine Fehlermeldung, keine doppelten/verschachtelten Marks, Ergebnis bleibt identisch. |
| 3.10 | Freitext-Eingabe eines Schriftartnamens, der weder in der kuratierten Liste noch als Systemschriftart existiert (Tippfehler oder bewusst exotischer Name) | Wird trotzdem übernommen (Word/LibreOffice erlauben das ebenfalls) — Editor-Rendering fällt auf CSS-Fallback zurück (siehe 2.6), Export schreibt den Namen trotzdem unverändert (keine stille Ablehnung). |
| 3.11 | Kein Treffer bei der Such-/Filtereingabe in der Combobox | Sichtbarer Hinweis „Keine Schriftart gefunden" statt leerer, wirkungslos wirkender Liste; Freitext-Übernahme (3.10) bleibt trotzdem möglich. |
| 3.12 | Local Font Access API nicht unterstützt (Firefox, Safari) oder Berechtigung durch Nutzer:in verweigert | Kuratierte Liste bleibt vollständig funktionsfähig, kein Fehler in der Konsole, kein blockierender Dialog-Loop, kein Hinweis, der wie ein Absturz wirkt. |
| 3.13 | ODT-Fremddatei mit `style:font-name` am Textstil, aber **ohne** passenden Eintrag in `office:font-face-decls` (unvollständige/kaputte Datei) | Kein Absturz; Fallback auf den rohen `style:font-name`-Wert als Anzeigename, Text bleibt lesbar zugeordnet (kein stiller Verlust der Information, dass diese Stelle eine bestimmte Schriftart haben sollte). |
| 3.14 | DOCX-Fremddatei mit `w:rFonts`, das nur `w:eastAsia` (ostasiatisches Schriftsystem) trägt, aber kein `w:ascii`/`w:hAnsi` | Definiertes Fallback-Verhalten (kein `fontFamily`-Mark für den lateinischen Anteil → Basis-/Standardschrift), kein Absturz, kein leeres Attribut. |
| 3.15 | DOCX-Fremddatei, die Schriftarten **ausschließlich** über Theme-Attribute referenziert (`w:asciiTheme="minorHAnsi"`/`w:hAnsiTheme`/`w:cstheme`, konkrete Familie nur in `word/theme/theme1.xml`) | Kein Absturz, **kein Textverlust**. Konkrete Auflösung der Theme-Schrift ist Best-Effort/Nicht-Ziel (siehe 5.4): Entweder wird `theme1.xml` ausgewertet und die konkrete Familie als Mark übernommen, **oder** es wird bewusst kein `fontFamily`-Mark gesetzt (Text fällt auf Basisschrift). Das gewählte Verhalten ist zu dokumentieren. **Reale Fixtures im Repo**: laut Umsetzungsplan `schriftart-waehlen-code.md` referenzieren `tests/fixtures/external/docx/Bug54771a.docx` und `Bug54771b.docx` Schriftarten genau so (`w:asciiTheme="majorHAnsi"`) — sie sind als Pflicht-Testeingabe für diesen Fall zu verwenden. |
| 3.16 | Leere oder rein aus Leerzeichen bestehende Freitext-Eingabe im Combobox-Feld (Enter/Blur auf leerem Feld) | Kein `fontFamily`-Mark wird gesetzt, kein leeres `font-family`/`w:rFonts`/`style:font-name` wird exportiert; No-Op ohne Exception, vorheriger Anzeigewert kehrt zurück. |
| 3.17 | Reines Umschalten zwischen zwei Schriftarten mehrfach hintereinander in schneller Folge (Stresstest für Selection-Sync, vgl. bekannten Bug aus `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 2) | Kein Verlust/keine Vermischung des Dokumentinhalts, Editor bleibt normal bedienbar (Regressionsfall analog zum dort beschriebenen Selection-Sync-Bug — Tabellen und Schnellwechsel von Zeichenformaten waren dort als Hauptverdachtsfälle benannt). |
| 3.18 | Schriftartwahl direkt gefolgt von Bild-Einfügen oder Tabellen-Einfügen an derselben Cursor-Position | Kein Crash, „stored mark" verhält sich konsistent zu den bestehenden Marks in derselben Situation. |
| 3.19 | ODT-Fremddatei mit **doppelten/suffixierten** Font-Face-Namen (typisch für Word→ODT-Export: `Arial1`, `Arial2` für dieselbe visuelle Schrift) bzw. mit `office:font-face-decls` **sowohl** in `content.xml` **als auch** in `styles.xml` | Jeder `style:font-name`-Verweis wird gegen die Font-Face-Map **seines eigenen Dokumentteils** aufgelöst (keine teilübergreifende Verwechslung); der aufgelöste `svg:font-family`-Anzeigename ist maßgeblich, nicht die interne `T…`/`ArialN`-ID. Beim **eigenen** Export dedupliziert die App pro Teil, sodass dieses Suffix-Kollisionsmuster nicht neu erzeugt wird. **Reale Fixture**: `tests/fixtures/external/odt/FruitDepot-SeasonalFruits4.odt`. |
| 3.20 | Einfügen von extern kopiertem, formatiertem Text mit Inline-`font-family` (Zwischenablage-HTML aus Webseite/Word) | Wird über den `parseDOM`-Pfad der `fontFamily`-Mark erkannt und sinnvoll übernommen oder sauber auf Klartext reduziert, nicht korrumpiert (parallel zu `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 2, Testfall 4) — nachrichtlich, da Copy/Paste ein eigener Backlog-Bereich ist, aber nicht negativ betroffen sein darf. |
| 3.21 | Export einer Schriftart-Mark auf einem Textlauf, der gleichzeitig eine Track-Changes-Markierung trägt (sobald Abschnitt 13 aus `FEATURE-SPEC-DOCX-ODT.md` umgesetzt ist) | Nachrichtlich/zukünftig: keine gegenseitige Zerstörung der Marks — aktuell nicht blockierend, da Track Changes selbst noch nicht existiert. |
| 3.22 | Fremddatei mit einem Schriftartnamen, der CSS-/XML-signifikante Zeichen enthält (Komma, doppeltes Anführungszeichen, `<`/`>`/`&`) | Name wird im CSS korrekt gequotet/escaped (kein Aufbrechen der `font-family`-Deklaration, keine CSS-„Injection") **und** im XML-Attribut korrekt escaped (`&amp;`/`&quot;`), verlustfrei erhalten; kein Absturz beim Rendern oder Export. |
| 3.23 | Zwei Nutzer:innen-Aktionen quasi gleichzeitig: Schriftart per Dropdown wählen, während parallel noch eine vorherige Selektion per Maus verändert wird (Doppelklick + sofortiger Dropdown-Klick) | Deterministisches, nachvollziehbares Ergebnis — keine Race Condition, die zu unklarer/vermischter Formatierung führt. |
| 3.24 | Eine Schriftart steht **sowohl** in der Gruppe „Im Dokument verwendet" (aus einer Fremddatei) **als auch** in der kuratierten bzw. per Local Font Access ergänzten Liste (identischer Name) | Erscheint in der Dropdown-Liste nur **einmal** (Deduplizierung nach Name, case-sensitiv wie gespeichert); die „Im Dokument verwendet"-Gruppe hat bei der Zuordnung Vorrang. Kein doppelter Eintrag, keine zwei widersprüchlichen Vorschauzeilen, kein instabiler `key` beim Neu-Rendern der Liste. |
| 3.25 | **(neu in diesem Durchlauf, per Entpacken verifiziert)** ODT-Fremddatei, deren `office:font-face-decls` den Wert von `svg:font-family` für mehrteilige Namen selbst bereits in literale Apostrophe eingeschlossen liefert — nicht nur zur CSS-Serialisierung, sondern als Teil des dekodierten XML-Attributwerts selbst. Beleg: `tests/fixtures/external/odt/FruitDepot-SeasonalFruits5.odt`, `content.xml`, enthält u. a. `style:name="Andale Sans UI" svg:font-family="&amp;apos;Andale Sans UI&amp;apos;"` und `style:name="Times New Roman" svg:font-family="&amp;apos;Times New Roman&amp;apos;"` — nach XML-Dekodierung lautet der Attributwert wörtlich `'Andale Sans UI'` bzw. `'Times New Roman'` (mit echten Apostroph-Zeichen am Anfang/Ende), während einwortige Namen in derselben Datei (`Arial`, `Tahoma`) **ohne** solche Umschließung vorliegen. Vermutlich Artefakt eines Nicht-LibreOffice/Nicht-Word-Erzeugungswerkzeugs, das einen CSS-`font-family`-Stack wörtlich in `svg:font-family` übernommen hat. | Der Reader muss ein exakt passendes, symmetrisches Anführungszeichenpaar (`'…'` oder `"…"`) am Rand des dekodierten `svg:font-family`-Werts erkennen und **entfernen**, bevor der Name als Anzeige-/Mark-Wert übernommen wird — sonst zeigt die Combobox „'Andale Sans UI'" (mit Apostrophen im sichtbaren Namen) an, und ein Re-Export würde bei DOCX ein fehlerhaftes `w:ascii="'Andale Sans UI'"` bzw. bei ODT eine doppelt/falsch gequotete CSS-`font-family`-Deklaration erzeugen, die in der Zielanwendung keine reale Schriftart mehr trifft (Verstoß gegen 2.7, Font-Name-Normalisierung). Ein Name, der **absichtlich** mit einem Apostroph beginnt oder endet (z. B. eine fiktive Schriftart „D'Nealian Script"), darf dabei **nicht** fälschlich beschnitten werden — nur ein **symmetrisches** Paar an beiden Rändern wird entfernt, ein einzelnes Anführungszeichen an nur einem Rand bleibt unangetastet. |

---

## 4. Grenzfälle der Bedienelemente selbst (UI-Robustheit)

Die Unterpunkte sind bewusst mit `4.x` nummeriert, weil der übrige Text sie so
referenziert (z. B. „siehe 4.6", „Grenzfall 4.3", „4.5").

**4.1** Klick in die Combobox, während bereits eine andere Toolbar-Dropdown (z. B.
Absatzformat) geöffnet ist → nur eine Dropdown-Liste gleichzeitig offen, keine
überlappende/verdeckte Darstellung.

**4.2** Combobox ist per Tab erreichbar und vollständig per Tastatur bedienbar (siehe 1.7),
kein reiner Maus-only-Weg (Accessibility-Grundanforderung, analog zur
Barrierefreiheits-Anforderung in `datei-oeffnen-req.md`).

**4.3** Öffnen der Dropdown-Liste darf den Editor-Fokus/die aktuelle Selektion **nicht**
zerstören, bevor die Auswahl bestätigt ist (Klick in die Liste selbst ist eine
bekannte Quelle für Selection-Sync-Probleme in diesem Projekt, siehe 3.17). Konkret:
zwischen Öffnen der Liste und Bestätigen darf keine Transaktion auf `view` dispatcht
werden, und Klicks auf Listeneinträge müssen den Blur des Eingabefelds unterdrücken
(`onMouseDown`+`preventDefault`, wie bei den bestehenden Toolbar-Buttons).

**4.4** Schließen der Liste per Klick außerhalb (Blur) ohne Auswahl → keine Änderung am
Dokument, Anzeigewert kehrt zur zuvor aktiven Schriftart zurück.

**4.5** Wiederholtes schnelles Öffnen/Schließen der Liste → kein Speicherleck, kein
doppeltes Event-Handler-Registrieren (insbesondere falls Local Font Access API pro
Öffnung neu abgefragt würde — Ergebnis muss gecacht werden, nicht bei jedem
Öffnen erneut den Berechtigungsdialog auslösen; höchstens ein Dialog pro Tab-Lebensdauer).

**4.6 ARIA-Semantik (verbindlich):** Das Eingabefeld trägt `role="combobox"` mit
`aria-expanded`, `aria-controls` auf die Options-Liste und ein sprechendes
`aria-label="Schriftart"`; die Liste trägt `role="listbox"`, die Einträge
`role="option"` mit korrektem `aria-selected` für den aktuell hervorgehobenen Eintrag.
Der „Entfernen"-Button (Abschnitt 1, Zeile 14) hat ein `title`/`aria-label` „Schriftart
entfernen". Der Hinweis „Keine Schriftart gefunden" (3.11) ist in einer
`aria-live="polite"`-Region auszugeben, damit Screenreader das leere Filterergebnis
ansagen statt es stumm zu übergehen. Der als Glyph verwendete „⌫"-Charakter ist laut
`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.1 als potenziell unzuverlässig gelistet (leeres
Rechteck/Fragezeichen auf Systemen ohne passende Glyphen-Unterstützung) — Rendering auf
mehreren Systemen prüfen, ggf. auf ein SVG-Icon umstellen.

**4.7** Combobox, Optionsliste und die Live-Vorschau je Eintrag müssen sowohl im hellen
als auch im dunklen App-Theme lesbar und bedienbar sein (konsistent mit der bestehenden
Toolbar, die bereits `dark:`-Varianten nutzt): ausreichender Kontrast des Eingabetexts,
des Platzhalters („Standard"/„Gemischt", siehe Abschnitt 1, Zeile 8) und des
hervorgehobenen Listeneintrags in **beiden** Themes — eine Vorschau in der Eigen-Schriftart
darf nicht mit dem Theme-Hintergrund verschmelzen.

**4.8** Fokusverlust per **Tab** (Weiterspringen zum nächsten Toolbar-Bedienelement) bei
geöffneter Liste verhält sich identisch zum Blur per Klick außerhalb (4.4): die Liste
schließt, es wird **keine** Änderung am Dokument vorgenommen, der Anzeigewert kehrt zur
zuvor aktiven Schriftart zurück. Ein lediglich per Pfeiltaste **hervorgehobener**, aber
nicht per Enter bestätigter Eintrag darf dabei **nicht** stillschweigend angewendet werden
— sonst würde reines Durchtabben der Toolbar ungewollt formatieren. Umgekehrt bleibt die
Combobox in der Tab-Reihenfolge an ihrer festen Position zwischen Absatzformat-Dropdown
und Fett-Button (siehe Abschnitt 1, Zeile 1), damit die Reihenfolge der Toolbar-Elemente
für Tastaturnutzer:innen stabil und vorhersehbar bleibt.

---

## 5. Nicht-Ziele / bewusste Abgrenzung

### 5.1 Getrennte Slugs
Folgende, im Feature-Backlog separat geführte Punkte sind **ausdrücklich nicht** Teil
dieser Anforderung: `schriftgroesse-waehlen`, `schrift-vergroessern`/
`schrift-verkleinern`, `gross-kleinschreibung`, `zeichenabstand`, `texteffekte`,
`formatierung-loeschen`, `formatvorlage-erstellen`, `formatvorlagen-satz`.

### 5.2 Keine Schriftart-Binärdaten-Einbettung
Das tatsächliche Einbetten der Schriftart-**Datei** (Glyphen/TTF-Daten) in die
exportierte DOCX (`w:embedTrueTypeFonts`-Flag in `settings.xml` + `word/fontTable.xml` +
zugehörige `.fntdata`-Teile) bzw. eine entsprechende ODF-Erweiterung ist **nicht**
Gegenstand dieser Anforderung. Diese App speichert und referenziert ausschließlich den
**Namen** der Schriftart, nicht die Schriftdaten selbst — genau wie die
Backlog-Beschreibung „Liste installierter/**eingebetteter** Schriftarten" es für den
Auswahl-Dialog meint (zeigt auch im Dokument bereits referenzierte/„eingebettete"
Namen an, siehe 1.4), nicht wie für eine vollständige Font-Embedding-Pipeline. Diese
Abgrenzung muss im Backlog als bewusste, dokumentierte Einschränkung vermerkt werden,
sobald diese Datei umgesetzt/abgenommen wird — nicht stillschweigend offenbleiben (vgl.
„Kein stiller Fehlschlag"-Prinzip aus `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.4,
sinngemäß auf Scope-Dokumentation übertragen).

### 5.3 Keine volle Parität der Systemschriftarten-Erkennung
Eine zuverlässige, browserübergreifende Erkennung aller tatsächlich auf dem Gerät der
Nutzer:in installierten Schriftarten ist technisch nicht in allen Browsern möglich
(Fingerprinting-Schutz). Es gilt ausschließlich: kuratierte Liste (verbindlich, überall)
+ optionale Local Font Access API-Erweiterung (nur Chromium, nur mit Nutzer-Erlaubnis).
Eine abweichende Erwartungshaltung („muss auf jedem Browser echte Systemschriften
zeigen") ist kein Verifikationskriterium dieser Datei.

### 5.4 Keine vollständige Auflösung von Theme-Schriften
Das Auflösen einer DOCX-Theme-Schrift (`w:asciiTheme`/`w:hAnsiTheme`/`w:cstheme` →
`word/theme/theme1.xml`, `<a:majorFont>`/`<a:minorFont>`) auf die konkrete Schriftfamilie
ist **kein** Pflichtbestandteil dieser Anforderung (analog zur Nicht-Auswertung von
Word-Theme-Farben in `schriftfarbe-req.md` Grenzfall 4.11). Pflicht ist nur das definierte,
absturzfreie und **textverlustfreie** Fallback-Verhalten aus Grenzfall 3.15. Wird die
Auflösung als Best-Effort umgesetzt, ist das ein Zugewinn, aber ihre Abwesenheit ist kein
Abnahme-Blocker — sie muss lediglich als bewusste Einschränkung dokumentiert werden.

---

## 6. Rundreise-Anforderung (verbindlich für „vollständig verifiziert")

Diese Anforderung ist die zentrale Abnahmebedingung für den Status „vollständig
verifiziert" dieses Backlog-Eintrags, zusätzlich zu allen Einzelfällen aus Abschnitt 3:

> Datei A (DOCX **oder** ODT) mit mindestens einem Textlauf, der eine explizite,
> von Word/LibreOffice gesetzte Schriftart trägt, hochladen → **ohne jede Änderung**
> im Editor sofort exportieren → Ergebnisdatei erneut über denselben Importweg
> importieren → die Schriftart jedes betroffenen Textlaufs muss exakt (Name,
> Zuordnung zum richtigen Textteil) erhalten bleiben.
>
> Zusätzlich, weil diese Funktion komplett neu gebaut wird: Ein **neues** Dokument im
> Editor erstellen, auf eine Selektion eine Schriftart über die neue Combobox anwenden,
> als DOCX **und** als ODT exportieren, jeweils re-importieren → die gewählte
> Schriftart bleibt in beiden Formaten exakt erhalten. Dieser zweite Fall ist der
> eigentliche Kernnachweis, dass die Funktion funktioniert, da es zum Zeitpunkt dieser
> Spezifikation noch kein Bestandsdokument mit einer über die App selbst gesetzten
> Schriftart-Mark gibt.

Prüfkriterien (je Kriterium einzeln abhakbar):

1. **Zuordnung**: Die Schriftart bleibt exakt demselben Textlauf zugeordnet, nicht nur
   „irgendwo im Dokument vorhanden".
2. **Name**: Zeichengetreu identisch (Groß-/Kleinschreibung, Leerzeichen,
   Sonderzeichen), keine Normalisierung/Ersetzung.
3. **Kombination**: Bleibt in Kombination mit Fett/Kursiv/Unterstrichen/Durchgestrichen/
   Schriftfarbe/Hervorhebung auf demselben Textlauf zusammen erhalten (vgl.
   `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 3, Testfälle 3–5).
4. **Struktur**: Schriftart auf Text innerhalb einer Tabellenzelle, eines Listenpunkts,
   einer Überschrift und in Kopf-/Fußzeile bleibt jeweils erhalten (Kopf-/Fußzeile: siehe
   Reihenfolge-Abhängigkeit zu `kopfzeile-bearbeiten`/`fusszeile-bearbeiten` in Grenzfall
   3.6 — Rundreise einer bereits vorhandenen Fremddatei-Schriftart ist schon jetzt prüfbar,
   das aktive Neu-Setzen über die Toolbar erst nach jenen Features); eine direkte
   Schrift, die eine Vorlagen-/Theme-Schrift übersteuert (2.10), bleibt nach Reimport
   weiterhin als direkte Formatierung erkennbar.
5. **Kein stiller Verlust bei Fremddatei-Schriftarten**: Eine Schriftart aus einer
   Fremddatei, die nicht in der kuratierten Liste steht, bleibt bei unverändertem
   Re-Export exakt erhalten (nicht durch Standard-/Listen-Schriftart ersetzt).
6. **Kein Absturz/keine Exception** während des gesamten Zyklus
   Import → Export → Re-Import bzw. Neu erstellen → Export → Re-Import.
7. **Kein unnötiges Dirty-Flag**: Ein unverändert re-importiertes Dokument mit
   Schriftart-Marks gilt weiterhin als `dirty: false` (siehe 2.4).

**Format-Matrix — jede Zelle ist ein Pflicht-Testfall:**

| Zyklus | Pflicht |
|---|---|
| DOCX mit Schriftart-Formatierung hochladen → unverändert als DOCX exportieren → DOCX re-importieren | Ja — Kriterien 1–7 |
| ODT mit Schriftart-Formatierung hochladen → unverändert als ODT exportieren → ODT re-importieren | Ja — Kriterien 1–7 |
| Neues Dokument → Schriftart über die Toolbar setzen → als DOCX exportieren → DOCX re-importieren | Ja — Kriterien 1–3, 6, 7 |
| Neues Dokument → Schriftart über die Toolbar setzen → als ODT exportieren → ODT re-importieren | Ja — Kriterien 1–3, 6, 7 |
| DOCX-Fremddatei mit reiner Theme-Schrift (`Bug54771a.docx`/`Bug54771b.docx`) hochladen → unverändert exportieren → re-importieren | Ja — Kriterium 6 (Textverlustfreiheit/kein Crash) verbindlich; Kriterien 1–2 nur, falls Theme-Auflösung umgesetzt wurde (siehe 5.4) |

Sobald `speichern-unter-format` (Cross-Format-Export DOCX↔ODT, aktuell laut Backlog
„fehlt") umgesetzt ist, gilt ergänzend (informativ, nicht Blocker für den Basis-Scope
dieser Datei, aber zwingend nachzutragen, sobald verfügbar — Schriftartnamen sind nicht
zwingend 1:1 zwischen Word- und LibreOffice-Standardsätzen austauschbar, z. B.
„Calibri" vs. „Carlito"/„Liberation Sans"):

| Zyklus | Status |
|---|---|
| DOCX mit Schriftart hochladen → als ODT exportieren → ODT re-importieren | Nachrichtlich, sobald Cross-Format-Export existiert (siehe `FEATURE-SPEC-DOCX-ODT.md` 1.3, Testfall 3) |
| ODT mit Schriftart hochladen → als DOCX exportieren → DOCX re-importieren | Nachrichtlich, sobald Cross-Format-Export existiert (siehe `FEATURE-SPEC-DOCX-ODT.md` 1.3, Testfall 4) |

**Testdaten-Anforderung**: Zusätzlich zu einer trivialen Ein-Satz-Datei ist je Format
mindestens eine realistische Testdatei mit **mehreren** unterschiedlichen, explizit
gesetzten Schriftarten in verschiedenen Textläufen zu verwenden, inklusive:
- mindestens einer „exotischen"/nicht kuratierten Schriftart (Grenzfall 3.5),
- mindestens einem Namen mit Leerzeichen (3.2) und einem mit Umlaut/Sonderzeichen (3.3),
- mindestens einer Überschrift mit einem Textlauf, der eine von der Vorlagen-/Theme-Schrift
  abweichende, explizite Schrift trägt (2.10, Kriterium 4).
Als reale Fremd-Fixtures stehen im Repo u. a. `tests/fixtures/external/docx/Bug54771a.docx`
/`Bug54771b.docx` (Theme-Schrift, 3.15),
`tests/fixtures/external/docx/bug59058.docx` (per Entpacken verifiziert: `w:ascii`-Werte
u. a. „MinionPro-Regular"/„MinionPro-bold"/„MinionPro-It" — nicht in der kuratierten Liste
aus 1.2 enthalten, damit direkt als Nachweis für Grenzfall 3.5 und Testfall 24 „Im Dokument
verwendet" nutzbar),
`tests/fixtures/external/odt/FruitDepot-SeasonalFruits4.odt` (suffixierte Font-Faces, 3.19;
per Entpacken verifiziert: `office:font-face-decls` in `content.xml` enthält u. a.
`style:name="Arial1"`/`"Arial2"`/`"Tahoma1"`, jeweils mit abweichendem
`svg:font-family="Arial"`/`"Tahoma"`),
`tests/fixtures/external/odt/FruitDepot-SeasonalFruits5.odt` (**neu in diesem Durchlauf
ergänzt** — literal apostroph-umschlossene `svg:font-family`-Werte für mehrteilige Namen,
3.25; per Entpacken verifiziert: `style:name="Andale Sans UI"` → `svg:font-family="'Andale
Sans UI'"`, `style:name="Times New Roman"` → `svg:font-family="'Times New Roman'"`,
während `Arial`/`Tahoma` in derselben Datei unquotiert bleiben)
sowie `tests/fixtures/external/odt/CharacterParagraphFormat.odt`,
`CharacterParagraphFormat_MSO15.odt` (**neu ergänzt** — zusätzliche exotische/nicht
kuratierte Font-Face-Namen `Calibri Light`, `Mangal`, `Microsoft YaHei`, `SimSun` für
Grenzfall 3.5), `Larissa.odt`, `Lebenslauf_DOC_LO4.0.5.1.odt` (reale Zeichenformatierung)
zur Verfügung (vgl. Fixture-Konvention aus `datei-oeffnen-req.md`, Verzeichnis
`tests/fixtures/external`).

---

## 7. Testfälle (Zusammenfassung, konkret abhakbar — E2E über echte Browser-Bedienung, Pflicht)

Jeder Punkt ist als dauerhaft in der Suite verbleibender, echter Test (Playwright im
echten Browser, nicht nur Reader/Writer-Unit-Test) nachzuweisen. Kein Sammeltest, der
Einzelergebnisse verschleiert.

1. Combobox ist in der Toolbar sichtbar, per Tab erreichbar und trägt die ARIA-Rollen aus
   4.6 (`role="combobox"`/`role="listbox"`/`role="option"`).
2. Text markieren, Schriftart aus der Dropdown-Liste wählen → Text wird sichtbar in der
   Schriftart gerendert (`font-family` im DOM), Fokus kehrt in den Editor zurück, Selektion
   bleibt erhalten (2.1, 2.6).
3. Freitext-Namen eintippen + Enter → wird auf die Selektion angewendet, auch wenn der
   Name nicht in der Liste steht (3.10); Rendering nutzt CSS-Fallback (2.6).
4. Schriftart ohne Selektion (an der Schreibmarke) setzen, dann tippen → nur neu getippter
   Text erhält die Schriftart, umgebender Text bleibt unverändert (2.2, 3.8).
5. Selektion über mehrere unterschiedliche Schriftarten → Feld zeigt „Gemischt", neue
   Auswahl vereinheitlicht die gesamte Selektion (2.3, 3.1).
6. Schriftart auf einen Textlauf innerhalb einer Überschrift → übersteuert sichtbar die
   Vorlagen-/Theme-Schrift, Rest der Überschrift bleibt unverändert (2.10).
7. Kombination Schriftart + Fett + Kursiv + Schriftfarbe + Hervorhebung auf demselben
   Textlauf → alle gleichzeitig sichtbar und unabhängig wieder entfernbar (2.5).
8. „Entfernen"-Aktion (`clearFontFamily`) auf formatiertem Text → Schrift kehrt auf den
   Basiswert zurück; auf schriftartlosem Text → No-Op ohne Exception.
9. Leere/whitespace-only Freitext-Eingabe → kein Mark, kein leeres Attribut im Export
   (3.16).
10. Such-/Filtereingabe ohne Treffer → sichtbarer Hinweis „Keine Schriftart gefunden",
    Freitext-Übernahme weiterhin möglich (3.11).
11. Local Font Access API: verfügbar+erlaubt → Systemschriften erscheinen; nicht
    verfügbar/verweigert → kuratierte Liste bleibt voll funktionsfähig, kein Konsolenfehler,
    höchstens ein Berechtigungsdialog pro Tab (3.12, 4.5).
12. Undo/Redo über eine Sequenz Tippen → Schrift A → Schrift B → entfernen → weiter tippen:
    jeder Schritt einzeln korrekt rückgängig/wiederherstellbar, ein Undo-Schritt pro
    Auswahl (3.7).
13. Regressionstest Selection-Sync-Bug mit „Schriftart" (Alles auswählen → Schrift anwenden
    → per Klick neu positionieren → Enter → weitertippen → beide Absätze bleiben erhalten
    und behalten ihre Schrift) — Pflichttest, dauerhaft in der Suite (3.17,
    `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 2).
14. Schriftartwahl direkt gefolgt von Bild-/Tabellen-Einfügen an derselben Position → kein
    Crash (3.18).
15. Rundreise DOCX (Editor-erzeugt): Schrift setzen → Export → Reimport → exakt erhalten
    (Abschnitt 6, Zeile 3 der Matrix).
16. Rundreise ODT (Editor-erzeugt): dito (Abschnitt 6, Zeile 4).
17. Rundreise DOCX (Fremddatei, mehrere/exotische Schriften): unverändert exportieren →
    reimportieren → jede Schrift an ihrer Textstelle exakt erhalten (Abschnitt 6, Zeile 1;
    Testdaten-Anforderung).
18. Rundreise ODT (Fremddatei, inkl. suffixierter Font-Faces `FruitDepot-SeasonalFruits4.odt`):
    dito, korrekte teil-getrennte Auflösung (Abschnitt 6, Zeile 2; 3.19).
19. Import DOCX mit reiner Theme-Schrift (`Bug54771a.docx`) → kein Crash, kein Textverlust;
    dokumentiertes Fallback bzw. aufgelöste Schrift (3.15, 5.4).
20. Import mit `w:rFonts` nur `w:eastAsia` bzw. ODT ohne passenden `font-face-decl` →
    definierter, absturzfreier Fallback (3.13, 3.14).
21. Fremddatei-Schriftartname mit Komma/Anführungszeichen/`&` → korrekt gequotet/escaped in
    CSS und XML, verlustfrei, kein Rendering-/Export-Bruch (3.22).
22. Kein unnötiges Dirty-Flag: unveränderter Re-Import einer Datei mit Schriftart-Marks
    bleibt `dirty: false` (2.4, Kriterium 7).
23. Validierung des exportierten XML mit unabhängigem Werkzeug: `w:rFonts` wird von einem
    unabhängigen OOXML-Parser als Schriftart erkannt; ODF-Export enthält für jede Schrift
    **sowohl** `style:font-name` **als auch** einen `style:font-face`-Eintrag (2.9,
    `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 19).
24. „Im Dokument verwendet"-Gruppe (1.4, 3.5): Nach Import einer Fremddatei mit einer
    Schriftart, die **nicht** in der kuratierten Liste steht (z. B. `bug59058.docx` mit
    `MinionPro-Regular`), erscheint dieser Name beim Öffnen der Combobox als eigener,
    auswählbarer `role="option"`-Eintrag in der Gruppe „Im Dokument verwendet" — nicht nur
    beim reinen Re-Export erhalten (das prüft Testfall 17), sondern in der Bedienoberfläche
    tatsächlich sichtbar und erneut anwendbar. Dies ist der konkrete UI-Nachweis für das
    Backlog-Wort „**eingebetteter** Schriften" (siehe 5.2). Steht derselbe Name auch in der
    kuratierten/System-Liste, erscheint er nur einmal (Deduplizierung, 3.24).
25. Tab-Fokusverlust bei geöffneter Liste (4.8): Combobox öffnen, mit Pfeiltaste einen
    Eintrag hervorheben (ohne Enter), dann Tab drücken → Fokus springt zum nächsten
    Toolbar-Element, die Liste schließt, es wird **keine** Schriftart-Mark gesetzt und der
    Anzeigewert kehrt zur zuvor aktiven Schriftart zurück.
26. Import von `FruitDepot-SeasonalFruits5.odt` (3.25) → die Textläufe, die auf
    `svg:font-family="'Andale Sans UI'"`/`"'Times New Roman'"` verweisen, zeigen in der
    Combobox/als Mark den bereinigten Namen **ohne** umschließende Apostrophe; ein
    unveränderter Re-Export erzeugt eine korrekt gequotete (aber nicht doppelt gequotete)
    CSS-/ODF-Deklaration. Zusätzlich Negativprobe mit einem konstruierten Testnamen, der
    absichtlich nur an einem Rand ein Anführungszeichen trägt (z. B. `D'Nealian Script`) →
    bleibt unverändert, wird nicht fälschlich beschnitten.

---

## 8. Abnahmekriterium für „vollständig verifiziert"

Der Backlog-Status für `schriftart-waehlen` darf erst dann von „fehlt" auf „verifiziert"
(bzw. „vorhanden (verifiziert)") geändert werden, wenn:

1. Die Funktion gemäß Abschnitt 1 und 2 tatsächlich gebaut wurde — Schema-Mark,
   Toolbar-Bedienelement, Commands-Funktionen, DOCX- **und** ODT-Reader/Writer, nicht
   nur eines davon (ein reines Datenmodell-Attribut ohne bedienbare UI wäre nach der in
   `FEATURE-BACKLOG.md` verwendeten Methodik weiterhin „teilweise", nicht „vorhanden").
2. Jeder Punkt aus Abschnitt 3 (Grenzfälle), Abschnitt 4 (UI-Robustheit) und Abschnitt 7
   (Testfälle) einzeln mit einem echten, im Browser ausgeführten Test nachgewiesen ist
   (nicht nur Reader/Writer-Unit-Test mit direkt konstruierten Testdaten) — analog zur in
   `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 22 Punkt 6 beschriebenen QA-Übergabe.
3. Die vollständige Rundreise-Matrix aus Abschnitt 6 für DOCX **und** ODT sowie für
   „Bestandsdatei" **und** „neu erstelltes Dokument" grün ist, inklusive aller sieben
   Prüfkriterien und der geforderten Testdaten-Mindestabdeckung.
4. Die Teilfrage aus 2.4 (Editor-WYSIWYG-Basisschrift) ist bereits in dieser Fassung
   beantwortet (Tailwind-`--font-sans`-Stack, kein bewusst gesetzter Wert wie „Calibri");
   sollte sich der zugrunde liegende CSS-Stack bis zur Abnahme ändern, ist das hier
   nachzutragen. Die harte Anforderung „kein erfundener Export-Default" ist davon unabhängig
   nachweislich einzuhalten.
5. Die bewussten Abgrenzungen aus 5.2 (keine Font-Binärdaten-Einbettung) und 5.4 (keine
   Pflicht-Auflösung von Theme-Schriften) im Backlog als dokumentierte, akzeptierte
   Einschränkungen vermerkt sind — nicht als übersehene Lücken.
6. Kein offener, aus dieser Datei hervorgegangener Fehlerbefund unbeantwortet bleibt
   (jeder Fund entweder behoben und regressionsgetestet, oder bewusst als bekannte
   Einschränkung dokumentiert, analog zur „Kein stiller Fehlschlag"-Anforderung in
   `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.4).

---

## 9. Umsetzungsstand (2026-07-11)

**Umgesetzt in zwei Scheiben** — `86e40f9` (Datenmodell + beide Formatpfade) und diese
UI-Scheibe. Verifiziert: Unit 765/765 (Scheibe 1: fonts.ts-Helfer, Commands, DOCX/ODT-
Rundreisen inkl. Sonderzeichen-Name 3.22, hAnsi-Fallback, eastAsia-only-ohne-Mark 3.14,
font-face-decls-Doppelverankerung+Dedupe 2.9, reale 3.25-Fixture
FruitDepot-SeasonalFruits5.odt); E2E `schriftart.spec.ts` 9 Testfälle grün auf Desktop
Chrome, Mobile und Tablet (inkl. Rundreisen mit Roh-XML-Assertions).

**Getroffene Entscheidungen:**
- **Grenzfall 3.15 (Theme-only-Referenzen):** Variante „bewusst KEIN fontFamily-Mark"
  (Text fällt auf Basisschrift; Theme-Auflösung bleibt gemäß §5.4 Nicht-Ziel).
- **§1 #3 Local Font Access:** progressiv über `queryLocalFonts` beim ÖFFNEN der Liste,
  Ergebnis pro Tab gecacht (§4.5, höchstens ein Berechtigungsdialog); ohne API/Erlaubnis
  bleibt die kuratierte Liste — dokumentiertes Fallback (§3.12).
- **§1 #14 Entfernen-Button:** von vornherein SVG-Icon (kein „⌫"-Glyph-Risiko, §4.6);
  deaktiviert, wenn an der Position kein Mark wirkt.
- **§1 #7 Enter-Semantik:** Enter übernimmt den hervorgehobenen Eintrag NUR nach echter
  Pfeilnavigation, sonst den eingetippten Feldwert — nie eine stille Übernahme des bloß
  zufällig hervorgehobenen Eintrags (konsistent mit der Tab-Regel §4.8).
- **Editor-Basisschrift (§2.4 Teilfrage):** unverändert der Tailwind-/Browser-Stack;
  markloser Text erzeugt weiterhin weder Mark noch Export-Attribut (harte Anforderung
  §2.4 — die Combobox zeigt dann ihren neutralen Platzhalter).
