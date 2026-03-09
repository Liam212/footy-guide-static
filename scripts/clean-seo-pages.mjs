import { access, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = process.env.OUT_DIR || process.cwd();
const MANIFEST_PATH = path.join(OUT_DIR, ".seo-manifest.json");
const normalizedOutDir = path.resolve(OUT_DIR);

const exists = async filePath => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const removeEmptyParentDirs = async filePath => {
  let currentDir = path.dirname(path.resolve(filePath));

  while (currentDir.startsWith(normalizedOutDir) && currentDir !== normalizedOutDir) {
    try {
      await rmdir(currentDir);
    } catch (error) {
      if (error?.code === "ENOENT") {
        currentDir = path.dirname(currentDir);
        continue;
      }
      if (error?.code === "ENOTEMPTY" || error?.code === "EEXIST") {
        break;
      }
      throw error;
    }

    currentDir = path.dirname(currentDir);
  }
};

const main = async () => {
  if (!(await exists(MANIFEST_PATH))) {
    console.log("No SEO manifest found. Nothing to clean.");
    return;
  }

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const backups = Array.isArray(manifest.backups) ? manifest.backups : [];
  const generatedFiles = Array.isArray(manifest.generatedFiles) ? manifest.generatedFiles : [];

  for (const originalPath of generatedFiles) {
    await rm(originalPath, { force: true, recursive: true });
    await removeEmptyParentDirs(originalPath);
  }

  for (const backup of backups.reverse()) {
    if (!backup?.originalPath || !backup?.backupPath) continue;
    const contents = await readFile(backup.backupPath, "utf8");
    await writeFile(backup.originalPath, contents, "utf8");
  }

  if (manifest.backupDir) {
    await rm(manifest.backupDir, { force: true, recursive: true });
  }
  await rm(MANIFEST_PATH, { force: true });
  console.log("SEO cleanup completed.");
};

await main();
