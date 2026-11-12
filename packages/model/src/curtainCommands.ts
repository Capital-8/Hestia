import type { Command } from './commands.ts';
import { t, type Lang } from './i18n.ts';
import { isWall, type Id, type Project, type Wall, type WallType } from './types.ts';
import { isCurtainType } from './wallType.ts';
import { TOL_SOLDA, centroEntre, regiaoRetangular } from './curtainGrade.ts';
import {
  casarGerada,
  normalizarParede,
  refGerada,
  resolverParede,
  type ParedeResolvida,
} from './curtainRemap.ts';
import { curtainPanelTypesOf, curtainShadowLayer, curtainTypeIssue, montanteIssue, mullionTypesOf, painelIssue, papeisDeMontante } from './wallCurtain.ts';
import { CURTAIN_LIMITS, type CurtainInstance, type LineOverride, type LineRef, type SegmentRef } from './wallCurtainTypes.ts';
import type { Eixo } from './curtainGrade.ts';

// Comandos da parede cortina (decisão 0056, §4.7). Sem o `switch` de `commands.ts` (aquele arquivo passa do limite de
// linhas). Fase 0: tipos de montante e de painel, e a preparação do tipo de parede (camada-sombra e família). Fase 2:
// linhas, segmentos, painéis de célula e a normalização das sobrescritas. Cada comando é um passo de desfazer.

/** Comandos desta família, tratados aqui. */
export type CurtainCommand = Extract<
  Command,
  {
    type:
      | 'upsertMullionType'
      | 'deleteMullionType'
      | 'upsertCurtainPanelType'
      | 'deleteCurtainPanelType'
      | 'addGridLine'
      | 'moveGridLine'
      | 'lockGridLine'
      | 'removeGridLine'
      | 'removeSegment'
      | 'restoreSegment'
      | 'setLineMullion'
      | 'clearLineOverride'
      | 'setCellPanel'
      | 'clearCellOverride'
      | 'normalizarSobrescritas';
  }
>;

/** Montante usado por alguma parede cortina, no tipo (papel) ou numa linha da instância. */
export function montanteEmUso(p: Project, id: Id): boolean {
  const emTipo = Object.values(p.wallTypes).some((w) => w.family === 'curtain' && !!w.curtain && papeisDeMontante(w.curtain.mullions).includes(id));
  if (emTipo) return true;
  return Object.values(p.elements).some(
    (e) =>
      isWall(e) &&
      !!e.curtain &&
      ((e.curtain.lineOverrides ?? []).some((lo) => lo.mullionTypeId === id) || (e.curtain.addedLines ?? []).some((al) => al.mullionTypeId === id)),
  );
}

/** Painel usado por alguma parede cortina: padrão do tipo, padrão da instância ou sobrescrita de célula. */
function painelEmUso(p: Project, id: Id): boolean {
  const emTipo = Object.values(p.wallTypes).some((w) => w.family === 'curtain' && w.curtain?.defaultPanelTypeId === id);
  if (emTipo) return true;
  return Object.values(p.elements).some(
    (e) =>
      isWall(e) &&
      !!e.curtain &&
      (e.curtain.defaultPanelTypeId === id || (e.curtain.cells ?? []).some((c) => c.override.kind === 'panel' && c.override.panelTypeId === id)),
  );
}

/**
 * Prepara um tipo de parede antes de gravar (decisão 0056, §4.1, §4.7): a família é fixada na criação, a camada-sombra
 * é regravada pela profundidade do sistema e o tipo é validado. Tipo básico passa sem mudança.
 */
export function prepararTipoParede(p: Project, wt: WallType, lang: Lang = 'pt'): WallType {
  const antes = p.wallTypes[wt.id];
  if (antes && (antes.family ?? 'basic') !== (wt.family ?? 'basic')) throw new Error(t(lang, 'md_ct_family_fixed'));
  if (wt.family !== 'curtain') return wt;
  const normal: WallType = { ...wt, layers: wt.curtain ? [curtainShadowLayer(p, wt.curtain)] : wt.layers };
  const erro = curtainTypeIssue(normal, p, lang);
  if (erro) throw new Error(erro);
  return normal;
}

/** Parede cortina do comando: tem de existir e ter tipo de família cortina. */
function paredeDe(p: Project, wallId: Id, lang: Lang): Wall {
  const w = p.elements[wallId];
  if (!isWall(w) || !isCurtainType(p.wallTypes[w.typeId])) throw new Error(t(lang, 'md_ct_not_curtain'));
  return w;
}

/** Resolução da parede do comando (a grade atual e as sobrescritas já remapeadas). */
function resolucaoDe(p: Project, wallId: Id, lang: Lang): { w: Wall; res: ParedeResolvida } {
  const w = paredeDe(p, wallId, lang);
  const res = resolverParede(p, w);
  if (!res) throw new Error(t(lang, 'md_ct_not_curtain'));
  return { w, res };
}

/** Instância da parede, criada se ainda não existe. */
function instanciaDe(w: Wall): CurtainInstance {
  if (!w.curtain) w.curtain = {};
  return w.curtain;
}

/** Identidade de uma linha: extra pelo id; gerada pelo índice (depois de casar com a lista de geradas). */
function chaveDaLinha(res: ParedeResolvida, line: LineRef): string | null {
  if ('added' in line) return `a:${line.added}`;
  const A = line.axis === 'u' ? res.L : res.H;
  const g = casarGerada(line, A, line.axis === 'u' ? res.geradasU : res.geradasV);
  return g < 0 ? null : `${line.axis}:${g}`;
}

/** Linha que o comando aponta, na forma canônica (referência gravável) e com a posição atual. */
function alvoDaLinha(res: ParedeResolvida, line: LineRef, lang: Lang): { eixo: Eixo; chave: string; ref: LineRef; A: number; pos: number } {
  const chave = chaveDaLinha(res, line);
  if (chave === null) throw new Error(t(lang, 'md_ct_line_missing'));
  const eixo: Eixo = 'added' in line ? (res.u.find((l) => l.added === line.added) ? 'u' : 'v') : line.axis;
  const A = eixo === 'u' ? res.L : res.H;
  if ('added' in line) {
    const ach = (eixo === 'u' ? res.u : res.v).find((l) => l.added === line.added);
    if (!ach) throw new Error(t(lang, 'md_ct_line_missing'));
    return { eixo, chave, ref: { added: line.added }, A, pos: ach.pos };
  }
  const geradas = eixo === 'u' ? res.geradasU : res.geradasV;
  const g = Number(chave.split(':')[1]);
  return { eixo, chave, ref: refGerada(eixo, g, A, geradas), A, pos: geradas[g] as number };
}

/** Confere se a remoção de segmentos deixou só regiões retangulares (§5.2). */
function regioesRetangulares(res: ParedeResolvida): boolean {
  const canons = new Set(res.canon);
  for (const c of canons) if (!regiaoRetangular(res.nu, res.nv, res.canon, c)) return false;
  return true;
}

/** Posição (m) dentro do vão de um eixo, com a tolerância de borda. */
function dentroDoVao(pos: number, A: number): boolean {
  return pos > TOL_SOLDA && pos < A - TOL_SOLDA;
}

/** Sobe ou troca a sobrescrita de uma linha gerada (a chave já casada); cria se não existe. */
function ajustarSobrescrita(inst: CurtainInstance, res: ParedeResolvida, alvo: { chave: string; ref: LineRef }, mudanca: Partial<LineOverride>): void {
  const lista = inst.lineOverrides ?? [];
  const i = lista.findIndex((ov) => chaveDaLinha(res, ov.line) === alvo.chave);
  if (i >= 0) {
    inst.lineOverrides = lista.map((ov, k) => (k === i ? { ...ov, ...mudanca } : ov));
  } else {
    inst.lineOverrides = [...lista, { line: alvo.ref, ...mudanca }];
  }
}

/** Parede cortina: remove os segmentos de uma linha gerada ou extra (chave) das removidas, por identidade. */
function segmentosDaLinha(res: ParedeResolvida, inst: CurtainInstance, chave: string): SegmentRef[] {
  return (inst.removedSegments ?? []).filter((sg) => chaveDaLinha(res, sg.line) === chave);
}

/** Aplica um comando da parede cortina. Devolve false quando o comando não é desta família: quem chama segue o `switch`
 * de `applyCommand`. A primeira escrita de um mapa grava o conjunto completo (`mullionTypes`, `curtainPanelTypes`). */
export function applyCurtainCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'upsertMullionType': {
      const erro = montanteIssue(c.mullionType, lang);
      if (erro) throw new Error(erro);
      p.mullionTypes = { ...mullionTypesOf(p), [c.mullionType.id]: c.mullionType };
      return true;
    }
    case 'deleteMullionType': {
      const tipos = mullionTypesOf(p);
      if (!tipos[c.id]) throw new Error(t(lang, 'md_ct_mullion_missing'));
      if (montanteEmUso(p, c.id)) throw new Error(t(lang, 'md_cmd_mullion_in_use'));
      if (Object.keys(tipos).length <= 1) throw new Error(t(lang, 'md_cmd_mullion_last'));
      const resto = { ...tipos };
      delete resto[c.id];
      p.mullionTypes = resto;
      return true;
    }
    case 'upsertCurtainPanelType': {
      const erro = painelIssue(c.panelType, lang);
      if (erro) throw new Error(erro);
      p.curtainPanelTypes = { ...curtainPanelTypesOf(p), [c.panelType.id]: c.panelType };
      return true;
    }
    case 'deleteCurtainPanelType': {
      const tipos = curtainPanelTypesOf(p);
      if (!tipos[c.id]) throw new Error(t(lang, 'md_ct_panel_missing'));
      if (painelEmUso(p, c.id)) throw new Error(t(lang, 'md_cmd_panel_in_use'));
      if (Object.keys(tipos).length <= 1) throw new Error(t(lang, 'md_cmd_panel_last'));
      const resto = { ...tipos };
      delete resto[c.id];
      p.curtainPanelTypes = resto;
      return true;
    }
    case 'addGridLine':
      return addGridLine(p, c, lang);
    case 'moveGridLine':
      return moveGridLine(p, c, lang);
    case 'lockGridLine':
      return lockGridLine(p, c, lang);
    case 'removeGridLine':
      return removeGridLine(p, c, lang);
    case 'removeSegment':
      return removeSegment(p, c, lang);
    case 'restoreSegment':
      return restoreSegment(p, c, lang);
    case 'setLineMullion':
      return setLineMullion(p, c, lang);
    case 'clearLineOverride':
      return clearLineOverride(p, c, lang);
    case 'setCellPanel':
      return setCellPanel(p, c, lang);
    case 'clearCellOverride':
      return clearCellOverride(p, c, lang);
    case 'normalizarSobrescritas': {
      if (c.wallId !== undefined) {
        paredeDe(p, c.wallId, lang);
        normalizarParede(p, c.wallId);
        return true;
      }
      for (const e of Object.values(p.elements)) if (isWall(e) && e.curtain) normalizarParede(p, e.id);
      return true;
    }
    default:
      return false;
  }
}

function addGridLine(p: Project, c: Extract<Command, { type: 'addGridLine' }>, lang: Lang): true {
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const A = c.line.axis === 'u' ? res.L : res.H;
  if (c.line.axis !== 'u' && c.line.axis !== 'v') throw new Error(t(lang, 'md_ct_line_missing'));
  if (!dentroDoVao(c.line.pos, A)) throw new Error(t(lang, 'md_ct_line_pos'));
  const inst = instanciaDe(w);
  const extras = inst.addedLines ?? [];
  if (extras.some((l) => l.id === c.line.id)) throw new Error(t(lang, 'md_ct_line_exists'));
  if (extras.length >= CURTAIN_LIMITS.addedLines) throw new Error(t(lang, 'md_ct_limit_lines'));
  if (c.line.mullionTypeId && !mullionTypesOf(p)[c.line.mullionTypeId]) throw new Error(t(lang, 'md_ct_mullion_missing'));
  inst.addedLines = [...extras, { ...c.line }];
  normalizarParede(p, c.wallId);
  return true;
}

function moveGridLine(p: Project, c: Extract<Command, { type: 'moveGridLine' }>, lang: Lang): true {
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const alvo = alvoDaLinha(res, c.line, lang);
  if (!dentroDoVao(c.pos, alvo.A)) throw new Error(t(lang, 'md_ct_line_pos'));
  const inst = instanciaDe(w);
  if ('added' in alvo.ref) {
    inst.addedLines = (inst.addedLines ?? []).map((l) => (l.id === (alvo.ref as { added: Id }).added ? { ...l, pos: c.pos } : l));
  } else {
    ajustarSobrescrita(inst, res, alvo, { pos: c.pos });
  }
  normalizarParede(p, c.wallId);
  return true;
}

function lockGridLine(p: Project, c: Extract<Command, { type: 'lockGridLine' }>, lang: Lang): true {
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const alvo = alvoDaLinha(res, c.line, lang);
  const inst = instanciaDe(w);
  if ('added' in alvo.ref) {
    inst.addedLines = (inst.addedLines ?? []).map((l) => (l.id === (alvo.ref as { added: Id }).added ? { ...l, locked: c.locked } : l));
  } else {
    ajustarSobrescrita(inst, res, alvo, { locked: c.locked });
  }
  normalizarParede(p, c.wallId);
  return true;
}

function removeGridLine(p: Project, c: Extract<Command, { type: 'removeGridLine' }>, lang: Lang): true {
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const alvo = alvoDaLinha(res, c.line, lang);
  const inst = instanciaDe(w);
  if ('added' in alvo.ref) {
    const id = (alvo.ref as { added: Id }).added;
    inst.addedLines = (inst.addedLines ?? []).filter((l) => l.id !== id);
    inst.lineOverrides = (inst.lineOverrides ?? []).filter((ov) => !('added' in ov.line && ov.line.added === id));
    inst.removedSegments = (inst.removedSegments ?? []).filter((sg) => !('added' in sg.line && sg.line.added === id));
  } else {
    // Linha gerada: não some da grade (é de tipo); apagá-la é remover todos os segmentos dela (cada célula vizinha funde).
    inst.lineOverrides = (inst.lineOverrides ?? []).filter((ov) => chaveDaLinha(res, ov.line) !== alvo.chave);
    const nk = alvo.eixo === 'u' ? res.nv : res.nu;
    const bp = alvo.eixo === 'u' ? res.bv : res.bu;
    const comp = alvo.eixo === 'u' ? res.H : res.L;
    const jaRemovidos = new Set(segmentosDaLinha(res, inst, alvo.chave).map((sg) => sg.k));
    const novos: SegmentRef[] = [];
    for (let k = 0; k < nk; k++) if (!jaRemovidos.has(k)) novos.push({ line: alvo.ref, k, nk, mid: centroEntre(bp, k) / comp });
    inst.removedSegments = [...(inst.removedSegments ?? []), ...novos];
  }
  normalizarParede(p, c.wallId);
  if (!regioesRetangulares(resolucaoDe(p, c.wallId, lang).res)) throw new Error(t(lang, 'md_ct_regiao_nao_retangular'));
  return true;
}

function removeSegment(p: Project, c: Extract<Command, { type: 'removeSegment' }>, lang: Lang): true {
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const alvo = alvoDaLinha(res, c.line, lang);
  const nk = alvo.eixo === 'u' ? res.nv : res.nu;
  if (!Number.isInteger(c.k) || c.k < 0 || c.k >= nk) throw new Error(t(lang, 'md_ct_segment_invalid'));
  const inst = instanciaDe(w);
  if (segmentosDaLinha(res, inst, alvo.chave).some((sg) => sg.k === c.k)) throw new Error(t(lang, 'md_ct_segment_invalid'));
  const bp = alvo.eixo === 'u' ? res.bv : res.bu;
  const comp = alvo.eixo === 'u' ? res.H : res.L;
  inst.removedSegments = [...(inst.removedSegments ?? []), { line: alvo.ref, k: c.k, nk, mid: centroEntre(bp, c.k) / comp }];
  normalizarParede(p, c.wallId);
  if (!regioesRetangulares(resolucaoDe(p, c.wallId, lang).res)) throw new Error(t(lang, 'md_ct_regiao_nao_retangular'));
  return true;
}

function restoreSegment(p: Project, c: Extract<Command, { type: 'restoreSegment' }>, lang: Lang): true {
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const alvo = alvoDaLinha(res, c.line, lang);
  const inst = instanciaDe(w);
  const lista = inst.removedSegments ?? [];
  const i = lista.findIndex((sg) => sg.k === c.k && chaveDaLinha(res, sg.line) === alvo.chave);
  if (i < 0) throw new Error(t(lang, 'md_ct_segment_invalid'));
  inst.removedSegments = lista.filter((_, k) => k !== i);
  normalizarParede(p, c.wallId);
  if (!regioesRetangulares(resolucaoDe(p, c.wallId, lang).res)) throw new Error(t(lang, 'md_ct_regiao_nao_retangular'));
  return true;
}

function setLineMullion(p: Project, c: Extract<Command, { type: 'setLineMullion' }>, lang: Lang): true {
  if (c.mullionTypeId !== null && !mullionTypesOf(p)[c.mullionTypeId]) throw new Error(t(lang, 'md_ct_mullion_missing'));
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const alvo = alvoDaLinha(res, c.line, lang);
  const inst = instanciaDe(w);
  if ('added' in alvo.ref) {
    const id = (alvo.ref as { added: Id }).added;
    inst.addedLines = (inst.addedLines ?? []).map((l) => (l.id === id ? { ...l, mullionTypeId: c.mullionTypeId } : l));
  } else {
    ajustarSobrescrita(inst, res, alvo, { mullionTypeId: c.mullionTypeId });
  }
  normalizarParede(p, c.wallId);
  return true;
}

function clearLineOverride(p: Project, c: Extract<Command, { type: 'clearLineOverride' }>, lang: Lang): true {
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const alvo = alvoDaLinha(res, c.line, lang);
  const inst = instanciaDe(w);
  if ('added' in alvo.ref) {
    const id = (alvo.ref as { added: Id }).added;
    inst.addedLines = (inst.addedLines ?? []).map((l) => {
      if (l.id !== id) return l;
      const copia = { ...l };
      delete copia.mullionTypeId;
      return copia;
    });
  } else {
    inst.lineOverrides = (inst.lineOverrides ?? []).filter((ov) => chaveDaLinha(res, ov.line) !== alvo.chave);
  }
  normalizarParede(p, c.wallId);
  return true;
}

/** Índice (i, j) da célula, dentro da grade atual. */
function celulaDe(res: ParedeResolvida, i: number, j: number, lang: Lang): number {
  if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= res.nu || j >= res.nv) throw new Error(t(lang, 'md_ct_cell_missing'));
  return i * res.nv + j;
}

function setCellPanel(p: Project, c: Extract<Command, { type: 'setCellPanel' }>, lang: Lang): true {
  if (!curtainPanelTypesOf(p)[c.panelTypeId]) throw new Error(t(lang, 'md_ct_panel_missing'));
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const cel = celulaDe(res, c.i, c.j, lang);
  // A região inteira recebe um só CellKey, o canônico (§5.2): o painel vale para todas as células dela.
  const rc = res.canon[cel] as number;
  const ci = Math.floor(rc / res.nv);
  const cj = rc - ci * res.nv;
  normalizarParede(p, c.wallId);
  // A normalização troca `w.curtain` por um objeto novo: a instância é lida de novo depois dela.
  const inst = instanciaDe(w);
  const demaisDaRegiao = (inst.cells ?? []).filter((e) => res.canon[e.key.i * res.nv + e.key.j] !== rc);
  inst.cells = [
    ...demaisDaRegiao,
    {
      key: { i: ci, j: cj, s: centroEntre(res.bu, ci) / res.L, z: centroEntre(res.bv, cj) / res.H, nu: res.nu, nv: res.nv },
      override: { kind: 'panel', panelTypeId: c.panelTypeId },
    },
  ];
  normalizarParede(p, c.wallId);
  return true;
}

function clearCellOverride(p: Project, c: Extract<Command, { type: 'clearCellOverride' }>, lang: Lang): true {
  const { w, res } = resolucaoDe(p, c.wallId, lang);
  const rc = res.canon[celulaDe(res, c.i, c.j, lang)] as number;
  normalizarParede(p, c.wallId);
  const inst = instanciaDe(w);
  inst.cells = (inst.cells ?? []).filter((e) => res.canon[e.key.i * res.nv + e.key.j] !== rc);
  normalizarParede(p, c.wallId);
  return true;
}
