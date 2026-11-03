#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const hex = (h) => h.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
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
  bg: '#fbf8f4',
  surface: '#ffffff',
  sunken: '#f4efe7',
  hairline: '#e4dad0',
  border: '#a08c7c',
  ink: '#211c1b',
  ink2: '#3a3330',
  muted: '#57504d',
  subtle: '#6b625e',
  disabled: '#756c68',
  primary: '#74172a',
  primaryHover: '#5c1022',
  primaryActive: '#430b19',
  onPrimary: '#fbf8f4',
  link: '#74172a',
  linkHover: '#5c1022',
  focus: '#74172a',
  success: '#16603f',
  warning: '#7a4e06',
  danger: '#8f2c1e',
  info: '#2e5668',
  successSurface: '#e9f2ec',
  warningSurface: '#faf0dc',
  dangerSurface: '#fbe9e5',
  infoSurface: '#e7eef1',
  selection: '#74172a',
  onSelection: '#fbf8f4',
};

export const dark = {
  bg: '#151110',
  surface: '#1f1a19',
  sunken: '#0f0c0b',
  hairline: '#332c29',
  border: '#786b63',
  ink: '#f7f2ec',
  ink2: '#ded6cf',
  muted: '#bdb3ab',
  subtle: '#a79c93',
  disabled: '#8b817a',
  primary: '#b04554',
  primaryHover: '#b04a58',
  primaryActive: '#8c2434',
  onPrimary: '#fbf8f4',
  link: '#e7a0aa',
  linkHover: '#f2b8c0',
  focus: '#e7a0aa',
  success: '#8fceac',
  warning: '#eec888',
  danger: '#f0aca2',
  info: '#a9cbd9',
  successSurface: '#16261d',
  warningSurface: '#2a2214',
  dangerSurface: '#2a1815',
  infoSurface: '#14212a',
  selection: '#a63a47',
  onSelection: '#fbf8f4',
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
