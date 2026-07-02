import React from "react";
import { registerVevComponent, useEditorState } from "@vev/react";
import styles from "./BadetemperaturWidget.module.css";

type Endring = "opp" | "ned" | "stabil";

type Badested = {
  navn?: string;
  omrade?: string;
  temperatur?: number;
  endring?: Endring;
  maltKlokken?: string;
  notat?: string;
};

type NormalisertApiData = {
  steder: Badested[];
  kilde?: string;
  oppdatert?: string;
};

type ApiStatus = "idle" | "loading" | "success" | "error";

type Props = {
  merkelapp?: string;
  tittel?: string;
  ingress?: string;
  oppdatertTekst?: string;
  kilde?: string;
  apiEndepunkt?: string;
  hentApiIEditor?: boolean;
  cacheMinutter?: number;
  maksAntall?: number;
  hovedbadested?: number;
  steder?: Badested[];
  visKilde?: boolean;
  visApiHint?: boolean;
  bakgrunn?: string;
  aksent?: string;
  varmAksent?: string;
  tekstfarge?: string;
};

const YR_KREDITERING = "Badetemperaturer levert av Yr";
const STANDARD_DATA_ENDEPUNKT =
  "https://raw.githubusercontent.com/atryg/badetemperatur-widget/main/public/data/trondheim-top5.json";
const apiCache = new Map<
  string,
  { hentet: number; data: NormalisertApiData }
>();

const standardSteder: Badested[] = [
  {
    navn: "Theisendammen",
    omrade: "Trondheim",
    temperatur: 18,
    maltKlokken: "18:00",
  },
  {
    navn: "Storsteinan",
    omrade: "Trondheim",
    temperatur: 16,
    maltKlokken: "11:10",
  },
  {
    navn: "Devlebukta",
    omrade: "Trondheim",
    temperatur: 15.5,
    maltKlokken: "16:40",
  },
  {
    navn: "Ilsvika",
    omrade: "Trondheim",
    temperatur: 15.3,
    maltKlokken: "13:10",
  },
  {
    navn: "Grilstad Marina",
    omrade: "Trondheim",
    temperatur: 14.1,
    maltKlokken: "13:25",
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const getNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value.replace(",", "."));
    return Number.isFinite(normalized) ? normalized : undefined;
  }
  return undefined;
};

const isEndring = (value: unknown): value is Endring =>
  value === "opp" || value === "ned" || value === "stabil";

const formatKlokke = (value: unknown) => {
  const time = getString(value);
  if (!time) return undefined;

  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return time;

  return new Intl.DateTimeFormat("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatOppdatert = (value?: string) => {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return `Oppdatert ${new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
};

const getBadestatus = (temperatur = 0) => {
  if (temperatur >= 20) return { label: "Varmt", className: styles.hot };
  if (temperatur >= 17)
    return { label: "Behagelig", className: styles.comfortable };
  if (temperatur >= 14) return { label: "Friskt", className: styles.fresh };
  return { label: "Kaldt", className: styles.cold };
};

const formatTemperatur = (temperatur = 0) =>
  new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(temperatur);

const getEndringLabel = (endring?: Badested["endring"]) => {
  if (endring === "opp") return "Stiger";
  if (endring === "ned") return "Synker";
  return "Stabil";
};

const getEndringSymbol = (endring?: Badested["endring"]) => {
  if (endring === "opp") return "↑";
  if (endring === "ned") return "↓";
  return "→";
};

const clampIndex = (index: number, length: number) => {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
};

const hentListeFraApiSvar = (payload: unknown) => {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  const candidates = [
    payload.items,
    payload.steder,
    payload.temperatures,
    payload.watertemperatures,
    payload.data,
  ];

  return candidates.find(Array.isArray) ?? [];
};

const normaliserBadested = (item: unknown): Badested | null => {
  if (!isRecord(item)) return null;

  const temperatur = getNumber(item.temperatur ?? item.temperature);
  const navn = getString(item.navn ?? item.locationName ?? item.name);

  if (!navn || temperatur === undefined) return null;

  const omrade =
    getString(item.omrade) ??
    getString(item.municipality) ??
    getString(item.county);
  const heatedWater = item.heatedWater === true || item.oppvarmet === true;
  const endring = isEndring(item.endring) ? item.endring : undefined;
  const notat =
    getString(item.notat) ?? (heatedWater ? "Oppvarmet vann" : undefined);

  return {
    navn,
    omrade,
    temperatur,
    endring,
    maltKlokken: getString(item.maltKlokken) ?? formatKlokke(item.time),
    notat,
  };
};

const normaliserApiData = (payload: unknown): NormalisertApiData => {
  const liste = hentListeFraApiSvar(payload);
  const steder = liste
    .map(normaliserBadested)
    .filter((sted): sted is Badested => Boolean(sted));

  let kilde: string | undefined;
  let oppdatert: string | undefined;

  if (isRecord(payload)) {
    kilde = getString(payload.kilde ?? payload.source);
    oppdatert = getString(payload.oppdatert ?? payload.updatedAt);
  }

  const sisteTid = liste
    .map((item) => (isRecord(item) ? getString(item.time) : undefined))
    .filter((time): time is string => Boolean(time))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  return {
    steder,
    kilde,
    oppdatert: oppdatert ?? sisteTid,
  };
};

const fetchApiData = async (
  apiEndepunkt: string,
  cacheMinutter: number,
  signal: AbortSignal
) => {
  const cacheKey = apiEndepunkt.trim();
  const cacheTtlMs = Math.max(cacheMinutter, 1) * 60 * 1000;
  const cached = apiCache.get(cacheKey);

  if (cached && Date.now() - cached.hentet < cacheTtlMs) {
    return cached.data;
  }

  const response = await fetch(cacheKey, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API-kall feilet med status ${response.status}`);
  }

  const data = normaliserApiData(await response.json());

  if (!data.steder.length) {
    throw new Error("API-et returnerte ingen badetemperaturer");
  }

  apiCache.set(cacheKey, { hentet: Date.now(), data });
  return data;
};

const BadetemperaturWidget = ({
  merkelapp = "Badetemperaturer",
  tittel = "De fem varmeste badestedene i Trondheim akkurat nå",
  ingress = "Se hvor badevannet holder høyest temperatur i Trondheim.",
  oppdatertTekst = "Oppdatert i dag kl. 08:30",
  kilde = YR_KREDITERING,
  apiEndepunkt = STANDARD_DATA_ENDEPUNKT,
  hentApiIEditor = true,
  cacheMinutter = 10,
  maksAntall = 5,
  hovedbadested = 0,
  steder = standardSteder,
  visKilde = true,
  visApiHint = true,
  bakgrunn = "#f7fbf8",
  aksent = "#007c89",
  varmAksent = "#d9462f",
  tekstfarge = "#171f22",
}: Props) => {
  const { disabled } = useEditorState();
  const [apiStatus, setApiStatus] = React.useState<ApiStatus>("idle");
  const [apiData, setApiData] = React.useState<NormalisertApiData | null>(null);

  const innstiltApiEndepunkt = apiEndepunkt.trim();
  const trimmedApiEndepunkt = innstiltApiEndepunkt || STANDARD_DATA_ENDEPUNKT;
  const kanHenteApi =
    Boolean(trimmedApiEndepunkt) &&
    (!disabled ||
      hentApiIEditor ||
      trimmedApiEndepunkt === STANDARD_DATA_ENDEPUNKT);

  React.useEffect(() => {
    if (!kanHenteApi) {
      setApiStatus("idle");
      setApiData(null);
      return;
    }

    const controller = new AbortController();
    setApiStatus("loading");

    fetchApiData(trimmedApiEndepunkt, cacheMinutter, controller.signal)
      .then((data) => {
        setApiData(data);
        setApiStatus("success");
      })
      .catch((error: unknown) => {
        if (isRecord(error) && error.name === "AbortError") return;
        setApiData(null);
        setApiStatus("error");
      });

    return () => controller.abort();
  }, [cacheMinutter, kanHenteApi, trimmedApiEndepunkt]);

  const apiSteder = apiData?.steder.length ? apiData.steder : undefined;
  const synligeSteder = apiSteder ?? (steder?.length ? steder : standardSteder);
  const sortedSteder = [...synligeSteder].sort(
    (a, b) => (b.temperatur ?? 0) - (a.temperatur ?? 0)
  );
  const trygtMaksAntall = Number.isFinite(maksAntall) ? maksAntall : 5;
  const antallSteder = Math.max(1, Math.min(Math.floor(trygtMaksAntall), 20));
  const toppSteder = sortedSteder.slice(0, antallSteder);
  const hovedIndex = clampIndex(hovedbadested, toppSteder.length);
  const hoved = toppSteder[hovedIndex] ?? standardSteder[0];
  const hovedStatus = getBadestatus(hoved.temperatur);
  const brukerApiEndepunkt = Boolean(trimmedApiEndepunkt);
  const faktiskKilde = brukerApiEndepunkt
    ? apiData?.kilde ?? YR_KREDITERING
    : kilde;
  const skalViseKilde = visKilde || brukerApiEndepunkt;
  const apiOppdatertTekst = formatOppdatert(apiData?.oppdatert);
  const faktiskOppdatertTekst = apiOppdatertTekst ?? oppdatertTekst;

  const cssVars = {
    "--badis-background": bakgrunn,
    "--badis-accent": aksent,
    "--badis-warm": varmAksent,
    "--badis-text": tekstfarge,
  } as React.CSSProperties;

  return (
    <section className={styles.wrapper} style={cssVars} aria-label={merkelapp}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>{merkelapp}</p>
          <h2 className={styles.title}>{tittel}</h2>
        </div>
        <p className={styles.updated}>{faktiskOppdatertTekst}</p>
      </div>

      {ingress && <p className={styles.intro}>{ingress}</p>}

      <div className={styles.content}>
        <article
          className={styles.feature}
          aria-label={`Hovedbadested: ${hoved.navn}`}
        >
          <div className={styles.featureText}>
            <p className={styles.placeMeta}>{hoved.omrade}</p>
            <h3 className={styles.placeName}>{hoved.navn}</h3>
            {hoved.notat && <p className={styles.note}>{hoved.notat}</p>}
          </div>

          <div className={styles.temperatureBlock}>
            <span className={styles.temperature}>
              {formatTemperatur(hoved.temperatur)}
              <span className={styles.degree}>°</span>
            </span>
            <span className={`${styles.status} ${hovedStatus.className}`}>
              {hovedStatus.label}
            </span>
          </div>

          <div className={styles.featureFooter}>
            <span>
              {hoved.maltKlokken
                ? `Målt kl. ${hoved.maltKlokken}`
                : "Måletid ukjent"}
            </span>
            {hoved.endring && (
              <span>
                {getEndringSymbol(hoved.endring)}{" "}
                {getEndringLabel(hoved.endring)}
              </span>
            )}
          </div>
        </article>

        <div
          className={styles.list}
          aria-label="Badesteder rangert etter temperatur"
        >
          {toppSteder.map((sted, index) => {
            const status = getBadestatus(sted.temperatur);

            return (
              <article
                className={styles.row}
                key={`${sted.navn}-${sted.omrade}-${index}`}
              >
                <div className={styles.rank}>{index + 1}</div>
                <div className={styles.rowText}>
                  <h3>{sted.navn}</h3>
                  <p>
                    {sted.omrade}
                    {sted.maltKlokken ? ` · ${sted.maltKlokken}` : ""}
                  </p>
                </div>
                <div className={styles.rowTemperature}>
                  <strong>{formatTemperatur(sted.temperatur)}°</strong>
                  <span className={`${styles.status} ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {(skalViseKilde || visApiHint) && (
        <footer className={styles.footer}>
          {skalViseKilde && <span>{faktiskKilde}</span>}
          {visApiHint && trimmedApiEndepunkt && (
            <span
              className={`${styles.dataStatus} ${
                apiStatus === "error" ? styles.dataStatusError : ""
              }`}
            >
              {apiStatus === "success"
                ? "Live-data"
                : apiStatus === "loading"
                ? "Henter live-data"
                : apiStatus === "error"
                ? "Viser manuelle verdier"
                : disabled && !hentApiIEditor
                ? "Manuelle verdier i editor"
                : "Klar for live-data"}
            </span>
          )}
        </footer>
      )}
    </section>
  );
};

registerVevComponent(BadetemperaturWidget, {
  name: "Badetemperatur-widget",
  type: "standard",
  props: [
    {
      type: "group",
      title: "Innhold",
      fields: [
        { name: "merkelapp", type: "string", initialValue: "Badetemperaturer" },
        {
          name: "tittel",
          type: "string",
          initialValue: "De fem varmeste badestedene i Trondheim akkurat nå",
        },
        {
          name: "ingress",
          type: "string",
          initialValue:
            "Se hvor badevannet holder høyest temperatur i Trondheim.",
          options: { type: "text", multiline: true },
        },
        {
          name: "oppdatertTekst",
          type: "string",
          initialValue: "Oppdatert i dag kl. 08:30",
        },
        {
          name: "kilde",
          type: "string",
          initialValue: YR_KREDITERING,
        },
      ],
    },
    {
      type: "group",
      title: "Badesteder",
      fields: [
        {
          name: "hovedbadested",
          type: "number",
          initialValue: 0,
          options: { min: 0, max: 4, display: "slider" },
        },
        {
          name: "steder",
          type: "array",
          of: "object",
          fields: [
            { name: "navn", type: "string", initialValue: "Munkholmen" },
            {
              name: "omrade",
              type: "string",
              initialValue: "Trondheimsfjorden",
            },
            {
              name: "temperatur",
              type: "number",
              initialValue: 17.8,
              options: { min: -2, max: 30, precision: 1 },
            },
            {
              name: "endring",
              type: "select",
              initialValue: "opp",
              options: {
                display: "dropdown",
                items: [
                  { label: "Stiger", value: "opp" },
                  { label: "Stabil", value: "stabil" },
                  { label: "Synker", value: "ned" },
                ],
              },
            },
            { name: "maltKlokken", type: "string", initialValue: "08:10" },
            { name: "notat", type: "string", initialValue: "Lett bris" },
          ],
          initialValue: standardSteder,
        },
      ],
    },
    {
      type: "group",
      title: "Data",
      options: { collapsed: true },
      fields: [
        {
          name: "apiEndepunkt",
          type: "string",
          initialValue: STANDARD_DATA_ENDEPUNKT,
        },
        { name: "hentApiIEditor", type: "boolean", initialValue: true },
        {
          name: "cacheMinutter",
          type: "number",
          initialValue: 10,
          options: { min: 1, max: 60, display: "slider" },
        },
        {
          name: "maksAntall",
          type: "number",
          initialValue: 5,
          options: { min: 1, max: 10, display: "slider" },
        },
        { name: "visKilde", type: "boolean", initialValue: true },
        { name: "visApiHint", type: "boolean", initialValue: true },
      ],
    },
    {
      type: "group",
      title: "Utseende",
      options: { collapsed: true },
      fields: [
        { name: "bakgrunn", type: "color", initialValue: "#f7fbf8" },
        { name: "aksent", type: "color", initialValue: "#007c89" },
        { name: "varmAksent", type: "color", initialValue: "#d9462f" },
        { name: "tekstfarge", type: "color", initialValue: "#171f22" },
      ],
    },
  ],
  editableCSS: [
    {
      selector: styles.wrapper,
      properties: ["background", "padding", "border-radius"],
    },
    {
      selector: styles.title,
      properties: ["font-size", "color"],
    },
  ],
});

export default BadetemperaturWidget;
