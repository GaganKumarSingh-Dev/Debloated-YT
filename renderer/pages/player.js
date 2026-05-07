import { icon } from '../components/icons.js';
import { createVideoCard } from '../components/videoCard.js';
import { clear, createElement, escapeHtml, formatViews, getVideoUrl, QUALITY_OPTIONS, timeAgo } from '../utils.js';

function qualityLabelFromFormat(format) {
  return format.label || (format.height >= 2160 ? '4K' : `${format.height}p`);
}

async function loadFormats(videoUrl, preferredQuality) {
  try {
    const formats = await window.api.getAllFormats(videoUrl);
    const labels = Array.from(new Set(['Best Quality', ...formats.map(qualityLabelFromFormat), preferredQuality].filter(Boolean)));
    return QUALITY_OPTIONS.filter((quality) => labels.includes(quality));
  } catch {
    return QUALITY_OPTIONS;
  }
}

async function relatedVideos(video) {
  const cache = await window.api.getFeedCache();
  const source = Array.isArray(cache.videos) ? cache.videos : [];
  const tags = new Set((video.tags || []).map((tag) => String(tag).toLowerCase()));
  return source
    .filter((candidate) => candidate.videoId !== video.videoId)
    .map((candidate) => {
      const overlap = (candidate.tags || []).filter((tag) => tags.has(String(tag).toLowerCase())).length;
      return { ...candidate, overlap };
    })
    .filter((candidate) => candidate.overlap > 0 || candidate.channelId === video.channelId)
    .sort((a, b) => (b.overlap + (b.score || 0)) - (a.overlap + (a.score || 0)))
    .slice(0, 6);
}

function bindAdaptiveAudioSync(videoElement, audioElement) {
  const hasAdaptiveAudio = () => audioElement.dataset.enabled === '1' && Boolean(audioElement.src);

  const syncAudioTime = (force = false) => {
    if (!hasAdaptiveAudio() || !Number.isFinite(videoElement.currentTime)) {
      return;
    }
    const drift = Math.abs((audioElement.currentTime || 0) - videoElement.currentTime);
    if (force || drift > 0.45) {
      try {
        audioElement.currentTime = videoElement.currentTime;
      } catch {
        audioElement.load();
      }
    }
  };

  const syncAudioState = () => {
    if (!hasAdaptiveAudio()) {
      return;
    }
    audioElement.volume = videoElement.volume;
    audioElement.muted = videoElement.muted;
    audioElement.playbackRate = videoElement.playbackRate;
    syncAudioTime();
    if (!videoElement.paused && !videoElement.ended) {
      audioElement.play().catch(() => {});
    }
  };

  videoElement.addEventListener('play', syncAudioState);
  videoElement.addEventListener('playing', syncAudioState);
  videoElement.addEventListener('pause', () => {
    if (hasAdaptiveAudio()) {
      audioElement.pause();
    }
  });
  videoElement.addEventListener('waiting', () => {
    if (hasAdaptiveAudio()) {
      audioElement.pause();
    }
  });
  videoElement.addEventListener('seeked', () => {
    syncAudioTime(true);
    syncAudioState();
  });
  videoElement.addEventListener('timeupdate', () => syncAudioTime());
  videoElement.addEventListener('ratechange', syncAudioState);
  videoElement.addEventListener('volumechange', syncAudioState);
  videoElement.addEventListener('ended', () => audioElement.pause());
}

async function buildSavePopover(video, context) {
  const playlists = await window.api.getPlaylists();
  const popover = createElement('div', 'save-popover hidden');
  const list = createElement('div', 'save-popover-list');
  playlists.forEach((playlist) => {
    const button = createElement('button', 'save-popover-item', '');
    button.type = 'button';
    button.innerHTML = `<strong>${escapeHtml(playlist.name)}</strong><span>${(playlist.videos || []).length}</span>`;
    button.addEventListener('click', async () => {
      await window.api.addToPlaylist({ playlistId: playlist.id, videoId: video.videoId });
      popover.classList.add('hidden');
      context.showBanner(`Saved to ${playlist.name}.`);
    });
    list.appendChild(button);
  });

  const form = createElement('form', 'save-popover-form');
  const input = createElement('input');
  input.placeholder = 'New playlist';
  const submit = createElement('button', 'secondary-action', 'Create');
  submit.type = 'submit';
  form.append(input, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      return;
    }
    const playlist = await window.api.createPlaylist(name);
    await window.api.addToPlaylist({ playlistId: playlist.id, videoId: video.videoId });
    popover.classList.add('hidden');
    context.showBanner(`Saved to ${playlist.name}.`);
  });
  popover.append(list, form);
  return popover;
}

async function startExternalPlayback(video, quality, statusNode, context, startTime = 0) {
  const videoUrl = getVideoUrl(video);
  if (!videoUrl) {
    throw new Error('This video does not have a playable URL.');
  }
  statusNode.textContent = 'Fetching VLC stream...';
  const stream = await window.api.getStreamURL({ videoUrl, quality });
  statusNode.textContent = stream.adaptive ? 'Launching external VLC with adaptive high quality...' : 'Launching external VLC...';
  await window.api.play({
    streamUrls: stream.streamUrls,
    options: {
      startTime,
      quality
    }
  });
  await window.api.addToHistory({
    ...video,
    videoUrl,
    watchedAt: new Date().toISOString()
  });
  statusNode.textContent = stream.adaptive ? 'External VLC launched • adaptive high quality' : `External VLC launched • ${quality}`;
  context.showBanner('Playback launched in VLC.');
}

function waitForVideoMetadata(videoElement, streamUrl) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      videoElement.removeEventListener('loadedmetadata', onLoaded);
      videoElement.removeEventListener('error', onError);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const onLoaded = () => finish();
    const onError = () => finish(new Error('The selected stream could not be loaded by the internal player.'));
    const timer = setTimeout(() => finish(), 12000);
    videoElement.addEventListener('loadedmetadata', onLoaded);
    videoElement.addEventListener('error', onError);
    videoElement.src = streamUrl;
    videoElement.load();
  });
}

async function startInternalPlayback(videoElement, audioElement, video, quality, statusNode, context, startTime = 0) {
  const videoUrl = getVideoUrl(video);
  if (!videoUrl) {
    throw new Error('This video does not have a playable URL.');
  }
  statusNode.textContent = 'Fetching internal stream...';
  const stream = await window.api.getInternalStreamURL({ videoUrl, quality });
  const streamUrls = Array.isArray(stream.streamUrls) && stream.streamUrls.length ? stream.streamUrls : [stream.streamUrl];
  const [videoStream, audioStream] = streamUrls;
  videoElement.pause();
  audioElement.pause();
  audioElement.dataset.enabled = audioStream ? '1' : '0';
  if (audioStream) {
    audioElement.src = audioStream;
    audioElement.preload = 'auto';
    audioElement.load();
  } else {
    audioElement.removeAttribute('src');
    audioElement.load();
  }
  await waitForVideoMetadata(videoElement, videoStream);
  if (startTime > 0 && Number.isFinite(startTime)) {
    const safeStart = Math.max(0, startTime);
    videoElement.currentTime = safeStart;
    if (audioStream) {
      try {
        audioElement.currentTime = safeStart;
      } catch {
        audioElement.load();
      }
    }
  }
  await videoElement.play().catch(() => {});
  if (audioStream && !videoElement.paused) {
    audioElement.volume = videoElement.volume;
    audioElement.muted = videoElement.muted;
    audioElement.playbackRate = videoElement.playbackRate;
    await audioElement.play().catch(() => {});
  }
  await window.api.addToHistory({
    ...video,
    videoUrl,
    watchedAt: new Date().toISOString()
  });
  statusNode.textContent = stream.adaptive ? `Internal playback • ${quality} adaptive A/V` : `Internal playback • ${quality} single stream`;
}

export async function renderPlayer(root, context) {
  const video = context.state.params.video;
  clear(root);
  root.className = 'content player-content';
  if (!video) {
    root.appendChild(createElement('div', 'empty-state', 'No video selected.'));
    return;
  }

  const quality = context.config.defaultQuality || 'Best Quality';
  const likedIds = new Set(await window.api.getLikedVideoIds());
  const layout = createElement('div', 'player-layout');
  const main = createElement('section', 'player-main');
  const side = createElement('aside', 'up-next');

  const playerBox = createElement('div', 'player-box internal-player-box');
  const videoElement = createElement('video', 'internal-video');
  videoElement.controls = true;
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  const audioElement = createElement('audio', 'internal-audio');
  audioElement.preload = 'auto';
  audioElement.dataset.enabled = '0';
  bindAdaptiveAudioSync(videoElement, audioElement);
  const overlay = createElement('div', 'player-overlay');
  overlay.innerHTML = `${icon('play', 'large-icon')}<span>Internal Playback</span>`;
  const status = createElement('div', 'player-inline-status', 'Preparing internal player...');
  playerBox.append(videoElement, audioElement, overlay);
  videoElement.addEventListener('playing', () => overlay.classList.add('hidden'));
  videoElement.addEventListener('pause', () => overlay.classList.remove('hidden'));
  videoElement.addEventListener('error', () => {
    status.textContent = 'Internal playback failed. Use Play in VLC.';
    overlay.classList.remove('hidden');
  });

  const title = createElement('h1', 'player-title', video.title || 'Untitled video');
  const channelRow = createElement('div', 'channel-meta');
  channelRow.innerHTML = `<div class="avatar">${escapeHtml((video.channelName || 'U').slice(0, 1).toUpperCase())}</div><div><strong>${escapeHtml(video.channelName || 'Unknown channel')}</strong><p>${video.subscriberCount ? `${Number(video.subscriberCount).toLocaleString()} subscribers` : 'Subscriber count unavailable'}</p></div>`;
  const subButton = createElement('button', 'secondary-action subscribe-action', 'NOT SUBSCRIBED');
  subButton.type = 'button';
  subButton.addEventListener('click', async () => {
    if (!video.channelUrl) {
      context.showBanner('This result did not include a channel URL.', 'error');
      return;
    }
    await window.api.subscribe(video.channelUrl);
    subButton.textContent = 'SUBSCRIBED';
    context.showBanner('Channel subscribed locally.');
  });
  channelRow.appendChild(subButton);

  const actions = createElement('div', 'action-row');
  const like = createElement('button', likedIds.has(video.videoId) ? 'secondary-action active' : 'secondary-action', likedIds.has(video.videoId) ? 'Liked' : 'Like');
  like.type = 'button';
  like.addEventListener('click', async () => {
    const liked = !like.classList.contains('active');
    await window.api.toggleLikedVideo({ videoId: video.videoId, liked });
    like.classList.toggle('active', liked);
    like.textContent = liked ? 'Liked' : 'Like';
    context.showBanner(liked ? 'Added to Liked Videos.' : 'Removed from Liked Videos.');
  });
  const share = createElement('button', 'secondary-action', 'Share');
  share.type = 'button';
  share.addEventListener('click', async () => {
    await window.api.copyText(getVideoUrl(video));
    context.showBanner('Video URL copied.');
  });
  const save = createElement('button', 'secondary-action', 'Save');
  save.type = 'button';
  const saveWrap = createElement('div', 'save-wrap');
  const savePopover = await buildSavePopover(video, context);
  save.addEventListener('click', () => savePopover.classList.toggle('hidden'));
  saveWrap.append(save, savePopover);
  const external = createElement('button', 'primary-action', 'Play in VLC');
  external.type = 'button';
  external.addEventListener('click', async () => {
    try {
      await startExternalPlayback(video, qualitySelect.value, status, context, Math.floor(videoElement.currentTime || 0));
    } catch (error) {
      status.textContent = 'External VLC failed';
      context.showBanner(error.message, 'error');
    }
  });
  actions.append(like, share, saveWrap, external);

  const qualityRow = createElement('div', 'quality-row');
  const qualitySelect = createElement('select');
  qualitySelect.disabled = true;
  qualitySelect.innerHTML = `<option>${quality}</option>`;
  qualityRow.append(createElement('span', '', 'Quality'), qualitySelect);
  loadFormats(getVideoUrl(video), quality).then((qualities) => {
    qualitySelect.replaceChildren();
    qualities.forEach((item) => {
      const option = createElement('option');
      option.value = item;
      option.textContent = item;
      qualitySelect.appendChild(option);
    });
    qualitySelect.value = qualities.includes(quality) ? quality : 'Best Quality';
    qualitySelect.disabled = false;
  });
  qualitySelect.addEventListener('change', async () => {
    const timestamp = Math.floor(videoElement.currentTime || 0);
    try {
      await startInternalPlayback(videoElement, audioElement, video, qualitySelect.value, status, context, timestamp);
    } catch (error) {
      status.textContent = 'Internal quality switch failed';
      context.showBanner(error.message, 'error');
    }
  });
  const qualityNote = createElement(
    'p',
    'muted quality-note',
    'If internal playback looks soft, use External VLC Playback for great quality. The Play in VLC button opens the selected quality externally.'
  );

  const description = createElement('details', 'description-box');
  description.open = true;
  const summary = createElement('summary', '', 'Description');
  const descriptionBody = createElement('div');
  const facts = createElement('p', 'muted', `${video.views ? formatViews(video.views) : 'Views unavailable'} • ${video.uploadDate ? timeAgo(video.uploadDate) : 'Upload date unavailable'}`);
  const text = createElement('p', '', video.description || 'No description returned by yt-dlp.');
  const tags = createElement('div', 'tag-row');
  (video.tags || []).slice(0, 14).forEach((tag) => tags.appendChild(createElement('button', 'tag-pill', tag)));
  descriptionBody.append(facts, text, tags);
  description.append(summary, descriptionBody);

  main.append(playerBox, title, channelRow, actions, status, qualityRow, qualityNote, description);

  side.appendChild(createElement('h2', '', 'UP NEXT'));
  const related = await relatedVideos(video);
  if (related.length) {
    related.forEach((item) => side.appendChild(createVideoCard(item, { compact: true, onOpen: context.openVideo })));
  } else {
    side.appendChild(createElement('p', 'muted', 'Related videos appear after the home feed has been generated.'));
  }

  layout.append(main, side);
  root.appendChild(layout);

  startInternalPlayback(videoElement, audioElement, video, quality, status, context).catch((error) => {
    status.textContent = 'Internal playback unavailable. Use Play in VLC.';
    context.showBanner(error.message, 'error');
  });
}
