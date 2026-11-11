/**
 * TESTE-GUARDA do contrato de modais de tipo (docs/contratos/familias-e-ferramentas.md, regra 4): todo diálogo de edição
 * de tipo de família usa o esqueleto comum da parede (`FamilyTypeDialog`, `FamilySection`, `FamilyRow`... em
 * `ui/dialogs/familia/`). Nada de CSS ou estrutura própria de seção/linha. Diálogo novo TEM de ser classificado aqui.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const aqui = dirname(fileURLToPath(import.meta.url));
const fonte = (arq: string): string => readFileSync(join(aqui, arq), 'utf8');

/** Todos os .tsx de ui/dialogs (caminhos relativos, com "/"). */
function listar(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listar(p));
    else if (e.name.endsWith('.tsx')) out.push(relative(aqui, p).replace(/\\/g, '/'));
  }
  return out;
}

/** Diálogos de tipo que já usam o esqueleto comum (parede, escada, rampa, piso, laje, forro, telhado, guarda-corpo). */
const MIGRADOS = [
  'WallTypeDialog.tsx',
  'StairTypeDialog.tsx',
  'RampTypeDialog.tsx',
  'FloorTypeDialog.tsx',
  'SlabTypeDialog.tsx',
  'CeilingTypeDialog.tsx',
  'RoofTypeDialog.tsx',
  'guardaCorpoType/index.tsx',
];

/** Peças internas dos diálogos migrados: também não podem ter seção/linha própria. */
const PECAS = ['StairTypeSections.tsx', 'StairCalculatorPanel.tsx', 'StairBlondelCard.tsx', 'TypeParams.tsx'];

/**
 * Exceções EXPLÍCITAS (TODO): diálogos de tipo ainda fora do esqueleto. Quando migrarem, o teste "exceção obsoleta" pede
 * para tirá-los daqui.
 * - GridTypeDialog: sem cabeçalho Família/Tipo e com "Duplicar" no rodapé; migrar muda o fluxo, fica para a próxima.
 * - openingType/OpeningTypeDialog: diálogo XL com biblioteca, prévia 3D e painéis próprios (cotas e esquadrias).
 * - DimensionFamiliesDialog: famílias de cota, editor de lista com estilos próprios.
 */
const EXCECOES_TODO = ['GridTypeDialog.tsx', 'openingType/OpeningTypeDialog.tsx', 'DimensionFamiliesDialog.tsx'];

const usaEsqueleto = (arq: string): boolean => /<FamilyTypeDialog\b/.test(fonte(arq)) && /from '(\.\.?)\/familia\/index\.ts'/.test(fonte(arq));

/** Marcas de estrutura própria de seção/linha, proibidas nos migrados. */
const PROIBIDO: Array<[RegExp, string]> = [
  [/className="field-row"/, 'linha própria (use FamilyRow)'],
  [/<fieldset\b/, 'fieldset próprio (use FamilySection)'],
  [/<details\b/, 'details próprio (use FamilySection)'],
  [/className="(?:dsec|gc-item|gc-tabs)"/, 'classe de seção antiga (use FamilySection e FamilyTabs)'],
  [/<Row\b/, 'Row da paleta de propriedades (use FamilyRow)'],
];

describe('contrato: modais de tipo de família usam o esqueleto comum (o da parede)', () => {
  for (const arq of MIGRADOS) {
    it(`${arq} usa FamilyTypeDialog`, () => {
      expect(usaEsqueleto(arq), `${arq} deve renderizar <FamilyTypeDialog> importado de familia/index.ts`).toBe(true);
    });
  }

  for (const arq of [...MIGRADOS, ...PECAS]) {
    it(`${arq} não tem seção nem linha próprias`, () => {
      const src = fonte(arq);
      const achados = PROIBIDO.filter(([re]) => re.test(src)).map(([, motivo]) => motivo);
      expect(achados, `${arq}: ${achados.join('; ')}`).toEqual([]);
    });
  }

  it('todo diálogo de tipo está classificado (migrado ou exceção TODO)', () => {
    const candidatos = listar(aqui).filter((f) => {
      if (/(^|\/)familia\//.test(f) || /\.test\./.test(f)) return false;
      if (/TypeDialog\.tsx$/.test(f) || /FamiliesDialog\.tsx$/.test(f) || f === 'guardaCorpoType/index.tsx') return true;
      return /TypeDialogHeader/.test(fonte(f)) && f !== 'TypeDialogHeader.tsx';
    });
    const conhecidos = new Set([...MIGRADOS, ...EXCECOES_TODO]);
    const novos = candidatos.filter((f) => !conhecidos.has(f));
    expect(novos, `Diálogo de tipo novo sem classificação: ${novos.join(', ')}. Use FamilyTypeDialog e entre em MIGRADOS.`).toEqual([]);
  });

  it('o esqueleto comum existe e a classificação não aponta arquivo inexistente', () => {
    const todos = new Set(listar(aqui));
    const faltam = [...MIGRADOS, ...EXCECOES_TODO, ...PECAS].filter((f) => !todos.has(f));
    expect(faltam).toEqual([]);
    for (const f of ['familia/FamilyTypeDialog.tsx', 'familia/FamilySection.tsx', 'familia/FamilyRow.tsx', 'familia/FamilyTabs.tsx']) {
      expect(todos.has(f), `${f} faltando`).toBe(true);
    }
  });

  it('exceção obsoleta: diálogo que já usa o esqueleto sai da lista de exceções', () => {
    expect(EXCECOES_TODO.filter(usaEsqueleto), 'Mova para MIGRADOS.').toEqual([]);
  });
});
