import { getRuntimeConfig } from "../lib/config.js";
import { getInterest, readStore, saveIncomingTutorials, saveRefreshError } from "../lib/store.js";
import { refreshFromYouTube } from "../lib/youtube.js";

const config = getRuntimeConfig();
if (config.authEnabled) {
  console.error("Manual script refresh is only available in local storage mode.");
  process.exit(1);
}

const storeBeforeRefresh = await readStore();
const interest = getInterest(storeBeforeRefresh, storeBeforeRefresh.activeInterestId);

try {
  const tutorials = await refreshFromYouTube({
    apiKey: config.youtubeApiKey,
    interest,
    publishedAfterDays: config.publishedAfterDays,
    maxResultsPerQuery: config.maxResultsPerQuery
  });
  const store = await saveIncomingTutorials(
    interest.id,
    tutorials,
    `Fetched ${tutorials.length} videos from YouTube`
  );
  const activeCount = store.tutorials.filter((tutorial) =>
    (tutorial.interestIds || []).includes(interest.id)
  ).length;
  console.log(`Refresh complete for ${interest.name}. Cached tutorials: ${activeCount}`);
} catch (error) {
  await saveRefreshError(interest.id, error.message);
  console.error(`Refresh failed: ${error.message}`);
  process.exitCode = 1;
}
