import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import { envoltoriaDasFontes, servicoTerreno, ServicoTerreno, type CurvaNivelTN, type LinhaPlantaTN } from '@hestia/engine';
import type { Id, Project, Terrain, TerrainRegion } from '@hestia/model';

/**
 * Seleção do terreno e da região de terreno na planta (ficha V2): funções puras, no molde de `pickRailingAt` e de `loteNoPonto`.
 *
 * - Terreno: seleciona-se pela BORDA ou por uma CURVA DE NÍVEL (as linhas que o kernel devolve e a planta desenha). O INTERIOR NÃO seleciona:
 *   senão o terreno engoliria os cliques da planta (A.8 item 7). Sem kernel, a borda de reserva (a do modelo, ou a envoltória das fontes).
 * - Região: pelo contorno (do modelo).
 * - O que está oculto na vista (`hidden`) não é alvo. Só entram terrenos e regiões do nível dado.
 */

/** As linhas selecionáveis do terreno vindas do kernel; `null` = kernel indisponível (vale a borda de reserva). */
export interface LinhasDoTerreno {
  bordas: LinhaPlantaTN[] | null;
  curvas: CurvaNivelTN[] | null;
}

/** As linhas do kernel para o nível (a planta e as curvas da superfície proposta). Sem terreno no projeto, nada é consultado. */
export function linhasDoTerreno(p: Project, levelId: Id): LinhasDoTerreno {
  if (!ServicoTerreno.temTerreno(p)) return { bordas: null, curvas: null };
  const s = servicoTerreno();
  return { bordas: s.planta(p, 1, levelId), curvas: s.curvas(p, 1, levelId) };
}

/** Polilinha como lista de pontos e se fecha. */
interface Linha {
  pts: Vec2[];
  fechada: boolean;
}

const doModelo = (c: readonly number[], passo: number): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < c.length; i += passo) out.push({ x: c[i]!, y: c[i + 1]! });
  return out;
};

/** Linhas de um terreno que se selecionam: a borda (do kernel; sem ele, a de reserva) e as curvas da superfície proposta. */
function linhasSelecionaveis(t: Terrain, l: LinhasDoTerreno): { borda: Linha[]; curvas: Linha[] } {
  const borda: Linha[] = [];
  const curvas: Linha[] = [];
  if (l.bordas) for (const b of l.bordas) if (b.terrenoId === t.id && b.pontos.length >= 2) borda.push({ pts: b.pontos, fechada: b.fechada });
  if (!l.bordas) {
    const r = t.borda && t.borda.length >= 6 ? doModelo(t.borda, 2) : envoltoriaDasFontes(t);
    if (r.length >= 3) borda.push({ pts: r, fechada: true });
  }
  if (l.curvas) for (const c of l.curvas) if (c.terrenoId === t.id && c.pontos.length >= 2) curvas.push({ pts: c.pontos, fechada: c.fechada });
  return { borda, curvas };
}

function terrenos(p: Project, levelId: Id, hidden?: ReadonlySet<Id>): Terrain[] {
  return Object.values(p.elements).filter((e): e is Terrain => e.kind === 'terrain' && e.levelId === levelId && !hidden?.has(e.id)).sort((a, b) => a.order - b.order);
}

function regioes(p: Project, levelId: Id, hidden?: ReadonlySet<Id>): TerrainRegion[] {
  return Object.values(p.elements).filter((e): e is TerrainRegion => e.kind === 'terrainRegion' && e.levelId === levelId && !hidden?.has(e.id)).sort((a, b) => a.order - b.order);
}

function segmentos(l: Linha): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = [];
  const n = l.pts.length;
  for (let i = 0; i + 1 < n; i++) out.push([l.pts[i]!, l.pts[i + 1]!]);
  if (l.fechada && n > 2) out.push([l.pts[n - 1]!, l.pts[0]!]);
  return out;
}

function distanciaALinha(q: Vec2, l: Linha): number {
  let d = Infinity;
  for (const [a, b] of segmentos(l)) d = Math.min(d, dist(q, closestOnSegment(q, a, b)));
  return d;
}

/**
 * O terreno ou a região visível do nível cuja borda, curva ou contorno passa a no máximo `tol` (m) de `at`, ou null. Empate: o mais próximo;
 * se igual, a região (está por cima) e depois o de menor id. O interior não conta.
 */
export function pickTerrenoAt(p: Project, levelId: Id, at: Vec2, tol: number, hidden?: ReadonlySet<Id>, linhas?: LinhasDoTerreno): Id | null {
  const l = linhas ?? linhasDoTerreno(p, levelId);
  let melhor: { id: Id; d: number; regiao: boolean } | null = null;
  const tenta = (id: Id, d: number, regiao: boolean): void => {
    if (d > tol) return;
    if (!melhor || d < melhor.d || (d === melhor.d && ((regiao && !melhor.regiao) || (regiao === melhor.regiao && id < melhor.id)))) melhor = { id, d, regiao };
  };
  for (const r of regioes(p, levelId, hidden)) tenta(r.id, distanciaALinha(at, { pts: r.contorno, fechada: true }), true);
  for (const t of terrenos(p, levelId, hidden)) {
    const { borda, curvas } = linhasSelecionaveis(t, l);
    for (const ln of [...borda, ...curvas]) tenta(t.id, distanciaALinha(at, ln), false);
  }
  return (melhor as { id: Id } | null)?.id ?? null;
}

/** Os dois segmentos se cruzam ou se tocam? */
function seCruzam(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2): number => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const noSeg = (p: Vec2, q: Vec2, r: Vec2): boolean => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && noSeg(a, b, c)) || (o2 === 0 && noSeg(a, b, d)) || (o3 === 0 && noSeg(c, d, a)) || (o4 === 0 && noSeg(c, d, b));
}

/**
 * Terrenos e regiões do nível selecionados por uma caixa (de `a` a `b`). Janela (`b.x >= a.x`): todos os vértices da borda (terreno) ou do contorno
 * (região) dentro da caixa. Cruzamento: algum segmento de borda, curva ou contorno toca a caixa. Caixa inteira dentro do terreno, sem tocar
 * nenhuma linha, não o seleciona (o interior não conta).
 */
export function pickTerrenosInBox(p: Project, levelId: Id, a: Vec2, b: Vec2, hidden?: ReadonlySet<Id>, linhas?: LinhasDoTerreno): Id[] {
  const l = linhas ?? linhasDoTerreno(p, levelId);
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const janela = b.x >= a.x;
  const dentro = (q: Vec2): boolean => q.x >= min.x && q.x <= max.x && q.y >= min.y && q.y <= max.y;
  const cantos: Vec2[] = [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
  const toca = (ln: Linha): boolean => ln.pts.some(dentro) || segmentos(ln).some(([s, e]) => cantos.some((k, j) => seCruzam(s, e, k, cantos[(j + 1) % 4]!)));
  const out: Id[] = [];
  for (const r of regioes(p, levelId, hidden)) {
    const ln = { pts: r.contorno, fechada: true };
    if (janela ? r.contorno.length > 0 && r.contorno.every(dentro) : toca(ln)) out.push(r.id);
  }
  for (const t of terrenos(p, levelId, hidden)) {
    const { borda, curvas } = linhasSelecionaveis(t, l);
    const ok = janela ? borda.length > 0 && borda.every((ln) => ln.pts.every(dentro)) : [...borda, ...curvas].some(toca);
    if (ok) out.push(t.id);
  }
  return out;
}
