const state = {
  appConfig: {
    authEnabled: false,
    storageMode: "local",
    supabaseUrl: "",
    supabaseAnonKey: ""
  },
  auth: {
    client: null,
    session: null,
    email: "",
    message: "",
    ready: false
  },
  interests: [],
  activeInterestId: null,
  tutorials: [],
  facets: { topics: [], channels: [] },
  meta: {},
  selectedVideoId: null,
  filters: {
    search: "",
    topic: "all",
    channel: "all",
    saved: "all",
    watched: "all",
    duration: "all",
    quality: "all"
  }
};

const els = {
  brandMark: document.querySelector("#brandMark"),
  brandTitle: document.querySelector("#brandTitle"),
  authPanel: document.querySelector("#authPanel"),
  interestList: document.querySelector("#interestList"),
  showInterestFormButton: document.querySelector("#showInterestFormButton"),
  interestForm: document.querySelector("#interestForm"),
  interestNameInput: document.querySelector("#interestNameInput"),
  interestQueriesInput: document.querySelector("#interestQueriesInput"),
  interestTopicsInput: document.querySelector("#interestTopicsInput"),
  interestChannelsInput: document.querySelector("#interestChannelsInput"),
  cancelInterestFormButton: document.querySelector("#cancelInterestFormButton"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  cacheStatus: document.querySelector("#cacheStatus"),
  apiStatus: document.querySelector("#apiStatus"),
  topicFilters: document.querySelector("#topicFilters"),
  savedToggle: document.querySelector("#savedToggle"),
  unwatchedToggle: document.querySelector("#unwatchedToggle"),
  durationSelect: document.querySelector("#durationSelect"),
  channelSelect: document.querySelector("#channelSelect"),
  tutorialGrid: document.querySelector("#tutorialGrid"),
  resultsTitle: document.querySelector("#resultsTitle"),
  resultsMeta: document.querySelector("#resultsMeta"),
  watchFrame: document.querySelector("#watchFrame"),
  selectedChannel: document.querySelector("#selectedChannel"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedDescription: document.querySelector("#selectedDescription"),
  selectedTags: document.querySelector("#selectedTags"),
  youtubeLink: document.querySelector("#youtubeLink"),
  saveButton: document.querySelector("#saveButton"),
  watchedButton: document.querySelector("#watchedButton")
};

init();

async function init() {
  bindEvents();
  await loadAppConfig();
  await setupAuth();
  if (state.appConfig.authEnabled && !state.auth.session) {
    render();
    return;
  }
  await loadInterests();
  await loadTutorials();
}

function bindEvents() {
  els.searchForm.addEventListener("submit", (event) => event.preventDefault());
  els.searchInput.addEventListener("input", debounce(() => {
    state.filters.search = els.searchInput.value;
    loadTutorials();
  }, 220));

  els.refreshButton.addEventListener("click", refreshTutorials);
  els.showInterestFormButton.addEventListener("click", () => {
    els.interestForm.classList.toggle("is-hidden");
    if (!els.interestForm.classList.contains("is-hidden")) {
      els.interestNameInput.focus();
    }
  });
  els.cancelInterestFormButton.addEventListener("click", () => {
    els.interestForm.reset();
    els.interestForm.classList.add("is-hidden");
  });
  els.interestForm.addEventListener("submit", createInterest);
  els.savedToggle.addEventListener("change", () => {
    state.filters.saved = els.savedToggle.checked ? "true" : "all";
    loadTutorials();
  });
  els.unwatchedToggle.addEventListener("change", () => {
    state.filters.watched = els.unwatchedToggle.checked ? "false" : "all";
    loadTutorials();
  });
  els.durationSelect.addEventListener("change", () => {
    state.filters.duration = els.durationSelect.value;
    loadTutorials();
  });
  els.channelSelect.addEventListener("change", () => {
    state.filters.channel = els.channelSelect.value;
    loadTutorials();
  });

  document.addEventListener("click", (event) => {
    const segment = event.target.closest("[data-filter]");
    if (!segment) return;

    state.filters[segment.dataset.filter] = segment.dataset.value;
    document
      .querySelectorAll(`[data-filter="${segment.dataset.filter}"]`)
      .forEach((item) => item.classList.toggle("is-active", item === segment));
    loadTutorials();
  });

  els.saveButton.addEventListener("click", () => toggleSelected("saved"));
  els.watchedButton.addEventListener("click", () => toggleSelected("watched"));
}

async function loadAppConfig() {
  try {
    const response = await fetch("/api/app-config");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load app config");
    state.appConfig = payload;
  } catch (error) {
    state.meta.lastRefreshError = error.message;
  }
}

async function setupAuth() {
  if (!state.appConfig.authEnabled) {
    state.auth.ready = true;
    return;
  }

  const { createClient } = await loadSupabaseModule();
  state.auth.client = createClient(state.appConfig.supabaseUrl, state.appConfig.supabaseAnonKey, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true
    }
  });

  const { data } = await state.auth.client.auth.getSession();
  state.auth.session = data.session;
  state.auth.ready = true;

  state.auth.client.auth.onAuthStateChange(async (_event, session) => {
    state.auth.session = session;
    state.auth.message = "";

    if (session) {
      await loadInterests();
      await loadTutorials();
      return;
    }

    state.interests = [];
    state.tutorials = [];
    state.activeInterestId = null;
    render();
  });
}

async function loadSupabaseModule() {
  return import("https://esm.sh/@supabase/supabase-js@2");
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});

  if (state.appConfig.authEnabled) {
    const accessToken = state.auth.session?.access_token;
    if (!accessToken) {
      throw new Error("Please sign in to use your dashboard.");
    }
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return fetch(url, {
    ...options,
    headers
  });
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!state.auth.client) return;

  const email = state.auth.email.trim();
  if (!email) return;

  const { error } = await state.auth.client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin
    }
  });

  state.auth.message = error ? error.message : "Check your email for the sign-in link.";
  renderAuth();
}

async function handleSignOut() {
  if (!state.auth.client) return;
  await state.auth.client.auth.signOut();
}

async function loadInterests() {
  try {
    const response = await apiFetch("/api/interests");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load interests");

    state.interests = payload.interests || [];
    state.activeInterestId = payload.activeInterestId || state.interests[0]?.id || null;
    renderInterests();
  } catch (error) {
    state.meta.lastRefreshError = error.message;
    renderStatus();
  }
}

async function createInterest(event) {
  event.preventDefault();
  const name = els.interestNameInput.value.trim();
  const searchQueries = els.interestQueriesInput.value
    .split(/\r?\n/)
    .map((query) => query.trim())
    .filter(Boolean);
  const topics = els.interestTopicsInput.value
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
  const trustedChannels = els.interestChannelsInput.value
    .split(/\r?\n/)
    .map((channel) => channel.trim())
    .filter(Boolean);

  if (!name) {
    els.interestNameInput.focus();
    return;
  }

  const response = await apiFetch("/api/interests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, searchQueries, topics, trustedChannels })
  });
  const payload = await response.json();

  if (!response.ok) {
    state.meta.lastRefreshError = payload.error || "Could not add interest";
    renderStatus();
    return;
  }

  state.interests = payload.interests || [];
  state.activeInterestId = payload.activeInterestId;
  state.filters.topic = "all";
  state.filters.channel = "all";
  state.selectedVideoId = null;
  els.interestForm.reset();
  els.interestForm.classList.add("is-hidden");
  renderInterests();
  await loadTutorials();
}

async function selectInterest(interestId) {
  if (!interestId || interestId === state.activeInterestId) return;

  const response = await apiFetch(`/api/interests/${encodeURIComponent(interestId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active: true })
  });
  const payload = await response.json();

  if (!response.ok) {
    state.meta.lastRefreshError = payload.error || "Could not switch interest";
    renderStatus();
    return;
  }

  state.interests = payload.interests || [];
  state.activeInterestId = payload.activeInterestId;
  state.filters.topic = "all";
  state.filters.channel = "all";
  state.selectedVideoId = null;
  renderInterests();
  await loadTutorials();
}

async function deleteInterest(interestId) {
  const interest = state.interests.find((item) => item.id === interestId);
  if (!interest || state.interests.length <= 1) return;

  const confirmed = window.confirm(
    `Delete "${interest.name}"? This removes the interest and its videos from this dashboard.`
  );
  if (!confirmed) return;

  const response = await apiFetch(`/api/interests/${encodeURIComponent(interestId)}`, {
    method: "DELETE"
  });
  const payload = await response.json();

  if (!response.ok) {
    state.meta.lastRefreshError = payload.error || "Could not delete interest";
    renderStatus();
    return;
  }

  state.interests = payload.interests || [];
  state.activeInterestId = payload.activeInterestId;
  state.filters.topic = "all";
  state.filters.channel = "all";
  state.selectedVideoId = null;
  renderInterests();
  await loadTutorials();
}

async function loadTutorials() {
  const params = new URLSearchParams(
    Object.entries({ ...state.filters, interestId: state.activeInterestId }).filter(
      ([, value]) => value && value !== "all"
    )
  );

  try {
    const response = await apiFetch(`/api/tutorials?${params}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load tutorials");

    state.tutorials = payload.tutorials || [];
    state.facets = payload.facets || { topics: [], channels: [] };
    state.meta = payload.meta || {};
    state.selectedVideoId = keepSelectedVideoId();
    render();
  } catch (error) {
    renderError(error.message);
  }
}

async function refreshTutorials() {
  els.refreshButton.classList.add("is-loading");
  els.refreshButton.disabled = true;

  try {
    const response = await apiFetch(`/api/interests/${encodeURIComponent(state.activeInterestId)}/refresh`, {
      method: "POST"
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Refresh failed");
    }

    await loadInterests();
    await loadTutorials();
  } catch (error) {
    state.meta.lastRefreshError = error.message;
    renderStatus();
  } finally {
    els.refreshButton.classList.remove("is-loading");
    els.refreshButton.disabled = false;
  }
}

async function toggleSelected(field) {
  const selected = getSelectedTutorial();
  if (!selected) return;

  const nextValue = !selected[field];
  const response = await apiFetch(`/api/tutorials/${encodeURIComponent(selected.videoId)}/state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: nextValue })
  });

  const payload = await response.json();
  if (!response.ok) {
    state.meta.lastRefreshError = payload.error || "Could not save state";
    renderStatus();
    return;
  }

  updateTutorialInState(payload.tutorial);
  render();
}

function render() {
  const locked = state.appConfig.authEnabled && !isSignedIn();
  els.refreshButton.disabled = locked;
  els.searchInput.disabled = locked;
  els.showInterestFormButton.disabled = locked;
  renderAuth();
  renderInterests();
  renderStatus();
  renderFilters();
  renderResults();
  renderSelected();
}

function renderAuth() {
  if (!state.appConfig.authEnabled) {
    els.authPanel.innerHTML = "";
    return;
  }

  if (state.auth.session?.user?.email) {
    els.authPanel.innerHTML = `
      <div class="auth-session">
        <span class="auth-email">${escapeHtml(state.auth.session.user.email)}</span>
        <button class="auth-submit" type="button" id="signOutButton">Sign out</button>
      </div>
    `;
    document.querySelector("#signOutButton")?.addEventListener("click", handleSignOut);
    return;
  }

  els.authPanel.innerHTML = `
    <form class="auth-form" id="authForm">
      <input id="authEmailInput" type="email" placeholder="Enter your email" autocomplete="email" value="${escapeAttribute(state.auth.email)}" />
      <button class="auth-submit" type="submit">Email link</button>
    </form>
  `;
  if (state.auth.message) {
    els.authPanel.insertAdjacentHTML(
      "beforeend",
      `<div class="auth-message">${escapeHtml(state.auth.message)}</div>`
    );
  }

  document.querySelector("#authForm")?.addEventListener("submit", handleAuthSubmit);
  document.querySelector("#authEmailInput")?.addEventListener("input", (event) => {
    state.auth.email = event.target.value;
  });
}

function renderInterests() {
  const activeInterest = getActiveInterest();
  if (activeInterest) {
    els.brandTitle.textContent = activeInterest.name;
    els.brandMark.textContent = activeInterest.shortName || "Hub";
    els.brandMark.style.background = `${activeInterest.color || "#e33d2f"}22`;
    els.brandMark.style.borderColor = `${activeInterest.color || "#e33d2f"}66`;
    els.brandMark.style.color = activeInterest.color || "#e33d2f";
  } else {
    els.brandTitle.textContent = state.appConfig.authEnabled ? "Sign in for your dashboard" : "Interest Hub";
    els.brandMark.textContent = "Hub";
    els.brandMark.style.background = "";
    els.brandMark.style.borderColor = "";
    els.brandMark.style.color = "";
  }

  els.interestList.innerHTML = state.interests.length
    ? state.interests.map(renderInterestButton).join("")
    : `<p class="muted">${
        state.appConfig.authEnabled && !isSignedIn()
          ? "Sign in to load your saved interests."
          : "Add an interest to start collecting tutorials."
      }</p>`;

  els.interestList.querySelectorAll("[data-interest-id]").forEach((button) => {
    button.addEventListener("click", () => selectInterest(button.dataset.interestId));
  });
  els.interestList.querySelectorAll("[data-delete-interest-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteInterest(button.dataset.deleteInterestId);
    });
  });
}

function renderInterestButton(interest) {
  const active = interest.id === state.activeInterestId;
  const count = Number(interest.videoCount) || 0;
  const deleteDisabled = state.interests.length <= 1 ? "disabled" : "";

  return `
    <div class="interest-item${active ? " is-active" : ""}" style="--interest-color: ${escapeAttribute(interest.color || "#0f9fad")}">
      <button class="interest-button" type="button" data-interest-id="${escapeAttribute(interest.id)}">
        <span class="interest-swatch"></span>
        <span class="interest-copy">
          <strong>${escapeHtml(interest.name)}</strong>
          <span>${count} ${count === 1 ? "video" : "videos"}</span>
        </span>
      </button>
      <button class="delete-interest-button" type="button" data-delete-interest-id="${escapeAttribute(interest.id)}" ${deleteDisabled} title="Delete interest">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6M6 6l1 14h10l1-14" />
        </svg>
      </button>
    </div>
  `;
}

function renderStatus() {
  if (state.appConfig.authEnabled && !isSignedIn()) {
    els.cacheStatus.textContent = "Sign in required";
    els.apiStatus.textContent = "Each person gets their own dashboard and saved interests.";
    return;
  }

  const activeInterest = getActiveInterest();
  const refreshed = state.meta.lastRefreshedAt ? relativeDate(state.meta.lastRefreshedAt) : "Not refreshed";
  const apiText = state.meta.apiConfigured
    ? state.appConfig.authEnabled
      ? "Manual refresh per signed-in dashboard"
      : `Auto refresh ${state.meta.autoRefresh ? "on" : "off"} for active interest every ${state.meta.refreshEveryHours}h`
    : "Add YOUTUBE_API_KEY to enable refresh";

  els.cacheStatus.textContent =
    state.meta.lastRefreshError ||
    state.meta.lastRefreshStatus ||
    `${activeInterest?.name || "Interest"} ${refreshed}`;
  els.apiStatus.textContent = state.meta.lastRefreshError ? `Cached results still available. ${apiText}` : apiText;
}

function renderFilters() {
  els.savedToggle.checked = state.filters.saved === "true";
  els.unwatchedToggle.checked = state.filters.watched === "false";
  els.durationSelect.value = state.filters.duration;
  document
    .querySelectorAll('[data-filter="quality"]')
    .forEach((item) => item.classList.toggle("is-active", item.dataset.value === state.filters.quality));

  const activeTopic = state.filters.topic;
  els.topicFilters.innerHTML = "";
  els.topicFilters.append(createChip("All", "all", activeTopic === "all"));

  for (const topic of state.facets.topics || []) {
    els.topicFilters.append(createChip(topic, topic, activeTopic === topic));
  }

  const currentChannel = state.filters.channel;
  const channelOptions = [`<option value="all">All channels</option>`]
    .concat((state.facets.channels || []).map((channel) => {
      const selected = currentChannel === channel ? "selected" : "";
      return `<option value="${escapeAttribute(channel)}" ${selected}>${escapeHtml(channel)}</option>`;
    }))
    .join("");
  els.channelSelect.innerHTML = channelOptions;
  els.channelSelect.value = currentChannel;
}

function createChip(label, value, active) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chip${active ? " is-active" : ""}`;
  button.textContent = label;
  button.addEventListener("click", () => {
    state.filters.topic = value;
    loadTutorials();
  });
  return button;
}

function renderResults() {
  if (state.appConfig.authEnabled && !isSignedIn()) {
    els.resultsTitle.textContent = "Sign in to view videos";
    els.resultsMeta.textContent = "";
    els.tutorialGrid.innerHTML = `
      <div class="empty-state">
        <div>
          <h3>Your dashboard lives in your account</h3>
          <p>Use the email sign-in above to create a private dashboard with your own interests.</p>
        </div>
      </div>
    `;
    return;
  }

  const activeInterest = getActiveInterest();
  els.resultsTitle.textContent = state.tutorials.length
    ? `${state.tutorials.length} videos`
    : "No videos cached yet";
  els.resultsMeta.textContent = state.meta.total
    ? `${state.meta.filtered} shown from ${state.meta.total} cached for ${activeInterest?.name || "this interest"}`
    : "";

  if (!state.tutorials.length) {
    const message = state.meta.apiConfigured
      ? `Refresh ${activeInterest?.name || "this interest"} to pull the latest YouTube results.`
      : "Set your YouTube API key, then refresh to load real tutorials.";
    els.tutorialGrid.innerHTML = `
      <div class="empty-state">
        <div>
          <h3>Ready for the first cache</h3>
          <p>${escapeHtml(message)}</p>
        </div>
      </div>
    `;
    return;
  }

  els.tutorialGrid.innerHTML = state.tutorials.map(renderCard).join("");
  els.tutorialGrid.querySelectorAll(".tutorial-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedVideoId = card.dataset.videoId;
      renderResults();
      renderSelected();
    });
  });
  els.tutorialGrid.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const action = button.dataset.action;
      const videoId = button.closest(".tutorial-card").dataset.videoId;
      const tutorial = state.tutorials.find((item) => item.videoId === videoId);
      if (!tutorial) return;

      const response = await apiFetch(`/api/tutorials/${encodeURIComponent(videoId)}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [action]: !tutorial[action] })
      });
      const payload = await response.json();
      if (response.ok) updateTutorialInState(payload.tutorial);
      render();
    });
  });
}

function renderCard(tutorial) {
  const selected = tutorial.videoId === state.selectedVideoId;
  const activeInterest = getActiveInterest();
  const tags = (tutorial.tags || []).slice(0, 3).map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join("");
  const thumbnail = tutorial.thumbnailUrl
    ? `<img src="${escapeAttribute(tutorial.thumbnailUrl)}" alt="" loading="lazy" />`
    : `<div class="thumbnail-fallback">${escapeHtml(activeInterest?.shortName || "Video")}</div>`;
  const trusted = tutorial.trustedChannel ? `<span class="signal">Trusted</span>` : "";

  return `
    <article class="tutorial-card${selected ? " is-selected" : ""}" data-video-id="${escapeAttribute(tutorial.videoId)}">
      <div class="thumbnail">
        ${thumbnail}
        <span class="duration">${escapeHtml(tutorial.durationLabel || "")}</span>
        <div class="quick-actions">
          <button class="quick-action${tutorial.saved ? " is-active" : ""}" type="button" data-action="saved" title="Save">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" /></svg>
          </button>
          <button class="quick-action${tutorial.watched ? " is-active" : ""}" type="button" data-action="watched" title="Watched">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
          </button>
        </div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(tutorial.title)}</h3>
        <p class="card-meta">
          <span>${escapeHtml(tutorial.channelTitle || "Unknown channel")}</span>
          <span>${relativeDate(tutorial.publishedAt)}</span>
          ${trusted}
        </p>
        <div class="card-tags">${tags}</div>
      </div>
    </article>
  `;
}

function renderSelected() {
  if (state.appConfig.authEnabled && !isSignedIn()) {
    els.watchFrame.innerHTML = `<div class="empty-frame">Private dashboard</div>`;
    els.selectedChannel.textContent = "Sign in to continue";
    els.selectedTitle.textContent = "Your videos will appear here";
    els.selectedDescription.textContent = "Saved interests, refreshes, and watched state stay separate for each signed-in person.";
    els.selectedTags.innerHTML = "";
    els.youtubeLink.href = "#";
    els.saveButton.disabled = true;
    els.watchedButton.disabled = true;
    els.saveButton.classList.remove("is-active");
    els.watchedButton.classList.remove("is-active");
    return;
  }

  const selected = getSelectedTutorial();

  if (!selected) {
    els.watchFrame.innerHTML = `<div class="empty-frame">Tutorial preview</div>`;
    els.selectedChannel.textContent = "No video selected";
    els.selectedTitle.textContent = "Pick a tutorial";
    els.selectedDescription.textContent = state.meta.apiConfigured
      ? "Refresh the cache and select a tutorial to watch it here."
      : "The YouTube API key stays on the server and is never exposed to this screen.";
    els.selectedTags.innerHTML = "";
    els.youtubeLink.href = "#";
    els.saveButton.disabled = true;
    els.watchedButton.disabled = true;
    els.saveButton.classList.remove("is-active");
    els.watchedButton.classList.remove("is-active");
    return;
  }

  els.watchFrame.innerHTML = selected.embeddable
    ? `<iframe src="${escapeAttribute(selected.embedUrl)}" title="${escapeAttribute(selected.title)}" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
    : `<div class="empty-frame">Open on YouTube</div>`;
  els.selectedChannel.textContent = selected.channelTitle || "Unknown channel";
  els.selectedTitle.textContent = selected.title;
  els.selectedDescription.textContent = selected.description || "No description available.";
  const strongTags = getActiveInterestTags();
  els.selectedTags.innerHTML = (selected.tags || [])
    .map((tag) => `<span class="tag${strongTags.has(tag) ? " is-strong" : ""}">${escapeHtml(tag)}</span>`)
    .join("");
  els.youtubeLink.href = selected.url;
  els.saveButton.disabled = false;
  els.watchedButton.disabled = false;
  els.saveButton.classList.toggle("is-active", Boolean(selected.saved));
  els.watchedButton.classList.toggle("is-active", Boolean(selected.watched));
}

function getSelectedTutorial() {
  return state.tutorials.find((tutorial) => tutorial.videoId === state.selectedVideoId) || null;
}

function isSignedIn() {
  return Boolean(state.auth.session?.access_token);
}

function getActiveInterest() {
  return state.interests.find((interest) => interest.id === state.activeInterestId) || null;
}

function getActiveInterestTags() {
  const interest = getActiveInterest();
  return new Set([
    ...(interest?.searchQueries || []).flatMap((query) => query.tags || []),
    ...(interest?.topicRules || []).map((rule) => rule.tag)
  ]);
}

function keepSelectedVideoId() {
  if (state.tutorials.some((tutorial) => tutorial.videoId === state.selectedVideoId)) {
    return state.selectedVideoId;
  }
  return state.tutorials[0]?.videoId || null;
}

function updateTutorialInState(updated) {
  state.tutorials = state.tutorials.map((tutorial) =>
    tutorial.videoId === updated.videoId ? { ...tutorial, ...updated } : tutorial
  );
}

function renderError(message) {
  els.tutorialGrid.innerHTML = `
    <div class="error-state">
      <div>
        <h3>Could not load the hub</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function relativeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
  ];

  for (const [unit, seconds] of units) {
    const amount = Math.trunc(diffSeconds / seconds);
    if (Math.abs(amount) >= 1) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(amount, unit);
    }
  }

  return "just now";
}

function debounce(callback, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
