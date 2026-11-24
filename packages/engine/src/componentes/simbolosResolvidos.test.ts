import { FAMILIA_ARMARIO, type Familia, type Simbolo2D } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverSimbolos } from './simbolosResolvidos.ts';

const AMBIENTE = { L: 800, A: 720, P: 560, nPrat: 1 };

const simbolo = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  nome: id,
  vistas: ['planta'],
  plano: 'xy',
  primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['L', '0'] }],
  ...extra,
});

/** Família de exemplo (a do armário) com estes símbolos; o conteúdo dos símbolos é o do teste. */
const comSimbolos = (...lista: unknown[]): Familia => {
  const f = structuredClone(FAMILIA_ARMARIO);
  f.simbolos = lista as Simbolo2D[];
  return f;
};

describe('resolverSimbolos', () => {
  it('família antiga, sem símbolos, resolve para lista vazia sem diagnóstico', () => {
    const r = resolverSimbolos(structuredClone(FAMILIA_ARMARIO), AMBIENTE);
    expect(r).toEqual({ ok: true, simbolos: [], diagnosticos: [] });
  });

  it('linha: coordenadas em metros', () => {
    const r = resolverSimbolos(comSimbolos(simbolo('l')), AMBIENTE);
    expect(r.ok).toBe(true);
    expect(r.simbolos[0]?.primitivos).toEqual([{ tipo: 'linha', de: [0, 0], ate: [0.8, 0] }]);
  });

  it('círculo: centro e raio em metros', () => {
    const r = resolverSimbolos(comSimbolos(simbolo('c', { primitivos: [{ tipo: 'circulo', centro: ['L / 2', 'P / 2'], raio: '25' }] })), AMBIENTE);
    expect(r.simbolos[0]?.primitivos).toEqual([{ tipo: 'circulo', centro: [0.4, 0.28], raio: 0.025 }]);
  });

  it('arco: raio em metros e ângulos de graus para radianos', () => {
    const r = resolverSimbolos(
      comSimbolos(simbolo('a', { primitivos: [{ tipo: 'arco', centro: ['0', '0'], raio: 'A / 4', deGraus: '0', ateGraus: '90' }] })),
      AMBIENTE,
    );
    const arco = r.simbolos[0]?.primitivos[0];
    expect(arco?.tipo).toBe('arco');
    if (arco?.tipo !== 'arco') return;
    expect(arco.raio).toBe(0.18);
    expect(arco.inicioRad).toBeCloseTo(0, 12);
    expect(arco.fimRad).toBeCloseTo(Math.PI / 2, 12);
  });

  it('polilinha: pontos em metros e flag fechada', () => {
    const r = resolverSimbolos(
      comSimbolos(simbolo('p', { primitivos: [{ tipo: 'polilinha', pontos: [['0', '0'], ['10', '0'], ['10', '20']], fechada: true }] })),
      AMBIENTE,
    );
    expect(r.simbolos[0]?.primitivos).toEqual([{ tipo: 'polilinha', pontos: [[0, 0], [0.01, 0], [0.01, 0.02]], fechada: true }]);
  });

  it('texto literal entre aspas vale como está; altura em metros', () => {
    const r = resolverSimbolos(
      comSimbolos(simbolo('t', { primitivos: [{ tipo: 'texto', posicao: ['0', '20'], texto: '"DN"', altura: '2.5' }] })),
      AMBIENTE,
    );
    expect(r.simbolos[0]?.primitivos).toEqual([{ tipo: 'texto', posicao: [0, 0.02], texto: 'DN', altura: 0.0025 }]);
  });

  it('texto com parâmetro numérico sai formatado (inteiro sem casas, fração com até 3)', () => {
    const r = resolverSimbolos(
      comSimbolos(
        simbolo('t1', { primitivos: [{ tipo: 'texto', posicao: ['0', '0'], texto: 'nPrat', altura: '2' }] }),
        simbolo('t2', { primitivos: [{ tipo: 'texto', posicao: ['0', '0'], texto: 'L / 3', altura: '2' }] }),
      ),
      AMBIENTE,
    );
    expect(r.simbolos.map((s) => (s.primitivos[0]?.tipo === 'texto' ? s.primitivos[0].texto : null))).toEqual(['1', '266.667']);
  });

  it('quando falso remove o símbolo; quando verdadeiro mantém', () => {
    const r = resolverSimbolos(comSimbolos(simbolo('sim', { quando: 'nPrat == 1' }), simbolo('nao', { quando: 'nPrat > 1' })), AMBIENTE);
    expect(r.ok).toBe(true);
    expect(r.simbolos.map((s) => s.id)).toEqual(['sim']);
  });

  it('substituiGeometria chega ao símbolo resolvido', () => {
    const r = resolverSimbolos(comSimbolos(simbolo('s', { substituiGeometria: true })), AMBIENTE);
    expect(r.simbolos[0]?.substituiGeometria).toBe(true);
  });

  it('fórmula que não resolve vira diagnóstico e o símbolo sai da lista', () => {
    const r = resolverSimbolos(comSimbolos(simbolo('ruim', { primitivos: [{ tipo: 'circulo', centro: ['0', '0'], raio: 'L / 0' }] })), AMBIENTE);
    expect(r.ok).toBe(false);
    expect(r.simbolos).toEqual([]);
    expect(r.diagnosticos).toEqual([expect.objectContaining({ codigo: 'formula', onde: 'simbolo:ruim.primitivos[0].raio' })]);
  });

  it('raio zero resolve para faixa; vista vazia também', () => {
    const r = resolverSimbolos(
      comSimbolos(simbolo('z', { primitivos: [{ tipo: 'circulo', centro: ['0', '0'], raio: '0' }] }), simbolo('v', { vistas: [] })),
      AMBIENTE,
    );
    expect(r.diagnosticos.map((d) => d.codigo)).toEqual(['faixa', 'faixa']);
  });

  it('entrada estranha não lança: símbolo que não é objeto e lista que não é lista', () => {
    const r = resolverSimbolos(comSimbolos(null, 5), AMBIENTE);
    expect(r.ok).toBe(false);
    expect(r.diagnosticos.map((d) => d.codigo)).toEqual(['tipo', 'tipo']);

    const f = structuredClone(FAMILIA_ARMARIO);
    (f as { simbolos: unknown }).simbolos = 'nao e lista';
    expect(resolverSimbolos(f, AMBIENTE).diagnosticos).toEqual([expect.objectContaining({ codigo: 'tipo', onde: 'familia' })]);
  });

  it('um símbolo com erro não derruba os outros', () => {
    const r = resolverSimbolos(
      comSimbolos(simbolo('bom'), simbolo('ruim', { primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['nada', '0'] }] })),
      AMBIENTE,
    );
    expect(r.simbolos.map((s) => s.id)).toEqual(['bom']);
    expect(r.diagnosticos).toHaveLength(1);
  });
});
