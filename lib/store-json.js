import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_INTERESTS, getRuntimeConfig } from "./config.js";
import { mergeTutorials } from "./tutorials.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = getRuntimeConfig();
export const DATA_DIR = config.localDataDir || path.join(__dirname, "..", "data");
export const STORE_PATH = path.join(DATA_DIR, "tutorials.json");

export const EMPTY_STORE = {
  activeInterestId: DEFAULT_INTERESTS[0].id,
  lastRefreshedAt: null,
  lastRefreshStatus: "Not refreshed yet",
  lastRefreshError: null,
  interests: DEFAULT_INTERESTS.map(createDefaultInterest),
  tutorials: []
};

export async function readStore() {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeStore(EMPTY_STORE);
    return normalizeStore(EMPTY_STORE);
  }
}

export async function writeStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmpPath = `${STORE_PATH}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmpPath, STORE_PATH);
}

export async function saveIncomingTutorials(interestId, incomingTutorials, status = "Refresh complete") {
  const current = await readStore();
  const interest = getInterest(current, interestId);
  const scopedTutorials = incomingTutorials.map((tutorial) => ({
    ...tutorial,
    interestIds: [...new Set([...(tutorial.interestIds || []), interest.id])]
  }));
  const tutorials = mergeTutorials(current.tutorials, scopedTutorials);
  const next = {
    ...current,
    interests: current.interests.map((item) =>
      item.id === interest.id
        ? {
            ...item,
            lastRefreshedAt: new Date().toISOString(),
            lastRefreshStatus: status,
            lastRefreshError: null
          }
        : item
    ),
    tutorials
  };

  await writeStore(next);
  return next;
}

export async function saveRefreshError(interestId, message) {
  const current = await readStore();
  const interest = getInterest(current, interestId);
  const next = {
    ...current,
    interests: current.interests.map((item) =>
      item.id === interest.id
        ? {
            ...item,
            lastRefreshStatus: "Refresh failed",
            lastRefreshError: message
          }
        : item
    )
  };
  await writeStore(next);
  return next;
}

export async function updateTutorialState(videoId, patch) {
  const current = await readStore();
  let updated = null;
  const tutorials = current.tutorials.map((tutorial) => {
    if (tutorial.videoId !== videoId) return tutorial;

    updated = {
      ...tutorial,
      saved: patch.saved === undefined ? Boolean(tutorial.saved) : Boolean(patch.saved),
      watched: patch.watched === undefined ? Boolean(tutorial.watched) : Boolean(patch.watched),
      notes: patch.notes === undefined ? tutorial.notes || "" : String(patch.notes || "")
    };

    return updated;
  });

  if (!updated) {
    const error = new Error("Tutorial not found");
    error.statusCode = 404;
    throw error;
  }

  const next = { ...current, tutorials };
  await writeStore(next);
  return updated;
}

export async function createInterest(input) {
  const current = await readStore();
  const interest = normalizeInterest(input, current.interests);
  const next = {
    ...current,
    activeInterestId: interest.id,
    interests: [...current.interests, interest]
  };

  await writeStore(next);
  return next;
}

export async function deleteInterest(interestId) {
  const current = await readStore();
  const next = removeInterestFromStore(current, interestId);
  await writeStore(next);
  return next;
}

export async function setActiveInterest(interestId) {
  const current = await readStore();
  const interest = getInterest(current, interestId);
  const next = {
    ...current,
    activeInterestId: interest.id
  };

  await writeStore(next);
  return next;
}

export function removeInterestFromStore(store, interestId) {
  const interest = getInterest(store, interestId);
  if (store.interests.length <= 1) {
    const error = new Error("You need at least one interest in the hub.");
    error.statusCode = 400;
    throw error;
  }

  const interests = store.interests.filter((item) => item.id !== interest.id);
  const activeInterestId =
    store.activeInterestId === interest.id
      ? interests[0].id
      : store.activeInterestId;
  const tutorials = store.tutorials
    .map((tutorial) => ({
      ...tutorial,
      interestIds: (tutorial.interestIds || []).filter((id) => id !== interest.id)
    }))
    .filter((tutorial) => tutorial.interestIds.length > 0);

  return {
    ...store,
    activeInterestId,
    interests,
    tutorials
  };
}

export function getInterest(store, interestId) {
  const interest =
    store.interests.find((item) => item.id === interestId) ||
    store.interests.find((item) => item.id === store.activeInterestId);

  if (!interest) {
    const error = new Error("Interest not found");
    error.statusCode = 404;
    throw error;
  }

  return interest;
}

export function normalizeStore(parsed = {}) {
  const defaultInterests = DEFAULT_INTERESTS.map(createDefaultInterest);
  if (!Array.isArray(parsed.interests) && parsed.lastRefreshedAt) {
    defaultInterests[0] = {
      ...defaultInterests[0],
      lastRefreshedAt: parsed.lastRefreshedAt,
      lastRefreshStatus: parsed.lastRefreshStatus || defaultInterests[0].lastRefreshStatus,
      lastRefreshError: parsed.lastRefreshError || null
    };
  }

  const storedInterests = Array.isArray(parsed.interests)
    ? parsed.interests.map((interest) => normalizeInterest(interest, []))
    : [];
  const interestsById = new Map();

  for (const interest of [...defaultInterests, ...storedInterests]) {
    interestsById.set(interest.id, {
      ...interest,
      ...interestsById.get(interest.id),
      ...interest
    });
  }

  const interests = [...interestsById.values()];
  const activeInterestId = interests.some((interest) => interest.id === parsed.activeInterestId)
    ? parsed.activeInterestId
    : interests[0]?.id || DEFAULT_INTERESTS[0].id;
  const fallbackInterestId = interests[0]?.id || DEFAULT_INTERESTS[0].id;

  return {
    ...EMPTY_STORE,
    ...parsed,
    activeInterestId,
    interests,
    tutorials: Array.isArray(parsed.tutorials)
      ? parsed.tutorials.map((tutorial) => normalizeTutorial(tutorial, fallbackInterestId))
      : []
  };
}

export function normalizeTutorial(tutorial, fallbackInterestId) {
  const interestIds = Array.isArray(tutorial.interestIds)
    ? tutorial.interestIds.filter(Boolean)
    : [fallbackInterestId];

  return {
    ...tutorial,
    saved: Boolean(tutorial.saved),
    watched: Boolean(tutorial.watched),
    notes: tutorial.notes || "",
    sourceQueries: [...new Set(tutorial.sourceQueries || [])],
    queryTags: [...new Set(tutorial.queryTags || [])],
    tags: [...new Set(tutorial.tags || [])],
    interestIds: [...new Set(interestIds)]
  };
}

export function createDefaultInterest(interest) {
  return normalizeInterest(interest, [], {
    lastRefreshStatus: "Not refreshed yet"
  });
}

export function normalizeInterest(input = {}, existingInterests = [], defaults = {}) {
  const name = cleanText(input.name) || "Untitled Interest";
  const id = cleanId(input.id) || uniqueInterestId(name, existingInterests);
  const shortName = cleanText(input.shortName) || makeShortName(name);
  const searchQueries = normalizeSearchQueries(input.searchQueries, name, input.topics);
  const topicRules = normalizeTopicRules(input.topicRules, searchQueries, input.topics);

  return {
    id,
    name,
    shortName,
    description: cleanText(input.description),
    color: cleanColor(input.color) || pickInterestColor(existingInterests.length),
    searchQueries,
    topicRules,
    trustedChannels: normalizeLines(input.trustedChannels),
    excludeKeywords: normalizeLines(input.excludeKeywords),
    lastRefreshedAt: input.lastRefreshedAt || defaults.lastRefreshedAt || null,
    lastRefreshStatus: input.lastRefreshStatus || defaults.lastRefreshStatus || "Not refreshed yet",
    lastRefreshError: input.lastRefreshError || null
  };
}

function normalizeSearchQueries(searchQueries, name, topics) {
  const queryTags = normalizeLines(topics);
  const queries = Array.isArray(searchQueries)
    ? searchQueries
    : typeof searchQueries === "string"
      ? searchQueries.split(/\r?\n/)
      : [];

  const normalized = queries
    .map((item) => {
      if (typeof item === "string") {
        return { query: cleanText(item), tags: queryTags.length ? queryTags : [name] };
      }

      return {
        query: cleanText(item?.query),
        tags: normalizeLines(item?.tags)
      };
    })
    .filter((item) => item.query);

  return normalized.length ? normalized : [{ query: `${name} tutorial`, tags: queryTags.length ? queryTags : [name] }];
}

function normalizeTopicRules(topicRules, searchQueries, topics) {
  const fromRules = Array.isArray(topicRules)
    ? topicRules
        .map((rule) => ({
          tag: cleanText(rule?.tag),
          keywords: normalizeLines(rule?.keywords)
        }))
        .filter((rule) => rule.tag)
    : [];

  const fromTags = new Set([...normalizeLines(topics), ...searchQueries.flatMap((query) => query.tags || [])]);
  for (const tag of fromTags) {
    if (!fromRules.some((rule) => rule.tag.toLowerCase() === tag.toLowerCase())) {
      fromRules.push({ tag, keywords: [tag] });
    }
  }

  return fromRules;
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeLines(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[,\n]/);
  return [...new Set(raw.map(cleanText).filter(Boolean))];
}

function cleanId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueInterestId(name, existingInterests) {
  const base = cleanId(name) || "interest";
  const used = new Set(existingInterests.map((interest) => interest.id));
  let id = base;
  let index = 2;

  while (used.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }

  return id;
}

function makeShortName(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 6);
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function cleanColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function pickInterestColor(index) {
  const colors = ["#e33d2f", "#0f9fad", "#3b8262", "#7b5fb2", "#b66a25", "#465f8f"];
  return colors[index % colors.length];
}
