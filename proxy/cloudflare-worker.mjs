import { CACHE_SECONDS, fetchYrPayload } from "./yr-proxy-core.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const jsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...headers,
    },
  });

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!env.YR_BADETEMPERATURER_API_KEY) {
      return jsonResponse({ error: "Missing Yr API key" }, 500);
    }

    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    const cached = await cache.match(cacheKey);

    if (cached) return cached;

    try {
      const payload = await fetchYrPayload({
        requestUrl: request.url,
        apiKey: env.YR_BADETEMPERATURER_API_KEY,
      });
      const response = jsonResponse(payload, 200, {
        "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      });

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      return jsonResponse(
        {
          error: "Yr request failed",
          status: error.status ?? 500,
        },
        error.status ?? 500
      );
    }
  },
};
