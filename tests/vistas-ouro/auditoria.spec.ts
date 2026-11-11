import { describe, expect, it } from 'vitest';
import { auditar, tabela } from './auditoria.ts';

/**
 * Auditoria do ouro da etapa 2a-1 (ver `auditoria.ts`). Só roda com `npm run test:vistas-ouro -- --auditar`
 * (`VISTAS_OURO_AUDITAR=1`): imprime a tabela e exige NÃO PREVISTA igual a zero antes de qualquer regravação.
 */
describe.skipIf(process.env.VISTAS_OURO_AUDITAR !== '1')('auditoria do ouro', () => {
  it('toda diferença é D1, D2 ou D3', () => {
    const achados = auditar();
    process.stdout.write(`\n${tabela(achados)}\n`);
    expect(achados.filter((a) => a.classe === 'NAO_PREVISTA')).toEqual([]);
  });
});
