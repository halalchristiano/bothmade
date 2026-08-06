import type { AlloyKey, TextureKey } from './patterns';

/**
 * The swatches, drawn rather than photographed.
 *
 * We have no licence to Rigidized's product photography and stock images of
 * somebody else's metal would be worse than useless — the whole argument of
 * this concept is that a flat photograph cannot show what deep texturing
 * does. So each pattern is a procedural surface: a light stop and a dark stop
 * offset against each other, which is what an embossed sheet actually looks
 * like when light crosses it.
 *
 * They read as deliberate abstractions rather than as fake photographs, which
 * is the honest thing for a concept to be. The raking highlight that sweeps
 * across them on hover lives in the stylesheet.
 */

interface Texture {
  image: string;
  size: string;
  opacity?: number;
}

const hi = (a: number) => `rgba(255,255,255,${a})`;
const lo = (a: number) => `rgba(0,0,0,${a})`;

export const TEXTURES: Record<TextureKey, Texture> = {
  // The original 1940 pattern — a deep, rounded repeat, offset row to row.
  raindrop: {
    image: [
      `radial-gradient(circle at 34% 32%, ${hi(0.26)} 0 12%, transparent 34%)`,
      `radial-gradient(circle at 62% 66%, ${lo(0.42)} 0 14%, transparent 36%)`,
      `radial-gradient(circle at 84% 18%, ${hi(0.16)} 0 9%, transparent 28%)`,
      `radial-gradient(circle at 14% 82%, ${lo(0.3)} 0 10%, transparent 30%)`,
    ].join(','),
    size: '46px 46px',
  },

  // 6WL — the same family, tighter repeat, read at closer range.
  'raindrop-fine': {
    image: [
      `radial-gradient(circle at 30% 30%, ${hi(0.22)} 0 13%, transparent 33%)`,
      `radial-gradient(circle at 70% 70%, ${lo(0.36)} 0 13%, transparent 33%)`,
    ].join(','),
    size: '26px 26px',
  },

  // 2WL — a fine directional rib.
  ribbed: {
    image: [
      `repeating-linear-gradient(102deg, ${hi(0.14)} 0 2px, transparent 2px 6px)`,
      `repeating-linear-gradient(102deg, transparent 0 3px, ${lo(0.3)} 3px 5px)`,
    ].join(','),
    size: 'auto',
  },

  // 6SL — crossing structural relief.
  lattice: {
    image: [
      `repeating-linear-gradient(45deg, ${hi(0.12)} 0 3px, transparent 3px 14px)`,
      `repeating-linear-gradient(-45deg, ${lo(0.3)} 0 3px, transparent 3px 14px)`,
      `repeating-linear-gradient(45deg, transparent 0 11px, ${lo(0.18)} 11px 14px)`,
    ].join(','),
    size: 'auto',
  },

  // 1ACC — a fine even stipple that hides handling marks.
  stipple: {
    image: [
      `radial-gradient(circle at 25% 25%, ${hi(0.16)} 0 22%, transparent 46%)`,
      `radial-gradient(circle at 75% 75%, ${lo(0.26)} 0 22%, transparent 46%)`,
    ].join(','),
    size: '11px 11px',
  },

  // Arlington — elongated diamonds, highlighted.
  diamond: {
    image: [
      `repeating-linear-gradient(60deg, ${hi(0.18)} 0 2px, transparent 2px 20px)`,
      `repeating-linear-gradient(-60deg, ${hi(0.1)} 0 2px, transparent 2px 20px)`,
      `repeating-linear-gradient(60deg, transparent 0 17px, ${lo(0.34)} 17px 20px)`,
      `repeating-linear-gradient(-60deg, transparent 0 17px, ${lo(0.24)} 17px 20px)`,
    ].join(','),
    size: 'auto',
  },

  // Middlesex — a soft hexagonal read under diffuse light.
  hex: {
    image: [
      `radial-gradient(circle at 50% 0%, ${lo(0.3)} 0 10%, transparent 32%)`,
      `radial-gradient(circle at 0% 50%, ${hi(0.18)} 0 10%, transparent 32%)`,
      `radial-gradient(circle at 100% 50%, ${hi(0.12)} 0 10%, transparent 32%)`,
      `radial-gradient(circle at 50% 100%, ${lo(0.24)} 0 10%, transparent 32%)`,
    ].join(','),
    size: '34px 30px',
  },

  // Middlesex TD — the same field with a custom directional highlight.
  'hex-directional': {
    image: [
      `linear-gradient(78deg, ${hi(0.1)} 0 18%, transparent 52%)`,
      `radial-gradient(circle at 50% 0%, ${lo(0.32)} 0 10%, transparent 32%)`,
      `radial-gradient(circle at 0% 50%, ${hi(0.2)} 0 10%, transparent 32%)`,
      `radial-gradient(circle at 50% 100%, ${lo(0.22)} 0 10%, transparent 32%)`,
    ].join(','),
    size: '100% 100%, 34px 30px, 34px 30px, 34px 30px',
  },
};

/**
 * Texture depth is a real product property — pattern depth varies with gauge —
 * so the swatch leans on it rather than drawing every pattern at one weight.
 */
export function textureStyle(texture: TextureKey, depth = 3): React.CSSProperties {
  const t = TEXTURES[texture];
  return {
    ['--tex' as string]: t.image,
    ['--tex-size' as string]: t.size,
    ['--tex-opacity' as string]: String(Math.min(1, 0.5 + depth * 0.12)),
  };
}

/** Alloys are a colour as much as a material — brass reads warm, steel cool. */
export const ALLOY_CLASS: Record<AlloyKey, string> = {
  stainless: 'alloyStainless',
  aluminum: 'alloyAluminum',
  brass: 'alloyBrass',
  bronze: 'alloyBronze',
};
