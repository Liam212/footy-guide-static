const config = window.FOOTY_CONFIG || {};
const apiUrl = (config.apiUrl || "").replace(/\/$/, "");
const apiKey = config.apiKey || "";

const sportPills = document.getElementById("sport-pills");

const countryFilter = document.getElementById("country-filter");
const countrySearch = document.getElementById("country-search");
const countryPills = document.getElementById("country-pills");
const countryOptions = document.getElementById("country-options");

const competitionFilter = document.getElementById("competition-filter");
const competitionSearch = document.getElementById("competition-search");
const competitionPills = document.getElementById("competition-pills");
const competitionOptions = document.getElementById("competition-options");

const broadcasterFilter = document.getElementById("broadcaster-filter");
const broadcasterSearch = document.getElementById("broadcaster-search");
const broadcasterPills = document.getElementById("broadcaster-pills");
const broadcasterOptions = document.getElementById("broadcaster-options");

const statusEl = document.getElementById("status");
const dateBannerEl = document.getElementById("date-banner");
const prevDayButton = document.getElementById("prev-day");
const todayDayButton = document.getElementById("today-day");
const nextDayButton = document.getElementById("next-day");
const togglePastMatchesButton = document.getElementById("toggle-past-matches");
const matchesEl = document.getElementById("matches");
const themeToggleButton = document.getElementById("theme-toggle");

const setStatus = message => {
  statusEl.textContent = message || "";
};

const STORAGE_KEYS = {
  sports: "simplifiedSports",
  countries: "simplifiedCountries",
  competitions: "simplifiedCompetitions",
  broadcasters: "simplifiedBroadcasters",
};

const THEME_STORAGE_KEY = "simplifiedTheme";
const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

const getStoredTheme = () => {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === "dark" || value === "light" ? value : null;
};

const getSystemTheme = () => (darkModeQuery.matches ? "dark" : "light");

const applyTheme = theme => {
  document.documentElement.setAttribute("data-theme", theme);
  if (themeToggleButton) {
    const next = theme === "dark" ? "light" : "dark";
    themeToggleButton.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    themeToggleButton.setAttribute("aria-label", `Switch to ${next} mode`);
  }
};

const initTheme = () => {
  const stored = getStoredTheme();
  applyTheme(stored || getSystemTheme());

  darkModeQuery.addEventListener("change", () => {
    if (getStoredTheme()) return;
    applyTheme(getSystemTheme());
  });

  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || getSystemTheme();
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });
  }
};

const readStoredIds = key => {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(value => Number.isFinite(value));
  } catch {
    return [];
  }
};

const writeStoredIds = (key, values) => {
  if (!values || values.length === 0) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(values));
};

const todayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
let currentDate = todayIso();
let arePastMatchesVisible = false;
const MAX_MATCH_CACHE_ENTRIES = 24;
const matchResponseCache = new Map();
const inFlightMatchRequests = new Map();

const updatePastMatchesVisibility = () => {
  const hidePastMatches = !arePastMatchesVisible;
  const finishedCards = Array.from(
    matchesEl.querySelectorAll(".match-card.is-finished")
  );
  const pastMatchCount = finishedCards.length;
  finishedCards.forEach(card => card.classList.toggle("is-collapsed", hidePastMatches));

  if (togglePastMatchesButton) {
    togglePastMatchesButton.textContent = arePastMatchesVisible
      ? `Hide past matches (${pastMatchCount})`
      : `Show past matches (${pastMatchCount})`;
    togglePastMatchesButton.setAttribute("aria-pressed", String(arePastMatchesVisible));
    togglePastMatchesButton.disabled = pastMatchCount === 0;
  }
};

const readDateFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("date");
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : value;
};

const writeDateToUrl = value => {
  const url = new URL(window.location.href);
  if (value) {
    url.searchParams.set("date", value);
  } else {
    url.searchParams.delete("date");
  }
  const nextUrl = `${url.pathname}${url.search}`;
  window.history.replaceState({}, "", nextUrl);
};

const parseDate = value => {
  if (!value) return new Date();
  return new Date(`${value}T00:00:00`);
};

const formatBannerDate = value => {
  const date = parseDate(value);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getShiftedDate = (value, direction) => {
  const date = parseDate(value || todayIso());
  date.setDate(date.getDate() + direction);
  return date.toISOString().split("T")[0];
};

const normalizeFilterIds = ids => [...ids].sort((a, b) => a - b);

const getSelectedMatchFilterParams = () => {
  const sportIds = normalizeFilterIds(getCheckedSportIds());
  const countryIds = normalizeFilterIds(countryFilterState.getSelectedIds());
  const competitionIds = normalizeFilterIds(competitionFilterState.getSelectedIds());
  const broadcasterIds = normalizeFilterIds(broadcasterFilterState.getSelectedIds());
  return { sportIds, countryIds, competitionIds, broadcasterIds };
};

const buildMatchParams = (date, filters = getSelectedMatchFilterParams()) => {
  const params = {
    start_date: date,
    end_date: date,
  };
  if (filters.sportIds.length) params.sport_ids = filters.sportIds;
  if (filters.countryIds.length) params.country_ids = filters.countryIds;
  if (filters.competitionIds.length) params.competition_ids = filters.competitionIds;
  if (filters.broadcasterIds.length) params.broadcaster_ids = filters.broadcasterIds;
  return params;
};

const getMatchRequestKey = (date, filters) =>
  buildParams({
    date,
    sport_ids: filters.sportIds,
    country_ids: filters.countryIds,
    competition_ids: filters.competitionIds,
    broadcaster_ids: filters.broadcasterIds,
  });

const cacheMatchesResponse = (key, matches) => {
  if (matchResponseCache.has(key)) {
    matchResponseCache.delete(key);
  }
  matchResponseCache.set(key, matches);
  if (matchResponseCache.size <= MAX_MATCH_CACHE_ENTRIES) return;
  const oldestKey = matchResponseCache.keys().next().value;
  if (oldestKey) {
    matchResponseCache.delete(oldestKey);
  }
};

const fetchMatchesForDate = (date, filters = getSelectedMatchFilterParams()) => {
  const key = getMatchRequestKey(date, filters);
  if (matchResponseCache.has(key)) {
    return Promise.resolve(matchResponseCache.get(key));
  }
  if (inFlightMatchRequests.has(key)) {
    return inFlightMatchRequests.get(key);
  }

  const request = fetchJson("/matches", buildMatchParams(date, filters))
    .then(matches => {
      cacheMatchesResponse(key, matches);
      return matches;
    })
    .finally(() => {
      inFlightMatchRequests.delete(key);
    });

  inFlightMatchRequests.set(key, request);
  return request;
};

const prefetchDateMatches = date => {
  if (!date) return;
  fetchMatchesForDate(date).catch(() => {});
};

const updateTodayButtonVisibility = () => {
  if (!todayDayButton) return;
  todayDayButton.style.display = `${(currentDate || todayIso()) === todayIso() ? 'none' : 'flex'}`;
};

const buildParams = params => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => query.append(key, String(item)));
      return;
    }
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
};

const fetchJson = async (path, params = {}) => {
  if (!apiUrl || !apiKey) {
    throw new Error("Missing API URL or API KEY.");
  }
  const query = buildParams(params);
  const url = query ? `${apiUrl}${path}?${query}` : `${apiUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    }
  });

  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }

  return res.json();
};

const getCheckedSportIds = () =>
  Array.from(sportPills.querySelectorAll("input[type=checkbox]:checked"))
    .map(input => Number(input.value))
    .filter(value => Number.isFinite(value));

const renderSportPills = sports => {
  const stored = new Set(readStoredIds(STORAGE_KEYS.sports));
  sportPills.innerHTML = "";
  const fragment = document.createDocumentFragment();
  sports.forEach(sport => {
    const label = document.createElement("label");
    label.className = "pill";
    label.setAttribute("data-id", String(sport.id));

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = String(sport.id);
    input.checked = stored.size === 0 ? true : stored.has(sport.id);
    if (input.checked) {
      label.classList.add("is-active");
    }

    const text = document.createElement("span");
    text.textContent = sport.name;

    label.append(input, text);
    fragment.appendChild(label);
  });
  sportPills.appendChild(fragment);
};

const createMultiFilter = ({
  container,
  searchInput,
  optionsEl,
  pillsEl,
  onChange,
}) => {
  const filter = {
    container,
    searchInput,
    optionsEl,
    pillsEl,
    items: [],
    selected: new Set(),
    onChange,
  };

  const renderPills = () => {
    pillsEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    filter.items
      .filter(item => filter.selected.has(item.id))
      .forEach(item => {
        const pill = document.createElement("span");
        pill.className = "token-pill";
        pill.setAttribute("data-id", String(item.id));
        pill.textContent = item.name;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${item.name}`);
        remove.textContent = "×";

        pill.appendChild(remove);
        fragment.appendChild(pill);
      });
    pillsEl.appendChild(fragment);
  };

  const renderOptions = () => {
    const query = (searchInput.value || "").trim().toLowerCase();
    optionsEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const visible = filter.items.filter(item =>
      !query ? true : item.name.toLowerCase().includes(query)
    );

    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "option-item";
      empty.textContent = "No results";
      fragment.appendChild(empty);
    } else {
      visible.forEach(item => {
        const option = document.createElement("div");
        option.className = "option-item";
        option.setAttribute("data-id", String(item.id));
        if (filter.selected.has(item.id)) {
          option.classList.add("is-selected");
        }
        option.textContent = item.name;
        fragment.appendChild(option);
      });
    }

    optionsEl.appendChild(fragment);
  };

  const getVisibleItems = () => {
    const query = (searchInput.value || "").trim().toLowerCase();
    return filter.items.filter(item =>
      !query ? true : item.name.toLowerCase().includes(query)
    );
  };

  const openOptions = () => {
    optionsEl.classList.add("is-open");
    renderOptions();
  };

  const closeOptions = () => {
    optionsEl.classList.remove("is-open");
  };

  const toggleSelection = id => {
    if (filter.selected.has(id)) {
      filter.selected.delete(id);
    } else {
      filter.selected.add(id);
    }
    renderPills();
    renderOptions();
    if (filter.onChange) filter.onChange();
  };

  const selectOnlyIfMissing = id => {
    if (filter.selected.has(id)) return;
    filter.selected.add(id);
    renderPills();
    renderOptions();
    if (filter.onChange) filter.onChange();
  };

  const setItems = (items, pruneMissing = true, restoreIds = []) => {
    filter.items = items || [];
    if (restoreIds.length > 0 && filter.selected.size === 0) {
      restoreIds.forEach(id => filter.selected.add(id));
    }
    if (pruneMissing) {
      const valid = new Set(filter.items.map(item => item.id));
      filter.selected = new Set(
        Array.from(filter.selected).filter(id => valid.has(id))
      );
    }
    renderPills();
    renderOptions();
  };

  const getSelectedIds = () => Array.from(filter.selected);

  searchInput.addEventListener("focus", openOptions);
  searchInput.addEventListener("input", openOptions);
  searchInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    const visible = getVisibleItems();
    if (visible.length !== 1) return;
    event.preventDefault();
    selectOnlyIfMissing(visible[0].id);
  });

  optionsEl.addEventListener("click", event => {
    const target = event.target.closest(".option-item");
    if (!target || target.textContent === "No results") return;
    const id = Number(target.getAttribute("data-id"));
    if (!Number.isFinite(id)) return;
    toggleSelection(id);
  });

  pillsEl.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const pill = event.target.closest(".token-pill");
    if (!pill) return;
    const id = Number(pill.getAttribute("data-id"));
    if (!Number.isFinite(id)) return;
    toggleSelection(id);
  });

  container.addEventListener("click", () => {
    searchInput.focus();
  });

  document.addEventListener("click", event => {
    if (!container.contains(event.target)) {
      closeOptions();
    }
  });

  return { setItems, getSelectedIds, openOptions };
};

const countryFilterState = createMultiFilter({
  container: countryFilter,
  searchInput: countrySearch,
  optionsEl: countryOptions,
  pillsEl: countryPills,
  onChange: () => {
    writeStoredIds(
      STORAGE_KEYS.countries,
      countryFilterState.getSelectedIds()
    );
    loadCompetitions()
      .then(() => loadMatches())
      .catch(error => setStatus(error.message));
  },
});

const competitionFilterState = createMultiFilter({
  container: competitionFilter,
  searchInput: competitionSearch,
  optionsEl: competitionOptions,
  pillsEl: competitionPills,
  onChange: () => {
    writeStoredIds(
      STORAGE_KEYS.competitions,
      competitionFilterState.getSelectedIds()
    );
    loadMatches().catch(error => setStatus(error.message));
  },
});

const broadcasterFilterState = createMultiFilter({
  container: broadcasterFilter,
  searchInput: broadcasterSearch,
  optionsEl: broadcasterOptions,
  pillsEl: broadcasterPills,
  onChange: () => {
    writeStoredIds(
      STORAGE_KEYS.broadcasters,
      broadcasterFilterState.getSelectedIds()
    );
    loadMatches().catch(error => setStatus(error.message));
  },
});

const loadFilters = async () => {
  setStatus("Loading filters...");
  const [sports, countries, broadcasters] = await Promise.all([
    fetchJson("/sports"),
    fetchJson("/countries"),
    fetchJson("/broadcasters"),
  ]);

  renderSportPills(sports);
  countryFilterState.setItems(
    countries,
    false,
    readStoredIds(STORAGE_KEYS.countries)
  );
  broadcasterFilterState.setItems(
    broadcasters,
    false,
    readStoredIds(STORAGE_KEYS.broadcasters)
  );

  await loadCompetitions();
  setStatus("");
};

const loadCompetitions = async () => {
  const sportIds = getCheckedSportIds();
  const countryIds = countryFilterState.getSelectedIds();
  const params = {};
  if (sportIds.length) params.sport_ids = sportIds;
  if (countryIds.length) params.country_ids = countryIds;
  const competitions = await fetchJson("/competitions", params);
  competitionFilterState.setItems(
    competitions,
    true,
    readStoredIds(STORAGE_KEYS.competitions)
  );
};

const DEFAULT_MATCH_DURATION_MINUTES = 120;
const SPORT_MATCH_DURATION_MINUTES = {
  1: 120,
  2: 210,
  3: 120,
  4: 30,
};

const getMatchStatus = (date, time, sportId) => {
  const normalizedTime = time && time.trim().length > 0 ? time.trim() : "00:00";
  const matchDateTime = new Date(`${date}T${normalizedTime}`);
  if (Number.isNaN(matchDateTime.getTime())) return "upcoming";

  const durationMinutes =
    (sportId ? SPORT_MATCH_DURATION_MINUTES[sportId] : undefined) ||
    DEFAULT_MATCH_DURATION_MINUTES;
  const matchEndTime = new Date(matchDateTime.getTime() + durationMinutes * 60 * 1000);
  const now = new Date();

  const isMatchInFuture = matchDateTime > now;
  const isMatchInPast = matchEndTime < now;

  if (isMatchInPast) return "finished";
  if (!isMatchInFuture && !isMatchInPast) return "ongoing";
  return "upcoming";
};

const formatTeams = match => {
  const home = match.home_team?.name || "TBD";
  const away = match.away_team?.name || "";
  return away ? `${home} vs ${away}` : home;
};

const renderMatches = matches => {
  matchesEl.innerHTML = "";
  if (!matches.length) {
    matchesEl.innerHTML =
      '<div class="match-card">No matches found for these filters.</div>';
    updatePastMatchesVisibility();
    return;
  }

  const fragment = document.createDocumentFragment();
  matches.forEach(match => {
    const card = document.createElement("article");
    card.className = "match-card";
    const matchDate = match.date || currentDate;
    const sportId = match.sport?.id || match.sport_id || match.competition?.sport_id;
    const matchStatus = getMatchStatus(matchDate, match.time, sportId);
    card.classList.add(`is-${matchStatus}`);

    const time = document.createElement("div");
    time.className = "match-time";
    time.textContent = match.time || "";

    const title = document.createElement("div");
    title.className = "match-title";
    title.textContent = formatTeams(match);

    const meta = document.createElement("div");
    meta.className = "match-meta";
    meta.textContent = match.competition?.name || "";

    const channels = document.createElement("div");
    channels.className = "channels";
    (match.channels || []).forEach(channel => {
      const pill = document.createElement("span");
      // pill.href = `/broadcaster?id=${channel.id}`
      pill.style = "text-decoration:none;"
      pill.className = "channel-pill";
      pill.textContent = channel.name;
      if (channel.primary_color) {
        pill.style.background = channel.primary_color;
      }
      if (channel.text_color) {
        pill.style.color = channel.text_color;
      }
      channels.appendChild(pill);
    });

    card.append(time, title, meta, channels);
    fragment.appendChild(card);
  });

  matchesEl.appendChild(fragment);
  updatePastMatchesVisibility();
};

const loadMatches = async () => {
  if (!currentDate) {
    currentDate = todayIso();
    writeDateToUrl(currentDate);
  }
  const date = currentDate;
  updateTodayButtonVisibility();
  const filters = getSelectedMatchFilterParams();

  setStatus("Loading matches...");
  const matches = await fetchMatchesForDate(date, filters);
  renderMatches(matches);
  setStatus(`Showing ${matches.length} match(es).`);
  if (dateBannerEl) {
    dateBannerEl.textContent = `${formatBannerDate(date)}`;
  }
  updateTodayButtonVisibility();
};

const handleInit = async () => {
  initTheme();
  currentDate = readDateFromUrl() || todayIso();
  writeDateToUrl(currentDate);
  if (dateBannerEl) {
    dateBannerEl.textContent = `${formatBannerDate(currentDate)}`;
  }
  updateTodayButtonVisibility();

  if (!apiUrl) {
    setStatus("Set window.FOOTY_CONFIG.apiUrl to load data.");
    return;
  }

  try {
    await loadFilters();
    await loadMatches();
  } catch (error) {
    setStatus(error.message || "Failed to load data.");
  }
};

const shiftDay = direction => {
  const next = getShiftedDate(currentDate, direction);
  currentDate = next;
  writeDateToUrl(currentDate);
  loadMatches().catch(error => setStatus(error.message));
};

sportPills.addEventListener("click", event => {
  const target = event.target.closest(".pill");
  if (!target) return;
  const input = target.querySelector("input");
  if (input) {
    input.checked = !input.checked;
    target.classList.toggle("is-active", input.checked);
  }
  writeStoredIds(STORAGE_KEYS.sports, getCheckedSportIds());
  loadCompetitions()
    .then(() => loadMatches())
    .catch(error => setStatus(error.message));
});

if (prevDayButton && nextDayButton) {
  prevDayButton.addEventListener("click", () => shiftDay(-1));
  nextDayButton.addEventListener("click", () => shiftDay(1));
  prevDayButton.addEventListener("mouseenter", () => {
    prefetchDateMatches(getShiftedDate(currentDate, -1));
  });
  nextDayButton.addEventListener("mouseenter", () => {
    prefetchDateMatches(getShiftedDate(currentDate, 1));
  });
  prevDayButton.addEventListener("focus", () => {
    prefetchDateMatches(getShiftedDate(currentDate, -1));
  });
  nextDayButton.addEventListener("focus", () => {
    prefetchDateMatches(getShiftedDate(currentDate, 1));
  });
  prevDayButton.addEventListener("touchstart", () => {
    prefetchDateMatches(getShiftedDate(currentDate, -1));
  }, { passive: true });
  nextDayButton.addEventListener("touchstart", () => {
    prefetchDateMatches(getShiftedDate(currentDate, 1));
  }, { passive: true });
}

if (todayDayButton) {
  todayDayButton.addEventListener("click", () => {
    currentDate = todayIso();
    writeDateToUrl(currentDate);
    loadMatches().catch(error => setStatus(error.message));
  });
}

if (togglePastMatchesButton) {
  togglePastMatchesButton.addEventListener("click", () => {
    arePastMatchesVisible = !arePastMatchesVisible;
    updatePastMatchesVisibility();
  });
}

handleInit();
