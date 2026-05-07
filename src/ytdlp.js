const { spawn } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const dataManager = require('./dataManager');
const { isShort } = require('./recommender');

function getNativeImage() {
  try {
    return require('electron').nativeImage;
  } catch {
    return null;
  }
}

class YtdlpError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'YtdlpError';
    this.details = details;
  }
}

function executable(config) {
  return (config && config.ytdlpPath) || 'yt-dlp';
}

function normalizeQualityHeight(quality) {
  const value = String(quality || '').toLowerCase();
  if (value === 'best quality' || value === 'best' || value === 'auto') {
    return null;
  }
  if (value === '4k') {
    return 2160;
  }
  const parsed = Number.parseInt(value.replace('p', ''), 10);
  return Number.isFinite(parsed) ? parsed : 1080;
}

function commonArgs(args, config) {
  const next = [...args];
  if (config && config.ffmpegPath) {
    next.push('--ffmpeg-location', config.ffmpegPath);
  }
  return next;
}

function runYtdlp(args, config, options = {}) {
  const timeoutMs = options.timeoutMs || 120000;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable(config), commonArgs(args, config), {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      reject(new YtdlpError('Unable to start yt-dlp.', { cause: error.message }));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGTERM');
      reject(new YtdlpError('yt-dlp timed out.', { args, stderr }));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new YtdlpError('yt-dlp failed to start.', { cause: error.message, args }));
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0 || (stdout.trim() && options.allowPartialOutput)) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new YtdlpError('yt-dlp exited with an error.', { code, stderr, args }));
      }
    });
  });
}

function parseUploadDate(value) {
  if (!value) {
    return '';
  }
  const raw = String(value);
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00.000Z`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function videoUrlForId(videoId) {
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
}

function normalizeVideo(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const videoId = raw.id || raw.videoId || raw.display_id || '';
  const webpageUrl = raw.webpage_url || raw.webpageUrl || videoUrlForId(videoId);
  const thumbnails = Array.isArray(raw.thumbnails) ? raw.thumbnails : [];
  const bestThumbnail = thumbnails.length ? thumbnails[thumbnails.length - 1].url : '';
  const channelName = raw.channel || raw.uploader || raw.channelName || raw.uploader_id || 'Unknown channel';
  const normalized = {
    videoId,
    title: raw.title || 'Untitled video',
    channelName,
    channelId: raw.channel_id || raw.channelId || raw.uploader_id || '',
    channelUrl: raw.channel_url || raw.channelUrl || '',
    duration: Number(raw.duration || 0),
    uploadDate: parseUploadDate(raw.upload_date || raw.uploadDate || raw.release_timestamp || raw.timestamp),
    thumbnail: raw.thumbnail || bestThumbnail || '',
    thumbnailUrl: raw.thumbnail || bestThumbnail || '',
    views: Number(raw.view_count || raw.views || 0),
    tags: Array.isArray(raw.tags) ? raw.tags.filter(Boolean).map(String) : [],
    description: raw.description || '',
    webpageUrl,
    webpage_url: webpageUrl,
    videoUrl: webpageUrl,
    url: webpageUrl,
    subscriberCount: Number(raw.channel_follower_count || raw.subscriber_count || 0)
  };
  return isShort(normalized) ? null : normalized;
}

function parseJsonLines(stdout) {
  const videos = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed.entries)) {
        parsed.entries.map(normalizeVideo).filter(Boolean).forEach((video) => videos.push(video));
      } else {
        const video = normalizeVideo(parsed);
        if (video) {
          videos.push(video);
        }
      }
    } catch {
      continue;
    }
  }
  return videos;
}

async function search(query, maxResults = 10, config) {
  const safeMax = Math.max(1, Math.min(Number(maxResults) || 10, 100));
  const args = [
    `ytsearch${safeMax}:${query}`,
    '--dump-json',
    '--no-playlist',
    '--match-filter',
    'duration > 60',
    '--ignore-errors',
    '--no-warnings'
  ];
  const result = await runYtdlp(args, config, { allowPartialOutput: true });
  return parseJsonLines(result.stdout);
}

async function getChannelVideos(channelUrl, limit = 10, config) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 500));
  const args = [
    channelUrl,
    '--dump-json',
    '--playlist-end',
    String(safeLimit),
    '--no-download',
    '--ignore-errors',
    '--no-warnings',
    '--match-filter',
    'duration > 60'
  ];
  const result = await runYtdlp(args, config, { allowPartialOutput: true, timeoutMs: 180000 });
  return parseJsonLines(result.stdout);
}

async function getStreamURL(videoUrl, quality = '1080p', config) {
  const height = normalizeQualityHeight(quality);
  const formatSelector = height
    ? [
      `bestvideo[height<=${height}][vcodec!=none]+bestaudio[acodec!=none]`,
      `bestvideo[height<=${height}]+bestaudio`,
      `best[height<=${height}][vcodec!=none][acodec!=none]`,
      `best[height<=${height}]`,
      'best'
    ].join('/')
    : [
      'bestvideo[vcodec!=none]+bestaudio[acodec!=none]',
      'bestvideo+bestaudio',
      'best[vcodec!=none][acodec!=none]',
      'best'
    ].join('/');
  const args = [
    '-g',
    '-f',
    formatSelector,
    '--no-playlist',
    videoUrl
  ];
  const result = await runYtdlp(args, config, { timeoutMs: 120000 });
  const streamUrls = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!streamUrls.length) {
    throw new YtdlpError('yt-dlp did not return a playable stream URL.', { videoUrl, quality });
  }
  return {
    streamUrl: streamUrls[0],
    streamUrls,
    quality,
    height: height || null,
    adaptive: streamUrls.length > 1,
    formatSelector
  };
}

async function getInternalStreamURL(videoUrl, quality = 'Best Quality', config) {
  const height = normalizeQualityHeight(quality);
  const adaptiveSelectors = height && height > 1080
    ? [
      `bestvideo[height<=${height}][ext=webm]+bestaudio[ext=webm]`,
      `bestvideo[height<=${height}][vcodec!=none]+bestaudio[acodec!=none]`,
      `bestvideo[height<=${height}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]`
    ]
    : [
      height
        ? `bestvideo[height<=${height}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]`
        : 'bestvideo[vcodec!=none]+bestaudio[acodec!=none]',
      height
        ? `bestvideo[height<=${height}][ext=webm]+bestaudio[ext=webm]`
        : 'bestvideo[ext=webm]+bestaudio[ext=webm]',
      height
        ? `bestvideo[height<=${height}][vcodec!=none]+bestaudio[acodec!=none]`
        : 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]'
    ];
  const formatSelector = height
    ? [
      ...adaptiveSelectors,
      `best[height<=${height}][ext=mp4][vcodec^=avc1][acodec!=none]`,
      `best[height<=${height}][ext=mp4][vcodec!=none][acodec!=none]`,
      `best[height<=${height}][vcodec!=none][acodec!=none]`,
      `best[height<=${height}]`,
      'best'
    ].join('/')
    : [
      ...adaptiveSelectors,
      'best[ext=mp4][vcodec^=avc1][acodec!=none]',
      'best[ext=mp4][vcodec!=none][acodec!=none]',
      'best[vcodec!=none][acodec!=none]',
      'best'
    ].join('/');
  const result = await runYtdlp(['-g', '-f', formatSelector, '--no-playlist', videoUrl], config, { timeoutMs: 120000 });
  const streamUrls = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!streamUrls.length) {
    throw new YtdlpError('yt-dlp did not return an internal playback URL.', { videoUrl, quality });
  }
  return {
    streamUrl: streamUrls[0],
    streamUrls,
    quality,
    height: height || null,
    adaptive: streamUrls.length > 1,
    formatSelector
  };
}

function labelForHeight(height) {
  if (height >= 2160) {
    return '4K';
  }
  return `${height}p`;
}

function parseFormats(stdout) {
  const byHeight = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('ID ') || trimmed.startsWith('---')) {
      continue;
    }
    const heightMatch = trimmed.match(/(?:^|\s)(\d{3,4})p(?:\d+)?(?:\s|,|$)/i) ||
      trimmed.match(/\b\d+x(\d{3,4})\b/);
    if (!heightMatch) {
      continue;
    }
    const height = Number(heightMatch[1]);
    if (!Number.isFinite(height) || height < 144) {
      continue;
    }
    const id = trimmed.split(/\s+/)[0];
    const label = labelForHeight(height);
    const existing = byHeight.get(height);
    if (!existing || String(id).length < String(existing.formatId).length) {
      byHeight.set(height, {
        label,
        height,
        formatId: id,
        summary: trimmed
      });
    }
  }
  return Array.from(byHeight.values()).sort((a, b) => a.height - b.height);
}

async function getAllFormats(videoUrl, config) {
  const result = await runYtdlp(['-F', '--no-playlist', videoUrl], config, { timeoutMs: 120000 });
  const parsed = parseFormats(result.stdout);
  if (parsed.length) {
    return [
      { label: 'Best Quality', height: null, formatId: 'best', summary: 'Highest playable quality selected by yt-dlp' },
      ...parsed
    ];
  }
  return [
    { label: 'Best Quality', height: null, formatId: 'best', summary: 'Highest playable quality selected by yt-dlp' },
    { label: '360p', height: 360, formatId: 'best', summary: 'Fallback best stream at or below 360p' },
    { label: '720p', height: 720, formatId: 'best', summary: 'Fallback best stream at or below 720p' },
    { label: '1080p', height: 1080, formatId: 'best', summary: 'Fallback best stream at or below 1080p' }
  ];
}

async function getSubtitle(videoUrl, lang = 'en', config) {
  const paths = dataManager.getPaths();
  await fsp.mkdir(paths.subtitlesDir, { recursive: true });
  const output = path.join(paths.subtitlesDir, '%(id)s.%(ext)s');
  const before = new Set(await fsp.readdir(paths.subtitlesDir).catch(() => []));
  const args = [
    '--write-auto-sub',
    '--write-sub',
    '--sub-lang',
    lang,
    '--sub-format',
    'vtt',
    '--skip-download',
    '--no-playlist',
    '--output',
    output,
    videoUrl
  ];
  await runYtdlp(args, config, { timeoutMs: 120000, allowPartialOutput: true });
  const after = await fsp.readdir(paths.subtitlesDir).catch(() => []);
  const created = after.find((name) => !before.has(name) && name.endsWith('.vtt')) ||
    after.filter((name) => name.endsWith('.vtt')).sort().pop();
  return created ? path.join(paths.subtitlesDir, created) : '';
}

function extensionlessSafeId(videoId) {
  return String(videoId || 'thumbnail')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
}

function requestUrl(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('Invalid thumbnail URL.'));
      return;
    }
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.get(parsed, { headers: { 'User-Agent': 'DebloatedYT/1.0' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, parsed).toString();
        resolve(requestUrl(nextUrl, redirectsLeft - 1));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`Thumbnail request failed with status ${res.statusCode}.`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('Thumbnail request timed out.'));
    });
  });
}

async function downloadThumbnail(videoId, thumbnailUrl) {
  if (!videoId || !thumbnailUrl || !/^https?:\/\//i.test(thumbnailUrl)) {
    return '';
  }
  const paths = dataManager.getPaths();
  await fsp.mkdir(paths.thumbnailsDir, { recursive: true });
  const filePath = path.join(paths.thumbnailsDir, `${extensionlessSafeId(videoId)}.jpg`);
  const existing = await fsp.stat(filePath).catch(() => null);
  if (existing && existing.size > 0) {
    return filePath;
  }
  const buffer = await requestUrl(thumbnailUrl);
  await fsp.writeFile(filePath, compressThumbnailBuffer(buffer));
  return filePath;
}

function compressThumbnailBuffer(buffer) {
  const nativeImage = getNativeImage();
  if (!nativeImage || !buffer || !buffer.length) {
    return buffer;
  }
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) {
    return buffer;
  }
  const size = image.getSize();
  const maxWidth = 560;
  const resized = size.width > maxWidth
    ? image.resize({ width: maxWidth, quality: 'good' })
    : image;
  const output = resized.toJPEG(72);
  return output && output.length ? output : buffer;
}

module.exports = {
  YtdlpError,
  runYtdlp,
  search,
  getChannelVideos,
  getStreamURL,
  getInternalStreamURL,
  getAllFormats,
  getSubtitle,
  downloadThumbnail,
  normalizeVideo,
  videoUrlForId,
  normalizeQualityHeight,
  compressThumbnailBuffer
};
