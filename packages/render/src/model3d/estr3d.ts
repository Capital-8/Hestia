import type { CategoriaEstr, MalhaEstrElemento } from '@hestia/engine';
import type { GraphicsCategory, Id } from '@hestia/model';
import { acrescentarTriangulosFaceados } from './malhaFacetada3d.ts';
import { ofElement, type SolidBatch } from './solids.ts';

/** Categoria gráfica de cada categoria do kernel (A.6 e `graphics.ts`): pilar `columns`, viga `beams`, fundação `footings`. */
export const CATEGORIA_GRAFICA_ESTR: Record<CategoriaEstr, GraphicsCategory> = { pilar: 'columns', viga: 'beams', fundacao: 'footings' };

/**
 * Sólidos 3D de pilares, vigas e fundações (ficha R1a): a malha vem pronta do kernel (`estr_malha`, sólidos fechados e orientados para fora) e aqui só vira
 * `SolidBatch`, um lote por (categoria, material) com a faixa de índices de cada elemento (picking, realce, ocultar e isolar). A cor sai do material do tipo
 * pelo mesmo caminho das paredes (`Materiais3D.face`). Nenhuma geometria é calculada aqui (A.0 item 2).
 * `visivel` decide por id (Hide in View e Reveal); `categoriaVisivel`, por categoria gráfica (`view.overrides`).
 */
export function buildEstrSolids(
  malhas: readonly MalhaEstrElemento[],
  visivel: (id: Id) => boolean = () => true,
  categoriaVisivel: (c: GraphicsCategory) => boolean = () => true,
): SolidBatch[] {
  const lotes = new Map<string, SolidBatch>();
  for (const m of malhas) {
    const category = CATEGORIA_GRAFICA_ESTR[m.categoria];
    if (!categoriaVisivel(category) || !visivel(m.elementId)) continue;
    for (const parte of m.partes) {
      const chave = `${category}|${parte.materialId}`;
      let b = lotes.get(chave);
      if (!b) lotes.set(chave, (b = { materialId: parte.materialId, category, positions: [], normals: [], indices: [], ids: [] }));
      const lote = b;
      ofElement(lote, m.elementId, () => acrescentarTriangulosFaceados(lote, parte.positions, parte.indices));
    }
  }
  return [...lotes.values()];
}
