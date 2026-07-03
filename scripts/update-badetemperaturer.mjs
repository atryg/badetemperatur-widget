import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DEFAULT_LIMIT, fetchYrPayload } from "../proxy/yr-proxy-core.mjs";

const OSLO_TIME_ZONE = "Europe/Oslo";
const DATA_DIR = resolve("public/data");
const UPDATE_INTERVAL_MS = 2 * 60 * 60 * 1000;
const CITY_CONFIGS = [
  {
    key: "oslo",
    label: "Oslo",
    file: "oslo-top5.json",
    municipalities: [
      "Oslo",
      "Bærum",
      "Asker",
      "Lillestrøm",
      "Lørenskog",
      "Nordre Follo",
      "Rælingen",
      "Nittedal",
      "Lier",
    ],
  },
  {
    key: "bergen",
    label: "Bergen",
    file: "bergen-top5.json",
    municipalities: ["Bergen"],
  },
  {
    key: "stavanger-sandnes",
    label: "Stavanger/Sandnes",
    file: "stavanger-sandnes-top5.json",
    municipalities: ["Stavanger", "Sandnes", "Sola", "Randaberg"],
  },
  {
    key: "trondheim",
    label: "Trondheim",
    file: "trondheim-top5.json",
    municipalities: ["Trondheim"],
  },
  {
    key: "drammen",
    label: "Drammen",
    file: "drammen-top5.json",
    municipalities: ["Drammen", "Lier", "Øvre Eiker", "Asker", "Holmestrand"],
  },
];

const parseEnvLine = (line, values) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;

  const colonApiKey = trimmed.match(/^apikey\s*:\s*(.+)$/i);
  if (colonApiKey && !values.YR_BADETEMPERATURER_API_KEY) {
    values.YR_BADETEMPERATURER_API_KEY = colonApiKey[1].trim();
    return;
  }

  const separator = trimmed.indexOf("=");
  if (separator === -1) return;

  const key = trimmed.slice(0, separator).trim();
  const value = trimmed
    .slice(separator + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (key === "apikey" && !values.YR_BADETEMPERATURER_API_KEY) {
    values.YR_BADETEMPERATURER_API_KEY = value;
    return;
  }

  values[key] = value;
};

const loadEnv = async () => {
  const values = { ...process.env };

  try {
    const envFile = await readFile(resolve(".env"), "utf8");
    envFile.split(/\r?\n/).forEach((line) => parseEnvLine(line, values));
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  return values;
};

const getOsloHour = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: OSLO_TIME_ZONE,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  return Number(hour);
};

const isUpdateWindow = (date = new Date()) => {
  const hour = getOsloHour(date);
  return hour === 0 || (hour >= 6 && hour <= 23);
};

const parseGeneratedAt = (value) => {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const readCityGeneratedAt = async (city) => {
  try {
    const raw = await readFile(resolve(DATA_DIR, city.file), "utf8");
    const generatedAt = parseGeneratedAt(JSON.parse(raw).generatedAt);

    if (generatedAt !== undefined) return generatedAt;
    console.warn(`Fant ikke gyldig generatedAt i ${city.file}.`);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn(`Kunne ikke lese JSON i ${city.file}.`);
      return undefined;
    }

    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  return undefined;
};

const getOldestGeneratedAt = async () => {
  const generatedAtValues = await Promise.all(
    CITY_CONFIGS.map(readCityGeneratedAt)
  );

  if (generatedAtValues.some((value) => value === undefined)) {
    return undefined;
  }

  return Math.min(...generatedAtValues);
};

const formatOsloDateTime = (timestamp) =>
  new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: OSLO_TIME_ZONE,
  }).format(new Date(timestamp));

const isUpdateDue = async () => {
  const now = new Date();

  if (!isUpdateWindow(now)) {
    console.log(
      "Utenfor oppdateringsvinduet 06:00-00:59 Europe/Oslo. Hopper over API-kall."
    );
    return false;
  }

  const oldestGeneratedAt = await getOldestGeneratedAt();

  if (oldestGeneratedAt === undefined) {
    console.log("Mangler gyldig generatedAt i en eller flere datafiler.");
    return true;
  }

  if (now.getTime() - oldestGeneratedAt < UPDATE_INTERVAL_MS) {
    console.log(
      `Siste dataskriving var ${formatOsloDateTime(
        oldestGeneratedAt
      )}. Neste sjekk tidligst ${formatOsloDateTime(
        oldestGeneratedAt + UPDATE_INTERVAL_MS
      )}.`
    );
    return false;
  }

  return true;
};

const setGithubOutput = async (name, value) => {
  if (!process.env.GITHUB_OUTPUT) return;
  await writeFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, {
    flag: "a",
  });
};

const createRequestUrl = (city) => {
  const url = new URL("https://adresseavisen.local/badetemperaturer");
  url.searchParams.set("mode", "all");
  url.searchParams.set("municipalities", city.municipalities.join(","));
  url.searchParams.set("limit", String(DEFAULT_LIMIT));
  return url.toString();
};

const writeCityFile = async ({ city, apiKey, generatedAt }) => {
  const outputPath = resolve(DATA_DIR, city.file);
  const payload = await fetchYrPayload({
    requestUrl: createRequestUrl(city),
    apiKey,
  });
  const body = {
    generatedAt,
    cityKey: city.key,
    cityName: city.label,
    municipalities: city.municipalities,
    limit: DEFAULT_LIMIT,
    ...payload,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(`${outputPath}.tmp`, `${JSON.stringify(body, null, 2)}\n`);
  await rename(`${outputPath}.tmp`, outputPath);

  console.log(
    `Skrev ${body.items.length} badetemperaturer til ${outputPath}. Varmest: ${
      body.items[0]?.navn ?? "ukjent"
    } ${body.items[0]?.temperatur ?? "?"}°`
  );
};

const main = async () => {
  const respectSchedule = process.argv.includes("--respect-schedule");

  if (respectSchedule && !(await isUpdateDue())) {
    await setGithubOutput("updated", "false");
    return;
  }

  const env = await loadEnv();
  const apiKey = env.YR_BADETEMPERATURER_API_KEY;

  if (!apiKey) {
    throw new Error("Mangler YR_BADETEMPERATURER_API_KEY.");
  }

  const generatedAt = new Date().toISOString();
  for (const city of CITY_CONFIGS) {
    await writeCityFile({ city, apiKey, generatedAt });
  }
  await setGithubOutput("updated", "true");
};

main().catch(async (error) => {
  await setGithubOutput("updated", "false");
  if (error instanceof Error && "status" in error) {
    console.error(`${error.message} (status ${error.status})`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
