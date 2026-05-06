import { randomUUID } from "node:crypto";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-XSS-Protection": "0",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

export function requestId() {
  return randomUUID();
}

export function readJsonBody(req, maxBytes = 1024 * 64) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        error.errorCode = "REQUEST_BODY_TOO_LARGE";
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!isPlainObject(parsed)) {
          const error = new Error("JSON body must be an object.");
          error.statusCode = 400;
          error.errorCode = "INVALID_JSON_BODY";
          reject(error);
          return;
        }
        resolve(parsed);
      } catch (_error) {
        const error = new Error("Invalid JSON body.");
        error.statusCode = 400;
        error.errorCode = "INVALID_JSON_BODY";
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

export function sendApiSuccess(res, statusCode, data, { requestId, appVersion, extraMeta = {} } = {}) {
  const payload = {
    ok: true,
    data,
    meta: {
      requestId,
      appVersion,
      timestamp: new Date().toISOString(),
      ...extraMeta
    }
  };
  sendJson(res, statusCode, payload);
}

export function sendApiError(
  res,
  error,
  { requestId, appVersion, defaultMessage = "Unexpected server error" } = {}
) {
  const statusCode = normalizeStatusCode(error?.statusCode);
  const message = error?.message || defaultMessage;

  const payload = {
    ok: false,
    error: {
      code: error?.errorCode || codeForStatus(statusCode),
      message,
      requestId
    },
    meta: {
      requestId,
      appVersion,
      timestamp: new Date().toISOString()
    }
  };
  if (error?.details !== undefined) {
    payload.error.details = error.details;
  }
  sendJson(res, statusCode, payload);
}

export function sendApiNotFound(res, { requestId, appVersion }) {
  const error = new Error("Endpoint not found.");
  error.statusCode = 404;
  error.errorCode = "ENDPOINT_NOT_FOUND";
  sendApiError(res, error, { requestId, appVersion });
}

export function sendText(res, statusCode, payload, additionalHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    ...SECURITY_HEADERS,
    ...additionalHeaders
  });
  res.end(payload);
}

export function sendJson(res, statusCode, payload, additionalHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
    ...additionalHeaders
  });
  res.end(JSON.stringify(payload));
}

export function setStaticSecurityHeaders(headers = {}) {
  return {
    ...SECURITY_HEADERS,
    "Content-Security-Policy": "default-src 'self'; img-src 'self' https: data:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; script-src 'self' https://esm.sh; style-src 'self' 'unsafe-inline'; connect-src 'self' https:;",
    ...headers
  };
}

export function applyCors(req, res, config) {
  const origin = req.headers.origin;
  if (!origin) return false;

  const configuredOrigins = config.corsOriginAllowlist || [];
  if (!configuredOrigins.length) return false;

  const allowlist = new Set(configuredOrigins);
  const isAllowed = allowlist.has(origin);
  if (!isAllowed) {
    const error = new Error("Origin is not allowed.");
    error.statusCode = 403;
    error.errorCode = "ORIGIN_NOT_ALLOWED";
    throw error;
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "600"
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return true;
  }

  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }
  return false;
}

export function createRateLimiter({ windowMs, maxRequests }) {
  const bucket = new Map();

  return function checkLimit(key) {
    const now = Date.now();
    const normalizedKey = key || "anonymous";
    const current = bucket.get(normalizedKey);

    if (!current || current.resetAt <= now) {
      const resetAt = now + windowMs;
      bucket.set(normalizedKey, { count: 1, resetAt });
      return {
        allowed: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        retryAfterSeconds: Math.ceil(windowMs / 1000)
      };
    }

    current.count += 1;
    const remaining = Math.max(0, maxRequests - current.count);

    if (current.count > maxRequests) {
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000)
      };
    }

    return {
      allowed: true,
      limit: maxRequests,
      remaining,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000)
    };
  };
}

export function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (forwarded.length) return forwarded[0];
  return req.socket?.remoteAddress || "unknown";
}

export function logRequest({
  requestId,
  method,
  pathname,
  statusCode,
  durationMs,
  ip,
  errorMessage = ""
}) {
  const payload = {
    level: statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info",
    event: "http_request",
    requestId,
    method,
    pathname,
    statusCode,
    durationMs: Math.round(durationMs),
    ip
  };

  if (errorMessage) payload.error = errorMessage;
  console.log(JSON.stringify(payload));
}

export function asHttpError(message, statusCode = 400, errorCode = "BAD_REQUEST") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function normalizeStatusCode(value) {
  const code = Number(value);
  if (Number.isInteger(code) && code >= 400 && code <= 599) return code;
  return 500;
}

function codeForStatus(statusCode) {
  if (statusCode === 400) return "BAD_REQUEST";
  if (statusCode === 401) return "UNAUTHORIZED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 409) return "CONFLICT";
  if (statusCode === 413) return "REQUEST_TOO_LARGE";
  if (statusCode === 422) return "UNPROCESSABLE_ENTITY";
  if (statusCode === 429) return "RATE_LIMITED";
  return "INTERNAL_SERVER_ERROR";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
