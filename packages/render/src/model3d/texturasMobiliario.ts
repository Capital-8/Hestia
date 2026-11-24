import * as THREE from 'three';

/** Dimensão (px) das texturas procedurais de marcenaria/pedra/metal (potência de 2 para mipmaps e repeat). */
const TAMANHO_TEX = 128;

export interface TexturasAcabamento {
  map?: THREE.DataTexture;
  bumpMap?: THREE.DataTexture;
  roughness: number;
  metalness: number;
  opacity?: number;
}

type Rgb = readonly [number, number, number];

type SpecAcabamento =
  | { kind: 'madeira'; base: Rgb; escuro: Rgb; claro: Rgb; roughness: number; bumpStrength: number; seed: number }
  | { kind: 'laca'; base: Rgb; roughness: number; metalness: number; seed: number }
  | { kind: 'marmore'; base: Rgb; veio: Rgb; ouro: Rgb; intensidadeVeio: number; roughness: number; seed: number }
  | { kind: 'granito'; base: Rgb; escuro: Rgb; claro: Rgb; brilho: Rgb; roughness: number; metalness: number; seed: number }
  | { kind: 'metal'; base: Rgb; escuro: Rgb; claro: Rgb; roughness: number; metalness: number; seed: number }
  | { kind: 'vidro'; base: Rgb; brilho: Rgb; roughness: number; metalness: number; opacity: number; seed: number };

const hexRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const SPECS: Readonly<Record<string, SpecAcabamento>> = {
  comp_carvalho: { kind: 'madeira', base: hexRgb('#c9a176'), escuro: hexRgb('#a17548'), claro: hexRgb('#deb98e'), roughness: 0.62, bumpStrength: 1, seed: 101 },
  comp_madeira_clara: { kind: 'madeira', base: hexRgb('#e2c9a0'), escuro: hexRgb('#c4a778'), claro: hexRgb('#f0dcb8'), roughness: 0.6, bumpStrength: 1, seed: 105 },
  comp_freijo: { kind: 'madeira', base: hexRgb('#9e6b43'), escuro: hexRgb('#6e4424'), claro: hexRgb('#ba865b'), roughness: 0.58, bumpStrength: 1, seed: 202 },
  comp_nogueira: { kind: 'madeira', base: hexRgb('#5c3c28'), escuro: hexRgb('#392214'), claro: hexRgb('#7a533a'), roughness: 0.56, bumpStrength: 1, seed: 303 },
  comp_corpo: { kind: 'madeira', base: hexRgb('#c9a176'), escuro: hexRgb('#a17548'), claro: hexRgb('#deb98e'), roughness: 0.62, bumpStrength: 0.9, seed: 404 },
  comp_fundo: { kind: 'madeira', base: hexRgb('#c2b59f'), escuro: hexRgb('#aba08c'), claro: hexRgb('#d0c4b0'), roughness: 0.72, bumpStrength: 0.6, seed: 505 },

  comp_branco: { kind: 'laca', base: hexRgb('#f4f4f1'), roughness: 0.36, metalness: 0, seed: 601 },
  comp_offwhite: { kind: 'laca', base: hexRgb('#e6dfd3'), roughness: 0.38, metalness: 0, seed: 602 },
  comp_porta: { kind: 'laca', base: hexRgb('#ede7dc'), roughness: 0.38, metalness: 0, seed: 603 },
  comp_grafite: { kind: 'laca', base: hexRgb('#3c4046'), roughness: 0.48, metalness: 0.04, seed: 604 },
  comp_rodape: { kind: 'laca', base: hexRgb('#3c4046'), roughness: 0.5, metalness: 0.04, seed: 605 },
  comp_sage: { kind: 'laca', base: hexRgb('#7d8f82'), roughness: 0.42, metalness: 0, seed: 606 },

  comp_calacatta: { kind: 'marmore', base: hexRgb('#f2efe8'), veio: hexRgb('#8b8378'), ouro: hexRgb('#b89a6a'), intensidadeVeio: 1, roughness: 0.22, seed: 701 },
  comp_tampo: { kind: 'marmore', base: hexRgb('#e9e5dc'), veio: hexRgb('#b1a99c'), ouro: hexRgb('#cbb795'), intensidadeVeio: 0.65, roughness: 0.24, seed: 702 },
  comp_marmore_escuro: { kind: 'marmore', base: hexRgb('#2b2d31'), veio: hexRgb('#c9c6bd'), ouro: hexRgb('#b89a6a'), intensidadeVeio: 0.8, roughness: 0.2, seed: 704 },
  comp_preto_sg: { kind: 'granito', base: hexRgb('#25272b'), escuro: hexRgb('#17181b'), claro: hexRgb('#4c515a'), brilho: hexRgb('#8d94a0'), roughness: 0.2, metalness: 0.06, seed: 703 },

  comp_pvc_branco: { kind: 'laca', base: hexRgb('#f1f1ec'), roughness: 0.42, metalness: 0, seed: 911 },
  comp_pvc_bege: { kind: 'laca', base: hexRgb('#d9cdb1'), roughness: 0.44, metalness: 0, seed: 912 },
  comp_pvc_marrom: { kind: 'laca', base: hexRgb('#a8592e'), roughness: 0.44, metalness: 0, seed: 913 },
  comp_pvc_azul: { kind: 'laca', base: hexRgb('#2f6db0'), roughness: 0.42, metalness: 0, seed: 914 },
  comp_pvc_cinza: { kind: 'laca', base: hexRgb('#8d9399'), roughness: 0.46, metalness: 0, seed: 915 },
  comp_aco_galv: { kind: 'metal', base: hexRgb('#aeb5bc'), escuro: hexRgb('#949ba3'), claro: hexRgb('#c8ced4'), roughness: 0.34, metalness: 0.7, seed: 921 },
  comp_aco: { kind: 'metal', base: hexRgb('#8a9098'), escuro: hexRgb('#6f757d'), claro: hexRgb('#a6acb3'), roughness: 0.38, metalness: 0.72, seed: 922 },
  comp_aluminio: { kind: 'metal', base: hexRgb('#b9bec4'), escuro: hexRgb('#9ea5ad'), claro: hexRgb('#d3d8de'), roughness: 0.28, metalness: 0.72, seed: 801 },
  comp_cobre: { kind: 'metal', base: hexRgb('#b47a4c'), escuro: hexRgb('#8f5b32'), claro: hexRgb('#cf9668'), roughness: 0.28, metalness: 0.72, seed: 802 },

  comp_vidro_incolor: { kind: 'vidro', base: hexRgb('#cfe6ea'), brilho: hexRgb('#eaf6f8'), roughness: 0.06, metalness: 0.1, opacity: 0.3, seed: 902 },
  comp_vidro_bronze: { kind: 'vidro', base: hexRgb('#8a6a4a'), brilho: hexRgb('#b08d68'), roughness: 0.08, metalness: 0.15, opacity: 0.4, seed: 903 },
  comp_vidro_verde: { kind: 'vidro', base: hexRgb('#5f8f7f'), brilho: hexRgb('#86b5a4'), roughness: 0.08, metalness: 0.15, opacity: 0.4, seed: 904 },
  comp_vidro_fume: { kind: 'vidro', base: hexRgb('#49525c'), brilho: hexRgb('#65717e'), roughness: 0.08, metalness: 0.15, opacity: 0.42, seed: 901 },
};

const cache = new Map<string, TexturasAcabamento>();

const clampByte = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

/** Hash 2D determinístico em [0, 1) com período inteiro (garante ladrilho sem emenda). */
function hashPeriodico(ix: number, iy: number, px: number, py: number, seed: number): number {
  const wx = ((ix % px) + px) % px;
  const wy = ((iy % py) + py) % py;
  let h = Math.imul(wx + 374761393, 668265263) ^ Math.imul(wy + 1274126177, 2246822519) ^ Math.imul(seed, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Ruído bilinear periódico em [0, 1). */
function ruidoPeriodico(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const a = hashPeriodico(ix, iy, px, py, seed);
  const b = hashPeriodico(ix + 1, iy, px, py, seed);
  const c = hashPeriodico(ix, iy + 1, px, py, seed);
  const d = hashPeriodico(ix + 1, iy + 1, px, py, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

/** FBM periódico multi-oitava em [0, 1). */
function fbmPeriodico(u: number, v: number, px: number, py: number, oitavas: number, seed: number): number {
  let soma = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < oitavas; i++) {
    const mult = 1 << i;
    soma += amp * ruidoPeriodico(u, v, px * mult, py * mult, seed + i * 31);
    norm += amp;
    amp *= 0.5;
  }
  return soma / norm;
}

function criarTextura(dados: Uint8Array, colorSpace: THREE.ColorSpace): THREE.DataTexture {
  const tex = new THREE.DataTexture(dados, TAMANHO_TEX, TAMANHO_TEX, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

function gerarPixelMadeira(u: number, v: number, s: Extract<SpecAcabamento, { kind: 'madeira' }>): [Rgb, number] {
  const warp = fbmPeriodico(u, v, 2, 6, 3, s.seed);
  const fase = (v * 9 + warp * 2.15) * Math.PI * 2;
  const aneis = Math.pow(0.5 + 0.5 * Math.sin(fase), 0.72);
  const fibras = ruidoPeriodico(u, v, 8, 64, s.seed + 17);
  const variacaoMacro = fbmPeriodico(u, v, 2, 2, 2, s.seed + 43);
  const t = 0.62 * aneis + 0.28 * fibras + 0.1 * variacaoMacro;
  const rgb = t < 0.5 ? mixRgb(s.escuro, s.base, t * 2) : mixRgb(s.base, s.claro, (t - 0.5) * 2);
  const relevo = 128 + (0.5 - aneis) * 44 * s.bumpStrength + (fibras - 0.5) * 34 * s.bumpStrength;
  return [rgb, relevo];
}

function gerarPixelLaca(u: number, v: number, s: Extract<SpecAcabamento, { kind: 'laca' }>): [Rgb, number] {
  const micro = ruidoPeriodico(u, v, 48, 48, s.seed);
  const nuvem = fbmPeriodico(u, v, 4, 4, 2, s.seed + 11);
  // Micro-variação sutil acetinada sem lavar o tom base.
  const delta = (micro - 0.5) * 6 + (nuvem - 0.5) * 5;
  const rgb: Rgb = [s.base[0] + delta, s.base[1] + delta, s.base[2] + delta];
  const relevo = 128 + (micro - 0.5) * 14;
  return [rgb, relevo];
}

function gerarPixelMarmore(u: number, v: number, s: Extract<SpecAcabamento, { kind: 'marmore' }>): [Rgb, number] {
  const nuvem = fbmPeriodico(u, v, 4, 4, 3, s.seed);
  const distorcao = fbmPeriodico(u, v, 4, 4, 4, s.seed + 19);
  const campo = Math.abs(Math.sin((u * 2 + v + distorcao * 2.4) * Math.PI));
  const veioPrincipal = Math.pow(1 - campo, 7) * s.intensidadeVeio;
  const campoSec = Math.abs(Math.sin((u * 3 - v * 2 + distorcao * 1.9 + 0.4) * Math.PI));
  const veioDourado = Math.pow(1 - campoSec, 11) * 0.55 * s.intensidadeVeio;
  let rgb = mixRgb(s.base, s.veio, (nuvem - 0.5) * 0.08 + veioPrincipal * 0.72);
  rgb = mixRgb(rgb, s.ouro, veioDourado * 0.65);
  const relevo = 130 - veioPrincipal * 12;
  return [rgb, relevo];
}

function gerarPixelGranito(u: number, v: number, s: Extract<SpecAcabamento, { kind: 'granito' }>): [Rgb, number] {
  const medio = ruidoPeriodico(u, v, 24, 24, s.seed);
  const fino = ruidoPeriodico(u, v, 64, 64, s.seed + 13);
  const cristal = ruidoPeriodico(u, v, 48, 48, s.seed + 29);
  let rgb = mixRgb(s.escuro, s.base, smoothstep(medio));
  if (fino > 0.55) rgb = mixRgb(rgb, s.claro, (fino - 0.55) * 1.4);
  if (cristal > 0.84) rgb = mixRgb(rgb, s.brilho, (cristal - 0.84) * 5.2);
  const relevo = 124 + (fino - 0.5) * 26 + (cristal > 0.84 ? 10 : 0);
  return [rgb, relevo];
}

function gerarPixelMetal(u: number, v: number, s: Extract<SpecAcabamento, { kind: 'metal' }>): [Rgb, number] {
  const riscoA = ruidoPeriodico(u, v, 4, 64, s.seed);
  const riscoB = ruidoPeriodico(u, v, 8, 128, s.seed + 23);
  const brilho = fbmPeriodico(u, v, 2, 4, 2, s.seed + 41);
  const t = 0.55 * riscoA + 0.3 * riscoB + 0.15 * brilho;
  const rgb = t < 0.5 ? mixRgb(s.escuro, s.base, t * 2) : mixRgb(s.base, s.claro, (t - 0.5) * 2);
  const relevo = 128 + (riscoA - 0.5) * 24 + (riscoB - 0.5) * 18;
  return [rgb, relevo];
}

function gerarPixelVidro(u: number, v: number, s: Extract<SpecAcabamento, { kind: 'vidro' }>): Rgb {
  const reflexo = 0.5 + 0.5 * Math.sin((u + v * 0.5) * Math.PI * 2);
  const suave = fbmPeriodico(u, v, 2, 2, 2, s.seed);
  return mixRgb(s.base, s.brilho, 0.25 * reflexo + 0.15 * suave);
}

function construirTextura(spec: SpecAcabamento): TexturasAcabamento {
  const n = TAMANHO_TEX * TAMANHO_TEX;
  const cor = new Uint8Array(n * 4);
  const precisaBump = spec.kind !== 'vidro';
  const bump = precisaBump ? new Uint8Array(n * 4) : null;

  for (let y = 0; y < TAMANHO_TEX; y++) {
    const v = y / TAMANHO_TEX;
    for (let x = 0; x < TAMANHO_TEX; x++) {
      const u = x / TAMANHO_TEX;
      let rgb: Rgb;
      let altura = 128;
      if (spec.kind === 'madeira') [rgb, altura] = gerarPixelMadeira(u, v, spec);
      else if (spec.kind === 'laca') [rgb, altura] = gerarPixelLaca(u, v, spec);
      else if (spec.kind === 'marmore') [rgb, altura] = gerarPixelMarmore(u, v, spec);
      else if (spec.kind === 'granito') [rgb, altura] = gerarPixelGranito(u, v, spec);
      else if (spec.kind === 'metal') [rgb, altura] = gerarPixelMetal(u, v, spec);
      else rgb = gerarPixelVidro(u, v, spec);

      const idx = (y * TAMANHO_TEX + x) * 4;
      cor[idx] = clampByte(rgb[0]);
      cor[idx + 1] = clampByte(rgb[1]);
      cor[idx + 2] = clampByte(rgb[2]);
      cor[idx + 3] = 255;

      if (bump) {
        const b = clampByte(altura);
        bump[idx] = b;
        bump[idx + 1] = b;
        bump[idx + 2] = b;
        bump[idx + 3] = 255;
      }
    }
  }

  const map = criarTextura(cor, THREE.SRGBColorSpace);
  const bumpMap = bump ? criarTextura(bump, THREE.NoColorSpace) : undefined;
  return {
    map,
    ...(bumpMap ? { bumpMap } : {}),
    roughness: spec.roughness,
    metalness: spec.kind === 'laca' || spec.kind === 'granito' || spec.kind === 'metal' || spec.kind === 'vidro' ? spec.metalness : 0,
    ...(spec.kind === 'vidro' ? { opacity: spec.opacity } : {}),
  };
}

/**
 * Texturas procedurais determinísticas em cache por `materialId` de acabamento de mobiliário.
 * Retorna `null` para materiais que não pertencem ao catálogo de componentes/acabamentos.
 */
export function obterTexturasAcabamento(materialId: string): TexturasAcabamento | null {
  const spec = SPECS[materialId];
  if (!spec) return null;
  let hit = cache.get(materialId);
  if (!hit) {
    hit = construirTextura(spec);
    cache.set(materialId, hit);
  }
  return hit;
}

/** Libera da GPU/memória todas as texturas procedurais em cache. */
export function descartarTexturasMobiliario(): void {
  for (const t of cache.values()) {
    t.map?.dispose();
    t.bumpMap?.dispose();
  }
  cache.clear();
}
