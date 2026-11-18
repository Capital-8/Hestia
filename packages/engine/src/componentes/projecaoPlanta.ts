import type { PecaResolvida } from './pecas.ts';

/** Nível de detalhe da planta (o mesmo vocabulário de `DetailLevel` do modelo). */
export type DetalhePlanta = 'coarse' | 'medium' | 'fine';

const RANGO: Record<'grosso' | 'medio' | 'fino', number> = { grosso: 0, medio: 1, fino: 2 };
const RANGO_PLANTA: Record<DetalhePlanta, number> = { coarse: 0, medium: 1, fine: 2 };

/**
 * A peça entra na projeção da planta neste nível de detalhe? Grosseiro: nenhuma (só a pegada). Com `detalhe3d`, vale o menor
 * nível listado; sem ele, o papel decide: médio esconde travessa e rodapé (como o 3D), fino mostra tudo. Peça vazia nunca é sólida.
 */
export function pecaNaPlanta(q: PecaResolvida, detalhe: DetalhePlanta): boolean {
  if (q.vazio || detalhe === 'coarse') return false;
  if (q.extensao[0] <= 1e-4 || q.extensao[1] <= 1e-4) return false;
  if (q.detalhe3d !== undefined && q.detalhe3d.length > 0) return Math.min(...q.detalhe3d.map((n) => RANGO[n])) <= RANGO_PLANTA[detalhe];
  if (detalhe === 'medium') return q.papel !== 'travessa' && q.papel !== 'rodape';
  return true;
}
