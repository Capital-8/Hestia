// Predefinições de parede cortina (decisão 0056, §4.5): os três tipos de fábrica. Ficam em `wallTypes(lang)` (defaults.ts),
// junto dos tipos de parede padrão, e são a base de "Duplicar como cortina" no diálogo do tipo.
// Os nomes são traduzidos (`md_ct_preset_*`); os ids são estáveis e não mudam com o idioma.

import { t, type Lang } from './i18n.ts';
import type { Layer, WallType } from './types.ts';
import type { CurtainSpec } from './wallCurtainTypes.ts';

export const CURTAIN_PRESET_ID = {
  vitrine: 'wt_cortina_vitrine',
  fachada: 'wt_cortina_fachada',
  vidroColado: 'wt_cortina_vidro_colado',
} as const;

export type CurtainPresetId = (typeof CURTAIN_PRESET_ID)[keyof typeof CURTAIN_PRESET_ID];

/** Um tipo de parede cortina com a camada-sombra da profundidade (§4.1): o único elemento de estrutura tem a espessura do sistema. */
function tipoCortina(id: string, name: string, code: string, description: string, curtain: CurtainSpec): WallType {
  const sombra: Layer = { function: 'structure', materialId: 'mat_aluminio', thickness: curtain.depth, wraps: false };
  return {
    id,
    name,
    code,
    description,
    layers: [sombra],
    family: 'curtain',
    curtain,
    wrapInserts: 'none',
    wrapEnds: 'none',
    strips: [],
    cost: 0,
    thermalU: null,
    acousticRw: null,
    fireRating: null,
    manufacturer: '',
  };
}

/** Todos os papéis de montante com o mesmo tipo (predefinição "todos iguais"); o canto segue o mesmo tipo. */
const todosOsPapeis = (mullion: string, joinPriority: 'vertical' | 'horizontal'): CurtainSpec['mullions'] => ({
  interiorVertical: mullion,
  interiorHorizontal: mullion,
  borderStart: mullion,
  borderEnd: mullion,
  borderBottom: mullion,
  borderTop: mullion,
  corner: mullion,
  joinPriority,
});

/**
 * Os três tipos de fábrica, no idioma pedido. Valores de §4.5 do ADR: vidraça de fachada (storefront, profundidade 0,10 m,
 * grade máxima 1,20 m na horizontal e posições manuais 2 e 10 m na vertical), fachada modular (módulos de 1,50 × 3,60 m)
 * e vidro colado (juntas de 12 mm, sem montante aparente entre vidros). Profundidade da fachada e do vidro colado não estão
 * no ADR: escolha desta fase, a conferir com o dono.
 */
export function curtainWallTypes(lang: Lang = 'pt'): WallType[] {
  return [
    tipoCortina(
      CURTAIN_PRESET_ID.vitrine,
      t(lang, 'md_ct_preset_vitrine'),
      'CT-VIT',
      t(lang, 'md_ct_preset_vitrine_desc'),
      {
        depth: 0.1,
        u: { mode: 'maxDistance', distance: 1.2 },
        v: { mode: 'manual', positions: [2, 10], anchor: 'start' },
        mullions: todosOsPapeis('mul_ret_50x100', 'vertical'),
        defaultPanelTypeId: 'pnl_vidro_10',
      },
    ),
    tipoCortina(
      CURTAIN_PRESET_ID.fachada,
      t(lang, 'md_ct_preset_fachada'),
      'CT-FAC',
      t(lang, 'md_ct_preset_fachada_desc'),
      {
        depth: 0.15,
        u: { mode: 'fixedDistance', distance: 1.5, justify: 'start' },
        v: { mode: 'fixedDistance', distance: 3.6, justify: 'start' },
        mullions: todosOsPapeis('mul_ret_50x150', 'vertical'),
        defaultPanelTypeId: 'pnl_vidro_duplo_24',
      },
    ),
    tipoCortina(
      CURTAIN_PRESET_ID.vidroColado,
      t(lang, 'md_ct_preset_vidro_colado'),
      'CT-COL',
      t(lang, 'md_ct_preset_vidro_colado_desc'),
      {
        depth: 0.024,
        u: { mode: 'fixedDistance', distance: 1.2, justify: 'center' },
        v: { mode: 'fixedDistance', distance: 2.4, justify: 'start' },
        mullions: todosOsPapeis('mul_junta_12', 'horizontal'),
        defaultPanelTypeId: 'pnl_vidro_duplo_24',
      },
    ),
  ];
}

/** Tipo de fábrica pelo id, no idioma pedido (null quando o id não é predefinição). */
export function curtainPresetType(id: string, lang: Lang = 'pt'): WallType | null {
  return curtainWallTypes(lang).find((w) => w.id === id) ?? null;
}
