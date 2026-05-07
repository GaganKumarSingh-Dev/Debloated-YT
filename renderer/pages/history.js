import { icon } from '../components/icons.js';
import { clear, createElement, escapeHtml, formatDuration, showContextMenu, timeAgo } from '../utils.js';

function groupLabel(dateValue) {
  const watched = new Date(dateValue);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86400000;
  const time = watched.getTime();
  if (time >= startToday) {
    return 'Today';
  }
  if (time >= startYesterday) {
    return 'Yesterday';
  }
  if (Date.now() - time < 7 * 86400000) {
    return 'This Week';
  }
  return 'Older';
}

function cutoffFor(value) {
  const now = Date.now();
  if (value === 'hour') {
    return new Date(now - 60 * 60 * 1000).toISOString();
  }
  if (value === 'day') {
    return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  }
  if (value === 'week') {
    return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (value === 'month') {
    return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

function historyRow(entry, context, playlists) {
  const row = createElement('div', 'history-row');
  const open = createElement('button', 'history-open');
  open.type = 'button';
  open.innerHTML = `
    <div class="history-thumb"><span>${icon('play')}</span></div>
    <div class="history-copy">
      <strong>${escapeHtml(entry.title)}</strong>
      <p>${escapeHtml(entry.channelName)} • watched ${timeAgo(entry.watchedAt)} • ${formatDuration(entry.duration)}</p>
    </div>
  `;
  const imagePath = entry.thumbnail && !/^https?:\/\//i.test(entry.thumbnail) ? entry.thumbnail : '';
  if (imagePath) {
    const thumb = open.querySelector('.history-thumb');
    thumb.style.backgroundImage = `url("${window.api.toFileUrl(imagePath)}")`;
    thumb.classList.add('has-image');
  }
  open.addEventListener('click', () => context.openVideo(entry));
  open.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showContextMenu([
      {
        label: 'Remove from history',
        destructive: true,
        action: async () => {
          await window.api.removeFromHistory(entry.videoId);
          context.navigate('history');
        }
      },
      ...playlists.map((playlist) => ({
        label: `Add to ${playlist.name}`,
        action: async () => {
          await window.api.addToPlaylist({ playlistId: playlist.id, videoId: entry.videoId });
          context.showBanner(`Added to ${playlist.name}.`);
        }
      }))
    ], event.clientX, event.clientY);
  });

  const remove = createElement('button', 'icon-button history-delete', '');
  remove.type = 'button';
  remove.title = 'Delete this history item';
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', async () => {
    await window.api.removeFromHistory(entry.videoId);
    context.navigate('history');
  });
  row.append(open, remove);
  return row;
}

export async function renderHistory(root, context) {
  clear(root);
  root.className = 'content';
  const [history, playlists] = await Promise.all([
    window.api.getHistory(),
    window.api.getPlaylists()
  ]);

  const header = createElement('div', 'page-header discovery-header');
  const copy = createElement('div');
  copy.append(createElement('h1', '', 'HISTORY'), createElement('p', 'muted eyebrow', 'LOCAL WATCH HISTORY'));

  const controls = createElement('div', 'history-controls');
  const duration = createElement('select');
  duration.innerHTML = `
    <option value="hour">Last one hour</option>
    <option value="day">Last 24 hours</option>
    <option value="week">Last 7 days</option>
    <option value="month">Last 30 days</option>
  `;
  const deleteRange = createElement('button', 'secondary-action danger', 'Delete Range');
  deleteRange.type = 'button';
  deleteRange.disabled = !history.length;
  deleteRange.addEventListener('click', async () => {
    const label = duration.options[duration.selectedIndex].textContent;
    if (!confirm(`Delete history from ${label}?`)) {
      return;
    }
    await window.api.clearHistorySince(cutoffFor(duration.value));
    context.navigate('history');
  });
  const clearButton = createElement('button', 'secondary-action danger', 'Clear All');
  clearButton.type = 'button';
  clearButton.disabled = !history.length;
  clearButton.addEventListener('click', async () => {
    if (confirm('Clear all watch history?')) {
      await window.api.clearHistory();
      context.navigate('history');
    }
  });
  controls.append(duration, deleteRange, clearButton);
  header.append(copy, controls);
  root.appendChild(header);

  if (!history.length) {
    const empty = createElement('div', 'empty-state');
    empty.innerHTML = `${icon('clock')}<p>History is empty. Videos you watch will appear here to help the algorithm.</p>`;
    root.appendChild(empty);
    return;
  }

  const groups = new Map();
  history.forEach((entry) => {
    const label = groupLabel(entry.watchedAt);
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(entry);
  });

  groups.forEach((items, label) => {
    const section = createElement('section', 'history-group');
    section.appendChild(createElement('h2', '', label));
    items.forEach((entry) => section.appendChild(historyRow(entry, context, playlists)));
    root.appendChild(section);
  });
}
