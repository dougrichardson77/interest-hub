import { DEFAULT_INTERESTS, getRuntimeConfig } from "./config.js";
import { mergeTutorials } from "./tutorials.js";
import { getInterest, normalizeInterest } from "./store-json.js";
import { supabaseRestRequest } from "./supabase.js";

const config = getRuntimeConfig();

export async function readStore(context) {
  const user = requireUser(context);
  await ensureUserSetup(user, context?.fetchImpl);

  const [profiles, interests, tutorials] = await Promise.all([
    supabaseRestRequest({
      config,
      accessToken: context.accessToken,
      path: "profiles",
      query: {
        select: "user_id,active_interest_id",
        user_id: `eq.${user.id}`,
        limit: "1"
      },
      fetchImpl: context?.fetchImpl
    }),
    supabaseRestRequest({
      config,
      accessToken: context.accessToken,
      path: "interests",
      query: {
        select: "*",
        order: "created_at.asc"
      },
      fetchImpl: context?.fetchImpl
    }),
    supabaseRestRequest({
      config,
      accessToken: context.accessToken,
      path: "tutorials",
      query: {
        select: "*",
        order: "published_at.desc,relevance_score.desc"
      },
      fetchImpl: context?.fetchImpl
    })
  ]);

  const activeInterestId = profiles?.[0]?.active_interest_id || interests?.[0]?.id || DEFAULT_INTERESTS[0].id;

  return {
    activeInterestId,
    interests: (interests || []).map(mapInterestFromRow),
    tutorials: (tutorials || []).map(mapTutorialFromRow)
  };
}

export async function saveIncomingTutorials(interestId, incomingTutorials, status = "Refresh complete", context) {
  const store = await readStore(context);
  const interest = getInterest(store, interestId);
  const existingByVideoId = new Map(
    store.tutorials
      .filter((tutorial) => (tutorial.interestIds || []).includes(interest.id))
      .map((tutorial) => [tutorial.videoId, tutorial])
  );

  const mergedTutorials = mergeTutorials(
    [...existingByVideoId.values()],
    incomingTutorials.map((tutorial) => ({
      ...tutorial,
      interestIds: [interest.id]
    }))
  );

  const rows = mergedTutorials.map((tutorial) => mapTutorialToRow(tutorial, context.user.id, interest.id));

  await supabaseRestRequest({
    config,
    accessToken: context.accessToken,
    path: "tutorials",
    method: "POST",
    query: {
      on_conflict: "user_id,interest_id,video_id"
    },
    body: rows,
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    fetchImpl: context?.fetchImpl
  });

  await updateInterestRow(
    interest.id,
    {
      last_refreshed_at: new Date().toISOString(),
      last_refresh_status: status,
      last_refresh_error: null
    },
    context
  );

  return readStore(context);
}

export async function saveRefreshError(interestId, message, context) {
  await updateInterestRow(
    interestId,
    {
      last_refresh_status: "Refresh failed",
      last_refresh_error: message
    },
    context
  );

  return readStore(context);
}

export async function updateTutorialState(videoId, patch, context) {
  requireUser(context);

  const rows = await supabaseRestRequest({
    config,
    accessToken: context.accessToken,
    path: "tutorials",
    method: "PATCH",
    query: {
      video_id: `eq.${videoId}`,
      select: "*"
    },
    body: {
      ...(patch.saved !== undefined ? { saved: Boolean(patch.saved) } : {}),
      ...(patch.watched !== undefined ? { watched: Boolean(patch.watched) } : {}),
      ...(patch.notes !== undefined ? { notes: String(patch.notes || "") } : {})
    },
    headers: {
      Prefer: "return=representation"
    },
    fetchImpl: context?.fetchImpl
  });

  if (!rows?.length) {
    const error = new Error("Tutorial not found");
    error.statusCode = 404;
    throw error;
  }

  return mapTutorialFromRow(rows[0]);
}

export async function createInterest(input, context) {
  const store = await readStore(context);
  const interest = normalizeInterest(
    input,
    store.interests.map((item) => ({ ...item, id: item.slug || item.id }))
  );
  const [row] = await supabaseRestRequest({
    config,
    accessToken: context.accessToken,
    path: "interests",
    method: "POST",
    query: {
      select: "*"
    },
    body: [mapInterestToRow(interest, context.user.id)],
    headers: {
      Prefer: "return=representation"
    },
    fetchImpl: context?.fetchImpl
  });

  await setActiveInterest(row.id, context);
  return readStore(context);
}

export async function deleteInterest(interestId, context) {
  const store = await readStore(context);
  const interest = getInterest(store, interestId);

  if (store.interests.length <= 1) {
    const error = new Error("You need at least one interest in the hub.");
    error.statusCode = 400;
    throw error;
  }

  const nextActiveInterestId =
    store.activeInterestId === interest.id
      ? store.interests.find((item) => item.id !== interest.id)?.id || null
      : store.activeInterestId;

  await supabaseRestRequest({
    config,
    accessToken: context.accessToken,
    path: "interests",
    method: "DELETE",
    query: {
      id: `eq.${interest.id}`
    },
    fetchImpl: context?.fetchImpl
  });

  if (nextActiveInterestId) {
    await upsertProfile(context.user.id, nextActiveInterestId, context);
  }

  return readStore(context);
}

export async function setActiveInterest(interestId, context) {
  const store = await readStore(context);
  const interest = getInterest(store, interestId);
  await upsertProfile(context.user.id, interest.id, context);
  return readStore(context);
}

async function ensureUserSetup(user, fetchImpl) {
  const [profiles, interests] = await Promise.all([
    supabaseRestRequest({
      config,
      accessToken: user.accessToken,
      path: "profiles",
      query: {
        select: "user_id,active_interest_id",
        user_id: `eq.${user.id}`,
        limit: "1"
      },
      fetchImpl
    }),
    supabaseRestRequest({
      config,
      accessToken: user.accessToken,
      path: "interests",
      query: {
        select: "id",
        limit: "1"
      },
      fetchImpl
    })
  ]);

  if (!profiles?.length) {
    await upsertProfile(user.id, null, { ...user, fetchImpl });
  }

  if (!interests?.length) {
    const seededInterests = DEFAULT_INTERESTS.map((interest) =>
      mapInterestToRow(normalizeInterest(interest, []), user.id)
    );
    const inserted = await supabaseRestRequest({
      config,
      accessToken: user.accessToken,
      path: "interests",
      method: "POST",
      query: {
        select: "id"
      },
      body: seededInterests,
      headers: {
        Prefer: "return=representation"
      },
      fetchImpl
    });

    if (inserted?.[0]?.id) {
      await upsertProfile(user.id, inserted[0].id, { ...user, fetchImpl });
    }
  }
}

async function updateInterestRow(interestId, patch, context) {
  await supabaseRestRequest({
    config,
    accessToken: context.accessToken,
    path: "interests",
    method: "PATCH",
    query: {
      id: `eq.${interestId}`
    },
    body: patch,
    headers: {
      Prefer: "return=representation"
    },
    fetchImpl: context?.fetchImpl
  });
}

async function upsertProfile(userId, activeInterestId, context) {
  await supabaseRestRequest({
    config,
    accessToken: context.accessToken ?? context.user?.accessToken,
    path: "profiles",
    method: "POST",
    query: {
      on_conflict: "user_id"
    },
    body: [
      {
        user_id: userId,
        active_interest_id: activeInterestId
      }
    ],
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    fetchImpl: context?.fetchImpl
  });
}

function mapInterestFromRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    description: row.description || "",
    color: row.color,
    searchQueries: Array.isArray(row.search_queries) ? row.search_queries : [],
    topicRules: Array.isArray(row.topic_rules) ? row.topic_rules : [],
    trustedChannels: Array.isArray(row.trusted_channels) ? row.trusted_channels : [],
    excludeKeywords: Array.isArray(row.exclude_keywords) ? row.exclude_keywords : [],
    lastRefreshedAt: row.last_refreshed_at || null,
    lastRefreshStatus: row.last_refresh_status || "Not refreshed yet",
    lastRefreshError: row.last_refresh_error || null
  };
}

function mapInterestToRow(interest, userId) {
  return {
    user_id: userId,
    slug: interest.id,
    name: interest.name,
    short_name: interest.shortName,
    description: interest.description || "",
    color: interest.color,
    search_queries: interest.searchQueries || [],
    topic_rules: interest.topicRules || [],
    trusted_channels: interest.trustedChannels || [],
    exclude_keywords: interest.excludeKeywords || []
  };
}

function mapTutorialFromRow(row) {
  return {
    videoId: row.video_id,
    title: row.title,
    description: row.description || "",
    channelId: row.channel_id || "",
    channelTitle: row.channel_title || "Unknown channel",
    publishedAt: row.published_at || null,
    thumbnailUrl: row.thumbnail_url || "",
    sourceQueries: Array.isArray(row.source_queries) ? row.source_queries : [],
    queryTags: Array.isArray(row.query_tags) ? row.query_tags : [],
    durationSeconds: Number(row.duration_seconds) || 0,
    durationLabel: row.duration_label || "0:00",
    viewCount: Number(row.view_count) || 0,
    likeCount: Number(row.like_count) || 0,
    embeddable: row.embeddable !== false,
    tags: Array.isArray(row.tags) ? row.tags : [],
    trustedChannel: Boolean(row.trusted_channel),
    url: row.url || "",
    embedUrl: row.embed_url || "",
    fetchedAt: row.fetched_at || null,
    saved: Boolean(row.saved),
    watched: Boolean(row.watched),
    notes: row.notes || "",
    relevanceScore: Number(row.relevance_score) || 0,
    interestIds: [row.interest_id]
  };
}

function mapTutorialToRow(tutorial, userId, interestId) {
  return {
    user_id: userId,
    interest_id: interestId,
    video_id: tutorial.videoId,
    title: tutorial.title,
    description: tutorial.description || "",
    channel_id: tutorial.channelId || "",
    channel_title: tutorial.channelTitle || "",
    published_at: tutorial.publishedAt,
    thumbnail_url: tutorial.thumbnailUrl || "",
    source_queries: tutorial.sourceQueries || [],
    query_tags: tutorial.queryTags || [],
    duration_seconds: tutorial.durationSeconds || 0,
    duration_label: tutorial.durationLabel || "0:00",
    view_count: tutorial.viewCount || 0,
    like_count: tutorial.likeCount || 0,
    embeddable: tutorial.embeddable !== false,
    tags: tutorial.tags || [],
    trusted_channel: Boolean(tutorial.trustedChannel),
    url: tutorial.url || "",
    embed_url: tutorial.embedUrl || "",
    fetched_at: tutorial.fetchedAt || new Date().toISOString(),
    saved: Boolean(tutorial.saved),
    watched: Boolean(tutorial.watched),
    notes: tutorial.notes || "",
    relevance_score: tutorial.relevanceScore || 0
  };
}

function requireUser(context) {
  if (!context?.user?.id || !context?.accessToken) {
    const error = new Error("Please sign in to use your dashboard.");
    error.statusCode = 401;
    throw error;
  }

  return {
    ...context.user,
    accessToken: context.accessToken
  };
}
