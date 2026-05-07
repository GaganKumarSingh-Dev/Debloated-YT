const dataManager = require('./dataManager');

function normalizeHistoryEntry(video) {
  const now = new Date().toISOString();
  return {
    videoId: video.videoId || video.id,
    title: video.title || 'Untitled video',
    channelName: video.channelName || video.uploader || video.channel || 'Unknown channel',
    channelId: video.channelId || video.channel_id || '',
    watchedAt: video.watchedAt || now,
    duration: Number(video.duration || 0),
    thumbnail: video.thumbnail || video.thumbnailPath || video.thumbnailUrl || '',
    thumbnailUrl: video.thumbnailUrl || video.thumbnail || '',
    videoUrl: video.videoUrl || video.webpageUrl || video.webpage_url || video.url || '',
    views: Number(video.views || 0),
    uploadDate: video.uploadDate || video.upload_date || '',
    description: video.description || '',
    tags: Array.isArray(video.tags) ? video.tags : []
  };
}

async function getHistory() {
  const history = await dataManager.readJson('history.json', []);
  return Array.isArray(history) ? history : [];
}

async function addToHistory(video) {
  const entry = normalizeHistoryEntry(video);
  if (!entry.videoId) {
    throw new Error('Cannot add a video to history without a videoId.');
  }

  const history = await getHistory();
  const withoutExisting = history.filter((item) => item.videoId !== entry.videoId);
  withoutExisting.unshift(entry);
  await dataManager.writeJson('history.json', withoutExisting);
  return entry;
}

async function clearHistory() {
  await dataManager.writeJson('history.json', []);
  return [];
}

async function clearHistorySince(cutoffIso) {
  const cutoff = new Date(cutoffIso).getTime();
  if (!Number.isFinite(cutoff)) {
    throw new Error('A valid cutoff date is required.');
  }
  const history = await getHistory();
  const next = history.filter((item) => {
    const watched = new Date(item.watchedAt || 0).getTime();
    return !Number.isFinite(watched) || watched < cutoff;
  });
  await dataManager.writeJson('history.json', next);
  return next;
}

async function removeFromHistory(videoId) {
  const history = await getHistory();
  const next = history.filter((item) => item.videoId !== videoId);
  await dataManager.writeJson('history.json', next);
  return next;
}

module.exports = {
  getHistory,
  addToHistory,
  clearHistory,
  clearHistorySince,
  removeFromHistory,
  normalizeHistoryEntry
};
