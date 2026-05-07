import { icon } from './icons.js';

const topItems = [
  { id: 'home', label: 'Discovery', icon: 'home' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'subscriptions', label: 'Subscribed', icon: 'subscriptions' },
  { id: 'playlists', label: 'Playlist', icon: 'playlists' }
];

const bottomItems = [
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

function navButton(item, active, handlers) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `sidebar-item${active === item.id ? ' active' : ''}${item.danger ? ' danger' : ''}`;
  button.innerHTML = `${icon(item.icon)}<span>${item.label}</span>`;
  button.addEventListener('click', () => handlers.onNavigate(item.id));
  return button;
}

export function renderSidebar(container, active, handlers) {
  container.replaceChildren();
  const brand = document.createElement('button');
  brand.type = 'button';
  brand.className = 'sidebar-brand';
  brand.innerHTML = '<img src="../assets/logo.svg" alt="Debloated YT">';
  brand.addEventListener('click', () => handlers.onNavigate('home'));
  const nav = document.createElement('nav');
  topItems.forEach((item) => nav.appendChild(navButton(item, active, handlers)));
  const bottom = document.createElement('div');
  bottom.className = 'sidebar-bottom';
  bottomItems.forEach((item) => bottom.appendChild(navButton(item, active, handlers)));
  const top = document.createElement('div');
  top.append(brand, nav);
  container.append(top, bottom);
}
