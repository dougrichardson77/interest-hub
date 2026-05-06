import test from "node:test";
import assert from "node:assert/strict";
import { parseBearerToken, readSupabaseUser } from "../lib/supabase.js";

test("parseBearerToken extracts the bearer token", () => {
  const token = parseBearerToken({ authorization: "Bearer abc123" });
  assert.equal(token, "abc123");
  assert.equal(parseBearerToken({}), "");
});

test("readSupabaseUser rejects missing tokens", async () => {
  await assert.rejects(
    () => readSupabaseUser("", { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "anon" }),
    (error) => error?.statusCode === 401
  );
});

test("readSupabaseUser rejects invalid supabase responses", async () => {
  const mockFetch = async () => ({
    ok: false,
    json: async () => ({ message: "bad token" })
  });

  await assert.rejects(
    () =>
      readSupabaseUser("token", {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon"
      }, mockFetch),
    (error) => error?.statusCode === 401
  );
});
