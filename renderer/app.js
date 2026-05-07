import { renderSidebar } from './components/sidebar.js';
import { renderTopbar } from './components/topbar.js';
import { renderOnboarding } from './pages/onboarding.js';
import { renderHome } from './pages/home.js';
import { renderSubscriptions } from './pages/subscriptions.js';
import { renderHistory } from './pages/history.js';
import { renderPlaylists } from './pages/playlists.js';
import { renderPlayer } from './pages/player.js';
import { renderSettings } from './pages/settings.js';

const topbar = document.getElementById('topbar');
const sidebar = document.getElementById('sidebar');
const content = document.getElementById('content');
const banner = document.getElementById('banner');

const state = {
  route: 'home',
  params: {},
  config: null,
  runtimePaths: null
};

function showBanner(message, tone = 'info') {
  banner.textContent = message;
  banner.className = `banner ${tone}`;
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => {
    banner.className = 'banner hidden';
  }, tone === 'error' ? 7000 : 3800);
}

function setShellVisible(visible) {
  document.body.classList.toggle('shell-hidden', !visible);
}

function activeRoute(route) {
  if (route === 'player' || route === 'onboarding') {
    return state.previousRoute || 'home';
  }
  return route;
}

function renderChrome() {
  renderTopbar(topbar, {
    onNavigate: (route) => navigate(route),
    onSearch: (query) => navigate('home', { searchQuery: query })
  });
  renderSidebar(sidebar, activeRoute(state.route), {
    onNavigate: (route) => navigate(route)
  });
}

function context() {
  return {
    state,
    config: state.config,
    showBanner,
    navigate,
    openVideo: (video) => navigate('player', { video }),
    refreshConfig: async () => {
      state.config = await window.api.getConfig();
      return state.config;
    }
  };
}

async function navigate(route, params = {}) {
  state.previousRoute = ['player', 'onboarding'].includes(route) ? state.route : route;
  state.route = route;
  state.params = params;
  renderChrome();

  if (route === 'onboarding') {
    setShellVisible(false);
    renderOnboarding(content, {
      config: state.config,
      onComplete: (config) => {
        state.config = config;
        setShellVisible(true);
        navigate(params.returnRoute || 'home');
      }
    });
    return;
  }

  setShellVisible(true);
  if (route === 'home') {
    await renderHome(content, context());
  } else if (route === 'subscriptions') {
    await renderSubscriptions(content, context());
  } else if (route === 'history') {
    await renderHistory(content, context());
  } else if (route === 'playlists') {
    await renderPlaylists(content, context());
  } else if (route === 'player') {
    await renderPlayer(content, context());
  } else if (route === 'settings') {
    await renderSettings(content, context());
  }
}

async function validateTools() {
  const result = await window.api.validateTools();
  const missing = [];
  if (!result.ytdlp) {
    missing.push('yt-dlp');
  }
  if (!result.vlc) {
    missing.push('VLC');
  }
  if (!result.ffmpeg) {
    missing.push('ffmpeg');
  }
  if (missing.length) {
    showBanner(`${missing.join(', ')} path needs attention. Open Settings before playback.`, 'error');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  state.runtimePaths = await window.api.getRuntimePaths();
  state.config = await window.api.getConfig();
  window.api.onSubscriptionsRefreshed((summary) => {
    if (summary.errors && summary.errors.length) {
      showBanner(`Subscription refresh completed with ${summary.errors.length} error${summary.errors.length === 1 ? '' : 's'}.`, 'error');
    } else if (summary.checked) {
      showBanner(`Subscriptions refreshed: ${summary.checked} checked.`);
    }
  });
  renderChrome();
  if (state.config.firstLaunch) {
    await navigate('onboarding');
  } else {
    await navigate('home');
  }
  validateTools();
});
