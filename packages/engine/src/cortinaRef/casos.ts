/**
 * Casos canônicos de entrada da referência TS da parede cortina (decisão 0056, fase 1). `casos.json` é gerado daqui
 * (`GERAR_CASOS=1 npx vitest run packages/engine/src/cortinaRef/casos.test.ts`) e guarda, por caso, a ENTRADA e a
 * saída `esperado` da referência (formato de consulta, 1 µm). O teste de paridade lê o mesmo arquivo dos dois lados.
 */
import type { CortinaEntrada, CurtainMullions, CurtainPanelTypeRef, GridAxisSpec, MullionTypeRef } from './tipos.ts';

/** Tabelas de tipos dos casos. `num` é o `id_num` do contrato; `materialNum` o `material_num`. */
export const MONTANTES: MullionTypeRef[] = [
  { id: 'mul_ret_50x100', num: 1, profile: { shape: 'rect', width: 0.05, depth: 0.1 }, materialId: 'mat_aluminio', materialNum: 1 },
  { id: 'mul_ret_50x150', num: 2, profile: { shape: 'rect', width: 0.05, depth: 0.15 }, materialId: 'mat_aluminio', materialNum: 1 },
  { id: 'mul_red_50', num: 3, profile: { shape: 'round', width: 0.05, depth: 0.05 }, materialId: 'mat_aluminio', materialNum: 1 },
  { id: 'mul_junta_12', num: 4, profile: { shape: 'rect', width: 0.012, depth: 0.02 }, materialId: 'mat_silicone', materialNum: 3 },
  { id: 'mul_largo_200', num: 5, profile: { shape: 'rect', width: 0.2, depth: 0.1 }, materialId: 'mat_aluminio', materialNum: 1 },
];

export const PAINEIS: CurtainPanelTypeRef[] = [
  { id: 'pnl_vidro_10', num: 1, kind: 'glass', thickness: 0.01, materialId: 'mat_vidro', materialNum: 2 },
  { id: 'pnl_solido_alu_4', num: 2, kind: 'solid', thickness: 0.004, bite: 0.01, materialId: 'mat_aluminio', materialNum: 1 },
  { id: 'pnl_vazio', num: 3, kind: 'empty', thickness: 0, materialId: 'mat_vidro', materialNum: 2 },
];

const todos = (id: string | null, join: 'vertical' | 'horizontal' = 'vertical'): CurtainMullions => ({
  interiorVertical: id, interiorHorizontal: id, borderStart: id, borderEnd: id, borderBottom: id, borderTop: id, corner: null, joinPriority: join,
});

interface Opcoes {
  mullions?: CurtainMullions;
  painel?: string;
  minCell?: number;
  instancia?: CortinaEntrada['instancia'];
  profundidade?: number;
}

function caso(nome: string, L: number, H: number, u: GridAxisSpec, v: GridAxisSpec, o: Opcoes = {}): CortinaEntrada {
  return {
    nome, L, H,
    tipo: {
      depth: o.profundidade ?? 0.1, u, v, mullions: o.mullions ?? todos('mul_ret_50x100'),
      defaultPanelTypeId: o.painel ?? 'pnl_vidro_10', ...(o.minCell !== undefined ? { minCell: o.minCell } : {}),
    },
    ...(o.instancia ? { instancia: o.instancia } : {}),
    montantes: MONTANTES, paineis: PAINEIS,
  };
}

const sem = (m: Partial<CurtainMullions>): CurtainMullions => ({ ...todos('mul_ret_50x100'), ...m });
const V3: GridAxisSpec = { mode: 'fixedNumber', count: 1 };

export function gerarCasos(): CortinaEntrada[] {
  return [
    // fixedNumber
    caso('fixedNumber 4x3', 6, 3, { mode: 'fixedNumber', count: 4 }, { mode: 'fixedNumber', count: 3 }),
    caso('fixedNumber count=1 (sem linha interna)', 4, 3, { mode: 'fixedNumber', count: 1 }, V3),
    caso('fixedNumber offset positivo', 6, 3, { mode: 'fixedNumber', count: 4, offset: 0.5 }, V3),
    caso('fixedNumber offset negativo', 6, 3, { mode: 'fixedNumber', count: 4, offset: -0.3 }, V3),
    caso('fixedNumber offset maior que o vao', 6, 3, { mode: 'fixedNumber', count: 4, offset: 20 }, V3),
    caso('fixedNumber offset deixa ponta minuscula (fundida)', 6, 3, { mode: 'fixedNumber', count: 4, offset: 0.03 }, V3),
    // maxDistance
    caso('maxDistance divisivel', 3, 3, { mode: 'maxDistance', distance: 1.5 }, { mode: 'maxDistance', distance: 1.5 }),
    caso('maxDistance nao divisivel', 5, 3, { mode: 'maxDistance', distance: 1.2 }, { mode: 'maxDistance', distance: 1.4 }),
    caso('maxDistance d maior que L', 1, 1, { mode: 'maxDistance', distance: 4 }, { mode: 'maxDistance', distance: 4 }),
    // fixedDistance
    caso('fixedDistance start com sobra', 5, 3, { mode: 'fixedDistance', distance: 1.2 }, { mode: 'fixedDistance', distance: 1 }),
    caso('fixedDistance start sobra minuscula fundida', 3.02, 3, { mode: 'fixedDistance', distance: 1 }, V3),
    caso('fixedDistance start sobra no limiar (nao funde)', 3.05, 3, { mode: 'fixedDistance', distance: 1 }, V3),
    caso('fixedDistance end com sobra', 5, 3, { mode: 'fixedDistance', distance: 1.2, justify: 'end' }, { mode: 'fixedDistance', distance: 1, justify: 'end' }),
    caso('fixedDistance end sobra minuscula fundida', 3.02, 3, { mode: 'fixedDistance', distance: 1, justify: 'end' }, V3),
    caso('fixedDistance center com sobra', 5, 3, { mode: 'fixedDistance', distance: 1.2, justify: 'center' }, { mode: 'fixedDistance', distance: 1, justify: 'center' }),
    caso('fixedDistance center sobras minusculas fundidas', 3.04, 3, { mode: 'fixedDistance', distance: 1, justify: 'center' }, V3),
    caso('fixedDistance d maior que L', 3, 3, { mode: 'fixedDistance', distance: 5 }, { mode: 'fixedDistance', distance: 5, justify: 'center' }),
    caso('fixedDistance d igual a L', 3, 3, { mode: 'fixedDistance', distance: 3 }, { mode: 'fixedDistance', distance: 3 }),
    caso('fixedDistance com offset', 5, 3, { mode: 'fixedDistance', distance: 1.2, offset: 0.3 }, { mode: 'fixedDistance', distance: 1, offset: -0.4 }),
    caso('fixedDistance minRemainder maior', 3.15, 3, { mode: 'fixedDistance', distance: 1, minRemainder: 0.2 }, V3),
    caso('fixedDistance minRemainder zero (sem fusao)', 3.02, 3, { mode: 'fixedDistance', distance: 1, minRemainder: 0 }, V3),
    caso('fixedDistance sobra fundida passa de 1,5 d', 0.08, 3, { mode: 'fixedDistance', distance: 0.03 }, V3, { minCell: 0.01 }),
    // manual
    caso('manual ancora start com posicao fora', 6, 3, { mode: 'maxDistance', distance: 1.2 }, { mode: 'manual', positions: [2, 10] }),
    caso('manual ancora end', 6, 3, { mode: 'manual', positions: [1, 2.5], anchor: 'end' }, { mode: 'manual', positions: [0.5], anchor: 'end' }),
    caso('manual dedupe', 6, 3, { mode: 'manual', positions: [1, 1.0000005, 2, 2, 3] }, V3),
    caso('manual vazio', 6, 3, { mode: 'manual', positions: [] }, { mode: 'manual', positions: [] }),
    // bordas e perfis
    caso('L muito pequeno', 0.1, 0.1, { mode: 'fixedDistance', distance: 0.4 }, { mode: 'fixedNumber', count: 2 }),
    caso('celulas menores que a minima e montantes sobrepostos', 0.1, 3, { mode: 'fixedNumber', count: 5 }, V3),
    caso('minCell personalizada', 3, 3, { mode: 'fixedNumber', count: 3 }, { mode: 'fixedNumber', count: 3 }, { minCell: 1.2 }),
    caso('joinPriority horizontal', 4, 3, { mode: 'fixedNumber', count: 4 }, { mode: 'fixedNumber', count: 3 }, { mullions: todos('mul_ret_50x100', 'horizontal') }),
    caso('montante redondo sem borda', 4, 3, { mode: 'fixedNumber', count: 4 }, { mode: 'fixedNumber', count: 3 }, {
      mullions: sem({ interiorVertical: 'mul_red_50', interiorHorizontal: 'mul_red_50', borderStart: null, borderEnd: null, borderBottom: null, borderTop: null }),
    }),
    caso('vidro colado: juntas, painel sem montante nas bordas', 4.8, 2.4, { mode: 'fixedDistance', distance: 1.2, justify: 'center' }, { mode: 'fixedDistance', distance: 2.4 }, {
      mullions: todos('mul_junta_12', 'horizontal'),
    }),
    caso('sem nenhum montante', 4, 3, { mode: 'fixedNumber', count: 4 }, { mode: 'fixedNumber', count: 3 }, { mullions: todos(null) }),
    caso('painel vazio', 4, 3, { mode: 'fixedNumber', count: 2 }, { mode: 'fixedNumber', count: 2 }, { painel: 'pnl_vazio' }),
    caso('painel solido (bite proprio)', 4, 3, { mode: 'fixedNumber', count: 2 }, { mode: 'fixedNumber', count: 2 }, { painel: 'pnl_solido_alu_4' }),
    caso('montante largo consome a peca horizontal', 0.25, 3, { mode: 'fixedNumber', count: 2 }, V3, { mullions: sem({ interiorVertical: 'mul_largo_200' }) }),
    caso('perfil mais fundo que o sistema', 4, 3, { mode: 'fixedNumber', count: 2 }, V3, { profundidade: 0.08, mullions: todos('mul_ret_50x150') }),
    // instancia
    caso('instancia sobrescreve o eixo e o painel', 6, 3, { mode: 'fixedNumber', count: 4 }, { mode: 'fixedNumber', count: 3 }, {
      instancia: { grid: { u: { mode: 'fixedDistance', distance: 2, justify: 'center' }, v: { count: 2 } }, defaultPanelTypeId: 'pnl_solido_alu_4' },
    }),
    // presets do ADR (4.5)
    caso('preset wt_cortina_vitrine', 6, 3, { mode: 'maxDistance', distance: 1.2 }, { mode: 'manual', positions: [2, 10] }),
    caso('preset wt_cortina_fachada', 10, 7, { mode: 'fixedDistance', distance: 1.5 }, { mode: 'fixedDistance', distance: 3.6 }),
    caso('preset wt_cortina_vidro_colado', 6, 4.8, { mode: 'fixedDistance', distance: 1.2, justify: 'center' }, { mode: 'fixedDistance', distance: 2.4 }, {
      mullions: todos('mul_junta_12', 'horizontal'),
    }),
  ];
}
