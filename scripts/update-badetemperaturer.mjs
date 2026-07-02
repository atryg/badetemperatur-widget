import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_LIMIT,
  DEFAULT_MUNICIPALITY,
  DEFAULT_REGION_ID,
  fetchYrPayload,
} from "../proxy/yr-proxy-core.mjs";

const OUTPUT_PATH = resolve("public/data/trondheim-top5.json");
const REQUEST_URL = `https://adresseavisen.local/badetemperaturer?mode=all&municipality=${encodeURIComponent(
  DEFAULT_MUNICIPALITY
)}&limit=${DEFAULT_LIMIT}`;
const OSLO_TIME_ZONE = "Europe/Oslo";

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
    if (error.code !== "ENOENT") throw error;
  }

  return values;
};

const getOsloHour = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: OSLO_TIME_ZONE,
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value;
  return Number(hour);
};

const isUpdateWindow = () => {
  const hour = getOsloHour();
  return hour >= 6 && hour <= 22 && hour % 2 === 0;
};

const setGithubOutput = async (name, value) => {
  if (!process.env.GITHUB_OUTPUT) return;
  await writeFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, {
    flag: "a",
  });
};

const main = async () => {
  const respectSchedule = process.argv.includes("--respect-schedule");

  if (respectSchedule && !isUpdateWindow()) {
    console.log(
      "Utenfor oppdateringsvinduet for Europe/Oslo. Hopper over API-kall."
    );
    await setGithubOutput("updated", "false");
    return;
  }

  const env = await loadEnv();
  const apiKey = env.YR_BADETEMPERATURER_API_KEY;

  if (!apiKey) {
    throw new Error("Mangler YR_BADETEMPERATURER_API_KEY.");
  }

  const payload = await fetchYrPayload({
    requestUrl: REQUEST_URL,
    apiKey,
  });
  const body = {
    generatedAt: new Date().toISOString(),
    regionId: DEFAULT_REGION_ID,
    regionName: DEFAULT_MUNICIPALITY,
    municipality: DEFAULT_MUNICIPALITY,
    limit: DEFAULT_LIMIT,
    ...payload,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(`${OUTPUT_PATH}.tmp`, `${JSON.stringify(body, null, 2)}\n`);
  await rename(`${OUTPUT_PATH}.tmp`, OUTPUT_PATH);

  console.log(
    `Skrev ${body.items.length} badetemperaturer til ${OUTPUT_PATH}. Varmest: ${
      body.items[0]?.navn ?? "ukjent"
    } ${body.items[0]?.temperatur ?? "?"}°`
  );
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
