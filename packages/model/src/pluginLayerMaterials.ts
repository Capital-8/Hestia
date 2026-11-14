import type { ExprValue } from './pluginExpr.ts';
import type { Layer, Project } from './types.ts';

/**
 * Materiais das camadas de um tipo (piso ou parede básica) para os campos dos suplementos: `material` é o do miolo
 * (primeira camada estrutural; sem ela, a primeira camada) e `materials` lista o nome de todas as camadas, da face
 * externa para a interna. Tipo ausente ou sem camadas (cortina) dá `null` e lista vazia.
 */
export function layerMaterials(p: Project, type: { layers: readonly Layer[] } | undefined): { material: ExprValue; materials: ExprValue } {
  const layers = type?.layers ?? [];
  const nome = (id: string): string => p.materials[id]?.name ?? id;
  const core = layers.find((l) => l.function === 'structure') ?? layers[0];
  return { material: core ? nome(core.materialId) : null, materials: layers.map((l) => nome(l.materialId)) };
}
