const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const dataManager = require('./src/dataManager');
const ytdlp = require('./src/ytdlp');
const vlc = require('./src/vlc');
const recommender = require('./src/recommender');
const historyManager = require('./src/historyManager');
const playlistManager = require('./src/playlistManager');
const subscriptionManager = require('./src/subscriptionManager');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#0a0a0a',
    frame: false,
    title: 'Debloated YT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.DEBLOATEDYT_SMOKE_TEST === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => app.quit(), 250);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function currentConfig() {
  return dataManager.readJson('config.json', dataManager.DEFAULT_CONFIG);
}

function videoUrl(video) {
  return video.videoUrl || video.webpageUrl || video.webpage_url || video.url || ytdlp.videoUrlForId(video.videoId);
}

async function cacheThumbnailForVideo(video) {
  const thumbnailUrl = video.thumbnailUrl || video.remoteThumbnail || video.thumbnail;
  if (!video.videoId || !thumbnailUrl || !/^https?:\/\//i.test(thumbnailUrl)) {
    return '';
  }
  return ytdlp.downloadThumbnail(video.videoId, thumbnailUrl);
}

async function hydrateThumbnails(videos) {
  const next = videos.map((video) => ({ ...video }));
  const results = await Promise.allSettled(next.map((video) => cacheThumbnailForVideo(video)));
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      next[index].thumbnail = result.value;
    }
  });
  return next;
}

async function hydrateAndPersistFeed(videos) {
  hydrateThumbnails(videos)
    .then(async (withThumbnails) => {
      const current = await dataManager.readJson('feed_cache.json', { lastUpdated: null, videos: [] });
      const feedback = await getDiscoveryFeedback();
      const merged = mergeVideoLists(withThumbnails, current.videos || [])
        .filter((video) => (
          !recommender.isBlockedByFeedback(video, feedback) &&
          !feedback.notInterestedVideoIds.includes(video.videoId)
        ));
      await dataManager.writeJson('feed_cache.json', {
        lastUpdated: current.lastUpdated || new Date().toISOString(),
        videos: recommender.diversifyVideos(merged)
      });
    })
    .catch(() => {});
}

async function getDiscoveryFeedback() {
  const feedback = await dataManager.readJson('discovery_feedback.json', dataManager.DEFAULT_DATA['discovery_feedback.json']);
  return {
    hiddenChannelIds: Array.isArray(feedback.hiddenChannelIds) ? feedback.hiddenChannelIds : [],
    hiddenChannelNames: Array.isArray(feedback.hiddenChannelNames) ? feedback.hiddenChannelNames : [],
    notInterestedVideoIds: Array.isArray(feedback.notInterestedVideoIds) ? feedback.notInterestedVideoIds : [],
    channelPenalties: feedback.channelPenalties && typeof feedback.channelPenalties === 'object' ? feedback.channelPenalties : {}
  };
}

async function saveDiscoveryFeedback(feedback) {
  return dataManager.writeJson('discovery_feedback.json', feedback);
}

function filterFeedCache(cache, predicate) {
  return {
    ...(cache || {}),
    videos: (cache && Array.isArray(cache.videos) ? cache.videos : []).filter(predicate)
  };
}

function getFeedRefreshMs(config) {
  const hours = Number(config.feedRefreshHours || 0) || Number(config.cacheMaxAgeDays || 1) * 24;
  return Math.max(1, hours) * 60 * 60 * 1000;
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(parsed, max));
}

function mergeVideoLists(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const video of Array.isArray(list) ? list : []) {
      if (!video || !video.videoId) {
        continue;
      }
      byId.set(video.videoId, {
        ...(byId.get(video.videoId) || {}),
        ...video,
        videoUrl: videoUrl(video)
      });
    }
  }
  return Array.from(byId.values());
}

function interestQueries(interests, pageIndex) {
  const year = new Date().getFullYear();
  const variants = [
    (interest) => `${interest} documentary ${year}`,
    (interest) => `${interest} explained`,
    (interest) => `${interest} tutorial ${year}`,
    (interest) => `${interest} deep dive`,
    (interest) => `${interest} latest videos`,
    (interest) => `${interest} channels to watch`
  ];
  const variant = variants[pageIndex % variants.length];
  return interests.map((interest) => variant(interest));
}

function subscriptionVideos(subscriptions) {
  return subscriptions.flatMap((subscription) => (
    (subscription.videos || []).map((video) => ({
      ...video,
      channelName: video.channelName || subscription.channelName,
      channelId: video.channelId || subscription.channelId,
      channelUrl: video.channelUrl || subscription.channelUrl,
      videoUrl: videoUrl(video)
    }))
  ));
}

async function loadFeedBatch(event, options = {}) {
  const config = await currentConfig();
  let cache = await dataManager.readJson('feed_cache.json', { lastUpdated: null, videos: [] });
  const feedback = await getDiscoveryFeedback();
  cache = filterFeedCache(cache, (video) => (
    !recommender.isBlockedByFeedback(video, feedback) &&
    !feedback.notInterestedVideoIds.includes(video.videoId)
  ));
  cache.videos = recommender.diversifyVideos(cache.videos || []);
  const cacheTime = cache.lastUpdated ? new Date(cache.lastUpdated).getTime() : 0;
  const isFresh = cacheTime && Date.now() - cacheTime < getFeedRefreshMs(config);
  const offset = clampNumber(options.offset, 0, 0, 5000);
  const limit = clampNumber(options.limit, 24, 1, 60);
  const target = offset + limit;

  if (options.force && offset === 0) {
    cache = { lastUpdated: null, videos: [] };
  }

  if (!options.force && isFresh && Array.isArray(cache.videos) && cache.videos.length >= target) {
    return {
      videos: cache.videos.slice(offset, target),
      total: cache.videos.length,
      lastUpdated: cache.lastUpdated,
      hasMore: true
    };
  }

  const history = await historyManager.getHistory();
  const subscriptions = await subscriptionManager.getSubscriptions();
  const interests = config.interests && config.interests.length ? config.interests : dataManager.DEFAULT_CONFIG.interests;
  let videos = Array.isArray(cache.videos) ? cache.videos : [];
  let pageIndex = Math.floor(videos.length / Math.max(1, interests.length * 12));
  let attempts = 0;

  while (videos.length < target && attempts < 5) {
    const queries = interestQueries(interests, pageIndex + attempts);
    if (event && event.sender) {
      event.sender.send('feed:progress', {
        index: attempts + 1,
        total: 5,
        interest: queries.join(', '),
        message: `Expanding local feed... batch ${attempts + 1}`
      });
    }
    const fetched = await Promise.allSettled(queries.map((query) => ytdlp.search(query, 24, config)));
    const found = fetched.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const before = videos.length;
    videos = recommender
      .scoreAndSort(mergeVideoLists(videos, found, subscriptionVideos(subscriptions)), config, history, subscriptions, feedback)
      .filter((video) => !recommender.isBlockedByFeedback(video, feedback))
      .filter((video) => !feedback.notInterestedVideoIds.includes(video.videoId))
      .filter((video) => (video.score || 0) > -20)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, Math.max(target + 48, videos.length + found.length));
    attempts += 1;
    if (videos.length <= before && !found.length) {
      break;
    }
  }

  videos = recommender.diversifyVideos(videos);
  const nextCache = {
    lastUpdated: new Date().toISOString(),
    videos
  };
  await dataManager.writeJson('feed_cache.json', nextCache);
  hydrateAndPersistFeed(videos);
  return {
    videos: nextCache.videos.slice(offset, target),
    total: nextCache.videos.length,
    lastUpdated: nextCache.lastUpdated,
    hasMore: nextCache.videos.length >= target
  };
}

async function refreshFeed(event, options = {}) {
  await loadFeedBatch(event, { ...options, offset: 0, limit: options.limit || 80 });
  return dataManager.readJson('feed_cache.json', { lastUpdated: null, videos: [] });
}

function sortedSubscriptionVideos(subscriptions) {
  return subscriptionVideos(subscriptions)
    .sort((a, b) => new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime());
}

async function loadSubscriptionBatch(options = {}) {
  const config = await currentConfig();
  let subscriptions = await subscriptionManager.getSubscriptions();
  const offset = clampNumber(options.offset, 0, 0, 5000);
  const limit = clampNumber(options.limit, 24, 1, 60);
  const target = offset + limit;
  if (subscriptions.length) {
    const targetPerChannel = clampNumber(
      options.channelDepth,
      Math.ceil(target / Math.max(1, subscriptions.length)) + 24,
      24,
      500
    );
    const needsMore = subscriptions.some((subscription) => (subscription.videos || []).length < targetPerChannel);
    if (needsMore || options.force) {
      const summary = await subscriptionManager.ensureVideoDepth(ytdlp, config, targetPerChannel);
      subscriptions = summary.subscriptions;
    }
  }
  const videos = sortedSubscriptionVideos(subscriptions);
  return {
    videos: videos.slice(offset, target),
    total: videos.length,
    hasMore: videos.length >= target,
    subscriptions
  };
}

async function getVideoLibrary() {
  const [feedCache, history, subscriptions] = await Promise.all([
    dataManager.readJson('feed_cache.json', { videos: [] }),
    historyManager.getHistory(),
    subscriptionManager.getSubscriptions()
  ]);
  const videos = new Map();
  const add = (video) => {
    if (!video || !video.videoId || videos.has(video.videoId)) {
      return;
    }
    videos.set(video.videoId, {
      ...video,
      videoUrl: videoUrl(video)
    });
  };
  (feedCache.videos || []).forEach(add);
  history.forEach(add);
  subscriptions.forEach((subscription) => {
    (subscription.videos || []).forEach((video) => add({
      ...video,
      channelId: video.channelId || subscription.channelId,
      channelName: video.channelName || subscription.channelName,
      channelUrl: subscription.channelUrl
    }));
  });
  return Array.from(videos.values());
}

function validateToolPath(filePath) {
  if (!filePath) {
    return false;
  }
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function installIpcHandlers() {
  ipcMain.handle('getRuntimePaths', () => dataManager.getPaths());

  ipcMain.handle('search', async (_event, query, maxResults = 10) => {
    const config = await currentConfig();
    return ytdlp.search(query, maxResults, config);
  });

  ipcMain.handle('refreshFeed', async (event, options = {}) => refreshFeed(event, options));

  ipcMain.handle('loadFeedBatch', async (event, options = {}) => loadFeedBatch(event, options));

  ipcMain.handle('getStreamURL', async (_event, payload) => {
    const config = await currentConfig();
    return ytdlp.getStreamURL(payload.videoUrl, payload.quality || config.defaultQuality, config);
  });

  ipcMain.handle('getInternalStreamURL', async (_event, payload) => {
    const config = await currentConfig();
    return ytdlp.getInternalStreamURL(payload.videoUrl, payload.quality || config.defaultQuality, config);
  });

  ipcMain.handle('getAllFormats', async (_event, videoUrlValue) => {
    const config = await currentConfig();
    return ytdlp.getAllFormats(videoUrlValue, config);
  });

  ipcMain.handle('play', async (_event, payload) => {
    const config = await currentConfig();
    return vlc.play(payload.streamUrls || payload.streamUrl || payload, payload.options || {}, config);
  });

  ipcMain.handle('stopVlc', async () => vlc.stop());

  ipcMain.handle('getTimestamp', async () => vlc.getTimestamp());

  ipcMain.handle('switchQuality', async (_event, payload) => {
    const config = await currentConfig();
    return vlc.switchQuality(payload.streamUrls || payload.streamUrl, payload.options || {}, config);
  });

  ipcMain.handle('getSubtitle', async (_event, payload) => {
    const config = await currentConfig();
    return ytdlp.getSubtitle(payload.videoUrl, payload.lang || 'en', config);
  });

  ipcMain.handle('getChannelVideos', async (_event, channelUrl, limit = 10) => {
    const config = await currentConfig();
    return ytdlp.getChannelVideos(channelUrl, limit, config);
  });

  ipcMain.handle('getConfig', async () => currentConfig());

  ipcMain.handle('saveConfig', async (_event, config) => {
    const current = await currentConfig();
    return dataManager.writeJson('config.json', { ...current, ...config });
  });

  ipcMain.handle('getHistory', async () => historyManager.getHistory());

  ipcMain.handle('addToHistory', async (_event, video) => historyManager.addToHistory(video));

  ipcMain.handle('clearHistory', async () => historyManager.clearHistory());

  ipcMain.handle('clearHistorySince', async (_event, cutoffIso) => historyManager.clearHistorySince(cutoffIso));

  ipcMain.handle('removeFromHistory', async (_event, videoId) => historyManager.removeFromHistory(videoId));

  ipcMain.handle('getSubscriptions', async () => subscriptionManager.getSubscriptions());

  ipcMain.handle('subscribe', async (_event, channelUrl) => {
    const config = await currentConfig();
    const subscription = await subscriptionManager.subscribe(channelUrl, ytdlp, config);
    subscriptionManager.ensureVideoDepth(ytdlp, config, 24)
      .then((summary) => {
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('subs:refreshed', summary);
        }
      })
      .catch(() => {});
    return subscription;
  });

  ipcMain.handle('unsubscribe', async (_event, channelId) => subscriptionManager.unsubscribe(channelId));

  ipcMain.handle('refreshSubs', async (_event, payload = {}) => {
    const config = await currentConfig();
    return subscriptionManager.refreshAll(ytdlp, config, payload.limit || 48);
  });

  ipcMain.handle('loadSubscriptionBatch', async (_event, options = {}) => loadSubscriptionBatch(options));

  ipcMain.handle('getPlaylists', async () => playlistManager.getPlaylists());

  ipcMain.handle('createPlaylist', async (_event, name) => playlistManager.createPlaylist(name));

  ipcMain.handle('addToPlaylist', async (_event, payload) => playlistManager.addToPlaylist(payload.playlistId, payload.videoId));

  ipcMain.handle('toggleLikedVideo', async (_event, payload) => {
    if (payload.liked) {
      return playlistManager.addToNamedPlaylist('Liked Videos', payload.videoId);
    }
    return playlistManager.removeFromNamedPlaylist('Liked Videos', payload.videoId);
  });

  ipcMain.handle('getLikedVideoIds', async () => {
    const playlists = await playlistManager.getPlaylists();
    const liked = playlists.find((playlist) => playlist.name === 'Liked Videos');
    return liked ? liked.videos || [] : [];
  });

  ipcMain.handle('removeFromPlaylist', async (_event, payload) => playlistManager.removeFromPlaylist(payload.playlistId, payload.videoId));

  ipcMain.handle('movePlaylistVideo', async (_event, payload) => playlistManager.moveVideo(payload.playlistId, payload.videoId, payload.direction));

  ipcMain.handle('deletePlaylist', async (_event, playlistId) => playlistManager.deletePlaylist(playlistId));

  ipcMain.handle('getFeedCache', async () => dataManager.readJson('feed_cache.json', { lastUpdated: null, videos: [] }));

  ipcMain.handle('getDiscoveryFeedback', async () => getDiscoveryFeedback());

  ipcMain.handle('hideDiscoveryChannel', async (_event, video) => {
    const feedback = await getDiscoveryFeedback();
    const channelId = video && video.channelId ? String(video.channelId) : '';
    const channelName = video && video.channelName ? String(video.channelName).toLowerCase() : '';
    if (channelId && !feedback.hiddenChannelIds.includes(channelId)) {
      feedback.hiddenChannelIds.push(channelId);
    }
    if (channelName && !feedback.hiddenChannelNames.includes(channelName)) {
      feedback.hiddenChannelNames.push(channelName);
    }
    await saveDiscoveryFeedback(feedback);
    const cache = await dataManager.readJson('feed_cache.json', { lastUpdated: null, videos: [] });
    await dataManager.writeJson('feed_cache.json', filterFeedCache(cache, (item) => (
      !(channelId && item.channelId === channelId) &&
      !(channelName && String(item.channelName || '').toLowerCase() === channelName)
    )));
    return feedback;
  });

  ipcMain.handle('markNotInterested', async (_event, video) => {
    const feedback = await getDiscoveryFeedback();
    const videoId = video && video.videoId ? String(video.videoId) : '';
    const channelId = video && video.channelId ? String(video.channelId) : '';
    if (videoId && !feedback.notInterestedVideoIds.includes(videoId)) {
      feedback.notInterestedVideoIds.push(videoId);
    }
    if (channelId) {
      feedback.channelPenalties[channelId] = Math.min(30, Number(feedback.channelPenalties[channelId] || 0) + 4);
    }
    await saveDiscoveryFeedback(feedback);
    const cache = await dataManager.readJson('feed_cache.json', { lastUpdated: null, videos: [] });
    await dataManager.writeJson('feed_cache.json', filterFeedCache(cache, (item) => item.videoId !== videoId));
    return feedback;
  });

  ipcMain.handle('saveFeedCache', async (_event, feedCache) => dataManager.writeJson('feed_cache.json', feedCache));

  ipcMain.handle('clearCache', async () => dataManager.clearThumbnailCache());

  ipcMain.handle('getCacheInfo', async () => dataManager.getCacheInfo());

  ipcMain.handle('cacheThumbnail', async (_event, video) => cacheThumbnailForVideo(video));

  ipcMain.handle('getVideoLibrary', async () => getVideoLibrary());

  ipcMain.handle('browseExecutable', async (_event, title) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Select executable',
      properties: ['openFile'],
      filters: [
        { name: 'Executable', extensions: ['exe'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    return result.canceled ? '' : result.filePaths[0];
  });

  ipcMain.handle('copyText', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  ipcMain.handle('validateTools', async () => {
    const config = await currentConfig();
    return {
      ytdlp: validateToolPath(config.ytdlpPath),
      vlc: validateToolPath(config.vlcPath),
      ffmpeg: validateToolPath(config.ffmpegPath)
    };
  });

  ipcMain.handle('resetApp', async () => {
    await dataManager.resetAll();
    if (mainWindow) {
      mainWindow.reload();
    }
    return true;
  });

  ipcMain.handle('window:minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) {
      return false;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });
}

async function refreshSubscriptionsOnLaunch() {
  const config = await currentConfig();
  if (!config.autoRefreshSubscriptions) {
    return;
  }
  subscriptionManager.refreshAll(ytdlp, config)
    .then((summary) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('subs:refreshed', summary);
      }
    })
    .catch((error) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('subs:refreshed', {
          checked: 0,
          updatedChannels: 0,
          errors: [{ message: error.message }],
          subscriptions: []
        });
      }
    });
}

app.whenReady().then(async () => {
  dataManager.configure(app, __dirname);
  installIpcHandlers();
  createWindow();
  refreshSubscriptionsOnLaunch();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
