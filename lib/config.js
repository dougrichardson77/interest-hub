import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_INTERESTS = [
  {
    id: "c4d-xparticles",
    name: "Cinema 4D + X-Particles",
    shortName: "C4D",
    description: "Cinema 4D, X-Particles, rendering, motion design, and simulation tutorials.",
    color: "#e33d2f",
    searchQueries: [
      {
        query: "Cinema 4D tutorial",
        tags: ["Cinema 4D"]
      },
      {
        query: "X-Particles tutorial",
        tags: ["X-Particles", "Particles"]
      },
      {
        query: "Cinema 4D X-Particles",
        tags: ["Cinema 4D", "X-Particles", "Particles"]
      },
      {
        query: "C4D particles tutorial",
        tags: ["Cinema 4D", "Particles"]
      }
    ],
    topicRules: [
      { tag: "X-Particles", keywords: ["x-particles", "x particles", "insydium"] },
      { tag: "Cinema 4D", keywords: ["cinema 4d", "c4d"] },
      { tag: "Particles", keywords: ["particle", "particles", "emitter", "fields"] },
      { tag: "Redshift", keywords: ["redshift"] },
      { tag: "Simulation", keywords: ["simulation", "dynamics", "fluid", "cloth"] },
      { tag: "MoGraph", keywords: ["mograph", "cloner", "effector"] }
    ],
    trustedChannels: [
      "INSYDIUM LTD",
      "Maxon Training Team",
      "Rocket Lasso",
      "Eyedesyn",
      "Greyscalegorilla",
      "The Pixel Lab",
      "School of Motion",
      "New Plastic"
    ]
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    shortName: "Codex",
    description: "Codex, coding agents, agentic development, and AI-assisted programming tutorials.",
    color: "#0f9fad",
    searchQueries: [
      {
        query: "OpenAI Codex tutorial",
        tags: ["OpenAI Codex", "AI Coding"]
      },
      {
        query: "Codex CLI tutorial",
        tags: ["OpenAI Codex", "CLI"]
      },
      {
        query: "OpenAI Codex coding agent",
        tags: ["OpenAI Codex", "Coding Agents"]
      },
      {
        query: "ChatGPT Codex tutorial",
        tags: ["OpenAI Codex", "ChatGPT"]
      }
    ],
    topicRules: [
      { tag: "OpenAI Codex", keywords: ["openai codex", "codex cli", "codex"] },
      { tag: "AI Coding", keywords: ["ai coding", "vibe coding", "code assistant"] },
      { tag: "Coding Agents", keywords: ["coding agent", "agentic coding", "software agent"] },
      { tag: "CLI", keywords: ["cli", "terminal", "command line"] },
      { tag: "ChatGPT", keywords: ["chatgpt"] },
      { tag: "GitHub", keywords: ["github", "pull request", "repo"] }
    ],
    trustedChannels: ["OpenAI", "OpenAI Developers"]
  }
];

export const SEARCH_QUERIES = DEFAULT_INTERESTS[0].searchQueries;
export const TRUSTED_CHANNELS = DEFAULT_INTERESTS[0].trustedChannels;

export const DEFAULT_PORT = 4173;
export const DEFAULT_REFRESH_HOURS = 6;
export const DEFAULT_PUBLISHED_AFTER_DAYS = 180;
export const DEFAULT_MAX_RESULTS_PER_QUERY = 20;
export const SUPABASE_STORAGE_MODE = "supabase";
export const LOCAL_STORAGE_MODE = "local";

export function getRuntimeConfig(env = process.env) {
  loadEnvFile();

  const supabaseUrl = env.SUPABASE_URL || "";
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || "";
  const storageMode = supabaseUrl && supabaseAnonKey ? SUPABASE_STORAGE_MODE : LOCAL_STORAGE_MODE;

  return {
    port: toPositiveInt(env.PORT, DEFAULT_PORT),
    host: env.HOST || "127.0.0.1",
    youtubeApiKey: env.YOUTUBE_API_KEY || env.GOOGLE_API_KEY || "",
    supabaseUrl,
    supabaseAnonKey,
    storageMode,
    authEnabled: storageMode === SUPABASE_STORAGE_MODE,
    refreshEveryHours: toPositiveNumber(env.REFRESH_EVERY_HOURS, DEFAULT_REFRESH_HOURS),
    publishedAfterDays: toPositiveInt(
      env.YOUTUBE_PUBLISHED_AFTER_DAYS,
      DEFAULT_PUBLISHED_AFTER_DAYS
    ),
    maxResultsPerQuery: Math.min(
      50,
      toPositiveInt(env.YOUTUBE_MAX_RESULTS_PER_QUERY, DEFAULT_MAX_RESULTS_PER_QUERY)
    ),
    autoRefresh: env.AUTO_REFRESH !== "false"
  };
}

export function loadEnvFile(filePath = path.join(process.cwd(), ".env")) {
  if (!existsSync(filePath)) return;

  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toPositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
