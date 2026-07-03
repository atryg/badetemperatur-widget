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
  maltTidspunkt?: string;
  notat?: string;
};

type NormalisertApiData = {
  steder: Badested[];
  kilde?: string;
  oppdatert?: string;
};

type ApiStatus = "idle" | "loading" | "success" | "error";
type ByKey = "oslo" | "bergen" | "stavanger-sandnes" | "trondheim" | "drammen";

type Props = {
  merkelapp?: string;
  tittel?: string;
  ingress?: string;
  oppdatertTekst?: string;
  kilde?: string;
  by?: ByKey;
  apiEndepunkt?: string;
  hentApiIEditor?: boolean;
  cacheMinutter?: number;
  maksAntall?: number;
  steder?: Badested[];
  visByvelger?: boolean;
  visKilde?: boolean;
  visApiHint?: boolean;
  bakgrunn?: string;
  transparentBakgrunn?: boolean;
  aksent?: string;
  varmAksent?: string;
  tekstfarge?: string;
};

const YR_KREDITERING = "Badetemperaturer levert av Yr";
const DATA_BASE_URL =
  "https://raw.githubusercontent.com/atryg/badetemperatur-widget/main/public/data";
const BYER: Array<{ key: ByKey; label: string; file: string }> = [
  { key: "oslo", label: "Oslo", file: "oslo-top5.json" },
  { key: "bergen", label: "Bergen", file: "bergen-top5.json" },
  {
    key: "stavanger-sandnes",
    label: "Stavanger/Sandnes",
    file: "stavanger-sandnes-top5.json",
  },
  { key: "trondheim", label: "Trondheim", file: "trondheim-top5.json" },
  { key: "drammen", label: "Drammen", file: "drammen-top5.json" },
];
const STANDARD_BY: ByKey = "trondheim";
const STANDARD_CACHE_MINUTTER = 1;
const apiCache = new Map<
  string,
  { hentet: number; data: NormalisertApiData }
>();

const getByConfig = (by?: string) =>
  BYER.find((valg) => valg.key === by) ??
  BYER.find((valg) => valg.key === STANDARD_BY) ??
  BYER[0];

const getStandardDataEndepunkt = (by?: string) => {
  const byConfig = getByConfig(by);
  return `${DATA_BASE_URL}/${byConfig.file}`;
};

const settInnValgtBy = (tekst: string, byLabel: string) =>
  tekst.replace(/\bTrondheim\b/g, byLabel);

const STANDARD_DATA_ENDEPUNKT = getStandardDataEndepunkt(STANDARD_BY);

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
    timeZone: "Europe/Oslo",
  }).format(date);
};

const getTidspunktPart = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) => parts.find((part) => part.type === type)?.value;

const formatMaltTidspunkt = (value?: string) => {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const parts = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  }).formatToParts(date);
  const currentYear = new Intl.DateTimeFormat("nb-NO", {
    year: "numeric",
    timeZone: "Europe/Oslo",
  }).format(new Date());
  const day = getTidspunktPart(parts, "day");
  const month = getTidspunktPart(parts, "month");
  const year = getTidspunktPart(parts, "year");
  const hour = getTidspunktPart(parts, "hour");
  const minute = getTidspunktPart(parts, "minute");

  if (!day || !month || !year || !hour || !minute) return undefined;

  const dateText =
    year === currentYear ? `${day}.${month}` : `${day}.${month}.${year}`;
  return `${dateText} kl. ${hour}:${minute}`;
};

const getSisteMalingTekst = (sted: Badested) =>
  formatMaltTidspunkt(sted.maltTidspunkt) ??
  (sted.maltKlokken ? `kl. ${sted.maltKlokken}` : undefined);

const formatOppdatert = (value?: string) => {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return `Oppdatert ${new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
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

const erStandardDataEndepunkt = (apiEndepunkt: string) => {
  try {
    const url = new URL(apiEndepunkt);
    const standardFiles = new Set(BYER.map((by) => by.file));
    const pathParts = url.pathname.split("/");
    const filnavn = pathParts[pathParts.length - 1];

    return (
      url.hostname === "raw.githubusercontent.com" &&
      url.pathname.startsWith(
        "/atryg/badetemperatur-widget/main/public/data/"
      ) &&
      Boolean(filnavn && standardFiles.has(filnavn))
    );
  } catch {
    return false;
  }
};

const getEffektivCacheMinutter = (
  apiEndepunkt: string,
  cacheMinutter: number
) => {
  const tryggCache = Number.isFinite(cacheMinutter) ? cacheMinutter : 10;
  const begrensetCache = Math.max(1, Math.min(Math.floor(tryggCache), 60));

  if (erStandardDataEndepunkt(apiEndepunkt)) {
    return Math.min(begrensetCache, STANDARD_CACHE_MINUTTER);
  }

  return begrensetCache;
};

const getFetchUrl = (apiEndepunkt: string, cacheWindow: number) => {
  if (!erStandardDataEndepunkt(apiEndepunkt)) return apiEndepunkt;

  const url = new URL(apiEndepunkt);
  url.searchParams.set("badisCache", String(cacheWindow));
  return url.toString();
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
  const maltTidspunkt = getString(item.maltTidspunkt ?? item.time);

  return {
    navn,
    omrade,
    temperatur,
    endring,
    maltKlokken: getString(item.maltKlokken) ?? formatKlokke(maltTidspunkt),
    maltTidspunkt,
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
    oppdatert = getString(
      payload.generatedAt ?? payload.oppdatert ?? payload.updatedAt
    );
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
  const endpoint = apiEndepunkt.trim();
  const effektivCacheMinutter = getEffektivCacheMinutter(
    endpoint,
    cacheMinutter
  );
  const cacheTtlMs = effektivCacheMinutter * 60 * 1000;
  const cacheWindow = Math.floor(Date.now() / cacheTtlMs);
  const cacheKey = `${endpoint}::${cacheWindow}`;
  const cached = apiCache.get(cacheKey);

  if (cached && Date.now() - cached.hentet < cacheTtlMs) {
    return cached.data;
  }

  const response = await fetch(getFetchUrl(endpoint, cacheWindow), {
    cache: "no-store",
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
  by = STANDARD_BY,
  apiEndepunkt = STANDARD_DATA_ENDEPUNKT,
  hentApiIEditor = true,
  cacheMinutter = STANDARD_CACHE_MINUTTER,
  maksAntall = 5,
  steder = standardSteder,
  visByvelger = true,
  visKilde = true,
  visApiHint = true,
  bakgrunn = "#f7fbf8",
  transparentBakgrunn = false,
  aksent = "#007c89",
  varmAksent = "#d9462f",
  tekstfarge = "#171f22",
}: Props) => {
  const { disabled } = useEditorState();
  const [apiStatus, setApiStatus] = React.useState<ApiStatus>("idle");
  const [apiData, setApiData] = React.useState<NormalisertApiData | null>(null);
  const bySelectId = React.useId();

  const startBy = getByConfig(by);
  const [valgtByKey, setValgtByKey] = React.useState<ByKey>(startBy.key);
  const valgtBy = getByConfig(valgtByKey);
  const innstiltApiEndepunkt = apiEndepunkt.trim();
  const brukerStandardDataEndepunkt =
    !innstiltApiEndepunkt || erStandardDataEndepunkt(innstiltApiEndepunkt);
  const trimmedApiEndepunkt = brukerStandardDataEndepunkt
    ? getStandardDataEndepunkt(valgtBy.key)
    : innstiltApiEndepunkt;
  const effektivCacheMinutter = getEffektivCacheMinutter(
    trimmedApiEndepunkt,
    cacheMinutter
  );
  const kanHenteApi =
    Boolean(trimmedApiEndepunkt) &&
    (!disabled || hentApiIEditor || brukerStandardDataEndepunkt);
  const skalViseByvelger = visByvelger && brukerStandardDataEndepunkt;

  React.useEffect(() => {
    setValgtByKey(startBy.key);
  }, [startBy.key]);

  React.useEffect(() => {
    if (!kanHenteApi) {
      setApiStatus("idle");
      setApiData(null);
      return;
    }

    let controller: AbortController | undefined;

    const hentData = () => {
      controller?.abort();
      controller = new AbortController();
      setApiStatus("loading");

      fetchApiData(
        trimmedApiEndepunkt,
        effektivCacheMinutter,
        controller.signal
      )
        .then((data) => {
          setApiData(data);
          setApiStatus("success");
        })
        .catch((error: unknown) => {
          if (isRecord(error) && error.name === "AbortError") return;
          setApiData(null);
          setApiStatus("error");
        });
    };

    hentData();

    const interval = window.setInterval(
      hentData,
      effektivCacheMinutter * 60 * 1000
    );

    return () => {
      controller?.abort();
      window.clearInterval(interval);
    };
  }, [effektivCacheMinutter, kanHenteApi, trimmedApiEndepunkt]);

  const apiSteder = apiData?.steder.length ? apiData.steder : undefined;
  const synligeSteder = apiSteder ?? (steder?.length ? steder : standardSteder);
  const sortedSteder = [...synligeSteder].sort(
    (a, b) => (b.temperatur ?? 0) - (a.temperatur ?? 0)
  );
  const trygtMaksAntall = Number.isFinite(maksAntall) ? maksAntall : 5;
  const antallSteder = Math.max(1, Math.min(Math.floor(trygtMaksAntall), 20));
  const toppSteder = sortedSteder.slice(0, antallSteder);
  const brukerApiEndepunkt = Boolean(trimmedApiEndepunkt);
  const faktiskKilde = brukerApiEndepunkt
    ? apiData?.kilde ?? YR_KREDITERING
    : kilde;
  const skalViseKilde = visKilde || brukerApiEndepunkt;
  const apiOppdatertTekst = formatOppdatert(apiData?.oppdatert);
  const faktiskOppdatertTekst = apiOppdatertTekst ?? oppdatertTekst;
  const faktiskTittel = brukerStandardDataEndepunkt
    ? settInnValgtBy(tittel, valgtBy.label)
    : tittel;
  const faktiskIngress = brukerStandardDataEndepunkt
    ? settInnValgtBy(ingress, valgtBy.label)
    : ingress;

  const cssVars = {
    "--badis-background": transparentBakgrunn ? "transparent" : bakgrunn,
    "--badis-accent": aksent,
    "--badis-warm": varmAksent,
    "--badis-text": tekstfarge,
  } as React.CSSProperties;

  return (
    <section className={styles.wrapper} style={cssVars} aria-label={merkelapp}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>{merkelapp}</p>
          <h2 className={styles.title}>{faktiskTittel}</h2>
        </div>
        <p className={styles.updated}>{faktiskOppdatertTekst}</p>
      </div>

      {faktiskIngress && <p className={styles.intro}>{faktiskIngress}</p>}

      {skalViseByvelger && (
        <div className={styles.controls}>
          <div className={styles.cityPicker}>
            <label className={styles.cityPickerLabel} htmlFor={bySelectId}>
              By
            </label>
            <div className={styles.selectWrap}>
              <select
                id={bySelectId}
                className={styles.citySelect}
                value={valgtBy.key}
                onChange={(event) => {
                  const nesteBy = getByConfig(event.currentTarget.value);
                  setValgtByKey(nesteBy.key);
                }}
              >
                {BYER.map((byValg) => (
                  <option key={byValg.key} value={byValg.key}>
                    {byValg.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div
        className={styles.cardGrid}
        aria-label={`Fem varmeste badesteder i ${valgtBy.label} rangert etter temperatur`}
      >
        {toppSteder.map((sted, index) => {
          const status = getBadestatus(sted.temperatur);
          const sisteMalingTekst = getSisteMalingTekst(sted);

          return (
            <article
              className={`${styles.badeKort} ${
                index === 0 ? styles.varmest : ""
              }`}
              key={`${sted.navn}-${sted.omrade}-${index}`}
            >
              <div className={styles.cardTop}>
                <span className={styles.rank}>{index + 1}</span>
                <span className={`${styles.status} ${status.className}`}>
                  {status.label}
                </span>
              </div>

              <div className={styles.cardTemperature}>
                <strong>
                  {formatTemperatur(sted.temperatur)}
                  <span>°</span>
                </strong>
              </div>

              <div className={styles.cardText}>
                <h3>{sted.navn}</h3>
                <p
                  aria-label={
                    sisteMalingTekst
                      ? `Siste måling ${sisteMalingTekst}`
                      : "Siste måling ikke oppgitt"
                  }
                >
                  {sisteMalingTekst ? (
                    <>
                      <span className={styles.measureText}>Siste måling</span>
                      <span className={styles.measurePrefix}> </span>
                      <span className={styles.measureTime}>
                        {sisteMalingTekst}
                      </span>
                    </>
                  ) : (
                    <span className={styles.measureText}>
                      Siste måling ikke oppgitt
                    </span>
                  )}
                </p>
              </div>
            </article>
          );
        })}
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
            {
              name: "maltTidspunkt",
              type: "string",
              initialValue: "2026-07-02T08:10:00+02:00",
            },
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
          name: "by",
          type: "select",
          initialValue: STANDARD_BY,
          options: {
            display: "dropdown",
            items: BYER.map((byValg) => ({
              label: byValg.label,
              value: byValg.key,
            })),
          },
        },
        {
          name: "apiEndepunkt",
          type: "string",
          initialValue: STANDARD_DATA_ENDEPUNKT,
        },
        { name: "hentApiIEditor", type: "boolean", initialValue: true },
        {
          name: "cacheMinutter",
          type: "number",
          initialValue: STANDARD_CACHE_MINUTTER,
          options: { min: 1, max: 60, display: "slider" },
        },
        {
          name: "maksAntall",
          type: "number",
          initialValue: 5,
          options: { min: 1, max: 10, display: "slider" },
        },
        { name: "visByvelger", type: "boolean", initialValue: true },
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
        {
          name: "transparentBakgrunn",
          type: "boolean",
          initialValue: false,
        },
        { name: "aksent", type: "color", initialValue: "#007c89" },
        { name: "varmAksent", type: "color", initialValue: "#d9462f" },
        { name: "tekstfarge", type: "color", initialValue: "#171f22" },
      ],
    },
  ],
  editableCSS: [
    {
      selector: styles.wrapper,
      properties: ["background", "padding", "border-radius", "font-family"],
    },
    {
      selector: styles.title,
      properties: ["font-size", "color", "font-family"],
    },
    {
      selector: styles.cardTemperature,
      properties: ["color", "font-family"],
    },
    {
      selector: styles.cardText,
      properties: ["color", "font-family"],
    },
    {
      selector: styles.kicker,
      properties: ["color", "font-family"],
    },
  ],
});

export default BadetemperaturWidget;
