import {
  todayIso,
  parseDate,
  formatBannerDate,
  getShiftedDate,
  getStartOfWeek,
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
const DATE_STRIP_VISIBLE_DAYS = 8;
const DATE_STRIP_SHIFT_DAYS = 7;
const DEFAULT_WEEK_VIEW_SPORT_IDS = new Set([2, 3, 4, 5]);
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
const dateStripEl = document.getElementById("date-strip");
const dateWeekSummaryEl = document.getElementById("date-week-summary");
const dateViewToggle = document.getElementById("date-view-toggle");
const dayViewButton = document.getElementById("view-day");
const weekViewButton = document.getElementById("view-week");
const togglePastMatchesButton = document.getElementById("toggle-past-matches");
const matchesEl = document.getElementById("matches");
const themeToggleButton = document.getElementById("theme-toggle");
const footerMoreLinks = document.querySelector(".footer-more-links");
const EMPTY_STATE_LINK_GROUPS = ["Sports", "Featured", "Football", "Competitions", "Broadcasters"];
const MATCH_STATUS_LABELS = {
  upcoming: "Upcoming",
  ongoing: "Live now",
  finished: "Finished",
};

const setStatus = message => {
  statusEl.textContent = message || "";
};

const setMatchesBusy = isBusy => {
  if (!matchesEl) return;
  matchesEl.setAttribute("aria-busy", String(Boolean(isBusy)));
};

const STORAGE_KEYS = {
  sports: "simplifiedSports",
  countries: "simplifiedCountries",
  competitions: "simplifiedCompetitions",
  broadcasters: "simplifiedBroadcasters",
};

const initLandingUi = () => {
  if (!landingConfig) return;
  const sportControl = document.querySelector(".control-sports");
  if (sportControl && landingIds.sportIds.length === 1) {
    sportControl.hidden = true;
  }
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
let dateStripStartDate = todayIso();
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
  setStatus(
    visibleCount === totalCount
      ? `Showing ${visibleCount} event(s).`
      : `Showing ${visibleCount} of ${totalCount} event(s).`
  );
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

const getRangeStartDate = date => {
  if (currentView === WEEK_VIEW && !hasFixedDateWindow) {
    return getStartOfWeek(date || todayIso());
  }
  return date || todayIso();
};

const getRangeEndDate = date =>
  getShiftedDate(getRangeStartDate(date), getCurrentDateWindowDays() - 1);

const normalizeCurrentDateForView = () => false;

const canUseWeekView = () => !hasFixedDateWindow;

const shouldDefaultToWeekViewForSportIds = sportIds =>
  canUseWeekView() &&
  sportIds.length === 1 &&
  DEFAULT_WEEK_VIEW_SPORT_IDS.has(sportIds[0]);

const syncDateViewControls = () => {
  if (!dateViewToggle || !dayViewButton || !weekViewButton) return;
  dateViewToggle.hidden = !canUseWeekView();
  dayViewButton.classList.toggle("is-active", currentView === DAY_VIEW);
  weekViewButton.classList.toggle("is-active", currentView === WEEK_VIEW);
  dayViewButton.setAttribute("aria-pressed", String(currentView === DAY_VIEW));
  weekViewButton.setAttribute("aria-pressed", String(currentView === WEEK_VIEW));
};

const updateDateViewAvailability = ({ preferDefaultView = false } = {}) => {
  if (!getSportInputs().length) {
    syncDateViewControls();
    return { sportIds: [], viewChanged: false };
  }
  const sportIds = normalizeFilterIds(getCheckedSportIds());
  let viewChanged = false;
  if (!canUseWeekView() && currentView === WEEK_VIEW) {
    currentView = DAY_VIEW;
    writeViewToUrl(null);
    viewChanged = true;
  } else if (preferDefaultView && shouldDefaultToWeekViewForSportIds(sportIds) && currentView === DAY_VIEW) {
    currentView = WEEK_VIEW;
    writeViewToUrl(WEEK_VIEW);
    viewChanged = true;
  }
  syncDateViewControls();
  return { sportIds, viewChanged };
};

const diffInDays = (from, to) => Math.round(
  (parseDate(to).getTime() - parseDate(from).getTime()) / (24 * 60 * 60 * 1000)
);

const getWeekShiftAmount = () => (currentView === WEEK_VIEW && !hasFixedDateWindow ? WEEK_VIEW_DAYS : DATE_STRIP_SHIFT_DAYS);

const getDefaultDateStripStart = selectedDate => {
  const today = todayIso();
  const dayDiff = diffInDays(today, selectedDate || today);
  const windowOffset = Math.floor(dayDiff / DATE_STRIP_SHIFT_DAYS) * DATE_STRIP_SHIFT_DAYS;
  return getShiftedDate(today, windowOffset);
};

const syncDateStripWindow = date => {
  const targetDate = date || currentDate || todayIso();
  if (!dateStripStartDate) {
    dateStripStartDate = getDefaultDateStripStart(targetDate);
    return;
  }

  const stripEnd = getShiftedDate(dateStripStartDate, DATE_STRIP_VISIBLE_DAYS - 1);
  if (targetDate < dateStripStartDate || targetDate > stripEnd) {
    dateStripStartDate = getDefaultDateStripStart(targetDate);
  }
};

const formatDateStripTop = value => {
  if (value === todayIso()) return "Today";
  return parseDate(value).toLocaleDateString(undefined, {
    weekday: "short",
  });
};

const formatDateStripBottom = value =>
  parseDate(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

const formatWeekSummary = value => {
  const start = getRangeStartDate(value || currentDate || todayIso());
  const end = getShiftedDate(start, WEEK_VIEW_DAYS - 1);
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const startText = startDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  const endText = endDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return `${startText} - ${endText}`;
};

const renderDateStrip = () => {
  if (!dateStripEl) return;
  syncDateStripWindow(currentDate);
  dateStripEl.innerHTML = "";

  const fragment = document.createDocumentFragment();
  for (let index = 0; index < DATE_STRIP_VISIBLE_DAYS; index += 1) {
    const dateValue = getShiftedDate(dateStripStartDate, index);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-chip";
    button.setAttribute("data-date", dateValue);
    button.setAttribute("aria-pressed", String(dateValue === currentDate));
    button.setAttribute("aria-label", formatBannerDate(dateValue));

    if (dateValue === currentDate) {
      button.classList.add("is-active");
    }

    const top = document.createElement("span");
    top.className = "date-chip__top";
    top.textContent = formatDateStripTop(dateValue);

    const bottom = document.createElement("span");
    bottom.className = "date-chip__bottom";
    bottom.textContent = formatDateStripBottom(dateValue);

    button.append(top, bottom);
    fragment.appendChild(button);
  }

  dateStripEl.appendChild(fragment);
};

const syncDateRailVisibility = () => {
  if (!dateStripEl) return;
  const isWeekView = currentView === WEEK_VIEW && !hasFixedDateWindow;
  dateStripEl.hidden = isWeekView;
  if (dateWeekSummaryEl) {
    dateWeekSummaryEl.hidden = !isWeekView;
    dateWeekSummaryEl.textContent = isWeekView ? formatWeekSummary(currentDate) : "";
  }
  const rail = dateStripEl.closest(".date-banner-main");
  if (rail) {
    rail.classList.toggle("is-week-view", isWeekView);
  }
};

const updateDateNavigationLabels = () => {
  if (prevDayButton) {
    prevDayButton.setAttribute("aria-label", "Previous week");
  }
  if (nextDayButton) {
    nextDayButton.setAttribute("aria-label", "Next week");
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
  const startDate = getRangeStartDate(date);
  const endDate = getRangeEndDate(date);
  const params = {
    start_date: startDate,
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
    start_date: getRangeStartDate(date),
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
  const shouldDisable = hasFixedDateWindow || (currentDate || todayIso()) === todayIso();
  todayDayButton.classList.toggle("is-reserved-hidden", false);
  todayDayButton.disabled = shouldDisable;
  todayDayButton.setAttribute("aria-disabled", String(shouldDisable));
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
    pill.classList.toggle("is-active", input.checked && !areAllSportsSelected);
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
  updateDateViewAvailability({ preferDefaultView: true });
  normalizeCurrentDateForView();
  writeDateToUrl(currentDate === todayIso() ? null : currentDate);
  updateSeoMeta();
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

  searchInput.setAttribute("aria-haspopup", "listbox");
  searchInput.setAttribute("aria-controls", optionsEl.id);
  searchInput.setAttribute("aria-expanded", "false");

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
      empty.setAttribute("role", "presentation");
      empty.textContent = "No results";
      fragment.appendChild(empty);
    } else {
      visible.forEach(item => {
        const option = document.createElement("div");
        option.className = "option-item";
        option.setAttribute("data-id", String(item.id));
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(filter.selected.has(item.id)));
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
    searchInput.setAttribute("aria-expanded", "true");
    renderOptions();
  };

  const closeOptions = () => {
    optionsEl.classList.remove("is-open");
    searchInput.setAttribute("aria-expanded", "false");
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

const formatGroupedDateParts = value => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return {
      dayName: value,
      shortDate: "",
    };
  }

  return {
    dayName: date.toLocaleDateString(undefined, { weekday: "long" }),
    shortDate: date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
  };
};

const formatAnnouncementDate = value => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

const formatAnnouncementTime = (_date, time) => {
  const normalizedTime = time && time.trim().length > 0 ? time.trim() : "";
  if (!normalizedTime) return "Time to be confirmed";
  return normalizedTime.length > 5 ? normalizedTime.slice(0, 5) : normalizedTime;
};

const buildMatchAnnouncement = ({
  match,
  matchDate,
  matchStatus,
  sportName,
  titleText,
  metaText,
}) => {
  const parts = [];
  const addPart = value => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || parts.includes(text)) return;
    parts.push(text);
  };

  addPart(`${MATCH_STATUS_LABELS[matchStatus] || "Upcoming"} ${sportName} event`);
  addPart(formatAnnouncementDate(matchDate));
  addPart(formatAnnouncementTime(matchDate, match.time));
  addPart(titleText);
  addPart(metaText);

  const channelsText = (match.channels || [])
    .map(channel => channel.name?.trim() || "")
    .filter(Boolean)
    .join(", ");
  addPart(channelsText ? `Available on ${channelsText}` : "Broadcaster details unavailable");

  return parts.join(". ");
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
    const rangeStartDate = getRangeStartDate(date);
    dateBannerEl.textContent = rangeStartDate === getStartOfWeek(todayIso())
      ? "This week"
      : `Week of ${formatBannerDate(rangeStartDate)}`;
  } else {
    dateBannerEl.textContent = windowDays > 1
      ? `Next ${windowDays} days`
      : `${formatBannerDate(date)}`;
  }
  renderDateStrip();
  syncDateRailVisibility();
};

const registerDatePrefetch = (button, dayOffset) => {
  if (!button) return;
  const prefetch = () => {
    prefetchDateMatches(getShiftedDate(currentDate, dayOffset));
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
  card.tabIndex = 0;
  const matchDate = match.date || currentDate;
  const sportId = Number(match.sport_id);
  const matchStatus = getMatchStatus(matchDate, match.time, sportId);
  card.classList.add(`is-${matchStatus}`);

  const sportIndicator = document.createElement("div");
  sportIndicator.className = "match-sport";
  const sportConfig = Number.isFinite(sportId)
    ? SPORT_CONFIG_BY_ID[sportId] || null
    : null;
  const sportName = sportConfig?.name || match.sport?.name || "Sport";
  const indicatorPath = sportConfig?.icon || null;
  if (indicatorPath) {
    const indicator = document.createElement("img");
    indicator.className = "sport-indicator";
    indicator.src = indicatorPath;
    indicator.alt = "";
    indicator.setAttribute("aria-hidden", "true");
    sportIndicator.appendChild(indicator);
  }

  const slot = document.createElement("div");
  slot.className = "match-card__slot";

  const badge = document.createElement("span");
  badge.className = "match-card__badge";
  badge.textContent = MATCH_STATUS_LABELS[matchStatus] || "Upcoming";
  if (matchStatus === "ongoing") {
    badge.classList.add("is-live");
    badge.innerHTML = '<span class="match-card__live-dot" aria-hidden="true"></span><span>Live</span>';
  } else if (matchStatus === "finished") {
    badge.classList.add("is-finished");
  }

  const time = document.createElement("time");
  time.className = "match-time";
  const normalizedTime = match.time && match.time.trim().length > 0 ? match.time.trim() : "";
  if (normalizedTime) {
    time.dateTime = `${matchDate}T${normalizedTime}`;
  } else if (matchDate) {
    time.dateTime = matchDate;
  }
  if (isDateRangeMode()) {
    time.textContent = normalizedTime || "TBD";
  } else {
    time.textContent = normalizedTime || "";
  }

  const dayLabel = document.createElement("div");
  dayLabel.className = "match-card__day";
  dayLabel.textContent = formatGroupedDate(matchDate);

  const title = document.createElement("h3");
  title.className = "match-title";
  const teamsText = formatTeams(match);
  const hasHomeAndAwayTeams = Boolean(match.home_team?.name?.trim() && match.away_team?.name?.trim());
  const locationText = formatLocation(match);
  const competitionText = match.competition?.name || match.sport?.name || "";
  const titleText = hasHomeAndAwayTeams
    ? teamsText
    : competitionText || teamsText || locationText || "TBD";
  title.textContent = titleText;

  const meta = document.createElement("p");
  meta.className = "match-meta";
  const metaText = hasHomeAndAwayTeams
    ? competitionText || locationText
    : locationText || teamsText;
  meta.textContent = metaText;

  const body = document.createElement("div");
  body.className = "match-card__body";

  const titleRow = document.createElement("div");
  titleRow.className = "match-card__title-row";
  titleRow.append(sportIndicator, title);

  body.append(titleRow, meta);

  if (locationText && locationText !== metaText) {
    const location = document.createElement("p");
    location.className = "match-card__location";
    location.textContent = locationText;
    body.appendChild(location);
  }

  const aside = document.createElement("div");
  aside.className = "match-card__meta";

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

  if (!channels.childElementCount) {
    const fallbackPill = document.createElement("span");
    fallbackPill.className = "channel-pill is-empty";
    fallbackPill.textContent = "Coverage TBC";
    channels.appendChild(fallbackPill);
  }

  card.setAttribute(
    "aria-label",
    buildMatchAnnouncement({
      match,
      matchDate,
      matchStatus,
      sportName,
      titleText,
      metaText,
    })
  );

  slot.append(badge, time);
  if (isDateRangeMode()) {
    slot.appendChild(dayLabel);
  }

  aside.appendChild(channels);
  card.append(slot, body, aside);
  return card;
};

const renderEmptyState = () => {
  if (!matchesEl) return;
  matchesEl.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `
    <h2>No events found</h2>
    <p>Try widening the filters, shifting the date, or jumping to a different schedule page.</p>
    <div class="empty-actions">
      <button type="button" class="ghost" data-action="reset">Reset filters</button>
    </div>
  `;

  const actions = empty.querySelector(".empty-actions");
  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const seen = new Set(["/"]);
  const suggestions = [{ href: "/", label: "Home" }];

  EMPTY_STATE_LINK_GROUPS.forEach(group => {
    if (!footerMoreLinks || suggestions.length >= 5) return;
    const links = footerMoreLinks.querySelectorAll(
      `[data-footer-group="${group}"] a[data-footer-link="1"]`
    );
    links.forEach(link => {
      if (suggestions.length >= 5) return;
      const href = link.getAttribute("href") || "";
      const normalizedHref = href.replace(/\/+$/, "") || "/";
      if (!href || seen.has(normalizedHref) || normalizedHref === currentPath) return;
      suggestions.push({
        href,
        label: (link.textContent || "").trim(),
      });
      seen.add(normalizedHref);
    });
  });

  suggestions.forEach(({ href, label }) => {
    const link = document.createElement("a");
    link.className = "empty-link";
    link.href = href;
    link.textContent = label;
    actions?.appendChild(link);
  });

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
        const { dayName, shortDate } = formatGroupedDateParts(matchDate);

        const dayNameEl = document.createElement("span");
        dayNameEl.className = "match-day-heading__day";
        dayNameEl.textContent = dayName;

        heading.appendChild(dayNameEl);

        if (shortDate) {
          const shortDateEl = document.createElement("span");
          shortDateEl.className = "match-day-heading__date";
          shortDateEl.textContent = shortDate;
          heading.appendChild(shortDateEl);
        }

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
  updateDateViewAvailability();
  normalizeCurrentDateForView();
  updateDateNavigationLabels();
  updateTodayButtonVisibility();
  const date = currentDate;
  const filters = getSelectedMatchFilterParams();

  setMatchesBusy(true);
  setStatus("Loading events...");
  try {
    const matches = await fetchMatchesForDate(date, filters);
    renderMatches(matches);
    updateDateBanner(date);
    updateTodayButtonVisibility();
  } finally {
    setMatchesBusy(false);
  }
};

const handleInit = async () => {
  updateSeoMeta();
  initLandingUi();
  initTheme();
  initFooterLinkTracking();
  const urlDate = readDateFromUrl();
  currentDate = urlDate || todayIso();
  updateDateViewAvailability();
  normalizeCurrentDateForView();
  if (urlDate || currentView === WEEK_VIEW) {
    writeDateToUrl(currentDate === todayIso() ? null : currentDate);
    updateSeoMeta();
  }
  updateDateNavigationLabels();
  updateDateBanner(currentDate);
  updateTodayButtonVisibility();

  try {
    await loadFilters();
    updateDateViewAvailability({ preferDefaultView: true });
    normalizeCurrentDateForView();
    writeDateToUrl(currentDate === todayIso() ? null : currentDate);
    updateSeoMeta();
    updateDateNavigationLabels();
    await loadMatches();
  } catch (error) {
    setStatus(error.message || "Failed to load data.");
  }
};

const shiftDay = direction => {
  const next = getShiftedDate(currentDate, direction * getWeekShiftAmount());
  currentDate = next;
  dateStripStartDate = getShiftedDate(dateStripStartDate || todayIso(), direction * DATE_STRIP_SHIFT_DAYS);
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
  registerDatePrefetch(prevDayButton, -DATE_STRIP_SHIFT_DAYS);
  registerDatePrefetch(nextDayButton, DATE_STRIP_SHIFT_DAYS);
}

if (dateStripEl) {
  dateStripEl.addEventListener("click", event => {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    const nextDate = button.getAttribute("data-date");
    if (!nextDate || nextDate === currentDate) return;
    currentDate = nextDate;
    writeDateToUrl(currentDate === todayIso() ? null : currentDate);
    updateSeoMeta();
    loadMatches().catch(error => setStatus(error.message));
  });
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
    if (!canUseWeekView()) return;
    currentView = WEEK_VIEW;
    normalizeCurrentDateForView();
    writeViewToUrl(WEEK_VIEW);
    writeDateToUrl(currentDate === todayIso() ? null : currentDate);
    updateDateViewAvailability();
    updateDateNavigationLabels();
    updateDateBanner(currentDate);
    loadMatches().catch(error => setStatus(error.message));
  });
}

if (todayDayButton) {
  todayDayButton.addEventListener("click", () => {
    currentDate = todayIso();
    dateStripStartDate = todayIso();
    writeDateToUrl(currentDate === todayIso() ? null : currentDate);
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
