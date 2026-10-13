// Side colours for the table (Red and Blue Deployment Card sides) plus neutral. Our own palette; Red also gets a hatch
// pattern wherever it is drawn as an area so the two sides never rely on hue alone (colour-blind safe, spec 50 s2).
import type { Colour } from '../../engine/types'
import { PALETTE } from '../theme'

export const SIDE_HEX: Record<Colour | 'neutral', string> = {
  red: '#e0603f',
  blue: '#4aa3df',
  neutral: PALETTE.amber,
}
export const SIDE_DARK: Record<Colour | 'neutral', string> = {
  red: '#7d2f1c',
  blue: '#1f5a85',
  neutral: '#7a5a1c',
}
export const sideHex = (c: Colour | 'neutral' | null | undefined): string => SIDE_HEX[c ?? 'neutral']
