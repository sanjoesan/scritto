# Anforderungsspezifikation: „Listenebene per Tab ändern" (`liste-einruecken-tab`)

Status: Laut Backlog (`specs/FEATURE-BACKLOG.md`, Zeile 158, Slug `liste-einruecken-tab`,
Titel „Listenebene per Tab ändern", Beschreibung „Tab/Umschalt+Tab verschiebt einen
Listenpunkt eine Ebene tiefer/höher.", Priorität **1 – essenziell**) als **„fehlt"**
geführt. Gemäß Aufgabenstellung gilt dieser Status als **nicht vertrauenswürdig** und
muss vollständig verifiziert werden — in beide Richtungen: (a) dass wirklich fehlt, was
als fehlend gilt, und (b) dass nicht bereits Vorhandenes fälschlich ignoriert wird. Diese
Datei ist die verbindliche Anforderung, gegen die Code-Audit + echte Browser-Bedienung +
Rundreise-Tests durchgeführt werden, bevor der Status auf „verifiziert" gehoben werden darf.

> **Wichtiger Hinweis zu dieser Fassung (überarbeitet 2026-07-05, Code Zeile für Zeile neu
> verifiziert).** Frühere Entwürfe dieser Datei beschrieben teils einen deutlich älteren
> Codestand. Der Audit unten wurde am 2026-07-05 **direkt am aktuellen Quellcode neu
> verifiziert** (jede Fundstelle gelesen). Zentrale Feststellungen:
>
> 1. Es **fehlt** ausschließlich die **Bedienung** (Tab/Umschalt+Tab-Tastenbindung,
>    `sinkListItem`, Einrück-Befehl/-Button). Das ist der Kern dieses Features.
> 2. Die Listen-**Verschachtelung im Import/Export** *für durchgehend gleichartige Ketten*
>    (DOCX `w:ilvl` lesen/schreiben, DOCX-Nummerierungsdefinitionen für alle 9 Ebenen,
>    ODT-Rekursion in beide Richtungen) ist **bereits gebaut** (siehe Codekommentare, die auf
>    `datei-oeffnen-req.md §6 Kriterium 2` verweisen). Sie muss **verifiziert**, nicht neu
>    gebaut werden.
> 3. **Neu und wesentlich (korrigiert eine Schwäche früherer Fassungen):** Eine **DOCX-Rundreise
>    einer gemischt-typigen Kette** (z. B. Aufzählung Ebene 1 / Nummeriert Ebene 2) behält den
>    **Typ je Ebene NICHT** — und zwar **unabhängig** von den zwei Reader-Restdefekten aus
>    Befund (C). Ursache ist der **Writer**: `blockToDocx` vererbt einer verschachtelten Liste
>    die **`numId` der Elternliste** (`writer.ts:134-136`), und jede `numId` verweist auf ein
>    `abstractNum`, dessen **alle 9 Ebenen denselben Typ** haben (Bullet **oder** Ordered,
>    `styleDefs.ts:64-74`). Die Typinformation kollabiert also schon **beim Schreiben** in eine
>    einheitliche `numId`; kein Reader-Fix kann das reparieren. **ODT ist davon nicht betroffen**
>    (der ODT-Writer wählt den Listenstil nach Knotentyp `LB`/`LO`, `writer.ts:101`, sodass eine
>    gemischte Kette `<text:list style="LB"> … <text:list style="LO"> …` schreibt und der Reader
>    je Stilname korrekt zurückmappt). Frühere Fassungen (5.1.2/4.7/Abnahmekriterium 4) nahmen
>    fälschlich an, die zwei Reader-Fixes genügten für die DOCX-Gemischt-Rundreise. Diese Fassung
>    korrigiert das (siehe Abschnitt 5A und die betroffenen Testfälle).
> 4. Zusätzlich bestehen zwei eng umrissene **Reader-Restdefekte** (Typ je Ebene beim
>    **Fremddatei-Import**, Befund C), eine **ODT-Darstellungslücke** (nur `text:level="1"`
>    definiert), ein **latenter DOCX-Darstellungsdefekt** in der zyklischen `%N`-Nummerierung
>    (Befund C) und ein **vorbestehender DOCX-Import-Defekt für bildreine Listenpunkte**
>    (Befund C / 4.6). Diese sind sauber getrennt von Punkt 1 zu behandeln.
>
> **Konsequenz für die Pipeline:** Alle `-code.md`/`-qa.md`-Dokumente zu diesem Slug, die noch
> behaupten „DOCX-Import liest kein `w:ilvl`", „Writer schreibt hart `w:ilvl=0`",
> „`numberingXml` definiert nur Ebene 0", „`list_item` = `paragraph block*`" **oder** „Reader-Fix
> genügt für DOCX-Gemischt-Rundreise", sind **veraltet/falsch und müssen gegen diese Fassung neu
> abgeleitet werden**, bevor gebaut wird.

Bezug:
- `specs/FEATURE-BACKLOG.md`, Zeile 158 (`liste-einruecken-tab`, „fehlt", P1) sowie die
  benachbarten, eng verwandten, aber **separaten** Slugs: Zeile 157 (`mehrstufige-liste`,
  „fehlt", P2), Zeilen 154–156 (`aufzaehlungsliste`, `nummerierte-liste`, `liste-aufheben`,
  jeweils „vorhanden", P1), Zeile 159 (`nummerierung-fortsetzen-neustarten`, „teilweise", P3).
- `E:\docs\FEATURE-SPEC-DOCX-ODT.md` Abschnitt 5 (Listen), Testfall 3 („Mehrstufige Liste …
  aktuell **nicht getestet, vermutlich nicht implementiert** — muss geprüft werden") und
  Testfall 4 („Tab/Umschalt+Tab ändert Ebene korrekt und aktualisiert die Nummerierung
  sichtbar"); Abschnitt 15, Testfall 3 (Abgrenzung Tab **außerhalb** einer Liste);
  Abschnitt 21 (Testmatrix), Zeile „Listen | teilweise (flach) | fehlt | offen".
- Stil/Methodik orientiert sich an `FEATURE-SPEC-DOCX-ODT.md` und an
  `specs/nummerierte-liste-req.md` (Vorlage für die „Code-Sichtung als zu bestätigende
  Verdachtsmomente"-Systematik).

> **Hinweis zu Zeilennummern.** Die unten genannten Zeilennummern sind der Stand vom
> 2026-07-05 und **indikativ**. Der Code wird laufend umgebaut; jede Fundstelle ist **vor der
> Umsetzung erneut am aktuellen Stand zu bestätigen** (der zu bestätigende **Sachverhalt** ist
> maßgeblich, nicht die exakte Zeile).

> **Kritische Gegenprüfung (Product Owner, 2026-07-05, unabhängig von der vorigen Überarbeitung).**
> Diese Fassung wurde als PO-Review noch einmal **eigenständig** gegen den tatsächlichen
> Quellcode geprüft (nicht nur übernommen): jede Code-Fundstelle in Abschnitt „Code-Audit"
> (Zeilenbereiche in `WordEditor.tsx`, `commands.ts`, `Toolbar.tsx`, `schema.ts`, `docx/reader.ts`,
> `docx/writer.ts`, `docx/styleDefs.ts`, `odt/reader.ts`, `odt/writer.ts`, `odt/styleRegistry.ts`,
> `index.css`), jede genannte Testfixture (`ComplexNumberedLists.docx`, `Numbering.docx`,
> `NumberingWOverrides.docx`, `NumberingWithOutOfOrderId.docx`, `listLevel10.odt`,
> `simpleList3.odt`, `liste2.odt`, `listsInTable.odt`, `simple-table-with-lists.odt`,
> `imageWithinList.odt`) und jeder zitierte Backlog-/Spec-Bezug wurde erneut direkt gelesen und
> bestätigt. Ergebnis: **alle Code- und Testfindungen der Vorfassung erwiesen sich als
> zutreffend** — insbesondere der zentrale Befund 5A (DOCX-Writer-`numId`-Vererbung kollabiert
> den Typ je Ebene, ODT-Writer nicht) und das Fehlen jeglicher Tab/Umschalt+Tab-Bindung. **Eine
> Ungenauigkeit wurde gefunden und korrigiert:** Der Abschnitt „Explizit nicht Gegenstand"
> verortete `einzugsebene-erhoehen`/`einzugsebene-verringern` fälschlich in Backlog-Bereich
> „2.4" — tatsächlich stehen beide Slugs in `specs/FEATURE-BACKLOG.md` unter „2.3
> Absatzformatierung" (Zeilen 123–124); „2.4" ist dort „Formatvorlagen (Styles)". Zusätzlich
> wurde ergänzt, dass die Backlog-**Beschreibung** dieser beiden Slugs selbst ausdrücklich auch
> den „Listenpunkt" nennt und die Abgrenzung zu dieser Datei damit **keine bereits vom Backlog
> vorgegebene Trennschärfe** ist, sondern eine hier getroffene Scope-Entscheidung, die vor dem
> Bau mit Lead/PO zu bestätigen ist (siehe Abschnitt „Explizit nicht Gegenstand").

---

## Code-Audit (verifiziert am 2026-07-05, vor Umsetzung erneut zu bestätigen)

Jede Fundstelle unten wurde am tatsächlichen Quellcode gelesen. Aufgeteilt in drei Gruppen:
**(A) tatsächlich fehlend**, **(B) bereits vorhanden**, **(C) vorhanden, aber mit konkretem
Restdefekt/Lücke**.

### (A) Tatsächlich fehlend — Kern dieses Features

| Ebene | Fundstelle | Befund |
|---|---|---|
| Tastenbindung Tab | `src/formats/shared/editor/WordEditor.tsx`, Keymap-Objekt in `keymap({…})` (ca. Z. **85–107**) | Gebunden sind `Mod-z`/`Mod-y`/`Mod-Shift-z` (93–95), `Enter: splitListItem(wordSchema.nodes.list_item)` (96), `Shift-Enter: insertHardBreak()` (97), `Mod-b/i/u` (98–100), `Shift-Delete: cutSelection(...)` (106). **Kein** `Tab`- und **kein** `Shift-Tab`-Eintrag. Danach `keymap(baseKeymap)` (108), das ebenfalls kein `Tab` bindet, `columnResizing()` (109) und `tableEditing()`, das keine eigene Tab-Keymap-Taste registriert. Folge (im Browser zu verifizieren, nach Codelage zu erwarten): Ein Tab-Tastendruck wird von ProseMirror nicht abgefangen (kein `preventDefault`) → der Browser behandelt Tab als Fokus-Navigation und der Fokus verlässt das `contenteditable`-Element. |
| Einrück-Befehl | `src/formats/shared/editor/commands.ts`, Import Zeile **2** (`wrapInList, liftListItem`) | **`sinkListItem` wird im gesamten Projekt nirgends importiert oder verwendet** (per Suche über `src/` bestätigt: kein Treffer für `sinkListItem`, `indentListItem`, `outdentListItem`). Vorhanden ist nur `liftFromList()` (62–64) → `liftListItem(wordSchema.nodes.list_item)` (Ausrücken/Entfernen) und `toggleList(ordered)` (57–60) → `wrapInList(...)`. Es existiert **keine** Funktion, die einen Listenpunkt eine Ebene tiefer verschachtelt. |
| Einrück-Button / Ausrück-Button | `src/formats/shared/editor/Toolbar.tsx`, Listen-Gruppe Zeilen **241–273** | Drei Listen-Buttons: „• Liste" (`title="Aufzählung"`, 241–251), „1. Liste" (`title="Nummerierte Liste"`, 252–262), „⇧ Liste" (`title="Liste aufheben"`, ruft `liftFromList()`, 263–273). **Kein** „Einzug erhöhen"/„Einzug verringern"-Button; **kein** `title`/`aria-label`, das Tab/Umschalt+Tab erwähnt. Anders als der Tabellen-Button (`aria-pressed={isInTable(view.state)}`) tragen die Listen-Buttons **keinen** aktiven Zustand. |
| Tests (Tastatur/Ebene) | `tests/e2e/*.spec.ts` (17 Dateien), `src/formats/{docx,odt}/__tests__/roundtrip.test.ts` | **Keinerlei** E2E-Abdeckung für Tab/Umschalt+Tab oder verschachtelte Listen über die Tastatur. Die Rundreise-Unit-Tests für Listen prüfen (zu verifizieren) überwiegend **flache** bzw. maximal 2-stufige Listen; ein Test, der eine **im Editor per Tab erzeugte** Verschachtelung prüft, kann per Definition noch nicht existieren, weil die Bedienung fehlt. |

### (B) Bereits vorhanden — muss verifiziert, nicht neu gebaut werden

| Ebene | Fundstelle | Befund |
|---|---|---|
| Schema (Nesting-Fähigkeit) | `src/formats/shared/schema.ts`, `list_item` Zeilen **146–152**; `bullet_list`/`ordered_list` **115–137** | `list_item` hat `content: '`**`block+`**`'` (147). Der Kommentar 139–145 begründet das ausdrücklich: reale ODT/DOCX-Dateien erzeugen Listenpunkte, deren einziger Inhalt eine **verschachtelte Liste** oder ein **reines Bild** ist (zitiert `listLevel10.odt`, `imageWithinList.odt`). `bullet_list`/`ordered_list` haben `content: 'list_item+'`, beide Gruppe `block`; `ordered_list` hat zusätzlich `attrs.start` (Default 1, 127). Nesting ist strukturell voll unterstützt; `sinkListItem`/`liftListItem` (reiner `NodeType`-Vergleich) arbeiten mit diesem handgeschriebenen Schema. **Nebenwirkung:** Grenzfall „Bild als einziger Inhalt eines Listenpunkts" (4.6) ist auf **Schemaebene** abgedeckt — Achtung: der DOCX-**Import** eines bildreinen Punkts hat dennoch einen eigenen Defekt, siehe (C). |
| DOCX-Import: Ebene lesen | `src/formats/docx/reader.ts`, `listMarkerFor` (ca. Z. **294–302**) | Liest **`w:ilvl` bereits aus** (`ListMarker { numId, ilvl }`; `ilvl` aus `w:pPr/w:numPr/w:ilvl`). |
| DOCX-Import: Verschachtelung aufbauen | `src/formats/docx/reader.ts`, `groupLists` (ca. Z. **379–440**) | Baut aus der flachen `<w:p>`-Folge **eine korrekt verschachtelte** `bullet_list`/`ordered_list`-Struktur mit einem Stack aus `Frame`s (je offener Ebene ein Frame; tieferes `ilvl` öffnet eine Unterliste im zuletzt hinzugefügten `list_item`, flacheres `ilvl` schließt und hängt die fertige Unterliste als weiteren Block in den `list_item`). |
| DOCX-Export: Ebene schreiben | `src/formats/docx/writer.ts`, `blockToDocx` **105–156**, `ListContext` **96–99**, `MAX_LIST_ILVL = 8` **103** | Schreibt `<w:numPr><w:ilvl w:val="${listContext.level}"/><w:numId .../></w:numPr>` (114–116); eine verschachtelte `bullet_list`/`ordered_list` innerhalb eines `list_item` erhält `level + 1` (gedeckelt auf 8) und **dieselbe `numId`** (134–136). **Genau diese `numId`-Vererbung ist der Grund für den DOCX-Gemischt-Typ-Kollaps, siehe (C) und Abschnitt 5A.** Für **gleichtypige** Ketten ist das Verhalten korrekt. |
| DOCX-Nummerierungsdefinition | `src/formats/docx/styleDefs.ts`, `numberingXml` **64–74**, Ebenen-Generatoren **50–62** | Definiert **alle 9 Ebenen** (`w:ilvl` 0–8) für Bullet **und** Ordered (`bulletLevelsXml()` 50–55, `orderedLevelsXml()` 57–62). Bullet-Glyphen zyklisch `• ◦ ▪` (43), Ordered-Formate zyklisch `decimal/lowerLetter/lowerRoman` (44–48). **Aber:** je `abstractNum` sind **alle** Ebenen vom **selben** Typ (ein Bullet-, ein Ordered-Abstract) — mit ein Grund für den Gemischt-Kollaps (Abschnitt 5A). |
| ODT-Import: Verschachtelung | `src/formats/odt/reader.ts`, `elementToBlocks` Fall `text:list` (ca. Z. **286–299**) | Rekursiert **generisch**: jedes Kind eines `text:list-item` wird erneut durch `elementToBlocks` geschickt — ein verschachteltes `text:list` erzeugt dadurch eine verschachtelte `bullet_list`/`ordered_list`. Struktur wird beim Import erhalten. |
| ODT-Export: Verschachtelung **und Typ je Ebene** | `src/formats/odt/writer.ts`, `blockToOdt` Fall `bullet_list`/`ordered_list` Zeilen **99–108** | Rekursiert **generisch** (Z. 104) und wählt den Listenstil **je Knotentyp**: `ORDERED_LIST_STYLE_NAME` (`LO`) für `ordered_list`, sonst `BULLET_LIST_STYLE_NAME` (`LB`) (Z. 101). Eine gemischte Kette schreibt daher `<text:list style="LB"> … <text:list style="LO"> …`. Beim Reimport mappt der Reader je Stilname korrekt (`LB`→bullet, `LO`→ordered). **Folge: ODT erhält bei der Rundreise Typ UND Tiefe je Ebene — anders als DOCX (Abschnitt 5A).** Keine Writer-Änderung nötig. |
| Bestehende Rundreise-Unit-Tests | `src/formats/docx/__tests__/roundtrip.test.ts`, `src/formats/odt/__tests__/roundtrip.test.ts` | Es existieren (zu verifizieren) **grüne** 2-Ebenen-Rundreisetests je Format, die den Tiefenerhalt einer gleichtypigen verschachtelten Liste belegen. Sie sind der Ausgangs-Beleg für Befund (B) und dürfen beim Ausbau nicht überschrieben, sondern nur ergänzt werden. |
| E2E-Datei-Existenz | `tests/e2e/large-document-import.spec.ts` u. a. | Existiert (die Suite umfasst 17 Spec-Dateien). Ein früherer Vermerk, diese Datei existiere nicht („nur 4 Dateien vorhanden"), ist **veraltet** und darf nicht als offener Punkt übernommen werden. |

### (C) Vorhanden, aber mit konkretem Restdefekt/Lücke — mitzubauen bzw. bewusst zu entscheiden

| Ebene | Fundstelle | Befund / Restdefekt |
|---|---|---|
| **DOCX-Export: Typ-Kollaps bei gemischten Ebenen** | `src/formats/docx/writer.ts`, `blockToDocx` **134–136**; `styleDefs.ts`, `numberingXml` **64–74** | **Der zentrale, neu bestätigte Befund.** Eine verschachtelte Liste erbt die **`numId` der Elternliste** und erhöht nur `w:ilvl`. Eine gemischte Kette Bullet(ilvl0)→Ordered(ilvl1) wird daher mit **einer einzigen `numId`** (der Bullet-`numId`) geschrieben; deren `abstractNum` ist auf **jeder** Ebene `numFmt="bullet"`. **Folge: Nach DOCX-Rundreise fällt die nummerierte Unterebene auf Bullet zurück — Tiefe bleibt, Typ je Ebene geht verloren.** Kein Reader-Fix kann das heilen, weil die Typinformation bereits **beim Schreiben** kollabiert. Entscheidung/Behandlung: Abschnitt 5A. **Betrifft NICHT den Kernfall Tab** (dort ist jede Kette durchgehend gleichtypig, 4.7). |
| DOCX-Import: Ebenen-Typ | `src/formats/docx/reader.ts`, `parseNumberingXml` Zeilen **78–98** | Liest je `w:abstractNum` **nur das erste** `<w:lvl>` (`firstChildNS(abstractEl, …, 'lvl')`, 84) und leitet daraus **einen einzigen** Bullet/Ordered-Typ für die gesamte `numId` ab (Rückgabe `Map<string,'bullet'|'ordered'>`). `groupLists` fragt `kindByNumId.get(numId)` **ohne** Ebenenbezug. **Folge:** Eine Fremddatei, die innerhalb **derselben** `numId` auf Ebene 0 Bullet und auf Ebene 1 Decimal verwendet (z. B. `ComplexNumberedLists.docx`), verschachtelt zwar die Tiefe korrekt, weist aber **beiden Ebenen denselben Typ** zu. **Restdefekt für die Import-Anzeige gemischter Typen** — verbessert die **Import**-Darstellung, hat aber **keinen** Einfluss auf die DOCX-Rundreise (dafür siehe Writer-Kollaps oben). |
| ODT-Import: Ebenen-Typ | `src/formats/odt/reader.ts`, `parseAutomaticStyles`/`listKinds` Zeilen **70–75** | `hasNumber = childElements(listStyleEl, …, 'list-level-style-number').length > 0` (73) prüft nur, ob **irgendwo** im `text:list-style` ein Number-Level vorkommt — **unabhängig vom `text:level`-Attribut** — und setzt daraus **einen** Typ pro Stilname. `elementToBlocks` fragt `styles.listKinds.get(styleName)` ohne Ebenenbezug. **Analoger Import-Anzeige-Restdefekt** wie DOCX für gemischte Typen je Ebene (betrifft z. B. `listLevel10.odt`). Betrifft **nur den Fremddatei-Import**, nicht die ODT-Eigenrundreise (die über getrennte Stilnamen `LB`/`LO` korrekt läuft, Befund B). |
| ODT-Listenstil-Definition | `src/formats/odt/styleRegistry.ts`, `listStyleDefs` Zeilen **98–103** | `BULLET_LIST_STYLE_NAME` (`LB`) / `ORDERED_LIST_STYLE_NAME` (`LO`) definieren jeweils nur **eine** Ebene `text:level="1"`. Für `text:level="2"` und tiefer existiert **keine** Aufzählungszeichen-/Einzugs-Definition. Wie LibreOffice/Word eine referenzierte, aber auf undefinierter Ebene stehende Liste darstellen, ist **nicht aus dem Code ableitbar** und mit echter Zielanwendung zu prüfen (4.10). Die **eigene** Rundreise (Reader zählt Ebene über XML-Verschachtelungstiefe, nicht über den Stil) ist davon **nicht** betroffen — die Lücke ist rein visuell/interoperabel. |
| DOCX-Nummerierung: Einzug/Start je Ebene + **`%N`-Fehlreferenz** | `src/formats/docx/styleDefs.ts`, Ebenen-Generatoren **44–62** | (a) Die erzeugten `<w:lvl>` enthalten `w:numFmt` und `w:lvlText`, aber **kein** `<w:pPr><w:ind …/>` (Einzug je Ebene) und **kein** `<w:start>`/`<w:lvlJc>`. In Word/LibreOffice ist die per-Ebene-Einrückung eines exportierten DOCX daher ggf. **nicht sichtbar** (nur die zyklischen Symbole unterscheiden die Ebenen). (b) **Latenter Darstellungsdefekt:** `ORDERED_FORMATS` (44–48) setzt `lvlText` zyklisch `%1./%2./%3.` per `ilvl % 3` (59). Ab `ilvl ≥ 3` referenziert `%N` damit den Zähler einer **flacheren** Ebene (ilvl 3 → `%1.` = Ebene-0-Zähler) statt des eigenen — tief verschachtelte **nummerierte** Listen zeigen in Word ggf. eine falsche Nummer. Für die **Editor-Darstellung** greift dagegen die kumulative CSS-Einrückung. Zu entscheiden/dokumentieren, ob (a) für den Basis-Scope genügt; (b) ist als eigenständiger Audit-Fund zu beheben oder zu ticketieren (3.9, 4.10). |
| DOCX-Import: bildreiner Listenpunkt | `src/formats/docx/reader.ts`, `paragraphToBlocks`/`readBodyChildren` (Marker-Zuordnung) | Ein `<w:p>`, dessen **einziger** Inhalt ein Bild ist, wird zu einem `image`-Block (nie `paragraph`). Die Listen-Marker-Zuordnung hängt den `numId/ilvl`-Marker aber **nur an `paragraph`-Blöcke** — ein bildreiner Listenpunkt fällt beim **DOCX-Import** aus der Liste heraus. **Vorbestehender Defekt**, unabhängig von Tab, aber im Grenzfall 4.6 zu belegen und als eigenes Ticket zu führen (nicht stillschweigend als „durch Schema abgedeckt" abhaken). |
| Editor-CSS je Ebene | `src/index.css` Zeilen **63–67** | `.ProseMirror ul, .ProseMirror ol { padding-left: 1.4em; margin: 0 0 0.6em; }` — ein einziger Nachfahren-Selektor. `padding-left` **addiert sich pro Verschachtelungsebene**; zusätzlich greift das User-Agent-Stylesheet des Browsers (Symbol-/Zählerwechsel je Tiefe). Keine explizite Regel für Word-Verbundformat („1.1"). Für „sichtbar unterscheidbar" (3.9) genügt das nach Codelage; zu verifizieren. |
| `ordered_list.attrs.start` bei Rundreise | `schema.ts:127`, `docx/writer.ts`, `odt/writer.ts` | Das Schema trägt `start`, aber die Writer erzeugen **keine** ebenenspezifische Startwert-/Neustart-Kodierung. **Für dieses Feature nur am Rande relevant** (Startwert/Neustart gehört zu `nummerierung-fortsetzen-neustarten`); hier nur zu beachten, falls ein Zurückstufen-Testfall (5.x) versehentlich Startwert-Erwartungen mitprüft. |

### Zusammenfassung des Befunds

„fehlt" ist für die **Bedienfunktion** (Tab/Umschalt+Tab) korrekt und der Kern dieses
Features. Die zum Rundreise-Erhalt einer **gleichtypigen** verschachtelten Liste nötige
**Import-/Export-Maschinerie ist dagegen bereits vorhanden** (DOCX beidseitig ebenengenau,
ODT beidseitig über generische Rekursion) und muss **verifiziert**, nicht neu gebaut werden.
Für ein vollständig abnahmefähiges Feature sind daher zu bauen bzw. zu entscheiden:

1. **Tastenbindung `Tab`/`Shift-Tab` + `sinkListItem`-Befehl** (der eigentlich fehlende Teil),
   inkl. korrektem No-Op-/Fokus-Schutz-Verhalten und Abgrenzung zu Nicht-Listen-Kontexten.
2. **Maus-/Screenreader-Alternative** (Einrück-Button), zwingend nötig wegen des durch das
   Abfangen von Tab entstehenden „Tab-Trap"-Risikos (4.15).
3. **Entscheidung zur DOCX-Rundreise gemischt-typiger Ebenen** (Abschnitt 5A). Der **Writer**
   kollabiert den Typ je Ebene in eine einheitliche `numId` — das ist **nicht** durch einen
   Reader-Fix behebbar. Entweder (Option A) dokumentabhängiges `numbering.xml` generieren
   (großer Umbau, im Kern `mehrstufige-liste`) oder (Option B, empfohlen) als **dokumentierte
   Einschränkung** akzeptieren und die DOCX-Gemischt-Rundreise-Testfälle entsprechend fassen.
   **ODT** erhält die gemischten Typen bereits (Befund B) und wird voll geprüft.
4. **Behebung der zwei Reader-Ebenen-Typ-Restdefekte** (C, DOCX `parseNumberingXml` + ODT
   `listKinds`) — nötig, damit gemischt-typige **Fremddateien** beim **Import** den Typ je
   Ebene korrekt anzeigen. **Wichtig:** diese Reader-Fixes verbessern die **Import-Anzeige**,
   nicht die DOCX-**Rundreise** (Punkt 3).
5. **Entscheidung/Behebung der ODT-Ebene-2+-Stildefinition** (`listStyleDefs`), der
   DOCX-per-Ebene-Einrückung und der **`%N`-Fehlreferenz** — als bewusst dokumentierte
   Einschränkung akzeptabel bzw. gezielt zu beheben (3.9, 4.10).
6. **Belegen (und ticketieren) des vorbestehenden DOCX-Import-Defekts für bildreine
   Listenpunkte** (C / 4.6).

Ein Bau, der nur Punkt 1 umsetzt, ließe Tab im Editor sichtbar funktionieren **und** wäre
für gleichtypige (Tab-typische) Listen bereits rundreisefähig in **beiden** Formaten — die
verbleibenden Punkte betreffen ausschließlich **gemischte Typen** und die **visuelle
Ausgestaltung tieferer Ebenen**.

---

## 1. Ziel

Nutzer:innen können den/die aktuell selektierten Listenpunkt(e) einer Aufzählungs- oder
nummerierten Liste per **Tab** eine Ebene tiefer verschachteln und per **Umschalt+Tab** eine
Ebene höher zurückstufen (bzw. bei der obersten Ebene ganz aus der Liste herausnehmen) —
konsistent in Editor-Darstellung, DOCX-Export und ODT-Export. Die erreichte Ebene bleibt bei
jeder Rundreise (Import → Export, Export → Re-Import, Cross-Format) strukturell vollständig
erhalten; für **gleichtypige** Ketten bleibt zusätzlich der Listentyp erhalten (bei
**gemischt-typigen** Ketten formatabhängig, siehe Abschnitt 5A).

### Explizit nicht (alleiniger) Gegenstand dieser Anforderung

Folgende, im Backlog separat geführte Punkte werden hier **nur so weit mitbehandelt, wie sie
zwingende Voraussetzung** für ein rundreisefähiges Tab/Umschalt+Tab sind:

- **`mehrstufige-liste`** (Zeile 157, „fehlt", P2): „Verschachtelte Gliederungsebenen mit
  **unterschiedlichem Symbol/Nummernformat je Ebene**." Diese Datei fordert nur, dass eine
  Ebenenänderung **strukturell** korrekt und **rundreisefähig** ist und dass tiefere Ebenen
  **irgendein** optisch unterscheidbares Merkmal zeigen. Insbesondere gehört die **volle
  DOCX-Rundreise gemischt-typiger Ebenen** (die einen dokumentabhängigen `numbering.xml`-Neubau
  erfordert, Abschnitt 5A Option A) bewusst zu `mehrstufige-liste`, sofern nicht ohnehin
  mitgelöst.
- **`nummerierung-fortsetzen-neustarten`** (Zeile 159, „teilweise") und der
  `ordered_list.attrs.start`-Startwert: unabhängig von der Einzugsebene, hier nicht Gegenstand.
- **`eigene-aufzaehlungszeichen` / `eigenes-nummernformat`** (Zeilen 160–161, „fehlt"):
  frei definierbare Symbole/Zahlenformate — nicht Gegenstand.
- **`einzugsebene-erhoehen` / `einzugsebene-verringern`** (Bereich „2.3 Absatzformatierung"
  [**korrigiert** — eine frühere Fassung dieser Datei verortete die beiden Slugs fälschlich in
  „2.4"; „2.4" ist tatsächlich der Bereich „Formatvorlagen (Styles)", nicht Absatzformatierung],
  **nicht** „2.6 Listen"): Die Backlog-**Beschreibung** selbst lautet „Rückt den
  **Absatz/Listenpunkt** eine Stufe weiter ein" bzw. „… aus" — sie nennt also ausdrücklich auch
  den **Listenpunkt** und zieht die Grenze zu dieser Datei **nicht** trennscharf. Für diese
  Anforderung gilt dennoch die Arbeitsannahme: `einzugsebene-erhoehen`/`-verringern` decken den
  **allgemeinen Absatz-Einzug** (cm/Punkt-Einrückung an normalem Fließtext, unabhängig vom
  Listenkontext) ab, **nicht** identisch mit der listenspezifischen Ebenenänderung dieser Datei —
  auch wenn dieselbe physische Taste (Tab) außerhalb einer Liste konventionell einen Tabstopp
  einfügt. Diese Abgrenzung ist eine **Scope-Entscheidung dieser Datei**, keine bereits im
  Backlog eindeutig vorgegebene Trennung; sie ist vor dem Bau mit Lead/PO zu bestätigen, falls
  `einzugsebene-erhoehen`/`-verringern` stattdessen (auch) als Alias für die listenspezifische
  Tab-Funktion verstanden werden soll. Beide Funktionen dürfen sich, wie auch immer final
  gegeneinander abgegrenzt, nicht gegenseitig überschreiben (siehe 2.5 und 4.17).
- **`tabulator-zeichen`** (Bereich „Sonderelemente", „teilweise"): Verhalten der Tab-Taste
  **außerhalb** eines Listenkontexts. Diese Datei fordert nur die **Abgrenzung** (Tab darf im
  Listenkontext kein Tab-Zeichen einfügen, außerhalb darf die neue Listen-Tab-Logik nicht
  greifen), nicht die vollständige Tabstopp-Spezifikation.

Da alle vier „Listen"-Slugs (`aufzaehlungsliste`, `nummerierte-liste`, `liste-aufheben`,
`liste-einruecken-tab`) auf **denselben** Schema-Knoten (`bullet_list`/`ordered_list`/
`list_item`) arbeiten, wird die Ebenenänderung **nicht** isoliert verifiziert — die Testfälle
prüfen bewusst auch das Zusammenspiel mit Erzeugen (Bullet/Nummeriert), Aufheben und
Enter/Split.

---

## 2. Menüpunkte / Bedienelemente

| # | Bedienelement | Ort | Ist-Zustand (verifiziert 2026-07-05) | Soll |
|---|---|---|---|---|
| 1 | Tastenkombination **Tab** im Listenkontext | Globale Editor-Keymap, `WordEditor.tsx` `keymap({…})` (ca. 85–107) | **Nicht vorhanden.** Keine `Tab`-Bindung; `sinkListItem` nirgends importiert. Tab verlässt nach Codelage den Editor-Fokus. | Neuer Keymap-Eintrag `Tab: <einrücken>`, der (a) im Listenkontext den/die selektierten Listenpunkt(e) per `sinkListItem(wordSchema.nodes.list_item)` eine Ebene tiefer verschachtelt und die Taste **konsumiert** (kein Fokuswechsel), und (b) außerhalb eines Listenkontexts `false` zurückgibt, sodass `keymap` an die nächste Bindung bzw. das `tabulator-zeichen`-Verhalten durchreicht. |
| 2 | Tastenkombination **Umschalt+Tab** im Listenkontext | Globale Editor-Keymap | **Nicht vorhanden.** | Neuer Keymap-Eintrag `'Shift-Tab': <ausrücken>`, der `liftListItem(wordSchema.nodes.list_item)` anwendet: verschachtelter Punkt (Ebene ≥ 2) → genau eine Ebene ausrücken; Punkt der obersten Ebene (Ebene 1) → komplett aus der Liste entfernen (identisch zum Button „Liste aufheben"). Konsumiert die Taste im Listenkontext, gibt außerhalb `false` zurück. |
| 3 | Bestehender Button „⇧ Liste" / „Liste aufheben" | `Toolbar.tsx:263–273` | Vorhanden, ruft `liftFromList()` → `liftListItem(list_item)`. | **Bleibt bestehen** als Maus-/Klick-Alternative. Zu verifizieren, dass sich Button und `Shift-Tab` bei Ebene 1 **identisch** verhalten (beide entfernen die Liste) und bei Ebene ≥ 2 **identisch** (beide rücken eine Ebene aus — da beide dieselbe `liftListItem`-Funktion aufrufen). Empfehlung: Button unverändert lassen; ggf. `title`/`aria-label` um „(Umschalt+Tab)" ergänzen (siehe #7). |
| 4 | Neuer Button „Einzug erhöhen" (Listenebene) | Vorschlag: Toolbar, direkt vor „⇧ Liste" | **Nicht vorhanden.** | **Zwingende** Maus-/Touch-/Screenreader-Alternative zu Tab (ruft denselben `sinkListItem`-Befehl auf), weil das Abfangen von Tab die native Tastatur-Fokus-Navigation aus dem Editor blockiert (Tab-Trap, 4.15). Falls bewusst nicht gebaut, muss ein anderer Tastatur-Fluchtweg aus dem Editor existieren und die Einschränkung dokumentiert sein — nicht stillschweigend fehlen. |
| 5 | Tab **außerhalb** eines Listenkontexts (normaler Absatz/Überschrift/leere Tabellenzelle ohne Liste) | — | Keine Bindung, vermutlich Fokus-Verlust. | Muss gemäß `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 15 Testfall 3 bzw. `tabulator-zeichen` unverändert bleiben — die neue Tab-Bindung darf diesen Fall **nicht** als Listenkontext fehlinterpretieren (Command gibt `false` zurück, siehe 4.4/4.17). |
| 6 | Tab in einer Tabellenzelle (mit `tableEditing()`) | Tabellen-Navigation (Backlog, Bereich Tabellen) | `tableEditing()` bindet **keine** eigene Tab-Taste; die in `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 6 geforderte Zellen-Tab-Navigation ist laut Backlog noch nicht gebaut → aktuell **kein** Konflikt. | Solange die Zellen-Tab-Navigation fehlt, muss die neue Listen-Tab-Logik in einer **Liste innerhalb einer Zelle** korrekt nur die Listenebene ändern (nicht in die Nachbarzelle springen). Sobald **beide** Funktionen existieren, ist die Rangfolge zu definieren — für diese Datei genügt es, den aktuellen Stand mit einem Test zu belegen und den künftigen Konflikt zu dokumentieren (4.5). |
| 7 | Sichtbarer Hinweis auf die Tastenkombination (`title`/`aria-label`) | Button „Liste aufheben" bzw. neuer „Einzug erhöhen"-Button | Kein `title`, der Tab/Umschalt+Tab erwähnt. | `title`/`aria-label` sollten die Taste nennen (z. B. „Einzug erhöhen (Tab)", „Liste aufheben / Einzug verringern (Umschalt+Tab)"). |
| 8 | Kontextmenü (Rechtsklick) | — | Projektweit kein eigenes Kontextmenü. | Kein Soll-Bestandteil dieser Anforderung. |

---

## 3. Gewünschtes Verhalten im Detail

### 3.1 Tab bei einem Listenpunkt mit vorherigem Geschwister-Punkt
Steht der Cursor in einem Listenpunkt, der **nicht** der erste Punkt seiner (Unter-)Liste ist,
verschachtelt Tab diesen Punkt unter den unmittelbar vorherigen Geschwister-Punkt
(`sinkListItem`-Semantik). Der vorherige Punkt wird zum „Elternpunkt", der aktuelle Punkt
rutscht eine Ebene tiefer in eine neu entstehende bzw. bestehende Unterliste **desselben Typs**
(Bullet bleibt Bullet, Nummeriert bleibt Nummeriert — siehe 4.7).

### 3.2 Tab beim allerersten Punkt einer Liste
Der erste Punkt einer (Unter-)Liste hat keinen vorherigen Geschwister-Punkt, unter den er
verschachtelt werden könnte. Tab muss hier **sichtbar nichts tun** (No-Op) — insbesondere darf
der Fokus **nicht** aus dem Editor herausspringen (Regressionsschutz gegen das heutige
Default-Verhalten, siehe Audit A und 4.1). Da `sinkListItem` in diesem Fall intern kein
`dispatch` auslöst, darf dabei **kein** leerer Undo-Schritt entstehen (siehe 3.8). Der Editor
muss den Tastendruck dennoch als „im Listenkontext behandelt, nur wirkungslos" betrachten und
konsumieren, nicht als „außerhalb einer Liste" durchreichen.

### 3.3 Cursor mitten im Text eines Listenpunkts
Tab wirkt **unabhängig von der genauen Cursor-Position innerhalb des Punkt-Texts** (Listen-Ebene
ist eine Block-, keine Zeicheneigenschaft). Es ist **nicht** erforderlich, dass der Cursor am
Anfang des Punkts steht.

### 3.4 Selektion über mehrere Listenpunkte
Eine Selektion, die zwei oder mehr Listenpunkte (teilweise) einschließt, verschiebt **alle**
davon über die von `sinkListItem`/`liftListItem` ermittelte `NodeRange` erfassten Punkte
gemeinsam eine Ebene.

### 3.5 Umschalt+Tab bei einem Punkt der obersten Ebene (Ebene 1)
Analog zum Button „Liste aufheben": Der/die betroffenen Punkte verlassen die Liste **komplett**
und werden zu normalen Absätzen — Text und Zeichenformatierung (Fett, Farbe, …) bleiben
vollständig erhalten, nur das Aufzählungszeichen/die Nummerierung verschwindet. Verhalten muss
**identisch** zum bestehenden `liftFromList()`-Pfad sein (gleicher `liftListItem`-Code).

### 3.6 Umschalt+Tab bei einem verschachtelten Punkt (Ebene ≥ 2)
Der Punkt wird **nur eine** Ebene höher gestuft (wird Geschwister der Elternebene), bleibt aber
Teil der Liste — das Aufzählungszeichen/die Nummerierung verschwindet **nicht**, höchstens
dessen optische Darstellung ändert sich (3.9/3.10).

### 3.7 Zusammenspiel mit Enter (`splitListItem`)
Ein per Enter am Ende eines Punkts entstehender neuer Listenpunkt
(`Enter: splitListItem(wordSchema.nodes.list_item)`) erbt dieselbe Verschachtelungstiefe wie der
Ausgangspunkt. Tab/Umschalt+Tab müssen auf einem so neu entstandenen Punkt **unmittelbar**
genauso funktionieren wie auf einem „alten" Punkt.

### 3.8 Undo/Redo
Jede tatsächlich wirksame Tab-/Umschalt+Tab-Aktion erzeugt genau **einen** Undo-Schritt. Eine
wirkungslose Tab-Aktion (3.2) erzeugt **keinen** (leeren) Undo-Schritt, da `sinkListItem` bei
No-Op gar nicht dispatcht. Mehrere aufeinanderfolgende Tab-Drücke werden **nicht** zu einem
History-Eintrag zusammengefasst (jede Ebenenstufe einzeln rückgängig machbar, 4.12).

### 3.9 Sichtbare Darstellung je Ebene
- **Editor:** Die kumulative CSS-Einrückung (`index.css:63–67`, `padding-left` addiert sich je
  `ul`/`ol`) plus der User-Agent-Symbolwechsel je Tiefe müssen eine tiefere Ebene **sichtbar**
  von der Elternebene unterscheidbar machen. Zu verifizieren und zu dokumentieren, ob das
  genügt oder ob explizite `list-style-type`-Regeln nötig sind.
- **Nummerierte Liste (Editor):** Eine verschachtelte `<ol>` beginnt ohne explizite CSS-Counter-
  Kette browserseitig bei einer **eigenen** Zählung ab „1." (kein Word-Verbundformat „1.1").
  **Mindestanforderung:** Die tiefere Ebene zeigt **irgendeine** von der Elternebene
  unterscheidbare Nummerierung.
- **Exportierte Datei:** Der DOCX-Export liefert per zyklischer Symbole (Befund B) bereits ein
  pro-Ebene-unterschiedliches Format; jedoch fehlt der per-Ebene-**Einzug** im `<w:lvl>`/`w:ind`
  und die nummerierte Tiefe leidet unter der **`%N`-Fehlreferenz** ab Ebene ≥ 4 (Befund C) — in
  Word/LibreOffice ist die Tiefe daher ggf. nur am Symbol erkennbar, nummerierte tiefe Ebenen
  ggf. falsch nummeriert. Für ODT fehlen die Stildefinitionen ab `text:level="2"` (Befund C,
  4.10). Ergebnis in einer echten Zielanwendung zu prüfen und hier zu dokumentieren.

### 3.10 Aktualisierung nach jeder Aktion
Sowohl die sichtbare Einrückung als auch das Aufzählungszeichen/die Nummerierung müssen
**unmittelbar** nach Tab/Umschalt+Tab aktualisiert dargestellt werden (deckt sich mit
`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 5 Testfall 4).

### 3.11 Fokus-/Selektionserhalt
Nach Tab/Umschalt+Tab bleibt der Fokus im Editor, die Cursor-Position/Selektion bleibt
inhaltlich am selben Text (auch wenn sich die absolute Dokumentposition verschiebt) — kein
Sprung an Anfang/Ende des Dokuments oder des Punkts.

### 3.12 Zusammenspiel mit Zeichenformatierung
Fett/Kursiv/Farbe usw. innerhalb des Punkt-Texts bleiben von einer Ebenenänderung vollständig
unberührt.

### 3.13 Rundreise-Grundprinzip (Übersicht, Details in Abschnitt 5)
Eine im Editor per Tab erzeugte Verschachtelungstiefe muss beim Export nach DOCX **und** nach
ODT als eine vom Reader wieder korrekt erkennbare, gleich tiefe Verschachtelung zurückkommen.
Nach Audit B ist diese Maschinerie für **gleichtypige** Ketten bereits vorhanden — der Kern
dieser Rundreise-Anforderung ist deshalb zunächst **Verifikation**. Der **Listentyp je Ebene**
bleibt bei einer Rundreise erhalten:
- **ODT:** immer (Writer wählt den Stil je Knotentyp, Befund B) — auch bei gemischten Ketten;
- **DOCX:** nur, solange die Kette **durchgehend gleichtypig** ist. Bei **gemischten** Ketten
  kollabiert der Typ je Ebene beim Schreiben in eine einheitliche `numId` (Befund C, Abschnitt
  5A) — das ist **kein** Reader-Fehler und **nicht** durch die Reader-Fixes behebbar.

---

## 4. Grenzfälle

1. **Erster Punkt einer (Unter-)Liste, Tab gedrückt:** No-Op, Fokus bleibt im Editor (3.2) —
   kritischer Regressionstest gegen das heutige Herausspringen des Fokus. Muss **vor** dem Bau
   nachweislich rot laufen (Fokus verlässt Editor) und **nach** dem Bau grün.
2. **Sehr tiefe Verschachtelung (wiederholtes Tab):** OOXML definiert `w:ilvl` 0–8 (9 Ebenen);
   der DOCX-Writer deckelt bereits auf `MAX_LIST_ILVL = 8` (`writer.ts:103/135`). Zu
   entscheiden/dokumentieren, ob der **Editor-Befehl** ebenfalls hart bei 9 Ebenen deckelt
   (Tab auf tiefster Ebene = No-Op, Taste dennoch konsumiert) oder unbegrenzt erlaubt (dann
   greift beim Export die Writer-Deckelung, aber ODT `listStyleDefs` kennt ohnehin nur Ebene 1,
   siehe 4.10). Empfehlung: Editor-seitig konsistent auf 9 Ebenen deckeln, mindestens aber
   **kein Crash / kein undefiniertes `w:ilvl`** erzeugen.
3. **Umschalt+Tab auf einen Ebene-1-Punkt mit tiefer eingerückten Kind-Punkten:** Mit Testfall
   zu belegen, was mit den Kindern geschieht, wenn ihr Elternpunkt die Liste verlässt (nach
   `liftListItem`-Semantik betrifft ein Cursor ohne Mehrfachselektion normalerweise nur den
   einen Punkt; dessen Kinder blieben als eigene Unterliste zurück). Ergebnis **konkret
   festhalten**, nicht annehmen.
4. **Tab bei gemischter Selektion (Listenpunkte + normale Absätze):** `sinkListItem` findet über
   `$from.blockRange` nur einen Bereich mit `list_item`-Elternknoten. Zu verifizieren, ob die
   Funktion bei gemischter Selektion `false` (No-Op) zurückgibt oder nur den Listen-Teil erfasst
   — Ergebnis mit Testfall dokumentieren. (Erwartung nach Codelage: Der Command **konsumiert**
   die Taste, da der Anker `$from` in einem `list_item` liegt, `sinkListItem` findet aber keinen
   passenden `blockRange` → wirkungslos ohne dispatch. „Konsumiert, aber No-Op" ist ein
   zulässiges, zu dokumentierendes Ergebnis.)
5. **Liste innerhalb einer Tabellenzelle** (Fixtures `listsInTable.odt`,
   `simple-table-with-lists.odt`), Cursor in einem solchen Punkt, Tab gedrückt: Für den
   aktuellen Stand (keine Zellen-Tab-Navigation) muss verifiziert werden, dass nur die
   Listenebene geändert wird (kein Zellsprung). Künftige Rangfolge dokumentieren (2.6).
6. **Bild als einziger Inhalt eines Listenpunkts, Tab gedrückt:** Muss wirken, da die Ebene eine
   Blockeigenschaft des `list_item` ist. **Auf Schemaebene bereits abgedeckt** (`list_item` =
   `block+`, Audit B) — hier zu verifizieren, dass `sinkListItem`/`liftListItem` mit einem
   bildreinen Punkt nicht abbrechen. **Zusätzlich zu belegen und zu ticketieren:** der
   **vorbestehende DOCX-Import-Defekt** (Befund C), durch den ein bildreiner Listenpunkt beim
   DOCX-Import aus der Liste fällt — dies ist ein eigener Fehler, nicht durch das Schema geheilt.
7. **Gemischte Listentypen über Ebenen hinweg:** `sinkListItem` erzeugt strukturell immer eine
   Unterliste **desselben** Typs wie die aktuelle Liste — ein Typwechsel je Ebene ist **kein**
   automatisches Tab-Ergebnis und außerhalb des Scopes (`mehrstufige-liste`). Der **reine
   Tab-Kernfall** ist damit stets **gleichtypig** und in beiden Formaten voll rundreisefähig.
   **Aber:** Wird eine reale Fremddatei mit **echt gemischten** Ebenentypen importiert (z. B.
   Bullet Ebene 1 / Decimal Ebene 2 in `ComplexNumberedLists.docx`, `listLevel10.odt`), greifen
   zwei getrennte Effekte:
   - beim **Import** die Reader-Ebenen-Typ-Restdefekte (Befund C) → die Behebung ist
     Voraussetzung, damit die tiefere Ebene **beim Import** korrekt angezeigt wird;
   - bei der **DOCX-Rundreise** zusätzlich der **Writer-Typ-Kollaps** (Befund C, Abschnitt 5A) →
     dieser ist durch den Reader-Fix **nicht** behebbar. **ODT** ist von beidem für die
     Rundreise nicht betroffen (Befund B).
   Zusätzlich zu verifizieren: Tab/Umschalt+Tab auf einer gemischt-typigen importierten Liste
   stürzt nicht ab und verliert keinen Text.
8. **Reale Fremddatei mit bereits mehrstufiger Liste importieren**
   (`ComplexNumberedLists.docx`; `listLevel10.odt`, `simpleList3.odt`, `liste2.odt`): Nach
   Audit B **erhalten** DOCX- **und** ODT-Import die Verschachtelungstiefe bereits — zu
   **verifizieren** (nicht als „muss erst gebaut werden"). Für den **Typ je Ebene** gilt der
   Import-Restdefekt aus 4.7/Befund C. Ergebnis je Datei hier nachtragen (Tiefe erhalten? Typ je
   Ebene beim Import korrekt?).
9. **DOCX-Export einer im Editor per Tab erzeugten (gleichtypigen) verschachtelten Liste:** Nach
   Audit B wird `w:ilvl` je Tiefe korrekt geschrieben und `numberingXml()` definiert alle 9
   Ebenen — zu **verifizieren**. Zu prüfen/dokumentieren: fehlende per-Ebene-`w:ind`-Einrückung
   und die **`%N`-Fehlreferenz** ab Ebene ≥ 4 bei nummerierten Listen (Befund C) — genügt die
   zyklische Symbolunterscheidung, oder sind per-Ebene-Einzug und `%N`-Fix nachzuziehen?
10. **ODT-Export einer verschachtelten Liste:** Die XML-**Struktur** entsteht korrekt
    (verschachteltes `<text:list>`, Typ je Ebene über `LB`/`LO` erhalten); die referenzierten
    Stile (`listStyleDefs`) definieren aber nur `text:level="1"`. Mit echter Zielanwendung
    (LibreOffice/Word) zu verifizieren, wie eine Ebene ohne Eintrag für `text:level="2"`+
    dargestellt wird (Fallback? kein Symbol?). **Mindestens** muss die eigene Rundreise (Reader
    zählt Ebene über Verschachtelungstiefe) die Ebene 2 strukturell erhalten. Ergebnis
    dokumentieren bzw. `listStyleDefs` um Ebene 2–9 ergänzen.
11. **Undo/Redo einer einzelnen Tab-Aktion:** Ein Schritt macht genau eine Ebenenänderung
    rückgängig; Redo stellt sie wieder her.
12. **Schnelle Tab-Tab-Tab-Folge:** Jede Ebenenstufe einzeln per Undo rückgängig machbar, kein
    Zusammenfassen mehrerer Tab-Drücke zu einem History-Eintrag.
13. **Tab unmittelbar nach Enter** (frisch per Enter erzeugter, evtl. leerer Punkt): Muss
    genauso funktionieren wie bei einem „alten" Punkt (3.7), kein Sonderfall.
14. **Zusammenspiel mit dem Selection-Sync-Bug** (`FEATURE-SPEC-DOCX-ODT.md` Abschnitt 2): Alles
    auswählen → Fett anwenden → per Klick neu positionieren → Tab drücken → weitertippen. Zu
    verifizieren, dass der bekannte Bug-Pfad auch mit Tab als Folgeaktion **nicht** zu
    Inhaltsverlust führt (der Fix `reconcileSelectionOnClick` liegt in `WordEditor.tsx`).
15. **Tab-Trap für reine Tastaturnutzer:innen (Barrierefreiheit):** Sobald Tab im Editor
    abgefangen wird, kann eine Nutzer:in ohne Maus den Editor per Tab nicht mehr verlassen,
    solange der Cursor in einem Listenpunkt steht — derselbe Kompromiss wie in
    Word/LibreOffice/Google Docs. Muss als **bewusste, dokumentierte Einschränkung** samt
    vorhandenem Alternativweg (Maus-Button #4 und/oder anderer Tastatur-Fluchtweg) festgehalten
    werden, nicht als übersehene Lücke.
16. **Sehr lange, tief verschachtelte Liste (Stresstest):** Kein spürbares Einfrieren bei
    wiederholtem Tab, kein Performance-Einbruch bei Export/Import; keine Konsolenfehler.
17. **Tab außerhalb jedes Listenkontexts:** Verhalten unverändert zu `tabulator-zeichen`; die
    neue Listen-Tab-Logik darf hier **nicht** greifen (Command erkennt den Nicht-Listen-Fall
    und gibt `false` zurück). Siehe 2.5 und `FEATURE-SPEC-DOCX-ODT.md` Abschnitt 15 Testfall 3.
18. **Verhältnis Button „Liste aufheben" ↔ Umschalt+Tab:** Da beide dieselbe `liftListItem`-
    Funktion aufrufen, verhalten sie sich bei jeder Ebene identisch (Ebene 1: entfernen;
    Ebene ≥ 2: eine Ebene ausrücken). Zu bestätigen, dass keine zwei divergierenden Codepfade
    entstehen; jede bewusste Abweichung ist zu begründen und mit Testfall zu belegen.

---

## 5. Rundreise-Anforderung (verbindlich)

Grundsatz für **jede** Kombination: Inhalt (Datei bzw. im Editor per Tab erzeugt) mit einer
mehrstufigen Liste **unverändert** exportieren → erneut importieren → Ebenen (Tiefe), Text und
— nach Maßgabe von Abschnitt 5A — Listentyp (Bullet/Nummeriert) an exakt derselben Stelle
weiterhin identisch, kein sonstiger Inhaltsverlust. Jeder Datei-Kreislauf ist über **echten**
Upload (`filechooser`/`setInputFiles`) und **echten** Download
(`page.waitForEvent('download')` + Lesen der Datei) zu prüfen, nicht nur über intern
aufgerufene Reader/Writer-Funktionen.

### 5A. Kernentscheidung: DOCX-Rundreise **gemischt-typiger** Ebenen (Korrektur früherer Fassungen)

**Sachverhalt (am Code hergeleitet, siehe Kopf-Hinweis Punkt 3 und Befund C).** Frühere
Fassungen dieser Datei nahmen an, die Behebung der zwei **Reader**-Ebenen-Typ-Restdefekte
genüge, damit eine **gemischt-typige** Kette (z. B. Aufzählung Ebene 1 / Nummeriert Ebene 2)
Typ **und** Tiefe über eine Rundreise behält. Das ist **für ODT richtig, für DOCX aber falsch**:

- **ODT:** `blockToOdt` wählt den Stilnamen nach **Knotentyp** (`LB`/`LO`). Eine gemischte
  Verschachtelung schreibt `<text:list style="LB"> … <text:list style="LO"> …`; beim Reimport
  mappt der Reader je Stilname korrekt → **Typ + Tiefe bleiben erhalten** (schon ohne die
  Reader-Fixes). **ODT-Gemischt-Rundreise ist damit voll gefordert und erreichbar.**
- **DOCX:** `blockToDocx` behält für eine verschachtelte Liste die **`numId` der Elternliste**
  und erhöht nur `w:ilvl`. Eine gemischte Kette wird daher mit **einer einzigen `numId`**
  geschrieben, deren `abstractNum` auf **jeder** Ebene denselben Typ trägt → beim Reimport fällt
  die abweichend-typige Unterebene auf den Typ der obersten Ebene zurück. **Tiefe bleibt, Typ je
  Ebene geht verloren.** Der Reader-Fix allein kann das **nicht** heilen, weil die
  Typinformation bereits beim **Schreiben** in eine gleichförmige `numId` kollabiert. Das
  statische Zwei-`abstractNum`-Schema (je eins durchgängig Bullet / durchgängig Ordered) kann
  eine Bullet-Ebene-0/Decimal-Ebene-1-Kette unter **einer** `numId` prinzipiell nicht kodieren.

**Optionen für DOCX-Gemischt:**
- **Option A (voll konform, großer Umbau):** In `writer.ts` **pro Dokument** ein
  `numbering.xml` generieren — je oberster Liste eine `numId` mit einem `abstractNum`, dessen
  `<w:lvl>`-Typen der **tatsächlichen** Typkette der Verschachtelung entsprechen. Das ist im
  Kern **`mehrstufige-liste`-Arbeit** und dort zu verorten.
- **Option B (empfohlen, korrekt gescoped):** Statisches Schema **behalten**; die
  Reader-Fixes (4.7/Befund C) dennoch umsetzen, weil sie die **Import-Anzeige** gemischter
  Fremddateien verbessern. **Explizit dokumentieren**, dass eine **DOCX-Rundreise einen
  Ebenen-Typwechsel nicht erhält** (nur Tiefe + Typ der obersten Ebene). Der **Kernfall (Tab,
  gleicher Typ je Kette)** ist voll rundreisefähig, weil dort nie ein Typwechsel auftritt.

**Verbindliche Festlegung dieser Anforderung:** Für den **Feature-Kern** (Tab/Umschalt+Tab,
stets gleichtypige Ketten) ist die volle Typ-**und**-Tiefe-Rundreise in **beiden** Formaten
Pflicht. Für **gemischt-typige** Ketten gilt:
- **ODT:** Typ + Tiefe müssen erhalten bleiben (Pflicht, Testfälle 5.2.2).
- **DOCX:** **Option B** ist die Vorgabe dieser Datei — Tiefe + Typ der obersten Ebene erhalten,
  Typ-Kollaps der Unterebenen als **bewusst dokumentierte Einschränkung** (verortet in
  `mehrstufige-liste`). Ein Wechsel zu Option A ist eine **Lead/PO-Entscheidung** und würde den
  Aufwand nach `mehrstufige-liste` verschieben. **Die DOCX-Gemischt-Rundreise-Testfälle (5.1.2)
  prüfen daher Tiefe + oberste Ebene und halten den Typ-Kollaps als erwarteten Befund fest**,
  statt fälschlich vollen Typerhalt zu erwarten.

### 5.1 DOCX
1. **Eigenrundreise, 2-stufig (gleichtypig):** Bullet-Liste mit 3 Punkten, zweiten Punkt per Tab
   eine Ebene tiefer → als DOCX exportieren → reimportieren → Punkt 2 bleibt verschachtelter
   Unterpunkt von Punkt 1 (nicht gleichrangiger dritter Punkt), Typ + Text unverändert. (Nach
   Audit B zu erwarten; explizit zu verifizieren.)
2. **Eigenrundreise, 3-stufig, gemischt Bullet/Nummeriert (Option B):** Verschachtelungs-**Tiefe
   3** und **Typ der obersten Ebene** erhalten. Der **Typ-Kollaps der Unterebenen** ist gemäß
   5A als erwartete Einschränkung zu belegen und zu dokumentieren — **nicht** als voller
   Typerhalt zu erwarten. (Falls Lead/PO Option A wählt: dann voller Typerhalt und Verortung in
   `mehrstufige-liste`.)
3. **Zurückstufen (Umschalt+Tab) vor Export:** Punkt auf Ebene 3 anlegen (gleichtypig), einmal
   auf Ebene 2 zurückstufen, exportieren, reimportieren → Ebene bleibt 2 (nicht 3, nicht 1).
4. **Reale Fremddatei `ComplexNumberedLists.docx`** importieren → unverändert exportieren →
   reimportieren → alle ursprünglichen Ebenen (Tiefe) über beide Zyklen erhalten; Typ je Ebene
   beim **Import** gemäß Reader-Behebung 4.7, bei der **Rundreise** gemäß 5A dokumentiert.
5. **Cross-Format:** Im Editor erzeugte mehrstufige Liste als ODT exportieren, dann als DOCX
   weiter (bzw. ODT-Fremddatei mit mehrstufiger Liste → als DOCX) → Ebenen (Tiefe) über den
   Formatwechsel erhalten; Typerhalt gemäß 5A (DOCX-Zielformat = Option B).
6. **Weitere reale Fremddateien** (`Numbering.docx`, `NumberingWOverrides.docx`,
   `NumberingWithOutOfOrderId.docx`) probeweise importieren/exportieren, um die Behebung nicht
   nur an einer Datei zu verifizieren; Ergebnis je Datei dokumentieren.

### 5.2 ODT
1. **Eigenrundreise, 2-stufig (gleichtypig):** wie 5.1.1, als ODT. (Nach Audit B über die
   generische Rekursion zu erwarten; zu verifizieren.)
2. **Eigenrundreise, 3-stufig, gemischt:** ODT-Variante — **Typ je Ebene UND Tiefe erhalten**
   (Pflicht, funktioniert über die getrennten Stilnamen `LB`/`LO`, Befund B). Dies ist der
   Nachweis, dass ODT — anders als DOCX (5A) — die gemischte Kette rundreisefähig hält.
3. **Zurückstufen vor Export:** wie 5.1.3, ODT.
4. **Reale Fremddatei** (`listLevel10.odt`, `simpleList3.odt`, `liste2.odt`) importieren →
   unverändert exportieren → reimportieren → Ebenen (Tiefe) erhalten. Der entscheidende
   Nachweis, dass die generische ODT-Rekursion tatsächlich hält; Typ je Ebene beim **Import**
   gemäß Reader-Behebung (ODT `listKinds`).
5. **Cross-Format:** DOCX-Fremddatei mit mehrstufiger Liste → als ODT → Ebenen erhalten; ins
   ODT-Zielformat bleibt der Typ je Ebene erhalten.
6. **Sichtprüfung tieferer Ebenen mit echter Zielanwendung** (LibreOffice, sonst unabhängiger
   ODF-Parser): Ergebnis von 4.10 (undefinierter `text:list-style` für Ebene 2+) konkret mit der
   reimportierten Datei dokumentieren.

### 5.3 Doppelte Rundreise / Cross-Format hin und zurück
1. DOCX mit im Editor per Tab erzeugter 3-stufiger (gleichtypiger) Liste → Export ODT → Import →
   Export DOCX → alle drei Ebenen an exakt derselben Textstelle erhalten.
2. Dieselbe Prüfung mit Startpunkt ODT.
3. **Gemischt-typige Cross-Format-Kette:** ODT-Gemischt → DOCX → dokumentierter Typ-Kollaps
   (5A); ODT-Gemischt → ODT (über DOCX zurück) → Nachweis, dass allein der DOCX-Zwischenschritt
   den Typ kollabiert, nicht der ODF-Pfad.

---

## 6. Testfälle (Zusammenfassung, E2E über echte Browser-Bedienung — Pflicht)

Da aktuell **keinerlei** Test Tab/Umschalt+Tab prüft, sind die folgenden Fälle neu zu schreiben.
Die Rundreise-**Struktur**-Fälle können teils bereits heute grün sein (Audit B) — genau das ist
der Verifikationszweck; sie dürfen nicht als „schon abgedeckt" übersprungen werden.

1. Bullet-Liste (3 Punkte) anlegen, echten `Tab` auf Punkt 2 → Punkt 2 als verschachtelter
   Unterpunkt sichtbar (verschachteltes `<ul>` im `<li>` von Punkt 1), Fokus bleibt im Editor.
2. Tab auf dem allerersten Punkt → keine sichtbare Änderung, Fokus bleibt im Editor
   (Regressionstest, 4.1). Muss vor dem Bau rot, danach grün sein.
3. Umschalt+Tab auf Ebene-2-Punkt → wird Ebene 1, bleibt Listenelement (3.6).
4. Umschalt+Tab auf Ebene-1-Punkt → verlässt die Liste komplett, wird `<p>`, Text erhalten (3.5)
   — Ergebnis identisch zu einem Klick auf „⇧ Liste" auf demselben Punkt (4.18).
5. Enter am Ende eines Ebene-2-Punkts, dann Tab auf den neuen Punkt → funktioniert wie bei einem
   „alten" Punkt (3.7/4.13).
6. Undo direkt nach Tab → Ebene zurückgesetzt; Redo stellt Verschachtelung wieder her (4.11).
7. Mehrfaches Tab in schneller Folge → jede Stufe einzeln per Undo rückgängig (4.12).
8. Regressionstest analog `tests/e2e/selection-regression.spec.ts`, aber mit Tab als
   auslösendem Schritt nach Fett + Klick-Neupositionierung (4.14).
9. Import `ComplexNumberedLists.docx` → Ebenen (Tiefe) sichtbar erhalten; Typ je Ebene **beim
   Import** nach Behebung 4.7 korrekt (4.8).
10. Import `listLevel10.odt` und `simpleList3.odt` → Ebenen sichtbar erhalten.
11. Vollständige Rundreisetests je Format (5.1/5.2) über echten Upload/Download.
12. Cross-Format-Rundreise (5.3): einmal DOCX→ODT→DOCX, einmal ODT→DOCX→ODT.
13. Tab außerhalb eines Listenkontexts → Verhalten unverändert, keine versehentliche Einrückung
    (4.17).
14. Liste in Tabellenzelle (`listsInTable.odt` bzw. im Editor angelegte Tabelle mit Liste), Tab
    gedrückt → Ergebnis gemäß 4.5 dokumentiert, kein Zellsprung.
15. Selektion über mehrere Listenpunkte, Tab → alle erfassten Punkte gemeinsam eine Ebene tiefer
    (3.4).
16. Gemischte Selektion (Listenpunkte + normaler Absatz), Tab → Ergebnis gemäß 4.4 dokumentiert
    („konsumiert, aber No-Op").
17. Sichtprüfung/Screenshot-Vergleich: mehrstufige Liste im Editor vs. nach Export → Re-Import.
18. Unabhängige Validierung der Exportdatei (ohne den eigenen Reader): DOCX auf korrekte
    `w:ilvl`-Werte je Absatz (Regex/`DOMParser` auf `word/document.xml`, ergänzend `python-docx`
    einmalig manuell); ODT auf verschachtelte `text:list`-Elemente im `content.xml`.
19. **Gemischt-typige Rundreise (Bullet Ebene 1 / Nummeriert Ebene 2):**
    - **ODT** → Typ **und** Tiefe je Ebene erhalten (Pflicht, muss grün sein);
    - **DOCX** → Tiefe + oberste Ebene erhalten; Typ-Kollaps der Unterebene als **erwarteter,
      dokumentierter** Befund geprüft (Option B, 5A) — der Test **darf keinen** vollen Typerhalt
      für DOCX erwarten.
20. Tiefen-Deckelung (4.2): 10× Tab auf denselben Punkt → keine undefinierte Ebene, kein Crash,
    kein `w:ilvl` > 8 im Export; Ergebnis (harte Deckelung bei 9 Ebenen oder Writer-seitige
    Klemmung) dokumentiert.
21. **Bildreiner Listenpunkt:** (a) im Editor einen bildreinen Listenpunkt anlegen, Tab drücken
    → `sinkListItem` bricht nicht ab (4.6); (b) Fremddatei/erzeugte DOCX mit bildreinem
    Listenpunkt importieren → belegen, ob der Punkt in der Liste bleibt; der vorbestehende
    DOCX-Import-Defekt (Befund C) ist als eigenes Ticket festzuhalten, nicht zu übergehen.
22. **`%N`-Fehlreferenz (4.9):** nummerierte Liste ≥ 4 Ebenen tief exportieren → im
    `word/numbering.xml`/`document.xml` prüfen, ob die tiefen Ebenen die richtige Zähler-Referenz
    tragen; Ergebnis (Fix umgesetzt oder als bekannter Defekt dokumentiert) festhalten.

---

## 7. Abnahmekriterien (Definition of Done)

Der Status darf erst als „verifiziert" gelten, wenn **alle** folgenden Punkte erfüllt sind:

1. **Tab/Umschalt+Tab gebaut:** `sinkListItem`/`liftListItem` in der Keymap gebunden, mit
   korrektem No-Op-Verhalten ohne Fokusverlust (4.1) und korrekter Abgrenzung zu
   Nicht-Listen-Kontexten (4.17). Der Regressionstest 6.2 lief **vor** dem Bau nachweislich rot
   und **danach** grün.
2. **DOCX-Import-Verschachtelung verifiziert:** `w:ilvl` wird gelesen und die Tiefe korrekt in
   die interne Struktur abgebildet (bereits vorhanden, Audit B — durch Test **bestätigt**, nicht
   angenommen).
3. **DOCX-Export-Verschachtelung verifiziert:** `w:ilvl` wird je Tiefe geschrieben und
   `numberingXml()` definiert die nötigen `w:lvl`-Einträge für alle zulässigen Ebenen (bereits
   vorhanden, Audit B — durch Test bestätigt). Entscheidung zur fehlenden per-Ebene-`w:ind`-
   Einrückung und zur **`%N`-Fehlreferenz** (Befund C) dokumentiert (akzeptiert oder behoben).
4. **Reader-Ebenen-Typ-Restdefekte behoben (Import-Anzeige):** DOCX `parseNumberingXml` und ODT
   `listKinds` ordnen den Bullet/Ordered-Typ **je Ebene** zu (nicht mehr nur je `numId`/
   Stilname), sodass gemischt-typige Ebenen aus realen Fremddateien **beim Import** korrekt
   angezeigt werden — mit eigenem, grünem Regressionstest. **Klar abgegrenzt festgehalten**,
   dass dies die **Import-Anzeige** verbessert, aber die **DOCX-Rundreise** nicht (Kriterium 4b).
4b. **DOCX-Gemischt-Rundreise-Entscheidung dokumentiert (5A):** Der Writer-Typ-Kollaps ist als
    bewusste Einschränkung (Option B) belegt und in `mehrstufige-liste` verortet — **oder** per
    Lead/PO-Beschluss Option A umgesetzt. Der Testfall 6.19-DOCX erwartet **keinen** vollen
    Typerhalt, sondern prüft Tiefe + oberste Ebene + dokumentierten Kollaps. **ODT-Gemischt-
    Rundreise (6.19-ODT/5.2.2) ist voll grün** (Typ + Tiefe).
5. **ODT-Ebene-2+-Darstellung geklärt:** Mit LibreOffice oder unabhängigem ODF-Validator geprüft,
   wie tiefere Ebenen ohne `listStyleDefs`-Eintrag dargestellt werden (4.10); Ergebnis
   dokumentiert — entweder als ausreichend bestätigt oder durch Ergänzung der
   `text:list-level-style-*`-Einträge (Ebene 2–9) behoben.
6. **Alle Testfälle aus Abschnitt 6 vorhanden und grün** (E2E, echte Browser-Bedienung).
7. **Vollständige Rundreise-Matrix (5.1/5.2/5.3) bestanden** für DOCX **und** ODT, inklusive der
   realen Fixtures (`ComplexNumberedLists.docx`, `listLevel10.odt`, `simpleList3.odt`), über
   echten Upload/Download; DOCX-Gemischt gemäß 5A/Option B.
8. **Jeder Grenzfall (4.1–4.18) einzeln geprüft** und das tatsächliche Verhalten festgehalten —
   insbesondere 4.15 (Tab-Trap/Barrierefreiheit): entweder durch Maus-/Screenreader-Weg (#4)
   bzw. einen anderen Tastatur-Fluchtweg entschärft oder bewusst als Einschränkung akzeptiert,
   nicht unentschieden offen.
9. **Abgrenzung zu `mehrstufige-liste` im Backlog vermerkt:** Diese Datei liefert die
   strukturelle, rundreisefähige Ebenenänderung (voller Typerhalt für gleichtypige Ketten in
   beiden Formaten; für gemischte Ketten ODT voll, DOCX gemäß 5A); die feinabgestimmte optische
   Ausgestaltung (Word-Verbundformat, per-Ebene-Einzug, ODT-Ebene-2+-Feinstil) **und die volle
   DOCX-Gemischt-Rundreise** bleiben bewusst dem separaten Slug vorbehalten, soweit hier nicht
   ohnehin mitgelöst.
10. **Kein stiller Fehlschlag:** Keine Bedienaktion (Tab/Umschalt+Tab/Button) bleibt sichtbar
    wirkungslos, ohne dass das gewollt (No-Op-Grenzfall) und dokumentiert ist.
11. **Kein während Verifikation/Umsetzung gefundener Fehler bleibt ohne Ticket/Vermerk** —
    insbesondere (a) die veralteten Annahmen aus früheren `-code.md`/`-qa.md`-Dokumenten sind
    korrigiert, bevor gegen sie gebaut/getestet wird; (b) der **DOCX-Writer-Typ-Kollaps** (5A),
    (c) die **`%N`-Fehlreferenz** und (d) der **DOCX-Import-Defekt bildreiner Listenpunkte**
    (4.6/Befund C) sind je als Ticket/Vermerk festgehalten.

---

## 8. Umsetzungsstand (2026-07-09) — Status: **teilweise**

**Umgesetzt und verifiziert** (Unit 703/703 gesamt, davon 9 neue in
`liste-einruecken.test.ts`; E2E `liste-einruecken.spec.ts` 23 passed / 1 skipped über
Desktop Chrome + Mobile + Tablet):

- **Kern (Audit A):** `Tab` → `indentListItem()` (sinkListItem), `Umschalt+Tab` →
  `outdentListItem()` (liftListItem) in der Editor-Keymap. Konsumieren-Semantik exakt
  nach §3.2: im Listenkontext wird die Taste IMMER konsumiert (auch als sichtbarer
  No-Op beim ersten Punkt — kein Fokus-Sprung, und da sinkListItem dann nicht
  dispatcht, kein leerer Undo-Schritt); außerhalb von Listen geben beide `false`
  zurück und Tab verlässt wie bisher den Editor (E2E-belegt in beide Richtungen).
- **§2 #4:** neuer Toolbar-Button „Einzug erhöhen (Tab)" (`→ Liste`, aria-label
  „Einzug erhöhen") als Maus-/Touch-/Screenreader-Alternative und Fluchtweg-Ausgleich
  für das Tab-Abfangen; außerhalb von Listen deaktiviert statt stiller No-Op. §2 #7:
  Titel des bestehenden Buttons um „/ Einzug verringern (Umschalt+Tab)" ergänzt.
- **§3.5:** Umschalt+Tab auf Ebene 1 ist per Unit-Test BYTE-identisch zu
  `liftFromList()` (gleiche Transaktion).
- **§5.1/§5.2 (gleichtypige Ketten, Verifikation):** per Tab erzeugte Ebene-2 übersteht
  DOCX- (mit `w:ilvl="1"`-Roh-Beleg) und ODT-Rundreise (echt verschachtelte
  `text:list`) über echten Download/Re-Upload; DOCX-Unit-Rundreise für bullet UND
  ordered ergänzt (das ODT-Pendant bestand bereits in `odt/__tests__/roundtrip.test.ts`).
- **§3.8:** Undo je Stufe einzeln — auf Desktop Chrome und Mobile E2E-belegt; auf dem
  WebKit-Tablet-Projekt verschmilzt die History unter Testtempo Gruppen trotz
  600ms-Trennung (Testkommentar dokumentiert den Skip; Nutzertempo ist unbetroffen,
  die Granularität ist engine-unabhängige PM-Logik).

**Nachtrag (gleicher Abend): BEIDE Reader-Ebenen-Typ-Restdefekte (Befund C Zeilen 2+3,
Zusammenfassungs-Punkt 4) BEHOBEN** — damit ist die Reader-Hälfte von §5A Option B komplett:

- **DOCX:** `parseNumberingXml` liest jetzt JEDES `<w:lvl>` (numId → ilvl → Typ; dünn
  definierte tiefe Ebenen erben Ebene 0), `groupLists` fragt den Typ je (numId, ilvl) ab.
  Fremddatei mit Bullet-Ebene-0/Decimal-Ebene-1 in EINER numId importiert typrichtig je
  Ebene (synthetischer Word-Nachbau in `docx/__tests__/mixed-list-import.test.ts`).
- **ODT:** `listKinds` ist jetzt Stilname → (text:level → Typ) aus allen
  `list-level-style-bullet|-number|-image`-Einträgen; verschachtelte `text:list` OHNE
  eigenes style-name erben den Stil der äußeren Liste, ihre 1-basierte Ebene wählt den
  Eintrag (dünn definierte Ebenen fallen auf Ebene 1 zurück — die eigene LB/LO-Rundreise
  bleibt dadurch unverändert). Synthetischer LO-Nachbau in
  `odt/__tests__/mixed-list-import.test.ts`.

Der **Writer** behält vorgabegemäß sein statisches Schema (§5A Option B).

**Bewusst OFFEN (Status bleibt „teilweise", je als Vermerk gemäß Abnahmekriterium 11):**

- **(b) 5A DOCX-Writer-Typ-Kollaps:** gemischt-typige Ketten (Bullet↔Nummeriert je
  Ebene) kollabieren beim DOCX-Export weiterhin in die numId der äußersten Liste —
  gemäß §5A **Option B** die verbindliche Vorgabe dieser Datei (Option A = Lead/PO-
  Entscheidung, verortet in `mehrstufige-liste`); ODT nicht betroffen.
- **(c) `%N`-Fehlreferenz** in der zyklischen Nummerierungsdefinition ab Ebene ≥ 4 —
  unverändert.
- **(d) DOCX-Import bildreiner Listenpunkte** — unverändert (vorbestehend).
- **ODT-Darstellung ab `text:level="2"`** (Befund C/4.10): Stildefinitionen weiterhin
  nur für Ebene 1; die Rundreise-STRUKTUR ist unberührt (E2E-belegt), nur die optische
  Feindarstellung in LibreOffice bleibt Ebene-1-artig. Zusammen mit dem
  Word-Verbundformat dem Slug `mehrstufige-liste` zugeordnet (Abnahmekriterium 9).
