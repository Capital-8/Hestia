import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, cameraDaVista3D, createEmptyProject, emptyTitleBlock, projectView3DPoints, view3DPointOf, type Sheet, type SheetView3DCamera } from '@hestia/model';
import { OrbitCamera } from '@hestia/render';
import { editor } from './controller.ts';
import { resolveText } from './i18n.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';
import { consumirCameraPendente, registrarOrbita3D, temVista3DAoVivo } from './vista3dAoVivo.ts';
import { atualizarPonto3DAction, excluirPonto3DAction, irParaPonto3DAction, renomearPonto3DAction, salvarPonto3DAction } from './view3dPointActions.ts';

/** Órbita viva de mentira: a tela real registra a dela, o teste configura os campos que o retrato lê. */
function orbita(over: Partial<SheetView3DCamera> = {}): OrbitCamera {
  const o = new OrbitCamera();
  const c: SheetView3DCamera = { azimuth: -0.7, elevation: 0.45, distance: 18, target: { x: 2, y: 3, z: 1.5 }, ortho: false, ...over };
  o.azimuth = c.azimuth;
  o.elevation = c.elevation;
  o.distance = c.distance;
  o.target.set(c.target.x, c.target.y, c.target.z);
  o.ortho = c.ortho;
  o.apply();
  return o;
}

const CAM = (over: Partial<SheetView3DCamera> = {}): SheetView3DCamera => ({ azimuth: -0.7, elevation: 0.45, distance: 18, target: { x: 2, y: 3, z: 1.5 }, ortho: false, ...over });

const sheet = (id: string, viewports: Sheet['viewports'] = []): Sheet => ({
  id,
  number: 'A-101',
  name: '3D',
  size: 'A3',
  orientation: 'landscape',
  margin: 10,
  titleBlock: emptyTitleBlock(),
  viewports,
});

/** Prancha com uma vista 3D que usa o ponto. */
function pranchaComPonto(pontoId: string): Sheet {
  return sheet('sh1', [{ id: 'v1', view: { kind: '3d', pointId: pontoId }, at: { x: 20, y: 20 }, size: { w: 180, h: 130 }, scale: 100 }]);
}

beforeEach(() => {
  useUi.setState({ options: DEFAULT_OPTIONS });
  editor.setTool('select');
  consumirCameraPendente();
  registrarOrbita3D(orbita());
});

describe('salvar ponto de vista 3D', () => {
  it('salva a câmera viva com o nome padrão e desfaz', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = salvarPonto3DAction(s);
    expect('id' in r).toBe(true);
    const ponto = 'id' in r ? view3DPointOf(s.project, r.id) : undefined;
    expect(ponto?.name).toBe('Vista 3D');
    expect(ponto?.camera).toEqual(CAM());
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Salvar ponto de vista 3D');

    const outro = salvarPonto3DAction(s);
    expect('id' in outro && view3DPointOf(s.project, outro.id)?.name).toBe('Vista 3D 2');

    s.undo();
    expect(projectView3DPoints(s.project)).toHaveLength(1);
    expect(projectView3DPoints(s.project)[0]?.name).toBe('Vista 3D');
  });

  it('usa o nome dado e recusa nome vazio sem gravar', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = salvarPonto3DAction(s, 'Fachada norte');
    expect('id' in r && view3DPointOf(s.project, r.id)?.name).toBe('Fachada norte');
    const antes = s.undoLabel;
    const vazio = salvarPonto3DAction(s, '   ');
    expect(vazio).toEqual({ erro: 'O nome do ponto de vista não pode ficar vazio.' });
    expect(s.undoLabel).toBe(antes);
  });

  it('sem vista 3D viva, recusa em pt-BR e nada muda', () => {
    registrarOrbita3D(null);
    const s = new ProjectStore(createEmptyProject());
    expect(temVista3DAoVivo()).toBe(false);
    expect(salvarPonto3DAction(s)).toEqual({ erro: 'A vista 3D não está aberta. Abra o Modelo 3D para usar a câmera atual.' });
    expect(projectView3DPoints(s.project)).toHaveLength(0);
  });
});

describe('atualizar ponto de vista 3D', () => {
  it('grava a câmera viva no ponto, a prancha acompanha e o desfazer volta', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = salvarPonto3DAction(s);
    const id = 'id' in r ? r.id : '';
    s.exec({ type: 'addSheet', sheet: pranchaComPonto(id) });

    registrarOrbita3D(orbita(CAM({ azimuth: 1.2, elevation: 0.1, distance: 9, target: { x: 0, y: 0, z: 2 }, ortho: true })));
    expect(atualizarPonto3DAction(s, id)).toBeNull();
    expect(view3DPointOf(s.project, id)?.camera).toEqual(CAM({ azimuth: 1.2, elevation: 0.1, distance: 9, target: { x: 0, y: 0, z: 2 }, ortho: true }));
    const vp = s.project.sheets?.[0]?.viewports[0];
    expect(vp && cameraDaVista3D(s.project, vp.view as Extract<typeof vp.view, { kind: '3d' }>)).toEqual(view3DPointOf(s.project, id)?.camera);

    s.undo();
    expect(view3DPointOf(s.project, id)?.camera).toEqual(CAM());
  });

  it('recusa ponto inexistente e vista 3D fechada', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(atualizarPonto3DAction(s, 'nao_existe')).toBe('Ponto de vista 3D inexistente.');
    const r = salvarPonto3DAction(s);
    const id = 'id' in r ? r.id : '';
    registrarOrbita3D(null);
    expect(atualizarPonto3DAction(s, id)).toBe('A vista 3D não está aberta. Abra o Modelo 3D para usar a câmera atual.');
  });
});

describe('renomear ponto de vista 3D', () => {
  it('troca o nome (aparado) e desfaz; nome vazio é recusado', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = salvarPonto3DAction(s);
    const id = 'id' in r ? r.id : '';
    expect(renomearPonto3DAction(s, id, '  Perspectiva sudoeste  ')).toBeNull();
    expect(view3DPointOf(s.project, id)?.name).toBe('Perspectiva sudoeste');
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Renomear ponto de vista 3D');
    s.undo();
    expect(view3DPointOf(s.project, id)?.name).toBe('Vista 3D');

    expect(renomearPonto3DAction(s, id, '  ')).toBe('O nome do ponto de vista não pode ficar vazio.');
    expect(renomearPonto3DAction(s, 'nao_existe', 'X')).toBe('Ponto de vista 3D inexistente.');
  });
});

describe('excluir ponto de vista 3D', () => {
  it('remove do catálogo e copia a câmera para a prancha que o usava; o desfazer restaura', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = salvarPonto3DAction(s);
    const id = 'id' in r ? r.id : '';
    s.exec({ type: 'addSheet', sheet: pranchaComPonto(id) });

    expect(excluirPonto3DAction(s, id)).toBeNull();
    expect(view3DPointOf(s.project, id)).toBeUndefined();
    const view = s.project.sheets?.[0]?.viewports[0]?.view;
    expect(view).toEqual({ kind: '3d', camera: CAM() });

    s.undo();
    expect(view3DPointOf(s.project, id)?.name).toBe('Vista 3D');
    expect(s.project.sheets?.[0]?.viewports[0]?.view).toEqual({ kind: '3d', pointId: id });
    expect(excluirPonto3DAction(s, 'nao_existe')).toBe('Ponto de vista 3D inexistente.');
  });
});

describe('ir para o ponto de vista 3D', () => {
  it('abre a aba 3D e deixa a câmera pendente (uma vez só)', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = salvarPonto3DAction(s);
    const id = 'id' in r ? r.id : '';
    expect(consumirCameraPendente()).toBeNull();

    expect(irParaPonto3DAction(id, s)).toBeNull();
    expect(useUi.getState().view).toBe('3d');
    expect(useUi.getState().openViews).toContainEqual({ kind: '3d' });
    expect(consumirCameraPendente()).toEqual(CAM());
    expect(consumirCameraPendente()).toBeNull();
  });

  it('ponto inexistente é recusado sem abrir a vista 3D', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(irParaPonto3DAction('nao_existe', s)).toBe('Ponto de vista 3D inexistente.');
    expect(consumirCameraPendente()).toBeNull();
  });

  it('com o modo de perímetro aberto o pedido é descartado (não fica câmera pendente)', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = salvarPonto3DAction(s);
    const id = 'id' in r ? r.id : '';
    editor.setTool('floor');
    expect(irParaPonto3DAction(id, s)).toBeNull();
    expect(consumirCameraPendente()).toBeNull();
  });
});
