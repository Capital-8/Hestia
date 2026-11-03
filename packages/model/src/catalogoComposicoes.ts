import { otComposicao } from './catalogoAberturasBase.ts';
import { openingName, type Lang } from './i18n.ts';
import type { OpeningFamilyId } from './opening.ts';
import { resolveLayout } from './openingCompositionLayout.ts';
import {
  COMPOSITION_VERSION,
  type CellNode,
  type CompositionNode,
  type LeafOptions,
  type NominalSpec,
  type OpeningComposition,
  type SplitNode,
} from './openingComposition.ts';
import type { OpeningType } from './openingTypes.ts';

/*
 * Catálogo de COMPOSIÇÕES (F7; spec: docs/aberturas/F1-spec-composicao.md §1 e §2). Cada tipo traz `composition`: células
 * (folha, vidro, painel) em divisões `cols`/`rows`, com perfil de batente e de divisor do material. Porta: `nominalRef 'leaf'`
 * (folha 80/90 × 210; o vão sai da composição). Janela: medida do vão. Códigos a seguir dos atuais (P-47, J-51).
 */

/** Perfis de um material: batente e divisor (ids de `OPENING_PROFILE_PRESETS`) e o material do desenho. */
interface Perfis {
  batente: string;
  divisor: string;
  material: string;
}
const MADEIRA: Perfis = { batente: 'prf_mad_batente_5x9', divisor: 'prf_mad_divisor_5x9', material: 'mat_madeira' };
const ALUMINIO: Perfis = { batente: 'prf_alu_l25', divisor: 'prf_alu_divisor_25', material: 'mat_aluminio' };
const PVC: Perfis = { batente: 'prf_pvc_60', divisor: 'prf_pvc_divisor_60', material: 'mat_pvc' };

const GIRO: LeafOptions = { handle: 'lever', leafStyle: 'panel' };
const BALCAO: LeafOptions = { handle: 'lever', leafStyle: 'louver', glassRatio: 0.5 };
const CORRER: LeafOptions = { handle: 'pull', leafStyle: 'flush' };

type Child = SplitNode['children'][number];

// Células
const folha = (id: string, family: OpeningFamilyId, plan: OpeningType['plan'], leaves: 1 | 2, options: LeafOptions = {}): CellNode => ({
  kind: 'cell',
  id,
  content: { kind: 'leaf', family, plan, leaves, options },
});
const vidro = (id: string): CellNode => ({ kind: 'cell', id, content: { kind: 'glass', glass: { kind: 'clear', thickness: 0.012, mounting: 'rebate' } } });
const painel = (id: string): CellNode => ({ kind: 'cell', id, content: { kind: 'panel', thickness: 0.02 } });

// Divisões: `fixo` = luz do módulo; `resto` = o que sobra (um por divisão).
const fixo = (value: number, node: CompositionNode): Child => ({ size: { mode: 'fixed', value }, node });
const resto = (node: CompositionNode): Child => ({ size: { mode: 'fill' }, node });
const divisao = (p: Perfis, id: string, axis: 'cols' | 'rows', children: Child[]): SplitNode => ({
  kind: 'split',
  id,
  axis,
  divider: { presetId: p.divisor },
  children,
});

// Composição: quadro com o batente do material; porta com folha nominal; janela com vão nominal.
const porta = (p: Perfis, width: number, layout: CompositionNode): OpeningComposition => ({
  version: COMPOSITION_VERSION,
  nominal: { ref: 'leaf', width, height: 2.1, gap: { w: 0.08, h: 0.05 }, nominalCellId: 'folha' } satisfies NominalSpec,
  frame: { style: 'rebate', profile: { presetId: p.batente }, depthMode: 'wall' },
  layout,
});
const janela = (p: Perfis, width: number, height: number, layout: CompositionNode): OpeningComposition => ({
  version: COMPOSITION_VERSION,
  nominal: { ref: 'opening', width, height },
  frame: { style: 'rebate', profile: { presetId: p.batente }, depthMode: 'wall' },
  layout,
});

type Base = Pick<OpeningType, 'id' | 'code' | 'name' | 'width' | 'leaves' | 'plan'>;
/** Porta de composição: altura da folha (2,10), sem peitoril, referência nominal na folha. */
const portaC = (p: Perfis, b: Base, layout: CompositionNode): OpeningType => {
  const comp = porta(p, b.width, layout);
  // Vidro ou painel lateral que chega ao piso leva travessa-base (só sob ele, nunca sob a folha; spec F1 §10, pergunta 2).
  const ate = resolveLayout(comp, undefined, 'door').cells.some((c) => Math.abs(c.luz.z0) < 1e-9 && (c.content.kind === 'glass' || c.content.kind === 'panel'));
  const composition = ate ? { ...comp, frame: { ...comp.frame, sill: { presetId: p.divisor } } } : comp;
  return otComposicao({ ...b, kind: 'door', height: 2.1, sill: 0, nominalRef: 'leaf' }, composition, p.material);
};
/** Janela de composição: medida do vão (como as janelas do catálogo). */
const janelaC = (p: Perfis, b: Base & { height: number; sill: number }, layout: CompositionNode): OpeningType =>
  otComposicao({ ...b, kind: 'window' }, janela(p, b.width, b.height, layout), p.material);

const folhaGiro = (id: string): CellNode => folha(id, 'door_swing', 'swing', 1, GIRO);

const CATALOGO_COMPOSICOES_BR_PT: OpeningType[] = [
  // Giro 90 com bandeira fixa superior (40 e 60 cm).
  portaC(MADEIRA, { id: 'ot_pband40_90', code: 'P-47', name: 'Porta de giro 90 x 210 com bandeira fixa 40', width: 0.9, leaves: 1, plan: 'swing' }, divisao(MADEIRA, 'raiz', 'rows', [resto(folhaGiro('folha')), fixo(0.4, vidro('bandeira'))])),
  portaC(MADEIRA, { id: 'ot_pband60_90', code: 'P-48', name: 'Porta de giro 90 x 210 com bandeira fixa 60', width: 0.9, leaves: 1, plan: 'swing' }, divisao(MADEIRA, 'raiz', 'rows', [resto(folhaGiro('folha')), fixo(0.6, vidro('bandeira'))])),
  // Giro 80 e 90 com 1 lateral de vidro fixo (40 cm), à esquerda e à direita.
  portaC(MADEIRA, { id: 'ot_plat40e_80', code: 'P-49', name: 'Porta de giro 80 x 210 com lateral fixa esquerda 40', width: 0.8, leaves: 1, plan: 'swing' }, divisao(MADEIRA, 'lat', 'cols', [fixo(0.4, vidro('lat-esq')), resto(folhaGiro('folha'))])),
  portaC(MADEIRA, { id: 'ot_plat40d_80', code: 'P-50', name: 'Porta de giro 80 x 210 com lateral fixa direita 40', width: 0.8, leaves: 1, plan: 'swing' }, divisao(MADEIRA, 'lat', 'cols', [resto(folhaGiro('folha')), fixo(0.4, vidro('lat-dir'))])),
  portaC(MADEIRA, { id: 'ot_plat40e_90', code: 'P-51', name: 'Porta de giro 90 x 210 com lateral fixa esquerda 40', width: 0.9, leaves: 1, plan: 'swing' }, divisao(MADEIRA, 'lat', 'cols', [fixo(0.4, vidro('lat-esq')), resto(folhaGiro('folha'))])),
  portaC(MADEIRA, { id: 'ot_plat40d_90', code: 'P-52', name: 'Porta de giro 90 x 210 com lateral fixa direita 40', width: 0.9, leaves: 1, plan: 'swing' }, divisao(MADEIRA, 'lat', 'cols', [resto(folhaGiro('folha')), fixo(0.4, vidro('lat-dir'))])),
  // Com 2 laterais de 40 cm.
  portaC(MADEIRA, { id: 'ot_plat2_80', code: 'P-53', name: 'Porta de giro 80 x 210 com 2 laterais fixas 40', width: 0.8, leaves: 1, plan: 'swing' }, divisao(MADEIRA, 'lat', 'cols', [fixo(0.4, vidro('lat-esq')), resto(folhaGiro('folha')), fixo(0.4, vidro('lat-dir'))])),
  portaC(MADEIRA, { id: 'ot_plat2_90', code: 'P-54', name: 'Porta de giro 90 x 210 com 2 laterais fixas 40', width: 0.9, leaves: 1, plan: 'swing' }, divisao(MADEIRA, 'lat', 'cols', [fixo(0.4, vidro('lat-esq')), resto(folhaGiro('folha')), fixo(0.4, vidro('lat-dir'))])),
  // Bandeira superior 40 + 2 laterais de 40.
  portaC(
    MADEIRA,
    { id: 'ot_pband_lat2_90', code: 'P-55', name: 'Porta de giro 90 x 210 com bandeira fixa 40 e 2 laterais 40', width: 0.9, leaves: 1, plan: 'swing' },
    divisao(MADEIRA, 'raiz', 'rows', [
      resto(divisao(MADEIRA, 'lat', 'cols', [fixo(0.4, vidro('lat-esq')), resto(folhaGiro('folha')), fixo(0.4, vidro('lat-dir'))])),
      fixo(0.4, vidro('bandeira')),
    ]),
  ),
  // Painel cego lateral (opaco) à esquerda.
  portaC(MADEIRA, { id: 'ot_ppainel_90', code: 'P-56', name: 'Porta de giro 90 x 210 com painel cego lateral 40', width: 0.9, leaves: 1, plan: 'swing' }, divisao(MADEIRA, 'lat', 'cols', [fixo(0.4, painel('painel-esq')), resto(folhaGiro('folha'))])),
  // Porta-balcão de 2 folhas em UMA célula, com bandeira; porta de correr de 2 folhas com bandeira.
  portaC(
    MADEIRA,
    { id: 'ot_pbalcao_band120', code: 'P-57', name: 'Porta-balcão 2 folhas 120 x 210 com bandeira fixa 40', width: 1.2, leaves: 2, plan: 'double' },
    divisao(MADEIRA, 'raiz', 'rows', [resto(folha('folha', 'door_double', 'double', 2, BALCAO)), fixo(0.4, vidro('bandeira'))]),
  ),
  portaC(
    MADEIRA,
    { id: 'ot_pcorrer_band160', code: 'P-58', name: 'Porta de correr 2 folhas 160 x 210 com bandeira fixa 40', width: 1.6, leaves: 2, plan: 'sliding' },
    divisao(MADEIRA, 'raiz', 'rows', [resto(folha('folha', 'door_sliding', 'sliding', 2, CORRER)), fixo(0.4, vidro('bandeira'))]),
  ),
  // Variações de material: giro 90 com bandeira em alumínio linha 25 e em PVC 60; giro 90 com 2 laterais em alumínio.
  portaC(ALUMINIO, { id: 'ot_pband40_alu_90', code: 'P-59', name: 'Porta de giro 90 x 210 alumínio com bandeira fixa 40', width: 0.9, leaves: 1, plan: 'swing' }, divisao(ALUMINIO, 'raiz', 'rows', [resto(folhaGiro('folha')), fixo(0.4, vidro('bandeira'))])),
  portaC(PVC, { id: 'ot_pband40_pvc_90', code: 'P-60', name: 'Porta de giro 90 x 210 PVC 60 com bandeira fixa 40', width: 0.9, leaves: 1, plan: 'swing' }, divisao(PVC, 'raiz', 'rows', [resto(folhaGiro('folha')), fixo(0.4, vidro('bandeira'))])),
  portaC(ALUMINIO, { id: 'ot_plat2_alu_90', code: 'P-61', name: 'Porta de giro 90 x 210 alumínio com 2 laterais fixas 40', width: 0.9, leaves: 1, plan: 'swing' }, divisao(ALUMINIO, 'lat', 'cols', [fixo(0.4, vidro('lat-esq')), resto(folhaGiro('folha')), fixo(0.4, vidro('lat-dir'))])),

  // Janelas (vão). Alumínio linha 25 como padrão; variações em madeira e PVC 60 (J-57 a J-59).
  janelaC(ALUMINIO, { id: 'ot_jcomb_fa150x120', code: 'J-51', name: 'Janela combinada fixa + abrir 1 folha 150 x 120', width: 1.5, height: 1.2, sill: 1.0, leaves: 1, plan: 'hinged' }, divisao(ALUMINIO, 'lat', 'cols', [fixo(0.6, vidro('fixa')), resto(folha('abrir', 'window_hinged', 'hinged', 1))])),
  janelaC(ALUMINIO, { id: 'ot_jcomb_fc180x120', code: 'J-52', name: 'Janela combinada fixa + correr 2 folhas 180 x 120', width: 1.8, height: 1.2, sill: 1.0, leaves: 2, plan: 'sliding' }, divisao(ALUMINIO, 'lat', 'cols', [fixo(0.6, vidro('fixa')), resto(folha('correr', 'window_sliding', 'sliding', 2))])),
  janelaC(ALUMINIO, { id: 'ot_jabr_fa160x120', code: 'J-53', name: 'Janela de abrir + fixa + abrir (3 módulos) 160 x 120', width: 1.6, height: 1.2, sill: 1.0, leaves: 2, plan: 'hinged' }, divisao(ALUMINIO, 'lat', 'cols', [fixo(0.45, folha('abre-esq', 'window_hinged', 'hinged', 1)), resto(vidro('fixa')), fixo(0.45, folha('abre-dir', 'window_hinged', 'hinged', 1))])),
  janelaC(ALUMINIO, { id: 'ot_jband_100x150', code: 'J-54', name: 'Janela com bandeira fixa superior 100 x 150', width: 1.0, height: 1.5, sill: 1.0, leaves: 1, plan: 'hinged' }, divisao(ALUMINIO, 'raiz', 'rows', [resto(folha('abrir', 'window_hinged', 'hinged', 1)), fixo(0.35, vidro('bandeira'))])),
  janelaC(ALUMINIO, { id: 'ot_jcorrer_band200x150', code: 'J-55', name: 'Janela de correr 2 folhas com bandeira fixa 200 x 150', width: 2.0, height: 1.5, sill: 1.0, leaves: 2, plan: 'sliding' }, divisao(ALUMINIO, 'raiz', 'rows', [resto(folha('correr', 'window_sliding', 'sliding', 2)), fixo(0.35, vidro('bandeira'))])),
  janelaC(ALUMINIO, { id: 'ot_jalta_80x210', code: 'J-56', name: 'Janela alta (fixa + abrir embaixo) 80 x 210', width: 0.8, height: 2.1, sill: 0.5, leaves: 1, plan: 'hinged' }, divisao(ALUMINIO, 'raiz', 'rows', [fixo(1.0, folha('abrir', 'window_hinged', 'hinged', 1)), resto(vidro('fixa'))])),
  janelaC(MADEIRA, { id: 'ot_jcomb_madeira_150x120', code: 'J-57', name: 'Janela combinada madeira fixa + abrir 1 folha 150 x 120', width: 1.5, height: 1.2, sill: 1.0, leaves: 1, plan: 'hinged' }, divisao(MADEIRA, 'lat', 'cols', [fixo(0.6, vidro('fixa')), resto(folha('abrir', 'window_hinged', 'hinged', 1))])),
  janelaC(PVC, { id: 'ot_jcomb_pvc_150x120', code: 'J-58', name: 'Janela combinada PVC 60 fixa + abrir 1 folha 150 x 120', width: 1.5, height: 1.2, sill: 1.0, leaves: 1, plan: 'hinged' }, divisao(PVC, 'lat', 'cols', [fixo(0.6, vidro('fixa')), resto(folha('abrir', 'window_hinged', 'hinged', 1))])),
  janelaC(MADEIRA, { id: 'ot_jalta_madeira_80x210', code: 'J-59', name: 'Janela alta madeira (fixa + abrir embaixo) 80 x 210', width: 0.8, height: 2.1, sill: 0.5, leaves: 1, plan: 'hinged' }, divisao(MADEIRA, 'raiz', 'rows', [fixo(1.0, folha('abrir', 'window_hinged', 'hinged', 1)), resto(vidro('fixa'))])),
];

/** Catálogo de composições no idioma pedido (nomes são gerados na criação). */
export function catalogoComposicoes(lang: Lang = 'pt'): OpeningType[] {
  return CATALOGO_COMPOSICOES_BR_PT.map((x) => ({ ...x, name: openingName(x.name, lang) }));
}

/** Catálogo de composições em PT (compatibilidade); use `catalogoComposicoes(lang)` para o idioma ativo. */
export const CATALOGO_COMPOSICOES_BR: OpeningType[] = catalogoComposicoes('pt');
