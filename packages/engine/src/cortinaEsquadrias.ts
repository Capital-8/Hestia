/**
 * Esquadrias das células da parede cortina como `Opening` VIRTUAL (decisão 0056, §7.1, §7.6 e §7.8): o 3D e a planta desenham a porta ou a janela da célula com
 * o MESMO código das esquadrias comuns (`buildOpeningModel`, `pecasDoModelo`, `openingViewOps`), de modo que folha, batente, ferragens, vidro, sentido de
 * giro e "abrir vãos" saem idênticos. Nada é gravado no projeto (a esquadria da cortina continua sendo a sobrescrita `OpeningCellOverride` da célula, e a
 * `Opening` hospedada em cortina continua sendo erro `opening-host-curtain`): aqui se monta, em memória, a abertura que o override descreve, no vão que o
 * kernel calculou (consulta 107, `ServicoCortina.portas`). Sem kernel pronto não há esquadria (nunca TypeScript no lugar do vão).
 *
 * O vão e a base vêm do kernel; o desenho sai do modelo de esquadrias do projeto, com a geometria do vão virtual em vez da do tipo (a largura e a altura do
 * vão da célula não são as nominais do tipo no modo "preencher"). O quadro da parede é o da cortina com uma camada de estrutura de uma profundidade só
 * (`curtain.depth`), de modo que o núcleo é o sistema inteiro e o plano central (`sMid`) é o mesmo do kernel.
 */
import { isWall, openingTypeById, resolverParede, type CellKey, type Id, type Opening, type Project, type SubelementoCortina, type Wall, type WallType } from '@hestia/model';
import { buildFrame, normalAt, pointAt, tangentAt, type WallFrame } from './frame.ts';
import { zDaCortina } from './cortinaProjeto.ts';
import { servicoCortina, type PortaCortinaProjeto } from './kernelCortinaServico.ts';
import { PAPEL_PLANTA_CORTINA } from './kernelCortinaTabelas.ts';
import { buildOpeningModel } from './openingModel.ts';
import type { OpeningModel } from './openingModelTypes.ts';
import type { OpeningGeometry } from './types.ts';

/** Prefixo do id da esquadria virtual (nunca colide com o id de um elemento do projeto). */
const PREFIXO = 'cortina-esq|';

/** Id da esquadria virtual de uma célula (a canônica da região): estável entre as montagens, usado como id de elemento no 3D e na planta. */
export const idEsquadriaCortina = (wallId: Id, i: number, j: number): Id => `${PREFIXO}${wallId}|${i}|${j}`;

/** O id é de uma esquadria virtual de cortina? Devolve a parede e a célula canônica. */
export function lerIdEsquadriaCortina(id: Id): { wallId: Id; i: number; j: number } | null {
  if (!id.startsWith(PREFIXO)) return null;
  const m = /^(.*)\|(\d+)\|(\d+)$/.exec(id.slice(PREFIXO.length));
  return m ? { wallId: m[1]!, i: Number(m[2]), j: Number(m[3]) } : null;
}

/** Uma esquadria de célula pronta para desenhar. */
export interface EsquadriaCortina {
  /** `idEsquadriaCortina`. */
  id: Id;
  wallId: Id;
  /** Célula canônica da região, na grade atual do kernel. */
  i: number;
  j: number;
  /** Chave da sobrescrita no projeto (o que o estado do editor guarda como `subElemento`). */
  celula: CellKey;
  /** `Opening` em memória: mesmo tipo, marca e inversões do override; `hostId` = a parede cortina. */
  opening: Opening;
  /** Geometria do vão virtual (largura e altura do vão do kernel, `sill` = base do vão acima da base da cortina). */
  geometria: OpeningGeometry;
  /** Quadro da cortina (plano central e profundidade do sistema). */
  quadro: WallFrame;
  /** Cota absoluta da base da cortina (m). */
  baseZ: number;
  /** Altura da cortina (m): limite do vão. */
  altura: number;
  /** Linha do kernel (lados com montante, flags, vão). */
  porta: PortaCortinaProjeto;
}

/** Quadro da cortina com o núcleo igual ao sistema inteiro (a camada única de `curtain.depth`). `null` para parede degenerada. */
function quadroDaCortina(w: Wall, tipo: WallType): WallFrame | null {
  if (!tipo.curtain) return null;
  const nucleo: WallType = { ...tipo, layers: [{ function: 'structure', materialId: '', thickness: tipo.curtain.depth, wraps: false }] };
  return buildFrame(w, nucleo);
}

/** Onde o sistema começa ao longo da parede (m, a partir de `a`): a ponta recuada por uma junção. Vem do contorno de planta do kernel; sem contorno, 0. */
function inicioDaCortina(p: Project, w: Wall, f: WallFrame): number {
  const linhas = servicoCortina().planta(p, w.levelId, 1.2, 0);
  const c = linhas?.find((l) => l.wallId === w.id && l.papel === PAPEL_PLANTA_CORTINA.contorno && l.pontos.length >= 4);
  if (!c) return 0;
  let t = Infinity;
  for (const q of c.pontos) t = Math.min(t, (q.x - f.a.x) * f.u.x + (q.y - f.a.y) * f.u.y);
  return Number.isFinite(t) && Math.abs(t) > 1e-6 ? Math.max(0, t) : 0;
}

const memo = new WeakMap<Project, EsquadriaCortina[]>();

/**
 * As esquadrias virtuais de todas as cortinas do projeto (ou só as de um nível), na ordem das cortinas e das células. Vazio sem kernel pronto, sem cortina
 * ou sem esquadria. O resultado é memorizado por projeto (o serviço já memoriza a consulta).
 */
export function esquadriasDaCortina(p: Project, nivelId?: Id | null): EsquadriaCortina[] {
  const svc = servicoCortina();
  if (!svc.pronto()) return [];
  let todas = memo.get(p);
  if (!todas) {
    todas = montar(p);
    memo.set(p, todas);
  }
  return nivelId ? todas.filter((e) => (p.elements[e.wallId] as Wall | undefined)?.levelId === nivelId) : todas;
}

function montar(p: Project): EsquadriaCortina[] {
  const r = servicoCortina().portas(p);
  if (!r || r.portas.length === 0) return [];
  const out: EsquadriaCortina[] = [];
  const resolvidas = new Map<Id, ReturnType<typeof resolverParede>>();
  const inicios = new Map<Id, number>();
  for (const q of r.portas) {
    const w = p.elements[q.wallId];
    if (!w || !isWall(w) || !w.curtain || q.openingTypeId === null) continue;
    const tipoParede = p.wallTypes[w.typeId];
    const tipo = openingTypeById(p, q.openingTypeId);
    const f = tipoParede ? quadroDaCortina(w, tipoParede) : null;
    const z = zDaCortina(p, w);
    if (!f || !tipo || !z) continue;
    if (q.s1 - q.s0 < 1e-6 || q.z1 - q.z0 < 1e-6) continue;
    // A sobrescrita que deu origem à esquadria: a que está na região (a mesma célula canônica do kernel).
    if (!resolvidas.has(w.id)) resolvidas.set(w.id, resolverParede(p, w));
    const res = resolvidas.get(w.id);
    const canon = res ? res.canon[q.i * res.nv + q.j] : undefined;
    const dessaRegiao = (res?.celulas ?? []).filter((e) => e.override.kind === 'opening' && res!.canon[e.key.i * res!.nv + e.key.j] === canon);
    const entrada = dessaRegiao.find((e) => e.key.i === q.i && e.key.j === q.j) ?? dessaRegiao[0];
    if (!entrada || entrada.override.kind !== 'opening') continue;
    const ov = entrada.override;
    if (!inicios.has(w.id)) inicios.set(w.id, inicioDaCortina(p, w, f));
    const offset = inicios.get(w.id)! + (q.s0 + q.s1) / 2;
    const id = idEsquadriaCortina(w.id, q.i, q.j);
    const opening: Opening = { id, kind: tipo.kind, typeId: tipo.id, hostId: w.id, offset, flipHand: q.flipMao, flipFacing: q.flipSentido, sillOverride: null, mark: ov.mark };
    const largura = q.s1 - q.s0;
    const altura = q.z1 - q.z0;
    const geometria: OpeningGeometry = {
      openingId: id,
      hostId: w.id,
      kind: tipo.kind,
      center: pointAt(f, offset, f.sMid),
      u: tangentAt(f, offset),
      n: normalAt(f, offset),
      width: largura,
      height: altura,
      roughWidth: largura,
      roughHeight: altura,
      sill: q.z0,
      thickness: f.thickness,
      sHi: f.sHi,
      sLo: f.sLo,
      leaves: tipo.leaves,
      plan: tipo.plan,
      flipHand: q.flipMao,
      flipFacing: q.flipSentido,
      offset,
    };
    out.push({ id, wallId: w.id, i: q.i, j: q.j, celula: entrada.key, opening, geometria, quadro: f, baseZ: z.z0, altura: z.height, porta: q });
  }
  return out;
}

const modelos = new WeakMap<EsquadriaCortina, OpeningModel>();

/** Modelo de peças da esquadria (o mesmo `buildOpeningModel` das esquadrias comuns), memorizado por esquadria. */
export function modeloDaEsquadriaCortina(p: Project, e: EsquadriaCortina): OpeningModel {
  let m = modelos.get(e);
  if (!m) {
    m = buildOpeningModel(p, e.opening, e.geometria, e.quadro);
    modelos.set(e, m);
  }
  return m;
}

/** Esquadria de uma célula (a canônica ou qualquer célula da mesma região), ou `undefined`. */
export function esquadriaDaCelula(p: Project, wallId: Id, celula: Pick<CellKey, 'i' | 'j'>): EsquadriaCortina | undefined {
  const w = p.elements[wallId];
  if (!w || !isWall(w)) return undefined;
  const lista = esquadriasDaCortina(p).filter((e) => e.wallId === wallId);
  const direta = lista.find((e) => e.i === celula.i && e.j === celula.j);
  if (direta) return direta;
  const res = resolverParede(p, w);
  if (!res) return undefined;
  const rc = res.canon[celula.i * res.nv + celula.j];
  return lista.find((e) => res.canon[e.i * res.nv + e.j] === rc);
}

/**
 * Subelemento `opening` de uma esquadria virtual (o que um clique no 3D ou na planta escolhe): a parede e a chave da célula da sobrescrita. `null` se o id não é
 * de esquadria virtual ou a esquadria não existe mais.
 */
export function subelementoDaEsquadriaCortina(p: Project, id: Id): SubelementoCortina | null {
  const ref = lerIdEsquadriaCortina(id);
  if (!ref) return null;
  const e = esquadriasDaCortina(p).find((x) => x.id === id);
  return e ? { wallId: e.wallId, kind: 'opening', cell: e.celula } : null;
}

/** O id de elemento do 3D é o de uma esquadria virtual? Devolve o id da parede (para quem só entende elementos do projeto); outros ids passam sem mudar. */
export const idDoProjetoDoPick = (id: Id): Id => lerIdEsquadriaCortina(id)?.wallId ?? id;
