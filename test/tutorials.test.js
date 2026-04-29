import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveTags,
  filterTutorials,
  mergeTutorials,
  parseIsoDuration
} from "../lib/tutorials.js";
import { normalizeStore, removeInterestFromStore } from "../lib/store-json.js";

test("parseIsoDuration converts YouTube durations to seconds", () => {
  assert.equal(parseIsoDuration("PT8M9S"), 489);
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("P1DT2H"), 93600);
});

test("deriveTags detects core tutorial topics", () => {
  const tags = deriveTags({
    title: "Cinema 4D X-Particles Redshift simulation tutorial",
    description: "Use emitters and fields",
    queryTags: []
  });

  assert.deepEqual(tags, ["Cinema 4D", "Particles", "Redshift", "Simulation", "X-Particles"]);
});

test("mergeTutorials deduplicates and preserves saved/watched state", () => {
  const merged = mergeTutorials(
    [
      {
        videoId: "abc",
        title: "Old",
        publishedAt: "2026-01-01T00:00:00Z",
        saved: true,
        watched: true,
        sourceQueries: ["Cinema 4D tutorial"],
        tags: ["Cinema 4D"]
      }
    ],
    [
      {
        videoId: "abc",
        title: "New",
        publishedAt: "2026-02-01T00:00:00Z",
        saved: false,
        watched: false,
        sourceQueries: ["X-Particles tutorial"],
        tags: ["X-Particles"]
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, "New");
  assert.equal(merged[0].saved, true);
  assert.equal(merged[0].watched, true);
  assert.deepEqual(merged[0].sourceQueries, ["Cinema 4D tutorial", "X-Particles tutorial"]);
  assert.deepEqual(merged[0].tags, ["Cinema 4D", "X-Particles"]);
});

test("mergeTutorials preserves videos across multiple interests", () => {
  const merged = mergeTutorials(
    [
      {
        videoId: "shared",
        title: "Old",
        publishedAt: "2026-01-01T00:00:00Z",
        interestIds: ["c4d-xparticles"],
        sourceQueries: ["Cinema 4D tutorial"],
        tags: ["Cinema 4D"]
      }
    ],
    [
      {
        videoId: "shared",
        title: "New",
        publishedAt: "2026-02-01T00:00:00Z",
        interestIds: ["openai-codex"],
        sourceQueries: ["OpenAI Codex tutorial"],
        tags: ["OpenAI Codex"]
      }
    ]
  );

  assert.deepEqual(merged[0].interestIds, ["c4d-xparticles", "openai-codex"]);
});

test("normalizeStore migrates the legacy cache into the first interest", () => {
  const store = normalizeStore({
    lastRefreshedAt: "2026-04-29T00:00:00.000Z",
    lastRefreshStatus: "Fetched 2 videos from YouTube",
    tutorials: [
      {
        videoId: "legacy",
        title: "Cinema 4D tutorial",
        sourceQueries: ["Cinema 4D tutorial"],
        tags: ["Cinema 4D"]
      }
    ]
  });

  assert.equal(store.activeInterestId, "c4d-xparticles");
  assert.equal(store.interests[0].lastRefreshedAt, "2026-04-29T00:00:00.000Z");
  assert.deepEqual(store.tutorials[0].interestIds, ["c4d-xparticles"]);
});

test("removeInterestFromStore deletes one interest without removing shared videos", () => {
  const store = normalizeStore({
    activeInterestId: "openai-codex",
    tutorials: [
      {
        videoId: "shared",
        title: "Shared video",
        interestIds: ["c4d-xparticles", "openai-codex"]
      },
      {
        videoId: "codex-only",
        title: "Codex only",
        interestIds: ["openai-codex"]
      }
    ]
  });

  const next = removeInterestFromStore(store, "openai-codex");

  assert.equal(next.activeInterestId, "c4d-xparticles");
  assert.equal(next.interests.some((interest) => interest.id === "openai-codex"), false);
  assert.equal(next.tutorials.some((tutorial) => tutorial.videoId === "codex-only"), false);
  assert.deepEqual(next.tutorials.find((tutorial) => tutorial.videoId === "shared").interestIds, [
    "c4d-xparticles"
  ]);
});

test("filterTutorials applies topic, progress, and duration filters", () => {
  const tutorials = [
    {
      videoId: "a",
      title: "Cinema 4D particles",
      channelTitle: "Trusted",
      tags: ["Cinema 4D", "Particles"],
      saved: true,
      watched: false,
      durationSeconds: 540,
      publishedAt: "2026-01-02T00:00:00Z"
    },
    {
      videoId: "b",
      title: "Long Redshift render",
      channelTitle: "Other",
      tags: ["Redshift"],
      saved: false,
      watched: true,
      durationSeconds: 2400,
      publishedAt: "2026-01-01T00:00:00Z"
    }
  ];

  const filtered = filterTutorials(tutorials, {
    topic: "Particles",
    saved: "true",
    watched: "false",
    duration: "short"
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].videoId, "a");
});
