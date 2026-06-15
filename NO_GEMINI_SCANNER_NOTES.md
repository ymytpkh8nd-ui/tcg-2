# No-Gemini Scanner & Pricing Overhaul

## Was geändert wurde

- `@google/genai` wurde aus `package.json` entfernt.
- Der Karten-Scan nutzt keine Cloud-KI mehr.
- Der Browser erstellt lokale OCR-Hinweise über Tesseract.js:
  - Set-Code
  - Kartennummer
  - Yen-Preis
  - gelbes Label / mögliche Mängelmarkierung
- Der Server matched diese Hinweise ausschließlich gegen SQLite.
- Der alte KI-Scan-Pfad wurde durch `/api/cards/scan` mit `scanner_engine: local-ocr-db-v2` ersetzt.
- Händlerbewertungen für Karten und Sets laufen jetzt über deterministische lokale Regeln.
- Die Trend-Vorschau ist eine lokale statische Händler-Vorschau und ruft keine externe KI auf.
- Die Preisfindung wurde transparent umgebaut:
  - `market_prices` Tabelle für manuelle/importierte Marktpreise
  - `POST /api/prices/upsert` zum Speichern von Marktpreisen
  - `GET /api/cards/:api_card_id/pricing` für Deal-Analyse
  - lokale Fallback-Preise sind klar als Modell/Fallback markiert und nicht als echte Cardmarket-Preise

## Scanner-Flow

1. Bild wird im Browser auf OCR-lesbare Größe reduziert.
2. Tesseract.js liest Text lokal aus dem Bild.
3. Client extrahiert Set-Code, Kartennummer, Yen-Preis und Mängelhinweise.
4. Server matched gegen SQLite nach Set + Nummer, Nummer-only und Namen-Fallback.
5. UI zeigt lokale OCR-Rohdaten und Match-Konfidenz.

## Optionaler Shop-Hinweis

Im Scan-Panel gibt es ein Feld für manuelle Hinweise, z. B.:

```text
SV8a 123/187 ¥1980
OP05-119 ¥12800
```

Das ist nützlich bei unscharfen Regalfotos, wenn OCR die kleine Kartennummer nicht sicher erkennt.

## Preisfindung

Die App trennt jetzt sauber zwischen:

- manuell/importiertem Marktpreis (`market_prices`)
- lokalem Fallback-Modell (`local_model_fallback`)
- Deal-Rechnung mit Yen-Einkauf, EUR-Wechselkurs, Einfuhrkosten, Plattformgebühren und Zielmarge

Wichtige Antwortfelder der Preis-API:

- `market_price_eur`
- `market_source`
- `market_confidence`
- `landed_cost_eur`
- `net_revenue_eur`
- `expected_profit_eur`
- `roi_percent`
- `max_buy_yen`
- `decision`: `BUY`, `CHECK` oder `SKIP`

## Build-Status

Geprüft mit:

```bash
npm run lint
npm run build
```

Beides läuft durch. Vite gibt nur eine normale Chunk-Size-Warnung aus.
