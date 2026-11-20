#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const hex = (h) => h.replace('#', '').match(/../g).map((x) => Number.parseInt(x, 16));
const lin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const L = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

export const light = {
  bg: '#f9f9f9',
  surface: '#ffffff',
  sunken: '#f3f3f3',
  hairline: '#c6c6c6',
  border: '#767676',
  ink: '#1b1b1b',
  ink2: '#2f2f2f',
  muted: '#555555',
  subtle: '#6f6f6f',
  disabled: '#737373',
  primary: '#000000',
  primaryHover: '#1a1a1a',
  primaryActive: '#3b3b3b',
  onPrimary: '#e2e2e2',
  link: '#6b1d2f',
  linkHover: '#4a101d',
  focus: '#6b1d2f',
  success: '#1b5e20',
  warning: '#8a5a00',
  danger: '#9e0000',
  info: '#555555',
  successSurface: '#edf6ee',
  warningSurface: '#f8f1e5',
  dangerSurface: '#f8ecec',
  infoSurface: '#f3f3f3',
  selection: '#6b1d2f',
  onSelection: '#ffffff',
};

export const dark = {
  bg: '#121212',
  surface: '#181818',
  sunken: '#1e1e1e',
  hairline: '#3a3a3a',
  border: '#8a8a8a',
  ink: '#f5f5f5',
  ink2: '#dfdfdf',
  muted: '#a0a0a0',
  subtle: '#8a8a8a',
  disabled: '#8a8a8a',
  primary: '#ffffff',
  primaryHover: '#e6e6e6',
  primaryActive: '#cfcfcf',
  onPrimary: '#111111',
  link: '#d7a3b0',
  linkHover: '#f3dce2',
  focus: '#f0f0f0',
  success: '#a9d8ba',
  warning: '#eec888',
  danger: '#ffb4ab',
  info: '#b0b0b0',
  successSurface: '#16241b',
  warningSurface: '#2a2214',
  dangerSurface: '#2a1715',
  infoSurface: '#1f1f1f',
  selection: '#d7a3b0',
  onSelection: '#2a1018',
};

const pairs = (t) => [
  ['body text', t.ink, t.bg, 7, 'AAA body copy'],
  ['body text on card', t.ink, t.surface, 7, ''],
  ['secondary text', t.ink2, t.bg, 4.5, 'labels, table captions'],
  ['muted text', t.muted, t.bg, 4.5, 'helper text'],
  ['subtle text', t.subtle, t.bg, 4.5, 'timestamps, meta'],
  ['placeholder', t.subtle, t.surface, 4.5, 'input placeholder'],
  ['disabled text', t.disabled, t.bg, 4.5, 'exempt under 1.4.3, kept legible anyway'],
  ['link', t.link, t.bg, 4.5, ''],
  ['link on card', t.link, t.surface, 4.5, ''],
  ['link hover', t.linkHover, t.bg, 4.5, ''],
  ['button label on primary', t.onPrimary, t.primary, 4.5, '14px semibold, AA'],
  ['button label, hover', t.onPrimary, t.primaryHover, 4.5, ''],
  ['button label, active', t.onPrimary, t.primaryActive, 4.5, ''],
  ['control border', t.border, t.surface, 3, 'non-text contrast'],
  ['control border on bg', t.border, t.bg, 3, ''],
  ['focus ring', t.focus, t.bg, 3, 'ring must be visible'],
  ['focus ring on card', t.focus, t.surface, 3, ''],
  ['primary vs bg', t.primary, t.bg, 3, 'filled control boundary'],
  ['success text', t.success, t.bg, 4.5, ''],
  ['success chip', t.success, t.successSurface, 4.5, ''],
  ['warning text', t.warning, t.bg, 4.5, ''],
  ['warning chip', t.warning, t.warningSurface, 4.5, ''],
  ['danger text', t.danger, t.bg, 4.5, ''],
  ['danger chip', t.danger, t.dangerSurface, 4.5, ''],
  ['info text', t.info, t.bg, 4.5, ''],
  ['info chip', t.info, t.infoSurface, 4.5, ''],
  ['selected text', t.onSelection, t.selection, 4.5, ''],
  ['hairline (decorative)', t.hairline, t.bg, 1, 'no minimum, never the only cue'],
];

const run = (name, t) => {
  console.log(`\n${name.toUpperCase()}`);
  let worst = { r: Infinity, label: '' };
  let failures = 0;
  for (const [label, fg, bg, min] of pairs(t)) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failures++;
    if (min >= 3 && r < worst.r) worst = { r, label };
    console.log(
      `  ${ok ? 'pass' : 'FAIL'}  ${label.padEnd(26)} ${fg} on ${bg}  ${r.toFixed(2).padStart(6)}:1  (min ${min})`,
    );
  }
  console.log(`  → ${failures === 0 ? 'all pairs pass' : `${failures} failing`}; lowest ${worst.r.toFixed(2)}:1 (${worst.label})`);
  return failures;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const f = run('light', light) + run('dark', dark);
  if (process.argv.includes('--check') && f > 0) process.exit(1);
}
