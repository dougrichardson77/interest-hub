import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRuntimeConfig } from "./lib/config.js";
import { AUTH_ENABLED, STORAGE_MODE } from "./lib/store.js";
import { filterTutorials, buildFacets } from "./lib/tutorials.js";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const config = getRuntimeConfig();

const refreshInFlight = new Map();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/tutorials" && req.method === "GET") {
      await handleGetTutorials(req, url, res);
      return;
    }

    if (url.pathname === "/api/app-config" && req.method === "GET") {
      handleGetAppConfig(res);
      return;
    }

    if (url.pathname === "/api/interests" && req.method === "GET") {
      await handleGetInterests(req, res);
      return;
    }

    if (url.pathname === "/api/interests" && req.method === "POST") {
      const context = await getRequestContext(req);
      const body = await readJsonBody(req);
      const store = await createInterest(body, context);
      sendJson(res, 201, buildInterestsPayload(store));
      return;
    }

    const interestMatch = url.pathname.match(/^\/api\/interests\/([^/]+)$/);
    if (interestMatch && req.method === "DELETE") {
      const context = await getRequestContext(req);
      const store = await deleteInterest(decodeURIComponent(interestMatch[1]), context);
      sendJson(res, 200, buildInterestsPayload(store));
      return;
    }

    if (interestMatch && req.method === "PATCH") {
      const context = await getRequestContext(req);
      const body = await readJsonBody(req);
      const store = body.active
        ? await setActiveInterest(decodeURIComponent(interestMatch[1]), context)
        : await readStore(context);
      sendJson(res, 200, buildInterestsPayload(store));
      return;
    }

    const interestRefreshMatch = url.pathname.match(/^\/api\/interests\/([^/]+)\/refresh$/);
    if (interestRefreshMatch && req.method === "POST") {
      await handleRefresh(req, res, decodeURIComponent(interestRefreshMatch[1]));
      return;
    }

    if (url.pathname === "/api/refresh" && req.method === "POST") {
      await handleRefresh(req, res);
      return;
    }

    const stateMatch = url.pathname.match(/^\/api\/tutorials\/([^/]+)\/state$/);
    if (stateMatch && req.method === "PATCH") {
      const context = await getRequestContext(req);
      const body = await readJsonBody(req);
      const updated = await updateTutorialState(decodeURIComponent(stateMatch[1]), body, context);
      sendJson(res, 200, { tutorial: updated });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "Endpoint not found" });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, {
      error: error.message || "Unexpected server error"
    });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Interest Tutorial Hub running at http://${config.host}:${config.port}`);
  scheduleRefresh();
});

async function handleGetTutorials(req, url, res) {
  const context = await getRequestContext(req);
  const store = await readStore(context);
  const interestId = url.searchParams.get("interestId") || store.activeInterestId;
  const interest = getInterest(store, interestId);
  const filters = Object.fromEntries(url.searchParams.entries());
  const baseTutorials = filterTutorials(store.tutorials, { interestId: interest.id });
  const tutorials = filterTutorials(store.tutorials, { ...filters, interestId: interest.id });
  const facets = buildFacets(baseTutorials);

  sendJson(res, 200, {
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
  });
}

function handleGetAppConfig(res) {
  sendJson(res, 200, {
    authEnabled: AUTH_ENABLED,
    storageMode: STORAGE_MODE,
    supabaseUrl: AUTH_ENABLED ? config.supabaseUrl : "",
    supabaseAnonKey: AUTH_ENABLED ? config.supabaseAnonKey : ""
  });
}

async function handleGetInterests(req, res) {
  const context = await getRequestContext(req);
  const store = await readStore(context);
  sendJson(res, 200, buildInterestsPayload(store));
}

async function handleRefresh(req, res, requestedInterestId = null) {
  const context = await getRequestContext(req);
  const storeBeforeRefresh = await readStore(context);
  const interest = getInterest(storeBeforeRefresh, requestedInterestId || storeBeforeRefresh.activeInterestId);

  try {
    const store = await runRefresh(interest.id, context);
    sendJson(res, 200, {
      meta: {
        total: countTutorialsForInterest(store, interest.id),
        interest: getInterest(store, interest.id),
        lastRefreshedAt: getInterest(store, interest.id).lastRefreshedAt,
        lastRefreshStatus: getInterest(store, interest.id).lastRefreshStatus,
        lastRefreshError: getInterest(store, interest.id).lastRefreshError
      },
      tutorials: filterTutorials(store.tutorials, { interestId: interest.id })
    });
  } catch (error) {
    const store = await saveRefreshError(interest.id, error.message, context);
    sendJson(res, error.statusCode || 500, {
      error: error.message,
      meta: {
        total: countTutorialsForInterest(store, interest.id),
        interest: getInterest(store, interest.id),
        lastRefreshedAt: getInterest(store, interest.id).lastRefreshedAt,
        lastRefreshStatus: getInterest(store, interest.id).lastRefreshStatus,
        lastRefreshError: getInterest(store, interest.id).lastRefreshError
      },
      tutorials: filterTutorials(store.tutorials, { interestId: interest.id })
    });
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
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": getContentType(filePath),
      "Cache-Control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=3600"
    });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      const index = await readFile(path.join(PUBLIC_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(index);
      return;
    }
    throw error;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(payload);
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
