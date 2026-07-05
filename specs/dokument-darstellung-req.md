# Anforderungsspezifikation: Dokument-Basisdarstellung — A4-Seitenansicht, Zoom, Responsiveness

Status: **Fundament / Voraussetzung.** Diese Fähigkeit hat Vorrang vor allen weiteren
Zeichen-/Absatz-Features (Nutzer-Vorgabe 2026-07-05: „Bevor wir Features bauen, müssen
wir Dokumente ordentlich A4 usw. darstellen können … Responsiveness am Handy muss
gegeben sein"). Slug: `dokument-darstellung` (überschneidet sich fachlich mit dem Backlog-
Eintrag `seitenlayout-ansicht`, Prio 1; dieser Eintrag ist der verbindliche Umfang für die
Basisdarstellung).

Geltungsbereich: die **visuelle Basisdarstellung** eines geöffneten DOCX-/ODT-Dokuments im
gemeinsamen Editor (`src/formats/shared/editor/`), unabhängig vom konkreten Inhaltstyp.
Konkret: (1) echte, seitenbasierte A4-Ansicht, (2) Zoom, (3) **mobile Responsiveness ohne
horizontales Überlaufen**, (4) automatisierte Rendering-Tests gegen die vorhandenen
Beispieldokumente. **Nicht** Teil dieses Tickets: neue Bearbeitungs-Features (Fett, Farben,
Tabellen-Ops …) — die kommen erst danach.

Stil/Gliederung wie `E:\docs\FEATURE-SPEC-DOCX-ODT.md`. Zeilennummern sind Wegweiser, per
`grep`/Symbolname neu zu verifizieren.

---

## 0. Verifizierter Ist-Stand (Code-Recherche, 2026-07-05)

| Ebene | Fundstelle | Tatsächlicher Inhalt |
|---|---|---|
| A4-Geometrie | `src/formats/shared/pageGeometry.ts` | A4 `210×297 mm`, Rand `25 mm` (2,5 cm) — einzige Quelle der Wahrheit, geteilt mit den Format-Writern |
| mm→px | `editor/pageLayout.ts:5` | `PX_PER_MM = 96/25.4`; `PAGE_WIDTH_PX ≈ 794`, `PAGE_HEIGHT_PX ≈ 1123`, `PAGE_MARGIN_PX ≈ 94` |
| Seiten-„Blätter" | `editor/pageLayout.ts:23-31` | `pageBackgroundStyle()`: repeating-linear-gradient, malt weiße „Seiten"-Bänder + graue „Lücken"-Bänder **hinter** den fortlaufenden Editor-Inhalt (eine durchgehende `contentEditable`-Fläche, kein echtes Blatt pro Seite) |
| Seitenumbruch | `editor/pagination.ts` | misst je Top-Level-Block die gerenderte Höhe (`getBoundingClientRect`), fügt an Umbruchstellen ein Spacer-Widget (`page-break-spacer`, Höhe `PAGE_GAP_PX`) via Decoration ein. Ein Block höher als eine Seite läuft über (kein Intra-Block-Split — ProseMirror-Single-View-Grenze) |
| Editor-Layout | `editor/WordEditor.tsx:187-195` | äußerer Container `flex-1 overflow-auto … flex justify-center py-8`; darin ein Blatt-`div` mit **fester** `width: PAGE_WIDTH_PX`, `padding: PAGE_MARGIN_PX`, `pageBackgroundStyle()`, `shadow-lg`; darin die `.ProseMirror`-Fläche |
| Zoom | — | **Existiert nicht** (kein Treffer für `zoom`/`scale(` in `src`) |
| Responsiveness | `WordEditor.tsx:187-195` | **Keine** Media-Query, **kein** Fit-to-Width, **keine** Skalierung. Auf einem ~390 px breiten Handy überläuft das 794-px-Blatt → horizontaler Scroll, Blatt ragt rechts aus dem Sichtfeld. **Bestätigter Hauptmangel.** |
| Toolbar | `editor/Toolbar.tsx` | `role="toolbar"`, `flex flex-wrap` — bricht um, aber sehr viele Buttons; auf schmalem Handy mehrzeilig, Tap-Ziele klein (zu bewerten) |
| Beispieldokumente | `tests/fixtures/external/docx/` (**127**), `tests/fixtures/external/odt/` (**202**) | 329 reale Fremddateien (Apache-POI-/ODF-Toolkit-Korpora) |
| Fixture-Tests heute | `src/formats/{docx,odt}/__tests__/external-fixtures.test.ts` | prüfen nur **Import ohne Absturz auf Datenebene** (jsdom, `readDocx`/`readOdt`), **nicht** das tatsächliche Rendern/Anzeigen im Editor und **nicht** die Seitendarstellung/Responsiveness |

**Fazit Ist-Stand:** Die Seitensimulation (Bänder + Umbruch-Spacer) ist eine brauchbare
Näherung, aber (a) es gibt **keinen Zoom**, (b) die Darstellung ist **nicht mobil-tauglich**
(festes 794-px-Blatt überläuft), und (c) es gibt **keinen** Test, der das echte Rendern der
329 Beispieldokumente oder das Nicht-Überlaufen auf dem Handy absichert.

---

## 1. Bedienelemente / Menüpunkte (Soll)

| # | Element | Anforderung |
|---|---|---|
| 1 | **Zoom-Steuerung** (Toolbar oder eigene Statusleiste unten) | Sichtbare Bedienung: „−" / Prozentanzeige / „+", plus „An Breite anpassen" (Fit-to-Width) und „100 %" (Originalgröße). Prozentanzeige zeigt den aktuellen Zoom. Muss per Maus **und** Touch bedienbar sein (Tap-Ziele ≥ 32 px). |
| 2 | **Zoom-Tastenkürzel** | `Strg/Cmd +`, `Strg/Cmd −`, `Strg/Cmd 0` (100 %) — solange der Editor fokussiert ist; wo möglich das Browser-eigene Seitenzoom nicht auslösen (falls nicht abfangbar, dokumentieren). |
| 3 | **Seitenansicht** | Der Inhalt wird als A4-Blatt/-Blätter mit korrekten Rändern (2,5 cm), sichtbarem Blattrand/Schatten und sichtbarer Lücke zwischen den Seiten dargestellt (echte „Seitenansicht", nicht randlos). |
| 4 | **Automatische Fit-to-Width auf schmalen Viewports** | Ohne Nutzeraktion: ist der verfügbare Platz schmaler als ein A4-Blatt (Handy/enger Tablet-Hochkant), wird das Blatt automatisch auf die verfügbare Breite skaliert, sodass **kein** horizontaler Scroll nötig ist. |

---

## 2. Gewünschtes Verhalten im Detail

### 2.1 A4-Seitenansicht
- Das Dokument erscheint als eine oder mehrere A4-Seiten im Verhältnis **210:297** mit
  Rand **2,5 cm** (aus `pageGeometry.ts`, nicht neu hartkodieren).
- Seitengrenzen sind **sichtbar**: weißes Blatt, dezenter Schatten, deutliche Lücke
  zwischen aufeinanderfolgenden Seiten (bestehender `PAGE_SEPARATOR_PX`-Ansatz zulässig,
  darf verbessert werden).
- Läuft der Inhalt über eine Seite hinaus, entsteht optisch eine **weitere** Seite
  (Seitenumbruch); die Paginierung (`pagination.ts`) muss nach jeder Inhaltsänderung und
  nach Zoom-Änderung korrekt bleiben (Anzahl/Position der Umbrüche stimmt).
- Sehr breiter Inhalt (breite Tabelle, großes Bild) darf das Blatt **nicht** sprengen:
  entweder wird er auf die Inhaltsbreite begrenzt/umgebrochen **oder** innerhalb des
  Blattes horizontal scrollbar gemacht — festzulegen und zu testen; die **Seite selbst**
  behält ihre A4-Breite, das Gesamtlayout überläuft nicht.

### 2.2 Zoom
- Zoom-Stufen mindestens **50 %–200 %** (z. B. 50/75/90/100/125/150/200), Schrittweite
  über „+/−" sinnvoll (z. B. 10–25 %). „Fit-to-Width" berechnet den Faktor aus
  verfügbarer Breite ÷ A4-Blattbreite.
- Umsetzung über **CSS-`transform: scale()`** auf dem Blatt-Wrapper (nicht über
  `font-size`), damit das A4-Verhältnis und alle Proportionen exakt erhalten bleiben.
- **Editier-Korrektheit unter Zoom (verbindlich):** Klick-/Cursor-Position, Selektion,
  Tippen, Toolbar-Aktionen und der bestehende Selection-Sync-Fix
  (`reconcileSelectionOnClick`, `WordEditor.tsx`) müssen unter jedem Zoomfaktor korrekt
  arbeiten (`view.posAtCoords` rechnet in Viewport-Koordinaten — die Skalierung darf die
  Zuordnung Klickpunkt→Dokumentposition nicht verfälschen; explizit zu prüfen, ggf. über
  ein Scale-bewusstes Container-Layout statt reinem `transform` auf dem klickbaren
  Element).
- Der Scroll-Bereich passt sich dem gezoomten Blatt an (bei 200 % ist das Blatt doppelt so
  groß und horizontal/vertikal scrollbar; bei Fit-to-Width entsteht kein Horizontal-Scroll).
- Zoom-Zustand gilt für die **Session** (kein Persistieren über Reload — Datenschutz-
  Architektur, keine Persistenz; analog zu anderen Specs).

### 2.3 Responsiveness (Handy Pflicht)
- **Kein horizontaler Überlauf** des Gesamtlayouts auf einem Handy-Viewport
  (Referenz: das Playwright-Projekt **Mobile**, `devices['Pixel 7']`, ~412 px CSS-Breite,
  und **Tablet**, `devices['iPad Mini']`). Der Body/Seitencontainer darf nicht breiter als
  der Viewport sein (`document.scrollingElement.scrollWidth <= innerWidth`).
- Auf schmalem Viewport: Blatt automatisch **fit-to-width** (2.1/1.4), Inhalt bleibt lesbar,
  vertikales Scrollen normal.
- **Toolbar** bleibt bedienbar: umbrechend oder horizontal scrollbar, Tap-Ziele groß genug,
  keine überlappenden/abgeschnittenen Buttons; die Zoom-Steuerung ist erreichbar.
- Auf Desktop-Breite: A4-Blatt zentriert, gewählter Zoom, wie bisher.
- Die App-Shell (Format-Auswahl, Datenschutz-Banner, `DocumentWorkspace`-Kopfzeile mit
  „← Formate"/Dateiname/Export) muss auf dem Handy ebenfalls ohne Überlauf und mit
  bedienbaren Tap-Zielen dargestellt werden.

### 2.4 Kopf-/Fußzeilen-Zonen
- Sind Kopf-/Fußzeilen im Dokument vorhanden, gehört ihr Bereich optisch zur Seite (oberer/
  unterer Randbereich). Ihre **Bearbeitung** ist ein separates Feature; hier zählt nur, dass
  die Basisdarstellung sie nicht zerstört und die Seitengeometrie stimmt.

---

## 3. Grenzfälle

1. **Leeres Dokument** → genau eine leere A4-Seite, kein Fehler, korrekt zentriert/fit.
2. **Sehr langes Dokument** (viele Seiten) → Paginierung korrekt, Editor bleibt bedienbar
   (kein spürbares Einfrieren; die 329-Fixtures enthalten mehrseitige Dokumente).
3. **Sehr breite Tabelle / großes Bild** → Seite überläuft das Layout nicht (2.1).
4. **Zoom × Paginierung** → nach Zoomwechsel wird korrekt neu paginiert (Höhenmessung in
   `pagination.ts` erfolgt am gerenderten DOM; bei `transform: scale` sind die gemessenen
   `getBoundingClientRect`-Höhen skaliert — der Umbruch-Algorithmus muss weiterhin die
   **ungezoomten** Blockhöhen gegen die **ungezoomte** Seiteninhaltshöhe vergleichen,
   sonst verschieben sich die Umbrüche mit dem Zoom. Explizit zu lösen und zu testen.)
5. **Zoom × Klickposition** → Cursor landet unter jedem Zoom an der geklickten Stelle (2.2).
6. **Fenster-/Orientierungswechsel** (Resize, Hochkant↔Quer) → Fit-to-Width rechnet neu,
   kein Überlauf, keine „eingefrorene" alte Breite.
7. **Sehr kleiner Viewport** (z. B. 320 px) → weiterhin kein Horizontal-Überlauf.
8. **Reload/kein Autosave** → Zoom/Ansicht müssen einen Reload **nicht** überdauern
   (bewusste Nicht-Persistenz).

---

## 4. Rendering-Tests gegen die Beispieldokumente (Pflicht)

Über die bestehenden Datenebenen-Import-Tests hinaus (`external-fixtures.test.ts`) sind
**echte Rendering-Tests** nötig, die die Basisdarstellung absichern:

### 4.1 Repräsentative E2E-Rendering-Tests (echter Browser, Playwright)
- Eine kuratierte Teilmenge realer Fixtures (mindestens je Format eine kleine, eine
  mehrseitige, eine mit Tabelle, eine mit Bild, eine „komplexe") wird per echtem Upload
  geöffnet und muss:
  - **ohne White-Screen/Crash** rendern (`.ProseMirror` sichtbar, Inhalt vorhanden,
    Error-Boundary nicht ausgelöst),
  - eine plausible **Seitenstruktur** zeigen (mind. eine Seite; bei langem Inhalt >1),
  - auf dem **Mobile-Viewport kein horizontales Überlaufen** erzeugen
    (`scrollWidth <= innerWidth` am Seitencontainer),
  - unter mindestens einem geänderten Zoom (z. B. 150 % und Fit-to-Width) weiterhin
    korrekt/bedienbar bleiben.

### 4.2 Breiten-Massentest über ALLE Fixtures (schnell, Unit-/Integration)
- Ein automatisierter Test lädt **jede** der 329 Fixtures in das Editor-Dokumentmodell und
  stellt sicher, dass daraus ein **mountbares**, schema-valides Dokument entsteht (nutzt das
  bereits vorhandene `assertLoadableDocument`), sodass „rendert im Editor ohne Absturz" für
  den gesamten Korpus abgesichert ist — die bekannten, dokumentierten Ausnahmen (passwort-
  geschützt/korrupt/jsdom-Limit) bleiben als solche markiert, nicht als Rendering-Fehler.
- Ergänzend: für eine Stichprobe wird geprüft, dass die A4-Seitengeometrie (Blattbreite =
  `PAGE_WIDTH_PX`, Ränder) unabhängig vom Inhalt konstant bleibt.

### 4.3 Responsiveness-Regressionstest
- Dedizierter E2E-Test (Mobile-Projekt): neues Dokument + eine hochgeladene Fixture →
  `scrollWidth <= innerWidth` (kein Overflow), Toolbar sichtbar/bedienbar, Zoom-Steuerung
  tappbar. Läuft dauerhaft in der Suite.

---

## 5. Rundreise / Regressionsschutz
- Die Basisdarstellung darf die bestehende Import-/Export-Rundreise **nicht** verändern
  (Zoom/Ansicht sind reine Darstellungszustände, nie Teil von `doc.toJSON()` oder des
  Exports). Vor/nach der Umsetzung müssen `docx.spec.ts`, `odt.spec.ts`,
  `roundtrip-fidelity.spec.ts`, alle `roundtrip.test.ts` und der Selection-Sync-Test
  unverändert grün bleiben.
- Der bestehende Selection-Sync-Fix und die Paginierung müssen unter Zoom weiter funktionieren.

---

## 6. Abnahmekriterien (Definition of Done)

„Dokument-Basisdarstellung" gilt als abnahmefähig, wenn:

1. **A4-Seitenansicht** mit sichtbaren Blättern, korrekten Rändern und Seitenumbrüchen für
   DOCX **und** ODT dargestellt wird (2.1).
2. **Zoom** (−/+/Prozent/Fit-to-Width/100 %, Tastenkürzel) funktioniert, das A4-Verhältnis
   erhält, und **Editieren unter jedem Zoom korrekt** ist (Klickposition, Selektion, Tippen,
   Selection-Sync) — durch E2E-Test belegt (2.2, Grenzfälle 4–5).
3. **Mobile Responsiveness** nachgewiesen: auf dem Mobile-**und** Tablet-Projekt **kein
   horizontales Überlaufen** (`scrollWidth <= innerWidth`), automatisches Fit-to-Width,
   bedienbare Toolbar + Zoom-Steuerung — durch dedizierten E2E-Test belegt (2.3, 4.3).
4. **Rendering-Tests gegen die Beispieldokumente** vorhanden und grün: der Massentest über
   alle 329 Fixtures (4.2) sowie die repräsentativen E2E-Rendering-Tests (4.1), mit
   dokumentierten, klar abgegrenzten Ausnahmen (kein stiller Skip als „bestanden").
5. **Grenzfälle** aus Abschnitt 3 einzeln geprüft und ihr Verhalten dokumentiert.
6. **Regressionsschutz** (Abschnitt 5): Import/Export-Rundreise, Paginierung und
   Selection-Sync vor/nach unverändert grün; volle E2E-Suite über alle Projekte grün
   (dokumentierte Umgebungs-Skips zählen als grün, echte Fehlschläge nicht).
7. **Toolbar-/App-Shell-Responsiveness** auf dem Handy ohne Überlauf und mit bedienbaren
   Tap-Zielen (2.3).

Erst danach beginnen wir wieder mit den Bearbeitungs-Features (Fett usw.).

---

## 7. UX-Invarianten-Durchgang (`specs/UX-INVARIANTEN.md` §1 — Punkt für Punkt)

1. **View-Sync:** Dokument öffnen/importieren → Editor wird fokussiert (`view.focus()` beim
   Mount) und beginnt oben (frische Scrollposition). Einfügen von Bild/Text (Feature
   „Einfügen") scrollt bereits per `scrollIntoView` zur Einfügestelle. Zoomwechsel: die Seite
   skaliert von oben; die betrachtete Stelle bleibt im Blattfluss (kein Inhaltssprung). Für
   Suchtreffer gilt View-Sync später im Feature `suchen` (dort einzufordern). **Erfüllt** für
   den Umfang dieses Tickets.
2. **Zustands-Feedback:** Fehler beim Import → sichtbare Meldung + Rückweg (`EditorErrorBoundary`
   → Format-Auswahl, bestehend). Leeres Dokument → genau eine leere A4-Seite (kein
   White-Screen). **Offene, bewusst hier vermerkte Lücke:** ein sichtbarer **Ladezustand** für
   den Import sehr großer/komplexer Dateien gehört fachlich zu `datei-oeffnen`; falls dort
   nicht vorhanden, als Folge-Anforderung dort nachziehen — für die Basisdarstellung selbst
   nicht blockierend, aber hier explizit benannt statt weggelassen.
3. **Fokus/Tastatur:** Die Zoom-Steuerung besteht aus echten `<button>` mit `onClick` → per
   Tab + Enter/Leertaste bedienbar. Zoom-Tastenkürzel (Strg/Cmd +/−/0) vorhanden. **Erfüllt.**
4. **Responsiveness:** Auto-Fit-to-Width verhindert horizontales Überlaufen auf 320–768 px
   (getestet, `scrollWidth ≤ innerWidth` auf Mobile+Tablet); Zoom-Tap-Ziele auf **≥ 40 px**
   angehoben. **Erfüllt.**
5. **Persistenz (invertiert):** Zoom/Scroll sind reiner React-/DOM-Zustand, werden **nicht**
   persistiert und überstehen einen Reload bewusst nicht; kein Dokumentinhalt wird gespeichert.
   **Erfüllt** (Datenschutz-Kernprinzip gewahrt).
6. **Konsistenz:** UI-Strings deutsch („Verkleinern"/„Vergrößern"/„An Breite anpassen"/
   „Zoomstufe"); Hell- und Dunkelmodus-Klassen gesetzt. **Erfüllt.**

## 8. Journey-Durchgang (`specs/UX-INVARIANTEN.md` §2)

1. Nutzer öffnet ein Dokument (neu oder Upload) → *erwartet:* Editor erscheint fokussiert,
   Ansicht oben, A4-Blatt sichtbar, kein White-Screen. → abgedeckt (§2.1, §4.1, View-Sync).
2. Nutzer ist am Handy → *erwartet:* das Blatt passt auf den Schirm, kein Wegwischen nach
   rechts. → abgedeckt (Auto-Fit, §2.3, Tests §4.3).
3. Nutzer will größer sehen → *erwartet:* Zoom-Steuerung erreichbar, +/−/100 %/Anpassen
   wirken, Text bleibt klickbar/tippbar. → abgedeckt (§2.2, Tests, Editier-Korrektheit unter
   Zoom).
4. Nutzer scrollt durch ein langes Dokument → *erwartet:* mehrere klar getrennte A4-Seiten. →
   abgedeckt (Paginierung, §2.1).
5. Nutzer dreht das Handy quer → *erwartet:* Layout rechnet neu, weiterhin kein Overflow. →
   abgedeckt (ResizeObserver → Auto-Fit, Grenzfall 6).

Referenz: `specs/UX-INVARIANTEN.md` (verbindliche Methodik; ab dem nächsten Feature schreibt
ein **PO-Agent** die req.md).

---

## 9. Umsetzungsstand & verifizierte Grenzen (Dev, 2026-07-05)

**Umgesetzt** (`src/formats/shared/editor/WordEditor.tsx`, `pagination.ts`):
- A4-Blatt mit fester `PAGE_WIDTH_PX`-Breite, Rändern, Schatten und Seiten-Bändern; Zoom über
  `transform: scale()` auf dem Blatt-Wrapper, mit einem **skalierten Footprint-Wrapper**
  (`width/height = ungezoomt × zoom`), damit Scroll/Zentrierung stimmen und schmale Viewports
  nie horizontal überlaufen.
- Auto-Fit-to-Width (`fitZoom`) + Nutzer-Zoom (`−`/`+`/`100 %`/„An Breite anpassen`,
  Strg/Cmd `+`/`−`/`0`), Tap-Ziele ≥ 40 px, zwei `ResizeObserver` (Container-Breite +
  natürliche Blatthöhe), robust gegen fehlenden `ResizeObserver` (jsdom/Alt-Browser).
- Paginierung misst Blockhöhen über `offsetHeight` (transform-**invariant**) → Umbrüche
  bleiben unter jedem Zoom korrekt (Grenzfall 4 gelöst, ohne Zoom in `pagination.ts` zu
  fädeln).

**Empirisch verifiziert (echter Browser, Mobile-Viewport ~412 px, Zoom ≈ 0,49):** Klick auf
echten Text platziert den Cursor **exakt** an der geklickten Stelle (`posAtCoords` liefert die
korrekte Position, getippte Marke landet zeichengenau), und `document.elementFromPoint` trifft
ein selektiertes Bild korrekt. **Die CSS-Skalierung verfälscht die Zuordnung
Klickpunkt→Dokumentposition für realen Inhalt also nicht** — die verbindliche Editier-
Korrektheit unter Zoom (§2.2, Grenzfall 5) ist erfüllt.

**Test-Umgebungs-Anpassung (kein Produktmangel, dokumentiert):** Auf den skalierten
Projekten `Mobile`/`Tablet` versagt **Playwrights synthetischer Zeiger** bei zwei
Test-*Artefakten*:
1. absichtlich **1×1-px-Test-Bilder** rendern unter Fit-Zoom **sub-pixel** (< 1 px) und sind
   damit für den synthetischen Klick nicht mehr triggerbar (ein real großes Bild ist nicht
   betroffen — der Browser trifft es korrekt, s. o.);
2. ein **synthetischer Drop mit festem Pixel-Offset** (`rect.left+20`) kann unter starker
   Kompression in leeren Raum unterhalb des kurzen Inhalts fallen, wo `posAtCoords` keine
   Position findet (ein realer Drop auf Text ist nicht betroffen).

Betroffene Bestands-Tests (`cut.spec.ts`, `clipboard-paste.spec.ts`) fixieren für genau diese
pixelgenauen Schritte via `Strg/Cmd+0` die **Originalgröße (100 %)** — sie prüfen
Ausschneiden-/Einfügen-/Drop-**Logik** (viewport-unabhängig), während die Responsiveness
selbst durch `document-display.spec.ts` abgesichert ist. Die Anpassung stellt exakt das
Vor-Zoom-Verhalten wieder her (kein Coverage-Verlust). Begründung je Stelle als Kommentar im
Test (`pinActualSizeZoom`).

**CI-Hinweis:** `file-open-edge-cases.spec.ts` E-5.2 (Tastatur-Dateiauswahl) ist ein
vorbestehender, dokumentierter Datei-Chooser-Timing-Flake (unabhängig von diesem Ticket),
den CI über `retries:1` abfängt; isoliert grün (3/3).
