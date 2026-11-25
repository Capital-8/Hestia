import { describe, expect, it } from 'vitest';
import { PT_ELREDE } from '../editor/i18n/areas/eletricaRede.ts';
import { textoDoDiagnostico } from './RedeDiagnostico.tsx';

describe('textos do diagnóstico elétrico (C5)', () => {
  const base = { elementId: 'x', circuitoId: 'cir_1' } as const;
  const t = (k: string, p?: Record<string, string | number>): string => (PT_ELREDE as Record<string, string>)[k]!.replace(/\{(\w+)\}/g, (_, n: string) => String(p?.[n] ?? ''));
  const nomes = { cir_1: 'C1' };
  it('os códigos elétricos de traçado têm texto, com o nome do circuito em português', () => {
    expect(textoDoDiagnostico({ ...base, codigo: 'ponto_potencia_zero' }, t as never, 'pt', nomes)).toContain('C1');
    for (const codigo of ['circuito_sem_quadro', 'ponto_sem_eletroduto', 'dispositivo_sem_eletroduto', 'quadro_sem_posicao', 'ponto_potencia_zero'] as const) {
      expect(textoDoDiagnostico({ ...base, codigo, valor: 2, limite: 1 }, t as never, 'pt', nomes).length).toBeGreaterThan(10);
    }
  });
});
