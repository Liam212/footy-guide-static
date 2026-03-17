import {
  todayIso,
  formatBannerDate,
  getShiftedDate,
  readDateFromUrl,
  readViewFromUrl,
  writeDateToUrl,
  writeViewToUrl,
} from "./date-utils.js";
import { buildParams, createApiClient } from "./api-client.js";

const readConfigValue = value => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\$\{[A-Z0-9_]+\}$/.test(trimmed) ? "" : trimmed;
};

const config = window.FOOTY_CONFIG || {};
const apiUrl = readConfigValue(import.meta.env?.VITE_API_URL) ||
  readConfigValue(config.apiUrl) ||
  "/proxy";
const siteUrl = (
  readConfigValue(import.meta.env?.VITE_SITE_URL) ||
  readConfigValue(config.siteUrl) ||
  "https://whereismatch.com"
).replace(/\/$/, "");
const landingConfig = window.FOOTY_LANDING && typeof window.FOOTY_LANDING === "object"
  ? window.FOOTY_LANDING
  : null;
const isSeoLandingPage = Boolean(landingConfig);
const landingIds = {
  sportIds: (landingConfig?.sportIds || []).map(Number).filter(Number.isFinite),
  countryIds: (landingConfig?.countryIds || []).map(Number).filter(Number.isFinite),
  competitionIds: (landingConfig?.competitionIds || []).map(Number).filter(Number.isFinite),
  broadcasterIds: (landingConfig?.broadcasterIds || []).map(Number).filter(Number.isFinite),
};
const isLandingLocked = Boolean(landingConfig?.lockFilters);
const landingDateWindowDays = Number.isFinite(Number(landingConfig?.dateWindowDays))
  ? Math.max(1, Math.floor(Number(landingConfig.dateWindowDays)))
  : 1;
const hasFixedDateWindow = landingDateWindowDays > 1;
const DAY_VIEW = "day";
const WEEK_VIEW = "week";
const WEEK_VIEW_DAYS = 7;
const WEEK_VIEW_SPORT_IDS = new Set([3, 4, 5]);
const apiClient = createApiClient({
  apiUrl,
});
const { fetchJson } = apiClient;

const updateSeoMeta = () => {
  const canonicalHref = `${siteUrl}${window.location.pathname}`;
  const path = window.location.pathname || "/";
  const isApiLikePath = path === "/proxy" || path.startsWith("/proxy/") || path === "/api" || path.startsWith("/api/");

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", canonicalHref);

  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement("meta");
    robots.setAttribute("name", "robots");
    document.head.appendChild(robots);
  }
  robots.setAttribute(
    "content",
    isApiLikePath
      ? "noindex,nofollow"
      : window.location.search && window.location.search.length > 0
        ? "noindex,follow"
        : "index,follow"
  );
};

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
const advancedFilters = document.getElementById("advanced-filters");
const advancedCount = document.getElementById("advanced-count");

const statusEl = document.getElementById("status");
const dateBannerEl = document.getElementById("date-banner");
const prevDayButton = document.getElementById("prev-day");
const todayDayButton = document.getElementById("today-day");
const nextDayButton = document.getElementById("next-day");
const dateViewToggle = document.getElementById("date-view-toggle");
const dayViewButton = document.getElementById("view-day");
const weekViewButton = document.getElementById("view-week");
const togglePastMatchesButton = document.getElementById("toggle-past-matches");
const matchesEl = document.getElementById("matches");
const themeToggleButton = document.getElementById("theme-toggle");
const footerMoreLinks = document.querySelector(".footer-more-links");

const setStatus = message => {
  statusEl.textContent = message || "";
};

const STORAGE_KEYS = {
  sports: "simplifiedSports",
  countries: "simplifiedCountries",
  competitions: "simplifiedCompetitions",
  broadcasters: "simplifiedBroadcasters",
};

const initLandingUi = () => {
  if (!landingConfig) return;
  if (!isLandingLocked) return;
  document.documentElement.setAttribute("data-landing-locked", "true");
  const controls = document.querySelector(".controls");
  if (controls) controls.hidden = true;
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
    themeToggleButton.setAttribute("aria-label", `Switch to ${next} mode`);
    themeToggleButton.setAttribute("title", `Switch to ${next} mode`);

    const sr = themeToggleButton.querySelector(".sr-only");
    if (sr) {
      sr.textContent = `Switch to ${next} mode`;
    }
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

const initFooterLinkTracking = () => {
  if (!footerMoreLinks) return;

  footerMoreLinks.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link || !footerMoreLinks.contains(link)) return;
    if (!window.posthog || typeof window.posthog.capture !== "function") return;

    const href = link.getAttribute("href") || "";
    const destination = href
      ? new URL(href, window.location.origin)
      : null;
    const groupEl = link.closest("[data-footer-group]");
    const headingEl = groupEl ? groupEl.querySelector(".footer-link-heading") : null;
    const rawPosition = Number(link.getAttribute("data-footer-position"));

    window.posthog.capture("footer_seo_link_clicked", {
      link_path: destination
        ? `${destination.pathname}${destination.search}${destination.hash}`
        : href,
      link_label: (link.textContent || "").trim(),
      group: groupEl?.getAttribute("data-footer-group") || headingEl?.textContent?.trim() || "ungrouped",
      position: Number.isFinite(rawPosition) ? rawPosition : null,
      from_path: `${window.location.pathname}${window.location.search}`,
    });
  });
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
  if (isSeoLandingPage) return;
  if (!values || values.length === 0) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(values));
};

let currentDate = todayIso();
let currentView = hasFixedDateWindow ? DAY_VIEW : (readViewFromUrl() || DAY_VIEW);
let arePastMatchesVisible = false;
const MAX_MATCH_CACHE_ENTRIES = 24;
const matchResponseCache = new Map();
const inFlightMatchRequests = new Map();
let countryNameById = new Map();

const updateVisibleEventsStatus = () => {
  const totalCount = matchesEl.querySelectorAll(".match-card").length;
  const visibleCount = matchesEl.querySelectorAll(".match-card:not(.is-collapsed)").length;
  if (totalCount === 0) {
    setStatus("Showing 0 event(s).");
    return;
  }
  setStatus(`Showing ${visibleCount} event(s).`);
};

const updatePastMatchesVisibility = () => {
  const hidePastMatches = !arePastMatchesVisible;
  const finishedCards = Array.from(
    matchesEl.querySelectorAll(".match-card.is-finished")
  );
  const pastMatchCount = finishedCards.length;
  finishedCards.forEach(card => card.classList.toggle("is-collapsed", hidePastMatches));

  if (togglePastMatchesButton) {
    togglePastMatchesButton.textContent = arePastMatchesVisible
      ? `Hide past events (${pastMatchCount})`
      : `Show past events (${pastMatchCount})`;
    togglePastMatchesButton.setAttribute("aria-pressed", String(arePastMatchesVisible));
    togglePastMatchesButton.disabled = pastMatchCount === 0;
  }

  updateVisibleEventsStatus();
};

const normalizeFilterIds = ids => [...ids].sort((a, b) => a - b);

const getCurrentDateWindowDays = () => {
  if (hasFixedDateWindow) return landingDateWindowDays;
  return currentView === WEEK_VIEW ? WEEK_VIEW_DAYS : 1;
};

const isDateRangeMode = () => getCurrentDateWindowDays() > 1;

const getRangeEndDate = date => getShiftedDate(date, getCurrentDateWindowDays() - 1);

const canUseWeekViewForSportIds = sportIds =>
  !hasFixedDateWindow &&
  sportIds.length === 1 &&
  WEEK_VIEW_SPORT_IDS.has(sportIds[0]);

const syncDateViewControls = sportIds => {
  if (!dateViewToggle || !dayViewButton || !weekViewButton) return;
  const canUseWeekView = canUseWeekViewForSportIds(sportIds);
  dateViewToggle.hidden = !canUseWeekView;
  dayViewButton.classList.toggle("is-active", currentView === DAY_VIEW);
  weekViewButton.classList.toggle("is-active", currentView === WEEK_VIEW);
  dayViewButton.setAttribute("aria-pressed", String(currentView === DAY_VIEW));
  weekViewButton.setAttribute("aria-pressed", String(currentView === WEEK_VIEW));
  weekViewButton.disabled = !canUseWeekView;
};

const updateDateViewAvailability = () => {
  if (!getSportInputs().length) {
    syncDateViewControls([]);
    return;
  }
  const sportIds = normalizeFilterIds(getCheckedSportIds());
  const canUseWeekView = canUseWeekViewForSportIds(sportIds);
  if (!canUseWeekView && currentView === WEEK_VIEW) {
    currentView = DAY_VIEW;
    writeViewToUrl(null);
  }
  syncDateViewControls(sportIds);
};

const getDateShiftAmount = () => (currentView === WEEK_VIEW && !hasFixedDateWindow ? WEEK_VIEW_DAYS : 1);

const updateDateNavigationLabels = () => {
  if (prevDayButton) {
    prevDayButton.setAttribute(
      "aria-label",
      currentView === WEEK_VIEW && !hasFixedDateWindow ? "Previous week" : "Previous day"
    );
  }
  if (nextDayButton) {
    nextDayButton.setAttribute(
      "aria-label",
      currentView === WEEK_VIEW && !hasFixedDateWindow ? "Next week" : "Next day"
    );
  }
};

const getSelectedMatchFilterParams = () => {
  const sportIds = normalizeFilterIds(getCheckedSportIds());
  const countryIds = normalizeFilterIds(countryFilterState.getSelectedIds());
  const competitionIds = normalizeFilterIds(competitionFilterState.getSelectedIds());
  const broadcasterIds = normalizeFilterIds(broadcasterFilterState.getSelectedIds());
  return { sportIds, countryIds, competitionIds, broadcasterIds };
};

const buildMatchParams = (date, filters = getSelectedMatchFilterParams()) => {
  const endDate = getRangeEndDate(date);
  const params = {
    start_date: date,
    end_date: endDate,
  };
  if (filters.sportIds.length) params.sport_ids = filters.sportIds;
  if (filters.countryIds.length) params.country_ids = filters.countryIds;
  if (filters.competitionIds.length) params.competition_ids = filters.competitionIds;
  if (filters.broadcasterIds.length) params.broadcaster_ids = filters.broadcasterIds;
  return params;
};

const getMatchRequestKey = (date, filters) =>
  buildParams({
    start_date: date,
    end_date: getRangeEndDate(date),
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
  fetchMatchesForDate(date).catch(() => { });
};

const updateTodayButtonVisibility = () => {
  if (!todayDayButton) return;
  const shouldHide = hasFixedDateWindow || (currentDate || todayIso()) === todayIso();
  todayDayButton.classList.toggle("is-reserved-hidden", shouldHide);
  todayDayButton.setAttribute("aria-hidden", String(shouldHide));
};

const getSportInputs = () =>
  Array.from(sportPills.querySelectorAll("input[type=checkbox]"));

const getCheckedSportIds = () =>
  getSportInputs()
    .filter(input => input.checked)
    .map(input => Number(input.value))
    .filter(value => Number.isFinite(value));

const syncSportPillState = () => {
  const inputs = getSportInputs();
  const areAllSportsSelected = inputs.length > 0 && inputs.every(input => input.checked);
  inputs.forEach(input => {
    const pill = input.closest(".pill");
    if (!pill) return;
    pill.classList.toggle("is-active", input.checked && (isSeoLandingPage || !areAllSportsSelected));
  });
};

const saveSportSelection = () => {
  if (isSeoLandingPage) return;
  const inputs = getSportInputs();
  const selected = inputs
    .filter(input => input.checked)
    .map(input => Number(input.value))
    .filter(value => Number.isFinite(value));
  if (selected.length === inputs.length) {
    localStorage.removeItem(STORAGE_KEYS.sports);
    return;
  }
  writeStoredIds(STORAGE_KEYS.sports, selected);
};

const updateAdvancedFilterCount = () => {
  if (!advancedCount) return;
  const totalSelected =
    competitionFilterState.getSelectedIds().length +
    broadcasterFilterState.getSelectedIds().length;
  advancedCount.textContent = String(totalSelected);
  advancedCount.hidden = totalSelected === 0;
  if (advancedFilters) {
    advancedFilters.classList.toggle("has-active", totalSelected > 0);
  }
};

const refreshResultsForSportChange = () => {
  saveSportSelection();
  updateDateViewAvailability();
  updateDateNavigationLabels();
  loadCompetitions()
    .then(() => {
      updateAdvancedFilterCount();
      return loadMatches();
    })
    .catch(error => setStatus(error.message));
};


const renderSportPills = (sports, selectedIds) => {
  const hasSelected = Array.isArray(selectedIds) && selectedIds.length > 0;
  const stored = new Set(
    hasSelected
      ? selectedIds
      : isSeoLandingPage
        ? []
        : readStoredIds(STORAGE_KEYS.sports)
  );
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

    const text = document.createElement("span");
    text.textContent = sport.name;

    label.append(input, text);
    fragment.appendChild(label);
  });
  sportPills.appendChild(fragment);
  syncSportPillState();
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
    writeStoredIds(STORAGE_KEYS.countries, countryFilterState.getSelectedIds());
    loadCompetitions()
      .then(() => {
        updateAdvancedFilterCount();
        return loadMatches();
      })
      .catch(error => setStatus(error.message));
  },
});

const competitionFilterState = createMultiFilter({
  container: competitionFilter,
  searchInput: competitionSearch,
  optionsEl: competitionOptions,
  pillsEl: competitionPills,
  onChange: () => {
    writeStoredIds(STORAGE_KEYS.competitions, competitionFilterState.getSelectedIds());
    updateAdvancedFilterCount();
    loadMatches().catch(error => setStatus(error.message));
  },
});

const broadcasterFilterState = createMultiFilter({
  container: broadcasterFilter,
  searchInput: broadcasterSearch,
  optionsEl: broadcasterOptions,
  pillsEl: broadcasterPills,
  onChange: () => {
    writeStoredIds(STORAGE_KEYS.broadcasters, broadcasterFilterState.getSelectedIds());
    updateAdvancedFilterCount();
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

  renderSportPills(sports, landingIds.sportIds);
  countryNameById = new Map(
    (countries || []).map(country => [country.id, country.name])
  );
  countryFilterState.setItems(
    countries,
    false,
    isSeoLandingPage
      ? landingIds.countryIds
      : readStoredIds(STORAGE_KEYS.countries)
  );
  broadcasterFilterState.setItems(
    broadcasters,
    false,
    isSeoLandingPage
      ? landingIds.broadcasterIds
      : readStoredIds(STORAGE_KEYS.broadcasters)
  );

  await loadCompetitions();
  updateAdvancedFilterCount();
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
    isSeoLandingPage
      ? landingIds.competitionIds
      : readStoredIds(STORAGE_KEYS.competitions)
  );
};

const DEFAULT_MATCH_DURATION_MINUTES = 120;
const SPORT_CONFIG_BY_ID = {
  1: {
    name: "Football",
    icon: "/football.png",
    matchDurationMinutes: 120,
  },
  2: {
    name: "American Football",
    icon: "/american.png",
    matchDurationMinutes: 210,
  },
  3: {
    name: "Formula 1",
    icon: "/f1.png",
    matchDurationMinutes: 120,
  },
  4: {
    name: "Darts",
    icon: "/darts.png",
    matchDurationMinutes: 240,
  },
  5: {
    name: "Snooker",
    icon: "/snooker.png",
  },
};

const getMatchStatus = (date, time, sportId) => {
  const normalizedTime = time && time.trim().length > 0 ? time.trim() : "00:00";
  const matchDateTime = new Date(`${date}T${normalizedTime}`);
  if (Number.isNaN(matchDateTime.getTime())) return "upcoming";

  const durationMinutes =
    (sportId ? SPORT_CONFIG_BY_ID[sportId]?.matchDurationMinutes : undefined) ||
    DEFAULT_MATCH_DURATION_MINUTES;
  const matchEndTime = new Date(matchDateTime.getTime() + durationMinutes * 60 * 1000);
  const now = new Date();

  const isMatchInFuture = matchDateTime > now;
  const isMatchInPast = matchEndTime < now;

  if (isMatchInPast) return "finished";
  if (!isMatchInFuture && !isMatchInPast) return "ongoing";
  return "upcoming";
};

const formatGroupedDate = value => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
};

const formatLocation = match => {
  const venueName = match.venue?.name?.trim() || "";
  const venueCity =
    match.venue?.city?.trim() ||
    match.venue?.locality?.trim() ||
    match.city?.trim() ||
    "";
  const countryId =
    match.venue?.country_id ||
    match.country_id ||
    match.competition?.country_id;
  const venueCountry =
    match.country?.name?.trim() ||
    (Number.isFinite(Number(countryId))
      ? countryNameById.get(Number(countryId)) || ""
      : "");

  const locationParts = [venueName, venueCity, venueCountry].filter(Boolean);
  if (!locationParts.length) return "";
  return Array.from(new Set(locationParts)).join(", ");
};

const formatTeams = match => {
  const home = match.home_team?.name?.trim() || "";
  const away = match.away_team?.name?.trim() || "";
  if (!home && !away) return "";
  return away ? `${home} vs ${away}` : home;
};

const updateDateBanner = date => {
  if (!dateBannerEl) return;
  const windowDays = getCurrentDateWindowDays();
  if (currentView === WEEK_VIEW && !hasFixedDateWindow) {
    dateBannerEl.textContent = `Next ${WEEK_VIEW_DAYS} days from ${formatBannerDate(date)}`;
    return;
  }
  dateBannerEl.textContent = windowDays > 1
    ? `Next ${windowDays} days`
    : `${formatBannerDate(date)}`;
};

const registerDatePrefetch = (button, direction) => {
  if (!button) return;
  const prefetch = () => {
    prefetchDateMatches(getShiftedDate(currentDate, direction * getDateShiftAmount()));
  };
  button.addEventListener("mouseenter", prefetch);
  button.addEventListener("focus", prefetch);
  button.addEventListener("touchstart", prefetch, { passive: true });
};

const sortMatchesBySchedule = matches =>
  [...matches].sort((left, right) => {
    const leftDate = left.date || currentDate || "";
    const rightDate = right.date || currentDate || "";
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

    const leftTime = left.time && left.time.trim().length > 0 ? left.time : "99:99";
    const rightTime = right.time && right.time.trim().length > 0 ? right.time : "99:99";
    return leftTime.localeCompare(rightTime);
  });

const createMatchCard = match => {
  const card = document.createElement("article");
  card.className = "match-card";
  const matchDate = match.date || currentDate;
  const sportId = Number(match.sport_id);
  const matchStatus = getMatchStatus(matchDate, match.time, sportId);
  card.classList.add(`is-${matchStatus}`);

  const sportIndicator = document.createElement("div");
  sportIndicator.className = "match-sport";
  const sportConfig = Number.isFinite(sportId)
    ? SPORT_CONFIG_BY_ID[sportId] || null
    : null;
  const indicatorPath = sportConfig?.icon || null;
  if (indicatorPath) {
    const indicator = document.createElement("img");
    indicator.className = "sport-indicator";
    indicator.src = indicatorPath;
    const sportName = sportConfig?.name || match.sport?.name || "Sport";
    const iconLabel = `${sportName} icon`;
    indicator.alt = iconLabel;
    indicator.setAttribute("aria-label", iconLabel);
    sportIndicator.appendChild(indicator);
  }

  const time = document.createElement("div");
  time.className = "match-time";
  if (isDateRangeMode()) {
    time.textContent = match.time || "TBD";
  } else {
    time.textContent = match.time || "";
  }

  const title = document.createElement("div");
  title.className = "match-title";
  const teamsText = formatTeams(match);
  const hasHomeAndAwayTeams = Boolean(match.home_team?.name?.trim() && match.away_team?.name?.trim());
  const locationText = formatLocation(match);
  const competitionText = match.competition?.name || match.sport?.name || "";
  title.textContent = hasHomeAndAwayTeams
    ? teamsText
    : competitionText || teamsText || locationText || "TBD";

  const meta = document.createElement("div");
  meta.className = "match-meta";
  meta.textContent = hasHomeAndAwayTeams
    ? competitionText || locationText
    : locationText || teamsText;

  const channels = document.createElement("div");
  channels.className = "channels";
  (match.channels || []).forEach(channel => {
    const pill = document.createElement("span");
    pill.style = "text-decoration:none;";
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

  card.append(sportIndicator, time, title, meta, channels);
  return card;
};

const renderEmptyState = () => {
  if (!matchesEl) return;
  matchesEl.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `
    <h2>No events found</h2>
    <p>Try broadening your filters, switching date, or jumping to a sport page.</p>
    <div class="empty-actions">
      <button type="button" class="ghost" data-action="reset">Reset filters</button>
      <a class="empty-link" href="/">Home</a>
      <a class="empty-link" href="/watch/football/">Football</a>
      <a class="empty-link" href="/watch/rugby/">Rugby</a>
      <a class="empty-link" href="/watch/cricket/">Cricket</a>
      <a class="empty-link" href="/watch/tennis/">Tennis</a>
    </div>
  `;
  empty.querySelector('[data-action="reset"]').addEventListener("click", () => {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    const url = new URL(window.location.href);
    url.searchParams.delete("date");
    url.searchParams.delete("view");
    window.location.href = `${url.pathname}${url.search}`;
  });
  matchesEl.appendChild(empty);
  updatePastMatchesVisibility();
};

const renderMatches = matches => {
  if (!matches.length) {
    renderEmptyState();
    return;
  }

  matchesEl.innerHTML = "";
  const sortedMatches = sortMatchesBySchedule(matches);
  const fragment = document.createDocumentFragment();
  if (isDateRangeMode()) {
    let currentGroupDate = null;
    let currentGroup = null;

    sortedMatches.forEach(match => {
      const matchDate = match.date || currentDate;
      if (matchDate !== currentGroupDate) {
        currentGroupDate = matchDate;
        currentGroup = document.createElement("section");
        currentGroup.className = "match-day-group";

        const heading = document.createElement("h2");
        heading.className = "match-day-heading";
        heading.textContent = formatGroupedDate(matchDate);

        currentGroup.appendChild(heading);
        fragment.appendChild(currentGroup);
      }

      currentGroup.appendChild(createMatchCard(match));
    });
  } else {
    sortedMatches.forEach(match => {
      fragment.appendChild(createMatchCard(match));
    });
  }

  matchesEl.appendChild(fragment);
  updatePastMatchesVisibility();
};

const loadMatches = async () => {
  if (!currentDate) {
    currentDate = todayIso();
    writeDateToUrl(null);
    updateSeoMeta();
  }
  const date = currentDate;
  updateDateViewAvailability();
  updateDateNavigationLabels();
  updateTodayButtonVisibility();
  const filters = getSelectedMatchFilterParams();

  setStatus("Loading events...");
  const matches = await fetchMatchesForDate(date, filters);
  renderMatches(matches);
  updateDateBanner(date);
  updateTodayButtonVisibility();
};

const handleInit = async () => {
  updateSeoMeta();
  initLandingUi();
  initTheme();
  initFooterLinkTracking();
  const urlDate = readDateFromUrl();
  currentDate = urlDate || todayIso();
  if (urlDate) {
    writeDateToUrl(currentDate);
    updateSeoMeta();
  }
  updateDateViewAvailability();
  updateDateNavigationLabels();
  updateDateBanner(currentDate);
  updateTodayButtonVisibility();

  try {
    await loadFilters();
    updateDateViewAvailability();
    updateDateNavigationLabels();
    await loadMatches();
  } catch (error) {
    setStatus(error.message || "Failed to load data.");
  }
};

const shiftDay = direction => {
  const next = getShiftedDate(currentDate, direction * getDateShiftAmount());
  currentDate = next;
  writeDateToUrl(currentDate === todayIso() ? null : currentDate);
  updateSeoMeta();
  loadMatches().catch(error => setStatus(error.message));
};

sportPills.addEventListener("click", event => {
  const target = event.target.closest(".pill");
  if (!target) return;
  event.preventDefault();
  const inputs = getSportInputs();
  const input = target.querySelector("input");
  if (!input) return;

  const selectedCount = inputs.filter(item => item.checked).length;
  const areAllSportsSelected = inputs.length > 0 && selectedCount === inputs.length;

  if (!isSeoLandingPage && areAllSportsSelected) {
    inputs.forEach(item => {
      item.checked = item === input;
    });
  } else if (input.checked && selectedCount === 1) {
    inputs.forEach(item => {
      item.checked = true;
    });
  } else {
    input.checked = !input.checked;
  }

  syncSportPillState();
  refreshResultsForSportChange();
});

if (prevDayButton && nextDayButton) {
  prevDayButton.addEventListener("click", () => shiftDay(-1));
  nextDayButton.addEventListener("click", () => shiftDay(1));
  registerDatePrefetch(prevDayButton, -1);
  registerDatePrefetch(nextDayButton, 1);
}

if (dayViewButton && weekViewButton) {
  dayViewButton.addEventListener("click", () => {
    if (currentView === DAY_VIEW) return;
    currentView = DAY_VIEW;
    writeViewToUrl(null);
    updateDateViewAvailability();
    updateDateNavigationLabels();
    updateDateBanner(currentDate);
    loadMatches().catch(error => setStatus(error.message));
  });

  weekViewButton.addEventListener("click", () => {
    if (currentView === WEEK_VIEW) return;
    if (!canUseWeekViewForSportIds(normalizeFilterIds(getCheckedSportIds()))) return;
    currentView = WEEK_VIEW;
    writeViewToUrl(WEEK_VIEW);
    updateDateViewAvailability();
    updateDateNavigationLabels();
    updateDateBanner(currentDate);
    loadMatches().catch(error => setStatus(error.message));
  });
}

if (todayDayButton) {
  todayDayButton.addEventListener("click", () => {
    currentDate = todayIso();
    writeDateToUrl(null);
    updateSeoMeta();
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
