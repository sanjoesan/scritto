# Papercut

Papercut ist eine Web-App zum Ansehen und Bearbeiten gängiger Dokumentformate — komplett im
Browser, ohne Server, ohne Konto.

**Live:** https://sanjoesan.github.io/papercut/

## Datenschutz — bitte lesen

Papercut lädt Dateien ausschließlich in den Arbeitsspeicher deines Browser-Tabs. Es gibt keinen
Server, keine Übertragung von Dateiinhalten irgendwohin, kein `localStorage`, kein
`IndexedDB`, keine Cookies mit Dokumentdaten.

**Das bedeutet auch: Nichts wird gespeichert.** Sobald du den Tab schließt oder die Seite neu
lädst, sind alle geöffneten Dokumente und alle Änderungen unwiderruflich weg. Exportiere deine
Datei, bevor du die Seite verlässt.

## Unterstützte Formate

| Format | Status | Umfang |
| --- | --- | --- |
| ODT (OpenDocument Text) | geplant | Seitenbasierter Editor: Formatierung, Tabellen, Bilder, Kopf-/Fußzeile, Inhaltsverzeichnis, Fußnoten, Kommentare, Änderungsverfolgung |
| DOCX (Word) | geplant | wie ODT, kompatibel mit Microsoft Word |
| XLSX / CSV | geplant | Zellen, Formatierung, Formeln, mehrere Tabellenblätter |
| PDF | geplant | Ansicht: Zoom, Seitennavigation, Volltextsuche (kein Editieren) |
| TXT / Markdown / JSON / XML | geplant | Text- bzw. Code-Editor mit Validierung/Vorschau |

Diese Tabelle wird laufend aktualisiert, sobald ein Format fertig implementiert ist.

## Entwicklung

```bash
npm install
npm run dev          # Dev-Server
npm run test         # Unit-Tests (Vitest)
npm run test:e2e     # End-to-End-Tests (Playwright)
npm run build         # Typecheck + Production-Build
```

## Lizenz

MIT — siehe [LICENSE](./LICENSE). Es werden ausschließlich permissiv lizenzierte
Open-Source-Abhängigkeiten (MIT/BSD/Apache-2.0) verwendet.
