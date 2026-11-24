import { describe, expect, it } from 'vitest';
import { lerModoBench, lerOpcoesPerf } from './opcoes.ts';

const ler = (query: string, salvo?: string | null) => lerOpcoesPerf(new URLSearchParams(query), salvo);
const bench = (query: string) => lerModoBench(new URLSearchParams(query));

describe('opções do ?perf', () => {
  it('sem o parâmetro, tudo desligado', () => {
    expect(ler('debug=1')).toEqual({ ativo: false, overlay: false });
  });

  it('perf=1 liga medição e overlay', () => {
    expect(ler('debug=1&perf=1')).toEqual({ ativo: true, overlay: true });
  });

  it('perf sem valor liga (atalho)', () => {
    expect(ler('perf')).toEqual({ ativo: true, overlay: true });
  });

  it('perf=0 desliga', () => {
    expect(ler('perf=0')).toEqual({ ativo: false, overlay: false });
    expect(ler('perf=false')).toEqual({ ativo: false, overlay: false });
  });

  it('overlay=0 mede sem desenhar o overlay', () => {
    expect(ler('perf=1&overlay=0')).toEqual({ ativo: true, overlay: false });
  });
});

describe('localStorage hestia.perf (passado como `salvo`)', () => {
  it("salvo='1' liga quando a URL não fala de perf", () => {
    expect(ler('', '1')).toEqual({ ativo: true, overlay: true });
    expect(ler('debug=1', '1')).toEqual({ ativo: true, overlay: true });
  });

  it("salvo ausente, '0' ou lixo desliga", () => {
    expect(ler('', null)).toEqual({ ativo: false, overlay: false });
    expect(ler('', '0')).toEqual({ ativo: false, overlay: false });
    expect(ler('', 'sim')).toEqual({ ativo: false, overlay: false });
  });

  it('a URL tem precedência sobre o salvo', () => {
    expect(ler('perf=0', '1')).toEqual({ ativo: false, overlay: false });
    expect(ler('perf=1', '0')).toEqual({ ativo: true, overlay: true });
    expect(ler('perf=1&overlay=0', '0')).toEqual({ ativo: true, overlay: false });
  });
});

describe('modo de bench (?bench=orbit)', () => {
  it('bench=orbit (ou só ?bench) liga o bench de órbita', () => {
    expect(bench('bench=orbit')).toBe('orbit');
    expect(bench('debug=1&bench=orbit')).toBe('orbit');
    expect(bench('bench')).toBe('orbit');
  });

  it('sem o parâmetro, ou desligado, nada roda', () => {
    expect(bench('')).toBeNull();
    expect(bench('bench=0')).toBeNull();
    expect(bench('bench=off')).toBeNull();
    expect(bench('bench=outra')).toBeNull();
  });
});
