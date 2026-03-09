import { cpSync, existsSync } from "node:fs";
import path, { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

const buildInputs = {
  main: resolve("index.html"),
  about: resolve("about/index.html"),
  faq: resolve("faq/index.html"),
  privacy: resolve("privacy/index.html"),
};

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
