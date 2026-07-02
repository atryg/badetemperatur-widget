# Proxy for Yr badetemperaturer

VEV-komponenten kjører i nettleseren og må ikke få API-nøkkelen direkte. Bruk en liten server/proxy som legger på `apikey`-headeren mot Yr og eksponerer et offentlig JSON-endepunkt til widgeten.

For denne pakken er GitHub Actions + GitHub Pages den enkleste trygge produksjonsflyten. Den genererer `public/data/trondheim-top5.json` uten å eksponere nøkkelen. Worker-malen her er et alternativ dersom du senere vil ha et server-endepunkt i stedet for statisk JSON.

Denne mappen har en Cloudflare Worker-mal:

```bash
wrangler secret put YR_BADETEMPERATURER_API_KEY
wrangler deploy proxy/cloudflare-worker.mjs
```

Lokal proxy leser `.env` fra pakkeroten:

```bash
npm run proxy:dev
```

For topp 5 i Trondheim kommune kan widgetens `apiEndepunkt` settes til:

```text
http://127.0.0.1:8787/?mode=all&municipality=Trondheim&limit=5
https://DIN-WORKER.workers.dev/?mode=all&municipality=Trondheim&limit=5
```

Andre nyttige kall:

```text
https://DIN-WORKER.workers.dev/?mode=nearest&lat=63.4305&lon=10.3951
https://DIN-WORKER.workers.dev/?mode=nearest&locationId=1-269359
https://DIN-WORKER.workers.dev/?mode=location&locationId=1-73595&name=Sognsvann&area=Oslo
```

Worker-responsen caches i 10 minutter og normaliseres til:

```json
{
  "source": "Badetemperaturer levert av Yr",
  "updatedAt": "2026-07-02T08:30:00+02:00",
  "items": [
    {
      "navn": "Badested",
      "omrade": "Kommune",
      "temperatur": 18.4,
      "maltKlokken": "08:30"
    }
  ]
}
```

Ikke legg API-nøkkelen i VEV-felter, React-kode, README, commit-historikk eller klientvendte miljøvariabler.
