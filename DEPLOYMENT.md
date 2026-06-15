# Deployment zum Testen

## Lokal testen

```bash
cd tcg
npm install
npm run dev
```

Dann öffnen:

```text
http://localhost:3000
```

Für Kamera-Tests auf dem Handy brauchst du meistens HTTPS. Lokal am Laptop funktioniert Kamera oft nur auf `localhost`; vom Handy aus brauchst du z. B. einen Tunnel oder ein Cloud-Deployment mit HTTPS.

## Production-Build lokal testen

```bash
cd tcg
npm install
npm run build
NODE_ENV=production npm start
```

Dann öffnen:

```text
http://localhost:3000
```

## Docker testen

```bash
cd tcg
docker build -t tcg-app .
docker run --rm -p 3000:3000 tcg-app
```

Dann öffnen:

```text
http://localhost:3000
```

## Cloud-Deployment

Diese App ist keine reine Frontend-App. Sie braucht den Node/Express-Server und die SQLite-Datei `pokemon_cards.db`. Deshalb besser nicht als statische Vercel-/Netlify-Seite deployen.

Empfohlen für Tests:

- Render Web Service
- Railway Service
- Fly.io Docker App
- kleiner VPS mit Docker

Wichtig:

- Start Command: `npm start`
- Build Command: `npm ci && npm run build`
- Environment: `NODE_ENV=production`
- Port: wird automatisch über `process.env.PORT` gelesen
- SQLite-Datei `pokemon_cards.db` muss mit deployed werden

Für dauerhaft gespeicherte Favoriten, Inventar und Marktpreise brauchst du bei Cloud-Deployments ein persistentes Volume/Disk. Ohne persistente Disk können diese Daten nach Rebuild/Restart verloren gehen.
