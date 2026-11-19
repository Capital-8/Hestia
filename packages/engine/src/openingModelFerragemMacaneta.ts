import type { OPt } from '@hestia/model';
import type { FerragemAviso, OpeningPart } from './openingModelTypes.ts';
import { anelDaPeca, dentroDoAnel, type Anel } from './openingFerragemGeom.ts';

/*
 * Maçaneta (roseta, haste, alavanca, bola, placa da fechadura, puxador) em vão com forma (docs/estudo-esquadrias/42). A maçaneta anda
 * INTEIRA, com o mesmo deslocamento em todas as peças, e só vale onde todos os pontos dela (o perfil de cada peça) caem sobre a folha
 * (folha, vidro e almofadas do mesmo `leaf`) e dentro do contorno; as peças que encostam na face da folha (roseta, placa, base do puxador)
 * têm de estar sobre a madeira da folha, não sobre o vidro. Ordem de procura, sempre pelo menor deslocamento:
 * 1. onde está (a altura do tipo, usual ~1,00 m, no recuo do tipo);
 * 2. mudando só a altura (o trecho da folha naquela posição lateral);
 * 3. mudando o t (de preferência para o centro da folha, mas também para o montante) e a altura.
 * Sem posição nenhuma a maçaneta sai e o aviso diz `colocado: 0`: não fica solta.
 */

const TOL = 1e-3;
const PASSO = 0.01;
const AFINA = 0.0025;
const FACE: ReadonlySet<string> = new Set(['leaf', 'glass', 'leafPanel']);

/** Ponto (t, z) de uma peça da maçaneta; `assentada` = a peça encosta na face da folha (s) e então tem de estar sobre a madeira da folha. */
interface Ponto {
  p: OPt;
  assentada: boolean;
}

/** Pontos (t, z) de todas as peças do grupo, sem repetição (perfil `tz` ou cantos da caixa). */
function pontos(g: readonly OpeningPart[], s0: number, s1: number): Ponto[] {
  const vistos = new Set<string>();
  const out: Ponto[] = [];
  for (const p of g) {
    const assentada = Math.max(0, p.box.s0 - s1, s0 - p.box.s1) <= TOL;
    const pts: Anel = p.profile?.plane === 'tz' ? p.profile.pts : [[p.box.t0, p.box.z0], [p.box.t1, p.box.z0], [p.box.t1, p.box.z1], [p.box.t0, p.box.z1]];
    for (const q of pts) {
      const k = `${Math.round(q[0] * 1e6)}:${Math.round(q[1] * 1e6)}:${assentada}`;
      if (!vistos.has(k)) {
        vistos.add(k);
        out.push({ p: q, assentada });
      }
    }
  }
  return out;
}

const chaveDaMacaneta = (id: string): string => id.split('-').slice(0, 2).join('-');

/** Deslocamento de menor custo que põe todos os pontos sobre a folha; `null` quando não há; `{0, 0}` quando já está. */
function deslocamento(pts: readonly Ponto[], madeira: readonly Anel[], faces: readonly Anel[], bruto: Anel, tCentro: number): { dt: number; dz: number } | null {
  const sobre = (dt: number, dz: number): boolean => pts.every(({ p: [x, z], assentada }) => (assentada ? madeira : faces).some((a) => dentroDoAnel(a, x + dt, z + dz, TOL)) && dentroDoAnel(bruto, x + dt, z + dz, TOL));
  if (sobre(0, 0)) return { dt: 0, dz: 0 };
  const media = pts.reduce((s, q) => s + q.p[0], 0) / pts.length;
  const lado = tCentro >= media ? 1 : -1;
  const alcance = Math.max(...pts.map((q) => Math.abs(q.p[0] - tCentro))) + 0.05;
  const best: { v: { dt: number; dz: number; custo: number } | null } = { v: null };
  // `dt` é o deslocamento com sinal; o sentido do centro da folha vem primeiro (o empate fica com ele)
  const tenta = (dt: number, dz: number): boolean => {
    const custo = Math.hypot(dt, dz);
    if ((best.v && custo >= best.v.custo) || !sobre(dt, dz)) return false;
    best.v = { dt, dz, custo };
    return true;
  };
  for (let a = 0; a <= alcance && (!best.v || a < best.v.custo); a += PASSO) {
    for (let k = 0; k * PASSO < (best.v?.custo ?? 2); k++) {
      const achou = [lado * a, -lado * a].some((dt) => (k === 0 ? tenta(dt, 0) : tenta(dt, -k * PASSO) || tenta(dt, k * PASSO)));
      if (achou) break;
    }
  }
  const m0 = best.v;
  if (!m0) return null;
  for (let dt = m0.dt - PASSO; dt <= m0.dt + PASSO + 1e-12; dt += AFINA) {
    for (let dz = m0.dz - PASSO; dz <= m0.dz + PASSO + 1e-12; dz += AFINA) tenta(dt, dz);
  }
  const r = best.v as { dt: number; dz: number };
  return { dt: r.dt, dz: r.dz };
}

/** Maçanetas recolocadas sobre a folha: `troca` por peça (vazio = a peça sai) e os avisos das que não couberam. */
export function macanetaNaFolha(parts: readonly OpeningPart[], hands: readonly OpeningPart[], bruto: Anel): { troca: Map<OpeningPart, OpeningPart[]>; avisos: FerragemAviso[] } {
  const troca = new Map<OpeningPart, OpeningPart[]>();
  const avisos: FerragemAviso[] = [];
  const grupos = new Map<string, OpeningPart[]>();
  for (const h of hands) grupos.set(chaveDaMacaneta(h.id), [...(grupos.get(chaveDaMacaneta(h.id)) ?? []), h]);
  for (const [chave, g] of grupos) {
    const idx = g[0]!.leaf;
    const pecas = parts.filter((p) => FACE.has(p.role) && !p.dashed && idx !== undefined && p.leaf === idx);
    const folha = pecas.filter((p) => p.role === 'leaf');
    if (folha.length === 0) continue;
    const faces = pecas.map(anelDaPeca);
    const tFaces = faces.flatMap((a) => a.map((p) => p[0]));
    const pts = pontos(g, Math.min(...folha.map((p) => p.box.s0)), Math.max(...folha.map((p) => p.box.s1)));
    const d = deslocamento(pts, folha.map(anelDaPeca), faces, bruto, (Math.min(...tFaces) + Math.max(...tFaces)) / 2);
    if (!d) {
      g.forEach((p) => troca.set(p, []));
      avisos.push({ tipo: 'handle', folha: chave.split('-')[1]!, pedido: 1, colocado: 0 });
    } else if (d.dt !== 0 || d.dz !== 0) {
      for (const p of g) {
        const b = p.box;
        const profile = p.profile && { plane: p.profile.plane, pts: p.profile.pts.map(([x, z]): [number, number] => (p.profile!.plane === 'tz' ? [x + d.dt, z + d.dz] : p.profile!.plane === 'sz' ? [x, z + d.dz] : [x + d.dt, z])) };
        troca.set(p, [{ ...p, box: { ...b, t0: b.t0 + d.dt, t1: b.t1 + d.dt, z0: b.z0 + d.dz, z1: b.z1 + d.dz }, ...(profile ? { profile } : {}) }]);
      }
    }
  }
  return { troca, avisos };
}
