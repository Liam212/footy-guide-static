import { cpSync, existsSync, readdirSync } from "node:fs";
import path, { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

const IGNORED_BUILD_DIRS = new Set([".git", ".seo-backups", "dist", "node_modules"]);

const collectHtmlInputs = (currentDir = process.cwd(), inputs = {}) => {
  const entries = readdirSync(currentDir, { withFileTypes: true });

  entries.forEach(entry => {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") return;

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(process.cwd(), absolutePath);

    if (entry.isDirectory()) {
      if (IGNORED_BUILD_DIRS.has(entry.name)) return;
      collectHtmlInputs(absolutePath, inputs);
      return;
    }

    if (!entry.isFile() || entry.name !== "index.html") return;

    const key =
      relativePath === "index.html"
        ? "main"
        : relativePath
            .replace(/\/index\.html$/, "")
            .replace(/[\\/]/g, "-");

    inputs[key] = resolve(relativePath);
  });

  return inputs;
};

const buildInputs = collectHtmlInputs();

const copiedStaticFiles = [
  "american.png",
  "apple-touch-icon.svg",
  "darts.png",
  "f1.png",
  "favicon.png",
  "football.png",
  "og.svg",
  "robots.txt",
  "site.webmanifest",
  "sitemap.xml",
  "snooker.png",
];

const copyStaticFilesPlugin = () => ({
  name: "copy-static-files",
  writeBundle() {
    for (const file of copiedStaticFiles) {
      const source = resolve(file);
      if (!existsSync(source)) continue;
      cpSync(source, resolve("dist", path.basename(file)));
    }
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = (env.VITE_API_PROXY_TARGET || "").trim().replace(/\/$/, "");

  return {
    build: {
      rollupOptions: {
        input: buildInputs,
      },
    },
    plugins: [copyStaticFilesPlugin()],
    server: {
      port: 5173,
      proxy: proxyTarget
        ? {
            "/proxy": {
              target: proxyTarget,
              changeOrigin: true,
              rewrite: path => path.replace(/^\/proxy/, ""),
            },
          }
        : undefined,
    },
  };
});
