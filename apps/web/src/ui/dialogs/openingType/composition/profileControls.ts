import {
  CASING_RULES,
  GLASS_REBATE_DEFAULTS,
  OPENING_PROFILE_PRESETS,
  compositionCells,
  resolveProfile,
  type CasingFaces,
  type CasingSpec,
  type CellNode,
  type CompositionNode,
  type GlassRebate,
  type GlassSpec,
  type Id,
  type OpeningComposition,
  type ProfileField,
  type ProfilePreset,
  type ProfileRef,
  type ProfileRole,
  type ProfileSpec,
  type SplitNode,
} from '@hestia/model';
import { t, type Dict, type Lang } from '../../../../editor/i18n.ts';

/** Presets do projeto (`openingProfilesOf`): semente mais o que o projeto acrescentou ou editou. */
export type Profiles = Readonly<Record<Id, ProfilePreset>>;

const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Presets que valem para o papel (`roles`) e os perfis próprios do projeto (fora da semente). */
export function presetsParaPapel(papel: ProfileRole, perfis: Profiles): ProfilePreset[] {
  const semente = new Set<string>(OPENING_PROFILE_PRESETS.map((p) => p.id));
  return Object.values(perfis).filter((p) => p.roles.includes(papel) || !semente.has(p.id));
}

/** Preset da referência; null quando o perfil é próprio do tipo (`inline`) ou o preset sumiu. */
export function presetDaRef(r: ProfileRef, perfis: Profiles): ProfilePreset | null {
  return 'presetId' in r ? (perfis[r.presetId] ?? null) : null;
}

/** Campo sem fonte confirmada: o preset não o confirma (R2) ou o perfil é próprio do tipo. */
export function aValidar(r: ProfileRef, perfis: Profiles, campo: ProfileField): boolean {
  const p = presetDaRef(r, perfis);
  return !p || !p.confirmed.includes(campo);
}

/** Fonte curta do perfil para o painel. */
export function fonteDaRef(r: ProfileRef, perfis: Profiles, lang: Lang = 'pt'): string {
  return presetDaRef(r, perfis)?.source ?? t(lang, 'dlo_prof_source_inline');
}

/** Troca o preset: a referência passa a ser só o preset (o ajuste anterior sai). */
export const trocarPreset = (presetId: Id): ProfileRef => ({ presetId });

/**
 * Grava um campo do perfil. Em preset, vai para `override` e só fica o que difere do preset (igual ao preset tira o campo);
 * em perfil próprio (`inline`), altera o próprio spec.
 */
export function ajustarCampo<K extends keyof ProfileSpec>(r: ProfileRef, perfis: Profiles, campo: K, valor: ProfileSpec[K]): ProfileRef {
  if ('inline' in r) return { inline: { ...r.inline, [campo]: valor } };
  const base = perfis[r.presetId]?.spec;
  const override: Partial<ProfileSpec> = { ...(r.override ?? {}) };
  if (base && igual(base[campo], valor)) delete override[campo];
  else override[campo] = valor;
  return Object.keys(override).length > 0 ? { presetId: r.presetId, override } : { presetId: r.presetId };
}

/** Rebaixo do vidro do perfil: o valor efetivo com o trecho alterado (padrões a validar quando o perfil não tem rebaixo). */
export function ajustarRebaixo(r: ProfileRef, perfis: Profiles, patch: Partial<GlassRebate>): ProfileRef {
  const atual = resolveProfile(r, perfis).glassRebate ?? GLASS_REBATE_DEFAULTS;
  return ajustarCampo(r, perfis, 'glassRebate', { ...atual, ...patch });
}

// ───────────────────────── Árvore: quadro e divisores ─────────────────────────

/** Todas as divisões da árvore, em ordem (cada uma é um divisor do quadro). */
export function divisores(n: CompositionNode): SplitNode[] {
  if (n.kind === 'cell') return [];
  return [n, ...n.children.flatMap((ch) => divisores(ch.node))];
}

/** Troca o nó de id dado (ids são únicos); os demais ficam como estão. */
function trocaNo(n: CompositionNode, id: string, f: (x: CompositionNode) => CompositionNode): CompositionNode {
  if (n.id === id) return f(n);
  if (n.kind === 'cell') return n;
  return { ...n, children: n.children.map((ch) => ({ ...ch, node: trocaNo(ch.node, id, f) })) };
}

export const comBatente = (c: OpeningComposition, profile: ProfileRef): OpeningComposition => ({ ...c, frame: { ...c.frame, profile } });

/** Perfil do divisor da divisão `splitId`; `undefined` volta ao padrão (largura 5 cm, material do batente). */
export function comDivisor(c: OpeningComposition, splitId: string, ref: ProfileRef | undefined): OpeningComposition {
  return {
    ...c,
    layout: trocaNo(c.layout, splitId, (x) => {
      const s: SplitNode = { ...(x as SplitNode) };
      if (ref) s.divider = ref;
      else delete s.divider;
      return s;
    }),
  };
}

// ───────────────────────── Alizar ─────────────────────────

/** Faces do alizar com a chave do rótulo da interface (a ordem é a do seletor). */
export const ALIZAR_FACES: ReadonlyArray<readonly [CasingFaces, keyof Dict]> = [
  ['both', 'dlo_o_casing_both'],
  ['swing', 'dlo_o_casing_swing'],
  ['opposite', 'dlo_o_casing_opposite'],
  ['exterior', 'dlo_o_casing_exterior'],
  ['interior', 'dlo_o_casing_interior'],
  ['none', 'dlo_o_casing_none'],
];

/** Alizar ligado = há alizar e alguma face dele está habilitada. */
export const alizarLigado = (c: OpeningComposition): boolean => !!c.casing && c.casing.faces !== 'none';

/** Grava campos do alizar; sem alizar gravado, parte das medidas padrão (faces 'none' até o usuário escolher). */
export function comAlizar(c: OpeningComposition, patch: Partial<CasingSpec>): OpeningComposition {
  const atual: CasingSpec = c.casing ?? {
    faces: 'none',
    width: CASING_RULES.defaultWidth,
    thickness: CASING_RULES.defaultThickness,
    setback: CASING_RULES.defaultSetback,
  };
  return { ...c, casing: { ...atual, ...patch } };
}

// ───────────────────────── Vidro ─────────────────────────

/** Células de vidro da composição, na ordem da árvore. */
export const vidros = (c: OpeningComposition): CellNode[] => compositionCells(c).filter((x) => x.content.kind === 'glass');

/** Grava campos do vidro da célula `cellId` (só células de vidro mudam). */
export function comVidro(c: OpeningComposition, cellId: string, patch: Partial<GlassSpec>): OpeningComposition {
  return {
    ...c,
    layout: trocaNo(c.layout, cellId, (x) => {
      const cell = x as CellNode;
      if (cell.content.kind !== 'glass') return x;
      return { ...cell, content: { kind: 'glass', glass: { ...cell.content.glass, ...patch } } };
    }),
  };
}
