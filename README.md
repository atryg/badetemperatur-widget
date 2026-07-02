# Badetemperatur-widget

VEV-widget for badetemperaturer i redaksjonelle artikler og kommersielle innholdssaker.

## Lokal utvikling

```bash
npm install
npm run data:update
npm run proxy:dev
npm start
```

Komponenten registreres i VEV som `Badetemperatur-widget`.

## Data

Widgeten kan brukes med manuelle verdier i VEV, eller med live-data via et proxy-endepunkt satt i feltet `apiEndepunkt`.

For lokal testing med topp 5 badetemperaturer i Trondheim:

```text
http://127.0.0.1:8787/?mode=all&municipality=Trondheim&limit=5
```

API-nøkkelen fra Yr skal ikke ligge i VEV, React-kode eller publiserte frontend-filer. Legg den som miljøhemmelighet i proxyen, for eksempel som `YR_BADETEMPERATURER_API_KEY`.

Se [proxy/README.md](proxy/README.md) for Cloudflare Worker-mal.

## GitHub Actions

Den anbefalte produksjonsflyten er:

```text
GitHub Actions -> Yr med secret -> GitHub Pages JSON -> VEV-widget
```

Legg API-nøkkelen inn som repository secret:

```text
YR_BADETEMPERATURER_API_KEY
```

Workflowen i `.github/workflows/update-badetemperaturer.yml` kan kjøres manuelt, og kjører automatisk med API-kall annenhver time mellom 06:00 og 22:00 Europe/Oslo. Det dekker tidsrommet 06:00-23:00 uten å treffe Yr etter kl. 23.

Når GitHub Pages er aktivert med GitHub Actions som kilde, blir VEV-endepunktet:

```text
https://DIN-BRUKER.github.io/DITT-REPO/data/trondheim-top5.json
```

Sett denne URL-en i VEV-feltet `apiEndepunkt`. Widgeten viser de fem høyeste badetemperaturene i Trondheim.

## Kreditering

Når data hentes fra Yr skal widgeten vise:

```text
Badetemperaturer levert av Yr
```

Dette er standard kilde/kreditering i komponenten.
