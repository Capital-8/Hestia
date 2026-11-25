import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, emptyTitleBlock, makeLevel, makePlanView, makeRoom, makeWall, sheetOf, type Sheet, type SheetViewport } from '@hestia/model';
import { buildSheetDrawList, viewportPartsCached } from './build.ts';
import { sheetCacheStats, viewportPartsKey } from './partsCache.ts';
import { planPartsOf } from './viewports.ts';

/*
 * Plantas de disciplina na prancha (decisão 0060 §6, etapa 2.4). Projeto: lv_0 (retângulo de paredes 4 x 5 m com uma sala)
 * e lv_1 (vazio). A prancha tem a planta de lv_0 a 1:100 (v1) e a de lv_1 a 1:50 (v2). O hash é o FNV-1a do JSON da lista
 * de desenho: os valores de referência foram lidos UMA vez do código anterior à etapa (sem `planId`) e congelados aqui.
 */

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/**
 * Referência da prancha antiga (sem `planId`): igual ao código de antes da etapa 2.4 em tudo menos no visual. O hash foi
 * atualizado quando a linha oculta passou a ser o visual de prancha de CAD (superfícies em papel, hachura cinza em mm de papel):
 * só mudam cores e espessuras de traço, e o comprimento do JSON continua o mesmo.
 */
const PRANCHA_ANTIGA = { hash: 'a105b633', len: 18633 };

function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  const pts = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  return s;
}

const V1 = { id: 'v1', view: { kind: 'plan', levelId: 'lv_0' }, at: { x: 20, y: 40 }, size: { w: 160, h: 200 }, scale: 100 } as const;
const V2 = { id: 'v2', view: { kind: 'plan', levelId: 'lv_1' }, at: { x: 200, y: 40 }, size: { w: 120, h: 80 }, scale: 50 } as const;

function prancha(viewports: SheetViewport[]): Sheet {
  return {
    id: 'sh1',
    number: 'A-101',
    name: 'Plantas',
    size: 'A3',
    orientation: 'landscape',
    margin: 10,
    titleBlock: { ...emptyTitleBlock(), project: 'Teste', date: '29/10/2026', revision: '0' },
    viewports,
  };
}

/** Projeto com a prancha padrão (v1 e v2, sem `planId`). */
function comPrancha(viewports: SheetViewport[] = [{ ...V1 }, { ...V2 }] as SheetViewport[]): ProjectStore {
  const s = projeto();
  s.exec({ type: 'addSheet', sheet: prancha(viewports) });
  return s;
}

const textosDaPrancha = (s: ProjectStore): string[] => buildSheetDrawList(s.project, 'sh1')!.groups.flatMap((g) => g.texts.map((t) => t.text));

describe('prancha com planta de disciplina (decisão 0060 §6)', () => {
  it('prancha antiga (sem planId) sai idêntica ao código de antes da etapa', () => {
    const list = buildSheetDrawList(comPrancha().project, 'sh1')!;
    const json = JSON.stringify(list);
    expect(fnv(json)).toBe(PRANCHA_ANTIGA.hash);
    expect(json.length).toBe(PRANCHA_ANTIGA.len);
    expect(list.groups.map((g) => [g.paths.length, g.texts.length, g.fills.length])).toEqual([
      [100, 1, 4],
      [0, 0, 0],
      [10, 9, 1],
    ]);
  });

  it('planId que não existe, ou de outro nível, sai como a planta padrão (a prancha não quebra)', () => {
    // Arquivo com `planId` pendente: o comando recusaria a vista, então a prancha entra direto no projeto da leitura.
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvL1', levelId: 'lv_1', name: 'Estrutura de lv_1', discipline: 'estrutura' }) });
    const com = (planId: string) => ({ ...s.project, sheets: [prancha([{ ...V1, view: { kind: 'plan', levelId: 'lv_0', planId } }, { ...V2 }] as SheetViewport[])] });
    expect(fnv(JSON.stringify(buildSheetDrawList(com('pv_gone'), 'sh1')!))).toBe(PRANCHA_ANTIGA.hash);
    expect(fnv(JSON.stringify(buildSheetDrawList(com('pvL1'), 'sh1')!))).toBe(PRANCHA_ANTIGA.hash);
  });

  it('planta de disciplina: a legenda leva o nome dela e a ocultação da planta tira as paredes do desenho', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura', hidden: { categories: ['wall'] } }) });
    s.exec({ type: 'addSheet', sheet: prancha([{ ...V1, view: { kind: 'plan', levelId: 'lv_0', planId: 'pv1' } }, { ...V2 }] as SheetViewport[]) });
    const list = buildSheetDrawList(s.project, 'sh1')!;
    expect(textosDaPrancha(s)).toContain('Estrutura · 1:100');
    expect(textosDaPrancha(s)).not.toContain('Térreo · 1:100');
    // Sem as paredes: a planta padrão (100 traços e 4 preenchimentos de parede) encolhe.
    expect(list.groups[0]!.paths.length).toBeLessThan(100);
    expect(list.groups[0]!.fills.length).toBeLessThan(4);
    expect(fnv(JSON.stringify(list))).not.toBe(PRANCHA_ANTIGA.hash);
  });

  it('duas plantas do mesmo nível não dividem partes: cache por planta e a padrão continua com 100 traços', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Sem paredes', discipline: 'arquitetura', hidden: { categories: ['wall'] } }) });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv2', levelId: 'lv_0', name: 'Completa', discipline: 'estrutura' }) });
    const vPadrao = { ...V1 } as SheetViewport;
    const v1 = { ...V1, view: { kind: 'plan', levelId: 'lv_0', planId: 'pv1' } } as SheetViewport;
    const v2 = { ...V1, view: { kind: 'plan', levelId: 'lv_0', planId: 'pv2' } } as SheetViewport;
    expect(viewportPartsKey(v1, 'pt')).not.toBe(viewportPartsKey(v2, 'pt'));
    expect(viewportPartsKey(v2, 'pt')).not.toBe(viewportPartsKey(vPadrao, 'pt'));
    sheetCacheStats.clear();
    const parteDaPadrao = viewportPartsCached(s.project, vPadrao, 'pt').parts;
    const parteSemParede = viewportPartsCached(s.project, v1, 'pt').parts;
    const parteCompleta = viewportPartsCached(s.project, v2, 'pt').parts;
    expect(parteDaPadrao.paths).toHaveLength(100);
    expect(parteCompleta.paths).toHaveLength(100);
    expect(parteSemParede.paths.length).toBeLessThan(100);
    expect(parteSemParede).not.toBe(parteCompleta);
    // Segunda passada: tudo acerto de cache, cada planta com o próprio desenho.
    const antes = sheetCacheStats.parts().hits;
    expect(viewportPartsCached(s.project, v1, 'pt').parts).toBe(parteSemParede);
    expect(viewportPartsCached(s.project, v2, 'pt').parts).toBe(parteCompleta);
    expect(sheetCacheStats.parts().hits).toBe(antes + 2);
  });

  it('a escala da planta de disciplina vai para a cópia dela: o projeto (nível e planta) não muda', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) });
    s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 50 } });
    const antes = JSON.stringify(s.project);
    const p = planPartsOf(s.project, 'lv_0', { ...V1 } as SheetViewport, 'pt', 'pv1');
    expect(p.paths.length).toBeGreaterThan(0);
    expect(JSON.stringify(s.project)).toBe(antes);
    expect(s.project.levels.find((l) => l.id === 'lv_0')?.graphics).toBeUndefined();
    expect(s.project.planViews![0]!.graphics!.scale).toBe(50);
  });

  it('remover a planta de disciplina tira a vista da prancha num passo, e o desfazer a devolve', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) });
    s.exec({ type: 'addSheet', sheet: prancha([{ ...V1, view: { kind: 'plan', levelId: 'lv_0', planId: 'pv1' } }, { ...V2 }] as SheetViewport[]) });
    expect(sheetOf(s.project, 'sh1')!.viewports.map((v) => v.id)).toEqual(['v1', 'v2']);
    s.exec({ type: 'removePlanView', id: 'pv1' });
    expect(s.project.planViews).toBeUndefined();
    expect(sheetOf(s.project, 'sh1')!.viewports.map((v) => v.id)).toEqual(['v2']);
    s.undo();
    expect(sheetOf(s.project, 'sh1')!.viewports.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(s.project.planViews![0]!.id).toBe('pv1');
  });
});
