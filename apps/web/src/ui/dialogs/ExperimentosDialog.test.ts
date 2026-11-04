import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { instalarDespachoKernel, registrarDiagnosticoRemoto, removerDespachoKernel } from '@hestia/engine';
import { ExperimentosDialog } from './ExperimentosDialog.tsx';

/** Marcação de um `<input>` pelo id; o React SSR escreve `checked=""` e `disabled=""` como atributos. */
function entrada(html: string, id: string): string {
  const m = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  if (!m) throw new Error(`sem <input id="${id}">`);
  return m[0];
}

function simularAmbiente(busca: string, salvo: Record<string, string> = {}): void {
  vi.stubGlobal('location', { search: busca });
  vi.stubGlobal('localStorage', {
    getItem: (c: string) => salvo[c] ?? null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Experimentais: interruptor por fatia', () => {
  it('padrão desligado: A e B podem ser ligadas; as demais ficam desabilitadas com a dica', () => {
    simularAmbiente('');
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    for (const f of ['A', 'B']) {
      expect(entrada(html, `kernel-fatia-${f}`)).not.toContain('checked=""');
      expect(entrada(html, `kernel-fatia-${f}`)).not.toContain('disabled=""');
    }
    for (const f of ['C', 'D', 'E']) {
      expect(entrada(html, `kernel-fatia-${f}`)).toContain('disabled=""');
      expect(entrada(html, `kernel-fatia-${f}`)).not.toContain('checked=""');
    }
    expect(html).toContain('ainda não disponível');
    expect(html).not.toContain('definido pela URL');
  });

  it('a fatia B salva aparece ligada; "requer recarregar" é o aviso ao mudar (texto pt)', () => {
    simularAmbiente('', { 'hestia:kernel:fatias': 'B' });
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-fatia-B')).toContain('checked=""');
    expect(entrada(html, 'kernel-fatia-A')).not.toContain('checked=""');
    expect(entrada(html, 'kernel-fatia-B')).not.toContain('disabled=""');
  });

  it('?kernelFatias=B na URL trava o interruptor da B ("definido pela URL")', () => {
    simularAmbiente('?kernelFatias=B');
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-fatia-B')).toContain('checked=""');
    expect(entrada(html, 'kernel-fatia-B')).toContain('disabled=""');
    expect(html).toContain('definido pela URL');
  });

  it('reflete a lista salva em hestia:kernel:fatias', () => {
    simularAmbiente('', { 'hestia:kernel:fatias': 'A' });
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-fatia-A')).toContain('checked=""');
    expect(entrada(html, 'kernel-fatia-A')).not.toContain('disabled=""');
  });

  it('?kernelFatias na URL trava o interruptor e explica "definido pela URL"', () => {
    simularAmbiente('?kernelFatias=A');
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-fatia-A')).toContain('checked=""');
    expect(entrada(html, 'kernel-fatia-A')).toContain('disabled=""');
    expect(html).toContain('definido pela URL');
  });

  it('?kernel=rust na URL liga e trava todas as fatias', () => {
    simularAmbiente('?kernel=rust');
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    for (const f of ['A', 'B', 'C', 'D', 'E']) {
      expect(entrada(html, `kernel-fatia-${f}`)).toContain('checked=""');
      expect(entrada(html, `kernel-fatia-${f}`)).toContain('disabled=""');
    }
  });

  it('modo sombra aparece desabilitado sem fatia ligada, com a dica "só vale com a fatia A ou B ligada"', () => {
    simularAmbiente('', { 'hestia:kernel:sombra': 'true' });
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-sombra')).toContain('disabled=""');
    expect(entrada(html, 'kernel-sombra')).not.toContain('checked=""');
    expect(html).toContain('só vale com a fatia A ou B ligada');
  });

  it('com só a fatia B ligada o modo sombra também fica habilitado', () => {
    simularAmbiente('', { 'hestia:kernel:fatias': 'B' });
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-sombra')).not.toContain('disabled=""');
  });

  it('com a fatia A ligada o modo sombra fica habilitado e reflete hestia:kernel:sombra', () => {
    simularAmbiente('', { 'hestia:kernel:fatias': 'A' });
    let html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-sombra')).not.toContain('disabled=""');
    expect(entrada(html, 'kernel-sombra')).not.toContain('checked=""');
    simularAmbiente('', { 'hestia:kernel:fatias': 'A', 'hestia:kernel:sombra': 'true' });
    html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-sombra')).toContain('checked=""');
  });
});

describe('Experimentais: diagnóstico do despacho da fatia A', () => {
  afterEach(() => {
    removerDespachoKernel();
    registrarDiagnosticoRemoto(null);
  });

  it('sem despachante instalado: mostra "inativo"', () => {
    simularAmbiente('');
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(html).toContain('Despacho inativo');
  });

  it('com o despachante: mostra contagem de comparações e divergências', () => {
    simularAmbiente('', { 'hestia:kernel:fatias': 'A' });
    instalarDespachoKernel({ gerenciador: () => null, config: () => ({ fatiaA: true, fatiaB: false, sombra: true }) });
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(html).toContain('Comparações do modo sombra');
    expect(html).toMatch(/Divergências[^0-9]*0/);
    expect(html).toContain('nenhuma');
  });

  it('mostra a última divergência com nível, parede e campo (vinda do worker)', () => {
    simularAmbiente('', { 'hestia:kernel:fatias': 'A' });
    const divergencia = { quando: 1, nivel: 'lv_1', parede: 'w_7', campo: 'length', mensagem: 'parede 0 (id 3, grupo 0): length 5 (Rust) x 4 (TS)', nesteNivel: 1 };
    registrarDiagnosticoRemoto({
      config: { fatiaA: true, fatiaB: false, sombra: true },
      instalado: true,
      pronto: true,
      indisponivel: null,
      entreguesPeloRust: 0,
      entreguesB: 0,
      voltasLeves: 0,
      voltasGraves: 0,
      recriacoes: 0,
      ultimoErro: null,
      comparacoes: 4,
      divergencias: 1,
      ultimaDivergencia: divergencia,
      registro: [divergencia],
    });
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(html).toContain('nível lv_1, parede w_7, campo length');
    expect(html).toMatch(/Comparações do modo sombra[^0-9]*4/);
  });
});

describe('Experimentais: divergência da fatia B', () => {
  afterEach(() => {
    removerDespachoKernel();
    registrarDiagnosticoRemoto(null);
  });

  it('mostra nível, elemento e campo, e as consultas entregues da B', () => {
    simularAmbiente('', { 'hestia:kernel:fatias': 'B' });
    const divergencia = { quando: 1, fatia: 'B' as const, nivel: 'lv_2', parede: null, elemento: 'slab_9', campo: 'topo', mensagem: 'elemento 0 (laje 3): topo: 3 (Rust) x 2 (TS)', nesteNivel: 1 };
    registrarDiagnosticoRemoto({
      config: { fatiaA: false, fatiaB: true, sombra: true },
      instalado: true,
      pronto: true,
      indisponivel: null,
      entreguesPeloRust: 0,
      entreguesB: 5,
      voltasLeves: 0,
      voltasGraves: 0,
      recriacoes: 0,
      ultimoErro: null,
      comparacoes: 3,
      divergencias: 1,
      ultimaDivergencia: divergencia,
      registro: [divergencia],
    });
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(html).toContain('nível lv_2, elemento slab_9, campo topo');
    expect(html).toMatch(/Consultas da fatia B entregues[^0-9]*5/);
  });
});
