// Placeholder palette (our own colours: cold steel, slate, amber warning light, and a violet for the far side). One
// place so the 3D scene and the CSS agree. No publisher or Blizzard trade dress.
export const PALETTE = {
  slate: '#1b232d',
  slateLight: '#2c3a48',
  steel: '#6f7c88',
  steelDark: '#46515c',
  ash: '#8a8478',
  ashDark: '#5d584f',
  amber: '#e0a03a',
  cyan: '#59b8d6',
  cyanDark: '#2e6f85',
  violet: '#8a5cc2',
  violetDark: '#4e2f78',
  ink: '#0f141b',
  bone: '#dfe6ee',
} as const

// CSS font stacks only (no hosted fonts).
export const FONTS = {
  heading: '"Bahnschrift", "Eurostile", "DIN Alternate", "Segoe UI Semibold", "Arial Narrow Bold", sans-serif',
  body: '"Segoe UI", "Trebuchet MS", system-ui, sans-serif',
} as const
