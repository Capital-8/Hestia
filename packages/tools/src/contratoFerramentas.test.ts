/**
 * TESTE-GUARDA do contrato de ferramentas (docs/contratos/familias-e-ferramentas.md, regra 1): toda ferramenta que
 * cria elemento linear ou polilinha traça pelo núcleo comum `desenhoPolilinha.ts` (snaps, Orto, Polar, rastreios,
 * comprimento digitado). Uma ferramenta nova no registro TEM de ser classificada aqui; senão o teste falha.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const aqui = dirname(fileURLToPath(import.meta.url));
const fonte = (arq: string): string => readFileSync(join(aqui, arq), 'utf8');
const usaNucleo = (arq: string): boolean => /from '\.\/desenhoPolilinha\.ts'/.test(fonte(arq));

/** Criam elemento linear/polilinha e usam o núcleo comum (obrigatório). */
const LINEARES: Record<string, string> = {
  wall: 'wallTool.ts',
  railing: 'guardaCorpoTool.ts',
  detailLine: 'detailLineTool.ts',
  roomsep: 'roomSeparatorTool.ts',
  filledRegion: 'detailRegionTool.ts',
  dimension: 'dimensionTool.ts',
  grid: 'gridTool.ts',
  // Piso, laje, forro e telhado traçam o contorno pela sessão de perímetro (a faixa desvia a escolha para ela).
  perimeter: 'perimeterTool.ts',
  floor: 'perimeterTool.ts',
  slab: 'perimeterTool.ts',
  ceiling: 'perimeterTool.ts',
  roof: 'perimeterTool.ts',
  roofextrusion: 'roofExtrusionTool.ts',
  roofarrow: 'roofArrowTool.ts',
  slope: 'slabSlopeTool.ts',
  section: 'sectionTool.ts',
  stair: 'stairTool.ts',
  stairrun: 'stairRunTool.ts',
  ramp: 'rampTool.ts',
  angularDimension: 'angularDimensionTool.ts',
};

/**
 * Exceções EXPLÍCITAS: ferramentas lineares com núcleo próprio. TODO: migrar cada uma para o núcleo comum e remover
 * da lista (o teste abaixo avisa quando uma exceção passa a usar o núcleo).
 */
const EXCECOES_TODO: Record<string, string> = {
};

/** Ferramentas que não traçam elemento linear (seleção, edição, inserção por clique único, anotação pontual). */
const SEM_TRACADO = new Set([
  'select', 'door', 'window', 'move', 'copy', 'rotate', 'mirror', 'array',
  'offset', 'parallel', 'trim', 'align', 'joins', 'split', 'measure', 'level', 'rehost', 'attachroof', 'detachroof', 'text', 'room', 'tag', 'paste',
]);

function idsDoRegistro(): string[] {
  const m = fonte('registry.ts').match(/export type ToolId =([^;]+);/);
  return [...m![1]!.matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]!);
}

describe('contrato: ferramentas de criação linear usam o núcleo comum de desenho', () => {
  for (const [id, arq] of Object.entries(LINEARES)) {
    it(`${id} (${arq}) importa desenhoPolilinha`, () => {
      expect(usaNucleo(arq), `${arq} deve traçar pelo núcleo comum (desenhoPolilinha.ts)`).toBe(true);
    });
  }

  it('todo ToolId do registro está classificado (linear, exceção ou sem traçado)', () => {
    const conhecidos = new Set([...Object.keys(LINEARES), ...Object.keys(EXCECOES_TODO), ...SEM_TRACADO]);
    const novos = idsDoRegistro().filter((id) => !conhecidos.has(id));
    expect(novos, `Ferramenta nova sem classificação: ${novos.join(', ')}. Se cria elemento linear, use desenhoPolilinha.ts e entre em LINEARES.`).toEqual([]);
  });

  it('exceções que já usam o núcleo devem sair da lista de exceções', () => {
    const migradas = Object.entries(EXCECOES_TODO).filter(([, arq]) => usaNucleo(arq)).map(([id]) => id);
    expect(migradas, 'Mova para LINEARES.').toEqual([]);
  });

  it('o núcleo comum é o que a parede e o guarda-corpo exportam em comum (sem cópia local do cálculo de comprimento)', () => {
    for (const arq of ['guardaCorpoTool.ts', 'wallTool.ts']) expect(fonte(arq)).not.toMatch(/norm\(sub\(this\.inf\?\.point/);
  });
});
