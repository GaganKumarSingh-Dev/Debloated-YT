import { INTERESTS, QUALITY_OPTIONS, bytesToSize, clear, createElement } from '../utils.js';

function field(label, input) {
  const wrapper = createElement('label', 'field');
  wrapper.append(createElement('span', '', label), input);
  return wrapper;
}

function pathField(label, value, browseTitle) {
  const row = createElement('div', 'path-field');
  const input = createElement('input');
  input.type = 'text';
  input.value = value || '';
  const browse = createElement('button', 'secondary-action', 'Browse');
  browse.type = 'button';
  browse.addEventListener('click', async () => {
    const selected = await window.api.browseExecutable(browseTitle);
    if (selected) {
      input.value = selected;
    }
  });
  row.append(input, browse);
  return { row, input };
}

function selectField(options, selected) {
  const select = createElement('select');
  options.forEach((optionValue) => {
    const option = createElement('option');
    option.value = optionValue.value || optionValue;
    option.textContent = optionValue.label || optionValue;
    select.appendChild(option);
  });
  select.value = selected;
  return select;
}

function selectedInterestSummary(config) {
  const interests = config.interests && config.interests.length ? config.interests : INTERESTS.slice(0, 3).map((item) => item.name);
  return interests.join(', ');
}

export async function renderSettings(root, context) {
  clear(root);
  root.className = 'content settings-content';
  const config = await window.api.getConfig();
  const cache = await window.api.getCacheInfo();

  const header = createElement('div', 'page-header');
  const copy = createElement('div');
  copy.append(createElement('h1', '', 'SETTINGS'), createElement('p', 'muted eyebrow', 'LOCAL CONFIGURATION'));
  const save = createElement('button', 'primary-action', 'Save Settings');
  save.type = 'submit';
  header.append(copy, save);

  const form = createElement('form', 'settings-form');
  const ytdlp = pathField('yt-dlp path', config.ytdlpPath, 'Select yt-dlp.exe');
  const vlc = pathField('VLC path', config.vlcPath, 'Select vlc.exe');
  const ffmpeg = pathField('ffmpeg path', config.ffmpegPath, 'Select ffmpeg.exe');

  const quality = selectField(QUALITY_OPTIONS, config.defaultQuality);
  const refresh = selectField([
    { label: '12 hours', value: '12' },
    { label: '24 hours', value: '24' },
    { label: '48 hours', value: '48' }
  ], String(config.feedRefreshHours || config.cacheMaxAgeDays * 24 || 24));
  const autoRefresh = createElement('input');
  autoRefresh.type = 'checkbox';
  autoRefresh.checked = Boolean(config.autoRefreshSubscriptions);

  form.append(
    header,
    field('yt-dlp path', ytdlp.row),
    field('VLC path', vlc.row),
    field('ffmpeg path', ffmpeg.row),
    field('Default quality', quality),
    field('Feed refresh interval', refresh)
  );

  const toggle = createElement('label', 'toggle-field');
  toggle.append(autoRefresh, createElement('span', '', 'Auto-refresh subscriptions on launch'));
  form.appendChild(toggle);

  const interestPanel = createElement('section', 'settings-panel');
  interestPanel.append(createElement('h2', '', 'Interests'), createElement('p', 'muted', selectedInterestSummary(config)));
  const reselect = createElement('button', 'secondary-action', 'Re-select Interests');
  reselect.type = 'button';
  reselect.addEventListener('click', () => context.navigate('onboarding', { returnRoute: 'settings' }));
  interestPanel.appendChild(reselect);
  form.appendChild(interestPanel);

  const cachePanel = createElement('section', 'settings-panel');
  cachePanel.append(createElement('h2', '', 'Cache'), createElement('p', 'muted', `Thumbnail cache: ${bytesToSize(cache.thumbnailBytes)}. Subtitles: ${bytesToSize(cache.subtitleBytes)}.`));
  const clearCache = createElement('button', 'secondary-action danger', 'Clear thumbnail cache');
  clearCache.type = 'button';
  clearCache.addEventListener('click', async () => {
    await window.api.clearCache();
    context.showBanner('Thumbnail cache cleared.');
    context.navigate('settings');
  });
  cachePanel.appendChild(clearCache);
  form.appendChild(cachePanel);

  const legal = createElement('section', 'settings-panel legal');
  legal.append(
    createElement('h2', '', 'Legal'),
    createElement('p', '', "Debloated YT does not download, store, or redistribute YouTube content. It is a personal streaming interface for publicly available content. Use is subject to YouTube's Terms of Service. yt-dlp and VLC are separate tools not bundled with this application. The developer is not responsible for misuse.")
  );
  form.appendChild(legal);

  const resetPanel = createElement('section', 'settings-panel');
  resetPanel.append(
    createElement('h2', '', 'Reset App'),
    createElement('p', 'muted', 'Clears local config, history, subscriptions, playlists, and cache.')
  );
  const reset = createElement('button', 'secondary-action danger', 'Reset App');
  reset.type = 'button';
  reset.addEventListener('click', async () => {
    if (!confirm('Reset Debloated YT? This clears all local app data.')) {
      return;
    }
    await window.api.resetApp();
  });
  resetPanel.appendChild(reset);
  form.appendChild(resetPanel);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const next = await window.api.saveConfig({
      ...config,
      ytdlpPath: ytdlp.input.value.trim(),
      vlcPath: vlc.input.value.trim(),
      ffmpegPath: ffmpeg.input.value.trim(),
      defaultQuality: quality.value,
      feedRefreshHours: Number(refresh.value),
      cacheMaxAgeDays: Number(refresh.value) / 24,
      autoRefreshSubscriptions: autoRefresh.checked
    });
    context.config = next;
    context.state.config = next;
    context.showBanner('Settings saved.');
  });

  root.appendChild(form);
}
