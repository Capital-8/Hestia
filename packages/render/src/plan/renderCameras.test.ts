import type { RenderCamera } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { cenarios, entradaDe, estadoDe } from './cenariosZoom.ts';
import { planFrameUpdateOf } from './planFrame.ts';
import { buildPlanOverlay } from './planOverlay.ts';
import { renderCamerasOps } from './renderCameras.ts';
import { DARK, LIGHT } from './types.ts';

const CAM: RenderCamera = {
  id: 'rcam_1',
  name: 'Câmera 1',
  levelId: 'lv_0',
  position: { x: 2, y: 2, z: 1.5 },
  target: { x: 6, y: 4, z: 1 },
  fovDeg: 60,
  aspect: { w: 16, h: 9 },
};
const base = cenarios().find((c) => c.nome === 'completo')!;
const entrada = (cameras: RenderCamera[] = [], over = {}) => ({ ...entradaDe(base, 60), project: { ...base.project, renderCameras: cameras }, ...over });

describe('câmeras de render na planta', () => {
  it('sem câmeras, a sobreposição é a mesma de sempre (nenhuma operação extra e chave sem sufixo de câmera)', () => {
    const semLista = buildPlanOverlay(entrada([]));
    const semCampo = buildPlanOverlay(entradaDe(base, 60));
    expect(JSON.stringify(semLista)).toBe(JSON.stringify(semCampo));
    expect(renderCamerasOps(base.project, 'lv_0', null, LIGHT)).toEqual({ fills: [], strokes: [], labels: [] });
    const u = planFrameUpdateOf(estadoDe(base, { cx: 5, cy: 3.5, zoom: 60, width: 800, height: 600 }));
    expect(u.overlayKey).toBe('1|lv_0|piso|false|||');
  });

  it('com uma câmera no nível, a sobreposição ganha cone, seta, ícone e nome', () => {
    const sem = buildPlanOverlay(entrada([]));
    const com = buildPlanOverlay(entrada([CAM]));
    expect(com.fills.length - sem.fills.length).toBe(1);
    expect(com.strokes.length - sem.strokes.length).toBe(4);
    expect(com.labels.length - sem.labels.length).toBe(1);
    expect(com.labels.at(-1)?.text).toBe('Câmera 1');
  });

  it('câmera de outro nível não entra na planta', () => {
    const sem = buildPlanOverlay(entrada([]));
    const outro = buildPlanOverlay(entrada([{ ...CAM, levelId: 'lv_1' }]));
    expect(JSON.stringify(outro)).toBe(JSON.stringify(sem));
  });

  it('a câmera selecionada ganha destaque (cone mais opaco) e entra na chave da sobreposição', () => {
    const naoSel = renderCamerasOps(entrada([CAM]).project, 'lv_0', null, LIGHT);
    const sel = renderCamerasOps(entrada([CAM]).project, 'lv_0', 'rcam_1', LIGHT);
    expect(naoSel.fills[0]!.alpha).toBe(0.1);
    expect(sel.fills[0]!.alpha).toBe(0.22);
    const estado = estadoDe(base, { cx: 5, cy: 3.5, zoom: 60, width: 800, height: 600 });
    const k0 = planFrameUpdateOf({ ...estado, renderCameraSelecionada: null }).overlayKey;
    const k1 = planFrameUpdateOf({ ...estado, renderCameraSelecionada: 'rcam_1' }).overlayKey;
    expect(k1).not.toBe(k0);
    expect(k1.endsWith('|rcam_1')).toBe(true);
    expect(renderCamerasOps(entrada([CAM]).project, 'lv_0', 'rcam_1', DARK).fills).toHaveLength(1);
  });
});
