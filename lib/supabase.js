export async function readSupabaseUser(accessToken, config, fetchImpl = fetch) {
  if (!accessToken) {
    const error = new Error("Please sign in to use your dashboard.");
    error.statusCode = 401;
    throw error;
  }

  const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.id) {
    const error = new Error("Your session has expired. Please sign in again.");
    error.statusCode = 401;
    throw error;
  }

  return payload;
}

export async function supabaseRestRequest({
  config,
  accessToken,
  path,
  method = "GET",
  query = {},
  body,
  fetchImpl = fetch,
  headers = {}
}) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/${path}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetchImpl(url, {
    method,
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.message || payload.error_description || payload.error || "Supabase request failed");
    error.statusCode = response.status;
    error.supabase = payload;
    throw error;
  }

  return payload;
}

export function parseBearerToken(headers = {}) {
  const authorization = headers.authorization || headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1] : "";
}
