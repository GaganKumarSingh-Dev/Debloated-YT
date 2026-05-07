import { icon } from '../components/icons.js';
import { createVideoCard } from '../components/videoCard.js';
import { clear, createElement, escapeHtml, showContextMenu } from '../utils.js';

function channelRow(subscription, context) {
  const row = createElement('div', 'channel-row');
  row.innerHTML = `<div class="avatar">${escapeHtml((subscription.channelName || 'C').slice(0, 1).toUpperCase())}</div><div><strong>${escapeHtml(subscription.channelName)}</strong><p>${(subscription.videos || []).length} cached videos</p></div>`;
  const load = createElement('button', 'secondary-action small-action', 'Load More');
  load.type = 'button';
  load.addEventListener('click', async () => {
    load.disabled = true;
    load.textContent = 'Loading...';
    try {
      await window.api.loadSubscriptionBatch({
        offset: 0,
        limit: 24,
        channelDepth: Math.min(500, (subscription.videos || []).length + 60),
        force: true
      });
      context.navigate('subscriptions');
    } catch (error) {
      context.showBanner(error.message, 'error');
    }
  });
  const remove = createElement('button', 'icon-button', '');
  remove.type = 'button';
  remove.title = 'Unsubscribe';
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', async () => {
    if (confirm(`Unsubscribe from ${subscription.channelName}?`)) {
      await window.api.unsubscribe(subscription.channelId);
      context.showBanner('Channel removed from subscriptions.');
      context.navigate('subscriptions');
    }
  });
  const actions = createElement('div', 'channel-actions');
  actions.append(load, remove);
  row.appendChild(actions);
  return row;
}

function header(context) {
  const pageHeader = createElement('div', 'page-header discovery-header');
  const copy = createElement('div');
  copy.append(createElement('h1', '', 'SUBSCRIBED'), createElement('p', 'muted eyebrow', 'CHANNEL CACHE • SCROLL TO EXPAND'));

  const form = createElement('form', 'inline-form');
  const input = createElement('input');
  input.type = 'url';
  input.placeholder = 'Paste YouTube channel URL';
  input.required = true;
  const add = createElement('button', 'primary-action', 'Add Channel');
  add.type = 'submit';
  const refresh = createElement('button', 'secondary-action', 'Refresh');
  refresh.type = 'button';
  form.append(input, add, refresh);
  pageHeader.append(copy, form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    add.disabled = true;
    add.textContent = 'Adding...';
    try {
      await window.api.subscribe(input.value);
      input.value = '';
      context.showBanner('Channel added.');
      context.navigate('subscriptions');
    } catch (error) {
      context.showBanner(error.message, 'error');
    } finally {
      add.disabled = false;
      add.textContent = 'Add Channel';
    }
  });

  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    refresh.textContent = 'Refreshing...';
    try {
      const summary = await window.api.refreshSubs({ limit: 72 });
      context.showBanner(`Checked ${summary.checked} channel${summary.checked === 1 ? '' : 's'}.`);
      context.navigate('subscriptions');
    } catch (error) {
      context.showBanner(error.message, 'error');
    } finally {
      refresh.disabled = false;
      refresh.textContent = 'Refresh';
    }
  });

  return pageHeader;
}

export async function renderSubscriptions(root, context) {
  clear(root);
  root.className = 'content discovery-content';

  const layout = createElement('div', 'subscription-layout');
  const side = createElement('aside', 'subscription-side');
  side.appendChild(createElement('h2', '', 'Channels'));
  const channelList = createElement('div', 'channel-list');
  side.appendChild(channelList);

  const feed = createElement('section', 'subscription-feed');
  const feedTitle = createElement('h2', '', 'Latest Videos');
  const grid = createElement('div', 'video-grid discovery-grid');
  const loader = createElement('div', 'feed-loader');
  loader.innerHTML = '<div class="spinner"></div><span>Loading subscription cache...</span>';
  feed.append(feedTitle, grid, loader);
  layout.append(side, feed);
  root.append(header(context), layout);

  const state = {
    offset: 0,
    limit: 24,
    loading: false,
    done: false,
    knownIds: new Set()
  };

  const renderChannels = (subscriptions) => {
    channelList.replaceChildren();
    if (!subscriptions.length) {
      channelList.appendChild(createElement('p', 'muted', 'No channels subscribed yet.'));
      return;
    }
    subscriptions.forEach((subscription) => channelList.appendChild(channelRow(subscription, context)));
  };

  const appendVideos = (videos) => {
    videos.forEach((video) => {
      if (state.knownIds.has(video.videoId)) {
        return;
      }
      state.knownIds.add(video.videoId);
      grid.appendChild(createVideoCard(video, {
        onOpen: context.openVideo,
        onContextMenu: (event, item) => {
          showContextMenu([
            {
              label: `Unsubscribe from ${item.channelName}`,
              destructive: true,
              action: async () => {
                await window.api.unsubscribe(item.channelId);
                context.navigate('subscriptions');
              }
            }
          ], event.clientX, event.clientY);
        }
      }));
    });
  };

  const loadNext = async () => {
    if (state.loading || state.done) {
      return;
    }
    state.loading = true;
    loader.classList.remove('hidden');
    try {
      const batch = await window.api.loadSubscriptionBatch({
        offset: state.offset,
        limit: state.limit
      });
      renderChannels(batch.subscriptions || []);
      appendVideos(batch.videos || []);
      state.offset += (batch.videos || []).length;
      state.done = !batch.hasMore || !(batch.videos || []).length;
      if (!grid.children.length) {
        grid.after(createElement('div', 'empty-state', 'No subscription videos yet. Add a channel URL to populate this tab.'));
      }
    } catch (error) {
      context.showBanner(error.message || 'Subscription loading failed.', 'error');
      state.done = true;
    } finally {
      state.loading = false;
      loader.classList.toggle('hidden', state.done);
    }
  };

  const onScroll = () => {
    const remaining = root.scrollHeight - root.scrollTop - root.clientHeight;
    if (remaining < 900) {
      loadNext();
    }
  };
  root.addEventListener('scroll', onScroll);
  root.__cleanup = () => root.removeEventListener('scroll', onScroll);
  await loadNext();
}
