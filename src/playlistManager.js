const dataManager = require('./dataManager');

const SYSTEM_PLAYLISTS = [
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
];

function makePlaylistId(name) {
  const base = String(name || 'playlist')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'playlist';
  return `${base}_${Date.now().toString(36)}`;
}

async function getPlaylists() {
  const playlists = await dataManager.readJson('playlists.json', []);
  const list = Array.isArray(playlists) ? playlists : [];
  let changed = false;
  for (const systemPlaylist of SYSTEM_PLAYLISTS) {
    const existing = list.find((playlist) => playlist.id === systemPlaylist.id || playlist.name === systemPlaylist.name);
    if (existing) {
      if (existing.id !== systemPlaylist.id || existing.name !== systemPlaylist.name || !Array.isArray(existing.videos)) {
        changed = true;
      }
      existing.id = systemPlaylist.id;
      existing.name = systemPlaylist.name;
      existing.videos = Array.isArray(existing.videos) ? existing.videos : [];
    } else {
      list.push({ ...systemPlaylist, videos: [] });
      changed = true;
    }
  }
  if (changed) {
    await writePlaylists(list);
  }
  return list;
}

async function writePlaylists(playlists) {
  return dataManager.writeJson('playlists.json', playlists);
}

async function createPlaylist(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new Error('Playlist name is required.');
  }

  const playlists = await getPlaylists();
  const playlist = {
    id: makePlaylistId(trimmed),
    name: trimmed,
    createdAt: new Date().toISOString(),
    videos: []
  };
  playlists.unshift(playlist);
  await writePlaylists(playlists);
  return playlist;
}

async function deletePlaylist(playlistId) {
  const playlists = await getPlaylists();
  const next = playlists.filter((playlist) => playlist.id !== playlistId);
  await writePlaylists(next);
  return next;
}

async function addToPlaylist(playlistId, videoId) {
  if (!videoId) {
    throw new Error('A videoId is required.');
  }
  const playlists = await getPlaylists();
  const playlist = playlists.find((item) => item.id === playlistId);
  if (!playlist) {
    throw new Error('Playlist not found.');
  }
  playlist.videos = Array.isArray(playlist.videos) ? playlist.videos : [];
  if (!playlist.videos.includes(videoId)) {
    playlist.videos.push(videoId);
  }
  await writePlaylists(playlists);
  return playlist;
}

async function addToNamedPlaylist(name, videoId) {
  const playlists = await getPlaylists();
  let playlist = playlists.find((item) => item.name.toLowerCase() === String(name).toLowerCase());
  if (!playlist) {
    playlist = {
      id: makePlaylistId(name),
      name,
      createdAt: new Date().toISOString(),
      videos: []
    };
    playlists.push(playlist);
  }
  playlist.videos = Array.isArray(playlist.videos) ? playlist.videos : [];
  if (!playlist.videos.includes(videoId)) {
    playlist.videos.unshift(videoId);
  }
  await writePlaylists(playlists);
  return playlist;
}

async function removeFromNamedPlaylist(name, videoId) {
  const playlists = await getPlaylists();
  const playlist = playlists.find((item) => item.name.toLowerCase() === String(name).toLowerCase());
  if (!playlist) {
    return null;
  }
  playlist.videos = (playlist.videos || []).filter((item) => item !== videoId);
  await writePlaylists(playlists);
  return playlist;
}

async function removeFromPlaylist(playlistId, videoId) {
  const playlists = await getPlaylists();
  const playlist = playlists.find((item) => item.id === playlistId);
  if (!playlist) {
    throw new Error('Playlist not found.');
  }
  playlist.videos = (playlist.videos || []).filter((item) => item !== videoId);
  await writePlaylists(playlists);
  return playlist;
}

async function moveVideo(playlistId, videoId, direction) {
  const playlists = await getPlaylists();
  const playlist = playlists.find((item) => item.id === playlistId);
  if (!playlist) {
    throw new Error('Playlist not found.');
  }
  const videos = Array.isArray(playlist.videos) ? playlist.videos : [];
  const current = videos.indexOf(videoId);
  if (current === -1) {
    throw new Error('Video not found in playlist.');
  }
  const nextIndex = direction === 'up' ? current - 1 : current + 1;
  if (nextIndex < 0 || nextIndex >= videos.length) {
    return playlist;
  }
  const [item] = videos.splice(current, 1);
  videos.splice(nextIndex, 0, item);
  playlist.videos = videos;
  await writePlaylists(playlists);
  return playlist;
}

module.exports = {
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  addToPlaylist,
  addToNamedPlaylist,
  removeFromNamedPlaylist,
  removeFromPlaylist,
  moveVideo
};
