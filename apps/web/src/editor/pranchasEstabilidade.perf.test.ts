import { pranchasEstabilidadeSuite } from './pranchasEstabilidadeSuite.ts';

// Tamanho grande (roda em `npm run test:perf`): 12 níveis de 8x8 ambientes — milhares de elementos — com terreno e telhado.
pranchasEstabilidadeSuite('grande', { levels: 12, rooms: 8, terrain: true, terrainGrid: 24 }, { buildMsPerElement: 60, drawAllMsPerElement: 400, heapGrowthMb: 800 });
