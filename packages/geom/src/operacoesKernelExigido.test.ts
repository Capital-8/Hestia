import { afterEach, describe, expect, it } from 'vitest';
import { definirImplKernel, ErroKernelV1, exigirKernel, KernelV1Pendente, resetarEstadoKernel, type ImplKernel } from './kernel/contrato.ts';
import { desativarKernel } from './kernel/contrato.ts';
import { difference, offsetMulti, union } from './operacoesKernel.ts';
import type { MultiPolygon } from './polygon.ts';

const quadrado = (x: number): MultiPolygon => [[[{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }, { x, y: 1 }]]];

const quebrado = (): ImplKernel => ({
  nome: 'quebrado',
  uniao: () => {
    throw new Error('falha simulada');
  },
  diferenca: () => [],
  interseccao: () => [],
  offset: () => [],
});

describe('kernel v1 exigido (produção): nunca TypeScript', () => {
  afterEach(() => resetarEstadoKernel());

  it('sem o wasm carregado lança KernelV1Pendente', () => {
    exigirKernel(true);
    expect(() => union(quadrado(0), quadrado(2))).toThrow(KernelV1Pendente);
    expect(() => offsetMulti(quadrado(0), 0.1)).toThrow(KernelV1Pendente);
  });

  it('carregamento que falhou lança ErroKernelV1 com o motivo', () => {
    exigirKernel(true);
    desativarKernel('wasm indisponível: HTTP 404');
    expect(() => difference(quadrado(0), quadrado(0.5))).toThrow(ErroKernelV1);
    expect(() => difference(quadrado(0), quadrado(0.5))).toThrow(/HTTP 404/);
  });

  it('falha do Rust vira ErroKernelV1 e não refaz em TypeScript', () => {
    exigirKernel(true);
    definirImplKernel(quebrado());
    expect(() => union(quadrado(0), quadrado(2))).toThrow(ErroKernelV1);
  });

  it('sem exigir (testes e desenvolvimento) o TypeScript segue valendo', () => {
    expect(union(quadrado(0), quadrado(2))).toHaveLength(2);
    definirImplKernel(quebrado());
    expect(union(quadrado(0), quadrado(2))).toHaveLength(2);
  });
});
