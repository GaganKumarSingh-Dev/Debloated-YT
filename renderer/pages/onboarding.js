import { icon } from '../components/icons.js';
import { INTERESTS, clear, createElement } from '../utils.js';

const BLOCKED_CUSTOM_WORDS = [
  'sex',
  'porn',
  'nude',
  'naked',
  'xxx',
  'hentai',
  'onlyfans',
  'rape',
  'incest',
  'slur'
];

function normalizeInterest(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function keyForInterest(value) {
  return normalizeInterest(value).toLowerCase();
}

function isSafeCustomInterest(value) {
  const normalized = normalizeInterest(value);
  const lowered = normalized.toLowerCase();
  if (!/^[a-z0-9][a-z0-9 +#&.-]{1,38}$/i.test(normalized)) {
    return false;
  }
  return !BLOCKED_CUSTOM_WORDS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lowered));
}

export function renderOnboarding(root, context) {
  clear(root);
  root.className = 'content onboarding-content';

  const selected = new Set((context.config.interests || []).map(normalizeInterest).filter(Boolean));
  const builtinByKey = new Map(INTERESTS.map((interest) => [keyForInterest(interest.name), interest]));
  const cardsByKey = new Map();
  const findSelectedName = (name) => Array.from(selected).find((item) => keyForInterest(item) === keyForInterest(name));
  const isSelected = (name) => Boolean(findSelectedName(name));
  const addSelected = (name) => {
    const existing = findSelectedName(name);
    if (existing) {
      selected.delete(existing);
    }
    selected.add(normalizeInterest(name));
  };
  const removeSelected = (name) => {
    const existing = findSelectedName(name);
    if (existing) {
      selected.delete(existing);
    }
  };
  const screen = createElement('section', 'onboarding-screen');
  const logo = createElement('div', 'onboarding-logo');
  logo.innerHTML = '<img src="../assets/logo.svg" alt="Debloated YT">';
  const heading = createElement('h1', '', 'Personalize Your Feed');
  const subtext = createElement('p', 'muted centered', 'Select at least 3 interests. No login needed - your data stays on your machine.');

  const grid = createElement('div', 'interest-grid');
  const footer = createElement('div', 'onboarding-actions');
  const button = createElement('button', 'primary-action', '');
  button.type = 'button';

  const updateButton = () => {
    const remaining = Math.max(0, 3 - selected.size);
    button.textContent = remaining ? `Select ${remaining} more` : 'Start Exploring';
    button.disabled = remaining > 0;
  };

  const setCardSelected = (name, isSelected) => {
    const card = cardsByKey.get(keyForInterest(name));
    if (card) {
      card.classList.toggle('selected', isSelected);
    }
  };

  const renderInterest = (interest, options = {}) => {
    const name = normalizeInterest(interest.name);
    const key = keyForInterest(name);
    if (!name || cardsByKey.has(key)) {
      return cardsByKey.get(key) || null;
    }
    const card = createElement('button', `interest-card${isSelected(name) ? ' selected' : ''}`);
    card.classList.toggle('custom-interest-card', Boolean(options.custom));
    card.type = 'button';
    const label = createElement('span', '', name);
    card.innerHTML = icon(interest.icon || 'plus');
    card.appendChild(label);
    card.addEventListener('click', () => {
      if (isSelected(name)) {
        removeSelected(name);
      } else {
        addSelected(name);
      }
      card.classList.toggle('selected', isSelected(name));
      updateButton();
    });
    cardsByKey.set(key, card);
    grid.appendChild(card);
    setCardSelected(name, isSelected(name));
    return card;
  };

  INTERESTS.forEach(renderInterest);
  selected.forEach((name) => {
    if (!builtinByKey.has(keyForInterest(name))) {
      renderInterest({ name, icon: 'plus' }, { custom: true });
    }
  });

  const custom = createElement('form', 'custom-interest-form');
  const customInput = createElement('input');
  customInput.placeholder = 'Add custom interest';
  customInput.maxLength = 40;
  const customButton = createElement('button', 'secondary-action', 'Add');
  customButton.type = 'submit';
  const customMessage = createElement('p', 'muted custom-interest-message', '');
  custom.append(customInput, customButton, customMessage);
  custom.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = normalizeInterest(customInput.value);
    if (!isSafeCustomInterest(value)) {
      customMessage.textContent = 'Use a clean topic name with letters, numbers, spaces, +, #, &, dot, or dash.';
      return;
    }
    const key = keyForInterest(value);
    const existingBuiltin = builtinByKey.get(key);
    if (existingBuiltin) {
      addSelected(existingBuiltin.name);
      setCardSelected(existingBuiltin.name, true);
      customInput.value = '';
      customMessage.textContent = `${existingBuiltin.name} selected.`;
      updateButton();
      return;
    }
    const existingSelected = findSelectedName(value);
    if (existingSelected) {
      setCardSelected(existingSelected, true);
      customMessage.textContent = 'That custom interest is already selected.';
      return;
    }
    addSelected(value);
    renderInterest({ name: value, icon: 'plus' }, { custom: true });
    setCardSelected(value, true);
    customInput.value = '';
    customMessage.textContent = 'Custom interest added.';
    updateButton();
  });

  button.addEventListener('click', async () => {
    const interests = Array.from(selected);
    const config = await window.api.saveConfig({
      ...context.config,
      interests,
      firstLaunch: false
    });
    context.onComplete(config);
  });

  updateButton();
  footer.appendChild(button);
  screen.append(logo, heading, subtext, custom, grid, footer);
  root.appendChild(screen);
}
