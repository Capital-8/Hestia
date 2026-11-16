import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayoutNode, Pane, PaneLayout, PaneView } from './panes.ts';
import { DEFAULT_SYNC, leaves } from './panes.ts';
import { layoutTreeOps as ops, loadPanes, nextPaneId, normalizeLayout, savePanes, singlePaneLayout } from './layoutTree.ts';

const FB = { view: { kind: 'plan', levelId: 'lv_0' } as PaneView, id: 'p1' };
const PLAN0: PaneView = { kind: 'plan', levelId: 'lv_0' };
const PLAN1: PaneView = { kind: 'plan', levelId: 'lv_1' };
const V3D: PaneView = { kind: '3d' };

/** Congela a árvore inteira: qualquer mutação da entrada lança TypeError (módulos são estritos). */
function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** Forma compacta da árvore: folha = id; divisão = direção@ratio(primeiro,segundo). */
function shape(n: LayoutNode): string {
  return n.kind === 'leaf' ? n.pane.id : `${n.direction}@${n.ratio}(${shape(n.first)},${shape(n.second)})`;
}
const idsOf = (l: PaneLayout): string[] => leaves(l.root).map((p) => p.id);

/** Folha de entrada para os testes (campos sobrescritos por `over`). */
function leaf(id: string, view: PaneView, over: Partial<Pane> = {}): LayoutNode {
  return {
    kind: 'leaf',
    pane: { id, view, style: {}, sync: { followLevel: true, followSelection: true, lockCameraTo: null }, camera3d: null, camera2d: null, ...over },
  };
}

/** row(p1 plano lv_0, p2 3D), ativo p1. */
function duo(): PaneLayout {
  return deepFreeze({
    root: { kind: 'split', direction: 'row', ratio: 0.5, first: leaf('p1', PLAN0), second: leaf('p2', V3D) },
    activeId: 'p1',
    maximizedId: null,
  });
}

/** row(p1, column(p2, row(p3, p4))), ativo p1. Já é o máximo de 4 painéis. */
function quad(): PaneLayout {
  let l = singlePaneLayout(PLAN0, 'p1');
  l = ops.split(l, 'p1', 'row', V3D, 'p2');
  l = ops.split(l, 'p2', 'column', PLAN1, 'p3');
  l = ops.split(l, 'p3', 'row', V3D, 'p4');
  return ops.setActive(l, 'p1');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('singlePaneLayout', () => {
  it('um painel, ativo, sem maximizado, com sync padrão e câmeras nulas', () => {
    expect(singlePaneLayout(PLAN0, 'p1')).toEqual({
      root: {
        kind: 'leaf',
        pane: {
          id: 'p1',
          view: { kind: 'plan', levelId: 'lv_0' },
          style: {},
          sync: { followLevel: true, followSelection: true, lockCameraTo: null },
          camera3d: null,
          camera2d: null,
        },
      },
      activeId: 'p1',
      maximizedId: null,
    });
  });
});

describe('split', () => {
  it('troca a folha por divisão de 0,5 com o original primeiro e o novo painel ativo', () => {
    const l = deepFreeze(singlePaneLayout(PLAN0, 'p1'));
    const r = ops.split(l, 'p1', 'row', V3D, 'p2');
    expect(shape(r.root)).toBe('row@0.5(p1,p2)');
    expect(r.activeId).toBe('p2');
    expect(r.maximizedId).toBe(null);
    expect(leaves(r.root)[1]).toEqual({
      id: 'p2',
      view: { kind: '3d' },
      style: {},
      sync: { followLevel: true, followSelection: true, lockCameraTo: null },
      camera3d: null,
      camera2d: null,
    });
    expect(leaves(r.root)[0]?.view).toEqual({ kind: 'plan', levelId: 'lv_0' });
  });

  it('não muda a entrada (congelada)', () => {
    const l = deepFreeze(singlePaneLayout(PLAN0, 'p1'));
    const r = ops.split(l, 'p1', 'column', V3D, 'p2');
    expect(shape(r.root)).toBe('column@0.5(p1,p2)');
    expect(shape(l.root)).toBe('p1');
    expect(l.activeId).toBe('p1');
  });

  it('o novo painel recebe sync em cópia de DEFAULT_SYNC, não a própria referência', () => {
    const r = ops.split(singlePaneLayout(PLAN0, 'p1'), 'p1', 'row', V3D, 'p2');
    const novo = leaves(r.root)[1];
    expect(novo?.sync).toEqual({ followLevel: true, followSelection: true, lockCameraTo: null });
    expect(novo?.sync).not.toBe(DEFAULT_SYNC);
    expect(DEFAULT_SYNC).toEqual({ followLevel: true, followSelection: true, lockCameraTo: null });
  });

  it('recusa o 5º painel (devolve o mesmo objeto)', () => {
    const q = quad();
    expect(shape(q.root)).toBe('row@0.5(p1,column@0.5(p2,row@0.5(p3,p4)))');
    expect(ops.split(q, 'p1', 'row', V3D, 'p5')).toBe(q);
  });

  it('recusa paneId inexistente e newId já usado', () => {
    const l = duo();
    expect(ops.split(l, 'zz', 'row', V3D, 'p3')).toBe(l);
    expect(ops.split(l, 'p1', 'row', V3D, 'p2')).toBe(l);
  });

  it('desmaximiza ao dividir', () => {
    const m = ops.toggleMaximize(duo(), 'p1');
    const r = ops.split(m, 'p1', 'column', V3D, 'p3');
    expect(r.maximizedId).toBe(null);
    expect(r.activeId).toBe('p3');
    expect(shape(r.root)).toBe('row@0.5(column@0.5(p1,p3),p2)');
  });
});

describe('close', () => {
  it('nunca fecha o último painel (mesmo objeto)', () => {
    const l = deepFreeze(singlePaneLayout(PLAN0, 'p1'));
    expect(ops.close(l, 'p1')).toBe(l);
  });

  it('fecha o painel não ativo e promove o irmão no lugar do pai, sem mudar o ativo', () => {
    const r = ops.close(duo(), 'p2');
    expect(shape(r.root)).toBe('p1');
    expect(r.activeId).toBe('p1');
    expect(r.maximizedId).toBe(null);
  });

  it('fechar o ativo: o ativo passa a ser a primeira folha do irmão promovido', () => {
    const r = ops.close(quad(), 'p1');
    expect(shape(r.root)).toBe('column@0.5(p2,row@0.5(p3,p4))');
    expect(r.activeId).toBe('p2');
  });

  it('fechar uma folha de dentro da árvore preserva o resto', () => {
    const r = ops.close(quad(), 'p3');
    expect(shape(r.root)).toBe('row@0.5(p1,column@0.5(p2,p4))');
    expect(r.activeId).toBe('p1');
  });

  it('fechar o maximizado zera maximizedId', () => {
    const m = ops.toggleMaximize(duo(), 'p2');
    const r = ops.close(m, 'p2');
    expect(r.maximizedId).toBe(null);
    expect(r.activeId).toBe('p1');
  });

  it('painel com lock apontando para o fechado passa a null; lock para outro se mantém', () => {
    // row(p1, column(p2 trava em p1, p3 trava em p2)), ativo p1
    const travado = deepFreeze({
      root: {
        kind: 'split',
        direction: 'row',
        ratio: 0.5,
        first: leaf('p1', PLAN0),
        second: {
          kind: 'split',
          direction: 'column',
          ratio: 0.5,
          first: leaf('p2', V3D, { sync: { followLevel: true, followSelection: true, lockCameraTo: 'p1' } }),
          second: leaf('p3', PLAN1, { sync: { followLevel: true, followSelection: true, lockCameraTo: 'p2' } }),
        },
      },
      activeId: 'p1',
      maximizedId: null,
    }) as PaneLayout;
    const r = ops.close(travado, 'p1');
    expect(leaves(r.root).map((p) => [p.id, p.sync.lockCameraTo])).toEqual([
      ['p2', null],
      ['p3', 'p2'],
    ]);
    const r2 = ops.close(travado, 'p2');
    expect(leaves(r2.root).map((p) => [p.id, p.sync.lockCameraTo])).toEqual([
      ['p1', null],
      ['p3', null],
    ]);
  });

  it('id inexistente devolve o mesmo objeto', () => {
    const l = duo();
    expect(ops.close(l, 'zz')).toBe(l);
  });
});

describe('resize', () => {
  it('troca a fração da divisão do primeiro filho', () => {
    const r = ops.resize(duo(), 'p1', 0.3);
    expect(shape(r.root)).toBe('row@0.3(p1,p2)');
  });

  it('clampa em SPLIT_LIMITS: 0.1 vira 0.15 e 0.9 vira 0.85', () => {
    expect(shape(ops.resize(duo(), 'p1', 0.1).root)).toBe('row@0.15(p1,p2)');
    expect(shape(ops.resize(duo(), 'p1', 0.9).root)).toBe('row@0.85(p1,p2)');
  });

  it('paneId que é o segundo da divisão: mesmo objeto (só o primeiro controla a fração)', () => {
    const l = duo();
    expect(ops.resize(l, 'p2', 0.3)).toBe(l);
  });

  it('afeta só a divisão do primeiro filho direto, não a raiz', () => {
    const r = ops.resize(quad(), 'p2', 0.7);
    expect(shape(r.root)).toBe('row@0.5(p1,column@0.7(p2,row@0.5(p3,p4)))');
  });

  it('ratio inalterado, NaN ou id inexistente devolvem o mesmo objeto', () => {
    const l = duo();
    expect(ops.resize(l, 'p1', 0.5)).toBe(l);
    expect(ops.resize(l, 'p1', Number.NaN)).toBe(l);
    expect(ops.resize(l, 'zz', 0.3)).toBe(l);
  });
});

describe('setActive', () => {
  it('ativa painel existente', () => {
    expect(ops.setActive(duo(), 'p2').activeId).toBe('p2');
  });

  it('painel inexistente ou já ativo devolve o mesmo objeto', () => {
    const l = duo();
    expect(ops.setActive(l, 'zz')).toBe(l);
    expect(ops.setActive(l, 'p1')).toBe(l);
  });

  it('com um maximizado, ativar outro troca o maximizado para o novo ativo', () => {
    const m = ops.toggleMaximize(duo(), 'p1');
    const r = ops.setActive(m, 'p2');
    expect(r.activeId).toBe('p2');
    expect(r.maximizedId).toBe('p2');
  });
});

describe('toggleMaximize', () => {
  it('ida e volta: maximiza (vira ativo) e depois desmaximiza', () => {
    const l = duo();
    const ida = ops.toggleMaximize(l, 'p2');
    expect(ida.maximizedId).toBe('p2');
    expect(ida.activeId).toBe('p2');
    const volta = ops.toggleMaximize(ida, 'p2');
    expect(volta.maximizedId).toBe(null);
    expect(volta.activeId).toBe('p2');
  });

  it('não muda a entrada (congelada)', () => {
    const l = duo();
    const r = ops.toggleMaximize(l, 'p1');
    expect(r.maximizedId).toBe('p1');
    expect(l.maximizedId).toBe(null);
  });

  it('com um painel só devolve o mesmo objeto', () => {
    const l = singlePaneLayout(PLAN0, 'p1');
    expect(ops.toggleMaximize(l, 'p1')).toBe(l);
  });
});

describe('setView', () => {
  it('troca a vista e zera as duas câmeras', () => {
    const comCamera = deepFreeze({
      root: {
        kind: 'split',
        direction: 'row',
        ratio: 0.5,
        first: leaf('p1', PLAN0, {
          camera2d: { zoom: 50, center: { x: 1, y: 2 } },
          camera3d: { azimuth: 0.5, elevation: 0.2, distance: 30, ortho: false, target: { x: 0, y: 0, z: 1 } },
        }),
        second: leaf('p2', V3D),
      },
      activeId: 'p1',
      maximizedId: null,
    }) as PaneLayout;
    const r = ops.setView(comCamera, 'p1', PLAN1);
    const p = leaves(r.root)[0];
    expect(p?.view).toEqual({ kind: 'plan', levelId: 'lv_1' });
    expect(p?.camera2d).toBe(null);
    expect(p?.camera3d).toBe(null);
    expect(leaves(comCamera.root)[0]?.camera2d).toEqual({ zoom: 50, center: { x: 1, y: 2 } });
  });

  it('mesma vista ou painel inexistente devolve o mesmo objeto', () => {
    const l = duo();
    expect(ops.setView(l, 'p1', PLAN0)).toBe(l);
    expect(ops.setView(l, 'zz', V3D)).toBe(l);
  });
});

describe('setStyle', () => {
  it('mescla o patch no estilo do painel', () => {
    const r = ops.setStyle(duo(), 'p2', { style: 'shaded', edges: true });
    expect(leaves(r.root)[1]?.style).toEqual({ style: 'shaded', edges: true });
    const r2 = ops.setStyle(r, 'p2', { background: '#1a2b3c' });
    expect(leaves(r2.root)[1]?.style).toEqual({ style: 'shaded', edges: true, background: '#1a2b3c' });
  });

  it('campo undefined no patch remove a chave', () => {
    const r = ops.setStyle(duo(), 'p2', { style: 'shaded', edges: true });
    const r2 = ops.setStyle(r, 'p2', { style: undefined });
    expect(leaves(r2.root)[1]?.style).toEqual({ edges: true });
    expect(leaves(r2.root)[1]?.style).not.toHaveProperty('style');
  });

  it('patch que não muda nada ou painel inexistente devolve o mesmo objeto', () => {
    const l = ops.setStyle(duo(), 'p1', { thinLines: true });
    expect(ops.setStyle(l, 'p1', { thinLines: true })).toBe(l);
    expect(ops.setStyle(l, 'p1', { shadows: undefined })).toBe(l);
    expect(ops.setStyle(l, 'zz', { thinLines: true })).toBe(l);
  });

  it('não muda a entrada (congelada)', () => {
    const l = duo();
    ops.setStyle(l, 'p1', { style: 'wireframe' });
    expect(leaves(l.root)[0]?.style).toEqual({});
  });
});

describe('applyPreset', () => {
  const VIEWS: PaneView[] = [PLAN0, V3D, PLAN1, { kind: 'plan', levelId: 'lv_2' }];
  const IDS = ['p1', 'p2', 'p3', 'p4'];
  const base = (): PaneLayout => singlePaneLayout(PLAN0, 'x');

  it('single: um painel', () => {
    const r = ops.applyPreset(base(), 'single', VIEWS, IDS);
    expect(shape(r.root)).toBe('p1');
    expect(r.activeId).toBe('p1');
    expect(r.maximizedId).toBe(null);
  });

  it('twoColumns: row com ratio 0,5', () => {
    expect(shape(ops.applyPreset(base(), 'twoColumns', VIEWS, IDS).root)).toBe('row@0.5(p1,p2)');
  });

  it('twoRows: column com ratio 0,5', () => {
    expect(shape(ops.applyPreset(base(), 'twoRows', VIEWS, IDS).root)).toBe('column@0.5(p1,p2)');
  });

  it('oneAndTwo: esquerda um painel, direita coluna de dois', () => {
    const r = ops.applyPreset(base(), 'oneAndTwo', VIEWS, IDS);
    expect(shape(r.root)).toBe('row@0.5(p1,column@0.5(p2,p3))');
  });

  it('grid: coluna de duas linhas, cada uma uma row de dois', () => {
    const r = ops.applyPreset(base(), 'grid', VIEWS, IDS);
    expect(shape(r.root)).toBe('column@0.5(row@0.5(p1,p2),row@0.5(p3,p4))');
    expect(leaves(r.root).map((p) => p.view)).toEqual([
      { kind: 'plan', levelId: 'lv_0' },
      { kind: '3d' },
      { kind: 'plan', levelId: 'lv_1' },
      { kind: 'plan', levelId: 'lv_2' },
    ]);
  });

  it('painéis novos: style vazio, sync padrão em cópia, câmeras nulas, maximizado nulo', () => {
    const r = ops.applyPreset(base(), 'twoColumns', VIEWS, IDS);
    for (const p of leaves(r.root)) {
      expect(p.style).toEqual({});
      expect(p.sync).toEqual({ followLevel: true, followSelection: true, lockCameraTo: null });
      expect(p.sync).not.toBe(DEFAULT_SYNC);
      expect(p.camera2d).toBe(null);
      expect(p.camera3d).toBe(null);
    }
  });

  it('mantém o ativo se o id dele entra no preset; senão vai para o primeiro', () => {
    const comAtivo3 = deepFreeze({ ...base(), activeId: 'p3', maximizedId: 'p9' }) as PaneLayout;
    // twoColumns usa p1 e p2: p3 fica de fora, então o ativo vai para p1
    const dois = ops.applyPreset(comAtivo3, 'twoColumns', VIEWS, IDS);
    expect(dois.activeId).toBe('p1');
    expect(dois.maximizedId).toBe(null);
    // grid usa p1..p4: p3 continua ativo
    expect(ops.applyPreset(comAtivo3, 'grid', VIEWS, IDS).activeId).toBe('p3');
    expect(ops.applyPreset(base(), 'twoRows', VIEWS, IDS).activeId).toBe('p1');
  });

  it('faltam views: cai para o maior que couber (grid com 3 views vira oneAndTwo)', () => {
    const r = ops.applyPreset(base(), 'grid', [PLAN0, V3D, PLAN1], IDS);
    expect(shape(r.root)).toBe('row@0.5(p1,column@0.5(p2,p3))');
  });

  it('faltam views: oneAndTwo com 2 vira twoColumns', () => {
    expect(shape(ops.applyPreset(base(), 'oneAndTwo', [PLAN0, V3D], IDS).root)).toBe('row@0.5(p1,p2)');
  });

  it('faltam ids: twoRows com 1 id vira single', () => {
    expect(shape(ops.applyPreset(base(), 'twoRows', VIEWS, ['p1']).root)).toBe('p1');
  });

  it('nenhuma view ou nenhum id devolve o mesmo objeto', () => {
    const l = base();
    expect(ops.applyPreset(l, 'grid', [], IDS)).toBe(l);
    expect(ops.applyPreset(l, 'grid', VIEWS, [])).toBe(l);
  });

  it('ids repetidos não geram painel duplicado', () => {
    const r = ops.applyPreset(base(), 'twoColumns', VIEWS, ['p1', 'p1', 'p2']);
    expect(shape(r.root)).toBe('row@0.5(p1,p2)');
    // o id p2 vem com a view de índice 2 (o id repetido na posição 1 é pulado junto com sua view)
    expect(leaves(r.root)[1]?.view).toEqual({ kind: 'plan', levelId: 'lv_1' });
  });
});

describe('normalizeLayout', () => {
  it('lixo devolve o layout de um painel (fallback)', () => {
    const expected = singlePaneLayout(PLAN0, 'p1');
    for (const lixo of [null, 42, 'x', undefined, [], {}, { root: 'x' }, { root: null }]) {
      expect(normalizeLayout(lixo, FB)).toEqual(expected);
    }
  });

  it('round-trip JSON de um layout válido não muda nada', () => {
    const l = quad();
    expect(normalizeLayout(JSON.parse(JSON.stringify(l)), FB)).toEqual(l);
  });

  it('ids duplicados viram fallback', () => {
    const raw = {
      root: { kind: 'split', direction: 'row', ratio: 0.5, first: leaf('p1', PLAN0), second: leaf('p1', V3D) },
      activeId: 'p1',
      maximizedId: null,
    };
    expect(normalizeLayout(raw, FB)).toEqual(singlePaneLayout(PLAN0, 'p1'));
  });

  it('5 folhas viram fallback', () => {
    const raw = { ...quad(), root: { kind: 'split', direction: 'row', ratio: 0.5, first: quad().root, second: leaf('p5', V3D) } };
    expect(normalizeLayout(raw, FB)).toEqual(singlePaneLayout(PLAN0, 'p1'));
  });

  it('ratio NaN vira fallback; ratio fora da faixa é clampado', () => {
    const nan = { root: { kind: 'split', direction: 'row', ratio: Number.NaN, first: leaf('p1', PLAN0), second: leaf('p2', V3D) }, activeId: 'p1', maximizedId: null };
    expect(normalizeLayout(nan, FB)).toEqual(singlePaneLayout(PLAN0, 'p1'));
    const alto = { root: { kind: 'split', direction: 'row', ratio: 2, first: leaf('p1', PLAN0), second: leaf('p2', V3D) }, activeId: 'p1', maximizedId: null };
    expect(shape(normalizeLayout(alto, FB).root)).toBe('row@0.85(p1,p2)');
    const baixo = { root: { kind: 'split', direction: 'column', ratio: -3, first: leaf('p1', PLAN0), second: leaf('p2', V3D) }, activeId: 'p1', maximizedId: null };
    expect(shape(normalizeLayout(baixo, FB).root)).toBe('column@0.15(p1,p2)');
  });

  it('direção inválida ou kind de nó desconhecido viram fallback', () => {
    const dir = { root: { kind: 'split', direction: 'diagonal', ratio: 0.5, first: leaf('p1', PLAN0), second: leaf('p2', V3D) }, activeId: 'p1', maximizedId: null };
    expect(normalizeLayout(dir, FB)).toEqual(singlePaneLayout(PLAN0, 'p1'));
    const kind = { root: { kind: 'node', pane: null }, activeId: 'p1', maximizedId: null };
    expect(normalizeLayout(kind, FB)).toEqual(singlePaneLayout(PLAN0, 'p1'));
  });

  it('view de kind desconhecido vira fallback inteiro', () => {
    const raw = { root: { kind: 'leaf', pane: { id: 'p1', view: { kind: 'chat' } } }, activeId: 'p1', maximizedId: null };
    expect(normalizeLayout(raw, FB)).toEqual(singlePaneLayout(PLAN0, 'p1'));
  });

  it('activeId fantasma vira a primeira folha', () => {
    const raw = { root: { kind: 'split', direction: 'row', ratio: 0.5, first: leaf('p2', PLAN0), second: leaf('p3', V3D) }, activeId: 'p9', maximizedId: null };
    expect(normalizeLayout(raw, FB).activeId).toBe('p2');
  });

  it('maximizedId fantasma vira null; existente se mantém', () => {
    const base = { root: { kind: 'split', direction: 'row', ratio: 0.5, first: leaf('p1', PLAN0), second: leaf('p2', V3D) }, activeId: 'p1' };
    expect(normalizeLayout({ ...base, maximizedId: 'p9' }, FB).maximizedId).toBe(null);
    expect(normalizeLayout({ ...base, maximizedId: 'p2' }, FB).maximizedId).toBe('p2');
  });

  it('lockCameraTo fantasma ou apontando para si mesmo vira null', () => {
    const comLock = (alvo: string | null, id = 'p1') => ({
      root: leaf(id, PLAN0, { sync: { followLevel: true, followSelection: true, lockCameraTo: alvo } }),
      activeId: id,
      maximizedId: null,
    });
    expect(normalizeLayout(comLock('p9'), FB).root).toMatchObject({ kind: 'leaf', pane: { sync: { lockCameraTo: null } } });
    expect(normalizeLayout(comLock('p1'), FB).root).toMatchObject({ kind: 'leaf', pane: { sync: { lockCameraTo: null } } });
  });

  it('campos de estilo inválidos são descartados; só valores do contrato ficam', () => {
    const raw = {
      root: {
        kind: 'leaf',
        pane: {
          id: 'p1',
          view: { kind: '3d' },
          style: { style: 'neon', shadows: 'sim', edges: true, background: 'red', extra: 1, thinLines: false },
        },
      },
      activeId: 'p1',
      maximizedId: null,
    };
    expect(leaves(normalizeLayout(raw, FB).root)[0]?.style).toEqual({ edges: true, thinLines: false });
    const ok = { ...raw, root: { kind: 'leaf', pane: { id: 'p1', view: { kind: '3d' }, style: { style: 'realistic', background: '#a0B1c2' } } } };
    expect(leaves(normalizeLayout(ok, FB).root)[0]?.style).toEqual({ style: 'realistic', background: '#a0B1c2' });
  });

  it('câmera inválida vira null', () => {
    const raw = {
      root: { kind: 'leaf', pane: { id: 'p1', view: { kind: 'plan', levelId: 'lv_0' }, camera2d: { zoom: -1, center: { x: 0, y: 0 } }, camera3d: { azimuth: 'a' } } },
      activeId: 'p1',
      maximizedId: null,
    };
    const p = leaves(normalizeLayout(raw, FB).root)[0];
    expect(p?.camera2d).toBe(null);
    expect(p?.camera3d).toBe(null);
  });
});

describe('persistência (navegador falso)', () => {
  function fakeStorage(): Map<string, string> {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    });
    return store;
  }

  it('sem nada guardado: layout de um painel', () => {
    fakeStorage();
    expect(loadPanes(FB)).toEqual(singlePaneLayout(PLAN0, 'p1'));
  });

  it('salva e carrega de volta (chave hestia.panes)', () => {
    const store = fakeStorage();
    const l = quad();
    savePanes(l);
    expect(store.has('hestia.panes')).toBe(true);
    expect(loadPanes(FB)).toEqual(l);
  });

  it('JSON inválido: layout de um painel', () => {
    const store = fakeStorage();
    store.set('hestia.panes', '{nao e json');
    expect(loadPanes(FB)).toEqual(singlePaneLayout(PLAN0, 'p1'));
  });

  it('armazenamento que lança na leitura: layout de um painel, sem exceção', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('negado');
      },
      setItem: () => {
        throw new Error('negado');
      },
    });
    expect(loadPanes(FB)).toEqual(singlePaneLayout(PLAN0, 'p1'));
  });

  it('savePanes não grava câmeras (são da sessão)', () => {
    const store = fakeStorage();
    const base = singlePaneLayout(PLAN0, 'p1');
    const pane = (base.root as { kind: 'leaf'; pane: Pane }).pane;
    savePanes({ ...base, root: { kind: 'leaf', pane: { ...pane, camera2d: { zoom: 5, center: { x: 1, y: 2 } } } } });
    const salvo = JSON.parse(store.get('hestia.panes') as string) as { root: { pane: Pane } };
    expect(salvo.root.pane.camera2d).toBeNull();
    expect(salvo.root.pane.camera3d).toBeNull();
  });

  it('armazenamento que lança na escrita: savePanes não lança', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('cheio');
      },
    });
    expect(() => savePanes(duo())).not.toThrow();
  });
});

describe('resizeAt (por caminho)', () => {
  /** Grade 2×2 de verdade: column(row(p1,p2), row(p3,p4)): o primeiro filho da raiz é uma DIVISÃO. */
  const grade = (): PaneLayout => ops.applyPreset(singlePaneLayout(PLAN0, 'p1'), 'grid', [PLAN0, V3D, PLAN1, V3D], ['p1', 'p2', 'p3', 'p4']);
  const GRADE = 'column@0.5(row@0.5(p1,p2),row@0.5(p3,p4))';

  it('a grade pronta tem a forma esperada', () => {
    expect(shape(grade().root)).toBe(GRADE);
  });

  it('raiz: [] ajusta a divisão da raiz', () => {
    expect(shape(ops.resizeAt(duo(), [], 0.3).root)).toBe('row@0.3(p1,p2)');
  });

  it('grade 2×2: a divisória das LINHAS (primeiro filho é divisão) é alcançável', () => {
    expect(shape(ops.resizeAt(grade(), [], 0.7).root)).toBe('column@0.7(row@0.5(p1,p2),row@0.5(p3,p4))');
  });

  it('grade 2×2: divisória de cada linha pelo caminho', () => {
    expect(shape(ops.resizeAt(grade(), ['first'], 0.3).root)).toBe('column@0.5(row@0.3(p1,p2),row@0.5(p3,p4))');
    expect(shape(ops.resizeAt(grade(), ['second'], 0.6).root)).toBe('column@0.5(row@0.5(p1,p2),row@0.6(p3,p4))');
  });

  it('clampa em SPLIT_LIMITS: 0.05 vira 0.15 e 0.99 vira 0.85', () => {
    expect(shape(ops.resizeAt(duo(), [], 0.05).root)).toBe('row@0.15(p1,p2)');
    expect(shape(ops.resizeAt(duo(), [], 0.99).root)).toBe('row@0.85(p1,p2)');
  });

  it('caminho que não leva a uma divisão, ratio NaN ou fração igual: mesmo objeto', () => {
    const l = duo();
    expect(ops.resizeAt(l, ['first'], 0.3)).toBe(l);
    expect(ops.resizeAt(l, ['first', 'first', 'second'], 0.3)).toBe(l);
    expect(ops.resizeAt(l, [], Number.NaN)).toBe(l);
    expect(ops.resizeAt(l, [], 0.5)).toBe(l);
  });

  it('não muta a entrada (layout congelado)', () => {
    const l = deepFreeze(grade());
    expect(shape(ops.resizeAt(l, [], 0.7).root)).toBe('column@0.7(row@0.5(p1,p2),row@0.5(p3,p4))');
    expect(shape(l.root)).toBe(GRADE);
  });
});

describe('nextPaneId', () => {
  it('menor pN livre', () => {
    expect(nextPaneId(singlePaneLayout(PLAN0, 'p1'))).toBe('p2');
    expect(nextPaneId(singlePaneLayout(PLAN0, 'x'))).toBe('p1');
    expect(nextPaneId(duo())).toBe('p3');
    const l = deepFreeze({ ...duo(), root: { kind: 'split', direction: 'row', ratio: 0.5, first: leaf('p1', PLAN0), second: leaf('p3', V3D) } }) as PaneLayout;
    expect(nextPaneId(l)).toBe('p2');
  });
});

describe('close e presets com ids vindos de nextPaneId', () => {
  it('fechar e reabrir reaproveita o menor id livre', () => {
    const fechado = ops.close(duo(), 'p2');
    expect(nextPaneId(fechado)).toBe('p2');
    expect(idsOf(ops.split(fechado, 'p1', 'row', V3D, 'p2'))).toEqual(['p1', 'p2']);
  });
});
