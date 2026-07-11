# Anforderungen: „Fußzeile bearbeiten“

Status: Backlog-Status **„fehlt“** (`specs/FEATURE-BACKLOG.md`, Abschnitt „3.7 Kopf- &
Fußzeile“, Slug `fusszeile-bearbeiten`, Priorität 1). Diese Einstufung gilt ausdrücklich als
**nicht vertrauenswürdig** und wurde für diese Anforderung durch direkte Code-Durchsicht
verifiziert (siehe Abschnitt 0). Ergebnis der Verifikation: Der Status ist **für die
Editier-UI korrekt („fehlt vollständig“)**, für den darunterliegenden Reader/Writer aber
präziser als „vorhanden, aber ungetestet und mit mindestens einem verifizierten
Textverlust-Bug“ zu lesen — nicht nur „ungetestet“: An zwei realen Fixtures
(`Bug54849.docx`, `Bug60341.docx`, Abschnitt 0.3/6) verschwindet importierter Fußzeilentext
heute nachweislich spurlos, weil der Reader ein block-levelges Word-Inhaltssteuerelement
(`w:sdt`) um einen Fußzeilenabsatz nicht erkennt. Das Feature gilt erst als „vorhanden und
verifiziert“, wenn die Definition of Done (Abschnitt 9) erfüllt ist.

Kurzbeschreibung (Backlog): „Aktiviert und befüllt einen eigenen editierbaren Bereich am
unteren Seitenrand.“

Geltungsbereich: Diese Datei ist die verbindliche Anforderungs- und Testgrundlage für genau
ein Feature — „Fußzeile über die Editor-UI aktivieren und befüllen“ — im gemeinsamen
DOCX/ODT-Editor (`src/formats/shared/editor/`, `src/formats/shared/documentModel.ts`) sowie
dessen Serialisierung/Deserialisierung in `src/formats/docx/` und `src/formats/odt/`. Sie
konkretisiert für dieses Einzelfeature, was `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 9
(„Kopf- und Fußzeilen“) und Abschnitt 17, Zeile 8 („Kopf-/Fußzeile bearbeiten — fehlt
komplett in der UI“) nur pauschal fordern. Wie dort festgelegt: DOCX und ODT teilen sich
denselben ProseMirror-Editor; jede Anforderung unten gilt für **beide** Formate, inklusive
Rundreise (Datei unverändert hochladen → exportieren → Re-Import erhält den Inhalt) und
Cross-Format-Konvertierung.

**Abgrenzung zu Nachbar-Slugs** (`specs/FEATURE-BACKLOG.md` Abschnitt 3.7): Neben
`fusszeile-bearbeiten` existieren sechs eigenständige, hier **nicht** mitspezifizierte Slugs:

- `kopfzeile-bearbeiten` (Priorität 1) — spiegelbildliches Schwester-Feature für den oberen
  Rand; eigener Anforderungstext `specs/kopfzeile-bearbeiten-req.md`. **Teilt mit diesem
  Feature exakt denselben technischen Mechanismus** (zweite Editor-Instanz + Rückschreiben
  ins Datenmodell, siehe Abschnitt 0/3.8); die gemeinsame Architektur wird hier referenziert,
  aber nur einmal — im jeweils zuerst umgesetzten Slug — tatsächlich gebaut. Diese Abhängigkeit
  ist vor Umsetzung zu klären (Abschnitt 10, Frage 5). **Neu verifiziert (diese Fassung):** Der
  in 0.3/6 belegte Block-Level-`w:sdt`-Textverlust-Bug sitzt im **body-weiten**
  `readBodyChildren`-Codepfad (`docx/reader.ts`) und wird identisch für Kopf- **und** Fußzeile
  durchlaufen — analog zum bereits bekannten Bild-Rels-Bug 0.3/1 nur einmal zu beheben, deckt
  dann aber beide Slugs ab.
- `seitenzahl-einfuegen` (Priorität 1) — automatisch fortlaufendes Seitenzahl-Feld. **Eigener
  Slug, nicht Gegenstand der Freigabe dieser Datei** (Korrektur gegenüber einer früheren
  Fassung dieser Anforderung, die das Feld als Teil der Fußzeilen-Abnahme forderte — das
  widerspricht der Backlog-Granularität und der Behandlung im Schwester-Slug
  `kopfzeile-bearbeiten`). Das Feld erscheint hier nur als **Architektur-Voraussetzung**
  (der Fußzeilen-Editor darf ein späteres Nachrüsten nicht verbauen, Abschnitt 3.7) und als
  **Import-Robustheits-Grenzfall** (eine bereits in einer Fremddatei vorhandene Seitenzahl
  darf beim Import nicht ersatzlos verschwinden, Abschnitt 5/7).
- `erste-seite-anders` (Prio 3), `gerade-ungerade-anders` (Prio 4),
  `mit-vorheriger-verknuepfen` (Prio 4), `seitenzahl-format` (Prio 3) — nicht Gegenstand
  dieser Datei; treten aber als Grenzfälle/Import-Robustheit auf, weil reale Fremddateien sie
  bereits enthalten und ein Import nicht daran scheitern oder still Daten verlieren darf
  (Abschnitt 7).

**Hinweis zu Code-Verweisen:** Alle Fundstellen unten sind über den **Symbolnamen**
(Funktion/Node/Attribut/Testblock) verankert und zusätzlich mit der zum Zeitpunkt dieser
Anforderung gültigen Zeilennummer versehen. Der Code dieses Repos wird pro
Pipeline-Durchlauf neu erzeugt; **Zeilennummern können driften — maßgeblich ist der
Symbolname**, nicht die Zeile.

---

## 0. Bestandsaufnahme (Ist-Zustand laut Code, verifiziert)

Diese Bestandsaufnahme beruht auf tatsächlicher Durchsicht des Codes (nicht auf der
Backlog-Beschreibung) und begründet, warum der Status „fehlt/nicht vertrauenswürdig“
zutrifft. Sie ist zugleich die Landkarte, an der die Verifikation ansetzt.

### 0.1 Vorhandenes Fundament (Datenmodell + Reader/Writer für genau eine „Standard“-Fußzeile)

| # | Ort (Symbol, aktuelle Zeile) | Befund |
|---|---|---|
| A | `WordDocumentContent` (`documentModel.ts` Z. 3–7), Feld `footer: ProseMirrorJSON \| null` (Z. 6); `createBlankWordDocument()` (Z. 14) setzt `footer: null` (Z. 18) | Datenmodell-Feld existiert bereits; ein neues Dokument hat standardmäßig **keine** Fußzeile (`null`), konsistent mit „muss erst aktiviert werden“. Es ist **kein** neues Datenmodell-Attribut nötig. |
| B | DOCX-Reader: `sectPr = firstChildNS(bodyEl, w, 'sectPr')` (`docx/reader.ts` Z. 507), `footerRef = firstChildNS(sectPr, w, 'footerReference')` (Z. 510), Auflösung Z. 523–529 | Liest die Fußzeile aus **genau einem** `w:footerReference` — dem **ersten** Kind des `sectPr` — **ohne dessen `w:type`-Attribut** (`default`/`first`/`even`) auszuwerten. Zusätzlich wird nur der `sectPr` am **Body-Ende** gelesen (`firstChildNS(bodyEl, …)`), nicht abschnittsweise `sectPr` in der Dokumentmitte → Mehrabschnitt-Fußzeilen aus mittleren Abschnitten werden gar nicht erreicht (siehe 0.2/D). |
| C | DOCX-Writer: `buildHeaderFooterXml('ftr', …)` (`docx/writer.ts` Z. 214), Fußzeilen-Zweig Z. 269–272, `<w:footerReference w:type="default" r:id="…"/>` (Z. 272), Datei `footer1.xml` (Z. 298), Content-Type (Z. 239) | Schreibt beim Export **genau eine** `footer1.xml` mit fest `w:type="default"`. Kein Code-Pfad für „erste Seite anders“, gerade/ungerade oder mehrere Abschnitte. |
| D | ODT-Reader: `masterPage = stylesDoc.getElementsByTagNameNS(style, 'master-page')[0]` (`odt/reader.ts` Z. 375), `footerEl = firstChildNS(masterPage, style, 'footer')` (Z. 378), Blocks Z. 384 | Liest die Fußzeile aus dem **ersten** `style:master-page`-Element in `styles.xml`, unabhängig von dessen Namen/Rolle. Dateien mit mehreren Master-Pages (z. B. abweichende erste Seite) liefern potenziell die falsche/eine unvollständige Fußzeile. **Zusätzliche, neu verifizierte Lücke:** Die Absatz-/Zeichenstile innerhalb der Fußzeile werden ausschließlich gegen `office:automatic-styles` aufgelöst (`stylesForChrome`, Z. 374); eine benannte Formatvorlage aus dem gemeinsamen Stil-Pool `office:styles` (z. B. die LibreOffice-Standardvorlage „Footer", die u. a. die Tab-Stopp-Positionen für die klassische Links/Mitte/Rechts-Dreiteilung trägt) wird **nicht** ausgewertet — Text bleibt erhalten, die daran hängende Formatierung geht still verloren. **Direkt an der Fixture verifiziert:** `styles.xml` in `HeaderFooter.odt` definiert `<style:style style:name="Footer" style:family="paragraph">` mit `<style:tab-stops>` **innerhalb** von `<office:styles>`, nicht `<office:automatic-styles>`; die Fußzeile referenziert sie über `text:style-name="Footer"`. Analoger Befund im Schwester-Slug `kopfzeile-bearbeiten-req.md` (dort Befund 4) — dieselbe `stylesForChrome`-Variable bedient Kopf- **und** Fußzeile (siehe 0.3/7, Grenzfall 5.18). |
| E | ODT-Writer: `buildStylesXml(headerXml, footerXml, …)` (`odt/writer.ts` Z. 216), `<style:master-page style:name="Standard" …>` + optionales `<style:footer>` (Z. 226–229) | Schreibt **genau ein** `style:footer` unter der Master-Page „Standard“. |
| F | Beide Reader, Leerbehandlung: `footer: footerBlocks ? { type:'doc', content: footerBlocks.length ? footerBlocks : [emptyParagraph()] } : null` (`docx/reader.ts` Z. 550; `odt/reader.ts` Z. 404); `emptyParagraph()` (`docx/reader.ts` Z. 224, `odt/reader.ts` Z. 93) | **Neuer, verifizierter Befund:** Eine im Original vorhandene, aber **inhaltlich leere** Fußzeilen-Referenz wird beim Import **nicht** zu `null`, sondern zu einer Fußzeile mit **einem leeren Absatz**. Ein importiertes Dokument mit aktiver, leerer Fußzeile (Fixture `EmptyDocumentWithHeaderFooter.docx`) hätte also `footer !== null` → der Button „Fußzeile“ müsste als **aktiv** dargestellt werden. Das entscheidet Grenzfall 5.1 auf der Importseite bereits vor und muss auf der Erzeugungs-/Exportseite konsistent behandelt werden. |
| G | Unit-Tests: `describe('DOCX round trip: header, footer, and metadata')` → `it('preserves header and footer content')` (`docx/__tests__/roundtrip.test.ts` Z. 334–345), Gegenstück `it('omits header/footer entirely when the document has none')` (Z. 347–351); ODT analog `describe('ODT round trip: header, footer, and metadata')` (`odt/__tests__/roundtrip.test.ts` Z. 376–380) | Rundreise von `footer` ist auf Reader/Writer-Ebene abgedeckt — **aber ausschließlich über direkt konstruierte** `WordDocumentContent`-Objekte (`footer: { type:'doc', content:[paragraph('Fußzeile Seite')] }`), nie über tatsächliche Bedienung und nie mit realen Fremddateien. |

### 0.2 Fehlendes (die eigentliche Feature-Lücke)

| # | Ort (Symbol, aktuelle Zeile) | Befund |
|---|---|---|
| A | `Toolbar.tsx` — komplette Button-Liste durchsucht | **Kein** Bedienelement für die Fußzeile: kein Button, kein Menüpunkt, keine Erwähnung von „Fußzeile“/„footer“. |
| B | `WordEditor.tsx`: `bodyNode = wordSchema.nodeFromJSON(doc.content.body)` (Z. 71), **eine** `new EditorView(…)` (Z. 114), Rückschreiben `onChangeRef.current({ ...doc.content, body: newState.doc.toJSON() })` (Z. 121) | Es existiert **genau eine** ProseMirror-Editor-Instanz, gebunden ausschließlich an `doc.content.body`. `header`/`footer` werden nirgends gerendert oder editierbar gemacht. **Wichtig für die Umsetzung:** Der Rückschreib-Handler ersetzt gezielt nur `body` und reicht `header`/`footer` per Spread **unverändert** durch — das ist zugleich (a) der Grund, warum eine importierte Fußzeile den Export unbeschadet übersteht, **und** (b) der Beweis, dass es **keinen** Code-Pfad gibt, der `footer` je verändert. Der neue Fußzeilen-Editor muss genau an diesem `onChange`-Vertrag ansetzen und `footer` ebenfalls zurückschreiben. |
| C | `commands.ts` — Exporte: `setAlign`, `isAlignActive`, `setHeading`, `toggleList`, `liftFromList`, `insertImage`, `insertHardBreak`, `insertTable`, `applyMarkColor`, `clearMarkColor`, `canCut`, `cutSelection` | **Kein** Kommando, das eine Fußzeile aktiviert, fokussiert oder deren Inhalt referenziert. |
| D | `schema.ts` — Node-/Mark-Liste (`doc`, `paragraph`, `heading`, `text`, `hard_break`, `image`, `unsupported_block` [Z. 92, `kind`-Attr], `bullet_list`, `ordered_list`, `list_item`, Tabellen via `tableNodes(…)`; Marks `strong`/`em`/`underline`/`strike`/`textColor`/`highlight`) | **Kein** Feld-/Seitenzahl-Node-Typ (kein `fldChar`/`instrText`-Äquivalent, kein `text:page-number`-Äquivalent). Eine Fußzeile kann nach heutigem Schema nur statischen Text/Bilder/Tabellen/Formatierung enthalten — keine automatisch aktualisierte Seitenzahl (das ist der separate Slug `seitenzahl-einfuegen`). `unsupported_block` ist der vorhandene Fallback-Node für unbekannte Inhalte. |
| E | `pageLayout.ts`: `pageBackgroundStyle()` (Z. 23) — sich wiederholender `linear-gradient`-Hintergrund (Z. 26–29), Kommentar „single scrolling surface reads as a stack of separate A4 sheets“ (Z. 19–21); `pagination.ts`: `Decoration.widget(…)` mit `page-break-spacer`-`div` (Z. 46–53) | Die Mehrseiten-Darstellung ist eine **Hintergrund-/Dekorations-Illusion** auf **einer** durchlaufenden ProseMirror-Fläche — **keine** echten Pro-Seite-DOM-Container. Eine Fußzeile „am unteren Rand jeder Seite“ hat damit aktuell **keinen strukturellen Ankerpunkt** (technisches Kernrisiko, Abschnitt 4). `pageGeometry.ts` (Z. 4) bestätigt zudem: Seitengeometrie hat „kein Feld in `WordDocumentContent`“ und „keine UI“. |
| F | E2E: `tests/e2e/*.spec.ts` (u. a. `docx.spec.ts`, `odt.spec.ts`, `roundtrip-fidelity.spec.ts`, `complex-import-fidelity.spec.ts`, `save-export-lifecycle.spec.ts`, `file-open-edge-cases.spec.ts`, `selection-regression.spec.ts`, …) nach „footer/Fußzeile/Kopfzeile“ durchsucht | **Kein einziges** E2E-Szenario zu Kopf-/Fußzeile (die Treffer „Merged Header“ betreffen Tabellen-Zellen, nicht Kopf-/Fußzeilen). Die Bedienung ist end-to-end vollständig ungetestet. |

### 0.3 Verifizierte Lücken/Risiken im vorhandenen Reader/Writer (nicht nur „ungetestet“)

Diese Punkte sind konkrete, im Code belegbare Schwächen des vorhandenen „Standard“-Pfads,
die bei der bisherigen, rein konstruierten Testabdeckung (0.1/G) unsichtbar bleiben:

1. **Bilder in einer importierten Kopf-/Fußzeile lösen sich falsch/gar nicht auf (verifizierter
   Bug, nicht nur ungetestet).** Der DOCX-Reader lädt nur die Haupt-Relationships
   `documentRels = readRelationships(zip, 'word/_rels/document.xml.rels')` (`docx/reader.ts`
   Z. 501) und reicht **genau diese** Map an den geteilten Block-Reader für Body **und** Kopf-
   **und** Fußzeile weiter (`readBodyChildren(root, …, documentRels, zip)`, Z. 520 für Header,
   Z. 529 für Footer). In OOXML referenziert eine `header1.xml`/`footer1.xml` eingebettete
   Bilder/Hyperlinks jedoch über ihre **eigene** `word/_rels/header1.xml.rels` bzw.
   `word/_rels/footer1.xml.rels` — die hier **nie geladen** wird. **Direkt am Fixture-Inhalt
   verifiziert** (Auspacken von `tests/fixtures/external/docx/headerPic.docx`): Die Datei enthält
   `word/_rels/header1.xml.rels` (bildet `rId1` → `media/image1.jpeg`) **und** ein
   `word/media/image1.jpeg`; `word/_rels/document.xml.rels` bildet **denselben** `rId1` auf ein
   **anderes** Ziel ab. Der Reader löst das `r:embed="rId1"` der Kopf-/Fußzeile also über die
   **falsche** Map auf → er lädt entweder gar kein oder ein **falsches** Ziel, ohne sichtbare
   Meldung (stiller Datenverlust/Korruption, keine Exception). Weil `readBodyChildren` für Kopf-
   und Fußzeile **derselbe** ist (identisches `documentRels`-Argument), trifft der Defekt eine
   Fußzeile mit Bild **zwingend genauso**. Das Korpus enthält (verifiziert) **keine** dedizierte
   „Bild-in-Fußzeile“-Fixture — `headerPic.docx` trägt das Bild in der **Kopf**zeile — der Beweis
   läuft daher über den geteilten Codepfad plus ein im Editor selbst erzeugtes Fußzeilen-Bild
   (Abschnitt 6.3, Testfall 3). **Konsequenz:** zu behebender Bug (Part-eigene `.rels` laden),
   kein bloßer Test-Gap; Fixpunkt Definition of Done 10.
2. **Kein bewusst gewähltes `w:type`/Master-Page-Prioritätsschema (0.1/B, D).** Welche
   Fußzeile bei mehreren Referenzen/Master-Pages „gewinnt“, hängt allein von der
   Dokumentreihenfolge ab, nicht von einer Entscheidung. Für eine belastbare, verlustarme
   Import-Robustheit ist eine deterministische, dokumentierte Auswahl nötig (Empfehlung:
   bevorzugt `w:type="default"` bzw. die Folgeseiten-Master-Page, sonst die erste gefundene).
3. **Der exportierte Fußzeilen-XML wird von der vorhandenen Schema-Validierung nicht erfasst.**
   `odt/__tests__/external-validation.test.ts` validiert `content.xml` mit `xmllint-wasm`
   gegen das offizielle OASIS-ODF-1.3-RelaxNG-Schema
   (`tests/fixtures/external/odf-schema/OpenDocument-v1.3-schema.rng`) — läuft aber aktuell
   mit `header: null, footer: null` (Z. 109–110), prüft also **nie** ein reales
   `<style:footer>`. Für die Abnahme muss die unabhängige Validierung um einen Export **mit**
   nicht-leerer Fußzeile erweitert werden (DOCX-seitig analog über
   `docx/__tests__/external-validation.test.ts` bzw. einen unabhängigen OOXML-Parser).
4. **`validateDocument.ts` erzwingt Schema-Konformität der Fußzeile beim Laden.**
   `assertLoadableDocument()` (Z. 12) ruft `wordSchema.nodeFromJSON(content.footer).check()`
   (Z. 16). Ein künftiger Feld-/Seitenzahl-Node (Slug `seitenzahl-einfuegen`) muss daher
   **im Schema registriert** sein, sonst wirft bereits das Laden eines Dokuments mit einer
   solchen Fußzeile. Das ist eine harte Architektur-Randbedingung für 3.7.
5. **ODT-Reader begegnet Seitenzahl-Feldern bereits, ohne Feld-Node.** Ein Kommentar im
   ODT-Reader (`odt/reader.ts` Z. 162) listet u. a. `text:page-number`/`text:page-count`.
   Wie diese in einer importierten Fußzeile aktuell behandelt werden (vermutlich als Text
   abgeflacht oder als `unsupported_block`), ist zu verifizieren — es entscheidet, ob die
   Rundreise einer **schon vorhandenen** Seitenzahl mindestens deren Text erhält (Abschnitt 7).
6. **Neu verifizierter Bug, schwerwiegender als 0.3/1 — ein block-levelges Word-Inhaltssteuer-
   element (`w:sdt`) in einer Fußzeile lässt deren gesamten Text spurlos verschwinden (Total-
   verlust statt nur eines Bildes).** `readBodyChildren()` (`docx/reader.ts` Z. 472–481, geteilt
   für Body **und** Kopf-/Fußzeile) erkennt als Block-Kind ausschließlich `w:p` (Z. 473) und
   `w:tbl` (Z. 478). Ein **Block-Level**-`w:sdt` — ein Inhaltssteuerelement, das eine komplette
   `w:p` umschließt, wie es reale Word-Fußzeilen-Bausteine/Seitenzahl-Galerien routinemäßig
   erzeugen — ist kein erkannter Zweig und wird beim Durchlaufen von `bodyEl.children` still
   übersprungen; die darin enthaltenen Absätze tauchen **nirgends** auf. Weil ein leeres
   `footerBlocks`-Array laut der Leerbehandlung (Z. 548–550, siehe Befund F) zu
   `[emptyParagraph()]` normalisiert statt als Fehler gemeldet wird, bleibt die Fußzeile **nach
   außen unauffällig aktiv, aber inhaltlich leer** — kein Crash, keine Warnung, nur stiller
   Totalverlust des Textes. **Direkt an zwei realen Fixtures verifiziert:** `Bug54849.docx`
   (`word/footer1.xml` = `<w:ftr><w:sdt><w:sdtContent><w:p>…Footer_rich_text…</w:p>
   </w:sdtContent></w:sdt></w:ftr>`) und `Bug60341.docx` (`word/footer.xml`, zweifach
   verschachteltes `<w:sdt><w:sdtContent>`, enthält den sichtbaren Seitenzahl-Text
   „Page 2 of 2" über gemischte `w:fldChar`/`w:instrText`/`w:t`-Runs). Beide Dateien werden vom
   bestehenden Crash-Sweep (`external-fixtures.test.ts`) nur auf „stürzt nicht ab" geprüft
   (0.2/F) — der Textverlust ist dort unsichtbar. Der zugrunde liegende Codepfad wird
   **identisch** für eine Kopfzeile durchlaufen (im Schwester-Slug `kopfzeile-bearbeiten`
   bislang nicht dokumentiert); in den beiden hier genannten Fixtures trifft er zufällig konkret
   die Fußzeile. Zum Vergleich: die bereits vorhandene **inline** Behandlung von `w:sdt`
   *innerhalb* eines Absatzes existiert bereits (`collectRuns`, Z. 209–211) — nur die
   **block-übergreifende** Variante fehlt. **Konsequenz:** zu behebender Bug (`readBodyChildren`
   muss `w:sdt` als Block-Container erkennen und in dessen `sdtContent` absteigen), kein bloßer
   Test-Gap; Pflicht-Verifikation Grenzfall 5.17, Fixpunkt Definition of Done Punkt 10.
7. **ODT-Fußzeilenformatierung über eine benannte `office:styles`-Vorlage geht still verloren
   (Text bleibt erhalten).** Vollständige, fixture-belegte Herleitung siehe 0.1/D (`stylesForChrome`
   wertet nur `office:automatic-styles` aus; `HeaderFooter.odt`s Fußzeilenstil „Footer" mit
   Tab-Stopps liegt in `office:styles`). Pflicht-Verifikation Grenzfall 5.18.

### 0.4 Fazit der Bestandsaufnahme

Auf Datenmodell-/Reader-/Writer-Ebene existiert ein **einfacher, ungetesteter** Mechanismus
für **genau eine** (Standard-)Fußzeile — mit belegbaren Lücken (0.3). Auf UI-Ebene existiert
**nichts**: kein Button, kein zweiter Editorbereich, kein Kommando, keine E2E-Abdeckung. Der
Backlog-Status „fehlt“ ist für die eigentliche Editierfunktion damit **zutreffend**; „nicht
vertrauenswürdig“ ist für Reader/Writer zutreffend, weil bisher nichts davon über eine reale
Datei mit realer Bedienung verifiziert wurde. Diese Datei beschreibt folglich den
Soll-Zustand einer **komplett neu zu bauenden UI-Funktion auf vorhandenem
Datenmodell-Fundament** — nicht Schema-Design von Grund auf.

---

## 1. Menüpunkte / Bedienelemente (Soll-Zustand)

| # | Element | Ist-Zustand (Befund) | Soll |
|---|---|---|---|
| 1 | Toolbar-Button/Menüpunkt „Fußzeile“ (Toggle) | **Fehlt komplett** in `Toolbar.tsx` | Ergänzen: eindeutiges, **eingebettetes SVG-Icon** (kein Emoji/Buchstaben-Icon, vgl. `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.1), sinnvoll in einer „Einfügen/Layout“-Gruppe. Schaltet die Fußzeile dokumentweit ein/aus. `aria-pressed` spiegelt den Aktiv-Zustand; Tooltip „Fußzeile einblenden“/„…ausblenden“ je nach Zustand. |
| 2 | Doppelklick in den **unteren** Seitenrandbereich einer sichtbaren Seite | **Fehlt** — kein Klick-Handler auf dem Seitenrand, nur rein visuelles Hintergrundmuster (`pageBackgroundStyle()`) | Ergänzen: entspricht dem in Word **und** LibreOffice Writer identischen Standardverhalten und damit direkter Nutzererwartung. Gleichwertig zum Button (#1). |
| 3 | Eigener, sichtbar abgegrenzter Fußzeilen-Editierbereich am unteren Rand jeder Seite | **Fehlt** — `WordEditor.tsx` rendert nur einen `EditorView`, gebunden an `body` | Ergänzen: eigener editierbarer Bereich (eigener, aus `wordSchema` abgeleiteter `EditorView`/State für `footer`), visuell klar vom Haupttext abgesetzt (z. B. dünne Trennlinie + dezentes Label „Fußzeile“ bei Fokus, analog Word/LibreOffice). |
| 4 | Fokus-Übergang Haupttext ↔ Fußzeile | Nicht anwendbar (Funktion fehlt) | Klick in die Fußzeile verschiebt den Eingabefokus dorthin; Klick in den Haupttext zurück. **Zusätzlich tastaturbedienbar** (Barrierefreiheit, kein reiner Maus-Zugang): Escape verlässt die Fußzeile zurück in den Haupttext; die Fußzeile ist ohne Maus erreichbar (z. B. Tab-Reihenfolge oder Wiederholen des Toolbar-Toggles fokussiert sie), analog zum „optional Escape/Button“-Verlassen im Schwester-Slug `kopfzeile-bearbeiten`. Muss zuverlässig funktionieren — Pflicht-Regressionsfall gegen den Selection-Sync-Bug (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 2), da hier ein Wechsel zwischen **zwei** ProseMirror-Instanzen stattfindet (Grenzfall 5.7). |
| 5 | Formatierungs-Toolbar wirkt in der Fußzeile | Indirekt fehlend (Fußzeilen-Editor fehlt) | Dieselbe Toolbar wie im Haupttext, **kontextsensitiv an die fokussierte Instanz gebunden**: alle Zeichen-/Absatzfunktionen aus `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 3/4 wirken 1:1 auf die Fußzeile, wenn diese fokussiert ist, und **nicht** auf den Haupttext. |
| 6 | Fußzeile deaktivieren/entfernen (erneuter Klick auf #1 oder eigener Menüpunkt „Fußzeile entfernen“) | Nicht anwendbar | Setzt `footer` zurück auf `null`, damit der Export keine verwaiste, leere `w:footerReference`/`style:footer` erzeugt. Bei **nicht-leerer** Fußzeile: Bestätigung vor Datenverlust (Grenzfall 5.2). |
| 7 | Seitenzahl-Feld-Button innerhalb der Fußzeilen-Bearbeitung | Fehlt — **eigener** Slug `seitenzahl-einfuegen`; im Schema existiert ohnehin kein Feld-Node (0.2/D) | **Nicht Teil dieser Abnahme.** Die Fußzeilen-Editor-Architektur darf ein späteres Nachrüsten eines Inline-Feld-Nodes aber nicht strukturell verbauen (reiner Text-Container wäre zu eng; siehe 3.7 und 0.3/4). |
| 8 | Optionen „Erste Seite anders“ / „Gerade/ungerade anders“ | Fehlen — eigene Slugs `erste-seite-anders`, `gerade-ungerade-anders` | **Nicht Teil dieser Abnahme.** Solange nicht umgesetzt, **explizit** als nicht unterstützt kennzeichnen — kein UI-Element darf eine nicht wirkende Funktion vortäuschen (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.4). |
| 9 | Statusanzeige „Cursor ist in Haupttext / Fußzeile“ (nice-to-have) | Fehlt | Optional; wenn nicht umgesetzt, **explizit** als „nicht umgesetzt“ dokumentieren (kein stiller Fehlschlag). |

Diese Tabelle ersetzt für den Fußzeilen-Teil die pauschale Zeile 8 der Menü-/Toolbar-Übersicht
in `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 17.

---

## 2. Geltende Randbedingungen aus der Haupt-Spezifikation

Diese Datei ergänzt, ersetzt aber nicht `FEATURE-SPEC-DOCX-ODT.md`, insbesondere:

- **Abschnitt 9** („Kopf- und Fußzeilen“): „jeweils eigener editierbarer Bereich, unabhängig
  vom Haupttext … Aktuell laut Plan ‚vorhanden‘ — muss aber über echte UI-Bedienung getestet
  werden … das ist eine fehlende Funktion, kein reiner Test-Gap.“ Genau das spezifiziert diese
  Datei im Detail (für die Fußzeilenhälfte). Der dortige Testfall 4 (Seitenzahl-Feld) gehört
  zum Nachbar-Slug `seitenzahl-einfuegen` (siehe Abgrenzung).
- **Abschnitt 1.1/1.3**: „Neues Dokument → sofort tippen möglich“ und „nach Export weiter
  bearbeitbar, kein Fokusverlust“ gelten sinngemäß für den Fußzeilenbereich (siehe 3.1/3.9).
- **Abschnitt 2** (Selection-Sync-Bug + Pflicht-Regressionstest): Der Fokuswechsel zwischen
  Haupttext und einer **zweiten** Editor-Instanz ist strukturell ein Selektions-/Fokuswechsel
  und damit ein Hauptverdachtsfall für dieselbe Fehlerklasse — eigener Regressionstest nötig
  (Grenzfall 5.7).
- **Abschnitt 3/4** (Zeichen-/Absatzformatierung): gelten 1:1 innerhalb der Fußzeile (3.2).
- **Abschnitt 7** (Bilder): gilt sinngemäß für Bilder in der Fußzeile (Firmenlogo/Copyright)
  — siehe die verifizierte Reader-Lücke 0.3/1.
- **Abschnitt 18** (Import-Robustheit, „kein stiller Datenverlust“): gilt für Fußzeilen aus
  Fremddateien, insbesondere bei mehreren Referenzen/Master-Pages (0.1/B, D; 0.3/2; Abschnitt 7).
- **Abschnitt 19** (Export-Robustheit & Rundreise, unabhängige Validierung) und **Abschnitt
  20.4** (kein stiller Fehlschlag) gelten uneingeschränkt (siehe 0.3/3 und 6.4).

---

## 3. Gewünschtes Verhalten im Detail

### 3.1 Aktivierung der Fußzeile
- Aktivierbar über **beide** Wege gleichwertig: Toolbar-Button „Fußzeile“ (#1) **und**
  Doppelklick in den unteren Seitenrandbereich (#2).
- Aktivierung schaltet den eigenen editierbaren Bereich am unteren Seitenrand sichtbar,
  visuell klar vom Haupttext abgegrenzt.
- Bei einem Dokument ohne Fußzeile (`footer === null`, z. B. neues Dokument oder importierte
  Datei ohne Fußzeile) erzeugt die erste Aktivierung einen **leeren, sofort editierbaren**
  Bereich (ein leerer Absatz, analog `emptyDocJSON()`), der Cursor steht automatisch darin —
  **kein zusätzlicher Klick nötig**, um zu tippen (Parität zu Abschnitt 1.1).
- Bei einem Dokument **mit** bereits vorhandener Fußzeile (nach Import) zeigt die App den
  Bereich von Anfang an aktiv mit dem importierten Inhalt — die Nutzerin muss ihn nicht erst
  „aktivieren“ (der Button ist bei Import mit Fußzeile bereits `aria-pressed=true`).

### 3.2 Bearbeiten des Inhalts (Funktionsparität zum Haupttext)
Der Fußzeilenbereich verwendet dasselbe `wordSchema` (`doc: { content: 'block+' }`) und bietet
— sofern nicht in Abschnitt 4 (Layout) oder 3.7 (Feld) eingeschränkt — dieselbe Funktionalität
wie der Haupttext:
- **Text-Grundfunktionen** (Abschnitt 2): Tippen, Löschen, Cursor-Navigation, Auswahl
  (Maus/Doppelklick/Dreifachklick/Strg+A), Ausschneiden/Kopieren/Einfügen, Undo/Redo.
- **Zeichenformatierung** (Abschnitt 3): Fett/Kursiv/Unterstrichen/Durchgestrichen,
  Hoch-/Tiefstellen (sobald vorhanden), Schrift-/Hervorhebungsfarbe, Schriftart/-größe,
  Formatierung löschen — wirkt jeweils nur auf den Fußzeileninhalt.
- **Absatzformatierung** (Abschnitt 4): Ausrichtung (typisch zentriert/rechts für
  Seitenzahlen), Formatvorlagen (inkl. Überschrift — siehe Grenzfall 5.8 zur Sinnhaftigkeit),
  Zeilen-/Absatzabstand, Einzüge, Tabstopps (die „ThreeCol“-Fixtures nutzen Tabstopps für
  links/mitte/rechts-Dreiteilung).
- **Bilder** (Abschnitt 7), **Tabellen** (Abschnitt 6), **Listen** (Abschnitt 5): einfügbar
  und editierbar; kein Hauptanwendungsfall außer Bild/Tabelle (Logo, dreispaltige Fußzeile),
  dürfen aber nicht abstürzen und müssen bei Rundreise mindestens ihren Text/ihre Struktur
  erhalten (Fallback-Prinzip Abschnitt 18).

### 3.3 Seitenübergreifende Wirkung (Standard-Fußzeile)
- Es gibt **genau einen** Fußzeileninhalt pro Dokument (`WordDocumentContent.footer`), der auf
  **jeder** sichtbar gerenderten Seite identisch erscheint — nicht nur auf der ersten oder
  letzten (Grenzfall 5.3; abhängig von der Layout-Entscheidung Abschnitt 4).
- Eine Bearbeitung wirkt sich unmittelbar auf alle Seiten aus (kein pro-Seite-Override, kein
  Auseinanderlaufen mehrerer Kopien desselben Inhalts).
- Das entspricht der in Abschnitt 9 geforderten Mindestunterstützung „Standard“ (gleiche
  Fußzeile auf jeder Seite).

### 3.4 Verlassen des Fußzeilenbereichs
- Klick in den Haupttext beendet die Fußzeilen-Bearbeitung und aktiviert den Haupttext-Cursor
  an der geklickten Position.
- **Tastatur-Alternative (Pflicht, Barrierefreiheit):** Escape aus der fokussierten Fußzeile
  gibt den Fokus an den Haupttext zurück; die Fußzeile darf nicht nur per Maus erreichbar/
  verlassbar sein. Ist keine sinnvolle Rückkehrposition bekannt, landet der Cursor am
  Dokumentanfang des Haupttexts — nie im Nirwana, nie ein wirkungsloser Tastendruck
  (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 20.4).
- Der Fokuswechsel darf keine Selektions-Inkonsistenz erzeugen — insbesondere darf ein direkt
  danach ausgelöstes Enter/Tippen nicht versehentlich Fußzeilen- oder Haupttextinhalt
  löschen/ersetzen (Selection-Sync-Bug, Grenzfall 5.7).

### 3.5 Getrennte Undo-/Redo-Historien
- Fußzeile und Haupttext sind getrennte ProseMirror-Instanzen mit **getrennten**
  Undo-Historien: Strg+Z im Haupttext darf keine Fußzeilen-Änderung rückgängig machen und
  umgekehrt. Dies ist explizit festzulegen und zu testen, da es im aktuellen Code (nur **eine**
  Instanz, 0.2/B) **keine Präzedenz** gibt.

### 3.6 Deaktivieren/Leeren der Fußzeile
- Den gesamten Fußzeilentext zu markieren und zu löschen (Entf) darf **nicht** automatisch die
  Fußzeile/Datenmodell-Referenz entfernen — ein leerer, aber weiterhin aktivierter Bereich
  bleibt bestehen (analog Word/LibreOffice; konsistent mit dem Import-Verhalten 0.1/F).
- Zusätzlich muss ein expliziter Weg existieren, die Fußzeile **komplett** zu entfernen
  (`footer` → `null`, #6). Bei nicht-leerer Fußzeile ist eine Bestätigung vor Datenverlust
  Pflicht. Ein solcher Bestätigungsdialog ist bereits Hausmuster:
  `DocumentWorkspace.tsx` Z. 98 nutzt `window.confirm('Nicht exportierte Änderungen gehen
  verloren. Trotzdem schließen?')`; die Fußzeilen-Entfernung soll demselben Muster folgen.
  Abbrechen der Bestätigung darf den Aktiv-Zustand nicht verändern (Grenzfall 5.2).

### 3.7 Zusammenspiel mit einem künftigen Seitenzahl-Feld (Verweis, kein Umsetzungsgegenstand)
- Der Slug `seitenzahl-einfuegen` wird durch diese Datei **nicht** umgesetzt. Als
  **Architektur-Voraussetzung** gilt: Der Fußzeilen-Editor darf nicht so eng gefasst sein,
  dass er nur reinen Text/Formatierung erlaubt und ein späteres Inline-Feld-Node (0.2/D,
  0.3/4) strukturell verbaut. Insbesondere muss ein solcher Node später ins `wordSchema`
  aufgenommen werden können, ohne `validateDocument.ts` (0.3/4) zu brechen.
- Import-Robustheit: Enthält eine Fremddatei bereits ein Seitenzahl-Feld in der Fußzeile
  (`w:fldSimple`/`PAGE` bzw. `text:page-number`, siehe 0.3/5), muss **mindestens dessen
  aktueller Textwert** die Rundreise überstehen — kein ersatzloses Verschwinden (Abschnitt 7).

### 3.8 Datenmodell-Wiederverwendung und Integrationspunkt
- **Kein** neues Datenmodell-Attribut nötig — `footer` existiert (0.1/A). Gefordert ist der
  **UI-Zugang** zu diesem vorhandenen Feld.
- Konkreter Integrationspunkt: Der neue Fußzeilen-Editor muss seine Änderungen über denselben
  `onChange`-Vertrag zurückschreiben wie der Body-Editor (`WordEditor.tsx` Z. 121) — statt nur
  `{ ...content, body }` künftig auch `{ ...content, footer }`. Reader/Writer dürfen zur
  Erfüllung dieser Anforderung **nicht** unnötig verändert werden, **außer** zur Behebung der
  in 0.3 belegten Lücken (Fußzeilen-Bild-Rels 0.3/1, deterministische Auswahl 0.3/2), sofern
  die Verifikation diese bestätigt.

### 3.9 Rückmeldeverhalten (kein stiller Fehlschlag)
- Kann eine Aktion nicht ausgeführt werden (z. B. Doppelklick auf den Seitenrand, während der
  Editor noch initialisiert), muss eine sichtbare Rückmeldung erfolgen oder ein definiertes
  Fallback greifen — niemals ein Klick/Doppelklick, der ergebnislos bleibt (Abschnitt 20.4).

---

## 4. Seitenlayout-Integration (technisches Kernrisiko — vor Umsetzung zu entscheiden)

Die Seitenansicht simuliert mehrere A4-Seiten über einen sich wiederholenden Hintergrund
(`pageBackgroundStyle()`) und Spacer-Dekorationen (`pagination.ts`) auf **einer** durchlaufenden
ProseMirror-Fläche; es gibt **keine** echten Pro-Seite-Container (0.2/E). Eine Fußzeile „am
unteren Rand jeder Seite“ kann deshalb **nicht** wie ein zusätzlicher Body-Absatz behandelt
werden. Eine der folgenden Lösungen ist zu wählen und **hier zu dokumentieren**:

- **(a) Overlay pro berechnetem Seitenband:** ein absolut/fixed positioniertes Fußzeilen-Element
  pro Seite an den Y-Positionen, die `pagination.ts` bereits berechnet (Wiederverwendung der
  vorhandenen Seitenumbruch-Berechnung). Bevorzugt, weil dem Word-Verhalten am nächsten.
- **(b) Einmalige Fußzeile am Dokument-/Seitenende** plus **dokumentierte Einschränkung**
  „erscheint aktuell nur einmal, nicht auf jeder Zwischenseite“ — nur als **Übergangslösung**
  akzeptabel und im Feature-Status explizit zu vermerken (kein stiller Fehlschlag).
- **(c) Refaktorierung auf echte Pro-Seite-Container.**

**Diese Entscheidung ist Abnahme-Voraussetzung.** Bis sie getroffen ist, gilt der
mehrseitige Darstellungs-Testfall (5.3) als nicht erfüllbar. Die Entscheidung ist in Abschnitt
10 (Offene Fragen) nachzutragen. Unabhängig von (a)/(b)/(c) muss der **Datenmodell-/Export**-Pfad
(eine Fußzeile, DOCX+ODT, Rundreise) vollständig funktionieren — die Layout-Darstellung darf
die Datenkorrektheit nicht beeinflussen.

---

## 5. Grenzfälle (müssen explizit befundet werden)

| # | Grenzfall | Erwartetes Verhalten |
|---|---|---|
| 5.1 | Aktivierte, aber nur mit einem leeren Absatz gefüllte Fußzeile beim Export | **Festzulegen** und zu dokumentieren: bleibt als leere `footer1.xml`/`<style:footer>` erhalten (Fußzeile bewusst aktiviert) **oder** wird beim Export zu `null` normalisiert. Empfehlung: erhalten. **Achtung Import-Asymmetrie:** Der Reader macht eine leere importierte Fußzeile bereits zu `[emptyParagraph()]` statt `null` (0.1/F) — Erzeugungs-/Export- und Importseite müssen konsistent sein, sonst driftet eine Datei bei jeder Rundreise zwischen „aktiv-leer“ und „inaktiv“. |
| 5.2 | Befüllte Fußzeile deaktivieren/entfernen (#6) | Bestätigung vor Datenverlust (Hausmuster `window.confirm`, 3.6). Abbrechen lässt Aktiv-Zustand und Inhalt unverändert. Nach Bestätigung: `footer === null`, Export ohne verwaiste Referenz. |
| 5.3 | Mehrseitiges Dokument mit aktiver Fußzeile | Fußzeile erscheint identisch auf **jeder** sichtbar gerenderten Seite (abhängig von Entscheidung Abschnitt 4). |
| 5.4 | Manueller Seitenumbruch mitten im Dokument (sobald als Node vorhanden, Abschnitt 8/15 der Haupt-Spez.) | Fußzeile erscheint unverändert auf beiden entstehenden Seiten. Ein manueller Seitenumbruch **innerhalb** der Fußzeile ist nicht sinnvoll und muss abgefangen werden (kein Crash, keine kaputte Exportdatei) — Grenzfall 5.12. |
| 5.5 | Fußzeileninhalt größer als der untere Seitenrand (mehrzeilig, Tabelle, großes Bild) | Definiertes Verhalten: reservierter Bereich wächst sichtbar mit (bevorzugt, kein abgeschnittener Inhalt) **oder** sichtbare Warnung. **Kein stilles Abschneiden.** |
| 5.6 | Undo direkt nach Deaktivieren/Entfernen der Fußzeile | Stellt den zuletzt entfernten Fußzeileninhalt wieder her (nicht nur den Aktivierungs-Zustand ohne Inhalt). Verhalten (Aktivierung eigener Undo-Schritt?) ist festzulegen und zu dokumentieren. |
| 5.7 | **Fokuswechsel Haupttext ↔ Fußzeile, jeweils gefolgt von Tippen** (mehrfach) | **Pflicht-Regressionstest** analog Selection-Sync-Bug (Abschnitt 2): Text in Fußzeile → Klick in Haupttext → weiter tippen → Klick zurück in Fußzeile → weiter tippen → **beide** Bereiche behalten ihren jeweils korrekten, unveränderten Inhalt; keine Vermischung, kein Bereichsübergriff. Dauerhaft in der Suite. |
| 5.8 | Formatvorlage „Überschrift“ innerhalb der Fußzeile | Durch Schema-Wiederverwendung technisch möglich; weder speziell verhindern noch fördern — darf nicht abstürzen und muss bei Rundreise erhalten bleiben, auch wenn inhaltlich unüblich. |
| 5.9 | Import mit „erste Seite anders“ bzw. gerade/ungerade Fußzeilen (Fixtures `DiffFirstPageHeadFoot.docx`, `PageSpecificHeadFoot.docx`; `HeaderFirstPage*_MSO15.odt`, `HeaderFirstAndEvenPage*_MSO15.odt`) | Aktuell wird nur **eine** Variante gelesen (0.1/B, D). Mindestanforderung: mindestens eine Fußzeile bleibt erhalten (kein Totalverlust); die Auswahl ist deterministisch und dokumentiert (0.3/2); die nicht geladene(n) Variante(n) dürfen beim unveränderten Re-Export nicht ersatzlos verschwinden, soweit technisch vermeidbar (Abschnitt 7). Kein Absturz. |
| 5.10 | Import mit mehreren Abschnitten (`w:sectPr` in der Dokumentmitte, nicht nur am Body-Ende) | Der Reader liest laut 0.1/B nur den Body-End-`sectPr`. Zu verifizieren, ob Fußzeilen aus mittleren Abschnitten überhaupt erkannt werden; mindestens der Text der wirksamen (letzten) Fußzeile darf nicht verschwinden, kein Absturz. Slug-Verweis: `mit-vorheriger-verknuepfen`. |
| 5.11 | Datei **ohne** Fußzeile, aber **mit** Kopfzeile (`Headers.docx`, `ThreeColHead.docx`) | Aktivieren/Bearbeiten der Fußzeile darf die vorhandene Kopfzeile nicht verändern/entfernen. Umgekehrt: Datei **mit** Fuß-, **ohne** Kopfzeile → Kopfzeile bleibt `null`, keine fälschlich erzeugte leere Kopfzeile. |
| 5.12 | Manueller Seitenumbruch-Versuch **innerhalb** der Fußzeile | Nicht einfügbar bzw. sinnvoll abgefangen — kein Crash, keine invalide Exportdatei. |
| 5.13 | Bild in importierter Fußzeile (0.3/1) | **Pflicht-Verifikation:** Bild muss sichtbar sein und bei Rundreise erhalten bleiben. Grund für erhöhtes Risiko: Reader liest Fußzeilen-Blöcke mit `documentRels` statt `footer1.xml.rels`. Falls Bild fehlt → Bug beheben (Fußzeilen-Part-Rels laden). |
| 5.14 | Dokument mit Kopfzeile **und** Fußzeile gleichzeitig, unterschiedlicher Text (`headerFooter.docx`, `HeaderFooter.odt`, `headfoot.odt`, `ThreeColHeadFoot.docx`, `SimpleHeadThreeColFoot.docx`) | Kopf- und Fußzeileninhalt bleiben unabhängig und korrekt zugeordnet — keine Verwechslung/Vertauschung bei Rundreise. |
| 5.15 | Fußzeile mit Unicode/Sonderzeichen (`HeaderFooterUnicode.docx`) | Zeichen bleiben bei Rundreise unverändert (keine Mojibake/Kodierungsfehler). |
| 5.16 | Cross-Format-Fußzeile mit im Zielformat nicht 1:1 abbildbarem Inhalt (z. B. spezifische DOCX-Feldart) | Mindestens reiner Text bleibt erhalten (kein stiller Totalverlust); Formatierungsverluste sind zu dokumentieren. |
| 5.17 | Fußzeile mit block-levelem Word-Inhaltssteuerelement (`w:sdt` um eine ganze `w:p`), z. B. `Bug54849.docx`, `Bug60341.docx` | **Pflicht-Verifikation (0.3/6):** Text muss erhalten bleiben. Aktueller Stand: **verifizierter Bug** — der Text verschwindet vollständig, die Fußzeile bleibt „aktiv, aber leer". Muss behoben werden (`readBodyChildren` muss `w:sdt` als Block-Container erkennen); ist ein Totalverlust und damit **kein** über Abschnitt 7 dokumentierbarer Nicht-Support, sondern ein Abnahme-Blocker. |
| 5.18 | ODT-Fußzeile, deren Absatzstil eine benannte `office:styles`-Vorlage ist statt `office:automatic-styles`, z. B. `HeaderFooter.odt` (`text:style-name="Footer"`) | Text bleibt erhalten; die daran hängende Formatierung (hier: Tab-Stopp-Positionen für Links/Mitte/Rechts) geht nach aktuellem Stand still verloren (0.1/D, 0.3/7). Als bestätigt/behoben nachzutragen oder als dokumentierte Formatierungs-Einschränkung festzuhalten (Textverlust wäre nicht zulässig, reiner Formatierungsverlust ist es gemäß Abschnitt 7). |

---

## 6. Rundreise-Anforderung (Pflicht, DOCX **und** ODT)

**Kernanforderung laut Auftrag: Datei unverändert hochladen → exportieren (ohne inhaltliche
Änderung) → erneut importieren → Fußzeileninhalt bleibt erhalten** — für DOCX **und** ODT.
Zwei getrennte, beide verpflichtende Prüfebenen (Baseline + Feature), plus Cross-Format und
unabhängige Schema-Validierung.

### 6.1 Baseline-Rundreise (Regressionsschutz — darf durch die neue UI nicht brechen)
1. Reale DOCX-Datei **ohne** Fußzeile (`NoHeadFoot.docx`) unverändert hochladen → sofort
   exportieren → reimportieren → Inhalt inhaltlich identisch, `footer` bleibt `null` (keine
   fälschlich erzeugte leere Fußzeile).
2. Reale ODT-Datei ohne Fußzeile analog (`empty.odt` bzw. `HelloWorld.odt` — beide als im Repo
   `tests/fixtures/external/odt/` vorhanden verifiziert).
3. Die vorhandenen Reader/Writer-Rundreise-Unit-Tests (0.1/G) bleiben grün.

### 6.2 Feature-Rundreise (Fußzeile über die neue UI erstellt/bearbeitet)
Für jede Situation: Fußzeile über Button/Doppelklick aktivieren, Inhalt eingeben → als DOCX
exportieren → reimportieren → Fußzeilen- **und** Hauptinhalt erhalten; **identisch** als ODT;
**zusätzlich** Cross-Format.
1. Neues Dokument → Fußzeile aktivieren → Text „Mustermann GmbH — Seite“ → DOCX-Export →
   Reimport → Text identisch in `footer`, Button wieder aktiv, Haupttext unverändert.
2. Dasselbe als ODT-Ursprungsdokument.
3. Fußzeile mit **kombinierter Formatierung** (fett **und** Textfarbe, Ausrichtung zentriert)
   → Rundreise DOCX und ODT erhält exakt diese Kombination (Parität zu Abschnitt 3, Testfall
   4/5 der Haupt-Spez.).
4. Fußzeile mit **Bild** (Logo) und mit **Tabelle**/Tabstopp-Dreiteilung → Rundreise erhält
   Struktur und Bildzuordnung (siehe 5.13).
5. Cross-Format DOCX → ODT → DOCX: Fußzeilentext bleibt über beide Konvertierungen erhalten.
6. Cross-Format ODT → DOCX → ODT (umgekehrte Richtung).
7. Dokument mit Kopfzeile **und** Fußzeile gleichzeitig (unterschiedlicher Text) → beide
   bleiben unabhängig korrekt erhalten (5.14).
8. Aus einer Fremddatei importierte Fußzeile über die UI **ergänzen** (Satz anhängen) →
   Export → Reimport zeigt den ergänzten, nicht nur den ursprünglichen Text.
9. Fußzeile über die UI komplett entfernen (#6) → Export enthält keine Fußzeilen-Referenz,
   Reimport zeigt `footer === null`.

### 6.3 „Upload unverändert“ — reale Fremddateien (Pflicht, höchste Priorität)
Im Repo liegen reale, unbearbeitete Fixtures mit echten Fußzeilen
(`tests/fixtures/external/docx/`, `.../odt/`; Herkunft Apache-POI-/ODF-Toolkit-Korpora). Sie
sind bislang **nur** über den Crash-Sweep (`external-fixtures.test.ts`) abgedeckt, **nicht**
inhaltlich. Für **jede** Datei: importieren → **ohne jede Änderung** exportieren →
reimportieren → der ursprünglich sichtbare Fußzeilentext ist unverändert wiederzufinden
(bei Cross-Format sind reine Formatierungsverluste zu dokumentieren, Textverlust ist es
nicht). **Alle folgenden Dateien wurden als im Repo vorhanden verifiziert.**

| Datei | Stresst |
|---|---|
| `docx/headerFooter.docx` | Basisfall Kopf+Fuß |
| `docx/HeaderFooterUnicode.docx` | Unicode/Sonderzeichen (5.15) |
| `docx/FancyFoot.docx` | Formatierte Fußzeile |
| `docx/ThreeColFoot.docx`, `docx/ThreeColHeadFoot.docx`, `docx/SimpleHeadThreeColFoot.docx` | Dreispaltige/komplexe Fußzeilen-Layouts (Tabstopps/Tabelle) |
| `docx/EmptyDocumentWithHeaderFooter.docx` | Leeres Dokument, **aktive** Fußzeile (5.1 / 0.1/F) |
| `docx/NoHeadFoot.docx` | Negativfall — Button muss inaktiv, `footer===null` bleiben (6.1) |
| `docx/DiffFirstPageHeadFoot.docx`, `docx/PageSpecificHeadFoot.docx` | „Erste Seite anders” / seitenspezifisch (5.9, Abschnitt 7) |
| `docx/Headers.docx`, `docx/ThreeColHead.docx` | Nur Kopfzeile — Fußzeile bleibt inaktiv, wird durch Bearbeitung nicht fälschlich erzeugt (5.11) |
| `docx/Bug54849.docx` | **Block-Level-`w:sdt` um die Fußzeilen-`w:p`** — Pflicht-Verifikation des neu gefundenen Totalverlust-Bugs (0.3/6, Grenzfall 5.17); erwarteter Text „Footer_rich_text” |
| `docx/Bug60341.docx` | Verschachteltes Block-Level-`w:sdt` **und** Seitenzahl-Feld (`PAGE`/`NUMPAGES`) in der Fußzeile — testet denselben Bug **und** Grenzfall 3.7/5.16 gemeinsam; erwarteter Text „Page 2 of 2” |
| `odt/HeaderFooter.odt`, `odt/headfoot.odt`, `odt/headerFinal.odt` | Basisfall ODT; `HeaderFooter.odt` zusätzlich Pflicht-Verifikation der `office:styles`-Formatierungslücke (0.3/7, Grenzfall 5.18) — Fußzeilenstil „Footer” mit Tab-Stopps liegt in `office:styles`, nicht `office:automatic-styles` |
| `odt/headerFirstPage.odt`, `odt/HeaderFirstPageEnabled_MSO15.odt`, `odt/HeaderFirstPageDisabled_MSO15.odt` | Erste-Seite-Variante ODT (5.9) |
| `odt/HeaderFirstAndEvenPageEnabled_MSO15.odt`, `odt/HeaderFirstAndEvenPageEnabledAndMarging_MSO15.odt` | Gerade/ungerade + erste Seite kombiniert (5.9) |
| `odt/tabellen_header_DOC_LO4-1-0.odt` | Tabelle im Kopf-/Fußbereich |

Testfälle:
1. Jede Datei: Import → **unveränderter** Export (gleiches Format) → Reimport →
   Fußzeilentext(e) inhaltlich identisch.
2. Zusätzlich Cross-Format-Export (DOCX-Fixture → ODT, ODT-Fixture → DOCX) → Reimport →
   Fußzeilentext erhalten (Formatierung darf vereinfachen).
3. **Bild in der Fußzeile:** Da das Korpus **keine** dedizierte „Bild-in-Fußzeile“-Fixture
   enthält (`headerPic.docx` ist ein **Kopfzeilen**-Bild und dient nur dem Schwester-Slug),
   ist der Bild-Rundreise-Fall über ein **im Editor selbst erstelltes** Dokument nachzuweisen
   (6.2.4) — und zusätzlich die Reader-Lücke 0.3/1 an einer Datei zu prüfen, in der ein Bild
   im Kopf-/Fußbereich über eine Part-eigene `.rels` referenziert wird.

### 6.4 Unabhängige Schema-Validierung des exportierten Fußzeilen-XML
- **ODT:** `external-validation.test.ts` (xmllint-wasm gegen `OpenDocument-v1.3-schema.rng`)
  läuft aktuell mit `footer: null` (0.3/3). Er ist um mindestens einen Export **mit
  nicht-leerer Fußzeile** zu erweitern, sodass das erzeugte `<style:footer>` gegen das
  offizielle ODF-1.3-Schema validiert.
- **DOCX:** analog über die vorhandene `docx/__tests__/external-validation.test.ts` bzw. einen
  unabhängigen OOXML-Parser (z. B. python-docx-Äquivalent) nachweisen, dass `footer1.xml` und
  die `w:footerReference`/Content-Type-/Relationship-Einträge valide sind — nicht nur durch
  den **eigenen** Reader wieder einlesbar (Abschnitt 19: Schreib-/Lesefehler dürfen sich nicht
  gegenseitig unsichtbar ausgleichen).

**Abnahmekriterium für Abschnitt 6:** Formatierungs-/Layout-Nuancen bei Cross-Format sind
dokumentierbar und akzeptabel; **das vollständige Verschwinden von Fußzeilen- oder
Haupttextinhalt ist es nicht** — weder in 6.1 noch 6.2 noch 6.3.

---

## 7. Nicht unterstützte Varianten — Deklarationspflicht

Analog `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 9/18/20.4: Was nicht unterstützt wird, ist
**explizit** zu dokumentieren, nicht stillschweigend zu verwerfen. Diese Punkte blockieren
die Abnahme des Grundfeatures (eine Fußzeile pro Dokument, DOCX+ODT, Rundreise) **nicht**,
solange sie dokumentiert bleiben und keinen unangekündigten Datenverlust verursachen.

- **„Erste Seite anders“** (DOCX `w:type="first"`, ODT abweichende Master-Page; Slug
  `erste-seite-anders`): nicht über die UI einstellbar. Mindestanforderung: mindestens eine
  Variante bleibt sichtbar/editierbar; die App macht erkennbar, dass eine abweichende erste
  Seite im Original vorhanden war, aber beim Export vereinheitlicht wird (5.9).
- **Gerade/ungerade Fußzeile** (`w:type="even"`; Slug `gerade-ungerade-anders`): ebenso, gleiche
  Mindestanforderung.
- **Mehrere Abschnitte mit je eigener Fußzeile** (`w:sectPr`-Wechsel; Slug
  `mit-vorheriger-verknuepfen`): Das Datenmodell kennt nur **eine** globale Fußzeile. Zu
  prüfen und zu dokumentieren, welche Fußzeile bei mehreren Abschnitten wirksam wird und ob
  Inhalte verloren gehen (5.10).
- **Automatische Seitenzahl/-format** (Slugs `seitenzahl-einfuegen`, `seitenzahl-format`):
  nicht Teil dieser Abnahme (Abgrenzung/3.7). Ein **bereits vorhandenes** Seitenzahl-Feld aus
  einer Fremddatei muss aber mindestens seinen Textwert über die Rundreise behalten (0.3/5) —
  kein ersatzloses Verschwinden.

Die deterministische, dokumentierte Auswahlregel bei mehreren Referenzen/Master-Pages (0.3/2)
ist Teil dieser Deklarationspflicht.

---

## 8. Testplan (Unit + E2E, Playwright)

1. **Bestehende Unit-Tests bleiben Pflicht (Regressionsschutz):** die Testblöcke „round trip:
   header, footer, and metadata“ in `docx/__tests__/roundtrip.test.ts` und
   `odt/__tests__/roundtrip.test.ts` (0.1/G) müssen grün bleiben; sie ersetzen aber **nicht**
   die folgenden UI-/E2E-Tests.
2. **Neue Fixture-Rundreise-Tests (6.3):** je Fixture aus der Tabelle ein automatisierter Test
   (Unit- oder E2E-Ebene) Import → unveränderter Export → Reimport → Fußzeilentext-Erhalt.
   Schließt die in 0.1/G / 0.2/F festgestellte Lücke (reine Crash-Prüfung → echte
   Inhaltsprüfung).
3. **E2E (Playwright), Aktivierung + Bearbeitung:** Dokument neu/öffnen → Button „Fußzeile“
   klicken (bzw. Doppelklick unterer Seitenrand) → in die Fußzeile tippen → Formatierung
   (z. B. Fett, Zentriert) → prüfen, dass Text sichtbar im Fußzeilenbereich erscheint und
   formatiert dargestellt wird; visuelle Abgrenzung zum Haupttext per DOM-Assertion.
4. **E2E, echte Rundreise:** im Anschluss echten Export auslösen (Download abfangen, Muster
   `tests/e2e/docx.spec.ts`/`odt.spec.ts`) → resultierende Datei über den echten
   Upload-Dialog reimportieren → Fußzeilentext und Formatierung weiterhin sichtbar.
5. **Pflicht-Regressionstest Selection-Sync (5.7):** Fokuswechsel Fußzeile ↔ Haupttext,
   jeweils gefolgt von Tippen, dauerhaft in der Suite (analog `selection-regression.spec.ts`).
6. **Getrennte Undo-Historien (3.5):** E2E-Nachweis, dass Strg+Z im Haupttext keine
   Fußzeilenänderung rückgängig macht und umgekehrt.
7. **Bild-in-Fußzeile (5.13/0.3/1):** dedizierter Test, dass ein importiertes/eingefügtes Bild
   in der Fußzeile sichtbar bleibt und rundreist; deckt die Fußzeilen-Part-Rels-Lücke ab.
8. **Unabhängige Schema-Validierung (6.4):** ODT- und DOCX-Export mit nicht-leerer Fußzeile
   gegen ein offizielles Schema/einen unabhängigen Parser.
9. **Cross-Format (6.2.5/6.2.6):** sowohl Unit (Reader/Writer) **als auch** E2E (Toolbar-Klick
   → echter Download → echter Re-Upload).
10. **Grenzfall-Dokumentation:** für jeden Grenzfall aus Abschnitt 5, der auf „zu
    dokumentierendes Verhalten“ verweist (5.1, 5.5, 5.6, 5.9, 5.10, 5.16, 5.18), ist das
    tatsächlich beobachtete Verhalten nach der Umsetzung hier oder im Test-Kommentar
    festzuhalten. Grenzfall 5.17 zählt **nicht** dazu — er ist ein zu behebender Bug
    (Totalverlust), keine dokumentierbare Einschränkung.
11. **Neu verifizierte Reader-Bugs (0.3/6, 0.3/7):** dedizierte Tests an `Bug54849.docx` und
    `Bug60341.docx` (Text-Erhalt statt nur „kein Crash", 5.17) sowie an `HeaderFooter.odt`
    (Tab-Stopp-Formatierung der Fußzeile, 5.18) — schließen die in 0.2/F belegte Lücke, dass
    der bestehende Crash-Sweep Inhaltsverlust nicht erkennt.

---

## 9. Definition of Done / Abnahmekriterien

Der Backlog-Status `fusszeile-bearbeiten` darf erst dann als **vorhanden** (unqualifiziert)
gelten, wenn **alle** Punkte erfüllt sind:

1. **Bedienelemente** aus Abschnitt 1 existieren und funktionieren per echter
   Playwright-Interaktion (nicht nur Command-Aufruf): Toolbar-Button (SVG-Icon),
   Doppelklick-Aktivierung am unteren Rand, sichtbar abgegrenzter Bereich, Verlassen (per Maus
   **und** per Escape/Tastatur, 3.4), Deaktivieren/Entfernen mit Bestätigung.
2. Die Layout-Entscheidung aus **Abschnitt 4** ist getroffen, dokumentiert und umgesetzt;
   Grenzfall 5.3 (mehrseitig) ist entsprechend nachgewiesen (oder die Übergangslösung (b) ist
   als Einschränkung explizit vermerkt).
3. Alle **Editierfunktionen** (Abschnitt 3.2) sind innerhalb der Fußzeile per echter
   Tastatur-/Maus-Interaktion nachgewiesen, nicht nur über konstruierte ProseMirror-JSON.
4. **Getrennte Undo-Historien** (3.5) sind nachgewiesen.
5. **Baseline-Rundreise** (6.1) ist grün und wurde durch die neue UI nicht gebrochen.
6. **Feature-Rundreise** (6.2) besteht für DOCX, ODT und beide Cross-Format-Richtungen —
   inkl. kombinierter Formatierung, Bild/Tabelle, Kopf+Fuß gleichzeitig, Entfernen.
7. **Fremddatei-Rundreise** (6.3) ist für **alle** gelisteten Fixtures grün — insbesondere
   ohne Regressions-Datenverlust bei den „erste Seite anders“-Dateien (deren Einschränkung ist
   gemäß Abschnitt 7 dokumentiert, verursacht aber keinen unangekündigten Textverlust).
8. **Unabhängige Schema-Validierung** eines Exports **mit** nicht-leerer Fußzeile (6.4) ist für
   ODT **und** DOCX grün.
9. Der **Selection-Sync-Regressionstest** (5.7) ist geschrieben, grün und dauerhaft Teil der
   Suite.
10. Die in 0.3 belegten Reader-Lücken sind befundet und je **behoben oder als bekannte,
    dokumentierte Einschränkung** festgehalten: Fußzeilen-Bild-Rels (0.3/1), deterministische
    Auswahlregel bei mehreren Referenzen/Master-Pages (0.3/2), Behandlung eines importierten
    Seitenzahl-Felds (0.3/5), ODT-Formatierung über benannte `office:styles`-Vorlagen (0.3/7,
    Grenzfall 5.18). **Ausgenommen von der Dokumentations-Option:** der Block-Level-`w:sdt`-
    Totalverlust-Bug (0.3/6, Grenzfall 5.17) ist zwingend zu **beheben** — er verliert Text,
    nicht nur Formatierung, und ist damit kein zulässiger „bekannte Einschränkung"-Ausweg.
11. **Kein stiller Fehlschlag** (Abschnitt 20.4): jede nicht unterstützte Kombination
    (Abschnitt 7) erzeugt eine sichtbare Rückmeldung **oder** ist nachweislich hier
    dokumentiert. Kein Testfall zeigt stillen Datenverlust oder eine unbehandelte
    JS-Exception in der Konsole.
12. Die Architektur verbaut ein späteres `seitenzahl-einfuegen` nicht (3.7/0.3/4), und das
    Verhältnis zum Schwester-Slug `kopfzeile-bearbeiten` (gemeinsamer Mechanismus) ist geklärt
    und konsistent umgesetzt (Abschnitt 10, Frage 5).

Andernfalls ist der Status auf **teilweise** zu setzen und die konkret fehlenden Teilpunkte
sind hier nachzutragen (analog `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 17/21).

---

## 10. Offene Fragen (vor Umsetzungsbeginn zu klären, Ergebnis hier nachtragen)

1. **Layout (Abschnitt 4):** Welche der drei Optionen — Overlay pro Seitenband (a) /
   einmalige Fußzeile als Übergang (b) / echte Pro-Seite-Container (c) — wird umgesetzt?
2. **Leere Fußzeile (5.1/0.1/F):** Bleibt eine aktivierte, aber leere Fußzeile beim Export
   erhalten oder wird sie zu `null` normalisiert — und wie wird die Import-Asymmetrie
   (`emptyParagraph()` statt `null`) konsistent aufgelöst?
3. **Auswahlregel (0.3/2):** Welche deterministische, dokumentierte Regel gilt bei mehreren
   `w:footerReference`/Master-Pages (Empfehlung: `w:type="default"`/Folgeseiten-Master
   bevorzugt, sonst die erste)?
4. **Reader-Lücken (0.3/1, 0.3/5, 0.3/6, 0.3/7):** Werden Fußzeilen-Part-Rels
   (Bilder/Hyperlinks), ein importiertes Seitenzahl-Feld und die ODT-`office:styles`-
   Formatierungslücke behoben oder als bekannte Einschränkung dokumentiert? Der
   Block-Level-`w:sdt`-Totalverlust-Bug (0.3/6) ist davon **ausgenommen** — er muss in jedem
   Fall behoben werden (siehe Definition of Done Punkt 10).
5. **Gemeinsamer Bearbeitungsmodus mit `kopfzeile-bearbeiten`:** ein gemeinsames Bedienkonzept
   (z. B. Dropdown „Kopf-/Fußzeile“) und **eine** gemeinsame Zweit-Instanz-Architektur, oder
   zwei getrennte Buttons/Editoren? (Beeinflusst Abschnitt 1, #1, und die Umsetzungsreihenfolge
   beider Priorität-1-Slugs.)
6. **Werden „erste Seite anders“/gerade-ungerade/Mehrfachabschnitte (Abschnitt 7)** in einer
   späteren Phase (eigene Slugs) nachgebaut, oder bleiben sie dauerhaft dokumentierte
   Einschränkung?

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
5. DOCX-Part-Rels-Bild-Lücke (0.A/1): NOCH OFFEN — wird mit Stufe 2 behoben (Scheibe B).
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
