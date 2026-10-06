/**
 * Inline SVG icon set (24px grid). Stroke icons follow the Feather/Lucide style; `fill: true` icons are solid.
 */

const ICONS = {
  logo:          { fill: true, d: '<circle cx="12" cy="12" r="11"/><rect x="6.5" y="9" width="2" height="6" rx="1" fill="#000"/><rect x="11" y="6" width="2" height="12" rx="1" fill="#000"/><rect x="15.5" y="8" width="2" height="8" rx="1" fill="#000"/>' },
  home:          '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  search:        '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  library:       '<path d="M4 3v18M9 3v18"/><path d="m14 4 6 16"/>',
  plus:          '<path d="M12 5v14M5 12h14"/>',
  'chevron-left':  '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-down':  '<path d="m6 9 6 6 6-6"/>',
  x:             '<path d="M18 6 6 18M6 6l12 12"/>',
  play:          { fill: true, d: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/>' },
  pause:         { fill: true, d: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>' },
  prev:          { fill: true, d: '<rect x="4" y="4" width="2.5" height="16" rx="1"/><path d="M19.5 5.1v13.8a1 1 0 0 1-1.55.83L8.6 13.2a1.4 1.4 0 0 1 0-2.4l9.35-6.53a1 1 0 0 1 1.55.83z"/>' },
  next:          { fill: true, d: '<rect x="17.5" y="4" width="2.5" height="16" rx="1"/><path d="M4.5 5.1v13.8a1 1 0 0 0 1.55.83l9.35-6.53a1.4 1.4 0 0 0 0-2.4L6.05 4.27a1 1 0 0 0-1.55.83z"/>' },
  shuffle:       '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
  repeat:        '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  heart:         '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
  'heart-fill':  { fill: true, d: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>' },
  more:          { fill: true, d: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>' },
  queue:         '<path d="M3 6h13M3 12h13M3 18h9"/><path d="M17 15v6l4-3z"/>',
  lyrics:        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  eq:            '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  nowplaying:    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M8 7h8"/>',
  maximize:      '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  minimize:      '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
  volume:        '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  'volume-low':  '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  'volume-x':    '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  clock:         '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  music:         '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  sparkle:       '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  check:         '<path d="M20 6 9 17l-5-5"/>',
  trash:         '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  user:          '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  info:          '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  'arrow-up':    '<path d="M12 19V5M5 12l7-7 7 7"/>',
  'arrow-down':  '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  compass:       '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  'list-plus':   '<path d="M3 6h12M3 12h12M3 18h7M18 15v6M15 18h6"/>',
  'play-next':   '<path d="M3 6h12M3 12h8M3 18h8"/><path d="M15 12l6 4-6 4z"/>',
  save:          '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  verified:      { fill: true, d: '<path d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3.1 1 3-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3-1-3.1 2.6-1.9 1-3 3.2.1z"/><path d="m8 12 2.6 2.6L16 9.2" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' }
};

export function icon(name, size = 20, cls = '') {
  const def = ICONS[name];
  if (!def) return '';
  const solid = typeof def === 'object';
  const paint = solid
    ? 'fill="currentColor"'
    : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" ${paint} aria-hidden="true">${solid ? def.d : def}</svg>`;
}

/** Replace every `<i data-icon="name" data-size="20">` placeholder in the static shell. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach(el => {
    el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 20, el.className);
  });
}
