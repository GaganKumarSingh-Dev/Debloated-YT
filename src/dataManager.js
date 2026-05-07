const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function userProfile() {
  return process.env.USERPROFILE || (
    process.env.HOMEDRIVE && process.env.HOMEPATH
      ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
      : 'C:\\Users\\current_user_name'
  );
}

function pathEntries() {
  return String(process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function existingFile(filePath) {
  try {
    return filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findOnPath(executableName) {
  for (const entry of pathEntries()) {
    const candidate = path.join(entry, executableName);
    if (existingFile(candidate)) {
      return candidate;
    }
  }
  return '';
}

function findFirstExisting(candidates) {
  return candidates.find(existingFile) || '';
}

function findFfmpegWingetPath(profile) {
  const base = path.join(profile, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  let packages = [];
  try {
    packages = fs.readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('Gyan.FFmpeg_'))
      .map((entry) => path.join(base, entry.name));
  } catch {
    return '';
  }

  for (const packageDir of packages) {
    let builds = [];
    try {
      builds = fs.readdirSync(packageDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^ffmpeg-.+full_build$/i.test(entry.name))
        .map((entry) => path.join(packageDir, entry.name, 'bin', 'ffmpeg.exe'));
    } catch {
      builds = [];
    }
    const existing = findFirstExisting(builds);
    if (existing) {
      return existing;
    }
  }
  return '';
}

function defaultToolPaths() {
  const profile = userProfile();
  return {
    ffmpegPath: path.join(profile, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.1-full_build', 'bin', 'ffmpeg.exe'),
    ytdlpPath: path.join(profile, 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
    vlcPath: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe'
  };
}

function detectToolPaths() {
  const defaults = defaultToolPaths();
  const profile = userProfile();
  return {
    ytdlpPath: findFirstExisting([
      findOnPath('yt-dlp.exe'),
      defaults.ytdlpPath,
      path.join(profile, 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
      path.join(profile, 'AppData', 'Roaming', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
      path.join(profile, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe')
    ]) || defaults.ytdlpPath,
    ffmpegPath: findFirstExisting([
      findOnPath('ffmpeg.exe'),
      findFfmpegWingetPath(profile),
      defaults.ffmpegPath,
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\tools\\ffmpeg.exe'
    ]) || defaults.ffmpegPath,
    vlcPath: findFirstExisting([
      defaults.vlcPath,
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
      findOnPath('vlc.exe')
    ]) || defaults.vlcPath
  };
}

const DETECTED_TOOL_PATHS = detectToolPaths();

const DEFAULT_CONFIG = {
  firstLaunch: true,
  interests: ['Technology', 'Coding', 'Science'],
  ytdlpPath: DETECTED_TOOL_PATHS.ytdlpPath,
  vlcPath: DETECTED_TOOL_PATHS.vlcPath,
  ffmpegPath: DETECTED_TOOL_PATHS.ffmpegPath,
  defaultQuality: 'Best Quality',
  autoRefreshSubscriptions: true,
  cacheMaxAgeDays: 1,
  feedRefreshHours: 24
};

const DEFAULT_DATA = {
  'config.json': DEFAULT_CONFIG,
  'history.json': [],
  'subscriptions.json': [],
  'playlists.json': [
    {
      id: 'playlist_watch_later',
      name: 'Watch Later',
      createdAt: '2026-05-07T00:00:00.000Z',
      videos: []
    },
    {
      id: 'playlist_liked_videos',
      name: 'Liked Videos',
      createdAt: '2026-05-07T00:00:00.000Z',
      videos: []
    }
  ],
  'feed_cache.json': {
    lastUpdated: null,
    videos: []
  },
  'discovery_feedback.json': {
    hiddenChannelIds: [],
    hiddenChannelNames: [],
    notInterestedVideoIds: [],
    channelPenalties: {}
  }
};

let runtimePaths = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function configure(electronApp, appRoot) {
  const root = appRoot || path.resolve(__dirname, '..');
  const packaged = Boolean(electronApp && electronApp.isPackaged);
  const runtimeRoot = packaged && electronApp ? electronApp.getPath('userData') : root;
  const resourceRoot = packaged ? process.resourcesPath : root;

  runtimePaths = {
    appRoot: root,
    runtimeRoot,
    resourceRoot,
    dataDir: path.join(runtimeRoot, 'data'),
    cacheDir: path.join(runtimeRoot, 'cache'),
    thumbnailsDir: path.join(runtimeRoot, 'cache', 'thumbnails'),
    subtitlesDir: path.join(runtimeRoot, 'cache', 'subs'),
    packaged
  };

  initialize();
  return runtimePaths;
}

function getPaths() {
  if (!runtimePaths) {
    configure(null, path.resolve(__dirname, '..'));
  }
  return runtimePaths;
}

function initialize() {
  const paths = getPaths();
  ensureDirSync(paths.dataDir);
  ensureDirSync(paths.cacheDir);
  ensureDirSync(paths.thumbnailsDir);
  ensureDirSync(paths.subtitlesDir);

  for (const [fileName, fallback] of Object.entries(DEFAULT_DATA)) {
    const target = path.join(paths.dataDir, fileName);
    if (fs.existsSync(target)) {
      continue;
    }

    const packagedDefault = path.join(paths.resourceRoot, 'data', fileName);
    if (paths.packaged && fs.existsSync(packagedDefault)) {
      fs.copyFileSync(packagedDefault, target);
    } else {
      fs.writeFileSync(target, JSON.stringify(fallback, null, 2), 'utf8');
    }
  }
}

function dataFile(fileName) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_DATA, fileName)) {
    throw new Error(`Unknown data file: ${fileName}`);
  }
  return path.join(getPaths().dataDir, fileName);
}

function normalizeConfig(config) {
  const merged = { ...DEFAULT_CONFIG, ...(config || {}) };
  const detected = detectToolPaths();
  merged.interests = Array.isArray(merged.interests)
    ? merged.interests.filter(Boolean).map(String)
    : [];
  for (const key of ['ytdlpPath', 'vlcPath', 'ffmpegPath']) {
    if (!existingFile(merged[key])) {
      merged[key] = detected[key];
    }
  }
  merged.defaultQuality = String(merged.defaultQuality || DEFAULT_CONFIG.defaultQuality);
  merged.cacheMaxAgeDays = Number.isFinite(Number(merged.cacheMaxAgeDays))
    ? Number(merged.cacheMaxAgeDays)
    : DEFAULT_CONFIG.cacheMaxAgeDays;
  merged.feedRefreshHours = Number.isFinite(Number(merged.feedRefreshHours))
    ? Number(merged.feedRefreshHours)
    : Math.max(1, merged.cacheMaxAgeDays * 24);
  merged.firstLaunch = Boolean(merged.firstLaunch);
  merged.autoRefreshSubscriptions = Boolean(merged.autoRefreshSubscriptions);
  return merged;
}

async function readJson(fileName, fallback = DEFAULT_DATA[fileName]) {
  const filePath = dataFile(fileName);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (fileName === 'config.json') {
      return normalizeConfig(parsed);
    }
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      const corruptPath = `${filePath}.corrupt.${Date.now()}`;
      await fsp.rename(filePath, corruptPath).catch(() => {});
    }
    const value = clone(fallback);
    await writeJson(fileName, value);
    return fileName === 'config.json' ? normalizeConfig(value) : value;
  }
}

async function writeJson(fileName, value) {
  const filePath = dataFile(fileName);
  const nextValue = fileName === 'config.json' ? normalizeConfig(value) : value;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tempPath, `${JSON.stringify(nextValue, null, 2)}\n`, 'utf8');
  await fsp.rename(tempPath, filePath);
  return nextValue;
}

async function updateJson(fileName, updater, fallback = DEFAULT_DATA[fileName]) {
  const current = await readJson(fileName, fallback);
  const next = await updater(current);
  return writeJson(fileName, next);
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getDirectorySize(dirPath) {
  let total = 0;
  let entries = [];
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(entryPath);
    } else if (entry.isFile()) {
      const stat = await fsp.stat(entryPath).catch(() => null);
      if (stat) {
        total += stat.size;
      }
    }
  }
  return total;
}

async function clearDirectory(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
  const entries = await fsp.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.map((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.name === '.gitkeep') {
      return Promise.resolve();
    }
    return fsp.rm(entryPath, { recursive: true, force: true });
  }));
}

async function clearThumbnailCache() {
  await clearDirectory(getPaths().thumbnailsDir);
  return getCacheInfo();
}

async function getCacheInfo() {
  const paths = getPaths();
  const [thumbnailBytes, subtitleBytes] = await Promise.all([
    getDirectorySize(paths.thumbnailsDir),
    getDirectorySize(paths.subtitlesDir)
  ]);
  return {
    thumbnailBytes,
    subtitleBytes,
    totalBytes: thumbnailBytes + subtitleBytes
  };
}

async function resetAll() {
  for (const [fileName, fallback] of Object.entries(DEFAULT_DATA)) {
    await writeJson(fileName, clone(fallback));
  }
  await clearDirectory(getPaths().thumbnailsDir);
  await clearDirectory(getPaths().subtitlesDir);
  return true;
}

function resolveRuntimePath(inputPath) {
  if (!inputPath) {
    return '';
  }
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.join(getPaths().runtimeRoot, inputPath);
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_DATA,
  configure,
  getPaths,
  initialize,
  readJson,
  writeJson,
  updateJson,
  fileExists,
  getCacheInfo,
  clearThumbnailCache,
  resetAll,
  resolveRuntimePath,
  normalizeConfig,
  detectToolPaths,
  defaultToolPaths
};
