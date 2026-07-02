export const YR_BASE_URL = "https://badetemperaturer.yr.no";
export const YR_CREDIT = "Badetemperaturer levert av Yr";
export const DEFAULT_REGION_ID = "NO-50-5001";
export const DEFAULT_MUNICIPALITY = "Trondheim";
export const DEFAULT_LIMIT = 5;
export const CACHE_SECONDS = 600;

const cleanRegionId = (value) => {
  if (!value) return DEFAULT_REGION_ID;
  return /^NO-\d{2}(?:-\d{4})?$/.test(value) ? value : DEFAULT_REGION_ID;
};

const cleanLocationId = (value) => {
  if (!value) return undefined;
  return /^[A-Za-z0-9-]+$/.test(value) ? value : undefined;
};

const cleanCoordinate = (value) => {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const cleanLimit = (value) => {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit), 50));
};

const formatClock = (time) => {
  if (!time) return undefined;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return undefined;

  return new Intl.DateTimeFormat("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  }).format(date);
};

const normalizeTemperature = (temperature) => {
  const value =
    typeof temperature === "string"
      ? Number(temperature.replace(",", "."))
      : temperature;
  return Number.isFinite(value) ? value : undefined;
};

const normalizeApiKey = (apiKey) =>
  String(apiKey ?? "")
    .trim()
    .replace(/^apikey\s*[:=]\s*/i, "");

const fallbackPlaceFromUrl = (url) => ({
  name: url.searchParams.get("name") ?? url.searchParams.get("navn"),
  area: url.searchParams.get("area") ?? url.searchParams.get("omrade"),
});

const normalizeItem = (item, fallback = {}) => ({
  navn: item.locationName ?? fallback.name,
  omrade: item.municipality ?? item.county ?? fallback.area,
  temperatur: normalizeTemperature(item.temperature),
  maltKlokken: formatClock(item.time),
  notat: item.heatedWater ? "Oppvarmet vann" : undefined,
  locationId: item.locationId,
  latitude: item.position?.lat,
  longitude: item.position?.lon,
  time: item.time,
});

const areaFilterFromUrl = (url) => ({
  municipality: url.searchParams.get("municipality")?.toLowerCase(),
  county: url.searchParams.get("county")?.toLowerCase(),
});

const matchesAreaFilter = (item, filter) => {
  if (!item || typeof item !== "object") return false;

  if (filter.municipality) {
    return item.municipality?.toLowerCase() === filter.municipality;
  }

  if (filter.county) {
    return item.county?.toLowerCase() === filter.county;
  }

  return true;
};

const newestTime = (items) =>
  items
    .map((item) => item.time)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

export const createYrPath = (url) => {
  const mode = url.searchParams.get("mode") ?? "region";
  const locationId = cleanLocationId(url.searchParams.get("locationId"));

  if (mode === "all") return "/api/watertemperatures";

  if (mode === "location" && locationId) {
    return `/api/locations/${locationId}/watertemperatures`;
  }

  if (mode === "nearest" && locationId) {
    return `/api/locations/${locationId}/nearestwatertemperatures`;
  }

  if (mode === "nearest") {
    const lat = cleanCoordinate(url.searchParams.get("lat"));
    const lon = cleanCoordinate(url.searchParams.get("lon"));
    if (lat !== undefined && lon !== undefined) {
      return `/api/locations/${lat},${lon}/nearestwatertemperatures`;
    }
  }

  return `/api/regions/${cleanRegionId(
    url.searchParams.get("regionId")
  )}/watertemperatures`;
};

export const normalizeYrPayload = (rawItems, requestUrl) => {
  const url = new URL(requestUrl);
  const limit = cleanLimit(url.searchParams.get("limit"));
  const fallbackPlace = fallbackPlaceFromUrl(url);
  const areaFilter = areaFilterFromUrl(url);
  const allItems = Array.isArray(rawItems)
    ? rawItems
        .filter((item) => matchesAreaFilter(item, areaFilter))
        .map((item) => normalizeItem(item, fallbackPlace))
        .filter((item) => item.navn && item.temperatur !== undefined)
    : [];
  const sortedItems = [...allItems].sort(
    (a, b) => (b.temperatur ?? 0) - (a.temperatur ?? 0)
  );

  return {
    source: YR_CREDIT,
    updatedAt: newestTime(allItems),
    items: sortedItems.slice(0, limit),
  };
};

export const fetchYrPayload = async ({
  requestUrl,
  apiKey,
  fetchImpl = fetch,
}) => {
  const url = new URL(requestUrl);
  const yrUrl = `${YR_BASE_URL}${createYrPath(url)}`;
  const yrResponse = await fetchImpl(yrUrl, {
    headers: {
      apikey: normalizeApiKey(apiKey),
      Accept: "application/json",
      "User-Agent": "Adresseavisen badetemperatur-widget",
    },
  });

  if (!yrResponse.ok) {
    const error = new Error("Yr request failed");
    error.status = yrResponse.status;
    throw error;
  }

  return normalizeYrPayload(await yrResponse.json(), requestUrl);
};
