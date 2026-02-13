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
const nextDayButton = document.getElementById("next-day");
const matchesEl = document.getElementById("matches");

const setStatus = message => {
  statusEl.textContent = message || "";
};

const STORAGE_KEYS = {
  sports: "simplifiedSports",
  countries: "simplifiedCountries",
  competitions: "simplifiedCompetitions",
  broadcasters: "simplifiedBroadcasters",
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

const todayIso = () => new Date().toISOString().split("T")[0];
let currentDate = todayIso();

const readDateFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("date");
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : value;
};

const writeDateToUrl = value => {
  const params = new URLSearchParams(window.location.search);
  if (value) {
    params.set("date", value);
  } else {
    params.delete("date");
  }
  const query = params.toString();
  const nextUrl = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
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
  if (!apiUrl) {
    throw new Error("Missing API URL. Set window.FOOTY_CONFIG.apiUrl.");
  }
  const query = buildParams(params);
  const url = query ? `${apiUrl}${path}?${query}` : `${apiUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
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
    return;
  }

  const fragment = document.createDocumentFragment();
  matches.forEach(match => {
    const card = document.createElement("article");
    card.className = "match-card";

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
};

const loadMatches = async () => {
  const date = currentDate || todayIso();
  const sportIds = getCheckedSportIds();
  const countryIds = countryFilterState.getSelectedIds();
  const competitionIds = competitionFilterState.getSelectedIds();
  const broadcasterIds = broadcasterFilterState.getSelectedIds();

  setStatus("Loading matches...");
  const params = {
    start_date: date,
    end_date: date,
  };
  if (sportIds.length) params.sport_ids = sportIds;
  if (countryIds.length) params.country_ids = countryIds;
  if (competitionIds.length) params.competition_ids = competitionIds;
  if (broadcasterIds.length) params.broadcaster_ids = broadcasterIds;

  const matches = await fetchJson("/matches", params);
  renderMatches(matches);
  setStatus(`Showing ${matches.length} match(es).`);
  if (dateBannerEl) {
    dateBannerEl.textContent = `Matches for ${formatBannerDate(date)}`;
  }
};

const handleInit = async () => {
  currentDate = readDateFromUrl() || todayIso();
  writeDateToUrl(currentDate);
  if (dateBannerEl) {
    dateBannerEl.textContent = `Matches for ${formatBannerDate(currentDate)}`;
  }

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
  const current = parseDate(currentDate || todayIso());
  current.setDate(current.getDate() + direction);
  const next = current.toISOString().split("T")[0];
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
}

handleInit();
