// Shared behavior for extension pages only; never modifies the host webpage.
import './locale.js';
export function initializeTabs(selector, activate) {
  const tabs = [...document.querySelectorAll(selector)];
  const select = tab => {
    activate(tab);
    for (const item of tabs) {
      const selected = item === tab;
      item.tabIndex = selected ? 0 : -1;
      item.setAttribute('aria-selected', String(selected));
    }
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const vertical = tab.closest('[role=tablist]')?.getAttribute('aria-orientation') === 'vertical';
      const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
      const following = vertical ? 'ArrowDown' : 'ArrowRight';
      if (![previous, following, 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === following ? 1 : -1) + tabs.length) % tabs.length;
      select(tabs[next]);
      tabs[next].focus();
    });
  }
  if (tabs.length) select(tabs.find(tab => tab.classList.contains('isActive')) || tabs[0]);
}

document.documentElement.lang = (globalThis.EasyReadLocale || chrome.i18n).getUILanguage();
document.addEventListener('keydown', () => document.documentElement.dataset.keyboard = 'true');
document.addEventListener('pointerdown', () => delete document.documentElement.dataset.keyboard);
