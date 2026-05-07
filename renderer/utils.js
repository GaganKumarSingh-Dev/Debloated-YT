export const INTERESTS = [
  { name: 'Technology', icon: 'monitor' },
  { name: 'AI', icon: 'brain' },
  { name: 'Gaming', icon: 'play' },
  { name: 'Music', icon: 'music' },
  { name: 'Movies', icon: 'film' },
  { name: 'Science', icon: 'flask' },
  { name: 'Space', icon: 'rocket' },
  { name: 'Sports', icon: 'activity' },
  { name: 'Travel', icon: 'map' },
  { name: 'Coding', icon: 'code' },
  { name: 'Cybersecurity', icon: 'lock' },
  { name: 'Nature', icon: 'leaf' },
  { name: 'History', icon: 'clock' },
  { name: 'Finance', icon: 'wallet' },
  { name: 'Business', icon: 'briefcase' },
  { name: 'Education', icon: 'book' },
  { name: 'Health', icon: 'heart' },
  { name: 'News', icon: 'news' },
  { name: 'Cooking', icon: 'utensils' },
  { name: 'Photography', icon: 'camera' },
  { name: 'Art', icon: 'brush' },
  { name: 'Design', icon: 'tune' },
  { name: 'Productivity', icon: 'check' },
  { name: 'Cars', icon: 'car' },
  { name: 'Podcasts', icon: 'podcast' },
  { name: 'Philosophy', icon: 'user' }
];

export const QUALITY_OPTIONS = ['Best Quality', '360p', '480p', '720p', '1080p', '1440p', '4K'];

export function clear(node) {
  if (typeof node.__cleanup === 'function') {
    node.__cleanup();
    node.__cleanup = null;
  }
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined && text !== null) {
    element.textContent = text;
  }
  return element;
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatViews(views) {
  const value = Number(views || 0);
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B views`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M views`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K views`;
  }
  return `${value.toLocaleString()} views`;
}

export function timeAgo(dateValue) {
  if (!dateValue) {
    return 'Unknown date';
  }
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) {
    return 'Unknown date';
  }
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function getVideoUrl(video) {
  if (!video) {
    return '';
  }
  return video.videoUrl || video.webpageUrl || video.webpage_url || video.url || (
    video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : ''
  );
}

export function isFreshCache(cache, config) {
  if (!cache || !cache.lastUpdated) {
    return false;
  }
  const age = Date.now() - new Date(cache.lastUpdated).getTime();
  const hours = Number(config.feedRefreshHours || config.cacheMaxAgeDays * 24 || 24);
  return age >= 0 && age < hours * 60 * 60 * 1000;
}

export function bytesToSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function showContextMenu(items, x, y) {
  document.querySelectorAll('.context-menu').forEach((menu) => menu.remove());
  const menu = createElement('div', 'context-menu');
  items.filter((item) => !item.hidden).forEach((item) => {
    const button = createElement('button', item.destructive ? 'danger' : '', item.label);
    button.type = 'button';
    button.addEventListener('click', () => {
      menu.remove();
      item.action();
    });
    menu.appendChild(button);
  });
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 12)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 12)}px`;
  const close = () => {
    menu.remove();
    window.removeEventListener('click', close);
    window.removeEventListener('blur', close);
  };
  setTimeout(() => {
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
  }, 0);
}

export function parseVideoId(input) {
  const value = String(input || '').trim();
  if (!value) {
    return '';
  }
  const match = value.match(/[?&]v=([^&]+)/) || value.match(/youtu\.be\/([^?]+)/) || value.match(/shorts\/([^?]+)/);
  return match ? match[1] : value;
}

export function statusLine(message, tone = 'muted') {
  const node = createElement('div', `status-line ${tone}`, message);
  return node;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showModal(title, bodyBuilder, actions = []) {
  document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.remove());
  const backdrop = createElement('div', 'modal-backdrop');
  const modal = createElement('section', 'modal-panel');
  const header = createElement('div', 'modal-header');
  header.appendChild(createElement('h2', '', title));
  const close = createElement('button', 'icon-button', 'X');
  close.type = 'button';
  close.title = 'Close';
  header.appendChild(close);
  const body = createElement('div', 'modal-body');
  const footer = createElement('div', 'modal-footer');
  const api = {
    body,
    footer,
    close: () => backdrop.remove()
  };
  if (typeof bodyBuilder === 'function') {
    bodyBuilder(api);
  } else if (bodyBuilder) {
    body.appendChild(bodyBuilder);
  }
  actions.forEach((action) => {
    const button = createElement('button', action.primary ? 'primary-action' : 'secondary-action', action.label);
    button.type = 'button';
    button.addEventListener('click', () => action.onClick(api));
    footer.appendChild(button);
  });
  close.addEventListener('click', api.close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      api.close();
    }
  });
  modal.append(header, body, footer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  const firstInput = modal.querySelector('input, select, button');
  if (firstInput) {
    firstInput.focus();
  }
  return api;
}
