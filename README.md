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

Widgeten henter automatisk topp 5-data fra GitHub-filen. Du trenger normalt ikke fylle inn `apiEndepunkt` i VEV.

For lokal testing med topp 5 badetemperaturer i Trondheim:

```text
http://127.0.0.1:8787/?mode=all&municipality=Trondheim&limit=5
```

API-nøkkelen fra Yr skal ikke ligge i VEV, React-kode eller publiserte frontend-filer. Legg den som miljøhemmelighet i proxyen, for eksempel som `YR_BADETEMPERATURER_API_KEY`.

Se [proxy/README.md](proxy/README.md) for Cloudflare Worker-mal.

## GitHub Actions

Den anbefalte produksjonsflyten er:

```text
GitHub Actions -> Yr med secret -> commit av JSON-fil -> VEV-widget
```

Legg API-nøkkelen inn som repository secret:

```text
YR_BADETEMPERATURER_API_KEY
```

Workflowen i `.github/workflows/update-badetemperaturer.yml` kan kjøres manuelt, og kjører automatisk med API-kall annenhver time mellom 06:00 og 22:00 Europe/Oslo. Det dekker tidsrommet 06:00-23:00 uten å treffe Yr etter kl. 23.

Workflowen oppdaterer denne filen:

```text
public/data/trondheim-top5.json
```

Hvis repoet er public, kan VEV-endepunktet være:

```text
https://raw.githubusercontent.com/atryg/badetemperatur-widget/main/public/data/trondheim-top5.json
```

Widgeten bruker denne URL-en automatisk. Feltet `apiEndepunkt` i VEV kan stå tomt, og brukes bare hvis du vil overstyre datakilden senere.

Hvis repoet er private, kan ikke leserne hente `raw.githubusercontent.com` uten innlogging. Da må enten repoet gjøres public, eller bare JSON-filen publiseres i et separat public repo.

## Kreditering

Når data hentes fra Yr skal widgeten vise:

```text
Badetemperaturer levert av Yr
```

Dette er standard kilde/kreditering i komponenten.
