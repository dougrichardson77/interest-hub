import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { spawn } from "node:child_process";

const nodePath = process.execPath;

test("API server exposes hardened endpoints and validation", async (t) => {
  const port = 4300 + Math.floor(Math.random() * 300);
  const localDataDir = await mkdtemp(path.join(os.tmpdir(), "interest-hub-test-"));
  const server = spawn(nodePath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      LOCAL_DATA_DIR: localDataDir,
      AUTO_REFRESH: "false",
      CORS_ORIGIN_ALLOWLIST: "http://127.0.0.1:4173"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logs = [];
  server.stdout.on("data", (chunk) => logs.push(String(chunk)));
  server.stderr.on("data", (chunk) => logs.push(String(chunk)));

  t.after(async () => {
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
    await rm(localDataDir, { recursive: true, force: true });
  });

  await waitForServer(`http://127.0.0.1:${port}/api/health`, 10_000);

  const health = await fetchJson(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.data.environment, "test");

  const version = await fetchJson(`http://127.0.0.1:${port}/api/version`);
  assert.equal(version.status, 200);
  assert.equal(version.body.ok, true);
  assert.match(version.body.data.appVersion, /^\d+\.\d+\.\d+/);

  const interests = await fetchJson(`http://127.0.0.1:${port}/api/interests`);
  assert.equal(interests.status, 200);
  assert.equal(interests.body.ok, true);
  assert.equal(Array.isArray(interests.body.data.interests), true);
  assert.equal(interests.body.data.interests.length >= 1, true);

  const invalidInterest = await fetchJson(`http://127.0.0.1:${port}/api/interests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "" })
  });
  assert.equal(invalidInterest.status, 422);
  assert.equal(invalidInterest.body.ok, false);
  assert.equal(invalidInterest.body.error.code, "VALIDATION_ERROR");

  const createdInterest = await fetchJson(`http://127.0.0.1:${port}/api/interests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Houdini FX",
      searchQueries: ["Houdini fx tutorial"],
      topics: ["Houdini", "FX"],
      trustedChannels: ["SideFX"]
    })
  });
  assert.equal(createdInterest.status, 201);
  assert.equal(createdInterest.body.ok, true);
  assert.equal(createdInterest.body.data.activeInterestId.includes("houdini"), true);

  const invalidFilter = await fetchJson(`http://127.0.0.1:${port}/api/tutorials?saved=maybe`);
  assert.equal(invalidFilter.status, 422);
  assert.equal(invalidFilter.body.ok, false);
  assert.equal(invalidFilter.body.error.code, "VALIDATION_ERROR");

  const unknownRoute = await fetchJson(`http://127.0.0.1:${port}/api/nope`);
  assert.equal(unknownRoute.status, 404);
  assert.equal(unknownRoute.body.ok, false);
  assert.equal(unknownRoute.body.error.code, "ENDPOINT_NOT_FOUND");

  assert.equal(logs.some((line) => line.includes('"event":"http_request"')), true);
});

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function waitForServer(url, timeoutMs) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  throw new Error(`Timed out waiting for server: ${url}`);
}
