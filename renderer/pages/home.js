import { icon } from '../components/icons.js';
import { createVideoCard, createVideoGrid } from '../components/videoCard.js';
import { clear, createElement, escapeHtml } from '../utils.js';

function sectionHeader(title, subtitle, actions = []) {
  const header = createElement('div', 'page-header discovery-header');
  const copy = createElement('div');
  copy.append(createElement('h1', '', title));
  if (subtitle) {
    copy.append(createElement('p', 'muted eyebrow', subtitle));
  }
  const actionRow = createElement('div', 'header-actions');
  actions.forEach((action) => actionRow.appendChild(action));
  header.append(copy, actionRow);
  return header;
}

function loadingRow(message) {
  const node = createElement('div', 'feed-loader');
  node.innerHTML = `<div class="spinner"></div><span>${escapeHtml(message)}</span>`;
  return node;
}

function emptyState(message) {
  const empty = createElement('div', 'empty-state');
  empty.innerHTML = `${icon('search')}<p>${escapeHtml(message)}</p>`;
  return empty;
}

async function renderSearch(root, context, query) {
  clear(root);
  root.className = 'content';
  root.appendChild(sectionHeader('SEARCH', `QUERY • ${query}`));
  const loader = loadingRow('Searching via yt-dlp...');
  root.appendChild(loader);

  try {
    const results = await window.api.search(query, 36);
    loader.remove();
    if (results.length) {
      root.appendChild(createVideoGrid(results, { onOpen: context.openVideo }));
    } else {
      root.appendChild(emptyState('No results found. Try a different query.'));
    }
  } catch (error) {
    loader.remove();
    root.appendChild(emptyState(error.message || 'Unable to search. Check the yt-dlp path in Settings.'));
  }
}

async function renderInfiniteFeed(root, context) {
  clear(root);
  root.className = 'content discovery-content';

  const refreshButton = createElement('button', 'secondary-action', 'Refresh Feed');
  refreshButton.type = 'button';

  const grid = createElement('div', 'video-grid discovery-grid');
  const loader = loadingRow('Preparing local recommendation batch...');
  const sentinel = createElement('div', 'scroll-sentinel');
  const state = {
    offset: 0,
    limit: 24,
    loading: false,
    done: false,
    knownIds: new Set()
  };

  root.append(
    sectionHeader('DISCOVERY', 'LOCAL SCRAPED DATA • INFINITE INTEREST FEED', [refreshButton]),
    grid,
    loader,
    sentinel
  );

  const appendVideos = (videos) => {
    videos.forEach((video) => {
      if (state.knownIds.has(video.videoId)) {
        return;
      }
      state.knownIds.add(video.videoId);
      grid.appendChild(createVideoCard(video, {
        onOpen: context.openVideo,
        actions: [
          {
            label: 'Not Interested',
            title: 'Remove this video and lower similar recommendations',
            onClick: async (item, card) => {
              card.remove();
              await window.api.markNotInterested(item);
              context.showBanner('Removed from Discovery.');
            }
          },
          {
            label: 'Hide Channel',
            title: "Don't show content from this channel",
            onClick: async (item) => {
              await window.api.hideDiscoveryChannel(item);
              const channelId = item.channelId || '';
              const channelName = String(item.channelName || '').toLowerCase();
              grid.querySelectorAll('.video-card').forEach((card) => {
                if ((channelId && card.dataset.channelId === channelId) ||
                  (channelName && card.dataset.channelName === channelName)) {
                  card.remove();
                }
              });
              context.showBanner("Won't show this channel in Discovery.");
            }
          }
        ]
      }));
    });
  };

  const loadNext = async (force = false) => {
    if (state.loading || (state.done && !force)) {
      return;
    }
    state.loading = true;
    loader.classList.remove('hidden');
    loader.querySelector('span').textContent = force ? 'Refreshing feed...' : 'Fetching more videos...';
    try {
      const batch = await window.api.loadFeedBatch({
        offset: force ? 0 : state.offset,
        limit: state.limit,
        force
      });
      if (force) {
        state.offset = 0;
        state.done = false;
        state.knownIds.clear();
        grid.replaceChildren();
      }
      appendVideos(batch.videos || []);
      state.offset += (batch.videos || []).length;
      state.done = !batch.hasMore || !(batch.videos || []).length;
      if (!grid.children.length) {
        grid.after(emptyState('No videos found. Re-select interests or check the yt-dlp path in Settings.'));
      }
    } catch (error) {
      context.showBanner(error.message || 'Feed loading failed.', 'error');
      state.done = true;
    } finally {
      state.loading = false;
      loader.classList.toggle('hidden', state.done);
      if (state.done && grid.children.length) {
        loader.querySelector('span').textContent = 'End of current local index.';
      }
    }
  };

  const onScroll = () => {
    const remaining = root.scrollHeight - root.scrollTop - root.clientHeight;
    if (remaining < 900) {
      loadNext();
    }
  };

  refreshButton.addEventListener('click', () => loadNext(true));
  root.addEventListener('scroll', onScroll);
  root.__cleanup = () => root.removeEventListener('scroll', onScroll);

  const unsubscribe = window.api.onFeedProgress((payload) => {
    const span = loader.querySelector('span');
    if (span) {
      span.textContent = payload.message;
    }
  });
  const cleanup = root.__cleanup;
  root.__cleanup = () => {
    cleanup();
    unsubscribe();
  };

  await loadNext();
}

export async function renderHome(root, context) {
  if (context.state.params.searchQuery) {
    await renderSearch(root, context, context.state.params.searchQuery);
    return;
  }
  await renderInfiniteFeed(root, context);
}
