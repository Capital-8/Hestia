// Esquadria na célula da parede cortina (decisão 0056, §7.2 a §7.5): colocar (modo "preencher célula" ou "ajustar grade à
// porta"), trocar tipo, inverter e remover. Cada comando é UM passo de desfazer: a fusão de células vizinhas (§7.5.2),
// as linhas presas criadas (§7.4) e a remoção das linhas que sobraram entram no mesmo comando.
// A confirmação da fusão é do app: o comando recebe `fundir` explícito e, sem ele, recusa se a esquadria não couber.

import type { Command } from './commands.ts';
import { t, type Key, type Lang } from './i18n.ts';
import { type Id, type Project, type Wall } from './types.ts';
import { openingTypeById } from './openingNominal.ts';
import { TOL_SOLDA, celulaEm, centroEntre, regiaoRetangular, type Eixo } from './curtainGrade.ts';
import { normalizarParede, refGerada, type ParedeResolvida } from './curtainRemap.ts';
import { celulaDe, instanciaDe, marcarSegmentoBruto, resolucaoDe } from './curtainCommands.ts';
import { folgasDaRegiao, retanguloDaRegiao, type FolgasRegiao, type Retangulo } from './curtainOpening.ts';
import {
  CURTAIN_LIMITS,
  CURTAIN_MIN_CELL,
  CURTAIN_MIN_REMAINDER,
  type AddedGridLine,
  type CellKey,
  type CellOverrideEntry,
  type CurtainInstance,
  type LineRef,
  type OpeningCellOverride,
} from './wallCurtainTypes.ts';

type Alinhamento = 'center' | 'start' | 'end';

/**
 * Erro de esquadria na célula. `chave` é a chave `md_ct_*` do dicionário do modelo: a ferramenta reconhece o caso de
 * fusão (`md_ct_opening_no_fit`) pela chave, não pelo texto, e traduz a mensagem no idioma da interface.
 */
export class ErroEsquadriaCelula extends Error {
  readonly chave: Key;
  constructor(chave: Key, lang: Lang) {
    super(t(lang, chave));
    this.name = 'ErroEsquadriaCelula';
    this.chave = chave;
  }
}

/** O que a esquadria pede à célula (vindo do comando novo ou do patch de um comando de troca). */
interface Pedido {
  openingTypeId: Id;
  flipHand: boolean;
  flipFacing: boolean;
  mark: string;
  fit: 'cell' | 'grid';
  align?: Alinhamento;
  fundir: boolean;
  sillOverride?: number | null;
}

/** Vizinho da região para a fusão: a linha (índice em `res.u` ou `res.v`) que o segmento removido cruza. */
interface Vizinho {
  eixo: Eixo;
  linha: number;
}

const dentroDoVao = (pos: number, A: number): boolean => pos > TOL_SOLDA && pos < A - TOL_SOLDA;

/** Todas as regiões da grade são retângulos (§5.2): é o que a fusão precisa garantir. */
function todasRetangulares(res: ParedeResolvida): boolean {
  for (const c of new Set(res.canon)) if (!regiaoRetangular(res.nu, res.nv, res.canon, c)) return false;
  return true;
}

/** Linha presa ainda usada por outra esquadria ou por um segmento removido (ela não some junto). */
function linhaEmUso(inst: CurtainInstance, id: Id): boolean {
  const porEsquadria = (inst.cells ?? []).some((e) => e.override.kind === 'opening' && (e.override.linkedLines ?? []).includes(id));
  const porSegmento = (inst.removedSegments ?? []).some((sg) => 'added' in sg.line && sg.line.added === id);
  return porEsquadria || porSegmento;
}

/** Apaga as linhas presas dadas que nenhuma outra célula nem segmento usa (§7.4: "apagar a esquadria apaga as linhas..."). */
function soltarLinhas(inst: CurtainInstance, ids: Id[]): void {
  for (const id of ids) {
    if (!(inst.addedLines ?? []).some((l) => l.id === id) || linhaEmUso(inst, id)) continue;
    inst.addedLines = (inst.addedLines ?? []).filter((l) => l.id !== id);
    if (inst.lineOverrides) inst.lineOverrides = inst.lineOverrides.filter((ov) => !('added' in ov.line && ov.line.added === id));
  }
}

/** Distância (m) acima da base da região para o ponto que a identifica ao reler a grade (1 mm). */
const PONTO_NA_REGIAO = 0.001;

/** Célula (i, j) da grade que contém o ponto (x, z), em metros. Erro se o ponto está fora da parede. */
function celulaNoPonto(res: ParedeResolvida, x: number, z: number, lang: Lang): { i: number; j: number } {
  const i = celulaEm(res.bu, x);
  const j = celulaEm(res.bv, z);
  if (i < 0 || j < 0) throw new Error(t(lang, 'md_ct_cell_missing'));
  return { i, j };
}

/** Entrada da célula (i, j) na grade atual (normalizada): a região inteira, com a sua chave canônica. */
function entradaDaCelula(p: Project, wallId: Id, i: number, j: number, lang: Lang): { rc: number; entrada?: CellOverrideEntry } {
  normalizarParede(p, wallId);
  const { w, res } = resolucaoDe(p, wallId, lang);
  celulaDe(res, i, j, lang);
  const rc = res.canon[i * res.nv + j] as number;
  const entrada = (w.curtain?.cells ?? []).find((e) => res.canon[e.key.i * res.nv + e.key.j] === rc);
  return { rc, entrada };
}

/** Apaga toda sobrescrita da região `rc` e as linhas presas das esquadrias apagadas que sobrarem sem uso. */
function apagarNaRegiao(p: Project, wallId: Id, rc: number, lang: Lang): void {
  normalizarParede(p, wallId);
  const { w, res } = resolucaoDe(p, wallId, lang);
  const inst = instanciaDe(w);
  const naRegiao = (inst.cells ?? []).filter((e) => res.canon[e.key.i * res.nv + e.key.j] === rc);
  if (naRegiao.length === 0) return;
  const ids = naRegiao.flatMap((e) => (e.override.kind === 'opening' ? (e.override.linkedLines ?? []) : []));
  inst.cells = (inst.cells ?? []).filter((e) => !naRegiao.includes(e));
  soltarLinhas(inst, ids);
  normalizarParede(p, wallId);
}

/** Escolhe o vizinho para fundir: na largura, à direita (ou à esquerda); na altura, acima (ou abaixo). */
function escolherVizinho(res: ParedeResolvida, r: Retangulo, faltaLargura: boolean): Vizinho | null {
  if (faltaLargura) {
    if (r.i1 + 1 < res.nu) return { eixo: 'u', linha: r.i1 };
    if (r.i0 > 0) return { eixo: 'u', linha: r.i0 - 1 };
    return null;
  }
  if (r.j1 + 1 < res.nv) return { eixo: 'v', linha: r.j1 };
  if (r.j0 > 0) return { eixo: 'v', linha: r.j0 - 1 };
  return null;
}

/** Remove os segmentos que ligam a região ao vizinho (todas as fileiras ou colunas da região). Sem conferir a forma. */
function fundirPara(p: Project, wallId: Id, res: ParedeResolvida, r: Retangulo, v: Vizinho, lang: Lang): void {
  const lista = v.eixo === 'u' ? res.u : res.v;
  const lg = lista[v.linha];
  if (!lg) throw new Error(t(lang, 'md_ct_line_missing'));
  const A = v.eixo === 'u' ? res.L : res.H;
  const ref: LineRef = lg.added !== undefined ? { added: lg.added } : refGerada(v.eixo, lg.gerada as number, A, v.eixo === 'u' ? res.geradasU : res.geradasV);
  if (v.eixo === 'u') for (let j = r.j0; j <= r.j1; j++) marcarSegmentoBruto(p, wallId, ref, j, lang);
  else for (let i = r.i0; i <= r.i1; i++) marcarSegmentoBruto(p, wallId, ref, i, lang);
}

/** Id novo para uma linha presa, único entre as linhas da parede (determinístico: a célula e a ordem). */
function novoIdLinha(inst: CurtainInstance, base: string): Id {
  const usados = new Set((inst.addedLines ?? []).map((l) => l.id));
  let id = base;
  for (let k = 2; usados.has(id); k++) id = `${base}_${k}`;
  return id;
}

/** Chave canônica de uma célula da grade resolvida (índices, posição normalizada e topologia). */
function chaveDaCelula(res: ParedeResolvida, i: number, j: number): CellKey {
  return { i, j, s: centroEntre(res.bu, i) / res.L, z: centroEntre(res.bv, j) / res.H, nu: res.nu, nv: res.nv };
}

/**
 * Linhas presas do ajuste de grade (§7.4): a porta de largura W e altura H (vão) na região `r`, centrada ou alinhada à
 * borda. Sobra menor que o limiar é absorvida (o alinhamento centrado passa à borda; sem sobra, sem linha).
 * Devolve as linhas a criar e o alinhamento efetivo.
 */
function linhasDoAjuste(
  w: Wall,
  res: ParedeResolvida,
  p: Project,
  f: FolgasRegiao,
  W: number,
  H: number,
  sill: number,
  alinhamento: Alinhamento,
): { posicoes: Array<{ axis: Eixo; pos: number }>; efetivo: Alinhamento } {
  const spec = p.wallTypes[w.typeId]?.curtain;
  const limiar = Math.max(spec?.minRemainder ?? CURTAIN_MIN_REMAINDER, spec?.minCell ?? CURTAIN_MIN_CELL);
  const Cw = f.s1 - f.s0;
  const sobraCada = (Cw - W) / 2;
  const efetivo: Alinhamento = alinhamento === 'center' && sobraCada < limiar ? 'start' : alinhamento;
  const xs: number[] = [];
  if (efetivo === 'center') {
    if (sobraCada >= limiar) xs.push(f.s0 + sobraCada, f.s1 - sobraCada);
  } else if (Cw - W >= limiar) {
    xs.push(efetivo === 'start' ? f.s0 + W : f.s1 - W);
  }
  const topo = f.z0 + sill + H;
  const posicoes: Array<{ axis: Eixo; pos: number }> = xs.map((pos) => ({ axis: 'u' as const, pos }));
  if (f.z1 - topo >= limiar) posicoes.push({ axis: 'v', pos: topo });
  // Linha que já existe na grade (mesma posição) não é criada: a esquadria usa a que está lá.
  const existentes = { u: res.u.map((l) => l.pos), v: res.v.map((l) => l.pos) };
  const livres = posicoes.filter(({ axis, pos }) => dentroDoVao(pos, axis === 'u' ? res.L : res.H) && !existentes[axis].some((q) => Math.abs(q - pos) <= TOL_SOLDA));
  return { posicoes: livres, efetivo };
}

/**
 * Coloca a esquadria na célula (i, j): substitui a sobrescrita da região (painel ou esquadria antiga) e as linhas presas
 * antigas; funde as vizinhas se preciso (com `fundir`); no modo "ajustar grade", cria as linhas presas; e grava a
 * sobrescrita na célula canônica da região que contém o centro da esquadria.
 */
function colocar(p: Project, wallId: Id, x: number, z: number, ped: Pedido, lang: Lang): void {
  const tipo = openingTypeById(p, ped.openingTypeId);
  if (!tipo) throw new Error(t(lang, 'md_ct_opening_type_missing'));
  // A célula é a que contém o ponto (x, z), lida na grade atual. Apagar a esquadria antiga pode tirar linhas presas e
  // mudar os índices, então a célula é lida de novo depois da remoção.
  normalizarParede(p, wallId);
  {
    const antes = resolucaoDe(p, wallId, lang).res;
    const c0 = celulaNoPonto(antes, x, z, lang);
    apagarNaRegiao(p, wallId, antes.canon[c0.i * antes.nv + c0.j] as number, lang);
  }

  const W = tipo.width;
  const H = tipo.height;
  // Altura do peitoril: a base da célula, ou o valor por instância (janela). Porta sem peitoril fica no piso.
  const sill = typeof ped.sillOverride === 'number' ? ped.sillOverride : 0;
  let { w, res } = resolucaoDe(p, wallId, lang);
  const { i, j } = celulaNoPonto(res, x, z, lang);
  for (let passo = 0; ; passo++) {
    const r = retanguloDaRegiao(res, i, j);
    const f = folgasDaRegiao(p, w, res, r);
    const largura = ped.fit === 'grid' ? f.larguraBruta : f.larguraLivre;
    const altura = ped.fit === 'grid' ? f.alturaBruta : f.alturaLivre;
    if (W <= largura + TOL_SOLDA && sill + H <= altura + TOL_SOLDA) break;
    if (!ped.fundir) throw new ErroEsquadriaCelula('md_ct_opening_no_fit', lang);
    const vizinho = passo <= res.nu + res.nv ? escolherVizinho(res, r, W > largura + TOL_SOLDA) : null;
    if (!vizinho) throw new ErroEsquadriaCelula('md_ct_opening_no_fit', lang);
    fundirPara(p, wallId, res, r, vizinho, lang);
    normalizarParede(p, wallId);
    ({ w, res } = resolucaoDe(p, wallId, lang));
    if (!todasRetangulares(res)) throw new ErroEsquadriaCelula('md_ct_opening_funde_nao_retangular', lang);
  }

  const r = retanguloDaRegiao(res, i, j);
  const f = folgasDaRegiao(p, w, res, r);
  const alinhamento = ped.align ?? 'center';
  const ids: Id[] = [];
  let efetivo: Alinhamento = alinhamento;
  if (ped.fit === 'grid') {
    const instGrade = instanciaDe(w);
    const ajuste = linhasDoAjuste(w, res, p, f, W, H, sill, alinhamento);
    efetivo = ajuste.efetivo;
    const base = `ct_op_${i}_${j}`;
    for (const { axis, pos } of ajuste.posicoes) {
      if ((instGrade.addedLines ?? []).length >= CURTAIN_LIMITS.addedLines) throw new Error(t(lang, 'md_ct_limit_lines'));
      const id = novoIdLinha(instGrade, base);
      const linha: AddedGridLine = { id, axis, pos, boundTo: chaveDaCelula(res, i, j) };
      instGrade.addedLines = [...(instGrade.addedLines ?? []), linha];
      ids.push(id);
    }
    normalizarParede(p, wallId);
    ({ w, res } = resolucaoDe(p, wallId, lang));
  }

  // Centro da esquadria: determina a célula (e a região) que a recebe, na grade final.
  const cx = ped.fit !== 'grid' || efetivo === 'center' ? (f.s0 + f.s1) / 2 : efetivo === 'start' ? f.s0 + W / 2 : f.s1 - W / 2;
  const cz = ped.fit !== 'grid' ? (f.z0 + f.z1) / 2 : f.z0 + sill + H / 2;
  const ci = celulaEm(res.bu, cx);
  const cj = celulaEm(res.bv, cz);
  if (ci < 0 || cj < 0) throw new Error(t(lang, 'md_ct_cell_missing'));
  const rcFinal = res.canon[ci * res.nv + cj] as number;
  const canonI = Math.floor(rcFinal / res.nv);
  const canonJ = rcFinal - canonI * res.nv;

  const override: OpeningCellOverride = {
    kind: 'opening',
    openingTypeId: ped.openingTypeId,
    flipHand: ped.flipHand,
    flipFacing: ped.flipFacing,
    fit: ped.fit,
    mark: ped.mark,
    ...(ped.fit === 'grid' ? { align: alinhamento } : {}),
    ...(ids.length > 0 ? { linkedLines: ids } : {}),
    ...(ped.sillOverride !== undefined ? { sillOverride: ped.sillOverride } : {}),
  };
  const inst = instanciaDe(w);
  inst.cells = [
    ...(inst.cells ?? []).filter((e) => res.canon[e.key.i * res.nv + e.key.j] !== rcFinal),
    { key: chaveDaCelula(res, canonI, canonJ), override },
  ];
  normalizarParede(p, wallId);
}

/** Troca só os campos do patch; o que muda o tamanho ou as linhas (tipo, ajuste, fusão) refaz a colocação. */
function atualizar(p: Project, c: Extract<Command, { type: 'updateCellOpening' }>, lang: Lang): void {
  const { entrada } = entradaDaCelula(p, c.wallId, c.i, c.j, lang);
  if (!entrada || entrada.override.kind !== 'opening') throw new Error(t(lang, 'md_ct_opening_missing'));
  const ov = entrada.override;
  const pt = c.patch;
  // Ponto dentro da região da esquadria (perto da base, no meio da largura): a colocação relê a célula depois de apagar.
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const f = folgasDaRegiao(p, w, res, retanguloDaRegiao(res, c.i, c.j));
  colocar(
    p,
    c.wallId,
    (f.s0 + f.s1) / 2,
    f.z0 + PONTO_NA_REGIAO,
    {
      openingTypeId: pt.openingTypeId ?? ov.openingTypeId,
      flipHand: pt.flipHand ?? ov.flipHand,
      flipFacing: pt.flipFacing ?? ov.flipFacing,
      mark: pt.mark ?? ov.mark,
      fit: pt.fit ?? ov.fit ?? 'cell',
      align: pt.align ?? ov.align,
      fundir: pt.fundir ?? false,
      sillOverride: pt.sillOverride !== undefined ? pt.sillOverride : ov.sillOverride,
    },
    lang,
  );
}

/** Aplica um comando de esquadria na célula. Devolve false quando o comando não é desta família. */
export function applyCurtainOpeningCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'setCellOpening': {
      const { res } = resolucaoDe(p, c.wallId, lang);
      celulaDe(res, c.i, c.j, lang);
      colocar(
        p,
        c.wallId,
        centroEntre(res.bu, c.i),
        centroEntre(res.bv, c.j),
        { openingTypeId: c.openingTypeId, flipHand: c.flipHand, flipFacing: c.flipFacing, mark: c.mark, fit: c.fit, align: c.align, fundir: c.fundir },
        lang,
      );
      return true;
    }
    case 'updateCellOpening':
      atualizar(p, c, lang);
      return true;
    case 'removeCellOpening': {
      const { rc, entrada } = entradaDaCelula(p, c.wallId, c.i, c.j, lang);
      if (!entrada || entrada.override.kind !== 'opening') throw new Error(t(lang, 'md_ct_opening_missing'));
      apagarNaRegiao(p, c.wallId, rc, lang);
      return true;
    }
    case 'clearCellOverride': {
      const { rc } = entradaDaCelula(p, c.wallId, c.i, c.j, lang);
      apagarNaRegiao(p, c.wallId, rc, lang);
      return true;
    }
    default:
      return false;
  }
}
