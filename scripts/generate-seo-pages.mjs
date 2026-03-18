import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_URL = "https://whereismatch.com";
const UK_TIMEZONE = "Europe/London";
const API_URL_PLACEHOLDER = "${API_URL}";
const ENVIROMENT_PLACEHOLDER = "${ENVIROMENT}";
const POSTHOG_KEY_PLACEHOLDER = "${POSTHOG_KEY}";
const POSTHOG_HOST_PLACEHOLDER = "${POSTHOG_HOST}";
const OUT_DIR = process.env.OUT_DIR || process.cwd();
const MANIFEST_PATH = path.join(OUT_DIR, ".seo-manifest.json");
const BACKUP_DIR = path.join(OUT_DIR, ".seo-backups");
const RAW_API_URL =
  process.env.API_URL ||
  process.env.VITE_API_URL ||
  process.env.VITE_API_PROXY_TARGET ||
  "";

const apiUrl = RAW_API_URL.trim().replace(/\/$/, "");
if (!apiUrl) {
  throw new Error(
    "Missing API_URL. Provide API_URL, VITE_API_URL, or VITE_API_PROXY_TARGET as an env var during generation."
  );
}

const manifest = {
  backupDir: BACKUP_DIR,
  backups: [],
  generatedFiles: [],
};
const trackedPaths = new Set();

const seo = {
  "premier-league-on-tv": { competition_id: 18, sport_id: 1 },
  "champions-league-on-tv": { competition_id: 4, sport_id: 1 },
  "europa-league-on-tv": { competition_id: 12, sport_id: 1 },
  "la-liga-on-tv": { competition_id: 410, sport_id: 1 },
  "serie-a-on-tv": { competition_id: 409, sport_id: 1 },
  "bundesliga-on-tv": { competition_id: 405, sport_id: 1 },
  "ligue-1-on-tv": { competition_id: 408, sport_id: 1 },
  "fa-cup-on-tv": { competition_id: 2694, sport_id: 1 },
  "efl-championship-on-tv": { competition_id: 7, sport_id: 1 },
  "sky-on-tv": { broadcaster_id: 15 },
  "sky-sports-on-tv": { broadcaster_id: 15, label: "Sky Sports on TV" },
  "tnt-on-tv": { broadcaster_id: 18, label: "TNT Sports on TV" },
  "dazn-on-tv": { broadcaster_id: 6, label: "DAZN on TV" },
  "amazon-prime-video-on-tv": { broadcaster_id: 2, label: "Amazon Prime Video on TV" },
};

const PRIMARY_NAV_PATHS = [
  "/football-on-tv-today/",
  "/premier-league-on-tv/",
  "/champions-league-on-tv/",
  "/watch/american-football/",
  "/watch/formula-1/",
  "/watch/snooker/",
  "/watch/darts/",
];

const FOOTER_GROUP_ORDER = [
  "Featured",
  "Sports",
  "Football",
  "Competitions",
  "Broadcasters",
];

const MATCH_DURATION_BY_SPORT_ID = {
  1: 120,
  2: 210,
  3: 120,
  4: 240,
  5: 240,
};

const exists = async filePath => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const slugify = value =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

const titleCaseFromSlug = value =>
  String(value || "")
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const stripStageLabel = value => String(value || "").split(" — ")[0].trim();

const escapeHtml = value =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const buildParams = params => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
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

const ensureDir = async dir => {
  await mkdir(dir, { recursive: true });
};

const dedupeStrings = values =>
  Array.from(
    new Set(
      (values || [])
        .map(value => String(value || "").trim())
        .filter(Boolean)
    )
  );

const formatList = (items, conjunction = "and") => {
  const values = dedupeStrings(items);
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} ${conjunction} ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, ${conjunction} ${values.at(-1)}`;
};

const getUkTodayIso = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: UK_TIMEZONE,
  }).format(new Date());

const shiftIsoDate = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatGroupedDate = value => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: UK_TIMEZONE,
  });
};

const formatTime = value => {
  const text = String(value || "").trim();
  if (!text) return "TBD";
  return text.slice(0, 5);
};

const fetchJson = async (apiPath, params = {}) => {
  const query = buildParams(params);
  const url = query ? `${apiUrl}${apiPath}?${query}` : `${apiUrl}${apiPath}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  return res.json();
};

const fetchMatchesOrEmpty = async (params, context) => {
  try {
    const matches = await fetchJson("/matches", params);
    return Array.isArray(matches) ? matches : [];
  } catch (error) {
    console.warn(
      `SEO generator: unable to fetch featured matches for ${context}: ${error.message}`
    );
    return [];
  }
};

const trackFileWrite = async filePath => {
  if (trackedPaths.has(filePath)) return;
  trackedPaths.add(filePath);

  if (await exists(filePath)) {
    const relativePath = path.relative(OUT_DIR, filePath);
    const backupPath = path.join(BACKUP_DIR, relativePath);
    await ensureDir(path.dirname(backupPath));
    await writeFile(backupPath, await readFile(filePath, "utf8"), "utf8");
    manifest.backups.push({
      originalPath: filePath,
      backupPath,
    });
    return;
  }

  manifest.generatedFiles.push(filePath);
};

const writeUtf8 = async (filePath, contents) => {
  await trackFileWrite(filePath);
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, contents, "utf8");
};

const replacePlaceholder = (contents, placeholder, html) =>
  contents.includes(placeholder)
    ? contents.replace(placeholder, html)
    : contents;

const injectStaticPageSections = async ({ filePath, replacements = {}, footerLinksHtml }) => {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  const original = contents;
  Object.entries(replacements).forEach(([placeholder, html]) => {
    contents = replacePlaceholder(contents, placeholder, html || "");
  });

  contents = contents.replace(
    /(<div class="footer-more-links"[^>]*>\s*)(?:<!-- SEO_PAGES -->|[\s\S]*?)(\s*<\/div>)/,
    `$1${footerLinksHtml}$2`
  );

  if (contents !== original) {
    await writeUtf8(filePath, contents);
  }
};

const buildSitemap = urls => {
  const body = urls
    .sort((a, b) => a.localeCompare(b, "en"))
    .map(loc => `  <url>\n    <loc>${loc}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
};

const buildFooterLinksHtml = pages => {
  const grouped = new Map();
  for (const page of pages) {
    const group = page.group || "Featured";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(page);
  }

  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const ai = FOOTER_GROUP_ORDER.indexOf(a[0]);
    const bi = FOOTER_GROUP_ORDER.indexOf(b[0]);
    const ar = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const br = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (ar !== br) return ar - br;
    return a[0].localeCompare(b[0], "en");
  });

  return sortedGroups
    .map(([group, groupPages]) => {
      const links = groupPages
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, "en"))
        .map(
          (page, index) =>
            `<a href="${page.path}" data-footer-link="1" data-footer-position="${index + 1}">${escapeHtml(page.label)}</a>`
        )
        .join("\n                ");

      return `<section class="footer-link-group" data-footer-group="${escapeHtml(group)}" aria-label="${escapeHtml(group)} pages">
              <p class="footer-link-heading">${escapeHtml(group)}</p>
              <div class="footer-link-items">
                ${links}
              </div>
            </section>`;
    })
    .join("\n            ");
};

const pickPagesByPath = (pages, paths) =>
  paths
    .map(targetPath => pages.find(page => page.path === targetPath))
    .filter(Boolean);

const buildPrimaryNavHtml = pages => {
  if (!pages.length) return "";
  const links = pages
    .map(
      page =>
        `<a class="seo-nav-link" href="${page.path}">${escapeHtml(page.label)}</a>`
    )
    .join("\n        ");
  return `<nav class="seo-top-nav" aria-label="Popular pages">
      ${links}
    </nav>`;
};

const buildLinkGridHtml = pages =>
  pages
    .map(
      page =>
        `<a class="seo-grid-link" href="${page.path}">${escapeHtml(page.label)}</a>`
    )
    .join("\n            ");

const buildHomeHubHtml = ({ featuredPages, competitionPages, sportPages, footballPages }) => {
  return `<section class="seo-home-hub" aria-label="Browse key pages">
        <article class="page-card seo-copy-card">
          <h2>Browse by competition and sport</h2>
          <p>
            These links are rendered directly into the homepage HTML so important landing pages are
            never hidden behind JavaScript filters alone. Start with today’s listings, jump into a
            major football competition, or open a sport-specific schedule page in one click.
          </p>
        </article>
        <div class="seo-section-grid">
          <section class="page-card seo-copy-card" aria-label="Popular today pages">
            <h2>Popular today pages</h2>
            <div class="seo-link-grid">
              ${buildLinkGridHtml(featuredPages)}
            </div>
          </section>
          <section class="page-card seo-copy-card" aria-label="Popular competitions">
            <h2>Popular competitions</h2>
            <div class="seo-link-grid">
              ${buildLinkGridHtml(competitionPages)}
            </div>
          </section>
          <section class="page-card seo-copy-card" aria-label="Popular sports">
            <h2>Popular sports on TV</h2>
            <div class="seo-link-grid">
              ${buildLinkGridHtml(sportPages)}
            </div>
          </section>
          <section class="page-card seo-copy-card" aria-label="More football pages">
            <h2>More football pages</h2>
            <div class="seo-link-grid">
              ${buildLinkGridHtml(footballPages)}
            </div>
          </section>
        </div>
      </section>`;
};

const decoratePageDef = def => {
  const base = {
    ...def,
    previewWindowDays: def.previewWindowDays || 7,
  };

  switch (def.pageType) {
    case "sport":
      return {
        ...base,
        title: `${def.entityName} on TV UK | Live Fixtures, Start Times & Channels`,
        description: `Find ${def.entityName.toLowerCase()} on TV in the UK with live fixtures, start times, and channel listings.`,
        heading: `${def.entityName} on TV`,
        intro: `Browse live ${def.entityName.toLowerCase()} listings, UK start times, and broadcaster information in one place.`,
      };
    case "competition":
      return {
        ...base,
        title: `${def.entityName} on TV UK | Fixtures, Kick-Off Times & Channels`,
        description: `See ${def.entityName.toLowerCase()} fixtures on TV in the UK with kick-off times, channels, and featured listings.`,
        heading: `${def.entityName} on TV`,
        intro: `Check ${def.entityName.toLowerCase()} fixtures, kick-off times, and UK channel listings from one landing page.`,
      };
    case "broadcaster":
      return {
        ...base,
        title: `${def.entityName} on TV UK | Live Sport Schedule & Channels`,
        description: `See live sport listed on ${def.entityName} in the UK with fixture times, competitions, and related pages.`,
        heading: `${def.entityName} on TV`,
        intro: `Browse live fixtures currently listed on ${def.entityName}, with kick-off times and competition context.`,
      };
    case "country-football":
      return {
        ...base,
        title: `${def.entityName} football on TV UK | Fixtures, Kick-Off Times & Channels`,
        description: `Browse ${def.entityName.toLowerCase()} football on TV in the UK with fixtures, kick-off times, and channel listings.`,
        heading: `${def.entityName} football on TV`,
        intro: `Track ${def.entityName.toLowerCase()} football fixtures, competition coverage, and UK broadcaster listings from one page.`,
      };
    case "today-all":
      return {
        ...base,
        previewWindowDays: 1,
        title: "Sport on TV Today UK | Live Fixtures & Channels",
        description: "See what sport is on TV today in the UK with featured fixtures, start times, and channel listings.",
        heading: "Matches today",
        intro: "Browse today’s live sport and see which channels are showing each fixture.",
      };
    case "today-football":
      return {
        ...base,
        previewWindowDays: 1,
        title: "Football on TV Today UK | Kick-Off Times & Channels",
        description: "Find football on TV today in the UK with kick-off times, featured fixtures, and broadcaster listings.",
        heading: "Football on TV today",
        intro: "See today’s football fixtures, kick-off times, and channel listings for UK viewers.",
      };
    default:
      return base;
  }
};

const pickRelatedPages = (page, pages) => {
  const currentPath = page.canonicalPath || page.path || "";
  const preferredPaths = [];

  if (page.pageType !== "today-football") preferredPaths.push("/football-on-tv-today/");
  if (page.pageType !== "today-all") preferredPaths.push("/matches-today/");

  if (page.pageType === "competition" || page.pageType === "country-football") {
    preferredPaths.push(
      "/premier-league-on-tv/",
      "/champions-league-on-tv/",
      "/la-liga-on-tv/",
      "/bundesliga-on-tv/"
    );
  }

  if (page.pageType === "sport") {
    preferredPaths.push(
      "/watch/football/",
      "/watch/american-football/",
      "/watch/formula-1/",
      "/watch/snooker/"
    );
  }

  if (page.pageType === "broadcaster") {
    preferredPaths.push(
      "/sky-sports-on-tv/",
      "/tnt-on-tv/",
      "/dazn-on-tv/",
      "/amazon-prime-video-on-tv/"
    );
  }

  if (page.pageType === "today-all" || page.pageType === "today-football") {
    preferredPaths.push(
      "/premier-league-on-tv/",
      "/champions-league-on-tv/",
      "/watch/football/",
      "/watch/formula-1/"
    );
  }

  const selected = [];
  const seen = new Set([currentPath]);
  preferredPaths.forEach(targetPath => {
    const related = pages.find(entry => entry.path === targetPath);
    if (!related || seen.has(related.path)) return;
    seen.add(related.path);
    selected.push(related);
  });

  const matchingGroup = pages
    .filter(entry => entry.group === page.group && entry.path !== currentPath && !seen.has(entry.path))
    .slice(0, 3);
  matchingGroup.forEach(entry => {
    seen.add(entry.path);
    selected.push(entry);
  });

  return selected.slice(0, 6);
};

const sortMatchesBySchedule = matches =>
  [...matches].sort((left, right) => {
    const leftDate = left.date || "";
    const rightDate = right.date || "";
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

    const leftTime = left.time && left.time.trim().length > 0 ? left.time : "99:99";
    const rightTime = right.time && right.time.trim().length > 0 ? right.time : "99:99";
    return leftTime.localeCompare(rightTime);
  });

const formatTeams = match => {
  const home = match.home_team?.name?.trim() || "";
  const away = match.away_team?.name?.trim() || "";
  if (!home && !away) return "";
  return away ? `${home} vs ${away}` : home;
};

const formatLocation = match => {
  const parts = [
    match.venue?.name?.trim() || "",
    match.venue?.city?.trim() || "",
    match.country?.name?.trim() || "",
  ].filter(Boolean);
  return Array.from(new Set(parts)).join(", ");
};

const getMatchStatus = match => {
  const normalizedTime = match.time && match.time.trim() ? match.time.trim() : "00:00:00";
  const start = new Date(`${match.date}T${normalizedTime}`);
  if (Number.isNaN(start.getTime())) return "upcoming";

  const durationMinutes =
    MATCH_DURATION_BY_SPORT_ID[Number(match.sport_id)] ||
    120;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const now = new Date();

  if (end < now) return "finished";
  if (start <= now && end >= now) return "ongoing";
  return "upcoming";
};

const summarizeTeams = (matches, limit = 3) =>
  dedupeStrings(matches.map(formatTeams)).slice(0, limit);

const summarizeCompetitions = (matches, limit = 3) =>
  dedupeStrings(matches.map(match => stripStageLabel(match.competition?.name || ""))).slice(0, limit);

const summarizeChannels = (matches, limit = 4) =>
  dedupeStrings(
    matches.flatMap(match => (match.channels || []).map(channel => channel.name))
  ).slice(0, limit);

const describeTimeWindow = matches => {
  const values = matches
    .map(match => formatTime(match.time))
    .filter(value => value !== "TBD")
    .sort((a, b) => a.localeCompare(b, "en"));

  if (!values.length) return "throughout the day as listings are added";
  if (values.length === 1) return `around ${values[0]} UK time`;
  return `from ${values[0]} to ${values.at(-1)} UK time`;
};

const buildPageParagraphs = ({ page, previewMatches, relatedPages }) => {
  const competitions = summarizeCompetitions(previewMatches);
  const teams = summarizeTeams(previewMatches);
  const channels = summarizeChannels(previewMatches);
  const timeWindow = describeTimeWindow(previewMatches);
  const competitionText = competitions.length
    ? formatList(competitions)
    : "the latest available listings in this category";
  const teamText = teams.length
    ? formatList(teams)
    : "a rotating set of upcoming fixtures";
  const channelText = channels.length
    ? formatList(channels)
    : "the channels that appear in the current feed";
  const relatedText = relatedPages.length
    ? formatList(relatedPages.slice(0, 3).map(entry => entry.label))
    : "other major Where Is Match pages";

  switch (page.pageType) {
    case "competition":
      return [
        `This ${page.entityName} guide is a dedicated landing page for UK viewers who want fixtures, kick-off times, and broadcast information in one place. Instead of relying on JavaScript alone, the page is published with crawlable HTML content, featured listings, and internal links from the moment the build finishes.`,
        `Recent build data on this page highlights ${competitionText}. Example fixtures currently include ${teamText}, while broadcast listings mention ${channelText} when that information is available in the feed. That makes the page materially different from a generic filter state and gives the competition its own indexable context.`,
        `Use this page to check ${page.entityName.toLowerCase()} coverage ${timeWindow}, compare channels, and move to nearby hubs such as ${relatedText}. The interactive app still refreshes the latest schedule after load, but the core topic and example fixtures are already present in the initial HTML.`,
      ];
    case "broadcaster":
      return [
        `This ${page.entityName} page groups live sport currently listed on ${page.entityName} for UK viewers. It exists as a crawlable landing page rather than a blank JavaScript shell, so search engines can see broadcaster-specific content, internal links, and featured fixtures without waiting for the app to hydrate.`,
        `The current build shows competitions such as ${competitionText}, with example fixtures including ${teamText}. That gives the page visible broadcaster context and helps differentiate it from competition pages, sport hubs, and today pages elsewhere on the site.`,
        `Use this page to understand what is appearing on ${page.entityName}, check start times ${timeWindow}, and jump to related hubs like ${relatedText}. As new schedule data arrives the live interface enhances the page, but the static HTML already answers the basic query intent.`,
      ];
    case "country-football":
      return [
        `This ${page.entityName.toLowerCase()} football page narrows the site down to competitions and fixtures connected with that football market. It is intended to rank as a dedicated landing page for UK users looking for ${page.entityName.toLowerCase()} football on TV, rather than sending every searcher to the same generic football template.`,
        `Current build output for this page includes competitions such as ${competitionText}, along with example fixtures like ${teamText}. When broadcaster data is present, listings on this page currently reference ${channelText}, which gives the topic real on-page context before the live app takes over.`,
        `The page is also wired into the wider internal-link structure, with direct paths to ${relatedText}. That makes the content reachable in a couple of clicks from the homepage and helps search engines understand how this football niche relates to the rest of the guide.`,
      ];
    case "today-all":
      return [
        `This matches today page is the shortest route to live sport listings for UK viewers. The build pre-renders featured events directly into the HTML so the page is useful to crawlers and users even before JavaScript refreshes the live feed.`,
        `Today’s snapshot currently covers ${competitionText}, with example fixtures such as ${teamText}. Where broadcast data exists, the page surfaces channels like ${channelText}, so the landing page has real schedule information instead of an empty placeholder.`,
        `Use this page to scan what is on ${timeWindow}, then move to more specific hubs such as ${relatedText}. That combination of static copy, visible links, and featured listings gives Google a stronger reason to crawl and keep revisiting the page.`,
      ];
    case "today-football":
      return [
        `This football on TV today page is built for UK users who want live football listings without drilling through filters first. The page ships with static HTML content, related links, and featured fixtures so the core answer is visible before the app enhances it.`,
        `Today’s build currently highlights ${competitionText}, with example fixtures including ${teamText}. Broadcast listings shown in the HTML mention ${channelText} when available, giving the page concrete schedule content rather than a thin shell.`,
        `Use it to check football coverage ${timeWindow}, compare broadcasters, and move quickly to pages like ${relatedText}. That keeps the page useful for both users and crawlers while the interactive filters continue to provide the full schedule after load.`,
      ];
    case "sport":
    default:
      return [
        `This ${page.entityName} on TV page is designed as a crawlable landing page for UK viewers who want fixtures, start times, and channel information in one place. The build outputs real HTML content and featured events up front, so the page is not dependent on JavaScript to explain its topic.`,
        `Current listings on this page include ${competitionText}, with example fixtures such as ${teamText}. When channel data is present in the feed, the page also highlights ${channelText}, giving the landing page more context than a repeated template with an empty results container.`,
        `Use this hub to scan ${page.entityName.toLowerCase()} coverage ${timeWindow}, compare broadcasters, and move to related pages like ${relatedText}. The live interface still updates the schedule after load, but the important topic signals are already embedded in the initial response.`,
      ];
  }
};

const buildPageChecklist = ({ page, previewMatches, relatedPages }) => {
  const dateLabel =
    page.previewWindowDays > 1
      ? `Featured listings from the next ${page.previewWindowDays} days in the HTML response.`
      : "Featured listings for today in the HTML response.";

  const items = [
    dateLabel,
    "Kick-off or start times shown in a static, crawlable page section.",
    "Broadcaster and channel labels included when the feed provides them.",
    relatedPages.length
      ? `Visible internal links to ${formatList(relatedPages.slice(0, 3).map(entry => entry.label))}.`
      : "Visible internal links to nearby category pages.",
  ];

  if (previewMatches.length) {
    items.push(
      `Example fixtures currently include ${formatList(summarizeTeams(previewMatches, 2))}.`
    );
  }

  return items.slice(0, 4);
};

const buildStaticContentHtml = ({ page, previewMatches, relatedPages }) => {
  const paragraphs = buildPageParagraphs({ page, previewMatches, relatedPages });
  const checklist = buildPageChecklist({ page, previewMatches, relatedPages });
  const sectionTitle = `${page.heading} guide`;

  return `<section class="seo-content" aria-label="About this page">
        <article class="page-card seo-copy-card">
          <h2>${escapeHtml(sectionTitle)}</h2>
          ${paragraphs.map(text => `<p>${escapeHtml(text)}</p>`).join("\n          ")}
        </article>
        <section class="page-card seo-copy-card" aria-label="Key details">
          <h2>Key details</h2>
            <ul class="seo-list">
              ${checklist.map(item => `<li>${escapeHtml(item)}</li>`).join("\n              ")}
            </ul>
        </section>
      </section>`;
};

const buildStructuredDataHtml = page => {
  const canonicalUrl = `${SITE_URL}${page.canonicalPath}`;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: page.heading,
        description: page.description,
        url: canonicalUrl,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Where Is Match",
            item: `${SITE_URL}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: page.heading,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };

  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
};

const renderStaticMatchesHtml = (matches, { groupByDate = false } = {}) => {
  const sorted = sortMatchesBySchedule(matches);
  if (!sorted.length) {
    return `<div class="empty-state">
      <h2>No featured listings available</h2>
      <p>The live app will load the latest schedule when data is available.</p>
    </div>`;
  }

  const renderCard = match => {
    const statusClass = getMatchStatus(match);
    const titleText =
      formatTeams(match) ||
      stripStageLabel(match.competition?.name || "") ||
      formatLocation(match) ||
      "Fixture";
    const metaText =
      stripStageLabel(match.competition?.name || "") ||
      formatLocation(match) ||
      "";
    const channelsHtml = (match.channels || [])
      .slice(0, 4)
      .map(channel => {
        const styles = [];
        if (channel.primary_color) styles.push(`background:${channel.primary_color}`);
        if (channel.text_color) styles.push(`color:${channel.text_color}`);
        const styleAttr = styles.length ? ` style="${escapeHtml(styles.join(";"))}"` : "";
        return `<span class="channel-pill"${styleAttr}>${escapeHtml(channel.name)}</span>`;
      })
      .join("");

    return `<article class="match-card is-${statusClass}">
        <div class="match-sport" aria-hidden="true"></div>
        <div class="match-time">${escapeHtml(formatTime(match.time))}</div>
        <div class="match-title">${escapeHtml(titleText)}</div>
        <div class="match-meta">${escapeHtml(metaText)}</div>
        <div class="channels">${channelsHtml}</div>
      </article>`;
  };

  if (!groupByDate) {
    return sorted.map(renderCard).join("\n");
  }

  const groups = new Map();
  sorted.forEach(match => {
    const key = match.date || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  });

  return Array.from(groups.entries())
    .map(
      ([date, groupMatches]) => `<section class="match-day-group">
        <h3 class="match-day-heading">${escapeHtml(formatGroupedDate(date))}</h3>
        ${groupMatches.map(renderCard).join("\n        ")}
      </section>`
    )
    .join("\n");
};

const buildMatchParamsForPage = page => {
  const today = getUkTodayIso();
  const endDate = shiftIsoDate(today, page.previewWindowDays - 1);
  const params = {
    start_date: today,
    end_date: endDate,
  };

  const landingConfig = page.landingConfig || {};
  if (landingConfig.sportIds?.length) params.sport_ids = landingConfig.sportIds;
  if (landingConfig.countryIds?.length) params.country_ids = landingConfig.countryIds;
  if (landingConfig.competitionIds?.length) params.competition_ids = landingConfig.competitionIds;
  if (landingConfig.broadcasterIds?.length) params.broadcaster_ids = landingConfig.broadcasterIds;
  return params;
};

const pageShell = ({
  page,
  primaryNavHtml,
  staticContentHtml,
  matchPreviewHtml,
  footerLinksHtml,
}) => {
  const canonicalUrl = `${SITE_URL}${page.canonicalPath}`;

  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta name="theme-color" content="#38a3a5" />

    <meta property="og:site_name" content="Where Is Match" />
    <meta property="og:locale" content="en_GB" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${SITE_URL}/og.svg" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${SITE_URL}/og.svg" />

    <link rel="icon" href="/favicon.png" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.svg" />
    <link rel="manifest" href="/site.webmanifest" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="/styles.css" />
    ${buildStructuredDataHtml(page)}
  </head>
  <body>
    <div class="app">
      <header class="site-header">
        <div class="site-header-row">
          <div class="site-header-main">
            <p class="site-kicker"><a href="/">Where Is Match</a></p>
            <h1>${escapeHtml(page.heading)}</h1>
            <p>${escapeHtml(page.intro)}</p>
          </div>
          <div class="site-header-actions">
            <button
              id="theme-toggle"
              type="button"
              class="theme-toggle icon-only"
              aria-label="Toggle theme"
              title="Toggle theme">
              <span class="sr-only">Toggle theme</span>
            </button>
          </div>
        </div>
      </header>

      <section class="controls" aria-label="Filters">
        <div class="control full-row control-sports">
          <label>Sports</label>
          <div id="sport-pills" class="pill-group" role="group" aria-label="Sports"></div>
        </div>
        <div class="control control-country">
          <label for="country-search">Countries</label>
          <div id="country-filter" class="multi-select">
            <div class="multi-select-box">
              <div id="country-pills" class="token-pills"></div>
              <input id="country-search" type="search" placeholder="Search countries" />
            </div>
            <div id="country-options" class="options" role="listbox" aria-label="Countries"></div>
          </div>
        </div>
        <details class="advanced" id="advanced-filters">
          <summary>
            <span>More filters</span>
            <span id="advanced-count" class="filter-count" hidden>0</span>
          </summary>
          <div class="advanced-panel">
            <div class="control">
              <label for="broadcaster-search">Broadcasters</label>
              <div id="broadcaster-filter" class="multi-select">
                <div class="multi-select-box">
                  <div id="broadcaster-pills" class="token-pills"></div>
                  <input id="broadcaster-search" type="search" placeholder="Search broadcasters" />
                </div>
                <div id="broadcaster-options" class="options" role="listbox" aria-label="Broadcasters"></div>
              </div>
            </div>
            <div class="control">
              <label for="competition-search">Competitions</label>
              <div id="competition-filter" class="multi-select">
                <div class="multi-select-box">
                  <div id="competition-pills" class="token-pills"></div>
                  <input id="competition-search" type="search" placeholder="Search competitions" />
                </div>
                <div id="competition-options" class="options" role="listbox" aria-label="Competitions"></div>
              </div>
            </div>
          </div>
        </details>
      </section>

      <section class="status" aria-live="polite">
        <p id="status"></p>
      </section>

      <section class="date-banner" aria-label="Selected date">
        <div class="date-banner-main">
          <button id="prev-day" type="button" class="date-nav" aria-label="Previous day">
            &#x2039;
          </button>
          <p id="date-banner" class="date-label"></p>
          <button id="next-day" type="button" class="date-nav" aria-label="Next day">
            &#x203A;
          </button>
        </div>
        <div class="date-banner-actions">
          <div id="date-view-toggle" class="view-toggle" role="group" aria-label="Time range" hidden>
            <button id="view-day" type="button" class="view-toggle-button is-active" aria-pressed="true">
              Day
            </button>
            <button id="view-week" type="button" class="view-toggle-button" aria-pressed="false">
              Week
            </button>
          </div>
          <button id="today-day" type="button" class="ghost date-nav-today is-reserved-hidden" aria-label="Go to today">
            Today
          </button>
          <button id="toggle-past-matches" type="button" class="ghost subtle-toggle" aria-pressed="false">
            Show past events
          </button>
        </div>
      </section>

      <section id="matches" class="matches" aria-label="Match list">
        ${matchPreviewHtml}
      </section>

      ${primaryNavHtml}
      ${staticContentHtml}

      <footer class="site-footer" aria-label="Site links">
        <div class="footer-more-links" aria-label="Browse pages">
          ${footerLinksHtml}
        </div>
        <p class="footer-meta">Data is provided by third parties and may be delayed or incomplete.</p>
        <nav class="footer-links" aria-label="Site pages">
          <a href="/">Home</a>
          <a href="/about/">About</a>
          <a href="/faq/">FAQ</a>
          <a href="/privacy/">Privacy</a>
        </nav>
      </footer>
    </div>

    <script>
      window.FOOTY_CONFIG = {
        apiUrl: "${API_URL_PLACEHOLDER}",
        siteUrl: "${SITE_URL}",
      };
    </script>
    <script>
      if (
        "${ENVIROMENT_PLACEHOLDER}" === "production" &&
        "${POSTHOG_KEY_PLACEHOLDER}" &&
        "${POSTHOG_HOST_PLACEHOLDER}"
      ) {
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
        posthog.init('${POSTHOG_KEY_PLACEHOLDER}',{api_host:'${POSTHOG_HOST_PLACEHOLDER}', defaults:'2026-01-30'})
      }
    </script>
    <script>
      window.FOOTY_LANDING = ${JSON.stringify(page.landingConfig || {})};
    </script>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;
};

const main = async () => {
  if (await exists(MANIFEST_PATH)) {
    throw new Error(
      `Existing SEO manifest found at ${MANIFEST_PATH}. Run the SEO cleanup script before generating again.`
    );
  }

  const [sports, countries, competitions, broadcasters] = await Promise.all([
    fetchJson("/sports"),
    fetchJson("/countries"),
    fetchJson("/competitions"),
    fetchJson("/broadcasters"),
  ]);

  if (!Array.isArray(sports)) throw new Error("Unexpected /sports response (expected array).");
  if (!Array.isArray(countries)) throw new Error("Unexpected /countries response (expected array).");
  if (!Array.isArray(competitions)) throw new Error("Unexpected /competitions response (expected array).");
  if (!Array.isArray(broadcasters)) throw new Error("Unexpected /broadcasters response (expected array).");

  const countriesByName = new Map(
    countries
      .filter(country => Number.isFinite(country?.id) && country?.name)
      .map(country => [String(country.name).trim().toLowerCase(), country])
  );
  const competitionById = new Map(
    competitions
      .filter(item => Number.isFinite(item?.id))
      .map(item => [Number(item.id), item])
  );
  const broadcasterById = new Map(
    broadcasters
      .filter(item => Number.isFinite(item?.id))
      .map(item => [Number(item.id), item])
  );

  const sitemapUrls = new Set([
    `${SITE_URL}/`,
    `${SITE_URL}/about/`,
    `${SITE_URL}/faq/`,
    `${SITE_URL}/privacy/`,
  ]);

  const pageDefs = [];
  const seoPages = [];

  const registerPage = def => {
    const page = decoratePageDef(def);
    pageDefs.push(page);
    seoPages.push({
      url: `${SITE_URL}${page.canonicalPath}`,
      path: page.canonicalPath,
      label: page.label,
      group: page.group,
      pageType: page.pageType,
    });
    sitemapUrls.add(`${SITE_URL}${page.canonicalPath}`);
  };

  sports.forEach(sport => {
    if (!Number.isFinite(sport?.id) || !sport?.name) return;
    const slug = slugify(sport.name);
    if (!slug) return;
    registerPage({
      outDir: path.join(OUT_DIR, "watch", slug),
      canonicalPath: `/watch/${slug}/`,
      pageType: "sport",
      entityName: sport.name,
      label: `${sport.name} on TV`,
      group: "Sports",
      landingConfig: {
        sportIds: [sport.id],
      },
    });
  });

  const footballSport =
    sports.find(sport => slugify(sport?.name) === "football") ||
    sports.find(sport => slugify(sport?.name) === "soccer") ||
    null;

  if (footballSport && Number.isFinite(footballSport.id)) {
    [
      { slug: "english-football-on-tv", country: "England", label: "English" },
      { slug: "spanish-football-on-tv", country: "Spain", label: "Spanish" },
      { slug: "german-football-on-tv", country: "Germany", label: "German" },
      { slug: "italian-football-on-tv", country: "Italy", label: "Italian" },
    ].forEach(variant => {
      const country = countriesByName.get(variant.country.toLowerCase());
      if (!country || !Number.isFinite(country.id)) return;
      registerPage({
        outDir: path.join(OUT_DIR, variant.slug),
        canonicalPath: `/${variant.slug}/`,
        pageType: "country-football",
        entityName: variant.label,
        label: `${variant.label} football on TV`,
        group: "Football",
        landingConfig: {
          sportIds: [footballSport.id],
          countryIds: [country.id],
          lockFilters: true,
        },
      });
    });
  }

  registerPage({
    outDir: path.join(OUT_DIR, "matches-today"),
    canonicalPath: "/matches-today/",
    pageType: "today-all",
    entityName: "Matches today",
    label: "Matches today",
    group: "Featured",
    landingConfig: {
      dateWindowDays: 1,
    },
  });

  if (footballSport && Number.isFinite(footballSport.id)) {
    registerPage({
      outDir: path.join(OUT_DIR, "football-on-tv-today"),
      canonicalPath: "/football-on-tv-today/",
      pageType: "today-football",
      entityName: "Football",
      label: "Football on TV today",
      group: "Featured",
      landingConfig: {
        sportIds: [footballSport.id],
        lockFilters: true,
        dateWindowDays: 1,
      },
    });
  }

  for (const [rawSlug, config] of Object.entries(seo)) {
    const slug = String(rawSlug || "").trim().replace(/^\/+|\/+$/g, "");
    if (!slug) continue;

    const landingConfig = {
      sportIds: Number.isFinite(config?.sport_id) ? [Number(config.sport_id)] : [],
      countryIds: Number.isFinite(config?.country_id) ? [Number(config.country_id)] : [],
      competitionIds: Number.isFinite(config?.competition_id) ? [Number(config.competition_id)] : [],
      broadcasterIds: Number.isFinite(config?.broadcaster_id) ? [Number(config.broadcaster_id)] : [],
      lockFilters: Boolean(config?.lock_filters ?? true),
    };

    const pageType = Number.isFinite(config?.competition_id)
      ? "competition"
      : Number.isFinite(config?.broadcaster_id)
        ? "broadcaster"
        : "sport";

    const resolvedEntityName = Number.isFinite(config?.competition_id)
      ? stripStageLabel(competitionById.get(Number(config.competition_id))?.name || "")
      : Number.isFinite(config?.broadcaster_id)
        ? broadcasterById.get(Number(config.broadcaster_id))?.name || ""
        : titleCaseFromSlug(slug.replace(/-on-tv$/, ""));

    const entityName = resolvedEntityName || titleCaseFromSlug(slug.replace(/-on-tv$/, ""));
    const label = config?.label || `${entityName} on TV`;

    registerPage({
      outDir: path.join(OUT_DIR, slug),
      canonicalPath: `/${slug}/`,
      pageType,
      entityName,
      label,
      group:
        pageType === "competition"
          ? "Competitions"
          : pageType === "broadcaster"
            ? "Broadcasters"
            : "Featured",
      landingConfig,
    });
  }

  const footerLinksHtml = buildFooterLinksHtml(seoPages);
  const primaryNavHtml = buildPrimaryNavHtml(pickPagesByPath(seoPages, PRIMARY_NAV_PATHS));
  const homeHubHtml = buildHomeHubHtml({
    featuredPages: pickPagesByPath(seoPages, ["/football-on-tv-today/", "/matches-today/"]),
    competitionPages: pickPagesByPath(seoPages, [
      "/premier-league-on-tv/",
      "/champions-league-on-tv/",
      "/la-liga-on-tv/",
      "/bundesliga-on-tv/",
    ]),
    sportPages: pickPagesByPath(seoPages, [
      "/watch/football/",
      "/watch/american-football/",
      "/watch/formula-1/",
      "/watch/snooker/",
      "/watch/darts/",
    ]),
    footballPages: pickPagesByPath(seoPages, [
      "/english-football-on-tv/",
      "/spanish-football-on-tv/",
      "/german-football-on-tv/",
      "/italian-football-on-tv/",
    ]),
  });

  const homePreviewMatches = await fetchMatchesOrEmpty({
    start_date: getUkTodayIso(),
    end_date: getUkTodayIso(),
  }, "homepage");
  const homeMatchPreviewHtml = renderStaticMatchesHtml(homePreviewMatches.slice(0, 8));

  await Promise.all(
    pageDefs.map(async page => {
      await ensureDir(page.outDir);
      const previewMatches = await fetchMatchesOrEmpty(
        buildMatchParamsForPage(page),
        page.canonicalPath
      );
      const limitedPreviewMatches = sortMatchesBySchedule(previewMatches).slice(0, 8);
      const relatedPages = pickRelatedPages(page, seoPages);
      const html = pageShell({
        page,
        primaryNavHtml,
        staticContentHtml: buildStaticContentHtml({
          page,
          previewMatches: limitedPreviewMatches,
          relatedPages,
        }),
        matchPreviewHtml: renderStaticMatchesHtml(limitedPreviewMatches, {
          groupByDate: page.previewWindowDays > 1,
        }),
        footerLinksHtml,
      });
      await writeUtf8(path.join(page.outDir, "index.html"), html);
    })
  );

  const staticPages = [
    {
      filePath: path.join(OUT_DIR, "index.html"),
      replacements: {
        "<!-- SEO_PRIMARY_NAV -->": primaryNavHtml,
        "<!-- HOME_SEO_HUB -->": homeHubHtml,
        "<!-- HOME_MATCH_PREVIEW -->": homeMatchPreviewHtml,
      },
    },
    {
      filePath: path.join(OUT_DIR, "about", "index.html"),
      replacements: {
        "<!-- SEO_PRIMARY_NAV -->": primaryNavHtml,
      },
    },
    {
      filePath: path.join(OUT_DIR, "faq", "index.html"),
      replacements: {
        "<!-- SEO_PRIMARY_NAV -->": primaryNavHtml,
      },
    },
    {
      filePath: path.join(OUT_DIR, "privacy", "index.html"),
      replacements: {
        "<!-- SEO_PRIMARY_NAV -->": primaryNavHtml,
      },
    },
  ];

  await Promise.all(
    staticPages.map(entry =>
      injectStaticPageSections({
        filePath: entry.filePath,
        replacements: entry.replacements,
        footerLinksHtml,
      })
    )
  );

  await writeUtf8(path.join(OUT_DIR, "sitemap.xml"), buildSitemap(Array.from(sitemapUrls)));
  await writeUtf8(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
};

await main();
