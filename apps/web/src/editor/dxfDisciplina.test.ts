import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { buildDxfBatch, dxfBatchTargetsOf } from './dxfBatch.ts';
import type { DxfBatchOptions, DxfBatchRenderers } from './dxfBatch.types.ts';
import { dxfLayerTableOf } from './dxfExport.ts';
import { layerTargetOf } from './dxfExportDialogModel.ts';

/*
 * Plantas de disciplina no lote DXF (decisão 0060 §7, etapa 4.3): alvos `pv:` na lista, a escala e os pesos da própria
 * planta no manifest e na tabela de camadas, e as anotações dela. Projeto: lv_0 com uma parede; pv_est (Estrutura) na
 * escala 1:50, contra 1:100 da planta padrão.
 */

function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, height: 3 }) });
  s.exec({ type: 'addPlanView', plan: { id: 'pv_est', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' } });
  s.exec({ type: 'setPlanGraphics', planId: 'pv_est', patch: { scale: 50 } });
  return s;
}

const opcoes = (extra: Partial<DxfBatchOptions> = {}): DxfBatchOptions => ({ units: 'mm', showRoofProjection: true, prefix: 'Casa', pattern: '{tipo}-{nome}', lang: 'pt', ...extra });

describe('lista de alvos do lote DXF', () => {
  it('traz a planta de disciplina logo depois da padrão do nível, com a chave pv: e o grupo plantas', () => {
    const alvos = dxfBatchTargetsOf(projeto().project);
    expect(alvos.map((a) => a.key)).toEqual(['plan:lv_0', 'pv:pv_est', 'plan:lv_1']);
    expect(alvos.map((a) => a.group)).toEqual(['plantas', 'plantas', 'plantas']);
    expect(alvos[1]).toEqual({ kind: 'plan', key: 'pv:pv_est', levelId: 'lv_0', planId: 'pv_est', label: 'Estrutura', group: 'plantas' });
  });

  it('sem plantas de disciplina, a lista é a de antes', () => {
    const alvos = dxfBatchTargetsOf(new ProjectStore(createEmptyProject()).project);
    expect(alvos.map((a) => a.key)).toEqual(['plan:lv_0', 'plan:lv_1']);
  });

  it('exportar a planta de disciplina entrega o planId ao renderizador e a escala dela no manifest', () => {
    const chamadas: string[] = [];
    const renderizadores: DxfBatchRenderers = {
      plan: (_p, levelId, _o, planId) => {
        chamadas.push(`plan:${levelId}:${planId ?? '-'}`);
        return '0\r\nEOF\r\n';
      },
      area: () => '0\r\nEOF\r\n',
      section: () => '0\r\nEOF\r\n',
      sheet: () => '0\r\nEOF\r\n',
    };
    const lote = buildDxfBatch(projeto().project, ['plan:lv_0', 'pv:pv_est'], opcoes(), renderizadores);
    expect(chamadas).toEqual(['plan:lv_0:-', 'plan:lv_0:pv_est']);
    const linhas = lote.manifest.split('\r\n');
    expect(linhas[1]).toContain('1:100');
    expect(linhas[2]).toContain('1:50');
    expect(linhas[2]).toContain('Estrutura');
    expect(linhas[2]).toContain('Térreo');
  });
});

describe('tabela de camadas do diálogo DXF', () => {
  it('o alvo da tabela leva o planId da planta de disciplina (e o da padrão não tem)', () => {
    const alvos = dxfBatchTargetsOf(projeto().project);
    expect(layerTargetOf(alvos[0]!, true)).toEqual({ kind: 'plan', levelId: 'lv_0', showRoofProjection: true, planId: undefined });
    expect(layerTargetOf(alvos[1]!, true)).toEqual({ kind: 'plan', levelId: 'lv_0', showRoofProjection: true, planId: 'pv_est' });
    expect(layerTargetOf(null, true)).toBeNull();
  });

  it('os pesos são os da própria planta: a parede sai com 70 (1:50) e não com 50 (1:100)', () => {
    const p = projeto().project;
    const daPadrao = dxfLayerTableOf(p, { kind: 'plan', levelId: 'lv_0' });
    const daDisciplina = dxfLayerTableOf(p, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' });
    const parede = (rows: typeof daPadrao): number[] => rows.filter((r) => r.name.startsWith('PAREDE_')).map((r) => r.style.lineWeight);
    expect(parede(daPadrao)).toEqual([50, 50, 50, 50]);
    expect(parede(daDisciplina)).toEqual([70, 70, 70, 70]);
  });
});
