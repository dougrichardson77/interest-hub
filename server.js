import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRuntimeConfig } from "./lib/config.js";
import { AUTH_ENABLED, STORAGE_MODE } from "./lib/store.js";
import { buildFacets, filterTutorials } from "./lib/tutorials.js";
import {
  createInterest,
  deleteInterest,
  getInterest,
  readStore,
  saveIncomingTutorials,
  saveRefreshError,
  setActiveInterest,
  updateTutorialState
} from "./lib/store.js";
import { parseBearerToken, readSupabaseUser } from "./lib/supabase.js";
import { refreshFromYouTube } from "./lib/youtube.js";
import {
  applyCors,
  asHttpError,
  clientIp,
  createRateLimiter,
  logRequest,
  readJsonBody,
  requestId as makeRequestId,
  sendApiError,
  sendApiNotFound,
  sendApiSuccess,
  sendText,
  setStaticSecurityHeaders
} from "./lib/http.js";
import {
  validateCreateInterestBody,
  validateSetActiveInterestBody,
  validateTutorialQueryFilters,
  validateTutorialStateBody
} from "./lib/validation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const config = getRuntimeConfig();
const appVersion = readPackageVersion(config.appVersion);

const refreshInFlight = new Map();
const apiRateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  maxRequests: config.rateLimitMaxRequests
});
const refreshRateLimiter = createRateLimiter({
  windowMs: config.refreshRateLimitWindowMs,
  maxRequests: config.refreshRateLimitMaxRequests
});

const server = createServer(async (req, res) => {
  const reqId = makeRequestId();
  const startedAt = Date.now();
  const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;

  let statusCode = 500;
  let errorMessage = "";

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const isApiRoute = url.pathname.startsWith("/api/");

    if (isApiRoute) {
      const corsHandled = applyCors(req, res, config);
      if (corsHandled) {
        statusCode = 204;
        return;
      }

      applyRateLimit(req, res, reqId, apiRateLimiter, appVersion);
      if (url.pathname.includes("/refresh")) {
        applyRateLimit(req, res, reqId, refreshRateLimiter, appVersion);
      }
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      statusCode = 200;
      sendApiSuccess(
        res,
        200,
        {
          status: "ok",
          environment: config.appEnv,
          storageMode: STORAGE_MODE,
          authEnabled: AUTH_ENABLED,
          uptimeSeconds: Math.round(process.uptime())
        },
        { requestId: reqId, appVersion }
      );
      return;
    }

    if (url.pathname === "/api/version" && req.method === "GET") {
      statusCode = 200;
      sendApiSuccess(
        res,
        200,
        {
          appVersion,
          minClientVersion: config.minClientVersion,
          apiSchemaVersion: "2026-05-06"
        },
        { requestId: reqId, appVersion }
      );
      return;
    }

    if (url.pathname === "/api/tutorials" && req.method === "GET") {
      const payload = await handleGetTutorials(req, url);
      statusCode = 200;
      sendApiSuccess(res, 200, payload, { requestId: reqId, appVersion });
      return;
    }

    if (url.pathname === "/api/app-config" && req.method === "GET") {
      statusCode = 200;
      sendApiSuccess(res, 200, buildAppConfigPayload(), { requestId: reqId, appVersion });
      return;
    }

    if (url.pathname === "/api/interests" && req.method === "GET") {
      const payload = await handleGetInterests(req);
      statusCode = 200;
      sendApiSuccess(res, 200, payload, { requestId: reqId, appVersion });
      return;
    }

    if (url.pathname === "/api/interests" && req.method === "POST") {
      const context = await getRequestContext(req);
      const body = validateCreateInterestBody(await readJsonBody(req, config.jsonBodyLimitBytes));
      const store = await createInterest(body, context);
      statusCode = 201;
      sendApiSuccess(res, 201, buildInterestsPayload(store), { requestId: reqId, appVersion });
      return;
    }

    const interestMatch = url.pathname.match(/^\/api\/interests\/([^/]+)$/);
    if (interestMatch && req.method === "DELETE") {
      const context = await getRequestContext(req);
      const store = await deleteInterest(decodeURIComponent(interestMatch[1]), context);
      statusCode = 200;
      sendApiSuccess(res, 200, buildInterestsPayload(store), { requestId: reqId, appVersion });
      return;
    }

    if (interestMatch && req.method === "PATCH") {
      const context = await getRequestContext(req);
      const body = validateSetActiveInterestBody(await readJsonBody(req, config.jsonBodyLimitBytes));
      const store = body.active
        ? await setActiveInterest(decodeURIComponent(interestMatch[1]), context)
        : await readStore(context);
      statusCode = 200;
      sendApiSuccess(res, 200, buildInterestsPayload(store), { requestId: reqId, appVersion });
      return;
    }

    const interestRefreshMatch = url.pathname.match(/^\/api\/interests\/([^/]+)\/refresh$/);
    if (interestRefreshMatch && req.method === "POST") {
      const payload = await handleRefresh(req, decodeURIComponent(interestRefreshMatch[1]));
      statusCode = 200;
      sendApiSuccess(res, 200, payload, { requestId: reqId, appVersion });
      return;
    }

    if (url.pathname === "/api/refresh" && req.method === "POST") {
      const payload = await handleRefresh(req);
      statusCode = 200;
      sendApiSuccess(res, 200, payload, { requestId: reqId, appVersion });
      return;
    }

    const stateMatch = url.pathname.match(/^\/api\/tutorials\/([^/]+)\/state$/);
    if (stateMatch && req.method === "PATCH") {
      const context = await getRequestContext(req);
      const body = validateTutorialStateBody(await readJsonBody(req, config.jsonBodyLimitBytes));
      const updated = await updateTutorialState(decodeURIComponent(stateMatch[1]), body, context);
      statusCode = 200;
      sendApiSuccess(res, 200, { tutorial: updated }, { requestId: reqId, appVersion });
      return;
    }

    if (isApiRoute) {
      statusCode = 404;
      sendApiNotFound(res, { requestId: reqId, appVersion });
      return;
    }

    statusCode = await serveStatic(url.pathname, res);
  } catch (error) {
    statusCode = error?.statusCode || 500;
    errorMessage = error?.message || "Unexpected server error";
    sendApiError(res, error, { requestId: reqId, appVersion });
  } finally {
    logRequest({
      requestId: reqId,
      method: req.method || "GET",
      pathname,
      statusCode,
      durationMs: Date.now() - startedAt,
      ip: clientIp(req),
      errorMessage
    });
  }
});

server.listen(config.port, config.host, () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "server_started",
      appVersion,
      environment: config.appEnv,
      host: config.host,
      port: config.port,
      storageMode: STORAGE_MODE
    })
  );
  scheduleRefresh();
});

async function handleGetTutorials(req, url) {
  const context = await getRequestContext(req);
  const filters = validateTutorialQueryFilters(url.searchParams);
  const store = await readStore(context);
  const interestId = filters.interestId || store.activeInterestId;
  const interest = getInterest(store, interestId);
  const baseTutorials = filterTutorials(store.tutorials, { interestId: interest.id });
  const tutorials = filterTutorials(store.tutorials, { ...filters, interestId: interest.id });
  const facets = buildFacets(baseTutorials);

  return {
    tutorials,
    facets,
    meta: {
      interest,
      total: baseTutorials.length,
      filtered: tutorials.length,
      lastRefreshedAt: interest.lastRefreshedAt,
      lastRefreshStatus: interest.lastRefreshStatus,
      lastRefreshError: interest.lastRefreshError,
      searchQueries: interest.searchQueries.map((item) => item.query),
      apiConfigured: Boolean(config.youtubeApiKey),
      autoRefresh: config.autoRefresh && !AUTH_ENABLED,
      storageMode: STORAGE_MODE,
      refreshEveryHours: config.refreshEveryHours
    }
  };
}

function buildAppConfigPayload() {
  return {
    authEnabled: AUTH_ENABLED,
    storageMode: STORAGE_MODE,
    supabaseUrl: AUTH_ENABLED ? config.supabaseUrl : "",
    supabaseAnonKey: AUTH_ENABLED ? config.supabaseAnonKey : ""
  };
}

async function handleGetInterests(req) {
  const context = await getRequestContext(req);
  const store = await readStore(context);
  return buildInterestsPayload(store);
}

async function handleRefresh(req, requestedInterestId = null) {
  const context = await getRequestContext(req);
  const storeBeforeRefresh = await readStore(context);
  const interest = getInterest(storeBeforeRefresh, requestedInterestId || storeBeforeRefresh.activeInterestId);

  try {
    const store = await runRefresh(interest.id, context);
    return {
      meta: {
        total: countTutorialsForInterest(store, interest.id),
        interest: getInterest(store, interest.id),
        lastRefreshedAt: getInterest(store, interest.id).lastRefreshedAt,
        lastRefreshStatus: getInterest(store, interest.id).lastRefreshStatus,
        lastRefreshError: getInterest(store, interest.id).lastRefreshError
      },
      tutorials: filterTutorials(store.tutorials, { interestId: interest.id })
    };
  } catch (error) {
    const store = await saveRefreshError(interest.id, error.message, context);
    const wrappedError = asHttpError(error.message, error.statusCode || 500, error.errorCode || "REFRESH_FAILED");
    wrappedError.details = {
      meta: {
        total: countTutorialsForInterest(store, interest.id),
        interest: getInterest(store, interest.id),
        lastRefreshedAt: getInterest(store, interest.id).lastRefreshedAt,
        lastRefreshStatus: getInterest(store, interest.id).lastRefreshStatus,
        lastRefreshError: getInterest(store, interest.id).lastRefreshError
      },
      tutorials: filterTutorials(store.tutorials, { interestId: interest.id })
    };
    throw wrappedError;
  }
}

async function runRefresh(interestId, context = null) {
  const store = await readStore(context);
  const interest = getInterest(store, interestId);

  if (refreshInFlight.has(interest.id)) return refreshInFlight.get(interest.id);

  const refreshPromise = refreshFromYouTube({
    apiKey: config.youtubeApiKey,
    interest,
    publishedAfterDays: config.publishedAfterDays,
    maxResultsPerQuery: config.maxResultsPerQuery
  })
    .then((tutorials) =>
      saveIncomingTutorials(interest.id, tutorials, `Fetched ${tutorials.length} videos from YouTube`, context)
    )
    .finally(() => {
      refreshInFlight.delete(interest.id);
    });

  refreshInFlight.set(interest.id, refreshPromise);
  return refreshPromise;
}

async function scheduleRefresh() {
  if (!config.autoRefresh || !config.youtubeApiKey || AUTH_ENABLED) return;

  const intervalMs = config.refreshEveryHours * 60 * 60 * 1000;
  const store = await readStore();
  const interest = getInterest(store, store.activeInterestId);
  const lastRefreshMs = interest.lastRefreshedAt ? new Date(interest.lastRefreshedAt).getTime() : 0;
  const stale = Date.now() - lastRefreshMs > intervalMs;

  if (stale) {
    runRefresh(interest.id).catch((error) => {
      console.error(`Scheduled refresh failed: ${error.message}`);
    });
  }

  setInterval(() => {
    readStore()
      .then((latestStore) => runRefresh(latestStore.activeInterestId))
      .catch((error) => {
        console.error(`Scheduled refresh failed: ${error.message}`);
      });
  }, intervalMs);
}

async function serveStatic(pathname, res) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, normalizedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return 403;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(
      200,
      setStaticSecurityHeaders({
        "Content-Type": getContentType(filePath),
        "Cache-Control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=3600"
      })
    );
    res.end(content);
    return 200;
  } catch (error) {
    if (error.code === "ENOENT") {
      const index = await readFile(path.join(PUBLIC_DIR, "index.html"));
      res.writeHead(
        200,
        setStaticSecurityHeaders({
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        })
      );
      res.end(index);
      return 200;
    }
    throw error;
  }
}

function applyRateLimit(req, res, reqId, limiter, appVersionValue) {
  const key = `${clientIp(req)}:${req.method || "GET"}`;
  const result = limiter(key);

  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("Retry-After", String(result.retryAfterSeconds));

  if (!result.allowed) {
    throw asHttpError(
      "Too many requests. Please try again in a moment.",
      429,
      "RATE_LIMITED"
    );
  }

  res.setHeader("X-App-Version", appVersionValue);
  res.setHeader("X-Request-Id", reqId);
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function buildInterestsPayload(store) {
  return {
    activeInterestId: store.activeInterestId,
    interests: store.interests.map((interest) => ({
      ...interest,
      videoCount: countTutorialsForInterest(store, interest.id)
    }))
  };
}

function countTutorialsForInterest(store, interestId) {
  return store.tutorials.filter((tutorial) => (tutorial.interestIds || []).includes(interestId)).length;
}

async function getRequestContext(req) {
  if (!AUTH_ENABLED) return null;

  const accessToken = parseBearerToken(req.headers);
  const user = await readSupabaseUser(accessToken, config);
  return {
    accessToken,
    user
  };
}

function readPackageVersion(fallbackVersion) {
  try {
    const raw = readFileSync(path.join(__dirname, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed.version || fallbackVersion;
  } catch {
    return fallbackVersion;
  }
}
