const TOPIC_RULES = [
  { tag: "X-Particles", patterns: [/x[- ]?particles?/i, /\binsydium\b/i] },
  { tag: "Cinema 4D", patterns: [/\bcinema\s*4d\b/i, /\bc4d\b/i] },
  { tag: "Particles", patterns: [/\bparticles?\b/i, /\bemitter\b/i, /\bfields?\b/i] },
  { tag: "Redshift", patterns: [/\bredshift\b/i] },
  { tag: "Simulation", patterns: [/\bsimulation\b/i, /\bdynamics?\b/i, /\bfluid\b/i, /\bcloth\b/i] },
  { tag: "MoGraph", patterns: [/\bmograph\b/i, /\bcloner\b/i, /\beffector\b/i] }
];

export function parseIsoDuration(duration = "PT0S") {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration);
  if (!match) return 0;

  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match.map((value) =>
    Number.parseInt(value || "0", 10)
  );

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function classifyDuration(seconds = 0) {
  if (seconds > 0 && seconds < 600) return "short";
  if (seconds <= 1800) return "medium";
  return "long";
}

export function deriveTags({ title = "", description = "", queryTags = [], topicRules = [] } = {}) {
  const text = `${title} ${description}`;
  const tags = new Set(queryTags);

  for (const rule of [...TOPIC_RULES, ...normalizeKeywordRules(topicRules)]) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      tags.add(rule.tag);
    }
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function normalizeChannelName(channelTitle = "") {
  return channelTitle.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isTrustedChannel(channelTitle, trustedChannels = []) {
  const normalized = normalizeChannelName(channelTitle);
  return trustedChannels.some((channel) => normalizeChannelName(channel) === normalized);
}

export function scoreTutorial(tutorial, interest = null) {
  let score = 0;

  if (tutorial.trustedChannel) score += 30;
  if (tutorial.embeddable) score += 4;

  const interestTags = new Set([
    ...(interest?.searchQueries || []).flatMap((query) => query.tags || []),
    ...(interest?.topicRules || []).map((rule) => rule.tag)
  ]);

  for (const tag of tutorial.tags || []) {
    if (interestTags.has(tag)) score += 8;
  }

  const viewCount = Number(tutorial.viewCount) || 0;
  if (viewCount > 50000) score += 8;
  else if (viewCount > 10000) score += 5;
  else if (viewCount > 1000) score += 2;

  return score;
}

export function mergeTutorials(existingTutorials = [], incomingTutorials = []) {
  const byId = new Map();

  for (const tutorial of existingTutorials) {
    byId.set(tutorial.videoId, {
      ...tutorial,
      sourceQueries: [...new Set(tutorial.sourceQueries || [])],
      tags: [...new Set(tutorial.tags || [])],
      interestIds: [...new Set(tutorial.interestIds || [])]
    });
  }

  for (const tutorial of incomingTutorials) {
    const current = byId.get(tutorial.videoId);

    if (!current) {
      byId.set(tutorial.videoId, {
        ...tutorial,
        saved: Boolean(tutorial.saved),
        watched: Boolean(tutorial.watched),
        notes: tutorial.notes || ""
      });
      continue;
    }

    byId.set(tutorial.videoId, {
      ...current,
      ...tutorial,
      saved: Boolean(current.saved),
      watched: Boolean(current.watched),
      notes: current.notes || "",
      sourceQueries: [...new Set([...(current.sourceQueries || []), ...(tutorial.sourceQueries || [])])],
      interestIds: [...new Set([...(current.interestIds || []), ...(tutorial.interestIds || [])])],
      tags: [...new Set([...(current.tags || []), ...(tutorial.tags || [])])].sort((a, b) =>
        a.localeCompare(b)
      )
    });
  }

  return [...byId.values()].sort(compareTutorials);
}

export function compareTutorials(a, b) {
  const dateA = new Date(a.publishedAt || 0).getTime();
  const dateB = new Date(b.publishedAt || 0).getTime();
  if (dateA !== dateB) return dateB - dateA;
  return (b.relevanceScore || 0) - (a.relevanceScore || 0);
}

export function filterTutorials(tutorials = [], filters = {}) {
  const {
    search = "",
    topic = "all",
    channel = "all",
    saved = "all",
    watched = "all",
    duration = "all",
    quality = "all"
  } = filters;

  const normalizedSearch = search.trim().toLowerCase();

  return tutorials
    .filter((tutorial) => {
      if (
        filters.interestId &&
        filters.interestId !== "all" &&
        !(tutorial.interestIds || []).includes(filters.interestId)
      ) {
        return false;
      }

      if (normalizedSearch) {
        const haystack = [
          tutorial.title,
          tutorial.channelTitle,
          tutorial.description,
          ...(tutorial.tags || [])
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) return false;
      }

      if (topic !== "all" && !(tutorial.tags || []).includes(topic)) return false;
      if (channel !== "all" && tutorial.channelTitle !== channel) return false;
      if (saved !== "all" && Boolean(tutorial.saved) !== (saved === "true")) return false;
      if (watched !== "all" && Boolean(tutorial.watched) !== (watched === "true")) return false;
      if (duration !== "all" && classifyDuration(tutorial.durationSeconds) !== duration) return false;
      if (quality === "trusted" && !tutorial.trustedChannel) return false;
      if (quality === "embeddable" && !tutorial.embeddable) return false;

      return true;
    })
    .sort(compareTutorials);
}

export function buildFacets(tutorials = []) {
  const topics = new Set();
  const channels = new Set();

  for (const tutorial of tutorials) {
    for (const tag of tutorial.tags || []) topics.add(tag);
    if (tutorial.channelTitle) channels.add(tutorial.channelTitle);
  }

  return {
    topics: [...topics].sort((a, b) => a.localeCompare(b)),
    channels: [...channels].sort((a, b) => a.localeCompare(b))
  };
}

function normalizeKeywordRules(topicRules = []) {
  return topicRules
    .filter((rule) => rule?.tag && Array.isArray(rule.keywords))
    .map((rule) => ({
      tag: rule.tag,
      patterns: rule.keywords
        .filter(Boolean)
        .map((keyword) => new RegExp(escapeRegExp(String(keyword)), "i"))
    }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
