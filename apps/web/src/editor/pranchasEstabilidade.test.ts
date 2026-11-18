import { pranchasEstabilidadeSuite } from './pranchasEstabilidadeSuite.ts';

// Tamanho médio (roda no `npm test`): 4 níveis de 3x3 ambientes com telhado, escadas, esquadrias e terreno.
pranchasEstabilidadeSuite('médio', { levels: 4, rooms: 3, terrain: true, terrainGrid: 10 }, { buildMsPerElement: 60, drawAllMsPerElement: 400, heapGrowthMb: 400 });
