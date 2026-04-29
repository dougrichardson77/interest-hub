import { getRuntimeConfig, SUPABASE_STORAGE_MODE } from "./config.js";
import * as jsonStore from "./store-json.js";
import * as supabaseStore from "./store-supabase.js";

const config = getRuntimeConfig();
const activeStore = config.storageMode === SUPABASE_STORAGE_MODE ? supabaseStore : jsonStore;

export const STORAGE_MODE = config.storageMode;
export const AUTH_ENABLED = config.authEnabled;

export const readStore = activeStore.readStore;
export const saveIncomingTutorials = activeStore.saveIncomingTutorials;
export const saveRefreshError = activeStore.saveRefreshError;
export const updateTutorialState = activeStore.updateTutorialState;
export const createInterest = activeStore.createInterest;
export const deleteInterest = activeStore.deleteInterest;
export const setActiveInterest = activeStore.setActiveInterest;

export const getInterest = jsonStore.getInterest;
export const normalizeStore = jsonStore.normalizeStore;
export const removeInterestFromStore = jsonStore.removeInterestFromStore;
