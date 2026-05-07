import { icon } from '../components/icons.js';
import { clear, createElement, escapeHtml, getVideoUrl, parseVideoId, showContextMenu, showModal } from '../utils.js';

async function libraryMap() {
  const videos = await window.api.getVideoLibrary();
  return new Map(videos.map((video) => [video.videoId, video]));
}

function playlistCard(playlist, context, videosById) {
  const card = createElement('button', 'playlist-card');
  card.type = 'button';
  const first = playlist.videos && playlist.videos.length ? videosById.get(playlist.videos[0]) : null;
  const cover = createElement('div', 'playlist-cover');
  if (first && first.thumbnail && !/^https?:\/\//i.test(first.thumbnail)) {
    cover.style.backgroundImage = `url("${window.api.toFileUrl(first.thumbnail)}")`;
    cover.classList.add('has-image');
  } else {
    cover.innerHTML = icon('folder');
  }
  const body = createElement('div');
  body.append(createElement('strong', '', playlist.name), createElement('p', 'muted', `${(playlist.videos || []).length} video${(playlist.videos || []).length === 1 ? '' : 's'}`));
  card.append(cover, body);
  card.addEventListener('click', () => context.navigate('playlists', { playlistId: playlist.id }));
  card.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showContextMenu([
      {
        label: 'Delete playlist',
        destructive: true,
        action: async () => {
          if (confirm(`Delete ${playlist.name}?`)) {
            await window.api.deletePlaylist(playlist.id);
            context.navigate('playlists');
          }
        }
      }
    ], event.clientX, event.clientY);
  });
  return card;
}

async function playAll(playlist, videosById, context) {
  const videos = playlist.videos.map((id) => videosById.get(id)).filter(Boolean);
  if (!videos.length) {
    context.showBanner('This playlist has no playable cached videos.', 'error');
    return;
  }
  const streams = [];
  for (const video of videos) {
    const stream = await window.api.getStreamURL({
      videoUrl: getVideoUrl(video),
      quality: context.config.defaultQuality
    });
    if (stream.streamUrl) {
      streams.push(stream.streamUrl);
    }
  }
  if (!streams.length) {
    context.showBanner('No streams were returned for this playlist.', 'error');
    return;
  }
  await window.api.play({
    streamUrls: streams,
    options: {
      playlist: true,
      quality: context.config.defaultQuality
    }
  });
  context.showBanner('Playlist launched in VLC.');
}

async function renderPlaylistDetail(root, context, playlist, videosById) {
  const header = createElement('div', 'page-header');
  const copy = createElement('div');
  const back = createElement('button', 'text-action', 'Back to playlists');
  back.type = 'button';
  back.addEventListener('click', () => context.navigate('playlists'));
  copy.append(back, createElement('h1', '', playlist.name), createElement('p', 'muted', `${(playlist.videos || []).length} saved videos.`));
  const actions = createElement('div', 'header-actions');
  const play = createElement('button', 'primary-action', 'Play All');
  play.type = 'button';
  play.addEventListener('click', async () => {
    play.disabled = true;
    play.textContent = 'Preparing...';
    try {
      await playAll(playlist, videosById, context);
    } catch (error) {
      context.showBanner(error.message, 'error');
    } finally {
      play.disabled = false;
      play.textContent = 'Play All';
    }
  });
  actions.appendChild(play);
  header.append(copy, actions);
  root.appendChild(header);

  const addForm = createElement('form', 'inline-form playlist-add-form');
  const input = createElement('input');
  input.placeholder = 'Add video ID or YouTube URL from your local library';
  const add = createElement('button', 'secondary-action', 'Add Video');
  add.type = 'submit';
  addForm.append(input, add);
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const videoId = parseVideoId(input.value);
    if (!videosById.has(videoId)) {
      context.showBanner('That video is not in the local feed, history, or subscription cache yet.', 'error');
      return;
    }
    await window.api.addToPlaylist({ playlistId: playlist.id, videoId });
    context.navigate('playlists', { playlistId: playlist.id });
  });
  root.appendChild(addForm);

  const list = createElement('div', 'playlist-video-list');
  if (!playlist.videos || !playlist.videos.length) {
    list.appendChild(createElement('div', 'empty-state', 'This playlist is empty.'));
  } else {
    playlist.videos.forEach((videoId) => {
      const video = videosById.get(videoId);
      const row = createElement('button', 'playlist-video-row');
      row.type = 'button';
      row.innerHTML = `<span>${icon('play')}</span><div><strong>${escapeHtml(video ? video.title : videoId)}</strong><p>${escapeHtml(video ? video.channelName : 'Video metadata not cached yet')}</p></div>`;
      row.addEventListener('click', () => {
        if (video) {
          context.openVideo(video);
        }
      });
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showContextMenu([
          {
            label: 'Move up',
            action: async () => {
              await window.api.movePlaylistVideo({ playlistId: playlist.id, videoId, direction: 'up' });
              context.navigate('playlists', { playlistId: playlist.id });
            }
          },
          {
            label: 'Move down',
            action: async () => {
              await window.api.movePlaylistVideo({ playlistId: playlist.id, videoId, direction: 'down' });
              context.navigate('playlists', { playlistId: playlist.id });
            }
          },
          {
            label: 'Remove from playlist',
            destructive: true,
            action: async () => {
              await window.api.removeFromPlaylist({ playlistId: playlist.id, videoId });
              context.navigate('playlists', { playlistId: playlist.id });
            }
          }
        ], event.clientX, event.clientY);
      });
      list.appendChild(row);
    });
  }
  root.appendChild(list);
}

export async function renderPlaylists(root, context) {
  clear(root);
  root.className = 'content';
  const [playlists, videosById] = await Promise.all([
    window.api.getPlaylists(),
    libraryMap()
  ]);
  const selected = playlists.find((playlist) => playlist.id === context.state.params.playlistId);
  if (selected) {
    await renderPlaylistDetail(root, context, selected, videosById);
    return;
  }

  const header = createElement('div', 'page-header');
  const copy = createElement('div');
  copy.append(createElement('h1', '', 'PLAYLIST'), createElement('p', 'muted eyebrow', 'LOCAL PLAYLISTS • NO ACCOUNT'));
  const create = createElement('button', 'primary-action', 'New Playlist');
  create.type = 'button';
  create.addEventListener('click', () => {
    let input;
    showModal('New Playlist', ({ body, close }) => {
      const form = createElement('form', 'modal-form');
      input = createElement('input');
      input.placeholder = 'Playlist name';
      input.required = true;
      const submit = createElement('button', 'primary-action', 'Create');
      submit.type = 'submit';
      form.append(input, submit);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          return;
        }
        try {
          await window.api.createPlaylist(name);
          close();
          context.navigate('playlists');
        } catch (error) {
          context.showBanner(error.message, 'error');
        }
      });
      body.appendChild(form);
    });
  });
  header.append(copy, create);
  root.appendChild(header);

  const grid = createElement('div', 'playlist-grid');
  playlists.forEach((playlist) => grid.appendChild(playlistCard(playlist, context, videosById)));
  root.appendChild(grid);
}
