import { malhaDoComponente, resolverComponente, type Malha } from '@hestia/engine';
import {
  ACABAMENTOS_MOVEIS,
  isComponent,
  materialDoAcabamento,
  resolverMaterialVisualPeca,
  type Id,
  type Material,
  type Project,
} from '@hestia/model';
import { batchOf, ofElement, type SolidBatch } from './solids.ts';

/*
 * Componentes (móveis) na vista 3D do projeto (ADR 0049). FICHA E8-render: implementar as funções abaixo e integrá-las à cena e à planta.
 * Testes em `componentSolids.test.ts`. Modelo a seguir: `genericSolids.ts` (mesmo formato de `SolidBatch`, mesmo picking por elemento).
 */

/** Ids dos materiais de tela dos componentes (5 bases por papel + catálogo de acabamentos de marcenaria/pedra/metal/vidro). */
export const MATERIAIS_DE_COMPONENTE: Readonly<Record<Id, Material>> = {
  ...Object.fromEntries(ACABAMENTOS_MOVEIS.map((a) => [a.id, materialDoAcabamento(a)])),
  comp_corpo: { id: 'comp_corpo', name: 'Componente · corpo', color: '#c9a176', hatch: 'solid', gloss: 0.25, opacity: 1, cost: 0, unit: 'm2' },
  comp_porta: { id: 'comp_porta', name: 'Componente · porta', color: '#ede7dc', hatch: 'solid', gloss: 0.4, opacity: 1, cost: 0, unit: 'm2' },
  comp_tampo: { id: 'comp_tampo', name: 'Componente · tampo', color: '#e9e5dc', hatch: 'solid', gloss: 0.6, opacity: 1, cost: 0, unit: 'm2' },
  comp_fundo: { id: 'comp_fundo', name: 'Componente · fundo', color: '#c2b59f', hatch: 'solid', gloss: 0.15, opacity: 1, cost: 0, unit: 'm2' },
  comp_rodape: { id: 'comp_rodape', name: 'Componente · rodapé', color: '#3c4046', hatch: 'solid', gloss: 0.3, opacity: 1, cost: 0, unit: 'm2' },
};

/**
 * Sólidos dos componentes do nível `levelId`, em lotes por material (`SolidBatch`, `category: 'generic'`: a categoria gráfica "genérica" do app já
 * controla a visibilidade deles). Para cada elemento `component` do nível: `malhaDoComponente(p, c)` de `@hestia/engine` (só `solidas`; peças vazias não
 * aparecem no projeto) e, para cada peça, `resolverMaterialVisualPeca(c, peca.papel, peca.material ?? undefined)` resolve o acabamento visual
 * (overrides da instância `acabCorpo`/`acabPorta`/`acabTampo`, material especial ou padrão por papel). Os triângulos de cada elemento ficam numa faixa de
 * `indices` registrada com o id do elemento (como `ofElement` faz em `genericSolids.ts`), para o picking e o realce funcionarem. Lotes ordenados por `materialId`;
 * sem componente, `[]`. Componentes de família ausente ou sem peça não geram nada. Elementos ocultos NÃO são tratados aqui (a cena já filtra).
 */
export function buildComponentSolids(p: Project, levelId: Id): SolidBatch[] {
  const batches = new Map<Id, SolidBatch>();
  for (const c of Object.values(p.elements)) {
    if (!isComponent(c) || c.levelId !== levelId) continue;
    const res = resolverComponente(p, c);
    const malha = malhaDoComponente(p, c, res).solidas;
    const porMaterial = new Map<Id, number[]>();
    for (let t = 0; t < malha.pecaDoTriangulo.length; t++) {
      const peca = res.pecas[malha.pecaDoTriangulo[t]!];
      if (!peca || peca.vazio) continue;
      const materialId = resolverMaterialVisualPeca(c, peca.papel, peca.material ?? undefined);
      let triangulos = porMaterial.get(materialId);
      if (!triangulos) {
        triangulos = [];
        porMaterial.set(materialId, triangulos);
      }
      triangulos.push(t);
    }
    for (const [materialId, triangulos] of porMaterial) {
      const batch = batchOf(batches, materialId, 'generic');
      ofElement(batch, c.id, () => {
        for (const t of triangulos) pushTriangulo(batch, malha, t);
      });
    }
  }
  return [...batches.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, b]) => b)
    .filter((b) => b.indices.length > 0);
}

/** Copia um triângulo da malha para o lote, com os vértices e as normais próprios (sombreamento chapado). */
function pushTriangulo(batch: SolidBatch, malha: Malha, triangulo: number): void {
  const base = batch.positions.length / 3;
  for (let k = 0; k < 3; k++) {
    const i = malha.indices[triangulo * 3 + k]!;
    batch.positions.push(malha.positions[i * 3]!, malha.positions[i * 3 + 1]!, malha.positions[i * 3 + 2]!);
    batch.normals.push(malha.normals[i * 3]!, malha.normals[i * 3 + 1]!, malha.normals[i * 3 + 2]!);
  }
  batch.indices.push(base, base + 1, base + 2);
}
