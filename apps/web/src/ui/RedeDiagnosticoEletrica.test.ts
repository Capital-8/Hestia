import { describe, expect, it } from 'vitest';
import { PT_ELREDE } from '../editor/i18n/areas/eletricaRede.ts';
import { textoDoDiagnostico } from './RedeDiagnostico.tsx';

describe('textos do diagnóstico elétrico (C5)', () => {
  const base = { elementId: 'x', circuitoId: 'cir_1' } as const;
  const t = (k: string, p?: Record<string, string | number>): string => (PT_ELREDE as Record<string, string>)[k]!.replace(/\{(\w+)\}/g, (_, n: string) => String(p?.[n] ?? ''));
  const nomes = { cir_1: 'C1' };
  it('sobrecarga e queda dizem "segundo tabelas provisórias (CONFERIR)" e trazem o nome do circuito', () => {
    const a = textoDoDiagnostico({ ...base, codigo: 'circuito_sobrecarregado', valor: 40, limite: 20 }, t as never, 'pt', nomes);
    const b = textoDoDiagnostico({ ...base, codigo: 'queda_tensao_excedida', valor: 7.7, limite: 4 }, t as never, 'pt', nomes);
    for (const m of [a, b]) {
      expect(m).toContain('segundo tabelas provisórias (CONFERIR)');
      expect(m).toContain('C1');
    }
    expect(a).toContain('40');
    expect(b).toContain('7,7');
  });
  it('os demais códigos elétricos têm texto em português', () => {
    for (const codigo of ['circuito_sem_quadro', 'ponto_sem_eletroduto', 'dispositivo_sem_eletroduto', 'quadro_sem_posicao', 'ponto_potencia_zero'] as const) {
      expect(textoDoDiagnostico({ ...base, codigo, valor: 2, limite: 1 }, t as never, 'pt', nomes).length).toBeGreaterThan(10);
    }
  });
});
