import { DEFAULT_INTERESTS } from "./config.js";
import {
  deriveTags,
  formatDuration,
  isTrustedChannel,
  parseIsoDuration,
  scoreTutorial
} from "./tutorials.js";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

export async function refreshFromYouTube({
  apiKey,
  interest = DEFAULT_INTERESTS[0],
  publishedAfterDays,
  maxResultsPerQuery,
  fetchImpl = fetch
}) {
  if (!apiKey) {
    const error = new Error("Missing YOUTUBE_API_KEY. Add it to .env or your shell before refreshing.");
    error.statusCode = 400;
    throw error;
  }

  const publishedAfter = new Date(Date.now() - publishedAfterDays * 24 * 60 * 60 * 1000).toISOString();
  const byVideoId = new Map();
  const searchQueries = normalizeSearchQueries(interest.searchQueries, interest.name);

  for (const searchSpec of searchQueries) {
    const params = new URLSearchParams({
      key: apiKey,
      part: "snippet",
      q: searchSpec.query,
      type: "video",
      order: "date",
      safeSearch: "none",
      relevanceLanguage: "en",
      videoEmbeddable: "true",
      maxResults: String(maxResultsPerQuery),
      publishedAfter
    });

    const response = await fetchImpl(`${YOUTUBE_API}/search?${params}`);
    const payload = await readYouTubeJson(response);

    for (const item of payload.items || []) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;

      const existing = byVideoId.get(videoId);
      const snippet = item.snippet || {};
      byVideoId.set(videoId, {
        videoId,
        title: snippet.title || "Untitled tutorial",
        description: snippet.description || "",
        channelId: snippet.channelId || "",
        channelTitle: snippet.channelTitle || "Unknown channel",
        publishedAt: snippet.publishedAt || null,
        thumbnailUrl: pickThumbnail(snippet.thumbnails),
        sourceQueries: [...new Set([...(existing?.sourceQueries || []), searchSpec.query])],
        queryTags: [...new Set([...(existing?.queryTags || []), ...(searchSpec.tags || [])])]
      });
    }
  }

  const videos = await enrichVideos([...byVideoId.values()], apiKey, fetchImpl);

  return videos.map((video) => {
    const tags = deriveTags({
      title: video.title,
      description: video.description,
      queryTags: video.queryTags,
      topicRules: interest.topicRules
    });
    const trustedChannel = isTrustedChannel(video.channelTitle, interest.trustedChannels || []);
    const tutorial = {
      ...video,
      interestIds: [interest.id],
      tags,
      trustedChannel,
      durationLabel: formatDuration(video.durationSeconds),
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${video.videoId}`,
      fetchedAt: new Date().toISOString(),
      saved: false,
      watched: false,
      notes: ""
    };

    return {
      ...tutorial,
      relevanceScore: scoreTutorial(tutorial, interest)
    };
  }).filter((tutorial) => !matchesExcludedKeywords(tutorial, interest.excludeKeywords));
}

async function enrichVideos(videos, apiKey, fetchImpl) {
  const enriched = [];

  for (let index = 0; index < videos.length; index += 50) {
    const chunk = videos.slice(index, index + 50);
    const params = new URLSearchParams({
      key: apiKey,
      part: "snippet,contentDetails,statistics,status",
      id: chunk.map((video) => video.videoId).join(","),
      maxResults: "50"
    });

    const response = await fetchImpl(`${YOUTUBE_API}/videos?${params}`);
    const payload = await readYouTubeJson(response);
    const detailsById = new Map((payload.items || []).map((item) => [item.id, item]));

    for (const video of chunk) {
      const details = detailsById.get(video.videoId);
      if (!details) continue;

      const snippet = details.snippet || {};
      const durationSeconds = parseIsoDuration(details.contentDetails?.duration);
      const embeddable = details.status?.embeddable !== false;

      enriched.push({
        ...video,
        title: decodeEntities(snippet.title || video.title),
        description: decodeEntities(snippet.description || video.description),
        channelTitle: snippet.channelTitle || video.channelTitle,
        publishedAt: snippet.publishedAt || video.publishedAt,
        thumbnailUrl: pickThumbnail(snippet.thumbnails) || video.thumbnailUrl,
        durationSeconds,
        durationLabel: formatDuration(durationSeconds),
        viewCount: Number.parseInt(details.statistics?.viewCount || "0", 10),
        likeCount: Number.parseInt(details.statistics?.likeCount || "0", 10),
        embeddable
      });
    }
  }

  return enriched;
}

async function readYouTubeJson(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload.error?.message ||
      `YouTube API request failed with status ${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.youtubeError = payload.error;
    throw error;
  }

  return payload;
}

function pickThumbnail(thumbnails = {}) {
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    ""
  );
}

function decodeEntities(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function normalizeSearchQueries(searchQueries = [], interestName = "tutorial") {
  const normalized = searchQueries
    .map((searchSpec) => {
      if (typeof searchSpec === "string") {
        return { query: searchSpec, tags: [interestName] };
      }

      return {
        query: String(searchSpec?.query || "").trim(),
        tags: Array.isArray(searchSpec?.tags) ? searchSpec.tags.filter(Boolean) : []
      };
    })
    .filter((searchSpec) => searchSpec.query);

  return normalized.length
    ? normalized
    : [{ query: `${interestName} tutorial`, tags: [interestName] }];
}

function matchesExcludedKeywords(tutorial, excludeKeywords = []) {
  const keywords = excludeKeywords.map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean);
  if (!keywords.length) return false;

  const text = `${tutorial.title || ""} ${tutorial.description || ""}`.toLowerCase();
  return keywords.some((keyword) => text.includes(keyword));
}
