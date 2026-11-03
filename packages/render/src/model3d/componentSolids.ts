import type { Id, Material, Project } from '@hestia/model';
import type { SolidBatch } from './solids.ts';

/*
 * Componentes (móveis) na vista 3D do projeto (ADR 0049). FICHA E8-render: implementar as funções abaixo e integrá-las à cena e à planta.
 * Testes em `componentSolids.test.ts`. Modelo a seguir: `genericSolids.ts` (mesmo formato de `SolidBatch`, mesmo picking por elemento).
 */

/** Ids dos materiais de tela dos componentes e suas cores/opacidade (o 3D do editor de famílias usa as mesmas cores). */
export const MATERIAIS_DE_COMPONENTE: Readonly<Record<Id, Material>> = {
  comp_corpo: { id: 'comp_corpo', name: 'Componente · corpo', color: '#d8b98b', hatch: 'solid', gloss: 0.15, opacity: 1, cost: 0, unit: 'm2' },
  comp_porta: { id: 'comp_porta', name: 'Componente · porta', color: '#e9d6b4', hatch: 'solid', gloss: 0.2, opacity: 1, cost: 0, unit: 'm2' },
  comp_tampo: { id: 'comp_tampo', name: 'Componente · tampo', color: '#8c6a4a', hatch: 'solid', gloss: 0.25, opacity: 1, cost: 0, unit: 'm2' },
  comp_fundo: { id: 'comp_fundo', name: 'Componente · fundo', color: '#b9b2a6', hatch: 'solid', gloss: 0.1, opacity: 1, cost: 0, unit: 'm2' },
  comp_rodape: { id: 'comp_rodape', name: 'Componente · rodapé', color: '#c9a97a', hatch: 'solid', gloss: 0.1, opacity: 1, cost: 0, unit: 'm2' },
};

/**
 * Sólidos dos componentes do nível `levelId`, em lotes por material (`SolidBatch`, `category: 'generic'`: a categoria gráfica "genérica" do app já
 * controla a visibilidade deles). Para cada elemento `component` do nível: `malhaDoComponente(p, c)` de `@hestia/engine` (só `solidas`; peças vazias não
 * aparecem no projeto) e, para cada peça, o `materialId` pelo papel: `porta` e `frente_gaveta` → `comp_porta`; `tampo` → `comp_tampo`; `fundo` → `comp_fundo`;
 * `rodape` → `comp_rodape`; qualquer outro → `comp_corpo`. Os triângulos de cada elemento ficam numa faixa de `indices` registrada com o id do elemento
 * (como `ofElement` faz em `genericSolids.ts`), para o picking e o realce funcionarem. Lotes ordenados por `materialId`; sem componente, `[]`.
 * Componentes de família ausente ou sem peça não geram nada. Elementos ocultos NÃO são tratados aqui (a cena já filtra).
 */
export function buildComponentSolids(p: Project, levelId: Id): SolidBatch[] {
  void p;
  void levelId;
  throw new Error('não implementado: ficha E8-render');
}
