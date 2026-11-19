import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import type { Command, Id, Project, Terrain } from '@hestia/model';
import { linhaDeRotulo, pontoCotado } from './terrainEditPick.ts';

/**
 * Itens de ANOTAÇÃO do terreno (cota de ponto e linha de rótulo de curva) como alvos de seleção. Eles moram em vetores do terreno
 * (`pontosCotados`, `linhasRotulo`), sem id próprio; aqui cada um ganha um id sintético `<terreno>#cotado:<i>` / `<terreno>#rotulo:<i>`,
 * válido só enquanto o vetor não muda (a seleção é limpa ao apagar). Funções puras, sem kernel.
 */
export type TipoItemTerreno = 'cotado' | 'rotulo';

export interface ItemTerreno {
  terrenoId: Id;
  tipo: TipoItemTerreno;
  i: number;
}

export const idItemTerreno = (terrenoId: Id, tipo: TipoItemTerreno, i: number): Id => `${terrenoId}#${tipo}:${i}`;

export function itemDeTerrenoDoId(id: Id): ItemTerreno | null {
  const m = /^(.+)#(cotado|rotulo):(\d+)$/.exec(id);
  return m ? { terrenoId: m[1]!, tipo: m[2] as TipoItemTerreno, i: Number(m[3]) } : null;
}

function terrenosDoNivel(p: Project, levelId: Id, hidden?: ReadonlySet<Id>): Terrain[] {
  return Object.values(p.elements).filter((e): e is Terrain => e.kind === 'terrain' && e.levelId === levelId && !hidden?.has(e.id)).sort((a, b) => a.order - b.order);
}

/** Raio (px) de captura da cota de ponto e distância (px) da linha de rótulo. */
export const TERRENO_CAPTURA_COTADO_PX = 12;
export const TERRENO_CAPTURA_ROTULO_PX = 6;

/** Cota de ponto ou linha de rótulo do terreno sob `at` (o mais próximo; a cota de ponto ganha o empate), ou null. */
export function itemDeTerrenoNoPonto(p: Project, levelId: Id, at: Vec2, mpp: number, hidden?: ReadonlySet<Id>): Id | null {
  let melhor: { id: Id; d: number } | null = null;
  for (const t of terrenosDoNivel(p, levelId, hidden)) {
    for (let i = 0; pontoCotado(t, i); i++) {
      const d = dist(pontoCotado(t, i)!, at);
      if (d <= TERRENO_CAPTURA_COTADO_PX * mpp && (!melhor || d < melhor.d)) melhor = { id: idItemTerreno(t.id, 'cotado', i), d };
    }
    for (let i = 0; linhaDeRotulo(t, i); i++) {
      const [a, b] = linhaDeRotulo(t, i)!;
      const d = dist(at, closestOnSegment(at, a, b));
      if (d <= TERRENO_CAPTURA_ROTULO_PX * mpp && (!melhor || d < melhor.d)) melhor = { id: idItemTerreno(t.id, 'rotulo', i), d };
    }
  }
  return melhor?.id ?? null;
}

/** Geometria do item para o realce: um ponto (cota) ou um segmento (linha de rótulo); null se o id não existe mais. */
export function geometriaDoItemDeTerreno(p: Project, id: Id): { ponto: Vec2 } | { a: Vec2; b: Vec2 } | null {
  const it = itemDeTerrenoDoId(id);
  const t = it ? p.elements[it.terrenoId] : undefined;
  if (!it || !t || t.kind !== 'terrain') return null;
  if (it.tipo === 'cotado') {
    const q = pontoCotado(t, it.i);
    return q ? { ponto: q } : null;
  }
  const l = linhaDeRotulo(t, it.i);
  return l ? { a: l[0], b: l[1] } : null;
}

/** Ids da seleção que são itens de terreno cujo ponto (cota) ou segmento (rótulo) toca a janela `a`-`b` (esquerda→direita contém; direita→esquerda cruza). */
export function itensDeTerrenoNaJanela(p: Project, levelId: Id, a: Vec2, b: Vec2, hidden?: ReadonlySet<Id>): Id[] {
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const cruza = b.x < a.x;
  const dentro = (q: Vec2): boolean => q.x >= min.x && q.x <= max.x && q.y >= min.y && q.y <= max.y;
  const out: Id[] = [];
  for (const t of terrenosDoNivel(p, levelId, hidden)) {
    for (let i = 0; pontoCotado(t, i); i++) if (dentro(pontoCotado(t, i)!)) out.push(idItemTerreno(t.id, 'cotado', i));
    for (let i = 0; linhaDeRotulo(t, i); i++) {
      const [s, e] = linhaDeRotulo(t, i)!;
      const caixaToca = Math.min(s.x, e.x) <= max.x && Math.max(s.x, e.x) >= min.x && Math.min(s.y, e.y) <= max.y && Math.max(s.y, e.y) >= min.y;
      if (dentro(s) && dentro(e) ? true : cruza && caixaToca) out.push(idItemTerreno(t.id, 'rotulo', i));
    }
  }
  return out;
}

/** Comandos que apagam os itens de terreno de `ids` (um `editTerrainFontes` por terreno; ids que não são de terreno são ignorados). */
export function removerItensDeTerreno(p: Project, ids: readonly Id[]): Command[] {
  const porTerreno = new Map<Id, { cotado: Set<number>; rotulo: Set<number> }>();
  for (const id of ids) {
    const it = itemDeTerrenoDoId(id);
    if (!it) continue;
    const e = porTerreno.get(it.terrenoId) ?? { cotado: new Set<number>(), rotulo: new Set<number>() };
    e[it.tipo].add(it.i);
    porTerreno.set(it.terrenoId, e);
  }
  const sem = (v: readonly number[], k: Set<number>, n: number): number[] => v.filter((_, m) => !k.has(Math.floor(m / n)));
  const cmds: Command[] = [];
  for (const [terrenoId, e] of porTerreno) {
    const t = p.elements[terrenoId];
    if (!t || t.kind !== 'terrain') continue;
    const ops = [
      ...(e.cotado.size ? [{ op: 'setPontosCotados' as const, v: sem(t.pontosCotados, e.cotado, 2) }] : []),
      ...(e.rotulo.size ? [{ op: 'setLinhasRotulo' as const, v: sem(t.linhasRotulo, e.rotulo, 4) }] : []),
    ];
    if (ops.length) cmds.push({ type: 'editTerrainFontes', terrenoId, ops });
  }
  return cmds;
}
