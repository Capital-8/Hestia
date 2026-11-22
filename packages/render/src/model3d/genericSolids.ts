import { isGeneric, type Generic, type Id, type Project } from '@hestia/model';
import type { ElementRange, LoteSolido } from './solids.ts';

/**
 * Malha dos objetos importados (viga, pilar, mobiliário, MEP...) de um nível. Cada elemento entra com a própria malha
 * indexada e soldada (sem desdobrar o triângulo em 3 vértices): o sombreamento chapado vem das derivadas no shader
 * (`flatShading` da categoria `generic`, ver `materiais3d.ts`), então o lote não tem normais. Os vetores são tipados e
 * do tamanho exato (contagem numa primeira passada), sem arrays JS intermediários: num IFC de milhões de triângulos isso
 * é a diferença entre centenas de MB de heap e nenhum. A faixa de índices do elemento (`ids`) segue como nas paredes,
 * para o picking do 3D. A cor do IFC vira um lote por material (`im_<hex>`, criado na importação).
 *
 * `visivel` (opcional): filtro por ELEMENTO, para a vista decidir com a regra do modelo (`categoriaDoElemento`, que no
 * importado vem da classe de origem — adendo 3 do ADR 0060). O lote continua na categoria `generic`: é ela que dá o
 * sombreamento chapado da malha soldada e a chave do lote na GPU; o que muda é só quem entra no lote.
 */
export function buildGenericSolids(p: Project, levelId: Id, visivel?: (e: Generic) => boolean): LoteSolido[] {
  // Passada 1: elementos por material e contagem exata de vértices/índices.
  const grupos = new Map<string, { elementos: Generic[]; nV: number; nI: number }>();
  for (const e of Object.values(p.elements)) {
    if (!isGeneric(e) || e.levelId !== levelId) continue;
    if (visivel && !visivel(e)) continue;
    const nI = e.mesh.indices.length - (e.mesh.indices.length % 3);
    if (nI === 0) continue;
    const materialId = materialOf(e);
    let g = grupos.get(materialId);
    if (!g) {
      g = { elementos: [], nV: 0, nI: 0 };
      grupos.set(materialId, g);
    }
    g.elementos.push(e);
    g.nV += Math.floor(e.mesh.positions.length / 3);
    g.nI += nI;
  }
  // Passada 2: preenche os vetores finais.
  const lotes: LoteSolido[] = [];
  for (const [materialId, g] of [...grupos.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const positions = new Float32Array(g.nV * 3);
    const indices = new Uint32Array(g.nI);
    const ids: ElementRange[] = [];
    let v = 0;
    let k = 0;
    for (const e of g.elementos) {
      const pos = e.mesh.positions;
      const idx = e.mesh.indices;
      const nV = Math.floor(pos.length / 3);
      const nI = idx.length - (idx.length % 3);
      for (let i = 0; i < nV * 3; i++) positions[v * 3 + i] = pos[i] ?? 0;
      for (let i = 0; i < nI; i++) indices[k + i] = (idx[i] ?? 0) + v;
      ids.push({ id: e.id, start: k, count: nI });
      v += nV;
      k += nI;
    }
    lotes.push({ materialId, category: 'generic', positions, indices, ids });
  }
  return lotes;
}

/** Material do genérico: o da cor do IFC quando existir; senão o concreto padrão. */
function materialOf(e: Generic): string {
  if (!e.color) return 'mat_concreto';
  const hex = e.color.replace('#', '').toLowerCase();
  return e.opacity != null && e.opacity < 0.999 ? `im_${hex}_${String(Math.round(e.opacity * 100)).padStart(3, '0')}` : `im_${hex}`;
}
