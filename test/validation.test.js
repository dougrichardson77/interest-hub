import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateInterestBody,
  validateSetActiveInterestBody,
  validateTutorialQueryFilters,
  validateTutorialStateBody
} from "../lib/validation.js";

test("validateCreateInterestBody accepts a valid payload", () => {
  const payload = validateCreateInterestBody({
    name: "OpenAI Codex",
    searchQueries: ["OpenAI Codex tutorial"],
    topics: ["Codex", "AI Coding"],
    trustedChannels: ["OpenAI Developers"]
  });

  assert.equal(payload.name, "OpenAI Codex");
  assert.deepEqual(payload.topics, ["Codex", "AI Coding"]);
});

test("validateCreateInterestBody rejects empty names", () => {
  assert.throws(
    () => validateCreateInterestBody({ name: "   " }),
    (error) => error?.statusCode === 422 && error?.errorCode === "VALIDATION_ERROR"
  );
});

test("validateSetActiveInterestBody enforces booleans", () => {
  assert.doesNotThrow(() => validateSetActiveInterestBody({ active: true }));
  assert.throws(
    () => validateSetActiveInterestBody({ active: "yes" }),
    (error) => error?.statusCode === 422
  );
});

test("validateTutorialStateBody requires at least one patch field", () => {
  assert.throws(
    () => validateTutorialStateBody({}),
    (error) => error?.statusCode === 422 && error?.errorCode === "VALIDATION_ERROR"
  );
  assert.doesNotThrow(() => validateTutorialStateBody({ saved: true }));
});

test("validateTutorialQueryFilters enforces known enum values", () => {
  const valid = validateTutorialQueryFilters(
    new URLSearchParams({
      saved: "true",
      watched: "all",
      duration: "short",
      quality: "trusted"
    })
  );
  assert.equal(valid.saved, "true");

  assert.throws(
    () => validateTutorialQueryFilters(new URLSearchParams({ duration: "invalid" })),
    (error) => error?.statusCode === 422
  );
});
