import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTemplate, type TemplateId } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { autoPrepararBenchOrbita, INTERVALO_PREPARO_MS, PRAZO_PREPARO_MS, passoPreparo, preparoPronto, TITULO_FALHA_PREPARO } from './benchPreparo.ts';

const g = globalThis as unknown as Record<string, unknown>;

beforeEach(() => {
  useUi.setState({ tela: 'home', view: 'plan', openViews: [] });
});

afterEach(() => {
  delete g.window;
});

describe('preparoPronto (lê o gancho de montagem do canvas)', () => {
  it('sem janela nada há esperar; com montagem completa, o canvas assume', () => {
    expect(preparoPronto()).toBe(true); // node: sem window
    g.window = { __hestia3dMontagem: { montados: 2, total: 5 } };
    expect(preparoPronto()).toBe(false);
    g.window = { __hestia3dMontagem: { montados: 5, total: 5 } };
    expect(preparoPronto()).toBe(true);
    g.window = {};
    expect(preparoPronto()).toBe(false); // vista 3D ainda nem montou
  });
});

describe('passoPreparo (o que os e2e fazem por fora, por dentro)', () => {
  it('sem projeto na tela: cria a casa (house2) e entra no editor', () => {
    expect(passoPreparo()).toBe('criou-projeto');
    expect(useUi.getState().tela).toBe('editor');
    expect(editor.project.levels.length).toBeGreaterThan(0);
  });

  it('com editor aberto: ativa a vista 3D e garante a aba (equivalente ao abreVista3d do e2e)', () => {
    useUi.setState({ tela: 'editor' });
    expect(passoPreparo()).toBe('abriu-3d');
    expect(useUi.getState().view).toBe('3d');
    expect(useUi.getState().openViews.some((v) => v.kind === '3d')).toBe(true);
    // idempotente: um novo tick não duplica a aba.
    passoPreparo();
    expect(useUi.getState().openViews.filter((v) => v.kind === '3d')).toHaveLength(1);
  });
});

describe('autoPrepararBenchOrbita (relógio e prazo injetados)', () => {
  const urlBench = new URL('http://hestia.test/?bench=orbit');

  it('sem `?bench=orbit` na URL nada é agendado (uso normal intacto)', () => {
    let agendados = 0;
    autoPrepararBenchOrbita(new URL('http://hestia.test/?debug=1'), {
      agendar: () => { agendados += 1; }, agora: () => 0, prazoMs: PRAZO_PREPARO_MS, intervaloMs: INTERVALO_PREPARO_MS, escreverTitulo: () => undefined,
    });
    expect(agendados).toBe(0);
  });

  it('para quando a montagem completa chega (quem continua é o canvas)', () => {
    const fila: (() => void)[] = [];
    let titulo = '';
    const agoraMs = 0;
    // O stub precisa de `matchMedia`: `useUi.setState` consulta a tela estreita quando `window` existe.
    g.window = { __hestia3dMontagem: { montados: 0, total: 3 }, matchMedia: () => ({ matches: false }) };
    const deps = {
      agendar: (cb: () => void) => void fila.push(cb),
      agora: () => agoraMs,
      prazoMs: 1000,
      intervaloMs: 100,
      escreverTitulo: (t: string) => { titulo = t; },
    };
    useUi.setState({ tela: 'editor' });
    autoPrepararBenchOrbita(urlBench, deps);
    fila.shift()!(); // tick 1: prepara a vista 3D e remarca
    expect(fila).toHaveLength(1);
    expect(titulo).toBe('');
    (g.window as { __hestia3dMontagem: { montados: number } }).__hestia3dMontagem.montados = 3;
    fila.shift()!(); // montagem pronta → o laço morre sozinho (quem orbita é o canvas)
    expect(fila).toHaveLength(0);
  });

  it('com newProject lançando mas o projeto passou a existir, o laço entra no editor e continua vivo', () => {
    // Reproduz o Vite dev reportado: `load()` lança DEPOIS de `store.load` (kernel wasm a meio);
    // o `setState({tela:'editor'})` do chamador é pulado e nada podia morrer por causa disso.
    const realNew = editor.newProject;
    const realView = editor.setView;
    const fila: (() => void)[] = [];
    let titulo = '';
    let chamadas = 0;
    g.window = { matchMedia: () => ({ matches: false }) }; // sem `__hestia3dMontagem`: o preparo nunca "acaba"
    const deps = {
      agendar: (cb: () => void) => void fila.push(cb),
      agora: () => 0,
      prazoMs: 1000,
      intervaloMs: 100,
      escreverTitulo: (t: string) => { titulo = t; },
    };
    try {
      editor.newProject = (id: TemplateId) => {
        chamadas += 1;
        editor.load(buildTemplate(id, 'pt'), 'bench-teste.hestia.json'); // o projeto chegou à tela…
        throw new Error('kernel wasm ainda não carregou (simula dev)'); // …mas o chamador não conclui
      };
      useUi.setState({ tela: 'home', view: 'plan', openViews: [] });
      autoPrepararBenchOrbita(new URL('http://hestia.test/?bench=orbit'), deps);
      expect(() => fila.shift()!()).not.toThrow(); // tick 1: o preparo engole o lançamento e troca a tela
      expect(chamadas).toBe(1);
      expect(useUi.getState().tela).toBe('editor');
      expect(editor.project.levels.length).toBeGreaterThan(0);
      expect(fila).toHaveLength(1); // o laço remarca o próximo tick
      expect(titulo).toBe('');

      // Tick 2, já no editor: até a troca de vista lançando, o `finally` mantém o laço vivo…
      editor.setView = () => {
        throw new Error('vista fora do ar (simula dev)');
      };
      expect(() => fila.shift()!()).toThrow(); // o lançamento sobe para o timer (como no app), mas…
      expect(fila).toHaveLength(1);
      // …e no prazo, quem fala com o mundo lá fora é o título de falha.
      (deps as { agora: () => number }).agora = () => 5000;
      expect(() => fila.shift()!()).not.toThrow();
      expect(titulo).toBe(TITULO_FALHA_PREPARO);
      expect(fila).toHaveLength(0);
    } finally {
      editor.newProject = realNew;
      editor.setView = realView;
    }
  });
});
