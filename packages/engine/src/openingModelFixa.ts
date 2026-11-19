import { shapeIncompatible, type OpeningType, type Project } from '@hestia/model';
import type { OpeningGeometry } from './types.ts';
import type { LeafOpening, OpeningModel, OpeningPart } from './openingModelTypes.ts';
import { formaDaEsquadria } from './openingShapeEsquadria.ts';

/*
 * Esquadria cuja OPERAÇÃO não é construtiva na forma do vão (matriz `shapeCompat`, docs/estudo-esquadrias/39): o motor monta a
 * esquadria FIXA dentro do contorno (aro e vidro) em vez de uma folha que corre ou gira pelo arco. Nada é apagado nem reescrito:
 * o tipo gravado continua com a operação, o vão (furo, alizar, verga, peitoril, bandeira, grade, material) é o mesmo e só a
 * folha que se move deixa de existir:
 * - janela: construída como janela FIXA (caixilho e vidro com a grade do tipo; bandeira e laterais seguem as regras da fixa);
 * - porta: construída como folha de giro e CONGELADA (folha, vidro e detalhes do estilo ficam; dobradiças, maçaneta, trilhos
 *   e movimento saem, porque um painel fixo não os tem). Batente "bloco" (sem perfil) vira "simples": a de correr sempre tem batente
 *   e o painel fixo precisa do aro.
 * Vão retangular, forma inválida na esquadria ou operação compatível: nada disso entra (o modelo é o de sempre).
 */

/** A operação do tipo é incompatível com a forma gravada (na medida da esquadria)? */
export function esquadriaIncompativel(t: OpeningType | undefined, g: OpeningGeometry): boolean {
  if (!t || g.leaves === 0 || !g.forma || g.forma.kind === 'rect') return false;
  return formaDaEsquadria(g.forma, g.width, g.height) !== null && shapeIncompatible(t, g.forma);
}

/** Projeto com o tipo trocado pela versão fixa (uma folha, símbolo fixo na janela, de giro na porta que será congelada). */
export function projetoComTipoFixo(p: Project, typeId: string): Project {
  const t = p.openingTypes[typeId];
  if (!t) return p;
  const fixo: OpeningType = t.kind === 'window' ? { ...t, plan: 'fixed', leaves: 1 } : { ...t, plan: 'swing', leaves: 1, handle: 'none', frameStyle: t.frameStyle === 'block' ? 'simple' : t.frameStyle };
  return { ...p, openingTypes: { ...p.openingTypes, [typeId]: fixo } };
}

/** Modelo sem nenhum movimento: tira o `motion` das peças, as ferragens de movimento e os trilhos, e marca as folhas como fixas. */
export function congelar(m: OpeningModel): OpeningModel {
  const parts = m.parts
    .filter((p) => p.role !== 'hinge' && p.role !== 'handle' && p.role !== 'track')
    .map((p): OpeningPart => {
      const resto = { ...p };
      delete resto.motion;
      return resto;
    });
  const openings = m.openings.map((o): LeafOpening => {
    const f: LeafOpening = { ...o, kind: 'fixed', side: 0, hingeT: 0, latchT: 0, radius: 0 };
    delete f.both;
    delete f.slideAxis;
    delete f.axisZ;
    return f;
  });
  return { ...m, parts, openings };
}
