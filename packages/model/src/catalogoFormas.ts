import { ot } from './catalogoAberturasBase.ts';
import { openingName, type Lang } from './i18n.ts';
import type { OpeningShape } from './openingShape.ts';
import type { OpeningLeaves, OpeningType, PlanSymbol } from './openingTypes.ts';

/**
 * Tipos de catálogo com forma de vão (docs/estudo-esquadrias/34, §5): arco pleno, abatido, ogival, círculo (óculo) e empena,
 * em porta e em janela. Só entram as formas que as fontes do estudo sustentam (docs/estudo-esquadrias/20 §3.1 e §6, coleta 13
 * §3 e os presets de estilo do Lapin: Romanesque = `round`, Victorian = `segmental` com flecha w/6, Arched casement = `segmental`
 * com flecha w/4, Gothic = `pointed` equilátero, Round window = `circle` com altura = largura; empena com flecha w/4).
 *
 * AS DIMENSÕES SÃO ILUSTRATIVAS. Nenhuma fonte coletada (13, 15) dá medida de porta ou janela em arco, ogival, óculo ou empena
 * (doc 20 §6: "Dimensões padrão de arco ou círculo: nenhuma fonte"). Os valores seguem as medidas padrão do Lapin (porta
 * 0,90 x 2,10; janela 1,20 x 1,50 com peitoril 0,90, doc 20 §1.1 e §2.1), que são predefinição de software, não norma. Todo tipo
 * daqui leva "Dimensão ilustrativa" no campo de nota (`description`), que aparece no painel "Quadro e dados".
 *
 * Ferradura e trapézio NÃO entram no catálogo: as fontes (20, 13, 15) não os tratam como tipo de esquadria; existem no modelo e
 * no diálogo (doc 32), e o usuário os cria a partir de qualquer tipo. Códigos: P-86 a P-88 e J-60 a J-64.
 *
 * Medida do VÃO (sem `nominalRef`), como as janelas e os portões: a forma é dimensionada pela largura e pela altura do tipo
 * (`openingShapeOf` lê `width` e `height` do tipo, não a folha). Por isso as portas daqui não usam a referência na folha.
 */

const NOTA = 'Dimensão ilustrativa';

/** Raiz de 3 sobre 2: flecha do ogival equilátero (Lapin, Gothic), `w · √3 / 2`, arredondada a 1 cm. */
const equilatero = (w: number): number => Math.round(w * 0.866 * 100) / 100;

function porta(id: string, code: string, name: string, width: number, height: number, shape: OpeningShape, fonte: string): OpeningType {
  return ot({ id, kind: 'door', name, code, width, height, sill: 0, leaves: 1, plan: 'swing', description: `${NOTA}. ${fonte}`, shape });
}

function janela(id: string, code: string, name: string, width: number, height: number, sill: number, leaves: OpeningLeaves, plan: PlanSymbol, shape: OpeningShape, fonte: string): OpeningType {
  return ot({ id, kind: 'window', name, code, width, height, sill, leaves, plan, description: `${NOTA}. ${fonte}`, shape }, 'mat_aluminio');
}

const CATALOGO_FORMAS_PT: OpeningType[] = [
  porta('ot_parcop_90x210', 'P-86', 'Porta em arco pleno 90 x 210', 0.9, 2.1, { kind: 'round', width: 0.9, height: 2.1 }, 'Forma: arco pleno (Lapin, Romanesque).'),
  porta('ot_parcoab_90x210', 'P-87', 'Porta em arco abatido 90 x 210', 0.9, 2.1, { kind: 'segmental', width: 0.9, height: 2.1, rise: 0.15 }, 'Forma: arco abatido, flecha w/6 (Lapin, Victorian).'),
  porta('ot_pogival_90x210', 'P-88', 'Porta em arco ogival 90 x 210', 0.9, 2.1, { kind: 'pointed', width: 0.9, height: 2.1, rise: equilatero(0.9) }, 'Forma: ogival equilátero, flecha w·√3/2 (Lapin, Gothic).'),
  janela('ot_jarcop_120x150', 'J-60', 'Janela em arco pleno 120 x 150', 1.2, 1.5, 0.9, 1, 'fixed', { kind: 'round', width: 1.2, height: 1.5 }, 'Forma: arco pleno (Lapin, Romanesque).'),
  janela('ot_jarcoab_120x150', 'J-61', 'Janela em arco abatido 120 x 150 (2 folhas)', 1.2, 1.5, 0.9, 2, 'hinged', { kind: 'segmental', width: 1.2, height: 1.5, rise: 0.3 }, 'Forma: arco abatido, flecha w/4 (Lapin, Arched casement).'),
  janela('ot_jogival_80x150', 'J-62', 'Janela em arco ogival 80 x 150', 0.8, 1.5, 0.9, 1, 'fixed', { kind: 'pointed', width: 0.8, height: 1.5, rise: equilatero(0.8) }, 'Forma: ogival equilátero, flecha w·√3/2 (Lapin, Gothic).'),
  janela('ot_joculo_80x80', 'J-63', 'Janela circular (óculo) 80 x 80', 0.8, 0.8, 1.1, 1, 'fixed', { kind: 'circle', width: 0.8, height: 0.8 }, 'Forma: círculo, altura igual à largura (Lapin, Round window).'),
  janela('ot_jempena_100x100', 'J-64', 'Janela em empena 100 x 100', 1.0, 1.0, 1.0, 1, 'fixed', { kind: 'gable', width: 1.0, height: 1.0, rise: 0.25 }, 'Forma: empena, flecha w/4 (Lapin, gable).'),
];

/** Catálogo de tipos com forma de vão no idioma pedido (nomes são gerados na criação). */
export function catalogoFormas(lang: Lang = 'pt'): OpeningType[] {
  return CATALOGO_FORMAS_PT.map((x) => ({ ...x, name: openingName(x.name, lang), ...(x.shape ? { shape: { ...x.shape } } : {}) }));
}
