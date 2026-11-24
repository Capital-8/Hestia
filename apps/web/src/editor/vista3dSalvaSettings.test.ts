import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_3D, ProjectStore, buildTemplate, makeView3DView, view3dOf, view3dViewOf, type CategoryOverride, type GraphicsCategory, type Project, type View3DSettings } from '@hestia/model';
import { OrbitCamera } from '@hestia/render';
import { editView3dAtual, restoreView3DDefaultAtual } from './graphicsActions.ts';
import { projetoDoPainel } from './paneStyle.ts';
import { useUi } from './state.ts';
import { novaVista3dAction } from './vista3dSalvaAcoes.ts';
import { registrarOrbita3D } from './vista3dAoVivo.ts';
import { view3dSettingsOf } from './vista3dSalva.ts';
import { visibilityOf } from './viewVisibility.ts';

/**
 * Settings por vista 3D (correção da fiação das vistas salvas): a leitura e a escrita usam a vista ativa, não sempre o
 * 3D padrão. Valores literais da cena e dos overrides.
 */

const base = (): View3DSettings => view3dOf({});

type SettingsPatch = Omit<Partial<View3DSettings>, 'overrides'> & { overrides?: Partial<Record<GraphicsCategory, Partial<CategoryOverride>>> };

const settings = (patch: SettingsPatch = {}): View3DSettings => {
  const b = base();
  const { overrides: overridesPatch, ...rest } = patch;
  const overrides: View3DSettings['overrides'] = { ...b.overrides };
  for (const [c, o] of Object.entries(overridesPatch ?? {}) as Array<[GraphicsCategory, Partial<CategoryOverride>]>) {
    overrides[c] = { ...overrides[c], ...o };
  }
  return { ...b, ...rest, overrides };
};

/** Projeto real com o 3D padrão e duas vistas salvas de estilos, sombras e transparências diferentes. */
function comDuasVistas(): Project {
  const p = structuredClone(buildTemplate('house2'));
  const b = base();
  p.view3d = settings({
    style: 'shaded',
    shadows: true,
    edges: true,
    overrides: { wall: { ...b.overrides.wall, transparency: 0.1 } },
  });
  p.view3dViews = [
    makeView3DView(p, {
      id: 'v3d_a',
      name: 'A',
      settings: settings({
        style: 'wireframe',
        shadows: false,
        edges: true,
        overrides: { wall: { ...b.overrides.wall, transparency: 0.6 } },
      }),
    }),
    makeView3DView(p, {
      id: 'v3d_b',
      name: 'B',
      settings: settings({
        style: 'realistic',
        shadows: true,
        edges: true,
        overrides: { wall: { ...b.overrides.wall, transparency: 0.2 } },
      }),
    }),
  ];
  return p;
}

afterEach(() => {
  registrarOrbita3D(null);
  useUi.setState({ view: 'plan', view3dViewId: null, minhaDisciplina: null, viewTemp: {} });
});

describe('view3dSettingsOf', () => {
  it('sem id devolve o 3D padrão; com id, os settings da vista salva', () => {
    const p = comDuasVistas();
    expect(view3dSettingsOf(p, null)).toEqual(view3dOf(p));
    expect(view3dSettingsOf(p, undefined)).toEqual(view3dOf(p));
    expect(view3dSettingsOf(p, 'v3d_a').style).toBe('wireframe');
    expect(view3dSettingsOf(p, 'v3d_a').shadows).toBe(false);
    expect(view3dSettingsOf(p, 'v3d_b').style).toBe('realistic');
    expect(view3dSettingsOf(p, 'v3d_b').overrides.wall.transparency).toBe(0.2);
    expect(view3dSettingsOf(p, 'nao_existe')).toEqual(view3dOf(p));
  });

  it('a disciplina do topo da vista salva entra nos settings efetivos', () => {
    const p = comDuasVistas();
    p.view3dViews![0] = makeView3DView(p, { id: 'v3d_a', name: 'A', discipline: 'estrutura', settings: settings({ style: 'wireframe' }) });
    expect(view3dSettingsOf(p, 'v3d_a').discipline).toBe('estrutura');
    expect(view3dSettingsOf(p, 'v3d_b').discipline).toBeUndefined();
  });
});

describe('projetoDoPainel na vista 3D salva', () => {
  it('parte dos settings da vista e deixa o estilo do painel vencer por cima', () => {
    const p = comDuasVistas();
    const a = projetoDoPainel(p, {}, { kind: '3d', viewId: 'v3d_a' });
    expect(view3dOf(a).style).toBe('wireframe');
    expect(view3dOf(a).overrides.wall.transparency).toBe(0.6);
    expect(view3dOf(p).style).toBe('shaded');
    expect(view3dOf(projetoDoPainel(p, {}, { kind: '3d', viewId: 'v3d_b' })).style).toBe('realistic');
    expect(view3dOf(projetoDoPainel(p, { style: 'shaded' }, { kind: '3d', viewId: 'v3d_a' })).style).toBe('shaded');
    expect(projetoDoPainel(p, {}, { kind: '3d' })).toBe(p);
  });
});

describe('editView3dAtual', () => {
  it('sem id grava no 3D padrão e não toca nas vistas salvas', () => {
    const p = comDuasVistas();
    const s = new ProjectStore(p);
    expect(editView3dAtual(s, null, { style: 'hiddenLine' })).toEqual({ ok: true, error: null });
    expect(view3dOf(s.project).style).toBe('hiddenLine');
    expect(view3dViewOf(s.project, 'v3d_a')?.settings.style).toBe('wireframe');
    expect(view3dViewOf(s.project, 'v3d_b')?.settings.style).toBe('realistic');
    s.undo();
    expect(view3dOf(s.project).style).toBe('shaded');
  });

  it('com id grava na vista salva e NÃO no padrão nem na outra; desfazer restaura', () => {
    const p = comDuasVistas();
    const s = new ProjectStore(p);
    expect(editView3dAtual(s, 'v3d_a', { edges: false, overrides: { wall: { transparency: 0.3 } } })).toEqual({ ok: true, error: null });
    expect(view3dSettingsOf(s.project, 'v3d_a').edges).toBe(false);
    expect(view3dSettingsOf(s.project, 'v3d_a').overrides.wall.transparency).toBe(0.3);
    expect(view3dOf(s.project).edges).toBe(true);
    expect(view3dOf(s.project).overrides.wall.transparency).toBe(0.1);
    expect(view3dSettingsOf(s.project, 'v3d_b').edges).toBe(true);
    expect(view3dSettingsOf(s.project, 'v3d_b').overrides.wall.transparency).toBe(0.2);
    expect(view3dSettingsOf(s.project, 'v3d_a')).not.toEqual(view3dSettingsOf(s.project, 'v3d_b'));
    s.undo();
    expect(view3dSettingsOf(s.project, 'v3d_a').edges).toBe(true);
    expect(view3dSettingsOf(s.project, 'v3d_a').overrides.wall.transparency).toBe(0.6);
  });

  it('a disciplina editada grava no campo do topo da vista salva', () => {
    const p = comDuasVistas();
    const s = new ProjectStore(p);
    expect(editView3dAtual(s, 'v3d_a', { discipline: 'estrutura' })).toEqual({ ok: true, error: null });
    expect(view3dViewOf(s.project, 'v3d_a')?.discipline).toBe('estrutura');
    expect(view3dSettingsOf(s.project, 'v3d_a').discipline).toBe('estrutura');
    expect(view3dOf(s.project).discipline).toBeUndefined();
    s.undo();
    expect(view3dViewOf(s.project, 'v3d_a')?.discipline).toBeUndefined();
  });
});

describe('restoreView3DDefaultAtual', () => {
  it('na vista salva volta aos settings padrão sem tocar na outra nem no 3D padrão', () => {
    const p = comDuasVistas();
    const s = new ProjectStore(p);
    editView3dAtual(s, 'v3d_a', { background: '#101010', discipline: 'estrutura', overrides: { wall: { transparency: 0.4 } } });
    expect(restoreView3DDefaultAtual(s, 'v3d_a')).toEqual({ ok: true, error: null });
    expect(view3dSettingsOf(s.project, 'v3d_a')).toEqual(DEFAULT_VIEW_3D);
    expect(view3dViewOf(s.project, 'v3d_a')?.discipline).toBeUndefined();
    expect(view3dSettingsOf(s.project, 'v3d_b').style).toBe('realistic');
    expect(view3dOf(s.project)).toMatchObject({ style: 'shaded', background: null });
    s.undo();
    expect(view3dSettingsOf(s.project, 'v3d_a').background).toBe('#101010');
  });
});

describe('nova vista 3D', () => {
  it('copia os settings efetivos da vista atual (salva), não os do 3D padrão', () => {
    const p = comDuasVistas();
    const s = new ProjectStore(p);
    registrarOrbita3D(new OrbitCamera());
    useUi.setState({ view: '3d', view3dViewId: 'v3d_b' });
    const r = novaVista3dAction(s);
    expect('id' in r).toBe(true);
    const id = 'id' in r ? r.id : '';
    expect(view3dSettingsOf(s.project, id).style).toBe('realistic');
    expect(view3dSettingsOf(s.project, id).edges).toBe(true);
    expect(view3dSettingsOf(s.project, id).overrides.wall.transparency).toBe(0.2);
    expect(view3dSettingsOf(s.project, id)).not.toEqual(view3dOf(s.project));
  });
});

describe('visibilityOf na vista 3D salva', () => {
  it('usa a disciplina da vista salva e o desvio de apresentação dela, não os do 3D padrão', () => {
    const p = comDuasVistas();
    p.view3d = settings({ discipline: 'arquitetura' });
    p.view3dViews = [
      makeView3DView(p, {
        id: 'v3d_est',
        name: 'Estrutura',
        discipline: 'estrutura',
        settings: settings({ style: 'wireframe', overrides: { wall: { ...base().overrides.wall, transparency: 0.7 } } }),
        tones: { arquitetura: { tone: 'normal', clareamento: 0.3, opacidade: 0.7 } },
      }),
      makeView3DView(p, { id: 'v3d_livre', name: 'Livre' }),
    ];
    useUi.setState({ view: '3d', view3dViewId: 'v3d_est', minhaDisciplina: null });
    const vis = visibilityOf(p, useUi.getState());
    expect(vis.apresentacoes.wall).toEqual({ tone: 'normal', clareamento: 0.3, opacidade: 0.7 });
    expect(vis.toneCategories.wall).toBe('normal');
    expect(view3dSettingsOf(p, 'v3d_est').overrides.wall.transparency).toBe(0.7);
    // A outra vista (sem disciplina) continua mostrando todas as disciplinas.
    useUi.setState({ view: '3d', view3dViewId: 'v3d_livre' });
    expect(visibilityOf(p, useUi.getState()).apresentacoes).toEqual({});
  });
});
