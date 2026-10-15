/**
 * Well-known constellation figures and asterisms, listed by the stars that form their usual stick figures.
 * Used to calibrate and test the clutter measure; designations match the catalog's Bayer labels.
 */
import type { Star } from './catalog';

/** Catalog index by designation; a few designations repeat for faint companions, so the brightest wins. */
export function designationIndex(stars: Star[]): Map<string, number> {
  const map = new Map<string, number>();
  stars.forEach((s, i) => {
    const prev = map.get(s.designation);
    if (prev === undefined || s.mag < stars[prev].mag) map.set(s.designation, i);
  });
  return map;
}

export interface StandardFigure {
  name: string;
  stars: string[];
}

export const STANDARD_FIGURES: StandardFigure[] = [
  { name: 'Big Dipper', stars: ['α UMa', 'β UMa', 'γ UMa', 'δ UMa', 'ε UMa', 'ζ UMa', 'η UMa'] },
  { name: 'Little Dipper', stars: ['α UMi', 'δ UMi', 'ε UMi', 'ζ UMi', 'η UMi', 'β UMi', 'γ UMi'] },
  { name: 'Cassiopeia', stars: ['β Cas', 'α Cas', 'γ Cas', 'δ Cas', 'ε Cas'] },
  { name: 'Orion', stars: ['α Ori', 'γ Ori', 'ζ Ori', 'ε Ori', 'δ Ori', 'κ Ori', 'β Ori'] },
  { name: 'Crux', stars: ['α1 Cru', 'β Cru', 'γ Cru', 'δ Cru'] },
  { name: 'Northern Cross (Cygnus)', stars: ['α Cyg', 'γ Cyg', 'β1 Cyg', 'ε Cyg', 'δ Cyg'] },
  { name: 'Lyra', stars: ['α Lyr', 'ζ1 Lyr', 'δ2 Lyr', 'γ Lyr', 'β Lyr'] },
  { name: 'Leo', stars: ['α Leo', 'η Leo', 'γ1 Leo', 'ζ Leo', 'μ Leo', 'ε Leo', 'δ Leo', 'θ Leo', 'β Leo'] },
  {
    name: 'Scorpius',
    stars: ['β1 Sco', 'δ Sco', 'π Sco', 'σ Sco', 'α Sco', 'τ Sco', 'ε Sco', 'μ1 Sco', 'ζ2 Sco', 'η Sco', 'θ Sco', 'ι1 Sco', 'κ Sco', 'λ Sco'],
  },
  { name: 'Teapot (Sagittarius)', stars: ['γ2 Sgr', 'δ Sgr', 'ε Sgr', 'λ Sgr', 'φ Sgr', 'σ Sgr', 'τ Sgr', 'ζ Sgr'] },
  { name: 'Great Square of Pegasus', stars: ['α Peg', 'β Peg', 'γ Peg', 'α And'] },
  { name: 'Corona Borealis', stars: ['θ CrB', 'β CrB', 'α CrB', 'γ CrB', 'δ CrB', 'ε CrB', 'ι CrB'] },
  { name: 'Delphinus', stars: ['ε Del', 'β Del', 'α Del', 'γ2 Del', 'δ Del'] },
  { name: 'Aquila', stars: ['ζ Aql', 'γ Aql', 'α Aql', 'β Aql', 'δ Aql', 'λ Aql', 'θ Aql'] },
  { name: 'Boötes', stars: ['α Boo', 'ε Boo', 'δ Boo', 'β Boo', 'γ Boo', 'ρ Boo'] },
  { name: 'Hyades V (Taurus)', stars: ['α Tau', 'θ2 Tau', 'γ Tau', 'δ1 Tau', 'ε Tau'] },
  { name: 'Canis Major', stars: ['α CMa', 'β CMa', 'ο2 CMa', 'δ CMa', 'ε CMa', 'η CMa', 'ζ CMa'] },
  { name: 'Gemini', stars: ['α Gem', 'β Gem', 'τ Gem', 'ε Gem', 'μ Gem', 'δ Gem', 'ζ Gem', 'γ Gem'] },
  { name: 'Corvus', stars: ['γ Crv', 'δ Crv', 'β Crv', 'ε Crv'] },
  { name: 'Keystone (Hercules)', stars: ['ε Her', 'ζ Her', 'η Her', 'π Her'] },
  { name: 'Triangulum', stars: ['α Tri', 'β Tri', 'γ Tri'] },
  { name: 'Perseus', stars: ['η Per', 'γ Per', 'α Per', 'δ Per', 'ε Per', 'ζ Per', 'β Per'] },
  { name: 'Auriga', stars: ['α Aur', 'β Aur', 'θ Aur', 'β Tau', 'ι Aur'] },
  { name: 'Andromeda', stars: ['α And', 'δ And', 'β And', 'γ1 And'] },
  { name: 'Head of Draco', stars: ['γ Dra', 'β Dra', 'ν2 Dra', 'ξ Dra'] },
  { name: 'Cepheus', stars: ['α Cep', 'β Cep', 'γ Cep', 'ι Cep', 'ζ Cep'] },
  { name: 'Summer Triangle', stars: ['α Lyr', 'α Cyg', 'α Aql'] },
  { name: 'Southern Triangle (Triangulum Australe)', stars: ['α TrA', 'β TrA', 'γ TrA'] },
];
