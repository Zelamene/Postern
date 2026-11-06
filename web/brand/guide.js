import '@fontsource-variable/manrope';

const root = document.documentElement;
const styles = getComputedStyle(root);

const token = (name) => styles.getPropertyValue(name).trim();

function toHex(value) {
  const v = value.trim().toLowerCase();
  if (v.startsWith('#')) {
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
    return v.slice(0, 7);
  }
  const match = v.match(/rgba?\(([^)]+)\)/);
  if (!match) return v;
  const [r, g, b] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function auditTokens() {
  const swatches = [...document.querySelectorAll('.swatch[data-token]')];
  const mismatches = [];

  for (const swatch of swatches) {
    const claimed = toHex(swatch.dataset.hex ?? '');
    const live = toHex(token(swatch.dataset.token));
    if (claimed !== live) {
      mismatches.push(`${swatch.dataset.token}: doc ${claimed} / code ${live}`);
    }
  }

  const badge = document.getElementById('token-audit');
  const count = document.getElementById('token-audit-count');

  if (!badge) return;

  if (mismatches.length === 0) {
    badge.textContent = `${swatches.length}/${swatches.length} tokens match`;
    badge.dataset.state = 'pass';
    if (count) count.textContent = `${swatches.length}/${swatches.length} in sync`;
  } else {
    badge.textContent = `${mismatches.length} token mismatch`;
    badge.dataset.state = 'fail';
    if (count) count.textContent = `${mismatches.length} out of sync`;
    console.warn('[brand guide] token drift:', mismatches);
  }
}

function initScrollSpy() {
  const links = [...document.querySelectorAll('.rail__list a')];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if (!sections.length) return;

  const setCurrent = (id) => {
    for (const link of links) {
      link.setAttribute('aria-current', link.getAttribute('href') === `#${id}` ? 'true' : 'false');
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setCurrent(visible[0].target.id);
    },
    { rootMargin: '-20% 0px -65% 0px', threshold: 0 },
  );

  for (const section of sections) observer.observe(section);
  setCurrent(sections[0].id);
}

function initReveal() {
  const items = [...document.querySelectorAll('.reveal')];
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    for (const item of items) item.classList.add('is-in');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
  );

  for (const item of items) observer.observe(item);
}

const ICONS = {
  success:
    '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  danger:
    '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  plain:
    '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
};

function toast(message, tone = 'plain') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;

  const el = document.createElement('div');
  el.className = tone === 'plain' ? 'toast' : `toast toast--${tone}`;
  el.innerHTML = `${ICONS[tone] ?? ICONS.plain}<p>${message}</p>`;
  stack.append(el);

  window.setTimeout(() => {
    el.style.transition = 'opacity 200ms var(--ease-standard), transform 200ms var(--ease-standard)';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    window.setTimeout(() => el.remove(), 220);
  }, 3200);
}

function initCopy() {
  const copyButtons = document.querySelectorAll('[data-copy]');
  for (const button of copyButtons) {
    button.addEventListener('click', async () => {
      const value = button.dataset.copy;
      try {
        await navigator.clipboard.writeText(value);
        toast('Address copied', 'success');
      } catch {
        toast('Could not copy — select the address and copy manually', 'danger');
      }
    });
  }

  for (const swatch of document.querySelectorAll('.swatch')) {
    swatch.addEventListener('click', async () => {
      const hex = swatch.dataset.hex;
      try {
        await navigator.clipboard.writeText(hex);
        toast(`${hex} copied`, 'success');
      } catch {

      }
    });
  }
}

function initDialogs() {
  for (const trigger of document.querySelectorAll('[data-open]')) {
    trigger.addEventListener('click', () => {
      const dialog = document.getElementById(trigger.dataset.open);
      if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
    });
  }

  for (const closer of document.querySelectorAll('[data-close]')) {
    closer.addEventListener('click', () => closer.closest('dialog')?.close());
  }

  for (const dialog of document.querySelectorAll('dialog.dialog')) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
}

function initToastDemo() {
  const messages = {
    success: 'Address copied',
    danger: 'That change was not saved. Try again.',
    plain: 'Activity will refresh in a moment.',
  };

  for (const trigger of document.querySelectorAll('[data-toast]')) {
    trigger.addEventListener('click', () => {
      const tone = trigger.dataset.toast;
      toast(messages[tone] ?? messages.plain, tone);
    });
  }
}

function initTabs() {
  for (const tablist of document.querySelectorAll('[data-tabs]')) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    if (!tabs.length) return;

    const select = (index) => {
      tabs.forEach((tab, i) => {
        const selected = i === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
    };

    tablist.addEventListener('click', (event) => {
      const index = tabs.indexOf(event.target.closest('[role="tab"]'));
      if (index >= 0) select(index);
    });

    tablist.addEventListener('keydown', (event) => {
      const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
      let next = current;

      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;

      event.preventDefault();
      select(next);
      tabs[next].focus();
    });

    select(0);
  }
}

function initLoadingDemo() {
  const list = document.getElementById('alias-list');
  if (!list) return;

  const real = list.innerHTML;
  let timer;

  const skeletonRow = () => `
    <div class="alias-skeleton">
      <span class="skeleton skeleton--line" style="width: 58%"></span>
      <span class="skeleton" style="width: 4.5rem; height: 1.25rem; border-radius: 999px"></span>
    </div>`;

  const note = document.createElement('p');
  note.className = 'loading-note';
  note.setAttribute('role', 'status');
  note.hidden = true;
  note.textContent = 'Waking up the backend. This usually takes a few seconds.';
  list.after(note);

  const reset = () => {
    window.clearTimeout(timer);
    list.innerHTML = real;
    list.removeAttribute('aria-busy');
    note.hidden = true;
  };

  const simulate = (duration, withNote) => {
    reset();
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = skeletonRow().repeat(3);
    note.hidden = !withNote;
    timer = window.setTimeout(() => {
      list.innerHTML = real;
      list.removeAttribute('aria-busy');
      note.hidden = true;
    }, duration);
  };

  document.getElementById('load-1')?.addEventListener('click', () => simulate(900, false));
  document.getElementById('load-3')?.addEventListener('click', () => simulate(4000, true));
  document.getElementById('load-reset')?.addEventListener('click', reset);
}

function initMotionLab() {
  const dot = document.getElementById('motion-dot');
  const track = dot?.parentElement;
  if (!dot || !track) return;

  const duration = (name) => {
    const value = token(`--dur-${name}`);
    if (value.endsWith('ms')) return Number.parseFloat(value);
    if (value.endsWith('s')) return Number.parseFloat(value) * 1000;
    return 200;
  };

  for (const button of document.querySelectorAll('[data-motion]')) {
    button.addEventListener('click', () => {
      const name = button.dataset.motion;
      const distance = track.clientWidth - dot.offsetWidth - 12;
      dot.getAnimations().forEach((animation) => animation.cancel());
      dot.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(${distance}px)` }],
        { duration: duration(name), easing: token(`--ease-${name === 'slower' ? 'out' : name === 'slow' ? 'out' : 'standard'}`), fill: 'forwards' },
      );
    });
  }
}

function initScrollableRegions() {
  const regions = [...document.querySelectorAll('.table-wrap')];

  const sync = () => {
    for (const region of regions) {
      const overflows = region.scrollWidth > region.clientWidth + 1;
      if (overflows) {
        region.tabIndex = 0;
        region.setAttribute('role', 'region');
        const caption = region.querySelector('caption')?.textContent?.trim();
        if (caption) region.setAttribute('aria-label', caption);
      } else {
        region.removeAttribute('tabindex');
        region.removeAttribute('role');
        region.removeAttribute('aria-label');
      }
    }
  };

  sync();
  window.addEventListener('resize', sync, { passive: true });
}

function initThemeSwitch() {
  const buttons = [...document.querySelectorAll('[data-theme-set]')];
  if (!buttons.length) return;

  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const KEY = 'postern-theme';
  const stored = () => {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  };

  const syncThemeColor = () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : media.matches;
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.content = dark ? '#151110' : '#fbf8f4';
  };

  const paint = () => {
    const choice = stored();
    for (const button of buttons) {
      const on = button.dataset.themeSet === choice;
      button.setAttribute('aria-pressed', String(on));
    }
    syncThemeColor();
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const next = button.dataset.themeSet;
      if (next === 'system') {
        delete root.dataset.theme;
        try {
          localStorage.removeItem(KEY);
        } catch {}
      } else {
        root.dataset.theme = next;
        try {
          localStorage.setItem(KEY, next);
        } catch {}
      }
      paint();
    });
  }

  media.addEventListener('change', () => {
    if (stored() === 'system') paint();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === KEY) {
      const next = stored();
      if (next === 'system') delete root.dataset.theme;
      else root.dataset.theme = next;
      paint();
    }
  });

  paint();
}

function boot() {
  auditTokens();
  initThemeSwitch();
  initScrollSpy();
  initReveal();
  initCopy();
  initDialogs();
  initToastDemo();
  initTabs();
  initLoadingDemo();
  initMotionLab();
  initScrollableRegions();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
