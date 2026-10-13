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

// Side colours (Red and Blue Deployment Card sides). Red also gets a hatch pattern on the mat so colour is never the
// only cue. One place so the mat, the rings and the HUD agree.
export const SIDE_COLOURS = { red: '#d4553f', blue: '#4f8fd8', neutral: '#b9bfc6' } as const
export const sideColour = (c: string | null | undefined): string => (c === 'red' ? SIDE_COLOURS.red : c === 'blue' ? SIDE_COLOURS.blue : SIDE_COLOURS.neutral)

// Original faction emblems: three simple geometric marks of our own design (24 x 24 viewBox, drawn with currentColor).
// Not the publisher's or Blizzard's logos. Keyed by the race id the data uses; unknown races get the plain ring.
const RING = '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/>'
export const EMBLEMS: Record<string, string> = {
  // Terran: a riveted shield with a bar and a chevron.
  terran: '<path d="M12 2.5 20 6v6.2c0 4.3-3.4 7.7-8 9.3-4.6-1.6-8-5-8-9.3V6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 11 12 8l4.5 3M7.5 15 12 12l4.5 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  // Zerg: three curved claws meeting at a point.
  zerg: '<path d="M12 21C6 17 4 11 6 3c2 3 4 6 6 9 2-3 4-6 6-9 2 8 0 14-6 18z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 12v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  // Protoss: a diamond inside a ring with a vertical blade.
  protoss: RING + '<path d="M12 5.5 17.5 12 12 18.5 6.5 12z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8.5v7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
}
export const EMBLEM_FALLBACK = RING + '<circle cx="12" cy="12" r="3" fill="currentColor"/>'
/** Inner SVG markup for a race's emblem (our own mark). */
export const emblemFor = (race: string | null | undefined): string => (race && EMBLEMS[race]) || EMBLEM_FALLBACK
