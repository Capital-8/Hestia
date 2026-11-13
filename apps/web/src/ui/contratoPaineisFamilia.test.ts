/**
 * TESTE-GUARDA do contrato de painéis (docs/contratos/familias-e-ferramentas.md, regra 2): todo painel de propriedades
 * de elemento com família/tipo abre com o MESMO cabeçalho de tipo da parede: `TypeSelector` (seletor de tipo com o
 * botão "Editar tipo" logo abaixo, `onEdit`). Painel novo (`*Properties.tsx`) TEM de ser classificado aqui.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const aqui = dirname(fileURLToPath(import.meta.url));
const fonte = (arq: string): string => readFileSync(join(aqui, arq), 'utf8');
const temCabecalho = (arq: string): boolean => /<TypeSelector\b/.test(fonte(arq)) && /\bonEdit=/.test(fonte(arq)) && /from '\.\/TypeSelector\.tsx'/.test(fonte(arq));

/** Painéis de elemento com família: cabeçalho de tipo obrigatório (Properties.tsx cobre parede e esquadria). */
const COM_FAMILIA = ['Properties.tsx', 'FloorProperties.tsx', 'SlabProperties.tsx', 'CeilingProperties.tsx', 'RoofProperties.tsx', 'StairProperties.tsx', 'RampProperties.tsx', 'GuardaCorpoProperties.tsx', 'ColumnProperties.tsx', 'BeamProperties.tsx', 'FootingProperties.tsx'];

/** Painéis sem família/tipo (não têm seletor de tipo). */
const SEM_FAMILIA = ['AreaPlanProperties.tsx', 'GridProperties.tsx', 'PlacementProperties.tsx', 'RoomProperties.tsx'];

/**
 * Exceções EXPLÍCITAS, com TODO: painel de família fora do padrão. Quando passar a usar o cabeçalho padrão, o teste
 * "exceção obsoleta" pede para tirá-lo desta lista.
 */
const EXCECOES_TODO: string[] = [];

describe('contrato: painéis de propriedades de família usam o cabeçalho de tipo da parede', () => {
  for (const arq of COM_FAMILIA) {
    it(`${arq} usa TypeSelector com Editar`, () => {
      expect(temCabecalho(arq), `${arq} deve renderizar <TypeSelector ... onEdit={...}/> logo no topo`).toBe(true);
    });
  }

  it('todo *Properties.tsx está classificado (com família, sem família ou exceção)', () => {
    const todos = readdirSync(aqui).filter((f) => /Properties\.tsx$/.test(f));
    const conhecidos = new Set([...COM_FAMILIA, ...SEM_FAMILIA, ...EXCECOES_TODO]);
    const novos = todos.filter((f) => !conhecidos.has(f));
    expect(novos, `Painel novo sem classificação: ${novos.join(', ')}. Painel de família usa TypeSelector e entra em COM_FAMILIA.`).toEqual([]);
  });

  it('exceção obsoleta: painel que já usa o cabeçalho padrão sai da lista de exceções', () => {
    expect(EXCECOES_TODO.filter(temCabecalho), 'Mova para COM_FAMILIA.').toEqual([]);
  });
});
