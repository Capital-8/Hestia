import { closestOnSegment, dist, type Transform, type Vec2 } from '@hestia/geom';
import {
  contornoRegiaoIssue,
  isTerrainRegion,
  newId,
  normalizarContorno,
  transformTerrainRegion,
  unitsOf,
  type Command,
  type Id,
  type Project,
  type TerrainRegion,
} from '@hestia/model';
import { ringInsertAfter, ringMoveVertex, ringRemoveVertex } from './floorPick.ts';
import { langOf, t as translate } from './i18n.ts';
import { registrarAlcasDeElemento, type GripFocus, type GripHold, type GripProvider } from './selectGrips.ts';
import { slopePreview } from './slabSlope.ts';
import { verticesForaDoTerreno } from './terrainRegionPick.ts';
import type { PreviewItem, ToolEnv } from './types.ts';

/**
 * A região de terreno nas ferramentas de modificação (regra 3 do contrato) e as suas alças de vértice (molde `outlineEdit.ts` e `ringHold`).
 * Tudo aqui é DADO DO MODELO (o polígono e os parâmetros da região): a malha, as curvas e os volumes vêm do kernel.
 *
 * - A região SOZINHA na seleção se move, copia, gira e espelha (`regioesSozinhas`, `comandosCopiaRegioes`); a cópia mantém o `terrenoId` do
 *   terreno original. Região selecionada JUNTO do terreno anda com ele (`selectedTerrenosComRegioes`, `comandosCopiaTerreno`).
 * - Alças: um ponto em cada vértice e no meio de cada aresta; arrastar grava `setTerrainRegionContorno` (um desfazer). Delete remove o
 *   vértice em foco (mínimo de 3). A seta de subida (`inclinacao` > 0) é desenhada enquanto a região está selecionada.
 */

/** Regiões da seleção cujo terreno NÃO está na seleção: as que andam sozinhas (as outras seguem o terreno). */
export function regioesSozinhas(p: Project, ids: readonly Id[]): Id[] {
  const out: Id[] = [];
  for (const id of ids) {
    const r = p.elements[id];
    if (isTerrainRegion(r) && !ids.includes(r.terrenoId) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Cópia das regiões sozinhas de `ids` sob a transformação `t` (e `dz` somado à cota das que têm plano): um `addTerrainRegion` por região,
 * com o `terrenoId` do terreno ORIGINAL (a região copiada continua no mesmo terreno). Devolve também o mapa de ids (original para cópia).
 */
export function comandosCopiaRegioes(p: Project, ids: readonly Id[], t: Transform, dz = 0, mint: (prefixo: string) => Id = newId): { commands: Command[]; idMap: Record<Id, Id> } {
  const commands: Command[] = [];
  const idMap: Record<Id, Id> = {};
  for (const id of regioesSozinhas(p, ids)) {
    const r = p.elements[id] as TerrainRegion;
    const novo = mint('rg');
    idMap[id] = novo;
    const { order: _ordem, ...resto } = transformTerrainRegion(r, t);
    commands.push({ type: 'addTerrainRegion', regiao: { ...resto, id: novo, cota: resto.papel === 'subdivisao' ? resto.cota : resto.cota + dz, contorno: resto.contorno.map((q) => ({ ...q })) } });
  }
  return { commands, idMap };
}

/** Aresta do contorno de uma região (Alinhar): `i` é a posição do vértice inicial; `d`, a distância ao cursor. */
export interface BordaDeRegiao {
  regiaoId: Id;
  nome: string;
  i: number;
  a: Vec2;
  b: Vec2;
  d: number;
}

/** Arestas do contorno das regiões do nível a até `tol` do cursor (Alinhar: feição `bordaRegiao`, política `transladar`). */
export function bordasDeRegiao(p: Project, levelId: Id, at: Vec2, tol: number, hidden?: ReadonlySet<Id>): BordaDeRegiao[] {
  const out: BordaDeRegiao[] = [];
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'terrainRegion' || e.levelId !== levelId || hidden?.has(e.id)) continue;
    e.contorno.forEach((a, i) => {
      const b = e.contorno[(i + 1) % e.contorno.length]!;
      const d = dist(at, closestOnSegment(at, a, b));
      if (dist(a, b) > 1e-9 && d <= tol) out.push({ regiaoId: e.id, nome: e.name, i, a, b, d });
    });
  }
  return out;
}

// ---- alças de vértice ---------------------------------------------------------------------------------------------------------

/** Alça de uma região: vértice (índice do contorno) ou meio de uma aresta (a aresta i vai de i a i+1). */
export interface AlcaDeRegiao {
  regiaoId: Id;
  kind: 'vertex' | 'edge';
  index: number;
  at: Vec2;
}

const meio = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Regiões selecionadas, no nível pedido (as alças só aparecem na planta do nível da região). */
function selecionadas(p: Project, ids: readonly Id[]): TerrainRegion[] {
  return ids.map((id) => p.elements[id]).filter(isTerrainRegion);
}

/** Alça sob o cursor entre as regiões selecionadas: vértices têm prioridade sobre o meio das arestas. */
export function alcaDaRegiaoEm(p: Project, ids: readonly Id[], at: Vec2, mpp: number): AlcaDeRegiao | null {
  const tol = 9 * mpp;
  const regioes = selecionadas(p, ids);
  for (const r of regioes) {
    const i = r.contorno.findIndex((q) => dist(q, at) <= tol);
    if (i >= 0) return { regiaoId: r.id, kind: 'vertex', index: i, at: r.contorno[i]! };
  }
  for (const r of regioes) {
    for (let i = 0; i < r.contorno.length; i++) {
      const m = meio(r.contorno[i]!, r.contorno[(i + 1) % r.contorno.length]!);
      if (dist(m, at) <= tol) return { regiaoId: r.id, kind: 'edge', index: i, at: m };
    }
  }
  return null;
}

/** Contorno com o vértice movido ou, na alça do meio, com um vértice novo logo depois da aresta. */
const contornoDepois = (ring: Vec2[], vertice: boolean, index: number, pt: Vec2): Vec2[] => (vertice ? ringMoveVertex(ring, index, pt) : ringInsertAfter(ring, index, pt));

/**
 * Grava um contorno editado. A região recusa contorno inválido (cruzado, menos de 3 pontos...): a mensagem do modelo vai para a barra de
 * status e nada muda. Devolve se gravou. Avisa, sem impedir, quando algum vértice ficou fora do terreno (a parte de fora se perde: aviso 6).
 */
export function gravarContornoDaRegiao(env: ToolEnv, id: Id, ring: Vec2[]): boolean {
  const lang = langOf(env);
  const contorno = normalizarContorno(ring);
  const problema = contornoRegiaoIssue(contorno, lang);
  if (problema) {
    env.say(problema);
    return false;
  }
  env.transaction(translate(lang, 'tl_tn_undo_regiao_contorno'), () => env.exec({ type: 'setTerrainRegionContorno', id, contorno }));
  const fora = verticesForaDoTerreno(env.project(), contorno);
  env.say(fora > 0 ? translate(lang, 'tl_tn_rg_fora', { n: fora }) : translate(lang, 'tl_tn_rg_contorno_editado'));
  return true;
}

/** Alça de vértice ou de meio de aresta da região: arrastar grava o contorno novo (um desfazer); clicar num vértice o põe em foco. */
function alcaHold(env: ToolEnv, g: AlcaDeRegiao): GripHold {
  const vertice = g.kind === 'vertex';
  let ponto: Vec2 = g.at;
  const anel = (): Vec2[] | null => {
    const r = env.project().elements[g.regiaoId];
    return isTerrainRegion(r) ? r.contorno : null;
  };
  return {
    at: g.at,
    keepsFocus: true,
    drag(_p, snap) {
      const ring = anel();
      if (!ring) return [];
      // O vértice arrastado não se captura a si mesmo, mas os outros vértices da própria região servem de alvo.
      ponto = snap({ extraPoints: vertice ? ring.filter((_, i) => i !== g.index) : ring, ignore: new Set([g.regiaoId]) });
      return [{ kind: 'polygon', ring, dashed: true }, { kind: 'polygon', ring: contornoDepois(ring, vertice, g.index, ponto) }];
    },
    release(_p, setFocus) {
      const ring = anel();
      if (!ring) return;
      if (dist(ponto, g.at) > 1e-6) gravarContornoDaRegiao(env, g.regiaoId, contornoDepois(ring, vertice, g.index, ponto));
      else if (vertice) {
        setFocus({ id: g.regiaoId, index: g.index });
        env.say(translate(langOf(env), 'tl_tn_rg_vertice_foco'));
      }
    },
  };
}

/** Provedor de alças da região para `selectGrips` (`registrarAlcasDeElemento`). */
export const alcaDaRegiao: GripProvider = (env, at) => {
  const g = alcaDaRegiaoEm(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? alcaHold(env, g) : null;
};

/**
 * Delete com um vértice de região em foco: remove o vértice (a região mantém ao menos 3). Devolve o novo foco, ou `null` se o foco não é de
 * região (quem chama segue com o Delete de sempre). O foco `undefined` em vez de `null` indica que a edição foi recusada.
 */
export function removerVerticeDaRegiao(env: ToolEnv, foco: GripFocus): GripFocus | null | undefined {
  const r = env.project().elements[foco.id];
  if (!isTerrainRegion(r) || !env.selection().includes(r.id) || foco.index >= r.contorno.length) return null;
  const anel = ringRemoveVertex(r.contorno, foco.index);
  if (!anel) {
    env.say(translate(langOf(env), 'tl_tn_rg_min_vertices'));
    return undefined;
  }
  if (!gravarContornoDaRegiao(env, r.id, anel)) return undefined;
  return { id: r.id, index: Math.min(foco.index, anel.length - 1) };
}

/** Comprimento da seta de subida: um terço da raiz da área do contorno (limitado), para caber sempre dentro da região. */
function comprimentoDaSeta(c: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < c.length; i++) a += c[i]!.x * c[(i + 1) % c.length]!.y - c[(i + 1) % c.length]!.x * c[i]!.y;
  return Math.max(0.2, Math.sqrt(Math.abs(a) / 2) / 3);
}

/** Média dos vértices: o ponto de referência do plano da região (A.4 regra 6) e a origem da seta. */
export const referenciaDaRegiao = (c: readonly Vec2[]): Vec2 => ({ x: c.reduce((s, q) => s + q.x, 0) / c.length, y: c.reduce((s, q) => s + q.y, 0) / c.length });

/**
 * Seta da direção de subida da região: uma linha com a ponta e o rótulo da inclinação, a partir do ponto de referência. Vazia quando a
 * região não tem plano (subdivisão) ou a inclinação é 0.
 */
export function setaDaRegiao(p: Project, r: TerrainRegion): PreviewItem[] {
  if (r.papel === 'subdivisao' || !(r.inclinacao > 0) || r.contorno.length < 3) return [];
  const dir = { x: Math.cos(r.direcao), y: Math.sin(r.direcao) };
  return slopePreview({ origin: referenciaDaRegiao(r.contorno), dir, percent: r.inclinacao * 100 }, comprimentoDaSeta(r.contorno), unitsOf(p));
}

/** Alças desenhadas nas regiões selecionadas (vértices e meio das arestas), o vértice em foco e a seta de subida. */
export function previaDasAlcasDaRegiao(env: ToolEnv): PreviewItem[] {
  const p = env.project();
  const out: PreviewItem[] = [];
  for (const r of selecionadas(p, env.selection())) {
    if (r.levelId !== env.levelId()) continue;
    r.contorno.forEach((a, i) => out.push({ kind: 'point', at: a }, { kind: 'point', at: meio(a, r.contorno[(i + 1) % r.contorno.length]!) }));
    out.push(...setaDaRegiao(p, r));
  }
  return out;
}

let registrada = false;

/** Liga as alças da região à ferramenta de seleção (uma vez só; o `selectTool` chama ao carregar). */
export function registrarAlcasDaRegiao(): void {
  if (registrada) return;
  registrada = true;
  registrarAlcasDeElemento(alcaDaRegiao, previaDasAlcasDaRegiao);
}
