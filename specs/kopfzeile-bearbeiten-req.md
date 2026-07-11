# Anforderungen: „Kopfzeile bearbeiten"

Status: Laut Feature-Backlog (`specs/FEATURE-BACKLOG.md`, Abschnitt „3.7 Kopf- & Fußzeile",
Slug `kopfzeile-bearbeiten`, Priorität 1) als **„fehlt"** geführt. Diese Einstufung gilt
ausdrücklich als **nicht vertrauenswürdig** und wurde für diese Anforderung durch direkte
Code-Durchsicht verifiziert (Abschnitt 0). Ergebnis der Verifikation: Der Status ist **für die
Editier-UI korrekt („fehlt vollständig")**; der darunterliegende Reader/Writer ist präziser als
**„vorhanden für genau eine Standard-Kopfzeile, aber ungetestet und mit belegbaren, im Code
nachweisbaren Lücken"** zu lesen (Abschnitt 0.A). Das Feature gilt erst als „vorhanden und
verifiziert", wenn die Definition of Done (Abschnitt 9) erfüllt ist.

Kurzbeschreibung (Backlog, wörtlich): „Aktiviert und befüllt einen eigenen editierbaren
Bereich am oberen Seitenrand."

Geltungsbereich: Diese Datei ist die verbindliche Anforderungs- und Testgrundlage für genau
ein Feature — „Kopfzeile bearbeiten" — im gemeinsamen DOCX/ODT-Editor
(`src/formats/shared/editor/`, `src/formats/shared/documentModel.ts`) samt Serialisierung in
`src/formats/docx/` und `src/formats/odt/`. Sie konkretisiert und ersetzt für dieses Feature
Abschnitt 9 („Kopf- und Fußzeilen") sowie Zeile 8 der Tabelle in Abschnitt 17 von
`FEATURE-SPEC-DOCX-ODT.md`. Stil, Testfall-Nummerierung und Detailtiefe orientieren sich an
jenem Dokument.

Wie dort festgelegt: DOCX und ODT teilen sich denselben ProseMirror-Editor. Jede Anforderung
unten gilt für **beide** Formate, inklusive Rundreise (Datei hochladen → unverändert
exportieren → Ergebnis entspricht inhaltlich dem Original) und inklusive Cross-Format-
Konvertierung.

**Hinweis zu Code-Verweisen:** Alle Fundstellen unten sind zuerst über den **Symbolnamen**
(Funktion/Node/Element/Datei) verankert und zusätzlich mit der zum Zeitpunkt dieser
Anforderung gültigen Zeilennummer versehen. Der Code dieses Repos wird pro Pipeline-Durchlauf
neu erzeugt; **Zeilennummern können driften — maßgeblich ist der Symbolname**, nicht die Zeile.

**Abgrenzung zu Nachbar-Slugs (verifiziert gegen `FEATURE-BACKLOG.md` Abschnitt 3.7):** Neben
`kopfzeile-bearbeiten` (P1) führt Abschnitt 3.7 sechs eng verwandte, aber **eigenständige**
Slugs: `fusszeile-bearbeiten` (P1), `seitenzahl-einfuegen` (P1), `erste-seite-anders` (P3),
`gerade-ungerade-anders` (P4), `mit-vorheriger-verknuepfen` (P4), `seitenzahl-format` (P3).
Diese Datei spezifiziert **ausschließlich die Kopfzeile**.

- `fusszeile-bearbeiten` ist die spiegelbildliche Funktion für den unteren Seitenrand und hat
  einen eigenen, gleichlautenden Anforderungstext (`fusszeile-bearbeiten-req.md`). Beide
  Features teilen technisch **denselben Mechanismus** (zweite editierbare Fläche + Fokuswechsel
  + Serialisierung eines `doc`-Teilbaums). Wo das der Fall ist, wird es hier vermerkt, damit die
  Abhängigkeit bei der Umsetzung nicht übersehen wird (gemeinsamer „Kopf- und
  Fußzeile"-Bearbeitungsmodus, siehe Abschnitt 1 und Abschnitt 10, Offene Frage 4). **Der in
  Abschnitt 0.A belegte DOCX-Part-Rels-Bild-Bug tritt in Kopf- **und** Fußzeile identisch auf**
  — er ist nur einmal (im zuerst umgesetzten Slug) zu beheben, deckt dann aber beide ab.
- `seitenzahl-einfuegen`, `erste-seite-anders`, `gerade-ungerade-anders`,
  `mit-vorheriger-verknuepfen`, `seitenzahl-format` sind **nicht** Gegenstand der Freigabe
  dieser Datei. Sie tauchen unten nur als Grenzfälle/Anschlussanforderungen auf, weil reale
  Fremddateien sie bereits enthalten und der Import nicht daran scheitern oder still Daten
  verlieren darf.

---

## 0. Ist-Stand laut Code-Analyse (Befund vor Verifikation)

Diese Spezifikation beruht auf tatsächlicher Durchsicht des aktuellen Codes, nicht nur auf der
Backlog-Beschreibung. Kernbefund: Das **Datenmodell samt Reader/Writer für genau eine
Standard-Kopfzeile existiert bereits und ist reicher als die Backlog-Zeile vermuten lässt**
(eine Kopfzeile trägt denselben vollen `doc`-Inhalt wie der Haupttext — Absätze, Überschriften,
Listen, Tabellen, Bilder, Formatierung); **die Bedien-/Editier-UI fehlt jedoch vollständig**,
ebenso jeder E2E- und jeder realdatei-basierte Inhaltstest. Zusätzlich hat der vorhandene
Reader/Writer **konkrete, im Code belegbare Lücken** (Abschnitt 0.A), die bei der bisherigen,
rein konstruierten Testabdeckung unsichtbar bleiben — insbesondere beim **Bild in einer
importierten Kopfzeile**. „Fehlt" ist damit für die eigentliche Funktion zutreffend, „nicht
vertrauenswürdig" für den bereits vorhandenen Reader/Writer-Unterbau korrekt.

| # | Ort (Symbol, aktuelle Zeile) | Inhalt | Befund |
|---|---|---|---|
| 1 | `documentModel.ts`, `WordDocumentContent.header` (Z. 5); `createBlankWordDocument()` (Z. 14–21); `emptyDocJSON()` (Z. 10) | `header: ProseMirrorJSON \| null` neben `body`/`footer`; neues Dokument hat `header: null`; `emptyDocJSON()` = ein linksbündiger Leerabsatz | **Datenmodell vorhanden.** `header === null` bedeutet „keine Kopfzeile" — konsistent mit „muss erst aktiviert werden". Kein neues Modell-Attribut nötig. |
| 2 | `docx/reader.ts`, `readDocx` (Z. 505–532): `firstChildNS(bodyEl, w, 'sectPr')` (Z. 507) → `firstChildNS(sectPr, w, 'headerReference')` (Z. 509); Header-Part über `readBodyChildren(root, headingInfo, kindByNumId, documentRels, zip)` (Z. 520) | Liest den `w:headerReference` als **ersten** Kind des body-eigenen `w:sectPr`, **ohne** dessen `w:type` (`default`/`first`/`even`) auszuwerten; Header-Part durchläuft denselben vollen Block-Reader wie der Body — **jedoch mit der Relationship-Map `documentRels` des Hauptdokuments** | **Nur eine, nicht-typisierte Kopfzeile.** Enthält eine Datei mehrere `w:headerReference` (z. B. „Erste Seite anders"), gewinnt die **im XML zuerst stehende** — nicht bewusst priorisiert. Absätze/Überschriften/Listen/Tabellen und **statischer Text** in der Kopfzeile werden gelesen. **Aber: Bilder in einer importierten Kopfzeile lösen sich nicht zuverlässig auf** — die dafür nötige Part-eigene `word/_rels/header1.xml.rels` wird **nie geladen** (Abschnitt 0.A/1). |
| 3 | `docx/writer.ts`, `writeDocx` (Z. 264–268, 297): `if (header)` → `buildHeaderFooterXml('hdr', blocksToDocx(header.content, images, documentRels))` (Z. 265) in `word/header1.xml`; `<w:headerReference w:type="default" r:id=…/>` (Z. 267); Content-Type-Override `hasHeader` (Z. 238) | Schreibt **genau eine** Kopfzeile mit `w:type="default"`; Header-Inhalt über `blocksToDocx` (derselbe Block-Serializer wie der Body), Bilder werden in die **gemeinsame** `documentRels` (→ `word/_rels/document.xml.rels`) eingetragen | **Kein Code-Pfad für `first`/`even`/`titlePg`.** Kopfzeile wird nur erzeugt, wenn `header` nicht `null` ist — „Kopfzeile entfernen" = `header` auf `null` ergibt automatisch **keine** verwaiste Referenz/Datei (3.6/Grenzfall 2). **Aber: Es wird keine `word/_rels/header1.xml.rels` erzeugt** — ein Kopfzeilen-Bild wird per `r:embed` in `header1.xml` referenziert, dessen Relationship aber in `document.xml.rels` statt in der Part-eigenen `.rels` liegt (Abschnitt 0.A/1). |
| 4 | `odt/reader.ts`, `readOdt` (Z. 368–388): `getElementsByTagNameNS(style, 'master-page')[0]` (Z. 375) → `firstChildNS(masterPage, style, 'header')` (Z. 377); Inhalt über `elementToBlocks` mit `stylesForChrome` (Z. 374, 380); anschließend `resolveImageSources(zip, headerBlocks)` (Z. 381) | Liest `style:header` aus der **ersten** `style:master-page` in `styles.xml`, unabhängig von deren Namen; Chrome-Styles kommen aus `styles.xml` → `office:automatic-styles`; Kopfzeilen-Bilder werden über `resolveImageSources` **direkt gegen das Zip** aufgelöst (kein Part-Rels-Problem) | **Erste Master-Page gewinnt.** Bei mehreren Master-Pages (LibreOffice-Vorlagen mit abweichender erster Seite) potenziell die „falsche" Kopfzeile. **Positiv gegenüber DOCX:** ODT-Kopfzeilen-Bilder lösen sich auf, weil ODF Bilder per Pfad (`xlink:href` → `Pictures/…`) referenziert, nicht per Part-Rels. **Zusatzlücke:** benannte/gemeinsame Formatvorlagen in `office:styles` werden **nicht** ausgewertet — Kopfzeilen-Ausrichtung/-Formatierung, die über eine benannte Vorlage bezogen wird, fällt auf `left`/leer zurück (analog `absatzformat-dropdown-req.md` Befund 7). |
| 5 | `odt/writer.ts`, `writeOdt` (Z. 268–275): `chromeStyles` (Z. 268), `headerXml = header ? blocksToOdt(header.content, chromeStyles, images, tableNames) : null` (Z. 271); `buildStylesXml` (Z. 216–233), `style:header` nur bei `headerXml !== null` (Z. 227) | Schreibt genau eine `style:master-page style:name="Standard"` mit optionalem `style:header`; eigener `chromeStyles`-Registry in `styles.xml` → `office:automatic-styles`; teilt `images`-Collector und `tableNames`-Sequenz mit dem Body | **Symmetrisch zu DOCX, aber ohne dessen Bild-Bug.** Kopfzeilen-Formatierung reist über die eigene App zurück (Reader liest genau diese `automatic-styles`). Bilder in der Kopfzeile landen im Manifest (`buildManifestXml`, Z. 244–258). `header === null` ⇒ **kein** `style:header`. |
| 6 | `schema.ts`, `wordSchema`; `doc: { content: 'block+' }` (Z. 14); Nodes `paragraph`/`heading`/`image`/`unsupported_block`/`tableNodes` (Z. 16–154); Marks (Z. 157 ff.) | Ein `doc` ist `block+`; keine Node-/Mark-Definition für ein Feld (kein `fldChar`/`instrText`- bzw. `text:page-number`-Äquivalent). `unsupported_block` (Z. 92) ist der Fallback-Node | **Kein Feld-Node im Schema.** Eine Kopfzeile kann heute nur statischen Text/Bilder/Formatierung enthalten, **keine** automatische Seitenzahl — das ist der separate Slug `seitenzahl-einfuegen` (hier nur als Architektur-Voraussetzung vermerkt, siehe 3.7). Header nutzt dasselbe `wordSchema` wie der Body. |
| 7 | `editor/WordEditor.tsx`, einzige `new EditorView(…)` (Z. 122), Seed nur aus `doc.content.body` (Z. 71 ff.); `dispatchTransaction` → `onChangeRef.current({ ...doc.content, body: newState.doc.toJSON() })` (Z. 129) | Es existiert **genau ein** ProseMirror-`EditorView`, gebunden ausschließlich an den Body; die Rückschreibe-Funktion ersetzt **nur** `body` und reicht `header`/`footer` per Spread unverändert durch | **Keine Schreib-/Editierschiene für `header`.** Kein zweiter `EditorView`, kein Rückschreibpfad, der `header` je verändern würde. Zugleich der Grund, warum eine importierte Kopfzeile den Export unbeschadet übersteht (sie wird nur durchgereicht). Der Selektions-Reconciler `reconcileSelectionOnClick` (Z. 43) hängt an **dieser einen** `view.dom`. Der neue Kopfzeilen-Editor muss genau an diesem `onChange`-Vertrag ansetzen und künftig auch `{ ...content, header }` zurückschreiben. |
| 8 | `editor/Toolbar.tsx`, komplette Button-Liste durchsucht | Vorhandene Bedienelemente: Ausschneiden, Absatzformat-`<select>`, F/K/U/S, Text-/Hervorhebungsfarbe, 4× Ausrichtung, 3× Liste, Tabelle, Bild | **Kein** „Kopfzeile"-Button, **kein** Menüpunkt, **kein** Kommando. Das Wort „Kopfzeile"/„header" kommt in `Toolbar.tsx` **nicht** vor (verifiziert: 0 Treffer). `commands.ts` kennt `setAlign/setHeading/toggleList/liftFromList/insertImage/insertTable/applyMarkColor/clearMarkColor/cutSelection` — nichts, das eine Kopfzeile aktiviert/referenziert. |
| 9 | `editor/WordEditor.tsx`, Seiten-Container: äußeres `<div>` mit `width: PAGE_WIDTH_PX`, `padding: PAGE_MARGIN_PX`, `pageBackgroundStyle()`; inneres `containerRef`-`<div>` | Der **obere Seitenrand ist reines CSS-Padding** des äußeren Div — **außerhalb** der ProseMirror-Editierfläche — ohne jeden Klick-/Doppelklick-Handler | Der in Word/LibreOffice übliche „Doppelklick in den oberen Rand → Kopfzeile bearbeiten" hat aktuell **weder Logik noch ein eindeutiges Ziel-Element** (und auf Folgeseiten gar keins, siehe #10). |
| 10 | `editor/pageLayout.ts`, `pageBackgroundStyle()`; `editor/pagination.ts`, `createPaginationPlugin`/`measureAndBuildDecorations` | Die Mehrseiten-Ansicht ist eine **Hintergrundbild-Illusion** (`linear-gradient` mit weißen „Seiten"- und transparenten „Spalt"-Bändern) auf **einer** durchlaufenden Fläche; „Seitenumbrüche" sind `Decoration.widget`-Spacer zwischen Top-Level-Blöcken | **Es gibt keine echten Pro-Seite-DOM-Container.** Eine Kopfzeile „auf jeder Seite" hat damit **keinen strukturellen Ankerpunkt** — das ist das zentrale Umsetzungsrisiko (siehe Abschnitt 4). |
| 11 | `app/DocumentWorkspace.tsx`, Editor-Einbindung `onChange={(content) => onChange({ ...document, content, dirty: true })}`; Export `module.exportFile(snapshot.content, …)`; Schließen-Bestätigung `window.confirm(…)` | Der komplette `content` (inkl. `header`/`footer`) fließt durch onChange und in den Export; es gibt bereits ein `window.confirm`-Muster für „ungespeicherte Änderungen" | Sobald der Editor `header` befüllt, wird es **automatisch mitexportiert**. Eine Kopfzeilen-Änderung muss `dirty: true` setzen. Das `confirm`-Muster ist die Vorlage für einen „Kopfzeile entfernen"-Bestätigungsdialog (siehe 3.6/Grenzfall 2). |
| 12 | `docx/__tests__/roundtrip.test.ts` („preserves header and footer content", „omits header/footer … when none"); `odt/__tests__/roundtrip.test.ts` (analog) | Konstruiert `header: { type: 'doc', content: [paragraph('Kopfzeile')] }` **direkt** und übergibt an Writer/Reader; der `null → null`-Fall ist geprüft | **Reader/Writer-Rundtrip ist unit-getestet — aber nur mit direkt konstruierten Daten, nie über die UI.** Positiv: `null`-bleibt-`null` ist abgedeckt; negativ: kein UI-, kein Realdatei-, kein Formatierungs-/**Bild**-Fall (Bild-Lücke daher unbemerkt, 0.A/1). |
| 13 | `docx/__tests__/external-fixtures.test.ts`, `imports "…" without crashing`, `expect(doc.body).toBeTruthy()`; ODT-Pendant analog | Der Fixture-Sweep prüft **nur** „Import stürzt nicht ab" und zählt Body-Absätze; `doc.header` wird **nie** inspiziert | **Kopfzeilen-Inhalt aus realen Fremddateien ist vollständig ungetestet** — obwohl das Testmaterial vorliegt (siehe Abschnitt 6.2). |
| 14 | `tests/e2e/*.spec.ts` | Keiner der Specs bedient oder prüft eine Dokument-Kopf-/Fußzeile (alle Treffer auf „header" sind ZIP-/CFBF-/PNG-Header bzw. der Tabellentext „Merged Header") | **Kein einziger E2E-Test** zu Kopf-/Fußzeile. |
| 15 | `docx/reader.ts` (0.A/1) **und** `docx/writer.ts` (0.A/1) — Kopfzeilen-Part-Rels für Bilder | Reader liest Header-Blöcke mit `documentRels` statt `word/_rels/header1.xml.rels`; Writer schreibt Kopfzeilen-Bild-Rel in `document.xml.rels` und **keine** `header1.xml.rels` | **Verifizierter Bild-Bug, DOCX-spezifisch** (ODT unbetroffen, Befund 4/5). Details, Symptom und Pflicht-Verifikation in Abschnitt 0.A/1. |
| 16 | `shared/validateDocument.ts`, `assertLoadableDocument()` (Z. 12): `if (content.header) wordSchema.nodeFromJSON(content.header).check()` (Z. 15) | Jeder Reader ruft dies vor Rückgabe; wirft einen lesbaren Fehler, wenn die Kopfzeile nicht schema-konform ist | **Harte Architektur-Randbedingung.** Ein künftiger Feld-/Seitenzahl-Node (Slug `seitenzahl-einfuegen`) muss **im `wordSchema` registriert** sein, sonst wirft bereits das **Laden** eines Dokuments mit einer solchen Kopfzeile (0.A/2, verstärkt 3.7). |
| 17 | `odt/__tests__/external-validation.test.ts` (xmllint-wasm gegen `OpenDocument-v1.3-schema.rng`, Z. 44 ff.): läuft mit `header: null, footer: null` (Z. 109–110); `docx/__tests__/external-validation.test.ts` (Pendant) | Die **einzige** unabhängige Schema-Validierung des Exports prüft nie ein reales `<style:header>`/`word/header1.xml` | **Die unabhängige Validierung hat für die Kopfzeile ein Loch** (0.A/3). Nötig: Erweiterung um einen Export **mit** nicht-leerer Kopfzeile (Abschnitt 6.3). |
| 18 | `docx/reader.ts`, `fldSimple`-Zweig (Z. 212) — cached-result-Text bleibt sichtbar; `odt/reader.ts`, Kommentar `text:page-number`/`text:page-count` (Z. 162); Tests `reader.test.ts` (DOCX U-6 „ PAGE " → „1"; ODT U-5 Text um `text:page-number`) | Ein **bereits vorhandenes** Seitenzahl-/Feld-Element wird beim Import **als Text abgeflacht**, sein sichtbarer Wert bleibt erhalten | **Positiver, verifizierter Befund für die Import-Robustheit:** Eine importierte Kopfzeile mit `w:fldSimple`/`PAGE` bzw. `text:page-number` verliert bei der Rundreise **mindestens ihren Textwert nicht** (3.7). Der Feld-Charakter (Selbst-Aktualisierung) geht mangels Feld-Node verloren — das ist Slug `seitenzahl-einfuegen`. |

**Konsequenz — Unterschied zu einem reinen Test-Gap:** Der Backlog-Status „fehlt" ist für die
**Editierfunktion** zutreffend (Befunde 7–10, 14), obwohl das Datenmodell samt Reader/Writer für
den „Standard"-Fall (eine Kopfzeile, gleich auf jeder Seite, inkl. Tabelle/Formatierung und —
**mit der belegten DOCX-Bild-Einschränkung** — Bild) bereits existiert (Befunde 1–6, 12). Diese
Datei beschreibt folglich den Soll-Zustand einer **komplett neu zu bauenden UI-Funktion auf
vorhandenem Datenmodell-Fundament** — kein Schema-Design von Grund auf (anders als bei
`seitenumbruch-req.md`). Der schwierigste, **vorab zu entscheidende** Teil ist nicht die
Serialisierung, sondern die visuelle/DOM-seitige Verankerung der Kopfzeile in einer
Seitenansicht, die keine echten Seiten kennt (Abschnitt 4). Parallel dazu sind die vier
konkreten Reader/Writer-Lücken aus Abschnitt 0.A zu befunden.

### 0.A Verifizierte, im Code belegbare Lücken (nicht nur „ungetestet")

Diese vier Punkte sind keine bloßen Test-Gaps, sondern im Code nachvollziehbare Schwächen des
vorhandenen „Standard"-Pfads, die bei der rein konstruierten Testabdeckung (Befund 12)
unsichtbar bleiben — Punkt 4 wurde für diese Anforderung zusätzlich direkt an den Byte-Inhalten
der betroffenen Fixtures verifiziert, nicht nur aus der Codelogik abgeleitet. Sie sind vor der
Abnahme je zu befunden und **behoben oder als bekannte, dokumentierte Einschränkung**
festzuhalten (Definition of Done, Abschnitt 9).

1. **DOCX-Kopfzeilen-Bild löst sich aus einer Fremddatei nicht auf; der eigene Export einer
   Kopfzeile mit Bild ist für strikte OOXML-Leser fragwürdig.** *(DOCX-spezifisch — ODT ist
   nachweislich nicht betroffen, Befund 4/5.)*
   - **Import (Reader):** `readDocx` lädt nur `documentRels = readRelationships(zip,
     'word/_rels/document.xml.rels')` (`docx/reader.ts` Z. 501) und liest die Kopfzeilen-Blöcke
     mit **genau dieser** Map (`readBodyChildren(root, …, documentRels, zip)`, Z. 520). In OOXML
     referenziert eine `header1.xml` eingebettete Bilder/Hyperlinks aber über ihre **eigene**
     `word/_rels/header1.xml.rels` — die hier **nie geladen** wird. Ein Bild in einer
     importierten Kopfzeile trägt eine `r:embed`-Id, die nicht in `documentRels` steht → die
     Bild-Auflösung schlägt fehl (fehlendes/leeres Bild), **ohne sichtbare Meldung**.
   - **Export (Writer):** `writeDocx` fügt Kopfzeilen-Bilder in die **gemeinsame** `documentRels`
     ein und schreibt sie nach `word/_rels/document.xml.rels`; eine `word/_rels/header1.xml.rels`
     wird **nicht** erzeugt (`docx/writer.ts` Z. 265, 299). Der **eigene** Reader liest das
     zurück (er nutzt ebenfalls `documentRels`), sodass der App-interne Rundtrip funktioniert —
     ein **strikter** OOXML-Leser (echtes Word/LibreOffice) findet die `r:embed`-Relationship
     innerhalb von `header1.xml` jedoch nicht in der Part-eigenen `.rels` und zeigt das Bild
     womöglich nicht an.
   - **Pflicht-Verifikation** an der realen Fixture `docx/headerPic.docx` (Kopfzeilen-Bild):
     Import → Bild sichtbar? Rundreise → Bild erhalten? Falls bestätigt, ist es ein **zu
     behebender Bug** (Kopfzeilen-Part-Rels laden **und** beim Export `header1.xml.rels`
     schreiben), kein bloßer Test-Gap (Grenzfall 6).
2. **`assertLoadableDocument()` erzwingt Schema-Konformität der Kopfzeile beim Laden.**
   `shared/validateDocument.ts` (Z. 12) ruft `wordSchema.nodeFromJSON(content.header).check()`
   (Z. 15). Ein künftiger Feld-/Seitenzahl-Node (Slug `seitenzahl-einfuegen`) muss daher **im
   Schema registriert** sein, sonst wirft bereits das Laden eines Dokuments mit einer solchen
   Kopfzeile. Das ist eine harte Architektur-Randbedingung für 3.7 — der neue Kopfzeilen-Editor
   darf ein späteres Feld-Node nicht so verbauen, dass es nicht schema-registrierbar wäre.
3. **Der exportierte Kopfzeilen-XML wird von der vorhandenen unabhängigen Validierung nicht
   erfasst.** `odt/__tests__/external-validation.test.ts` validiert `styles.xml`/`content.xml`
   mit `xmllint-wasm` gegen das offizielle OASIS-ODF-1.3-RelaxNG-Schema
   (`tests/fixtures/external/odf-schema/OpenDocument-v1.3-schema.rng`) — läuft aber mit
   `header: null, footer: null` (Z. 109–110), prüft also **nie** ein reales `<style:header>`.
   Für die Abnahme ist die unabhängige Validierung um einen Export **mit** nicht-leerer
   Kopfzeile zu erweitern (DOCX-seitig analog über `docx/__tests__/external-validation.test.ts`
   bzw. einen unabhängigen OOXML-Parser). Andernfalls können sich Schreib- und Lesefehler im
   eigenen Reader gegenseitig „unsichtbar" ausgleichen (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 19).
4. **Die Typ-Priorisierungslücke aus Befund 2 ist nicht nur theoretisch, sondern an vier der
   unten in Abschnitt 6.1.3 als Pflicht-Baseline geführten realen Fixtures direkt an ihren
   ZIP-/XML-Inhalten nachgewiesen — mit stillem Content-Verlust bzw. -Vertauschung, nicht nur
   „falsche Priorisierung im Grenzfall".** (Für diese Anforderung eigens am Byte-Inhalt der
   Dateien verifiziert, nicht aus einem früheren Plan übernommen.)
   - **`docx/headerFooter.docx`** listet in seinem `w:sectPr` **`w:type="even"` vor
     `w:type="default"`** (`rId4`→`header1.xml` even, `rId5`→`header2.xml` default). `header1.xml`
     ist **leer**, `header2.xml` enthält den sichtbaren Text „This is a simple header…" (Footer
     analog: `footer1.xml` leer, `footer2.xml` „…and this is a simple footer."). `firstChildNS(...)`
     (Befund 2) liefert heute `header1.xml`/`footer1.xml` — **der Import dieser Datei ergibt
     aktuell einen leeren `header`/`footer` statt des sichtbaren Texts.** Diese Datei ist unten in
     6.1.3 als „Basisfall Kopf+Fuß" gelistet; sie ist **kein** trivialer Erfolgsfall, sondern durch
     Befund 2 aktuell selbst **gebrochen**.
   - **`docx/HeaderFooterUnicode.docx`** hat dieselbe even-vor-default-Struktur (even-Varianten
     leer); der `default`-Header enthält „This is a simple header, with a € euro symbol in it.",
     der `default`-Footer „The footer, with Molière, has Unicode in it." Der aktuelle Import
     liefert auch hier eine **leere** Kopf-/Fußzeile. Der für Grenzfall 17 vorgesehene
     Unicode-Testfall kann mit dem heutigen Reader **keinen echten Sonderzeichen-Inhalt prüfen**,
     weil der Text nie ankommt.
   - **`docx/EmptyDocumentWithHeaderFooter.docx`** hat ebenfalls even-vor-default (even leer,
     `default`-Header „blabal", `default`-Footer „blabla"; der **Haupttext-Body ist tatsächlich
     leer** — das ist korrekt). Der aktuelle Import liefert eine leere Kopf-/Fußzeile — **zufällig
     ähnlich zu, aber nicht identisch mit** dem in Grenzfall 11 beschriebenen „aktiv-aber-leer"-Fall:
     Ground Truth dieser Datei ist eine **nicht-leere** Kopf-/Fußzeile mit kurzem Text, kein
     Leerabsatz. Grenzfall 11 muss diese Unterscheidung treffen, sonst wird ein durch Befund 2
     verursachter Content-Verlust fälschlich als „korrektes aktiv-leer-Verhalten" durchgewunken.
   - **`docx/PageSpecificHeadFoot.docx`** hat **beide** Varianten mit unterschiedlichem, je
     nicht-leerem Text: `even`-Header „[This is an Even Page, with a Header]August 20, 2008",
     `default`-Header „August 20, 2008[ODD Page Header text]" (Footer analog unterschiedlich). Der
     aktuelle Import liefert den **Even-Page-Text statt des Default/ODD-Textes** — eine konkrete,
     verifizierte Inhalts-**vertauschung** (nicht nur „irgendein" Header fehlt), exakt der in
     Grenzfall 4 beschriebene Fall, hier erstmals mit Klartext-Beleg dokumentiert.
   - **Unbetroffen** (nur `default` vorhanden bzw. `default` zuerst gelistet, daher heute zufällig
     korrekt): `docx/Headers.docx`, `docx/ThreeColHead.docx`, `docx/ThreeColHeadFoot.docx`,
     `docx/SimpleHeadThreeColFoot.docx`, `docx/headerPic.docx`, `docx/DiffFirstPageHeadFoot.docx`
     (bei Letzterer steht `default` zufällig vor `first`).
   - **ODT zum Vergleich, ebenfalls verifiziert:** In allen sechs geprüften ODT-Fixtures
     (`HeaderFooter.odt`, `headfoot.odt`, `headerFinal.odt`, `headerFirstPage.odt`,
     `HeaderFirstPageEnabled_MSO15.odt`, `HeaderFirstAndEvenPageEnabled_MSO15.odt`,
     `HeaderFirstAndEvenPageEnabledAndMarging_MSO15.odt`) steht die reguläre Master-Page
     (`Standard` bzw. `MP0`) zufällig an Index 0 — der `[0]`-Zugriff (Befund 4) liefert hier
     zufällig das richtige Ergebnis, ist aber ebenso wenig vertraglich garantiert wie bei DOCX.
   - **Konsequenz:** Der Befund-2-Fix (typbewusste Priorisierung, bevorzugt `default` — siehe 3.4)
     ist **Voraussetzung**, nicht nur Verbesserung, damit die in 6.1.3 geforderte Baseline-Rundreise
     für `headerFooter.docx`, `HeaderFooterUnicode.docx`, `EmptyDocumentWithHeaderFooter.docx` und
     `PageSpecificHeadFoot.docx` überhaupt grün werden kann. Ohne diesen Fix bestätigen genau diese
     vier Pflicht-Fixtures den Fehler, statt ihn zu verdecken.

---

## 1. Menüpunkte / Bedienelemente (Soll-Zustand)

| # | Element | Auslösung | Aktueller Stand (Befund) | Soll |
|---|---|---|---|---|
| 1 | Toolbar-Button/Menüpunkt „Kopfzeile" (Toggle) | Klick | **Fehlt komplett** in `Toolbar.tsx` (Befund 8) | Ergänzen — aktiviert die Kopfzeile für das gesamte Dokument und setzt den Fokus dorthin; eigene, eindeutige **SVG-Ikone** (kein Emoji/Buchstaben-Icon, `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.1); `aria-pressed` spiegelt den Aktiv-Zustand; Tooltip „Kopfzeile bearbeiten"/„Kopfzeile ausblenden". Empfehlung des PO: **gemeinsame Bedienleiste mit `fusszeile-bearbeiten`** (siehe Abschnitt 10, Offene Frage 4). |
| 2 | Doppelklick in den oberen Seitenrand einer sichtbaren Seite | Doppelklick | **Fehlt** — der obere Rand ist CSS-Padding außerhalb der Editierfläche, ohne Handler; auf Folgeseiten gibt es kein Rand-Element (Befund 9/10) | Ergänzen (Standardverhalten aus Word **und** LibreOffice). Erfordert einen neuen Handler auf dem Seiten-Container; für Folgeseiten hängt die Machbarkeit an der Entscheidung aus Abschnitt 4. |
| 3 | Eigener, sichtbar abgegrenzter Kopfzeilen-Bereich am oberen Seitenrand | — (Darstellung + Editierbarkeit) | **Fehlt** — nur ein `EditorView` für den Body (Befund 7) | Ergänzen: eigener editierbarer Bereich (zweite `EditorView` mit eigenem, aus `wordSchema` abgeleitetem State für `header`), visuell klar vom Haupttext abgesetzt (Trennlinie + Label „Kopfzeile", analog Word). |
| 4 | Bereich verlassen (zurück zum Haupttext) | Klick in den Haupttext; optional Escape / Button „Kopf- und Fußzeile schließen" | Nicht anwendbar | Muss zuverlässig funktionieren; Fokus und Selektion danach im Haupttext konsistent (siehe Abschnitt 2 zum Selection-Sync-Bug und Grenzfall 9). |
| 5 | Kopfzeile entfernen (`header` → `null`) | Menüpunkt/Button „Kopfzeile entfernen" | Nicht anwendbar | Ergänzen. Bei **nicht-leerer** Kopfzeile Bestätigungsdialog vor Datenverlust (Vorlage: `window.confirm` in `DocumentWorkspace.tsx`, Befund 11). Setzt `header` auf `null`, wodurch der Export laut Befund 3/5 automatisch **keine** verwaiste `w:headerReference`/`style:header` erzeugt (siehe 3.6). |
| 6 | Zeichen-/Absatzformatierung innerhalb der Kopfzeile (Fett, Kursiv, Farbe, Ausrichtung, Überschrift, Liste, Bild) | Dieselbe Toolbar wie im Haupttext, kontextsensitiv an die fokussierte Instanz gebunden | Fehlt (weil der Kopfzeilen-Editor fehlt) | Muss funktional identisch zum Haupttext wirken, sobald der Kopfzeilen-Editor existiert, und **nur** auf den Kopfzeileninhalt (siehe 3.2). Reader/Writer beherrschen Text/Tabelle/Formatierung in der Kopfzeile bereits (Befund 2/3/4/5); **Bild siehe Vorbehalt 0.A/1 für DOCX**. |
| 7 | Option „Erste Seite anders" | Checkbox im Kopfzeilen-Kontext | Fehlt — eigener Slug `erste-seite-anders` (P3), **nicht** Gegenstand dieser Freigabe | Solange nicht umgesetzt, **explizit** als nicht unterstützt dokumentieren statt stillschweigend zu fehlen (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 9/20.4). Kein UI-Element darf eine unwirksame Funktion vortäuschen. |
| 8 | Option „Gerade/ungerade Seiten anders" | Checkbox im Kopfzeilen-Kontext | Fehlt — eigener Slug `gerade-ungerade-anders` (P4) | Wie Zeile 7: dokumentierter Nicht-Support, kein Blocker dieser Datei. |
| 9 | Seitenzahl-Feld-Button in der Kopfzeile | Klick | Fehlt — eigener Slug `seitenzahl-einfuegen` (P1); im Schema existiert ohnehin kein Feld-Node (Befund 6), und `assertLoadableDocument` würde einen nicht-registrierten Feld-Node beim Laden ablehnen (Befund 16/0.A/2) | Nicht Teil dieser Abnahme; die Kopfzeilen-Editor-Architektur darf ein späteres Nachrüsten aber **nicht strukturell verbauen** (siehe 3.7). |

Ergänzung zur Tabelle in Abschnitt 17 der Haupt-Spezifikation: Zeile 8 „Kopf-/Fußzeile
bearbeiten — fehlt komplett in der UI" wird durch obige Tabelle für den **Kopfzeilen**-Teil
vollständig ersetzt.

---

## 2. Geltende Randbedingungen aus der Haupt-Spezifikation

Diese Datei ergänzt, ersetzt aber nicht die Anforderungen aus `FEATURE-SPEC-DOCX-ODT.md`,
insbesondere:

- **Abschnitt 9 („Kopf- und Fußzeilen"):** „Kopfzeile und Fußzeile jeweils eigener editierbarer
  Bereich, unabhängig vom Haupttext … das ist eine fehlende Funktion, kein reiner Test-Gap." —
  die Kernanforderung, die diese Datei im Detail spezifiziert.
- **Abschnitt 9, Testfall 4** (Seitenzahl-Feld) und die Optionen „erste Seite anders"/„gerade-
  ungerade" gelten dort als „optional, aber wenn nicht unterstützt, muss das explizit
  dokumentiert sein" — siehe Abschnitt 1, Zeilen 7–9 und Abschnitt 3.4/3.7.
- **Abschnitt 2, Regressionstest für den Selection-Sync-Bug:** Der Fokuswechsel zwischen
  Haupttext und einem **zweiten** editierbaren Bereich (Kopfzeile) ist strukturell ein
  Selektions-/Fokuswechsel und damit ein Hauptverdachtsfall für dieselbe Fehlerklasse. Der
  bestehende Reconciler (`reconcileSelectionOnClick`, Befund 7) ist nur für **eine** `view.dom`
  registriert — für die zweite Instanz muss er repliziert/verwaltet werden (siehe Grenzfall 9).
- **Abschnitt 7 („Bilder"):** gilt sinngemäß auch für Bilder in der Kopfzeile (typischer Fall:
  Firmenlogo einer Briefvorlage, vgl. Abschnitt 18 der Haupt-Spezifikation). **Achtung:** Für
  DOCX ist die Kopfzeilen-Bild-Auflösung nachweislich lückenhaft (0.A/1) — es fehlt nicht nur
  die UI + der Test, sondern der Reader/Writer-Pfad selbst ist zu beheben.
- **Abschnitt 18 (Import-Robustheit):** „kein stiller Datenverlust" gilt auch für Kopfzeilen aus
  Fremddateien, insbesondere bei mehreren Kopfzeilen-Referenzen/Master-Pages (Befund 2/4,
  Grenzfälle 4/5) sowie bei bereits vorhandenen Seitenzahl-Feldern (Befund 18).
- **Abschnitt 19 (Export-Robustheit & Rundreise)** und **Abschnitt 20.4 (kein stiller
  Fehlschlag)** gelten uneingeschränkt — inkl. der unabhängigen Schema-Validierung (0.A/3, 6.3).

---

## 3. Gewünschtes Verhalten im Detail

### 3.1 Aktivierung der Kopfzeile
- Aktivierbar über **beide** Wege gleichwertig: Toolbar-Button „Kopfzeile" **und** Doppelklick in
  den oberen Seitenrand einer sichtbaren Seite (Standardverhalten aus Word/LibreOffice Writer).
- Aktivierung schaltet einen eigenen editierbaren Bereich am oberen Seitenrand sichtbar, visuell
  klar vom Haupttext abgegrenzt (Trennlinie und/oder Label „Kopfzeile").
- Dokument **ohne** Kopfzeile (`header === null`, z. B. neues Dokument oder importierte Datei
  ohne Kopfzeile): erste Aktivierung erzeugt einen leeren, sofort editierbaren Bereich (ein
  Leerabsatz analog `emptyDocJSON()`), kein Fehler, kein No-Op.
- Dokument **mit** vorhandener Kopfzeile (nach Import): Button ist von Anfang an aktiv
  (`aria-pressed=true`), der Bereich zeigt sofort den importierten Inhalt. **Hinweis:** Der
  Reader macht auch eine importierte, inhaltlich **leere** Kopfzeile zu `[emptyParagraph()]`
  statt `null` (`docx/reader.ts` Z. 549, `odt/reader.ts` Z. 403) — d. h. eine im Original aktive,
  leere Kopfzeile (`EmptyDocumentWithHeaderFooter.docx`) muss den Button als **aktiv** zeigen
  (siehe Grenzfall 11 und Offene Frage 2 zur Export-Konsistenz).
- Nach Aktivierung steht der Cursor automatisch in der Kopfzeile, bereit zum Tippen — **kein**
  zusätzlicher Klick nötig (Parität zu „Neues Dokument → sofort tippen möglich",
  `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 1.1).

### 3.2 Bearbeiten des Inhalts (Funktionsparität zum Haupttext)
- Alle Text-Grundfunktionen aus `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 2 gelten identisch:
  Tippen, Löschen, Cursor-Navigation, Auswahl (Maus/Doppelklick/Dreifachklick/Strg+A),
  Ausschneiden/Kopieren/Einfügen, Undo/Redo.
- Zeichenformatierung (Fett/Kursiv/Unterstrichen/Durchgestrichen/Schrift-/Hervorhebungsfarbe)
  über **dieselbe** Toolbar wie im Haupttext, wirksam **nur** auf den Kopfzeileninhalt.
- Absatzausrichtung (links/zentriert/rechts/Blocksatz) funktioniert identisch.
- Bild einfügen (z. B. Firmenlogo) funktioniert über denselben `insertImage`-Mechanismus wie im
  Haupttext (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 7). **Vorbehalt (0.A/1):** Für DOCX ist der
  Kopfzeilen-Bild-Pfad zu beheben — beim Export ist eine `word/_rels/header1.xml.rels` zu
  schreiben und beim Import zu laden, damit das Bild in einem **strikten** OOXML-Leser und aus
  Fremddateien (`headerPic.docx`) zuverlässig erscheint. ODT-Reader/Writer bilden
  Kopfzeilen-Bilder bereits korrekt ab (Befund 4/5).
- Überschriften/Listen/Tabellen in der Kopfzeile sind kein Hauptanwendungsfall, dürfen aber,
  falls eingefügt, weder abstürzen noch Daten verlieren — mindestens der reine Text bleibt bei
  Rundreise erhalten (Fallback-Prinzip analog Abschnitt 18). Reader/Writer beherrschen diese
  Strukturen in der Kopfzeile bereits.
- **Getrennte Undo-Historien:** Kopfzeile und Haupttext sind zwei getrennte ProseMirror-
  Instanzen mit **je eigener** History. Strg+Z im Haupttext darf keine Kopfzeilen-Änderung
  rückgängig machen und umgekehrt. Das ist ausdrücklich festzulegen und zu testen, da der
  aktuelle Code nur eine einzige Instanz kennt (Befund 7) und es dafür keine Präzedenz gibt.

### 3.3 Seitenübergreifende Wirkung (Standard-Kopfzeile)
- Es gibt genau **einen** Kopfzeileninhalt pro Dokument (`WordDocumentContent.header`), der auf
  **jeder** sichtbar gerenderten Seite identisch erscheinen soll — nicht nur auf der ersten
  (siehe Grenzfall 10). Das entspricht der Mindestunterstützung „Standard" aus Abschnitt 9.
- Eine Bearbeitung wirkt unmittelbar auf die Darstellung auf allen Seiten (kein pro-Seite-
  Override, kein Auseinanderlaufen mehrerer Kopien).
- **Achtung:** Die tatsächliche Umsetzbarkeit „auf jeder Seite" hängt an der Architektur-
  Entscheidung aus Abschnitt 4 (es gibt derzeit keine Pro-Seite-Container). Bis zur Entscheidung
  gilt der zugehörige Testfall (Grenzfall 10 / 6.2.G) als noch nicht erfüllbar.

### 3.4 „Erste Seite anders" / „Gerade-ungerade" (explizit dokumentierter Nicht-Support)
- Diese Datei fordert **nicht**, dass diese Varianten umgesetzt werden (eigene Slugs). Gefordert
  ist:
  - Kein UI-Element täuscht eine unwirksame Funktion vor (kein stiller Fehlschlag,
    `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.4).
  - Beim Import einer Fremddatei mit mehreren Kopfzeilen-Varianten (`w:type="first"`/`"even"`
    neben `"default"` in DOCX; mehrere Master-Pages in ODT) bleibt **mindestens eine** Kopfzeile
    erhalten — kein Totalverlust. Welche übernommen wird, ist zu **dokumentieren**. Aktueller
    Stand (Befund 2/4): zufällig durch Dokumentreihenfolge bestimmt — das ist auf einen bewusst
    gewählten, deterministischen Fall festzulegen (Empfehlung des PO: DOCX „bevorzugt
    `w:type=\"default\"`, sonst die erste gefundene"; ODT „die Master-Page der ersten regulären
    Seite bzw. die erste gefundene"). **Diese Empfehlung ist keine Formalie:** 0.A/4 belegt an vier
    realen Baseline-Fixtures (`headerFooter.docx`, `HeaderFooterUnicode.docx`,
    `EmptyDocumentWithHeaderFooter.docx`, `PageSpecificHeadFoot.docx`), dass der heutige Code ohne
    diesen Fix leeren oder falsch vertauschten Inhalt statt des sichtbaren `default`-Textes liefert.

### 3.5 Verlassen des Kopfzeilenbereichs
- Klick in den Haupttext beendet die Kopfzeilen-Bearbeitung und setzt den Haupttext-Cursor an
  die geklickte Position (Standardverhalten).
- Der Fokuswechsel zwischen den **zwei** Editor-Instanzen darf keine Selektions-Inkonsistenz
  erzeugen — insbesondere darf ein direkt danach ausgelöstes Enter/Tippen nicht versehentlich
  Kopfzeilen- oder Haupttext-Inhalt löschen/ersetzen (Abschnitt 2, Selection-Sync-Bug;
  Grenzfall 9).

### 3.6 Deaktivieren/Leeren der Kopfzeile
- Den gesamten Kopfzeilentext zu markieren und zu löschen (Entf) darf **nicht** automatisch die
  Kopfzeile entfernen — ein leerer, aber weiterhin aktivierter Bereich bleibt bestehen (analog
  Word/LibreOffice: eine geleerte Kopfzeile bleibt eine Kopfzeile). Konkretes Verhalten (Befund
  3/5, beidseitig verifiziert): ein `header` mit nur einem Leerabsatz ist **nicht** `null`, wird
  also weiterhin als `word/header1.xml`/`style:header` (mit leerem Absatz) exportiert und beim
  Reimport wieder als (leere) Kopfzeile gelesen — „aktiv, aber leer" bleibt erhalten. Das ist
  konsistent mit dem Import-Verhalten des Readers (leere importierte Kopfzeile → `[emptyParagraph()]`
  statt `null`, siehe 3.1); Erzeugungs-/Export- und Importseite müssen konsistent bleiben, sonst
  driftet eine Datei bei jeder Rundreise zwischen „aktiv-leer" und „inaktiv" (Offene Frage 2).
- Zusätzlich muss ein **expliziter** Weg existieren, die Kopfzeile **komplett** zu entfernen
  (`header` → `null`). Laut Befund 3/5 erzeugt der Export dann automatisch **keine** verwaiste
  Referenz/Datei/Content-Type-Override — kein „Geisterelement" (Grenzfall 2). Bei nicht-leerer
  Kopfzeile davor Bestätigungsdialog (Abschnitt 1, Zeile 5); Abbrechen lässt Aktiv-Zustand und
  Inhalt unverändert.

### 3.7 Zusammenspiel mit einem künftigen Seitenzahl-Feld (Verweis, kein Umsetzungsgegenstand)
- `seitenzahl-einfuegen` wird durch diese Datei **nicht** umgesetzt. `FEATURE-SPEC-DOCX-ODT.md`
  Abschnitt 9, Testfall 4 verlangt jedoch ein Seitenzahl-Feld als Teil der vollständigen
  Kopf-/Fußzeilen-Abnahme — deshalb hier als **Architektur-Voraussetzung**: Der neue
  Kopfzeilen-Editor darf nicht so eng gefasst sein, dass er nur reinen Text/Formatierung erlaubt
  und ein späteres Inline-Feld-Node (Befund 6) strukturell verbaut. Insbesondere muss ein
  solcher Node später ins `wordSchema` aufgenommen werden können, **ohne** `validateDocument.ts`
  zu brechen (Befund 16/0.A/2: `assertLoadableDocument` prüft die Kopfzeile beim Laden gegen das
  Schema).
- **Import-Robustheit (verifiziert, Befund 18):** Enthält eine Fremddatei bereits ein
  Seitenzahl-Feld in der Kopfzeile (`w:fldSimple`/`PAGE` bzw. `text:page-number`), muss
  **mindestens dessen aktueller Textwert** die Rundreise überstehen — kein ersatzloses
  Verschwinden. Der aktuelle Reader flacht ein solches Feld auf seinen sichtbaren Text ab
  (`docx/reader.ts` Z. 212, `odt/reader.ts` Z. 162, je mit Tests belegt); der Feld-Charakter
  (Selbst-Aktualisierung) geht mangels Feld-Node verloren — das ist bewusst Sache von
  `seitenzahl-einfuegen`, nicht dieser Datei.

### 3.8 Datenmodell-Wiederverwendung
- Es wird **kein** neues Datenmodell-Attribut benötigt — `WordDocumentContent.header` existiert
  (Befund 1) und wird von DOCX- und ODT-Reader/-Writer im „Standard"-Fall bereits korrekt
  round-getrippt (Befunde 2–5, 12). Diese Datei fordert primär den **UI-Zugang** zu diesem Feld
  sowie dessen Rückschreiben aus dem neuen Kopfzeilen-Editor über denselben `onChange`-Vertrag
  wie der Body (`WordEditor.tsx` Z. 129 — künftig `{ ...content, header }`). Reader/Writer sind
  **nur** dort zu ändern, wo Abschnitt 0.A ausdrücklich eine Lücke benennt (DOCX-Kopfzeilen-Bild-
  Rels 0.A/1; deterministische Auswahl bei mehreren Referenzen 3.4; `office:styles`-Formatierung
  Befund 4/Grenzfall 12), sofern die Verifikation diese bestätigt.

### 3.9 Rückschreiben & Rückmeldeverhalten (kein stiller Fehlschlag)
- Jede Kopfzeilen-Änderung muss über den bestehenden `onChange`-Pfad in den Dokumentzustand
  zurückgeschrieben werden (`DocumentWorkspace.tsx`, Befund 11) und `dirty: true` setzen, damit
  sie exportiert wird und die „ungespeichert"-Anzeige greift.
- Kann eine Aktion nicht ausgeführt werden (z. B. Doppelklick, während der Editor noch
  initialisiert), muss eine sichtbare Rückmeldung erfolgen oder ein definiertes Fallback greifen
  — niemals ein Klick/Doppelklick, der ergebnislos bleibt (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt
  20.4).

---

## 4. Seitenlayout-Integration (technisches Kernrisiko — vor Umsetzung zu entscheiden)

Die Seitenansicht (`pageLayout.ts`, `pagination.ts`, Befund 9/10) simuliert mehrere A4-Seiten
über ein sich wiederholendes **Hintergrundbild** auf **einer** durchlaufenden ProseMirror-Fläche;
„Seitenumbrüche" sind Spacer-Widgets zwischen Blöcken. Es gibt **keine** echten Pro-Seite-
Container im DOM und der obere Seitenrand ist bloßes CSS-Padding außerhalb der Editierfläche.
Eine Kopfzeile „am oberen Rand jeder Seite" (3.3) kann deshalb **nicht** einfach als zusätzlicher
Absatz behandelt werden. Vor der Implementierung ist **eine** der folgenden Lösungen zu wählen
und hier zu dokumentieren:

- **(a) Overlay pro berechnetem Seiten-Band.** Die Seitenumbruch-Positionen werden bereits in
  `pagination.ts` berechnet und könnten wiederverwendet werden, um Kopfzeilen-Kopien (ein
  zusätzlicher, nicht editierbarer Renderer, gespeist aus derselben `header`-Instanz) an den
  passenden Y-Positionen einzublenden; editiert wird zentral in **einer** Kopfzeilen-Instanz.
  Bevorzugt, weil dem Word-Verhalten am nächsten.
- **(b) Eine einzige sichtbare Kopfzeile am oberen Rand der ersten Seite** plus dokumentierte
  Einschränkung „Kopfzeile erscheint aktuell nur einmal, nicht auf jeder Zwischenseite". Nur als
  **Übergangslösung** akzeptabel und dann **explizit** im Feature-Status zu vermerken (kein
  stiller Fehlschlag).
- **(c) Refaktorierung auf echte Pro-Seite-Container.** Größter Eingriff (berührt Pagination und
  Selection-Handling), am ehesten zukunftssicher (auch für `fusszeile-bearbeiten` und
  `seitenzahl-einfuegen`).

**Diese Entscheidung ist Voraussetzung für die Abnahme** und muss vor Implementierung getroffen
und in Abschnitt 10 (Offene Frage 1) nachgetragen werden. Bis dahin gilt Grenzfall 10 /
Testfall 6.2.G als nicht erfüllbar, und der Datenmodell-Rundtrip (Abschnitt 6) bleibt davon
unberührt prüfbar (die `header`-Daten reisen unabhängig von ihrer Bildschirmdarstellung).

---

## 5. Grenzfälle (müssen explizit geprüft werden)

| # | Grenzfall | Erwartetes Verhalten |
|---|---|---|
| 1 | Kopfzeile aktivieren bei brandneuem, leerem Dokument (`header === null`, Body = ein Leerabsatz) | Leerer, editierbarer Kopfzeilenbereich entsteht sofort, Editor stabil, kein Crash. |
| 2 | Zuvor befüllte Kopfzeile komplett entfernen (`header` → `null`), danach exportieren | Export enthält keine `w:headerReference`/`header1.xml`/Content-Type-Override bzw. kein `style:header` — kein Geisterelement (Befund 3/5, 3.6). Bei nicht-leerer Kopfzeile ging ein Bestätigungsdialog voraus. |
| 3 | Doppelklick in den oberen Rand, während im Haupttext eine Selektion aktiv ist (z. B. nach „Alles auswählen") | Haupttext-Selektion wird sauber aufgelöst, kein fälschlicher Übertrag in den Kopfzeilenkontext, kein Datenverlust (Selection-Sync-Regressionsfall, Abschnitt 2). |
| 4 | Import einer DOCX mit „Erste Seite anders" (mehrere `w:headerReference`-Typen), z. B. `DiffFirstPageHeadFoot.docx`, `PageSpecificHeadFoot.docx` | Mindestens eine Kopfzeile bleibt erhalten (kein Totalverlust); welche, ist deterministisch und dokumentiert (3.4). **Verifiziert (0.A/4):** `PageSpecificHeadFoot.docx` liefert nach heutigem Code-Stand den `even`- statt den `default`-Text — eine konkrete, nachgewiesene Inhaltsvertauschung, kein rein theoretisches Risiko; `DiffFirstPageHeadFoot.docx` ist von der XML-Reihenfolge her aktuell zufällig unauffällig, aber ebenso ungeprüft/unvertraglich. |
| 5 | Import einer ODT mit erste-Seite-/gerade-ungerade-Varianten (mehrere Master-Pages), z. B. `HeaderFirstPageEnabled_MSO15.odt`, `HeaderFirstAndEvenPageEnabled_MSO15.odt` | Ebenso mindestens eine Kopfzeile erhalten, kein Absturz; Auswahl dokumentiert (3.4). |
| 6 | Kopfzeile mit eingefügtem Bild (Firmenlogo) — neu erstellt **und** aus Fremddatei (`headerPic.docx`) importiert | **Pflicht-Verifikation (0.A/1):** Bild muss sichtbar sein und bei Rundreise erhalten bleiben. Erhöhtes Risiko für DOCX, weil der Reader Kopfzeilen-Blöcke mit `documentRels` statt `header1.xml.rels` liest **und** der Writer keine `header1.xml.rels` schreibt. Falls Bild fehlt/nicht valide → Bug beheben (Part-Rels laden **und** schreiben). ODT ist unbetroffen (Befund 4/5). |
| 7 | Kopfzeileninhalt überragt die vorgesehene Kopfzeilenzone (mehrere Absätze, große Schrift) | Zu dokumentierendes, definiertes Verhalten (Bereich wächst sichtbar mit — bevorzugt — vs. Verdrängung des Hauptbereichs); **kein** überlappendes, unlesbares Rendering, **kein** stilles Abschneiden. |
| 8 | Undo direkt nach dem ersten Tippen in einer frisch aktivierten, zuvor `null`-wertigen Kopfzeile | Kein Crash; festzulegen und zu dokumentieren, ob die Aktivierung selbst ein eigener Undo-Schritt ist. Undo wirkt in der **Kopfzeilen**-History, nicht im Haupttext (3.2). |
| 9 | Mehrfacher Fokuswechsel Kopfzeile → Haupttext → Kopfzeile, jeweils gefolgt von Tippen/Enter | Kein Bug wie im Selection-Sync-Fall (Abschnitt 2). Der Reconciler muss für **beide** `view.dom` greifen (Befund 7). **Pflicht-Regressionstest.** |
| 10 | Mehrseitiges Dokument (Inhalt über mehrere sichtbare Seiten) mit aktivierter Kopfzeile | Kopfzeile erscheint identisch auf **jeder** sichtbar gerenderten Seite (3.3) — abhängig von Abschnitt 4 zu verifizieren. |
| 11 | Kopfzeile über die neue UI aktiviert, aber nie über einen Leerabsatz hinaus befüllt, danach Export (**selbst erzeugtes** leeres Dokument — **nicht** `EmptyDocumentWithHeaderFooter.docx`, siehe Korrektur in 0.A/4: diese Fremddatei hat tatsächlich nicht-leeren Kopf-/Fußzeilentext „blabal"/„blabla" im `default`-Part, ist also **kein** Beispiel für „aktiv-leer") | Definiertes Ergebnis (Befund 3/5): „aktiv, aber leer" bleibt erhalten (`header1.xml`/`style:header` mit Leerabsatz), Reimport zeigt weiterhin eine (leere) Kopfzeile, Button bleibt aktiv. Kein Crash. (Offene Frage 2 zur Normalisierung.) Separat zu prüfen: `EmptyDocumentWithHeaderFooter.docx` selbst muss nach dem Befund-2-Fix seinen **tatsächlichen** Kopf-/Fußzeilentext liefern, nicht mehr die aktuell (fehlerhaft) leere even-Variante (0.A/4). |
| 12 | Reale ODT, deren Kopfzeilen-Formatierung über eine benannte `office:styles`-Vorlage (nicht `office:automatic-styles`) bezogen wird | Text bleibt erhalten; die **Ausrichtung/Formatierung** geht nach aktuellem Stand still verloren (Befund 4). Als bestätigt/behoben hier nachtragen. |
| 13 | Kopfzeile mit kombinierter Formatierung (fett **und** Textfarbe) über Cross-Format-Rundreise (DOCX → ODT → DOCX) | Formatierung bleibt erhalten (Parität zu `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 3, Testfall 4/5), angewendet auf Kopfzeileninhalt. |
| 14 | Reale Fremddatei mit mehreren Abschnitten (`w:sectPr` auch innerhalb von Absätzen, nicht nur body-final) | Verifizieren, ob der Reader (liest laut Befund 2 nur den body-eigenen `w:sectPr`) Kopfzeilen aus früheren Abschnitten erkennt; mindestens der Text der wirksamen (finalen) Kopfzeile darf nicht ersatzlos verschwinden, kein Absturz. Slug-Verweis: `mit-vorheriger-verknuepfen`. |
| 15 | Dokument mit Kopfzeile **und** Fußzeile gleichzeitig, mit unterschiedlichem Text | Kopf- und Fußzeileninhalt bleiben unabhängig korrekt zugeordnet — keine Verwechslung/Vertauschung bei Rundreise (Zusammenspiel mit `fusszeile-bearbeiten`). |
| 16 | Datei **ohne** Kopfzeile, aber mit Fußzeile (bzw. Header ohne Footer, z. B. `Headers.docx`, `ThreeColHead.docx`) | Aktivieren/Bearbeiten der Kopfzeile lässt eine vorhandene Fußzeile unangetastet und umgekehrt; `NoHeadFoot.docx` → Button bleibt inaktiv, `header` bleibt `null`, keine fälschlich erzeugte leere Kopfzeile. |
| 17 | Kopfzeile mit Sonderzeichen/Unicode (`HeaderFooterUnicode.docx`) | Zeichen bleiben bei Rundreise unverändert (kein Mojibake, korrekte XML-Escapes). |
| 18 | Importierte Kopfzeile mit bereits vorhandenem Seitenzahl-Feld (`w:fldSimple`/`PAGE` bzw. `text:page-number`) | Mindestens der sichtbare Textwert überlebt die Rundreise (Befund 18); Feld-Charakter darf mangels Feld-Node verloren gehen, aber kein ersatzloses Verschwinden. |
| 19 | Aktivierung per Doppelklick auf einem reinen Touch-Gerät (`Mobile`-/`Tablet`-Playwright-Projekt aus `playwright.config.ts`, emuliert `Pixel 7`/`iPad Mini`) | Ein echtes `dblclick`-Ereignis ist auf einem Touch-Gerät ohne Maus nicht garantiert (Doppel-Tap wird von manchen Browsern als Zoom-Geste interpretiert, nicht als `dblclick`). Der Toolbar-Button „Kopfzeile" muss deshalb auf Mobile/Tablet **unabhängig** vom Doppelklick zuverlässig funktionieren — die beiden in 3.1 als „gleichwertig" beschriebenen Aktivierungswege sind auf Touch **nicht redundant-optional**, sondern der Button ist dort der einzig verlässliche Weg; das ist explizit zu dokumentieren, kein stiller Fehlschlag. |

---

## 6. Rundreise-Anforderung (Pflicht, DOCX **und** ODT)

Zwei getrennte, beide verpflichtende Prüfungen — analog `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 19.
**Kernanforderung laut Aufgabenstellung: Datei unverändert hochladen → Export → Re-Import erhält
den Inhalt — sowohl für DOCX als auch für ODT.** Formatierungs-/Layout-Nuancen bei Cross-Format
sind zu dokumentieren und akzeptabel; **das vollständige Verschwinden von Kopfzeilen- oder
Haupttextinhalt ist es nicht.**

### 6.1 Baseline-Rundreise (Regressionsschutz — darf durch die neue UI nicht kaputtgehen)
1. Reale DOCX **ohne** Kopfzeile unverändert hochladen → sofort exportieren → reimportieren →
   Inhalt inhaltlich identisch, `header` bleibt `null` (keine fälschlich erzeugte Kopfzeile).
2. Dasselbe mit realer ODT ohne Kopfzeile (`NoHeadFoot.docx` als DOCX-Negativfall; passende
   ODT-Datei ohne Master-Page-Header).
3. **„Upload unverändert" — reale, im Repo vorhandene, bislang inhaltlich ungetestete Kopfzeilen-
   Fixtures** (Befund 13; Provenienz siehe `tests/fixtures/external/README.md`). Für **jede**:
   importieren → **ohne jede Änderung** exportieren → reimportieren → der ursprünglich sichtbare
   Kopfzeilentext ist unverändert wiederzufinden (reiner Upload-Export-Reimport-Zyklus, kein
   Klick im Editor):

   | Datei | Relevanz |
   |---|---|
   | `docx/headerFooter.docx` | Basisfall Kopf+Fuß — **Pflicht-Verifikation der Typ-Priorisierungslücke, siehe 0.A/4:** `w:type="even"` steht im XML vor `"default"`; aktueller Reader liefert einen **leeren** Header/Footer statt „This is a simple header…"/„…and this is a simple footer." Kein trivialer Erfolgsfall, sondern selbst durch Befund 2 aktuell gebrochen. |
   | `docx/Headers.docx` | Kopfzeile **ohne** Fußzeile (Isolation, Grenzfall 16) — enthält nur `w:type="default"`, von 0.A/4 nicht betroffen |
   | `docx/ThreeColHead.docx`, `docx/ThreeColHeadFoot.docx`, `docx/SimpleHeadThreeColFoot.docx` | mehrspaltige/komplexe Kopfzeile — je nur `default` vorhanden, von 0.A/4 nicht betroffen |
   | `docx/HeaderFooterUnicode.docx` | Sonderzeichen/Unicode (Grenzfall 17) — **ebenfalls von 0.A/4 betroffen** (even vor default, even-Varianten leer): aktueller Reader liefert leere Kopf-/Fußzeile statt „…€ euro symbol…"/„…Molière…"; der Unicode-Testfall kann erst nach dem Befund-2-Fix echten Sonderzeichen-Inhalt prüfen |
   | `docx/headerPic.docx` | **Bild (Firmenlogo) in der Kopfzeile — Pflicht-Verifikation der DOCX-Part-Rels-Lücke (0.A/1, Grenzfall 6).** Enthält nur `default`, von 0.A/4 nicht betroffen |
   | `docx/EmptyDocumentWithHeaderFooter.docx` | Leerer Body, aber **nicht-leere** Kopf-/Fußzeile (Grenzfall 1/11 — **Achtung, siehe Korrektur in 0.A/4:** Ground Truth ist `default`-Text „blabal"/„blabla", **kein** Leerabsatz; aktueller Reader liefert wegen der Typ-Priorisierungslücke fälschlich einen leeren Absatz, was oberflächlich wie „aktiv-leer" aussieht, aber ein Bug ist, kein korrektes Grenzfall-11-Verhalten) |
   | `docx/DiffFirstPageHeadFoot.docx` | „Erste Seite anders" (Grenzfall 4, Befund 2) — `default` steht hier zufällig vor `first`, daher aktuell nicht sichtbar von 0.A/4 betroffen (verdeckt aber nicht die Notwendigkeit des Fixes) |
   | `docx/PageSpecificHeadFoot.docx` | „Erste Seite anders"/gerade-ungerade (Grenzfall 4, Befund 2) — **Pflicht-Verifikation, siehe 0.A/4:** `even`- und `default`-Header/-Footer haben unterschiedlichen, je nicht-leeren Text; aktueller Reader liefert den **Even-Page-Text statt des Default/ODD-Textes** — verifizierte Inhaltsvertauschung |
   | `docx/NoHeadFoot.docx` | Negativfall — `header` bleibt `null` (Grenzfall 16) |
   | `odt/HeaderFooter.odt`, `odt/headfoot.odt`, `odt/headerFinal.odt` | Basisfall ODT — `Standard`-Master-Page steht in allen dreien zufällig zuerst in `styles.xml` (verifiziert), daher aktuell korrekt, aber nicht vertragsgemäß (Befund 4) |
   | `odt/headerFirstPage.odt`, `odt/HeaderFirstPageEnabled_MSO15.odt`, `odt/HeaderFirstPageDisabled_MSO15.odt` | erste-Seite-Variante ODT (Grenzfall 5, Befund 4) — auch hier steht die reguläre Master-Page (`Standard`/`MP0`) zufällig zuerst |
   | `odt/HeaderFirstAndEvenPageEnabled_MSO15.odt`, `odt/HeaderFirstAndEvenPageEnabledAndMarging_MSO15.odt` | gerade/ungerade + erste Seite kombiniert — ebenso zufällig korrekte Reihenfolge (`MP0` vor `MPF0`) |
   | `odt/tabellen_header_DOC_LO4-1-0.odt` | **Korrektur (verifiziert):** enthält **keine** Seiten-Kopf-/Fußzeile — das einzige `style:master-page`-Element ist selbstschließend (`<style:master-page style:name="Standard" style:page-layout-name="Mpm1"/>`), ohne `style:header`/`style:footer`-Kind. Der Dateiname bezieht sich auf eine **Tabellen**-Überschriftszeile im Hauptinhalt (`table:name="Table1"`, erste Zeile über mehrere Spalten verbunden und gesondert formatiert), kein ODF-Seiten-Kopf-/Fußzeilen-Mechanismus. Erwartetes Ergebnis nach Import: `header === null` **und** `footer === null` — ein Test, der hier Kopfzeilentext erwartet, ist falsch konstruiert (deckt de facto denselben Fall wie 6.1.1/6.1.2 ab, nur zusätzlich mit einer Tabelle im Hauptinhalt) |

   Alle genannten Dateien wurden als tatsächlich im Repo vorhanden verifiziert
   (`tests/fixtures/external/docx/`, `.../odt/`). Diese Prüfung deckt exakt die geforderte
   Rundreise „Upload unverändert → Export → Re-Import erhält Inhalt" ab und schließt die in
   Befund 13 festgestellte Lücke.
4. Die bestehenden Unit-Rundtrip-Tests (`roundtrip.test.ts`, Befund 12) bleiben grün.
5. Alle Prüfungen aus 6.1 müssen weiterhin grün sein, **nachdem** die neue Kopfzeilen-UI ergänzt
   wurde (die UI-Ergänzung darf am Reader/Writer-Verhalten nichts brechen).

### 6.2 Feature-Rundreise (Kopfzeile über die neue UI erstellt/bearbeitet)
Für jede Situation: Kopfzeile über Toolbar-Button/Doppelklick aktivieren, Inhalt eingeben →
als DOCX exportieren → reimportieren → Kopfzeilen- **und** Hauptinhalt erhalten; **und** identisch
als ODT; **und** zusätzlich beide Cross-Format-Richtungen:

- **6.2.A** Neues Dokument → Kopfzeile aktivieren → „Firma Mustermann GmbH" eingeben → DOCX-Export
  → Reimport → Text identisch in `header`, Haupttext unverändert.
- **6.2.B** Dasselbe als ODT-Ursprungsdokument.
- **6.2.C** Cross-Format DOCX → ODT → DOCX: Kopfzeilentext über beide Konvertierungen erhalten.
- **6.2.D** Cross-Format ODT → DOCX → ODT (Gegenrichtung).
- **6.2.E** Kopfzeile mit kombinierter Formatierung (fett **und** Textfarbe) → Rundreise erhält die
  Formatierung, nicht nur den nackten Text (Grenzfall 13).
- **6.2.F** Kopfzeile mit eingefügtem Bild (Firmenlogo) → Rundreise erhält das Bild (Grenzfall 6);
  deckt zugleich die DOCX-Part-Rels-Lücke 0.A/1 auf der **Erzeugungs**-Seite ab.
- **6.2.G** Mehrseitiges Dokument → Kopfzeile erscheint auf jeder Seite (Grenzfall 10) — abhängig
  von Abschnitt 4.
- **6.2.H** Dokument mit Kopfzeile **und** Fußzeile (unterschiedlicher Text) → beide bleiben
  unabhängig korrekt erhalten, keine Verwechslung (Grenzfall 15).
- **6.2.I** Aus einer Fremddatei importierte Kopfzeile über die UI **ergänzen** (Satz anhängen) →
  exportieren → Reimport zeigt den ergänzten, nicht nur den ursprünglichen Text.
- **6.2.J** Kopfzeile über die UI **komplett entfernen** (3.6) → Export enthält keine
  Kopfzeilen-Referenz mehr, Reimport zeigt `header === null`.

### 6.3 Unabhängige Schema-Validierung des exportierten Kopfzeilen-XML (Pflicht, 0.A/3)
- **ODT:** `odt/__tests__/external-validation.test.ts` (xmllint-wasm gegen
  `OpenDocument-v1.3-schema.rng`) läuft aktuell mit `header: null` (Befund 17). Er ist um
  mindestens einen Export **mit nicht-leerer Kopfzeile** zu erweitern, sodass das erzeugte
  `<style:header>` gegen das offizielle ODF-1.3-Schema validiert.
- **DOCX:** analog über die vorhandene `docx/__tests__/external-validation.test.ts` bzw. einen
  unabhängigen OOXML-Parser nachweisen, dass `word/header1.xml`, die `w:headerReference`, der
  Content-Type-Override **und** — sobald 0.A/1 behoben ist — die `word/_rels/header1.xml.rels`
  (Bild-Relationship) valide sind. Ziel: Schreib- und Lesefehler des **eigenen** Readers dürfen
  sich nicht gegenseitig unsichtbar ausgleichen (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 19).

**Abnahmekriterium für Abschnitt 6:** Formatierungs-/Layout-Nuancen bei Cross-Format sind
dokumentierbar und akzeptabel; **das vollständige Verschwinden von Kopfzeilen- oder
Haupttextinhalt (inkl. Bild) ist es nicht** — weder in 6.1 noch 6.2.

---

## 7. Testplan-Hinweise (Unit + E2E, Playwright)

1. **Bestehende Unit-Tests bleiben Pflicht (Regressionsschutz):** die Header-Blöcke in
   `docx/__tests__/roundtrip.test.ts` und `odt/__tests__/roundtrip.test.ts` (Befund 12) decken
   den reinen Reader/Writer-Rundtrip mit direkt konstruierten Daten ab und müssen grün bleiben —
   ersetzen aber **nicht** die UI-/E2E-Tests.
2. **Neue Fixture-Tests (6.1.3):** für jede der oben gelisteten realen Kopfzeilen-Fixtures ein
   automatisierter Test (Unit- oder E2E-Ebene): Import → Export → Reimport → Kopfzeilentext-Erhalt.
   Schließt die Lücke aus Befund 13; der bestehende Fixture-Sweep prüft nur „kein Crash".
3. **Bild-in-Kopfzeile (Grenzfall 6/0.A/1):** dedizierter Test, dass ein aus `headerPic.docx`
   importiertes **und** ein im Editor eingefügtes Kopfzeilen-Bild sichtbar bleibt und
   rundreist; deckt die DOCX-Part-Rels-Lücke (Read **und** Write) explizit ab. Bei bestätigtem
   Bug: Fix (Part-Rels laden + `header1.xml.rels` schreiben) und Regressionstest.
4. **E2E (Playwright), Aktivierung + Bearbeitung:** Dokument öffnen/neu erstellen → Button
   „Kopfzeile" klicken (bzw. Doppelklick auf den oberen Rand) → in die Kopfzeile tippen →
   Formatierung anwenden (z. B. Fett) → prüfen, dass der Text sichtbar und formatiert in der
   Kopfzeile erscheint und der Haupttext unberührt bleibt.
5. **E2E, echte Rundreise:** im Anschluss echten Export auslösen (Datei-Download abfangen, Muster
   aus `tests/e2e/docx.spec.ts`/`odt.spec.ts`) → resultierende Datei über den echten
   Upload-Dialog reimportieren → Kopfzeilentext und Formatierung weiterhin sichtbar.
6. **Regressionstest-Pflicht (Selection-Sync):** jeder E2E-Test aus 4/5 deckt zusätzlich die
   Sequenz aus Grenzfall 9 ab (Fokuswechsel Kopfzeile → Haupttext → Kopfzeile, je gefolgt von
   Tippen/Enter) — analog zur Pflichtsequenz aus `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 2 und
   `tests/e2e/selection-regression.spec.ts`. Dauerhaft in der Suite.
7. **Getrennte Undo-Historien (3.2):** eigener Test — Änderung in der Kopfzeile, dann Strg+Z im
   Haupttext darf sie nicht zurücknehmen und umgekehrt.
8. **Unabhängige Schema-Validierung (6.3):** ODT- und DOCX-Export **mit** nicht-leerer Kopfzeile
   gegen ein offizielles Schema/einen unabhängigen Parser.
9. **Visuelle Abgrenzung + Mehrseiten-Darstellung:** Screenshot-Vergleich oder DOM-Assertion, dass
   die Kopfzeile sich sichtbar vom Haupttext abhebt; für Grenzfall 10 die in Abschnitt 4
   getroffene Lösung verifizieren.
10. **Cross-Format-/Kombinationstests (6.2.C/D/E/F/H):** sowohl als Unit-Test gegen Reader/Writer
    **als auch** als E2E über echte Bedienung — reine Unit-Tests mit konstruierten JSON-Fixtures
    allein genügen nicht (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 17/21).
11. **Grenzfall-Dokumentation:** für jeden Grenzfall, der auf „zu dokumentierendes Verhalten"
    verweist (4, 5, 7, 8, 11, 12, 14, 18), das tatsächlich beobachtete Verhalten nach der Umsetzung
    hier oder im Test-Kommentar festhalten.
12. **Mobile/Tablet:** Aktivierung + Grundbearbeitung der Kopfzeile auf den in
    `playwright.config.ts` konfigurierten Projekten (Desktop, Mobile, Tablet) bedienbar
    (Toolbar erreichbar, Kopfzeile fokussierbar).

---

## 8. Testmatrix — Zusammenfassung

| Bereich | Unit (Reader/Writer) | E2E (echte Bedienung) | Realdatei-Fixture (Inhalt) |
|---|---|---|---|
| Header-Datenmodell round-trip, konstruierte Daten (Standard) | **vorhanden** (`roundtrip.test.ts`, Befund 12) | n/a | n/a |
| `null` bleibt `null` (keine Kopfzeile) | **vorhanden** (Befund 12) | fehlt | fehlt |
| Aktivieren über Button / Doppelklick | n/a | **fehlt** (Befund 8/9) | n/a |
| Bearbeiten + Formatieren in der Kopfzeile | teilweise (Writer kann es) | **fehlt** | fehlt |
| Bild in der Kopfzeile | **lückenhaft für DOCX** (Part-Rels, 0.A/1) — ODT ok (Befund 4/5) | **fehlt** | **fehlt** (`headerPic.docx` — Pflicht-Verifikation) |
| Tabelle/Liste in der Kopfzeile | vorhanden (Reader/Writer, Befund 2–5) | **fehlt** | **fehlt** (`tabellen_header…odt`) |
| Kombinierte Formatierung, Cross-Format | teilweise | fehlt | fehlt |
| „Upload unverändert" reale Fixtures (DOCX + ODT) | fehlt | fehlt | **fehlt komplett** (Sweep prüft nur Crash, Befund 13) |
| Mehrere Header-Referenzen/Master-Pages (erste Seite/gerade-ungerade) | fehlt | fehlt | **fehlt — Auswahl undeterministisch, empirisch an vier Pflicht-Fixtures bestätigt** (Befund 2/4, 0.A/4) |
| ODT `office:styles`-Kopfzeilenformatierung | fehlt | fehlt | **fehlt — stiller Verlust** (Befund 4) |
| Importiertes Seitenzahl-Feld behält Text | teilweise (Reader flacht ab, Befund 18) | fehlt | fehlt |
| Unabhängige Schema-Validierung mit nicht-leerer Kopfzeile | **fehlt** (läuft mit `header:null`, Befund 17/0.A/3) | n/a | n/a |
| Kopfzeile auf jeder Seite (Mehrseiten) | n/a | fehlt | n/a — **erst nach Architektur-Entscheidung** (Abschnitt 4) |
| Fokuswechsel Kopfzeile ↔ Haupttext (Selection-Sync) | n/a | **fehlt, muss Pflicht werden** (Grenzfall 9) | n/a |
| Getrennte Undo-Historien | n/a | fehlt | n/a |
| Kopfzeile entfernen (`→ null`, kein Geisterelement) | teilweise (Writer, Befund 3/5) | fehlt | n/a |

**Fazit:** Der Backlog-Status „fehlt" ist für die Editier-UI korrekt (keine Bedienelemente, kein
E2E-Test). Der Reader/Writer-Unterbau für **eine** Standard-Kopfzeile — inkl. Tabelle/
Formatierung und (mit Vorbehalt) Bild — existiert bereits und ist unit-getestet, aber an keiner
realen Fremddatei inhaltlich verifiziert und in mehreren benannten Punkten (DOCX-Kopfzeilen-Bild-
Rels, Mehrfach-Referenz-Auswahl, `office:styles`-Formatierung, Mehrseiten-Darstellung,
unabhängige Validierung) nachweislich lückenhaft.

---

## 9. Freigabekriterium (Definition of Done)

Der Backlog-Status von `kopfzeile-bearbeiten` darf erst dann als **vorhanden** (unqualifiziert)
gelten, wenn:

1. Alle Bedienelemente aus Abschnitt 1 existieren und über **echte** Playwright-Bedienung
   funktionieren (Button, Doppelklick-Aktivierung, sichtbar abgegrenzter Bereich, Verlassen,
   Entfernen mit Bestätigung) — nicht nur als Command-Aufruf. Auf den `Mobile`-/`Tablet`-Projekten
   ist mindestens der Toolbar-Button-Weg nachweislich nutzbar (Grenzfall 19).
2. Die Architektur-Entscheidung aus Abschnitt 4 (Overlay / Übergangslösung / Pro-Seite-Container)
   getroffen, umgesetzt und in Abschnitt 10 nachgetragen ist; Grenzfall 10 (mehrseitig) ist
   entsprechend nachgewiesen oder die Übergangslösung (b) als Einschränkung explizit vermerkt.
3. Die **nicht** umgesetzten Nachbarfunktionen (Erste Seite anders, Gerade/ungerade, Seitenzahl-
   Feld) als solche dokumentiert sind statt stillschweigend zu fehlen (Abschnitt 1 Z. 7–9;
   3.4/3.7).
4. Die deterministische Auswahl bei mehreren Kopfzeilen-Referenzen/Master-Pages (3.4/Befund 2/4)
   festgelegt, umgesetzt und dokumentiert ist — **inklusive** der in 0.A/4 empirisch belegten,
   konkret betroffenen Baseline-Fixtures (`headerFooter.docx`, `HeaderFooterUnicode.docx`,
   `EmptyDocumentWithHeaderFooter.docx`, `PageSpecificHeadFoot.docx`): für jede ist nachgewiesen,
   dass der Import den **tatsächlich sichtbaren** `default`-Text liefert, nicht mehr den
   fälschlich priorisierten `even`-Text.
5. Alle Testfälle aus Abschnitt 6.1 (Baseline, inkl. der realen Kopfzeilen-Fixtures) und 6.2
   (Feature-Rundreise, DOCX + ODT + beide Cross-Format-Richtungen) automatisiert vorliegen und
   grün sind.
6. Die **DOCX-Kopfzeilen-Bild-Lücke (0.A/1)** an `headerPic.docx` **und** an einem im Editor
   erzeugten Dokument befundet und je **behoben oder als bekannte, dokumentierte Einschränkung**
   festgehalten ist (Grenzfall 6, Testfall 7.3).
7. Die **unabhängige Schema-Validierung eines Exports mit nicht-leerer Kopfzeile (0.A/3, 6.3)**
   für ODT **und** DOCX grün ist.
8. Der Selection-Sync-Regressionstest mit Kopfzeilen-Fokuswechsel (Grenzfall 9/Testfall 7.6) und
   der Test getrennter Undo-Historien (Testfall 7.7) geschrieben, grün und dauerhaft in der Suite
   sind.
9. Die weiteren benannten Reader-Lücken befundet sind: `office:styles`-Kopfzeilenformatierung
   (Befund 4/Grenzfall 12) und Mehrfach-Referenz-Auswahl (Grenzfall 4/5) — je an mindestens einer
   realen Fremddatei, Ergebnis (behoben oder als bekannte Einschränkung dokumentiert) hier
   nachgetragen; ein importiertes Seitenzahl-Feld behält mindestens seinen Text (Befund 18/3.7).
10. Die Architektur verbaut ein späteres `seitenzahl-einfuegen` nicht (3.7/Befund 16/0.A/2) — ein
    künftiger Feld-Node bleibt schema-registrierbar, ohne `validateDocument.ts` zu brechen.
11. Kein Testfall stillen Datenverlust (Kopfzeilen-/Haupttext, Bild, Formatierung) oder eine
    JS-Exception in der Konsole zeigt, die nicht bereits als bekannter Punkt geführt ist.
12. Geklärt ist, ob und wie sich diese Funktion mit `fusszeile-bearbeiten` einen gemeinsamen
    Bearbeitungsmodus/Toolbar-Zugang teilt (Abschnitt 10, Offene Frage 4), damit beide Slugs
    konsistent umgesetzt werden (der Bild-Rels-Fix aus 0.A/1 deckt dann beide ab).

Andernfalls ist der Status auf **teilweise** zu setzen und die konkret fehlenden Teilpunkte sind
hier nachzutragen (voraussichtlich: Kopfzeilen-Editier-UI, Mehrseiten-Darstellung, deterministische
Referenz-Auswahl, DOCX-Kopfzeilen-Bild-Rels, `office:styles`-Formatierung, unabhängige Validierung,
Realdatei-Inhaltstests) — analog `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 17/21.

---

## 10. Offene Fragen (vor Umsetzungsbeginn zu klären, Ergebnis hier nachtragen)

1. Welche der drei Optionen aus Abschnitt 4 (Overlay pro Seitenband / einmalige Kopfzeile als
   Übergang / echte Pro-Seite-Container) wird umgesetzt?
2. Bleibt eine aktivierte, aber leere Kopfzeile beim Export erhalten (aktueller, verifizierter
   Stand: ja, siehe 3.6/Grenzfall 11) — oder soll sie beim Export zu `null` normalisiert werden?
   Der Reader macht eine importierte leere Kopfzeile zu `[emptyParagraph()]` statt `null` (3.1) —
   Export- und Importseite müssen konsistent sein, damit eine Datei nicht bei jeder Rundreise
   zwischen „aktiv-leer" und „inaktiv" driftet.
3. Ist die Aktivierung der Kopfzeile ein eigener Undo-Schritt (Grenzfall 8)?
4. Teilen sich `kopfzeile-bearbeiten` und `fusszeile-bearbeiten` eine gemeinsame Bedienleiste
   (z. B. ein Dropdown „Kopf-/Fußzeile") und einen gemeinsamen Bearbeitungsmodus, oder zwei
   getrennte Buttons/Modi? (Beeinflusst Abschnitt 1, Zeile 1; und die Umsetzungsreihenfolge, da
   der Bild-Rels-Fix 0.A/1 nur einmal gebaut werden soll.)
5. Wird die DOCX-Kopfzeilen-Bild-Rels-Lücke (0.A/1) **behoben** (Part-Rels laden + schreiben) oder
   als bekannte Einschränkung dokumentiert? (Empfehlung des PO: beheben, da typischer Fall
   Firmenlogo.)
6. Werden „Erste Seite anders"/„gerade-ungerade" (eigene Slugs) später tatsächlich nachgebaut,
   oder bleiben sie dauerhaft dokumentierte Einschränkung?

---

## 11. Umsetzungsstand Scheibe A (2026-07-11) + Entscheidungen zu §10

**Entscheidungen (§10):**
1. **Option (a) in zwei Stufen:** Stufe 1 (diese Scheibe) rendert den EDITIERBAREN
   Bereich im oberen/unteren Rand der ersten Seite (absolut positioniert — berührt
   weder Inhaltsfluss noch Paginierung); die nicht-editierbaren Kopien auf den
   Folgeseiten-Bändern (Stufe 2) sind die nächste Scheibe. Bis dahin gilt Grenzfall 10
   als dokumentierte, sichtbare Einschränkung — die Daten reisen davon unabhängig.
2. Eine aktivierte, leere Kopf-/Fußzeile bleibt beim Export erhalten (Ist-Stand
   bestätigt; kein Rundreise-Drift, da der Reader aktiv-leer als [leerer Absatz] liest).
3. Aktivieren/Entfernen sind App-Level-Aktionen und BEWUSST kein Editor-Undo-Schritt
   (die Bereiche haben je eine EIGENE Undo-Historie für ihren Inhalt — Word-analog;
   der Bestätigungsdialog ist der Schutz vor Datenverlust beim Entfernen).
4. **Gemeinsame Bedienleiste:** zwei benachbarte Toggle-Buttons (SVG-Icons, aria-pressed
   = Bereich vorhanden) für Kopf- UND Fußzeile; beide Slugs wurden in einem Wurf
   umgesetzt (identische Architektur, HeaderFooterEditor-Komponente).
5. DOCX-Part-Rels-Bild-Lücke (0.A/1): BEHOBEN (gleicher Tag, Nachtrag zu Scheibe A) — der Writer führt je Part eine eigene RelationshipRegistry und schreibt word/_rels/header1.xml.rels bzw. footer1.xml.rels (Hyperlink-Rels der Kopf-/Fußzeile inklusive); der Reader lädt die Part-eigenen Rels vor dem Block-Lesen. Unit-belegt (header-image.test.ts: Rel im richtigen Part, document.xml.rels bildfrei, Rundreise liefert die data-URL) und E2E-belegt (Logo über die UI einfügen → Export → Reimport zeigt das Bild im Kopfzeilen-Editor).
6. „Erste Seite anders"/„gerade-ungerade": bleiben dokumentierte Einschränkung
   (eigene Slugs, kein UI-Element täuscht sie an).

**Scheibe A umgesetzt und verifiziert:** eigener editierbarer Bereich als zweite/dritte
EditorView (gestrichelte Trennlinie + Label, eigene History, Klick-Reconciler
repliziert), Toolbar kontextsensitiv an die fokussierte Instanz gebunden (Formatierung
wirkt nur dort; Seitenumbruch-Button im Kopf-/Fußzeilen-Kontext deaktiviert),
Dialog-Einfügungen (Tabelle/Link) folgen der fokussierten Instanz, Entfernen mit
confirm. Dabei behoben: latenter Stale-Spread in den onChange-Aufrufen (Body-Änderungen
hätten parallele Kopf-/Fußzeilen-Änderungen zurückgerollt). E2E `kopf-fusszeile.spec.ts`
7 Testfälle grün auf Desktop Chrome, Mobile und Tablet inkl. DOCX- (header1/footer1.xml)
und ODT-Rundreise (styles.xml master-page).

**Scheibe B (offen):** Folgeseiten-Kopien (Option-a-Stufe 2), DOCX-Kopf-/Fußzeilen-
Bild-Rels-Fix (0.A/1), Doppelklick in den Seitenrand (§1 #2), Suche-in-Kopf/Fußzeile
(suchen-req §16).
