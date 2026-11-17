import type { OpeningType } from './openingTypes.ts';
import { openingFamilyOf, type OpeningFamilyId } from './opening.ts';
import { openingNominalRef, openingSpanGap, openingSpanOf } from './openingNominal.ts';
import { compositionIssue } from './openingCompositionRules.ts';
import { profileMaterialOf } from './openingProfiles.ts';
import { CAMPOS_SEM_MAPEAMENTO, OPTION_KEYS, syncAuthoredComposition } from './openingCompositionSync.ts';
import {
  COMPOSITION_VERSION,
  LEGACY_SIDELIGHT_MULLION,
  LEGACY_TRANSOM_BAR,
  type CellNode,
  type CompositionNode,
  type LeafOptions,
  type OpeningComposition,
  type ProfilePreset,
  type ProfileSpec,
  type SplitNode,
} from './openingComposition.ts';

/** Padrões do batente quando o tipo antigo não os define (iguais a OPENING_FRAME_DEFAULTS, em defaults.ts). */
const FRAME_W = 0.05;
const FRAME_D = 0.09;
const positive = (v: number | undefined, f: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : f);

/** Campos de folha do tipo antigo que viram `LeafOptions` da célula (só os definidos, para não gravar `undefined`): ver `OPTION_KEYS`. */
function optionsOf(t: OpeningType): LeafOptions {
  const o: Record<string, unknown> = {};
  for (const k of OPTION_KEYS) if (t[k] !== undefined) o[k] = t[k];
  return o as LeafOptions;
}

const SECTION_OF_STYLE = { rebate: 'rect_rebate', simple: 'rect', aduela: 'rect_rebate', block: 'none' } as const;

function mainCell(t: OpeningType): CellNode {
  const family: OpeningFamilyId = openingFamilyOf(t)?.id ?? (t.kind === 'door' ? 'door_swing' : 'window_fixed');
  return { kind: 'cell', id: 'c1', content: { kind: 'leaf', family, plan: t.plan, leaves: t.leaves, options: optionsOf(t) } };
}

/** Bandeira do tipo antigo: vidro fixo, ou (`fixed: false`) célula maxim-ar. */
function transomCell(t: OpeningType, thickness: number): CellNode {
  if (t.transom?.fixed === false) {
    return { kind: 'cell', id: 'transom', content: { kind: 'leaf', family: 'window_casement', plan: 'casement', leaves: 1, options: {} } };
  }
  return { kind: 'cell', id: 'transom', content: { kind: 'glass', glass: { kind: t.glassKind ?? 'clear', thickness, mounting: 'rebate' } } };
}

const dividerOf = (frame: ProfileSpec, width: number) => ({ inline: { ...frame, visibleWidth: width, section: 'T' as const } });

/**
 * Tipo atual → composição (spec §7). Sem `transom`/`sidelights`: UMA célula, vão e peças idênticos aos de hoje. Com eles: o
 * mapeamento da §7 (bandeira acima da folha, vidros nas laterais; a célula principal é `fill`); `nominalRef 'leaf'` vira
 * 'opening' com o vão atual. Lê só campos do tipo; nunca lança (valores inválidos caem nos padrões).
 */
/** JSON com chaves em ordem, para comparar composições sem depender da ordem dos campos. */
export const canonComposition = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x,
  );

/** Famílias de janela que aceitam bandeira superior (E3 §7) e a única que aceita lateral (`window_fixed`). */
const FAMILIAS_COM_BANDEIRA = new Set(['window_fixed', 'window_hinged', 'window_casement', 'window_sliding', 'window_tilt', 'window_pivot']);

export function compositionOfType(t: OpeningType): OpeningComposition {
  const style = t.frameStyle ?? 'rebate';
  const frame: ProfileSpec = {
    material: profileMaterialOf(t.frameMaterialId),
    section: SECTION_OF_STYLE[style] ?? 'rect_rebate',
    visibleWidth: positive(t.frameWidth, FRAME_W),
    depth: positive(t.frameDepth, FRAME_D),
  };
  const casing = t.casing
    ? { faces: t.casing.sides ?? ('both' as const), width: t.casing.width, thickness: t.casing.thickness, setback: 0 }
    : undefined;
  const head = { frame: { style, profile: { inline: frame }, depthMode: t.frameDepthMode ?? ('wall' as const) }, ...(casing ? { casing } : {}) };
  // Janela: bandeira e laterais só onde o E3 §7 permite (o motor antigo ignorava nas demais famílias).
  const fam = openingFamilyOf(t)?.id;
  const janela = t.kind === 'window';
  const sl = t.sidelights && (t.sidelights.left || t.sidelights.right) && (!janela || fam === 'window_fixed') ? t.sidelights : undefined;
  const tr = t.transom && t.transom.height > 0 && (!janela || (t.leaves > 0 && !!fam && FAMILIAS_COM_BANDEIRA.has(fam))) ? t.transom : undefined;

  if (!sl && !tr) {
    const leaf = openingNominalRef(t) === 'leaf';
    return {
      version: COMPOSITION_VERSION,
      nominal: { ref: leaf ? 'leaf' : 'opening', width: t.width, height: t.height, ...(leaf ? { gap: openingSpanGap(t), nominalCellId: 'c1' } : {}) },
      ...head,
      layout: mainCell(t),
    };
  }

  // Bandeira e/ou laterais: o vão atual manda (a folha encolhia no modelo antigo), nominal 'opening'.
  const span = openingSpanOf({ width: t.width, height: t.height, nominalRef: t.nominalRef, spanGap: t.spanGap });
  let node: CompositionNode = mainCell(t);
  if (sl) {
    const n = (sl.left ? 1 : 0) + (sl.right ? 1 : 0);
    // Largura do vidro lateral: pedida, no máximo metade do vão e sem esmagar a célula principal (mínimo 0,1 de luz).
    const room = (span.width - 2 * frame.visibleWidth - n * LEGACY_SIDELIGHT_MULLION - 0.1) / n;
    const w = Math.max(0.01, Math.min(sl.width, span.width / 2, room));
    const side = (id: string): { size: { mode: 'fixed'; value: number }; node: CellNode } => ({
      size: { mode: 'fixed', value: w },
      node: { kind: 'cell', id, content: { kind: 'glass', glass: { kind: t.glassKind ?? 'clear', thickness: positive(t.glassThickness, 0.012), mounting: 'rebate' } } },
    });
    const cols: SplitNode['children'] = [
      ...(sl.left ? [side('side-left')] : []),
      { size: { mode: 'fill' }, node },
      ...(sl.right ? [side('side-right')] : []),
    ];
    node = { kind: 'split', id: 'cols', axis: 'cols', children: cols, divider: dividerOf(frame, LEGACY_SIDELIGHT_MULLION) };
  }
  if (tr) {
    const h = Math.min(tr.height, 0.4 * span.height);
    node = {
      kind: 'split',
      id: 'rows',
      axis: 'rows',
      children: [{ size: { mode: 'fill' }, node }, { size: { mode: 'fixed', value: h }, node: transomCell(t, positive(t.glassThickness, 0.012)) }],
      divider: dividerOf(frame, LEGACY_TRANSOM_BAR),
    };
  }
  return { version: COMPOSITION_VERSION, nominal: { ref: 'opening', width: span.width, height: span.height }, ...head, layout: node };
}

/** Composição do tipo: a gravada, ou a derivada dos campos atuais (leitor da ponte F3–F5, spec §7). */
export const openingCompositionOf = (t: OpeningType): OpeningComposition => t.composition ?? compositionOfType(t);

/**
 * Ponte F3–F5 (spec §7) para `upsertOpeningType`. Tipo que já tem composição (ele ou a versão gravada): se é de UMA célula, ou ainda
 * traz bandeira/laterais antigas, a edição vem dos campos atuais e a composição é regenerada; a de várias células editada direto
 * é preservada. Em qualquer caso valida com `compositionIssue` (lança `Error`). Tipo sem composição passa como está.
 */
export function withBridgedComposition(next: OpeningType, prev: OpeningType | undefined, profiles?: Record<string, ProfilePreset>): OpeningType {
  if (!next.composition && !prev?.composition) return next;
  // Composição editada direto (nova ou diferente da gravada) é preservada; os campos obsoletos só regeneram a composição intocada.
  const edited = !!next.composition && (!prev?.composition || canonComposition(next.composition) !== canonComposition(prev.composition));
  // Só a composição DERIVADA dos campos antigos é regenerada quando eles mudam; a autoral (perfis, alizar, células) é preservada.
  const derivada = !prev?.composition || canonComposition(prev.composition) === canonComposition(compositionOfType(prev));
  const legacy = !next.composition || (!edited && derivada && (next.composition.layout.kind === 'cell' || !!next.transom || !!next.sidelights));
  // Composição autoral intocada e campos planos editados (vão, perfil do batente, opções de folha, alizar): a composição os recebe
  // (regra em `syncAuthoredComposition`); antes o campo gravava e o vão/peça não mudava.
  const sync = !legacy && !edited && !!prev?.composition && !derivada;
  const out = legacy ? { ...next, composition: compositionOfType(next) } : sync ? { ...next, composition: syncAuthoredComposition(next.composition!, prev!, next, profiles) } : next;
  const issue = compositionIssue(out.composition!, profiles);
  if (issue) throw new Error(issue);
  return out;
}

/** A composição do tipo foi editada nos módulos (não é só a derivada dos campos planos). */
export const isAuthoredComposition = (t: OpeningType): boolean => !!t.composition && canonComposition(t.composition) !== canonComposition(compositionOfType(t));

/**
 * Campos planos do tipo que a composição AUTORAL não acompanha (bandeira, laterais, estilo e material do batente): o diálogo
 * deve travá-los com aviso e remeter aos módulos. Vazio para tipo sem composição ou com composição só derivada dos campos.
 */
export function camposTravadosPelaComposicao(t: OpeningType): Set<keyof OpeningType> {
  return new Set<keyof OpeningType>(isAuthoredComposition(t) ? CAMPOS_SEM_MAPEAMENTO : []);
}
