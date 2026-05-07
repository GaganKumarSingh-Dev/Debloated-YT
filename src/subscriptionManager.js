const dataManager = require('./dataManager');

function fallbackChannelName(channelUrl) {
  return String(channelUrl || '')
    .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'YouTube channel';
}

function fallbackChannelId(channelUrl) {
  return String(channelUrl || fallbackChannelName(channelUrl))
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function videoEntry(video) {
  return {
    videoId: video.videoId,
    title: video.title,
    duration: Number(video.duration || 0),
    uploadDate: video.uploadDate || '',
    thumbnail: video.thumbnail || '',
    thumbnailUrl: video.thumbnailUrl || video.thumbnail || '',
    views: Number(video.views || 0),
    tags: Array.isArray(video.tags) ? video.tags : [],
    channelName: video.channelName || '',
    channelId: video.channelId || '',
    channelUrl: video.channelUrl || '',
    videoUrl: video.videoUrl || video.webpageUrl || video.webpage_url || video.url || '',
    description: video.description || ''
  };
}

async function getSubscriptions() {
  const subscriptions = await dataManager.readJson('subscriptions.json', []);
  return Array.isArray(subscriptions) ? subscriptions : [];
}

async function writeSubscriptions(subscriptions) {
  return dataManager.writeJson('subscriptions.json', subscriptions);
}

async function fetchVideosForSubscription(subscription, ytdlp, config, limit) {
  const fetched = await ytdlp.getChannelVideos(subscription.channelUrl, limit, config);
  const normalized = fetched
    .filter((video) => video.videoId)
    .map((video) => ({
      ...videoEntry(video),
      channelName: video.channelName || subscription.channelName,
      channelId: video.channelId || subscription.channelId,
      channelUrl: video.channelUrl || subscription.channelUrl
    }));
  const seen = new Set();
  subscription.videos = normalized.filter((video) => {
    if (seen.has(video.videoId)) {
      return false;
    }
    seen.add(video.videoId);
    return true;
  });
  subscription.lastChecked = new Date().toISOString();
  if (fetched[0]) {
    subscription.channelName = fetched[0].channelName || subscription.channelName;
    subscription.channelId = fetched[0].channelId || subscription.channelId;
  }
  return subscription;
}

async function subscribe(channelUrl, ytdlp, config) {
  const url = String(channelUrl || '').trim();
  if (!/^https?:\/\/(www\.)?youtube\.com\//i.test(url)) {
    throw new Error('Paste a full YouTube channel URL.');
  }

  const subscriptions = await getSubscriptions();
  const existing = subscriptions.find((sub) => sub.channelUrl === url);
  if (existing) {
    return existing;
  }

  const channelId = fallbackChannelId(url);
  const duplicateById = subscriptions.find((sub) => sub.channelId === channelId);
  if (duplicateById) {
    duplicateById.channelUrl = url;
    await writeSubscriptions(subscriptions);
    return duplicateById;
  }

  const subscription = {
    channelId,
    channelName: fallbackChannelName(url),
    channelUrl: url,
    subscribedAt: new Date().toISOString(),
    lastChecked: null,
    videos: []
  };
  subscriptions.unshift(subscription);
  await writeSubscriptions(subscriptions);
  return subscription;
}

async function unsubscribe(channelId) {
  const subscriptions = await getSubscriptions();
  const next = subscriptions.filter((sub) => sub.channelId !== channelId);
  await writeSubscriptions(next);
  return next;
}

async function refreshAll(ytdlp, config, limit = 24) {
  const subscriptions = await getSubscriptions();
  const errors = [];
  let updatedChannels = 0;

  for (const subscription of subscriptions) {
    try {
      const fetched = await ytdlp.getChannelVideos(subscription.channelUrl, limit, config);
      const existingIds = new Set((subscription.videos || []).map((video) => video.videoId));
      const newVideos = fetched
        .filter((video) => video.videoId && !existingIds.has(video.videoId))
        .map(videoEntry);
      if (newVideos.length) {
        subscription.videos = [...newVideos, ...(subscription.videos || [])].slice(0, Math.max(100, limit));
        updatedChannels += 1;
      }
      subscription.lastChecked = new Date().toISOString();
      if (fetched[0]) {
        subscription.channelName = fetched[0].channelName || subscription.channelName;
        subscription.channelId = fetched[0].channelId || subscription.channelId;
      }
    } catch (error) {
      errors.push({
        channelId: subscription.channelId,
        channelName: subscription.channelName,
        message: error.message
      });
    }
  }

  const latest = await getSubscriptions();
  const activeKeys = new Set(latest.flatMap((subscription) => [subscription.channelId, subscription.channelUrl].filter(Boolean)));
  const stillActive = subscriptions.filter((subscription) => activeKeys.has(subscription.channelId) || activeKeys.has(subscription.channelUrl));
  await writeSubscriptions(stillActive);
  return {
    checked: stillActive.length,
    updatedChannels,
    errors,
    subscriptions: stillActive
  };
}

async function ensureVideoDepth(ytdlp, config, targetPerChannel = 24) {
  const subscriptions = await getSubscriptions();
  const errors = [];
  const safeTarget = Math.max(1, Math.min(Number(targetPerChannel) || 24, 500));
  let updatedChannels = 0;

  for (const subscription of subscriptions) {
    if ((subscription.videos || []).length >= safeTarget) {
      continue;
    }
    try {
      await fetchVideosForSubscription(subscription, ytdlp, config, safeTarget);
      updatedChannels += 1;
    } catch (error) {
      errors.push({
        channelId: subscription.channelId,
        channelName: subscription.channelName,
        message: error.message
      });
    }
  }

  const latest = await getSubscriptions();
  const activeKeys = new Set(latest.flatMap((subscription) => [subscription.channelId, subscription.channelUrl].filter(Boolean)));
  const stillActive = subscriptions.filter((subscription) => activeKeys.has(subscription.channelId) || activeKeys.has(subscription.channelUrl));
  await writeSubscriptions(stillActive);
  return {
    checked: stillActive.length,
    updatedChannels,
    errors,
    subscriptions: stillActive
  };
}

module.exports = {
  getSubscriptions,
  subscribe,
  unsubscribe,
  refreshAll,
  ensureVideoDepth
};
