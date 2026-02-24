import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_URL = "https://whereismatch.com";
const API_URL_PLACEHOLDER = "${API_URL}";
const ENVIROMENT_PLACEHOLDER = "${ENVIROMENT}";
const POSTHOG_KEY_PLACEHOLDER = "${POSTHOG_KEY}";
const POSTHOG_HOST_PLACEHOLDER = "${POSTHOG_HOST}";
const OUT_DIR = process.env.OUT_DIR || process.cwd();
const RAW_API_URL = process.env.API_URL || "";

const apiUrl = RAW_API_URL.trim().replace(/\/$/, "");
if (!apiUrl) {
  throw new Error("Missing API_URL. Provide API_URL as an env var during generation.");
}

const slugify = value =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

const fetchJson = async apiPath => {
  const url = `${apiUrl}${apiPath}`;
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

const pageShell = ({
  title,
  description,
  canonicalPath,
  heading,
  intro,
  landingConfig,
  footerLinksHtml,
}) => {
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta name="theme-color" content="#38a3a5" />

    <meta property="og:site_name" content="Where Is Match" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${SITE_URL}/og.svg" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${SITE_URL}/og.svg" />

    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.svg" />
    <link rel="manifest" href="/site.webmanifest" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div class="app">
      <header class="site-header">
        <div class="site-header-row">
          <div class="site-header-main">
            <p class="site-kicker"><a href="/">Where Is Match</a></p>
            <h1>${escapeHtml(heading)}</h1>
            <p>${escapeHtml(intro)}</p>
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
        <div class="control full-row">
          <label>Sports</label>
          <div id="sport-pills" class="pill-group" role="group" aria-label="Sports"></div>
        </div>
        <div class="control">
          <label for="country-search">Countries</label>
          <div id="country-filter" class="multi-select">
            <div class="multi-select-box">
              <div id="country-pills" class="token-pills"></div>
              <input id="country-search" type="search" placeholder="Search countries" />
            </div>
            <div id="country-options" class="options" role="listbox" aria-label="Countries"></div>
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
        <details class="advanced">
          <summary>Advanced filters</summary>
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
          <p id="date-banner"></p>
          <button id="next-day" type="button" class="date-nav" aria-label="Next day">
            &#x203A;
          </button>
        </div>
        <button id="today-day" type="button" class="date-nav date-nav-today" aria-label="Go to today" hidden>
          Today
        </button>
      </section>

      <section class="match-tools" aria-label="Match display options">
        <button id="toggle-past-matches" type="button" class="ghost subtle-toggle" aria-pressed="false">
          Show past matches
        </button>
      </section>

      <section id="matches" class="matches" aria-label="Match list"></section>

      <footer class="site-footer" aria-label="Site links">
        <nav class="footer-links">
          <a href="/">Home</a>
          <a href="/about/">About</a>
          <a href="/faq/">FAQ</a>
          <a href="/privacy/">Privacy</a>
        </nav>
        <details class="footer-more">
          <summary>Browse pages</summary>
          <div class="footer-more-links">
            ${footerLinksHtml || ""}
          </div>
        </details>
        <p class="footer-meta">Data is provided by third parties and may be delayed or incomplete.</p>
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
      window.FOOTY_LANDING = ${JSON.stringify(landingConfig || {})};
    </script>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;
};

const escapeHtml = value =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const ensureDir = async dir => {
  await mkdir(dir, { recursive: true });
};

const writeUtf8 = async (filePath, contents) => {
  await writeFile(filePath, contents, "utf8");
};

const injectSeoPages = async ({ filePath, linksHtml }) => {
  const placeholder = "<!-- SEO_PAGES -->";
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  if (!contents.includes(placeholder)) {
    return;
  }

  const next = contents.replace(placeholder, linksHtml);
  await writeUtf8(filePath, next);
};

const buildSitemap = urls => {
  const body = urls
    .map(loc => `  <url>\n    <loc>${loc}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
};

const main = async () => {
  const sports = await fetchJson("/sports");
  if (!Array.isArray(sports)) {
    throw new Error("Unexpected /sports response (expected array).");
  }

  const countries = await fetchJson("/countries");
  if (!Array.isArray(countries)) {
    throw new Error("Unexpected /countries response (expected array).");
  }

  const sitemapUrls = new Set([
    `${SITE_URL}/`,
    `${SITE_URL}/about/`,
    `${SITE_URL}/faq/`,
    `${SITE_URL}/privacy/`,
  ]);

  const seoPages = [];
  const sportPageDefs = [];
  const specialPageDefs = [];

  for (const sport of sports) {
    if (!sport || !Number.isFinite(sport.id) || !sport.name) continue;
    const slug = slugify(sport.name);
    if (!slug) continue;

    const canonicalPath = `/watch/${slug}/`;
    const outDir = path.join(OUT_DIR, "watch", slug);
    const title = `${sport.name} On TV - Where Is Match`;
    const description = `Find where to watch ${sport.name} live. Browse matches and broadcasters with fast filters.`;
    const heading = `${sport.name} On TV`;
    const intro = `Browse ${sport.name} fixtures and find the broadcaster showing each match.`;

    sportPageDefs.push({
      outDir,
      canonicalPath,
      title,
      description,
      heading,
      intro,
      landingConfig: {
        sportIds: [sport.id],
      },
    });

    seoPages.push({
      url: `${SITE_URL}${canonicalPath}`,
      path: canonicalPath,
      label: `${sport.name} on TV`,
    });
  }

  const pickFootballSport = () => {
    const candidates = sports
      .filter(sport => sport && Number.isFinite(sport.id) && sport.name)
      .map(sport => ({ sport, slug: slugify(sport.name) }))
      .filter(entry => entry.slug);

    const exact = candidates.find(entry => entry.slug === "football");
    if (exact) return exact.sport;

    const soccer = candidates.find(entry => entry.slug === "soccer");
    if (soccer) return soccer.sport;

    const contains = candidates.find(entry => /football/i.test(entry.sport.name));
    return contains ? contains.sport : null;
  };

  const findCountryByName = name => {
    const target = String(name || "").trim().toLowerCase();
    return (
      countries.find(country =>
        String(country?.name || "").trim().toLowerCase() === target
      ) || null
    );
  };

  const footballSport = pickFootballSport();
  if (!footballSport) {
    console.warn("SEO generator: could not identify football sport; skipping country football pages.");
  } else {
    const variants = [
      { slug: "english-football-on-tv", country: "England", label: "English" },
      { slug: "spanish-football-on-tv", country: "Spain", label: "Spanish" },
      { slug: "german-football-on-tv", country: "Germany", label: "German" },
      { slug: "italian-football-on-tv", country: "Italy", label: "Italian" },
    ];

    for (const variant of variants) {
      const country = findCountryByName(variant.country);
      if (!country || !Number.isFinite(country.id)) {
        console.warn(
          `SEO generator: missing country '${variant.country}'; skipping ${variant.slug}.`
        );
        continue;
      }

      const canonicalPath = `/${variant.slug}/`;
      const outDir = path.join(OUT_DIR, variant.slug);

      const title = `${variant.label} Football On TV - Where Is Match`;
      const description = `Find where to watch ${variant.label.toLowerCase()} football. Filter fixtures and broadcasters for ${variant.country}.`;
      const heading = `${variant.label} football on TV`;
      const intro = `Browse football fixtures for ${variant.country} and find which broadcaster is showing each match.`;

      specialPageDefs.push({
        outDir,
        canonicalPath,
        title,
        description,
        heading,
        intro,
        landingConfig: {
          sportIds: [footballSport.id],
          countryIds: [country.id],
        },
      });

      seoPages.push({
        url: `${SITE_URL}${canonicalPath}`,
        path: canonicalPath,
        label: `${variant.label} football on TV`,
      });
    }
  }

  seoPages.sort((a, b) => a.label.localeCompare(b.label, "en"));
  const footerLinksHtml = seoPages
    .map(page => `<a href="${page.path}">${escapeHtml(page.label)}</a>`)
    .join("\n            ");

  const staticPagesToInject = [
    path.join(OUT_DIR, "index.html"),
    path.join(OUT_DIR, "about", "index.html"),
    path.join(OUT_DIR, "faq", "index.html"),
    path.join(OUT_DIR, "privacy", "index.html"),
  ];

  const allPageDefs = [...sportPageDefs, ...specialPageDefs];
  await Promise.all(
    allPageDefs.map(async def => {
      await ensureDir(def.outDir);
      const html = pageShell({
        title: def.title,
        description: def.description,
        canonicalPath: def.canonicalPath,
        heading: def.heading,
        intro: def.intro,
        landingConfig: def.landingConfig,
        footerLinksHtml,
      });
      await writeUtf8(path.join(def.outDir, "index.html"), html);
      sitemapUrls.add(`${SITE_URL}${def.canonicalPath}`);
    })
  );

  await Promise.all(
    staticPagesToInject.map(filePath => injectSeoPages({ filePath, linksHtml: footerLinksHtml }))
  );

  const sitemap = buildSitemap(Array.from(sitemapUrls));
  await writeUtf8(path.join(OUT_DIR, "sitemap.xml"), sitemap);
};

await main();
