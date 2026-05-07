import { icon } from './icons.js';

export function renderTopbar(container, handlers) {
  container.replaceChildren();

  const brand = document.createElement('button');
  brand.type = 'button';
  brand.className = 'brand';
  brand.innerHTML = '<img src="../assets/logo.svg" alt="Debloated YT">';
  brand.addEventListener('click', () => handlers.onNavigate('home'));

  const form = document.createElement('form');
  form.className = 'search-form';
  form.innerHTML = `${icon('search')}<input type="search" placeholder="QUERY LOCAL INDEX..." autocomplete="off">`;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    const query = input.value.trim();
    if (query) {
      handlers.onSearch(query);
    }
  });

  const status = document.createElement('div');
  status.className = 'local-status';
  status.innerHTML = '<span class="status-dot"></span><span>SECURE_LOCAL_MODE</span>';

  const controls = document.createElement('div');
  controls.className = 'window-controls';
  const minimize = document.createElement('button');
  minimize.type = 'button';
  minimize.textContent = '−';
  minimize.title = 'Minimize';
  minimize.addEventListener('click', () => window.api.windowMinimize());
  const maximize = document.createElement('button');
  maximize.type = 'button';
  maximize.textContent = '□';
  maximize.title = 'Maximize';
  maximize.addEventListener('click', () => window.api.windowMaximize());
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Close';
  close.className = 'close';
  close.addEventListener('click', () => window.api.windowClose());
  controls.append(minimize, maximize, close);

  container.append(brand, form, status, controls);
}
