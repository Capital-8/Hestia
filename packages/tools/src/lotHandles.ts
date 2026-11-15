import { applyTransform, closestOnSegment, dist, type Transform, type Vec2 } from '@hestia/geom';
import { isLot, lotIssue, normalizarLote, type Id, type LadoLote, type Lot, type Project } from '@hestia/model';
import { langOf, t as translate } from './i18n.ts';
import { lotesDoNivel } from './lotPick.ts';
import { registrarAlcasDeElemento, type GripFocus, type GripHold, type GripProvider } from './selectGrips.ts';
import type { PreviewItem, ToolEnv } from './types.ts';

/**
 * O lote nas ferramentas de modificação (regra 3 do contrato) e as suas alças de vértice (molde `terrainRegionHandles.ts`). Tudo aqui é DADO
 * DO MODELO (polígono e lados); o lote não usa o kernel (D8).
 *
 * - Mover, copiar, girar, espelhar e matriz levam o lote pelo comando genérico `transform` (`transformLot`, no modelo); aqui ficam a seleção
 *   (`selectedLots`), o fantasma (`ghostLote`) e a aresta do Alinhar (`bordasDoLote`).
 * - Alças: um ponto em cada vértice e no meio de cada aresta. Arrastar um vértice mantém `lados`; arrastar o meio de uma aresta insere um
 *   vértice e DUPLICA o papel e o recuo daquele lado; Delete no vértice em foco o remove e FUNDE os dois lados (fica o do primeiro). Cada
 *   gesto grava `setLotContorno` (um desfazer).
 */

/** Lotes dentro da seleção. */
export const selectedLots = (p: Project, ids: readonly Id[]): Id[] => ids.filter((id) => isLot(p.elements[id]));

/** Fantasma do lote sob uma transformação (pré-visualização de mover, girar, espelhar e copiar). */
export function ghostLote(p: Project, id: Id, t: Transform): PreviewItem[] {
  const l = p.elements[id];
  return isLot(l) ? [{ kind: 'polygon', ring: l.contorno.map((q) => applyTransform(t, q)), dashed: true }] : [];
}

/** Aresta do contorno de um lote (Alinhar): `i` é o vértice inicial; `d`, a distância ao cursor. */
export interface BordaDeLote {
  loteId: Id;
  nome: string;
  i: number;
  a: Vec2;
  b: Vec2;
  d: number;
}

/** Arestas do contorno dos lotes do nível a até `tol` do cursor (Alinhar: feição `bordaLote`, política `transladar`). */
export function bordasDoLote(p: Project, levelId: Id, at: Vec2, tol: number, hidden?: ReadonlySet<Id>): BordaDeLote[] {
  const out: BordaDeLote[] = [];
  for (const l of lotesDoNivel(p, levelId, hidden)) {
    l.contorno.forEach((a, i) => {
      const b = l.contorno[(i + 1) % l.contorno.length]!;
      const d = dist(at, closestOnSegment(at, a, b));
      if (dist(a, b) > 1e-9 && d <= tol) out.push({ loteId: l.id, nome: l.name, i, a, b, d });
    });
  }
  return out;
}

// ---- edição do contorno (puras) ------------------------------------------------------------------------------------------------

export interface ContornoDoLote {
  contorno: Vec2[];
  lados: LadoLote[];
}

/** Move o vértice `i` para `pt`; `lados` não muda. */
export const moverVerticeDoLote = (c: ContornoDoLote, i: number, pt: Vec2): ContornoDoLote => ({
  contorno: c.contorno.map((q, k) => (k === i ? pt : { ...q })),
  lados: c.lados.map((l) => ({ ...l })),
});

/** Insere um vértice em `pt` logo depois do vértice `i` (divide o lado `i`): os dois lados novos copiam o papel e o recuo do lado `i`. */
export function inserirVerticeDoLote(c: ContornoDoLote, i: number, pt: Vec2): ContornoDoLote {
  const contorno = [...c.contorno.slice(0, i + 1).map((q) => ({ ...q })), pt, ...c.contorno.slice(i + 1).map((q) => ({ ...q }))];
  const lados = c.lados.map((l) => ({ ...l }));
  lados.splice(i + 1, 0, { ...c.lados[i]! });
  return { contorno, lados };
}

/**
 * Remove o vértice `i`: os dois lados que se encontravam nele viram um só e fica o PRIMEIRO (o que chega ao vértice, `lados[i − 1]`; no
 * vértice 0, `lados[n − 1]`). Devolve null se sobrariam menos de 3 vértices.
 */
export function removerVerticeDoLote(c: ContornoDoLote, i: number): ContornoDoLote | null {
  if (c.contorno.length <= 3) return null;
  return { contorno: c.contorno.filter((_, k) => k !== i).map((q) => ({ ...q })), lados: c.lados.filter((_, k) => k !== i).map((l) => ({ ...l })) };
}

/**
 * Grava um contorno editado (`setLotContorno`, um desfazer). O lote recusa contorno inválido (cruzado...): a mensagem do modelo vai para a barra
 * de status e nada muda. Devolve se gravou.
 */
export function gravarContornoDoLote(env: ToolEnv, id: Id, c: ContornoDoLote): boolean {
  const lang = langOf(env);
  const atual = env.project().elements[id];
  if (!isLot(atual)) return false;
  const norm = normalizarLote(c.contorno, c.lados);
  const problema = lotIssue({ ...atual, ...norm }, lang);
  if (problema) {
    env.say(problema);
    return false;
  }
  env.transaction(translate(lang, 'tl_lt_undo_contorno'), () => env.exec({ type: 'setLotContorno', id, contorno: c.contorno, lados: c.lados }));
  env.say(translate(lang, 'tl_lt_contorno_editado'));
  return true;
}

// ---- alças --------------------------------------------------------------------------------------------------------------------

/** Alça de um lote: vértice (índice do contorno) ou meio de uma aresta (a aresta i vai de i a i+1). */
export interface AlcaDeLote {
  loteId: Id;
  kind: 'vertex' | 'edge';
  index: number;
  at: Vec2;
}

const meio = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const selecionados = (p: Project, ids: readonly Id[]): Lot[] => ids.map((id) => p.elements[id]).filter(isLot);

/** Alça sob o cursor entre os lotes selecionados: vértices têm prioridade sobre o meio das arestas. */
export function alcaDoLoteEm(p: Project, ids: readonly Id[], at: Vec2, mpp: number): AlcaDeLote | null {
  const tol = 9 * mpp;
  const lotes = selecionados(p, ids);
  for (const l of lotes) {
    const i = l.contorno.findIndex((q) => dist(q, at) <= tol);
    if (i >= 0) return { loteId: l.id, kind: 'vertex', index: i, at: l.contorno[i]! };
  }
  for (const l of lotes) {
    for (let i = 0; i < l.contorno.length; i++) {
      const m = meio(l.contorno[i]!, l.contorno[(i + 1) % l.contorno.length]!);
      if (dist(m, at) <= tol) return { loteId: l.id, kind: 'edge', index: i, at: m };
    }
  }
  return null;
}

const contornoDepois = (l: Lot, vertice: boolean, index: number, pt: Vec2): ContornoDoLote => (vertice ? moverVerticeDoLote(l, index, pt) : inserirVerticeDoLote(l, index, pt));

/** Alça de vértice ou de meio de aresta: arrastar grava o contorno novo (um desfazer); clicar num vértice o põe em foco. */
function alcaHold(env: ToolEnv, g: AlcaDeLote): GripHold {
  const vertice = g.kind === 'vertex';
  let ponto: Vec2 = g.at;
  const lote = (): Lot | null => {
    const l = env.project().elements[g.loteId];
    return isLot(l) ? l : null;
  };
  return {
    at: g.at,
    keepsFocus: true,
    drag(_p, snap) {
      const l = lote();
      if (!l) return [];
      // O vértice arrastado não se captura a si mesmo, mas os outros vértices do próprio lote servem de alvo.
      ponto = snap({ extraPoints: vertice ? l.contorno.filter((_, i) => i !== g.index) : l.contorno, ignore: new Set([g.loteId]) });
      return [{ kind: 'polygon', ring: l.contorno, dashed: true }, { kind: 'polygon', ring: contornoDepois(l, vertice, g.index, ponto).contorno }];
    },
    release(_p, setFocus) {
      const l = lote();
      if (!l) return;
      if (dist(ponto, g.at) > 1e-6) gravarContornoDoLote(env, g.loteId, contornoDepois(l, vertice, g.index, ponto));
      else if (vertice) {
        setFocus({ id: g.loteId, index: g.index });
        env.say(translate(langOf(env), 'tl_lt_vertice_foco'));
      }
    },
  };
}

/** Provedor de alças do lote para `selectGrips` (`registrarAlcasDeElemento`). */
export const alcaDoLote: GripProvider = (env, at) => {
  const g = alcaDoLoteEm(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? alcaHold(env, g) : null;
};

/**
 * Delete com um vértice de lote em foco: remove o vértice e funde os dois lados. Devolve o novo foco, ou `null` se o foco não é de lote (quem
 * chama segue com o Delete de sempre). `undefined` indica edição recusada (menos de 3 vértices ou contorno inválido).
 */
export function removerVerticeDoFocoDoLote(env: ToolEnv, foco: GripFocus): GripFocus | null | undefined {
  const l = env.project().elements[foco.id];
  if (!isLot(l) || !env.selection().includes(l.id) || foco.index >= l.contorno.length) return null;
  const c = removerVerticeDoLote(l, foco.index);
  if (!c) {
    env.say(translate(langOf(env), 'tl_lt_min_vertices'));
    return undefined;
  }
  if (!gravarContornoDoLote(env, l.id, c)) return undefined;
  return { id: l.id, index: Math.min(foco.index, c.contorno.length - 1) };
}

/** Alças desenhadas nos lotes selecionados do nível (vértices e meio das arestas). */
export function previaDasAlcasDoLote(env: ToolEnv): PreviewItem[] {
  const out: PreviewItem[] = [];
  for (const l of selecionados(env.project(), env.selection())) {
    if (l.levelId !== env.levelId()) continue;
    l.contorno.forEach((a, i) => out.push({ kind: 'point', at: a }, { kind: 'point', at: meio(a, l.contorno[(i + 1) % l.contorno.length]!) }));
  }
  return out;
}

let registrada = false;

/** Liga as alças do lote à ferramenta de seleção (uma vez só; o `selectTool` chama ao carregar). */
export function registrarAlcasDoLote(): void {
  if (registrada) return;
  registrada = true;
  registrarAlcasDeElemento(alcaDoLote, previaDasAlcasDoLote);
}
