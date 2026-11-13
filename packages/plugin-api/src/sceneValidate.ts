import type { LightKind, SceneMaterial, SceneMesh, SceneSite, Vec3 } from './scene.ts';

/**
 * Validação dos campos do protocolo 1.3 (materiais PBR, luzes, localização e normais). Cada campo tem o seu validador,
 * para que o host possa descartar só o valor inválido (`contentForProtocol`) e o plugin possa recusar um quadro com
 * campo inválido (`validateMessage`). Valores ausentes são sempre válidos: os campos são opcionais.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const TZ = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;
const LIGHT_KINDS: readonly LightKind[] = ['point', 'spot', 'area'];
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const inRange = (x: unknown, lo: number, hi: number): boolean => finite(x) && x >= lo && x <= hi;
const isVec3 = (v: unknown): v is Vec3 => isObj(v) && finite(v.x) && finite(v.y) && finite(v.z);
const nonZero = (v: Vec3): boolean => v.x !== 0 || v.y !== 0 || v.z !== 0;
const PI = Math.PI;

// ---- material (campos PBR opcionais) ----
const PBR: Record<'category' | 'metallic' | 'transmission' | 'ior' | 'emissive', (v: unknown) => boolean> = {
  metallic: (v) => inRange(v, 0, 1),
  transmission: (v) => inRange(v, 0, 1),
  ior: (v) => inRange(v, 1, 3),
  category: (v) => typeof v === 'string' && /^[a-z0-9_-]{1,32}$/.test(v),
  emissive: (v) => isObj(v) && typeof v.color === 'string' && HEX.test(v.color) && finite(v.intensity) && v.intensity >= 0,
};

/** Campo PBR inválido ou null. */
export function materialIssue(m: unknown): string | null {
  if (!isObj(m)) return 'material precisa ser objeto';
  for (const k of Object.keys(PBR) as Array<keyof typeof PBR>) {
    if (m[k] !== undefined && !PBR[k](m[k])) return `${k} inválido`;
  }
  return null;
}

/** Cópia do material sem os campos PBR inválidos (os válidos ficam). */
export function materialSanitized(m: SceneMaterial): SceneMaterial {
  const out: Record<string, unknown> = { ...m };
  for (const k of Object.keys(PBR) as Array<keyof typeof PBR>) {
    if (out[k] !== undefined && !PBR[k](out[k])) delete out[k];
  }
  return out as unknown as SceneMaterial;
}

// ---- luz ----
/** Problema da luz (texto) ou null. */
export function lightIssue(l: unknown): string | null {
  if (!isObj(l)) return 'luz precisa ser objeto';
  if (typeof l.id !== 'string' || l.id.length === 0 || l.id.length > 100) return 'id inválido';
  if (!LIGHT_KINDS.includes(l.kind as LightKind)) return 'kind precisa ser point, spot ou area';
  if (!isVec3(l.position)) return 'position inválida';
  if (l.direction !== undefined && (!isVec3(l.direction) || !nonZero(l.direction))) return 'direction inválida';
  if (l.kind === 'spot' && l.direction === undefined) return 'spot exige direction';
  if (typeof l.color !== 'string' || !HEX.test(l.color)) return 'color inválida (#rrggbb)';
  if (!(finite(l.intensity) && l.intensity >= 0)) return 'intensity precisa ser número >= 0';
  if (l.range !== undefined && !(finite(l.range) && l.range > 0)) return 'range precisa ser > 0';
  if (l.outerAngle !== undefined && !inRange(l.outerAngle, 0, PI)) return 'outerAngle fora de 0..π';
  if (l.innerAngle !== undefined) {
    const outer = finite(l.outerAngle) ? l.outerAngle : PI;
    if (!inRange(l.innerAngle, 0, outer)) return 'innerAngle fora de 0..outerAngle';
  }
  return null;
}

// ---- localização ----
const SITE: Record<'latitude' | 'longitude' | 'northAngle' | 'timezone' | 'sun', (v: unknown) => boolean> = {
  latitude: (v) => inRange(v, -90, 90),
  longitude: (v) => inRange(v, -180, 180),
  northAngle: (v) => finite(v),
  timezone: (v) => typeof v === 'string' && v.length > 0 && v.length <= 64 && TZ.test(v),
  sun: (v) => isObj(v) && finite(v.azimuth) && inRange(v.elevation, -PI / 2, PI / 2),
};

/** Problema de localização (texto) ou null. */
export function siteIssue(s: unknown): string | null {
  if (!isObj(s)) return 'site precisa ser objeto';
  for (const k of Object.keys(SITE) as Array<keyof typeof SITE>) {
    if (s[k] !== undefined && !SITE[k](s[k])) return `${k} inválido`;
  }
  return null;
}

/** Cópia da localização sem os campos inválidos. Devolve undefined quando nada válido sobra. */
export function siteSanitized(s: SceneSite): SceneSite | undefined {
  const out: Record<string, unknown> = { ...s };
  for (const k of Object.keys(SITE) as Array<keyof typeof SITE>) {
    if (out[k] !== undefined && !SITE[k](out[k])) delete out[k];
  }
  return Object.keys(out).length ? (out as SceneSite) : undefined;
}

// ---- malha ----
/** Normais, quando enviadas, têm um vetor (3 números) por vértice. Problema (texto) ou null. */
export function meshIssue(m: unknown): string | null {
  if (!isObj(m)) return 'malha precisa ser objeto';
  if (m.normals !== undefined && (!Array.isArray(m.positions) || !Array.isArray(m.normals) || m.normals.length !== m.positions.length)) return 'normals com tamanho diferente de positions';
  if (m.uvs !== undefined && (!Array.isArray(m.positions) || !Array.isArray(m.uvs) || m.uvs.length !== (m.positions.length / 3) * 2)) return 'uvs precisa ter 2 números por vértice';
  return null;
}

/** Cópia da malha sem normais/UVs inválidos (a geometria fica). */
export function meshSanitized(m: SceneMesh): SceneMesh {
  if (meshIssue(m) === null) return m;
  const out: SceneMesh = { ...m };
  const n = m.positions.length;
  if (out.normals !== undefined && (!Array.isArray(out.normals) || out.normals.length !== n)) delete out.normals;
  if (out.uvs !== undefined && (!Array.isArray(out.uvs) || out.uvs.length !== (n / 3) * 2)) delete out.uvs;
  return out;
}
