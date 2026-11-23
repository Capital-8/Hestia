import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  makeView3DView,
  view3dOf,
  view3dViewIssues,
  type Camera3D,
  type View3DView,
} from './index.ts';

const camera: Camera3D = { azimuth: 30, elevation: 20, distance: 8, target: { x: 1, y: 2, z: 3 }, ortho: false };

function vista(overrides: Partial<View3DView> = {}): View3DView {
  return { id: 'v3d_a', name: 'Corte 3D', camera, settings: view3dOf({}), ...overrides };
}

function storeComVista(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addView3d', view: vista() });
  return s;
}

describe('makeView3DView (vista 3D salva nova)', () => {
  it('usa id v3d_, nome "3D" único e a câmera e os gráficos padrão', () => {
    const v = makeView3DView({}, { id: 'v3d_nova' });
    expect(v.id).toBe('v3d_nova');
    expect(v.name).toBe('3D');
    expect(v.camera).toEqual({ azimuth: -45, elevation: 25, distance: 12, target: { x: 0, y: 0, z: 0 }, ortho: false });
    expect(v.settings).toEqual(view3dOf({}));
    expect(v.discipline).toBeUndefined();
    expect(v.tones).toBeUndefined();

    const segunda = makeView3DView({ view3dViews: [v] }, {});
    expect(segunda.name).toBe('3D (2)');
  });
});

describe('addView3d (adicionar vista 3D salva)', () => {
  it('grava a vista, desfaz e refaz; a 3D padrão continua fora da coleção', () => {
    const s = storeComVista();
    expect(s.project.view3dViews).toEqual([
      {
        id: 'v3d_a',
        name: 'Corte 3D',
        camera: { azimuth: 30, elevation: 20, distance: 8, target: { x: 1, y: 2, z: 3 }, ortho: false },
        settings: view3dOf({}),
      },
    ]);
    expect(s.project.view3d).toBeUndefined();

    s.undo();
    expect(s.project.view3dViews).toBeUndefined();

    s.redo();
    expect(s.project.view3dViews).toHaveLength(1);
    expect(s.project.view3dViews?.[0]?.name).toBe('Corte 3D');
  });
});

describe('duplicateView3d (duplicar vista 3D salva)', () => {
  it('copia câmera, gráficos e tons, com id novo e nome único; desfazer remove a cópia', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addView3d',
      view: vista({ tones: { estrutura: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } } }),
    });
    s.exec({ type: 'duplicateView3d', id: 'v3d_a' });

    const [origem, copia] = s.project.view3dViews ?? [];
    expect(copia?.id).not.toBe('v3d_a');
    expect(copia?.name).toBe('Corte 3D (2)');
    expect(copia?.camera).toEqual({ azimuth: 30, elevation: 20, distance: 8, target: { x: 1, y: 2, z: 3 }, ortho: false });
    expect(copia?.tones).toEqual({ estrutura: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } });
    expect(copia?.settings).toEqual(origem?.settings);

    s.undo();
    expect(s.project.view3dViews).toHaveLength(1);
    expect(s.project.view3dViews?.[0]?.name).toBe('Corte 3D');

    s.redo();
    expect(s.project.view3dViews).toHaveLength(2);
  });
});

describe('updateView3d (editar vista 3D salva)', () => {
  it('renomeia, troca disciplina, câmera, gráficos e tons num passo de desfazer', () => {
    const s = storeComVista();
    s.exec({
      type: 'updateView3d',
      id: 'v3d_a',
      patch: {
        name: 'Fachada Norte',
        discipline: 'estrutura',
        camera: { azimuth: 90, elevation: 10, distance: 4, target: { x: 5, y: 0, z: 2 }, ortho: true },
        settings: { ...view3dOf({}), edges: false },
        tones: { estrutura: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } },
      },
    });

    const v = s.project.view3dViews?.[0];
    expect(v?.name).toBe('Fachada Norte');
    expect(v?.discipline).toBe('estrutura');
    expect(v?.camera).toEqual({ azimuth: 90, elevation: 10, distance: 4, target: { x: 5, y: 0, z: 2 }, ortho: true });
    expect(v?.settings.edges).toBe(false);
    expect(v?.settings.sunAzimuth).toBe(324.46);
    expect(v?.tones).toEqual({ estrutura: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } });

    s.undo();
    expect(s.project.view3dViews?.[0]?.name).toBe('Corte 3D');
    expect(s.project.view3dViews?.[0]?.discipline).toBeUndefined();

    s.redo();
    expect(s.project.view3dViews?.[0]?.name).toBe('Fachada Norte');
  });
});

describe('removeView3d (excluir vista 3D salva)', () => {
  it('remove, desfaz e refaz; a 3D padrão não é removível', () => {
    const s = storeComVista();
    s.exec({ type: 'removeView3d', id: 'v3d_a' });
    expect(s.project.view3dViews).toBeUndefined();

    s.undo();
    expect(s.project.view3dViews).toHaveLength(1);

    s.redo();
    expect(s.project.view3dViews).toBeUndefined();

    expect(() => s.exec({ type: 'removeView3d', id: 'view3d' })).toThrow();
  });
});

describe('validação das vistas 3D salvas', () => {
  it('id e nome duplicados recusam sem alterar o projeto', () => {
    const s = storeComVista();
    const antes = s.project;
    expect(() => s.exec({ type: 'addView3d', view: vista({ name: 'Outra' }) })).toThrow();
    expect(s.project).toBe(antes);
    expect(() => s.exec({ type: 'addView3d', view: vista({ id: 'v3d_b' }) })).toThrow();
    expect(s.project).toBe(antes);

    s.exec({ type: 'addView3d', view: vista({ id: 'v3d_b', name: 'Fachada' }) });
    const comDuas = s.project;
    expect(() => s.exec({ type: 'updateView3d', id: 'v3d_b', patch: { name: 'Corte 3D' } })).toThrow();
    expect(s.project).toBe(comDuas);
    expect(() => s.exec({ type: 'duplicateView3d', id: 'v3d_b', newViewId: 'v3d_a' })).toThrow();
    expect(s.project).toBe(comDuas);
  });

  it('câmera inválida recusa (distância zero e alvo não finito)', () => {
    const s = storeComVista();
    const antes = s.project;
    expect(() =>
      s.exec({ type: 'addView3d', view: vista({ id: 'v3d_c', name: 'Zerada', camera: { ...camera, distance: 0 } }) }),
    ).toThrow();
    expect(s.project).toBe(antes);
    expect(() =>
      s.exec({
        type: 'addView3d',
        view: vista({ id: 'v3d_d', name: 'Infinita', camera: { ...camera, target: { x: Number.NaN, y: 0, z: 0 } } }),
      }),
    ).toThrow();
    expect(s.project).toBe(antes);
    expect(() => s.exec({ type: 'updateView3d', id: 'v3d_a', patch: { camera: { ...camera, distance: -1 } } })).toThrow();
    expect(s.project).toBe(antes);
  });

  it('view3dViewIssues fica vazio na vista válida e acusa disciplina inexistente', () => {
    const v = vista({ name: 'Fachada', discipline: 'estrutura' });
    expect(view3dViewIssues(createEmptyProject(), v, 'pt')).toEqual([]);

    const p = createEmptyProject();
    p.view3dViews = [v];
    expect(view3dViewIssues(p, p.view3dViews[0]!, 'pt')).toEqual([]);
    expect(view3dViewIssues(p, v, 'pt', 'v3d_a')).toEqual([]);

    const invalida = vista({ id: 'v3d_x', name: 'Inválida', discipline: 'nao_existe' });
    expect(view3dViewIssues(createEmptyProject(), invalida, 'pt')).toEqual(['Disciplina do projeto inexistente: nao_existe']);
  });
});
