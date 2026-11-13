import type { Project } from './types.ts';

/**
 * Preparo do projeto para renderizadores externos (plugins, protocolo 1.3; docs/plugins/09-extensao-render.md).
 *
 * O modelo nativo não tinha local, fuso nem luminárias; sem isso o renderizador não sabe onde a casa está nem como
 * iluminar o interior. Tudo aqui é opcional e aditivo (sem mudar `SCHEMA_VERSION`): projeto antigo abre igual.
 * Nada disto desenha geometria no Hestia: só informa o plugin. As unidades seguem o contrato de cena (metros, Z para
 * cima, ângulos em radiano, intensidade em candela).
 */
export interface ProjectSite {
  /** Graus, -90 a 90 (negativo = sul). */
  latitude?: number;
  /** Graus, -180 a 180 (negativo = oeste). */
  longitude?: number;
  /** Radiano, anti-horário visto de cima, a partir de +Y (0 = o norte do modelo é +Y). */
  northAngle?: number;
  /** Nome IANA do fuso, por exemplo `America/Sao_Paulo`. */
  timezone?: string;
  /** Data e hora locais (`AAAA-MM-DDTHH:MM`) para as quais o sol da vista 3D foi calculado. Só informativo. */
  sunLocalTime?: string;
}

export interface RenderLight {
  id: string;
  /** Rótulo humano (ambiente onde a luz está). Não vai para o plugin. */
  name?: string;
  kind: 'point' | 'spot' | 'area';
  /** Metros, Z para cima. */
  position: { x: number; y: number; z: number };
  /** Obrigatória no `spot` (não nula). */
  direction?: { x: number; y: number; z: number };
  /** `#rrggbb`. */
  color: string;
  /** Candela. */
  intensity: number;
  /** Metros, > 0. */
  range?: number;
  innerAngle?: number;
  outerAngle?: number;
}

export interface RenderSetup {
  site?: ProjectSite;
  lights?: RenderLight[];
}

export type RenderSetupCommand = { type: 'setRenderSetup'; setup: RenderSetup | null };

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const HEX = /^#[0-9a-fA-F]{6}$/;
const vec = (v: unknown): boolean => !!v && typeof v === 'object' && finite((v as { x: unknown }).x) && finite((v as { y: unknown }).y) && finite((v as { z: unknown }).z);

/** Motivo de recusa do preparo, ou null. */
export function renderSetupIssue(s: RenderSetup): string | null {
  const site = s.site;
  if (site) {
    if (site.latitude !== undefined && !(finite(site.latitude) && Math.abs(site.latitude) <= 90)) return 'Latitude inválida (-90 a 90).';
    if (site.longitude !== undefined && !(finite(site.longitude) && Math.abs(site.longitude) <= 180)) return 'Longitude inválida (-180 a 180).';
    if (site.northAngle !== undefined && !finite(site.northAngle)) return 'Ângulo do norte inválido.';
    if (site.timezone !== undefined && !(typeof site.timezone === 'string' && /^[A-Za-z0-9_+\-/]{1,64}$/.test(site.timezone))) return 'Fuso inválido.';
  }
  const ids = new Set<string>();
  for (const l of s.lights ?? []) {
    if (!l.id || ids.has(l.id)) return `Luz com id vazio ou repetido: ${l.id}`;
    ids.add(l.id);
    if (!['point', 'spot', 'area'].includes(l.kind)) return `Tipo de luz inválido: ${l.id}`;
    if (!vec(l.position)) return `Posição inválida: ${l.id}`;
    if (!HEX.test(l.color)) return `Cor inválida (use #rrggbb): ${l.id}`;
    if (!(finite(l.intensity) && l.intensity >= 0)) return `Intensidade inválida (candela >= 0): ${l.id}`;
    if (l.range !== undefined && !(finite(l.range) && l.range > 0)) return `Alcance inválido: ${l.id}`;
    if (l.kind === 'spot') {
      const d = l.direction;
      if (!vec(d) || Math.hypot(d!.x, d!.y, d!.z) === 0) return `Spot sem direção: ${l.id}`;
    }
  }
  return null;
}

export function applyRenderSetupCommand(p: Project, c: RenderSetupCommand): void {
  if (c.setup === null) {
    delete p.render;
    return;
  }
  const issue = renderSetupIssue(c.setup);
  if (issue) throw new Error(issue);
  p.render = structuredClone(c.setup);
}

/**
 * Posição do sol (aproximação astronômica NOAA, erro de ordem de 1 grau) para a latitude/longitude e o instante UTC.
 * Devolve azimute de bússola (graus, 0 = norte, horário) e elevação (graus acima do horizonte).
 */
export function sunPosition(latitudeDeg: number, longitudeDeg: number, instante: Date): { compassDeg: number; elevationDeg: number } {
  const rad = Math.PI / 180;
  const dia = instante.getTime() / 86400000 + 2440587.5 - 2451545.0; // dias desde J2000
  const g = (357.529 + 0.98560028 * dia) * rad;
  const q = 280.459 + 0.98564736 * dia;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * dia) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * dia) % 24; // horas
  const H = ((gmst * 15 + longitudeDeg) * rad) - ra;
  const lat = latitudeDeg * rad;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const alt = Math.asin(sinAlt);
  const az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H));
  return { compassDeg: ((az / rad) % 360 + 360) % 360, elevationDeg: alt / rad };
}

/** Azimute de bússola → azimute do Hestia (0 = leste, anti-horário), com o norte do modelo em +Y girado por `northAngle`. */
export function compassParaAzimuteHestia(compassDeg: number, northAngleRad = 0): number {
  const deg = 90 - compassDeg + (northAngleRad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
