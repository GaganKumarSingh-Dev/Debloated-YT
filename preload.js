const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

function toFileUrl(filePath) {
  if (!filePath) {
    return '';
  }
  const value = String(filePath);
  if (/^(https?:|file:|data:|blob:)/i.test(value)) {
    return value;
  }
  return pathToFileURL(path.resolve(value)).toString();
}

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  getRuntimePaths: () => ipcRenderer.invoke('getRuntimePaths'),
  search: (query, maxResults) => ipcRenderer.invoke('search', query, maxResults),
  refreshFeed: (options) => ipcRenderer.invoke('refreshFeed', options),
  loadFeedBatch: (options) => ipcRenderer.invoke('loadFeedBatch', options),
  getStreamURL: (payload) => ipcRenderer.invoke('getStreamURL', payload),
  getInternalStreamURL: (payload) => ipcRenderer.invoke('getInternalStreamURL', payload),
  getAllFormats: (videoUrl) => ipcRenderer.invoke('getAllFormats', videoUrl),
  play: (payload) => ipcRenderer.invoke('play', payload),
  stopVlc: () => ipcRenderer.invoke('stopVlc'),
  getTimestamp: () => ipcRenderer.invoke('getTimestamp'),
  switchQuality: (payload) => ipcRenderer.invoke('switchQuality', payload),
  getSubtitle: (payload) => ipcRenderer.invoke('getSubtitle', payload),
  getChannelVideos: (channelUrl, limit) => ipcRenderer.invoke('getChannelVideos', channelUrl, limit),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  saveConfig: (config) => ipcRenderer.invoke('saveConfig', config),
  getHistory: () => ipcRenderer.invoke('getHistory'),
  addToHistory: (video) => ipcRenderer.invoke('addToHistory', video),
  clearHistory: () => ipcRenderer.invoke('clearHistory'),
  clearHistorySince: (cutoffIso) => ipcRenderer.invoke('clearHistorySince', cutoffIso),
  removeFromHistory: (videoId) => ipcRenderer.invoke('removeFromHistory', videoId),
  getSubscriptions: () => ipcRenderer.invoke('getSubscriptions'),
  subscribe: (channelUrl) => ipcRenderer.invoke('subscribe', channelUrl),
  unsubscribe: (channelId) => ipcRenderer.invoke('unsubscribe', channelId),
  refreshSubs: (payload) => ipcRenderer.invoke('refreshSubs', payload),
  loadSubscriptionBatch: (options) => ipcRenderer.invoke('loadSubscriptionBatch', options),
  getPlaylists: () => ipcRenderer.invoke('getPlaylists'),
  createPlaylist: (name) => ipcRenderer.invoke('createPlaylist', name),
  addToPlaylist: (payload) => ipcRenderer.invoke('addToPlaylist', payload),
  toggleLikedVideo: (payload) => ipcRenderer.invoke('toggleLikedVideo', payload),
  getLikedVideoIds: () => ipcRenderer.invoke('getLikedVideoIds'),
  removeFromPlaylist: (payload) => ipcRenderer.invoke('removeFromPlaylist', payload),
  movePlaylistVideo: (payload) => ipcRenderer.invoke('movePlaylistVideo', payload),
  deletePlaylist: (playlistId) => ipcRenderer.invoke('deletePlaylist', playlistId),
  getFeedCache: () => ipcRenderer.invoke('getFeedCache'),
  getDiscoveryFeedback: () => ipcRenderer.invoke('getDiscoveryFeedback'),
  hideDiscoveryChannel: (video) => ipcRenderer.invoke('hideDiscoveryChannel', video),
  markNotInterested: (video) => ipcRenderer.invoke('markNotInterested', video),
  saveFeedCache: (feedCache) => ipcRenderer.invoke('saveFeedCache', feedCache),
  clearCache: () => ipcRenderer.invoke('clearCache'),
  getCacheInfo: () => ipcRenderer.invoke('getCacheInfo'),
  cacheThumbnail: (video) => ipcRenderer.invoke('cacheThumbnail', video),
  getVideoLibrary: () => ipcRenderer.invoke('getVideoLibrary'),
  browseExecutable: (title) => ipcRenderer.invoke('browseExecutable', title),
  copyText: (text) => ipcRenderer.invoke('copyText', text),
  validateTools: () => ipcRenderer.invoke('validateTools'),
  resetApp: () => ipcRenderer.invoke('resetApp'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  onFeedProgress: (callback) => on('feed:progress', callback),
  onSubscriptionsRefreshed: (callback) => on('subs:refreshed', callback),
  toFileUrl
});
