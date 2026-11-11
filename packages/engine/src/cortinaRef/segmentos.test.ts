/**
 * Testes de intenção da remoção de segmento e das regiões fundidas (ADR 0056 §5.2): a região precisa ser retangular;
 * remoção que daria região não retangular é ignorada com aviso; o painel da região é um só.
 */
import { describe, expect, it } from 'vitest';
import { MONTANTES, PAINEIS } from './casos.ts';
import { resolverCortina } from './consulta.ts';
import { resolverGrade, type GradeResolvida } from './grade.ts';
import { AVISO_CELULA_NAO_RETANGULAR } from './avisos.ts';
import { ESTADO } from './remap.ts';
import { aplicarRemocoes, podeRemoverSegmento, restaurarSegmento } from './segmentos.ts';
import type { CortinaEntrada, CurtainInstanceRef, GridAxisSpec } from './tipos.ts';

const MUL = { interiorVertical: 'mul_ret_50x100', interiorHorizontal: 'mul_ret_50x100', borderStart: 'mul_ret_50x100', borderEnd: 'mul_ret_50x100', borderBottom: 'mul_ret_50x100', borderTop: 'mul_ret_50x100', corner: null, joinPriority: 'vertical' as const };
const F = (count: number): GridAxisSpec => ({ mode: 'fixedNumber', count });

function ent(L: number, H: number, u: GridAxisSpec, v: GridAxisSpec, instancia?: CurtainInstanceRef): CortinaEntrada {
  return { L, H, tipo: { depth: 0.1, u, v, mullions: MUL, defaultPanelTypeId: 'pnl_vidro_10' }, montantes: MONTANTES, paineis: PAINEIS, ...(instancia ? { instancia } : {}) };
}

/** Grade 2 × 2 (L 4, H 2). Linha global: U1 = 1 (interior), V1 = nu + 1 + 1 = 4. Índice de célula = i·nv + j. */
const G2: GradeResolvida = resolverGrade(ent(4, 2, F(2), F(2)));
const U1 = 1;
const V1 = 4;

describe('remoção de segmento: região retangular', () => {
  it('um segmento interno funde as duas células vizinhas numa região', () => {
    const r = aplicarRemocoes(G2, [{ ordem: 0, a: U1, b: 0 }]);
    expect(r.naoRetangulares).toEqual([]);
    expect(r.regiaoDeCelula[0]).toBe(0);
    expect(r.regiaoDeCelula[2]).toBe(0); // (1, 0) é da região de (0, 0)
    expect(r.regioes.map((x) => x.celulas)).toEqual([2, 1, 1]);
    expect(r.semMontante.has('1:0')).toBe(true);
  });

  it('dois segmentos que formam um L: o segundo é ignorado e vira aviso (não retangular)', () => {
    const lista = [{ ordem: 0, a: U1, b: 0 }, { ordem: 1, a: V1, b: 0 }];
    const r = aplicarRemocoes(G2, lista);
    expect(r.naoRetangulares.map((x) => x.ordem)).toEqual([1]);
    expect(r.semMontante.has('4:0')).toBe(false);
    expect(podeRemoverSegmento(G2, [lista[0]!], { a: V1, b: 0 })).toBe(false);
  });

  it('três segmentos que formam um retângulo 2 × 2: vale, e o segmento interno que sobra não tem montante', () => {
    const r = aplicarRemocoes(G2, [{ ordem: 0, a: U1, b: 0 }, { ordem: 1, a: U1, b: 1 }, { ordem: 2, a: V1, b: 0 }]);
    expect(r.naoRetangulares).toEqual([]);
    expect(r.regioes).toHaveLength(1);
    expect(r.regioes[0]).toMatchObject({ celulas: 4, i0: 0, i1: 1, j0: 0, j1: 1 });
    expect(r.semMontante.has('4:1')).toBe(true); // interno à região, sem remoção explícita
  });

  it('remover segmento de borda não funde nada: só tira o montante da borda', () => {
    const r = aplicarRemocoes(G2, [{ ordem: 0, a: 0, b: 0 }]);
    expect(r.regioes.every((x) => x.celulas === 1)).toBe(true);
    expect(r.semMontante.has('0:0')).toBe(true);
  });

  it('restaurar segmento tira a remoção da lista', () => {
    const lista = [{ line: { axis: 'u' as const, index: 1, pos: 0.5, n: 2 }, k: 0, nk: 2, mid: 0.25 }, { line: { axis: 'u' as const, index: 1, pos: 0.5, n: 2 }, k: 1, nk: 2, mid: 0.75 }];
    expect(restaurarSegmento(lista, 0)).toEqual([lista[1]]);
  });
});

describe('remoção na resolução da cortina', () => {
  it('a região aparece como um painel com a largura das duas células e sem montante no meio', () => {
    const e = ent(4, 2, F(2), F(2), { removedSegments: [{ line: { axis: 'u', index: 1, pos: 0.5, n: 2 }, k: 0, nk: 2, mid: 0.25 }] });
    const r = resolverCortina(e);
    expect(r.pecas.montantes.some((m) => m.linha === U1 && m.k === 0)).toBe(false);
    const fundido = r.pecas.paineis.find((p) => p.celulas === 2);
    expect(fundido).toBeDefined();
    // a região vai de 0 a 4 m; as bordas esquerda e direita têm montante de 50 mm (recuo inteiro)
    expect(fundido?.larguraLivre).toBeCloseTo(3.9, 9);
    expect(r.pecas.paineis).toHaveLength(3);
  });

  it('segmento de borda referido por índice 0: tira só o montante da borda, sem fundir', () => {
    const e = ent(4, 2, F(2), F(2), { removedSegments: [{ line: { axis: 'u', index: 0, pos: 0, n: 2 }, k: 0, nk: 2, mid: 0.25 }] });
    const r = resolverCortina(e);
    expect(r.grade.remap.segmentos[0]?.estado).toBe(ESTADO.adotada);
    expect(r.grade.remocao.regioes.every((x) => x.celulas === 1)).toBe(true);
    expect(r.pecas.montantes.some((m) => m.linha === 0 && m.k === 0)).toBe(false);
  });

  it('o registro de remoção ignorada aparece como aviso cortina-celula-nao-retangular', () => {
    const e = ent(4, 2, F(2), F(2), {
      removedSegments: [
        { line: { axis: 'u', index: 1, pos: 0.5, n: 2 }, k: 0, nk: 2, mid: 0.25 },
        { line: { axis: 'v', index: 1, pos: 0.5, n: 2 }, k: 0, nk: 2, mid: 0.25 },
      ],
    });
    const r = resolverCortina(e);
    expect(r.avisos.some((x) => x.codigo === AVISO_CELULA_NAO_RETANGULAR)).toBe(true);
    expect(r.grade.remap.segmentos[1]?.estado).toBe(ESTADO.adotada);
  });

  it('uma sobrescrita de painel na célula vale para a região inteira', () => {
    const e = ent(4, 2, F(2), F(2), {
      removedSegments: [{ line: { axis: 'u', index: 1, pos: 0.5, n: 2 }, k: 0, nk: 2, mid: 0.25 }],
      cells: [{ key: { i: 1, j: 0, s: 0.75, z: 0.25, nu: 2, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } }],
    });
    const r = resolverCortina(e);
    const fundido = r.pecas.paineis.find((p) => p.celulas === 2);
    expect(fundido?.tipoId).toBe('pnl_solido_alu_4');
  });

  it('duas sobrescritas de painel numa mesma região: uma adotada, a outra órfã por fusão', () => {
    const e = ent(4, 2, F(2), F(2), {
      removedSegments: [{ line: { axis: 'u', index: 1, pos: 0.5, n: 2 }, k: 0, nk: 2, mid: 0.25 }],
      cells: [
        { key: { i: 0, j: 0, s: 0.25, z: 0.25, nu: 2, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } },
        { key: { i: 1, j: 0, s: 0.75, z: 0.25, nu: 2, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_vazio' } },
      ],
    });
    const r = resolverCortina(e);
    const estados = r.grade.remap.celulas.map((x) => x.estado).sort();
    expect(estados).toEqual([ESTADO.adotada, ESTADO.fusao]);
  });
});
