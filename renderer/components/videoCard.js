import { icon } from './icons.js';
import { createElement, formatDuration, formatViews, getVideoUrl, timeAgo } from '../utils.js';

function setImageSource(img, video, placeholder) {
  const source = video.thumbnail || video.thumbnailUrl || '';
  const setFallback = () => {
    if (/^https?:\/\//i.test(source)) {
      img.src = source;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
    }
  };

  if (source && !/^https?:\/\//i.test(source)) {
    img.src = window.api.toFileUrl(source);
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else if (/^https?:\/\//i.test(source)) {
    setFallback();
  }

  if (video.videoId && (video.thumbnailUrl || /^https?:\/\//i.test(source))) {
    window.api.cacheThumbnail({
      videoId: video.videoId,
      thumbnailUrl: video.thumbnailUrl || source,
      thumbnail: source
    }).then((filePath) => {
      if (filePath) {
        img.src = window.api.toFileUrl(filePath);
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
      } else {
        setFallback();
      }
    }).catch(setFallback);
  } else {
    setFallback();
  }

  img.addEventListener('error', () => {
    img.classList.add('hidden');
    placeholder.classList.remove('hidden');
  });
}

export function createVideoCard(video, options = {}) {
  const card = createElement('article', options.compact ? 'video-card compact' : 'video-card');
  card.tabIndex = 0;
  card.role = 'button';
  card.title = video.title || 'Open video';
  if (video.videoId) {
    card.dataset.videoId = video.videoId;
  }
  if (video.channelId) {
    card.dataset.channelId = video.channelId;
  }
  if (video.channelName) {
    card.dataset.channelName = video.channelName.toLowerCase();
  }

  const thumb = createElement('div', 'thumbnail');
  const placeholder = createElement('div', 'thumbnail-placeholder');
  placeholder.innerHTML = icon('play');
  const img = createElement('img', 'hidden');
  img.alt = video.title || 'Video thumbnail';
  thumb.append(placeholder, img);

  if (video.duration) {
    thumb.appendChild(createElement('span', 'duration-badge', formatDuration(video.duration)));
  }

  const body = createElement('div', 'video-card-body');
  const title = createElement('div', 'video-title', video.title || 'Untitled video');
  const meta = createElement('div', 'video-meta');
  meta.textContent = [
    video.channelName || 'Unknown channel',
    video.uploadDate ? timeAgo(video.uploadDate) : '',
    video.views ? formatViews(video.views) : ''
  ].filter(Boolean).join(' · ');
  body.append(title, meta);

  if (!options.compact && Array.isArray(options.actions) && options.actions.length) {
    const actionRow = createElement('div', 'video-card-actions');
    options.actions.forEach((action) => {
      const button = createElement('button', action.className || 'tiny-card-action', action.label);
      button.type = 'button';
      button.title = action.title || action.label;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        action.onClick(video, card);
      });
      actionRow.appendChild(button);
    });
    body.appendChild(actionRow);
  }

  card.append(thumb, body);
  card.addEventListener('click', () => options.onOpen && options.onOpen({
    ...video,
    videoUrl: getVideoUrl(video)
  }));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      options.onOpen && options.onOpen({
        ...video,
        videoUrl: getVideoUrl(video)
      });
    }
  });
  if (options.onContextMenu) {
    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      options.onContextMenu(event, video);
    });
  }
  setImageSource(img, video, placeholder);
  return card;
}

export function createVideoGrid(videos, options = {}) {
  const grid = createElement('div', options.compact ? 'video-grid compact-grid' : 'video-grid');
  (videos || []).forEach((video) => grid.appendChild(createVideoCard(video, options)));
  return grid;
}
