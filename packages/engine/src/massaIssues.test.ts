import { describe, expect, it } from 'vitest';
import { massaAvisosDeGeometria, CODIGO_AVISO_MASSA } from './massaIssues.ts';
import type { AvisoMassaProjeto } from './massaServico.ts';

const aviso = (codigo: number, medido = 2, limite = 5): AvisoMassaProjeto => ({ massaId: 'm5', codigo, copia: 0, indice: 0, medido, limite, x: 0, y: 0, z: 0 });

describe('massa: avisos do kernel traduzidos (A.4 regra 12)', () => {
  it('cada código de 1 a 4 vira um aviso com o código textual; a face inclinada é informativa', () => {
    const out = massaAvisosDeGeometria([aviso(1), aviso(2), aviso(3), aviso(4, 11.3, 5)], 'pt');
    expect(out.map((a) => a.code)).toEqual(['massa-anel-autointersecta', 'massa-copias-sobrepostas', 'massa-limite', 'massa-face-inclinada']);
    expect(out.map((a) => a.severity)).toEqual(['warning', 'warning', 'warning', 'info']);
    expect(out.every((a) => a.elementId === 'm5')).toBe(true);
  });

  it('a mensagem leva o valor medido, em pt e em en', () => {
    expect(massaAvisosDeGeometria([aviso(4, 11.3, 5)], 'pt')[0]!.message).toContain('11.3');
    expect(massaAvisosDeGeometria([aviso(4, 11.3, 5)], 'en')[0]!.message).toContain('11.3');
    expect(massaAvisosDeGeometria([aviso(2)], 'en')[0]!.message).toContain('overlap');
  });

  it('código desconhecido é ignorado (contrato novo sem texto ainda) e sem medidas não há aviso', () => {
    expect(massaAvisosDeGeometria([aviso(9)], 'pt')).toEqual([]);
    expect(massaAvisosDeGeometria(null, 'pt')).toEqual([]);
    expect(Object.keys(CODIGO_AVISO_MASSA)).toHaveLength(4);
  });
});
