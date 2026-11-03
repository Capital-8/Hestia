import { ot } from './catalogoAberturasBase.ts';
import { openingName, type Lang } from './i18n.ts';
import type { OpeningLeaves, OpeningType, PlanSymbol } from './openingTypes.ts';

/**
 * Catálogo brasileiro de janelas. As medidas são do VÃO (sem `nominalRef`), em largura × altura, como nas tabelas dos
 * fabricantes. Peitoris usuais: correr 1,00–1,10; maxim-ar e basculante 1,50; guilhotina 0,90. Códigos a partir de J-12
 * (J-01 a J-11 e V-02 estão em defaults.ts). Janelas já existentes com a mesma família, folhas e medida não foram
 * repetidas (ex.: correr 120 × 120, correr 150 × 100, maxim-ar 60 × 60, de abrir 120 × 120).
 */

type Extra = Partial<Omit<OpeningType, 'id' | 'kind' | 'name' | 'code' | 'width' | 'height' | 'sill' | 'leaves' | 'plan' | 'frameMaterialId' | 'glassMaterialId' | 'closure'>>;

/** Janela de alumínio pelo vão. */
const janela = (
  id: string,
  code: string,
  name: string,
  width: number,
  height: number,
  sill: number,
  leaves: OpeningLeaves,
  plan: PlanSymbol,
  extra: Extra = {},
): OpeningType => ot({ id, kind: 'window', name, code, width, height, sill, leaves, plan, ...extra }, 'mat_aluminio');

const CATALOGO_JANELAS_BR_PT: OpeningType[] = [
  // Correr: 2, 3 e 4 folhas (símbolo sliding).
  janela('ot_jc2_120x100', 'J-12', 'Janela de correr 2 folhas 120 x 100', 1.2, 1.0, 1.1, 2, 'sliding'),
  janela('ot_jc2_150x120', 'J-13', 'Janela de correr 2 folhas 150 x 120', 1.5, 1.2, 1.1, 2, 'sliding'),
  janela('ot_jc2_120x150', 'J-14', 'Janela de correr 2 folhas 120 x 150', 1.2, 1.5, 1.0, 2, 'sliding'),
  janela('ot_jc3_150x100', 'J-15', 'Janela de correr 3 folhas 150 x 100', 1.5, 1.0, 1.1, 3, 'sliding'),
  janela('ot_jc3_200x120', 'J-16', 'Janela de correr 3 folhas 200 x 120', 2.0, 1.2, 1.1, 3, 'sliding'),
  janela('ot_jc4_200x100', 'J-17', 'Janela de correr 4 folhas 200 x 100', 2.0, 1.0, 1.1, 4, 'sliding'),
  janela('ot_jc4_200x120', 'J-18', 'Janela de correr 4 folhas 200 x 120', 2.0, 1.2, 1.1, 4, 'sliding'),
  janela('ot_jc4_240x120', 'J-19', 'Janela de correr 4 folhas 240 x 120', 2.4, 1.2, 1.1, 4, 'sliding'),
  // Maxim-ar (eixo horizontal no topo, abre para fora): peitoril 1,50.
  janela('ot_jm_40x40', 'J-20', 'Janela maxim-ar 40 x 40', 0.4, 0.4, 1.5, 1, 'casement'),
  janela('ot_jm_50x50', 'J-21', 'Janela maxim-ar 50 x 50', 0.5, 0.5, 1.5, 1, 'casement'),
  janela('ot_jm_80x60', 'J-22', 'Janela maxim-ar 80 x 60', 0.8, 0.6, 1.5, 1, 'casement'),
  janela('ot_jm_80x80', 'J-23', 'Janela maxim-ar 80 x 80', 0.8, 0.8, 1.5, 1, 'casement'),
  janela('ot_jm_100x100', 'J-24', 'Janela maxim-ar 100 x 100', 1.0, 1.0, 1.5, 1, 'casement'),
  // Basculante (eixo horizontal atravessa a folha): peitoril 1,50.
  janela('ot_jb_40x40', 'J-25', 'Janela basculante 40 x 40', 0.4, 0.4, 1.5, 1, 'tilt'),
  janela('ot_jb_60x40', 'J-26', 'Janela basculante 60 x 40', 0.6, 0.4, 1.5, 1, 'tilt'),
  janela('ot_jb_80x40', 'J-27', 'Janela basculante 80 x 40', 0.8, 0.4, 1.5, 1, 'tilt'),
  janela('ot_jb_100x40', 'J-28', 'Janela basculante 100 x 40', 1.0, 0.4, 1.5, 1, 'tilt'),
  janela('ot_jb_60x60', 'J-29', 'Janela basculante 60 x 60', 0.6, 0.6, 1.5, 1, 'tilt'),
  janela('ot_jb_80x60', 'J-30', 'Janela basculante 80 x 60', 0.8, 0.6, 1.5, 1, 'tilt'),
  janela('ot_jb_100x60', 'J-31', 'Janela basculante 100 x 60', 1.0, 0.6, 1.5, 1, 'tilt'),
  janela('ot_jb_100x100', 'J-32', 'Janela basculante 100 x 100', 1.0, 1.0, 1.5, 1, 'tilt'),
  // Pivotante (eixo vertical deslocado da borda).
  janela('ot_jpv_60x60', 'J-33', 'Janela pivotante 60 x 60', 0.6, 0.6, 1.0, 1, 'pivotwin'),
  janela('ot_jpv_80x80', 'J-34', 'Janela pivotante 80 x 80', 0.8, 0.8, 1.0, 1, 'pivotwin'),
  janela('ot_jpv_100x100', 'J-35', 'Janela pivotante 100 x 100', 1.0, 1.0, 1.0, 1, 'pivotwin'),
  janela('ot_jpv_120x120', 'J-36', 'Janela pivotante 120 x 120', 1.2, 1.2, 1.0, 1, 'pivotwin'),
  // Guilhotina (duas folhas deslizando na vertical): peitoril 0,90.
  janela('ot_jg_60x120', 'J-37', 'Janela guilhotina 60 x 120', 0.6, 1.2, 0.9, 2, 'hung'),
  janela('ot_jg_80x120', 'J-38', 'Janela guilhotina 80 x 120', 0.8, 1.2, 0.9, 2, 'hung'),
  janela('ot_jg_100x150', 'J-39', 'Janela guilhotina 100 x 150', 1.0, 1.5, 0.9, 2, 'hung'),
  // De abrir (giro lateral): uma folha e duas folhas.
  janela('ot_jab_60x60', 'J-40', 'Janela de abrir 1 folha 60 x 60', 0.6, 0.6, 1.1, 1, 'hinged'),
  janela('ot_jab_80x80', 'J-41', 'Janela de abrir 1 folha 80 x 80', 0.8, 0.8, 1.1, 1, 'hinged'),
  janela('ot_jab_100x100', 'J-42', 'Janela de abrir 1 folha 100 x 100', 1.0, 1.0, 1.1, 1, 'hinged'),
  janela('ot_jab2_150x120', 'J-43', 'Janela de abrir 2 folhas 150 x 120', 1.5, 1.2, 1.1, 2, 'hinged'),
  // Fixas.
  janela('ot_jf_80x60', 'J-44', 'Janela fixa 80 x 60', 0.8, 0.6, 1.5, 1, 'fixed'),
  janela('ot_jf_120x120', 'J-45', 'Janela fixa 120 x 120', 1.2, 1.2, 1.1, 1, 'fixed'),
  // Veneziana: uma folha (a família aceita só uma; 2 e 4 folhas não existem na família).
  janela('ot_jven_120x100', 'J-46', 'Janela veneziana 120 x 100', 1.2, 1.0, 1.5, 1, 'louver'),
  janela('ot_jven_150x100', 'J-47', 'Janela veneziana 150 x 100', 1.5, 1.0, 1.5, 1, 'louver'),
  // Bandeira: fixa acima da porta (peitoril 2,10).
  janela('ot_jban_90x40', 'J-48', 'Bandeira fixa 90 x 40', 0.9, 0.4, 2.1, 1, 'fixed'),
  janela('ot_jban_90x60', 'J-49', 'Bandeira fixa 90 x 60', 0.9, 0.6, 2.1, 1, 'fixed'),
  // Banheiro: maxim-ar com peitoril alto.
  janela('ot_jbanh_100x50', 'J-50', 'Janela de banheiro (peitoril alto) 100 x 50', 1.0, 0.5, 1.8, 1, 'casement'),
];

/** Catálogo de janelas no idioma pedido (nomes são gerados na criação). */
export function catalogoJanelas(lang: Lang = 'pt'): OpeningType[] {
  return CATALOGO_JANELAS_BR_PT.map((x) => ({ ...x, name: openingName(x.name, lang) }));
}

/** Catálogo de janelas em PT (compatibilidade); use `catalogoJanelas(lang)` para o idioma ativo. */
export const CATALOGO_JANELAS_BR: OpeningType[] = catalogoJanelas('pt');
