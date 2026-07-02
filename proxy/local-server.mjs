import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CACHE_SECONDS,
  DEFAULT_LIMIT,
  DEFAULT_MUNICIPALITY,
  fetchYrPayload,
} from "./yr-proxy-core.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const ENV_PATH = resolve(process.cwd(), ".env");
const cache = new Map();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const writeJson = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders,
    ...headers,
  });
  res.end(JSON.stringify(body));
};

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
    const envFile = await readFile(ENV_PATH, "utf8");
    envFile.split(/\r?\n/).forEach((line) => parseEnvLine(line, values));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return values;
};

const env = await loadEnv();

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    writeJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!env.YR_BADETEMPERATURER_API_KEY) {
    writeJson(res, 500, { error: "Missing Yr API key" });
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (!url.searchParams.has("mode") && !url.searchParams.has("regionId")) {
    url.searchParams.set("mode", "all");
  }

  if (
    url.searchParams.get("mode") === "all" &&
    !url.searchParams.has("municipality")
  ) {
    url.searchParams.set("municipality", DEFAULT_MUNICIPALITY);
  }

  if (!url.searchParams.has("limit")) {
    url.searchParams.set("limit", String(DEFAULT_LIMIT));
  }

  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.createdAt < CACHE_SECONDS * 1000) {
    writeJson(res, 200, cached.payload, {
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    });
    return;
  }

  try {
    const payload = await fetchYrPayload({
      requestUrl: url.toString(),
      apiKey: env.YR_BADETEMPERATURER_API_KEY,
    });

    cache.set(cacheKey, { createdAt: Date.now(), payload });
    writeJson(res, 200, payload, {
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    });
  } catch (error) {
    writeJson(res, error.status ?? 500, {
      error: "Yr request failed",
      status: error.status ?? 500,
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Yr badetemperatur-proxy kjører på http://127.0.0.1:${PORT}/?mode=all&municipality=${encodeURIComponent(
      DEFAULT_MUNICIPALITY
    )}&limit=${DEFAULT_LIMIT}`
  );
});
