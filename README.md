# TCG Händler App — No-Gemini Scanner & Pricing

Fullstack React/Vite + Express + SQLite App für TCG-Reselling-Workflows.

## Lokal starten

```bash
npm install
npm run dev
```

Öffne danach:

```text
http://localhost:3000
```

## Production-Build

```bash
npm run build
NODE_ENV=production npm start
```

## Deployment

Siehe `DEPLOYMENT.md`.

## Scanner

Die App nutzt keine Gemini-Erkennung mehr. Der neue Flow ist lokal aufgebaut:

1. Client/OCR liest Kartennummer, Set-Code und Yen-Preis.
2. Backend matched gegen SQLite.
3. Preis-/Deal-Engine bewertet Kauf, Marge und Risiko.

## Preisfindung

Die App enthält eine lokale `market_prices`-Tabelle und einen Deal-Rechner. Externe Marktdaten müssen später über offizielle Quellen, CSV-Import oder manuelle Pflege ergänzt werden.
