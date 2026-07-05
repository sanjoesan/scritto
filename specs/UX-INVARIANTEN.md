# Spec-Methodik: UX-Invarianten & Journey-Durchgang (verbindlich für jede req.md)

**Warum diese Datei existiert.** Requirements wurden zu oft *feature-funktional* geschrieben
(„die Funktion X ändert den Zustand korrekt") statt *nutzer-journey-getrieben* („was erwartet
der Nutzer nach Aktion X zu sehen?"). Die Folge sind Lücken, die funktional korrekt, aber als
UX offensichtlich falsch sind — Musterbeispiel aus einem anderen Projekt: „Route laden → die
Wegpunkte landen im State, aber die Karte springt **nicht** zur Route". Für uns übersetzt:
„Dokument öffnen → Inhalt ist im Editor, aber die Ansicht ist nicht fokussiert/gescrollt",
„Bild einfügen → Bild im Dokument, aber Ansicht springt nicht dorthin", „Suchtreffer → Treffer
markiert, aber nicht ins Sichtfeld gescrollt".

Deshalb sind ab jetzt **zwei Dinge fester Bestandteil jeder `<slug>-req.md`** — nicht optional,
nicht nur abhaken, sondern Punkt für Punkt **beantworten**.

---

## 1. UX-Invarianten-Checkliste (am Ende jeder req.md explizit durchgehen)

Für jede Invariante: konkret beantworten „erfüllt / wie", „bewusst nicht relevant, weil …",
oder „Lücke → Anforderung ergänzt". Kein stilles Überspringen.

1. **View-Sync (die Ansicht folgt dem Zustand).**
   Jede Aktion, die Dokument, Inhalt oder Selektion ändert — Dokument öffnen/importieren,
   neues Dokument, Einfügen (Paste), Bild/Tabelle/Element einfügen, Suchtreffer anspringen,
   Seiten-/Zoomwechsel — muss die Ansicht **sinnvoll nachführen**: Editor fokussiert, die
   geänderte Stelle sichtbar (`scrollIntoView` / Cursor im Blick), kein „Zustand geändert,
   aber Viewport steht woanders". Wo bewusst **nicht** nachgeführt wird, ist das explizit zu
   begründen.

2. **Zustands-Feedback.**
   - **Laden sichtbar:** länger dauernde Aktionen (Import großer/komplexer Dateien, Export)
     zeigen einen sichtbaren Lade-/Beschäftigt-Zustand statt eingefrorener UI.
   - **Erfolg sichtbar** und **Fehler sichtbar + Ausweg:** Fehler nie stumm; immer sichtbar
     mit einem Weg zurück (Error-Boundary → zurück zur Format-Auswahl, sichtbare Meldung).
   - **Leerzustand hat Hinweis:** leeres/neues Dokument, „noch keine Datei" o. Ä. bekommen
     einen erklärenden Hinweis, keine kommentarlose leere Fläche.

3. **Fokus / Tastatur.**
   Modale (z. B. Datenschutz-Hinweis) fangen den Fokus, ESC schließt wo sinnvoll, der Fokus
   kehrt danach an eine sinnvolle Stelle zurück. **Alle** Bedienelemente (Toolbar-Buttons,
   Zoom-Steuerung, Export, Datei öffnen) sind per Tastatur erreichbar und auslösbar
   (Button-Aktivierung über `onClick`, nicht nur `onMouseDown`).

4. **Responsiveness.**
   **320–768 px**: alle Controls sichtbar und erreichbar, nichts abgeschnitten, **kein**
   horizontaler Overflow des Gesamtlayouts (`scrollWidth ≤ innerWidth`), **Touch-Ziele ≥ 40 px**.
   Getestet auf den `Mobile`- und `Tablet`-Playwright-Projekten.

5. **Persistenz — für Salamanido bewusst invertiert (Datenschutz-Kernprinzip).**
   Dokumentinhalt lebt **ausschließlich** im Speicher; es wird **nichts** persistiert
   (kein `localStorage`/`IndexedDB` für Inhalte). „Was bleiben soll, überlebt Reload" gilt
   hier **nicht** für Inhalt — der einzige dauerhafte Artefakt ist die **exportierte Datei**.
   Transiente Ansichtszustände (Zoom, Scrollposition) überleben einen Reload **bewusst nicht**.
   Diese Invariante prüft also das Gegenteil: nichts Sensibles darf versehentlich persistiert
   werden.

6. **Konsistenz.**
   Einheitliche UI-Sprache (**Deutsch**) — keine vergessenen englischen Strings im sichtbaren
   UI; **Hell- und Dunkelmodus** beide geprüft; einheitliche Icons, Abstände, Tap-Ziele.

---

## 2. Journey-Durchgang (vor Fertigstellung der Spec)

Bevor die `req.md` steht, die **reale Nutzer-Handlung Schritt für Schritt** durchgehen und bei
**jeder** Aktion fragen: **„Was erwartet der Nutzer jetzt zu sehen?"** — und die Antwort als
Anforderung festhalten, wenn sie noch fehlt.

Beispiel-Journey (Dokument öffnen):
1. Nutzer wählt Format / lädt Datei → *Erwartung:* sichtbares Laden bei großen Dateien.
2. Datei importiert → *Erwartung:* Editor erscheint, **fokussiert**, Ansicht **oben**, Inhalt
   sichtbar, kein White-Screen; bei Fehler sichtbare Meldung + Zurück.
3. Nutzer scrollt/zoomt → *Erwartung:* A4-Seiten sichtbar, kein Horizontal-Overflow, Zoom
   führt die betrachtete Stelle sinnvoll mit.
4. Nutzer fügt Bild/Tabelle ein → *Erwartung:* Ansicht springt zur Einfügestelle.
5. Nutzer sucht (später) → *Erwartung:* Treffer wird markiert **und** ins Sichtfeld gescrollt.
6. Nutzer exportiert → *Erwartung:* sichtbares Feedback, Datei-Download.

Genau dieser Durchgang fängt die „State geändert, Viewport nicht nachgeführt"-Klasse ab, bevor
sie in die Umsetzung gelangt.

---

## 3. Rollen — schlankes PO-Agent ↔ Dev ↔ QA-Agent-Dreieck

Der Viewport-Bug rutschte durch, weil **derselbe** Kopf Spec und Code hielt: Anforderungen
werden dann unbewusst so formuliert, dass sie zu dem Code passen, den man ohnehin schreiben
will — die „selbstverständlichen" Nutzererwartungen werden wegrationalisiert. Dieselbe „rosa
Brille" wie beim QA, nur auf der Anforderungsseite. Gegenmaßnahme: **Unabhängigkeit auf beiden
Seiten.**

- **PO — eigener Agent (schreibt die `req.md`).** Schreibt aus **Nutzersicht**, kennt den
  Implementierungsaufwand bewusst **nicht** und fordert deshalb die offensichtlichen Dinge ein
  (View-Sync, Feedback, Responsiveness, Fokus) statt sie wegzurationalisieren. Arbeitet Punkt 1
  (UX-Invarianten) und Punkt 2 (Journey-Durchgang) verpflichtend ab. Nutzt vorhandene
  `req.md`-Fassungen als Grundlage, aber verbessert sie kritisch statt Schwächen zu übernehmen.
- **Dev — das Haupt-LLM (technischer Lead).** Führt ein **kurzes** Machbarkeits-Review der
  PO-Spec (nur Realisierbarkeit/Widersprüche, **keine** inhaltliche Verwässerung der
  Nutzerforderungen), schreibt die Spec **nicht** selbst. Danach: Code + Integration + CPD.
- **QA — eigener Agent (prüft unabhängig).** Führt build + lint + unit + volle e2e selbst aus,
  prüft gegen die `req.md` inkl. der beiden UX-Abschnitte, gibt `QA-VERDIKT: PASS/FAIL`. Erst
  bei PASS darf der Dev committen/pushen/deployen.

Das ist das klassische PO↔Dev↔QA-Dreieck, schlank — ohne den schweren Leiter-Overhead der
alten „Bibel"-Pipeline.

## 4. Verankerung
- Diese Datei wird am Ende **jeder** neuen/aktualisierten `<slug>-req.md` referenziert; die
  req.md enthält einen eigenen Abschnitt **„UX-Invarianten-Durchgang"** (Punkt 1 abgearbeitet)
  und einen **„Journey-Durchgang"** (Punkt 2). Ohne diese beiden Abschnitte ist eine req.md
  nicht fertig.
- Ab dem nächsten Feature schreibt ein **PO-Agent** die `req.md` (Abschnitt 3), nicht der Dev.
- Der autonome QA-Agent prüft die beiden UX-Abschnitte mit: fehlen sie oder sind Invarianten
  unbeantwortet, ist das ein Abnahme-Hindernis.
