import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno, projetoTerreno, resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, type Id, type Project } from '@hestia/model';
import { buildPlanLiveOverlay, buildPlanOverlay } from './planOverlay.ts';
import { janelaDaVista, terrenoEdicaoOps, type PlanInputComEdicao } from './terrenoEdicaoOverlay.ts';
import { LIGHT } from './types.ts';

function entrada(p: Project, over: Partial<PlanInputComEdicao> = {}, levelId: Id = 'lv_0'): PlanInputComEdicao {
  return {
    project: p, levelId, resolved: resolveLevel(p, levelId, new Map()), below: null, viewport: { cx: 10, cy: 10, zoom: 20, width: 800, height: 600 },
    theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false, ...over,
  };
}

describe('overlay do modo Editar terreno', () => {
  it('desligado (sem o campo) não desenha nada, nem na camada viva nem na completa', () => {
    const p = projetoTerreno('T3');
    expect(terrenoEdicaoOps(entrada(p))).toEqual({ fills: [], strokes: [], labels: [] });
    expect(terrenoEdicaoOps(entrada(p, { terrenoEdicao: null }))).toEqual({ fills: [], strokes: [], labels: [] });
    expect(buildPlanLiveOverlay(entrada(p)).fills).toHaveLength(0);
  });

  it('liga: uma alça quadrada (preenchimento e contorno) por ponto das fontes', () => {
    const p = projetoTerreno('T3');
    const o = terrenoEdicaoOps(entrada(p, { terrenoEdicao: { terrenoId: 'tn_t3' } }));
    expect(o.fills).toHaveLength(5);
    expect(o.strokes).toHaveLength(5);
    expect(o.labels).toEqual([]);
  });

  it('o item escolhido ganha alça maior e cheia; só ele', () => {
    const p = projetoTerreno('T3');
    const o = terrenoEdicaoOps(entrada(p, { terrenoEdicao: { terrenoId: 'tn_t3', selecionado: { tipo: 'ponto', i: 4 } } }));
    expect(o.fills).toHaveLength(5);
    const cheias = o.fills.filter((f) => f.color === LIGHT.select);
    expect(cheias).toHaveLength(1);
    expect(o.fills.filter((f) => f.color === '#ffffff')).toHaveLength(4);
    expect(o.fills.at(-1)).toBe(cheias[0]);
  });

  it('rótulo escolhido: traço grosso sobre a linha; ponto cotado escolhido: alça cheia', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T3');
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t3', ops: [{ op: 'setLinhasRotulo', v: [2, 10, 18, 10] }, { op: 'setPontosCotados', v: [5, 3] }] });
    const r = terrenoEdicaoOps(entrada(s.project, { terrenoEdicao: { terrenoId: 'tn_t3', selecionado: { tipo: 'rotulo', i: 0 } } }));
    expect(r.strokes.at(-1)).toMatchObject({ pts: [{ x: 2, y: 10 }, { x: 18, y: 10 }], widthPx: 3, closed: false });
    const c = terrenoEdicaoOps(entrada(s.project, { terrenoEdicao: { terrenoId: 'tn_t3', selecionado: { tipo: 'cotado', i: 0 } } }));
    expect(c.fills.filter((f) => f.color === LIGHT.select)).toHaveLength(1);
  });

  it('mais de 500 vértices na janela: nenhuma alça e a mensagem recebida no centro da vista', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T1');
    const pontos: number[] = [];
    for (let k = 0; k < 600; k++) pontos.push(k % 30, Math.floor(k / 30), 1);
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t1', ops: [{ op: 'substituirFontes', pontos, curvas: [], quebras: [] }] });
    const o = terrenoEdicaoOps(entrada(s.project, { terrenoEdicao: { terrenoId: 'tn_t1', mensagem: 'aproxime para editar pontos' } }));
    expect(o.fills).toHaveLength(0);
    expect(o.strokes).toHaveLength(0);
    expect(o.labels).toEqual([{ at: { x: 10, y: 10 }, text: 'aproxime para editar pontos', tone: 'accent' }]);
    // Aproximando (janela de 4 x 3 m em torno de (3, 3)) as alças voltam, sem mensagem.
    const perto = terrenoEdicaoOps(entrada(s.project, { viewport: { cx: 3, cy: 3, zoom: 100, width: 400, height: 300 }, terrenoEdicao: { terrenoId: 'tn_t1', mensagem: 'x' } }));
    expect(perto.labels).toEqual([]);
    expect(perto.fills.length).toBeGreaterThan(0);
    expect(perto.fills.length).toBeLessThanOrEqual(500);
  });

  it('terreno inexistente, de outro nível ou oculto não desenha', () => {
    const p = projetoTerreno('T3');
    expect(terrenoEdicaoOps(entrada(p, { terrenoEdicao: { terrenoId: 'nao_existe' } })).fills).toHaveLength(0);
    expect(terrenoEdicaoOps(entrada(p, { terrenoEdicao: { terrenoId: 'tn_t3' }, hidden: new Set(['tn_t3']) })).fills).toHaveLength(0);
    expect(terrenoEdicaoOps(entrada(p, { terrenoEdicao: { terrenoId: 'tn_t3' } }, 'lv_9')).fills).toHaveLength(0);
  });

  it('o encaixe: as camadas viva e completa da planta trazem as alças', () => {
    const p = projetoTerreno('T3');
    const i = entrada(p, { terrenoEdicao: { terrenoId: 'tn_t3' } });
    expect(buildPlanLiveOverlay(i).fills).toHaveLength(5);
    expect(buildPlanOverlay(i).fills.length).toBeGreaterThanOrEqual(5);
  });

  it('janelaDaVista: os limites do mundo que a vista mostra', () => {
    expect(janelaDaVista({ cx: 10, cy: 10, zoom: 20, width: 800, height: 600 })).toEqual({ min: { x: -10, y: -5 }, max: { x: 30, y: 25 } });
  });
});
