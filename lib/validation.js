import { asHttpError } from "./http.js";

const FILTERS = {
  topic: new Set(["all"]),
  channel: new Set(["all"]),
  saved: new Set(["all", "true", "false"]),
  watched: new Set(["all", "true", "false"]),
  duration: new Set(["all", "short", "medium", "long"]),
  quality: new Set(["all", "trusted", "embeddable"])
};

export function validateCreateInterestBody(body) {
  requireObject(body, "Interest payload is required.");

  const name = toOptionalString(body.name, 80);
  if (!name) throw asHttpError("Interest name is required.", 422, "VALIDATION_ERROR");

  const searchQueries = toOptionalStringArray(body.searchQueries, 30, 120);
  const topics = toOptionalStringArray(body.topics, 20, 50);
  const trustedChannels = toOptionalStringArray(body.trustedChannels, 50, 120);

  return {
    ...body,
    name,
    searchQueries,
    topics,
    trustedChannels
  };
}

export function validateSetActiveInterestBody(body) {
  requireObject(body, "Interest update payload is required.");

  if (body.active !== undefined && typeof body.active !== "boolean") {
    throw asHttpError("active must be a boolean.", 422, "VALIDATION_ERROR");
  }

  return body;
}

export function validateTutorialStateBody(body) {
  requireObject(body, "Tutorial state payload is required.");

  const allowedFields = ["saved", "watched", "notes"];
  const hasAny = allowedFields.some((field) => body[field] !== undefined);
  if (!hasAny) {
    throw asHttpError("Provide at least one state field: saved, watched, or notes.", 422, "VALIDATION_ERROR");
  }

  if (body.saved !== undefined && typeof body.saved !== "boolean") {
    throw asHttpError("saved must be a boolean.", 422, "VALIDATION_ERROR");
  }

  if (body.watched !== undefined && typeof body.watched !== "boolean") {
    throw asHttpError("watched must be a boolean.", 422, "VALIDATION_ERROR");
  }

  if (body.notes !== undefined && typeof body.notes !== "string") {
    throw asHttpError("notes must be a string.", 422, "VALIDATION_ERROR");
  }

  if (typeof body.notes === "string" && body.notes.length > 4000) {
    throw asHttpError("notes is too long (max 4000 chars).", 422, "VALIDATION_ERROR");
  }

  return body;
}

export function validateTutorialQueryFilters(params) {
  const filters = Object.fromEntries(params.entries());

  const search = (filters.search || "").trim();
  if (search.length > 120) {
    throw asHttpError("search is too long (max 120 chars).", 422, "VALIDATION_ERROR");
  }

  if (filters.topic && filters.topic.length > 100) {
    throw asHttpError("topic is too long (max 100 chars).", 422, "VALIDATION_ERROR");
  }

  if (filters.channel && filters.channel.length > 120) {
    throw asHttpError("channel is too long (max 120 chars).", 422, "VALIDATION_ERROR");
  }

  if (filters.saved && !FILTERS.saved.has(filters.saved)) {
    throw asHttpError("saved must be one of all,true,false.", 422, "VALIDATION_ERROR");
  }
  if (filters.watched && !FILTERS.watched.has(filters.watched)) {
    throw asHttpError("watched must be one of all,true,false.", 422, "VALIDATION_ERROR");
  }
  if (filters.duration && !FILTERS.duration.has(filters.duration)) {
    throw asHttpError("duration must be one of all,short,medium,long.", 422, "VALIDATION_ERROR");
  }
  if (filters.quality && !FILTERS.quality.has(filters.quality)) {
    throw asHttpError("quality must be one of all,trusted,embeddable.", 422, "VALIDATION_ERROR");
  }

  return filters;
}

function requireObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw asHttpError(message, 422, "VALIDATION_ERROR");
  }
}

function toOptionalString(value, maxLen) {
  if (value === undefined || value === null) return "";
  const normalized = String(value).trim();
  if (!normalized) return "";
  if (normalized.length > maxLen) {
    throw asHttpError(`Value is too long (max ${maxLen} chars).`, 422, "VALIDATION_ERROR");
  }
  return normalized;
}

function toOptionalStringArray(value, maxItems, maxLen) {
  if (value === undefined || value === null) return [];

  const raw = Array.isArray(value) ? value : [value];
  if (raw.length > maxItems) {
    throw asHttpError(`Too many items (max ${maxItems}).`, 422, "VALIDATION_ERROR");
  }

  return raw
    .map((item) => toOptionalString(item, maxLen))
    .filter(Boolean);
}
