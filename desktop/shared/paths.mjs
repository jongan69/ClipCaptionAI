import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DESKTOP_DIR = path.resolve(__dirname, "..");

/**
 * Resolve all runtime paths, handling both dev and packaged modes.
 *
 * In dev: paths resolve to the project root (same as CLI)
 * In packaged: writable paths go to userData, static assets from resourcesPath
 */
export function resolveRuntimePaths() {
  const isPackaged = app.isPackaged;
  const userDataRoot = path.join(app.getPath("userData"), "clipcaptionai-desktop");

  // Project root — where scripts/ and src/ live
  const projectRoot = isPackaged
    ? path.join(process.resourcesPath, "app.asar")
    : path.resolve(DESKTOP_DIR, "..");

  // Writable data root
  const dataRoot = isPackaged ? userDataRoot : projectRoot;

  // Resource root (static assets bundled via extraResources)
  const resourceRoot = isPackaged
    ? process.resourcesPath
    : projectRoot;

  return {
    isPackaged,
    projectRoot,
    dataRoot,
    userDataRoot,
    resourceRoot,

    // Writable output paths
    outputsRoot: path.join(dataRoot, "outputs"),
    workRoot: path.join(dataRoot, "outputs", "work"),
    publicMediaRoot: path.join(dataRoot, "public", "media"),

    // Libraries (read from resources, copied to data on first run)
    sceneLibraryRoot: path.join(dataRoot, "scene-library"),
    sfxLibraryRoot: path.join(dataRoot, "sfx-library"),
    musicLibraryRoot: path.join(dataRoot, "music-library"),

    // Config
    configRoot: path.join(dataRoot, "config"),
    envPath: path.join(dataRoot, ".env"),

    // Logs & preferences
    logPath: isPackaged
      ? path.join(userDataRoot, "desktop-session.log")
      : path.join(dataRoot, "outputs", "desktop-session.log"),
    preferencesPath: path.join(userDataRoot, "preferences.json"),
    secretsPath: path.join(userDataRoot, "secrets.json"),

    // Desktop-specific
    desktopSrcRoot: path.join(__dirname, "..", "src"),
    distRendererRoot: path.join(__dirname, "..", "dist-renderer"),

    // Resource assets (for first-run bootstrap)
    resourceAssets: {
      models: path.join(resourceRoot, "models"),
      sceneLibrary: path.join(resourceRoot, "scene-library"),
      sfxLibrary: path.join(resourceRoot, "sfx-library"),
      musicLibrary: path.join(resourceRoot, "music-library"),
      captionStyle: path.join(resourceRoot, "caption-style.json"),
      styles: path.join(resourceRoot, "styles"),
    },

    // Env vars to inject into worker processes
    envVars: {
      CCA_ELECTRON: "1",
      CCA_PROJECT_ROOT: projectRoot,
      CCA_OUTPUTS_ROOT: path.join(dataRoot, "outputs"),
      CCA_PUBLIC_MEDIA_ROOT: path.join(dataRoot, "public", "media"),
      CCA_ENV_PREINJECTED: "1",
    },
  };
}

/**
 * Ensure all writable directories exist.
 */
export function ensureRuntimeDirs(paths) {
  const dirs = [
    paths.outputsRoot,
    paths.workRoot,
    paths.publicMediaRoot,
    paths.sceneLibraryRoot,
    paths.sfxLibraryRoot,
    paths.musicLibraryRoot,
    paths.configRoot,
    paths.userDataRoot,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Bootstrap: copy static assets from resources to writable data dir on first run.
 */
export function bootstrapAssets(paths) {
  if (!paths.isPackaged) return;

  const copies = [
    { src: paths.resourceAssets.captionStyle, dest: path.join(paths.configRoot, "caption-style.json") },
    { src: paths.resourceAssets.styles, dest: path.join(paths.configRoot, "styles") },
  ];

  for (const { src, dest } of copies) {
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) continue;
    try {
      fs.cpSync(src, dest, { recursive: true });
    } catch {
      // Non-fatal: libraries may not be bundled
    }
  }
}
