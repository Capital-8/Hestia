import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeLevel, makeWall, ProjectStore, wallsOnLevel, type Opening, type Project } from '@hestia/model';
import { clipboardFrom, pasteAlignedToLevelsCommand } from '@hestia/tools';
import { resolveLevel } from '@hestia/engine';
import { chavesDeNivel } from '@hestia/render';

// REPRODUÇÃO (temporária): copiar paredes + porta + janela e colar alinhado em níveis.

function buildProject(): ProjectStore {
  const store = new ProjectStore({ ...createEmptyProject(), levels: [] });
  for (const [id, name, elevation] of [
    ['lv_0', 'Térreo', 0],
    ['lv_1', 'Pav. 1', 3],
    ['lv_2', 'Pav. 2', 6],
  ] as const) {
    store.exec({ type: 'upsertLevel', level: makeLevel({ id, name, elevation }) });
  }
  return store;
}

function addWall(store: ProjectStore, id: string, levelId: string, a: [number, number], b: [number, number]) {
  store.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } }) });
}

function addOpening(store: ProjectStore, id: string, kind: 'door' | 'window', typeId: string, hostId: string, offset: number) {
  const opening: Opening = { id, kind, typeId, hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  store.exec({ type: 'addOpening', opening });
}

function summary(p: Project, levelId: string) {
  const walls = wallsOnLevel(p, levelId);
  const openings = Object.values(p.elements).filter((e) => (e.kind === 'door' || e.kind === 'window') && walls.some((w) => w.id === (e as Opening).hostId));
  const res = resolveLevel(p, levelId);
  return {
    walls: walls.map((w) => w.id),
    openings: openings.map((o) => o.id),
    resolvedWalls: Object.keys(res.walls),
    clusters: res.clusters.length,
  };
}

describe('reprodução: colar alinhado parede + porta + janela', () => {
  for (const link of [false, true]) {
    it(`link=${link}`, () => {
      const store = buildProject();
      addWall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
      addWall(store, 'w2', 'lv_0', [4, 0], [4, 3]);
      addOpening(store, 'd1', 'door', 'ot_p80', 'w1', 1);
      addOpening(store, 'j1', 'window', 'ot_j120', 'w1', 3);
      addOpening(store, 'j2', 'window', 'ot_j120', 'w2', 1);

      const before = chavesDeNivel(store.project, 'x');
      const clip = clipboardFrom(store.project, ['w1', 'w2', 'd1', 'j1', 'j2']);
      expect(clip).not.toBeNull();
      const r = pasteAlignedToLevelsCommand(store.project, clip!, ['lv_1', 'lv_2'], { link });
      expect(r).not.toBeNull();
      store.exec(r!.command);
      const after = chavesDeNivel(store.project, 'x');

      const s1 = summary(store.project, 'lv_1');
      const s2 = summary(store.project, 'lv_2');
      console.log('LINK', link, 'warnings', JSON.stringify(r!.warnings));
      console.log('lv_1', JSON.stringify(s1));
      console.log('lv_2', JSON.stringify(s2));
      console.log('chave lv_1 mudou?', before.get('lv_1') !== after.get('lv_1'), 'lv_2?', before.get('lv_2') !== after.get('lv_2'));

      expect(s1.walls).toHaveLength(2);
      expect(s1.resolvedWalls).toHaveLength(2);
      expect(s1.openings).toHaveLength(3);
      expect(s2.resolvedWalls).toHaveLength(2);
      expect(before.get('lv_1')).not.toBe(after.get('lv_1'));
    });
  }
});

import { buildTemplate, type TemplateId } from '@hestia/model';

/** Varredura: copia TUDO de um nível de modelos reais e cola em outro nível; confere paredes resolvidas e alturas. */
describe('reprodução: modelos reais', () => {
  for (const tpl of ['house2', 'predio10', 'house-premium'] as TemplateId[]) {
    it(`template ${tpl}`, () => {
      const base = buildTemplate(tpl);
      const levels = [...base.levels].sort((a, b) => a.elevation - b.elevation);
      const src = levels[0]!.id;
      const dst = levels[levels.length - 1]!.id;
      if (src === dst) return;
      const store = new ProjectStore(structuredClone(base));
      const ids = Object.values(store.project.elements)
        .filter((e) => (e as { levelId?: string }).levelId === src || (e.kind === 'door' || e.kind === 'window') && (e as Opening).hostId && (store.project.elements[(e as Opening).hostId] as { levelId?: string })?.levelId === src)
        .map((e) => e.id);
      const srcWalls = wallsOnLevel(store.project, src);
      const clip = clipboardFrom(store.project, ids);
      const r = pasteAlignedToLevelsCommand(store.project, clip!, [dst]);
      store.exec(r!.command);
      const srcRes = resolveLevel(store.project, src);
      const dstRes = resolveLevel(store.project, dst);
      const dstWalls = wallsOnLevel(store.project, dst);
      const zeroH = dstWalls.filter((w) => w.kind === 'wall' && !(w.height > 0));
      console.log(tpl, 'src', src, 'walls', srcWalls.length, 'resolvidas', Object.keys(srcRes.walls).length,
        '| dst', dst, 'walls', dstWalls.length, 'resolvidas', Object.keys(dstRes.walls).length, 'alturas<=0', zeroH.length, 'warnings', JSON.stringify(r!.warnings));
      expect(Object.keys(dstRes.walls).length).toBe(dstWalls.length);
    });
  }
});

import { preparePasteLevels, previewPasteLevels } from '@hestia/tools';

/** Fluxo da interface: prévia (rascunho raso) e depois confirmação com o MESMO lote. */
describe('reprodução: prévia + confirmação', () => {
  it('a prévia não altera o projeto real e o lote confirmado é igual ao colado direto', () => {
    const build = () => {
      const s = buildProject();
      addWall(s, 'w1', 'lv_0', [0, 0], [4, 0]);
      addWall(s, 'w2', 'lv_0', [4, 0], [4, 3]);
      addOpening(s, 'd1', 'door', 'ot_p80', 'w1', 1);
      addOpening(s, 'j1', 'window', 'ot_j120', 'w1', 3);
      return s;
    };
    const direto = build();
    const clipD = clipboardFrom(direto.project, ['w1', 'w2', 'd1', 'j1'])!;
    direto.exec(pasteAlignedToLevelsCommand(direto.project, clipD, ['lv_1'])!.command);

    const store = build();
    const antes = JSON.stringify(store.project);
    const clip = clipboardFrom(store.project, ['w1', 'w2', 'd1', 'j1'])!;
    const prep = preparePasteLevels(store.project, clip, ['lv_1'])!;
    previewPasteLevels(store.project, clip, ['lv_1']);
    console.log('prévia mutou o projeto real?', JSON.stringify(store.project) !== antes);
    store.exec(prep.result.command);

    const s = summary(store.project, 'lv_1');
    const d = summary(direto.project, 'lv_1');
    console.log('confirmado', JSON.stringify(s));
    console.log('direto    ', JSON.stringify(d));
    expect(s.resolvedWalls).toHaveLength(2);
    expect(s.openings).toHaveLength(2);
    expect(JSON.stringify(store.project.levels)).toBe(JSON.stringify(direto.project.levels));
  });
});

/** Altura e cota Z resolvidas: a cópia precisa ter a mesma altura e cota = origem + diferença de elevação dos níveis. */
describe('reprodução: cotas Z das paredes coladas', () => {
  for (const tpl of ['house2', 'predio10', 'house-premium'] as TemplateId[]) {
    it(`template ${tpl}: Z das cópias`, () => {
      const base = buildTemplate(tpl);
      const lv = (id: string) => base.levels.find((l) => l.id === id)!;
      const sorted = [...base.levels].sort((a, b) => a.elevation - b.elevation);
      const src = sorted[0]!.id;
      const dst = sorted[sorted.length - 1]!.id;
      const store = new ProjectStore(structuredClone(base));
      const ids = Object.values(store.project.elements)
        .filter((e) => (e as { levelId?: string }).levelId === src || ((e.kind === 'door' || e.kind === 'window') && store.project.elements[(e as Opening).hostId] && (store.project.elements[(e as Opening).hostId] as { levelId?: string }).levelId === src))
        .map((e) => e.id);
      const clip = clipboardFrom(store.project, ids);
      store.exec(pasteAlignedToLevelsCommand(store.project, clip!, [dst])!.command);
      const rs = resolveLevel(store.project, src).walls;
      const rd = resolveLevel(store.project, dst).walls;
      const dz = lv(dst).elevation - lv(src).elevation;
      const pares = wallsOnLevel(store.project, src).map((w) => ({ w, s: rs[w.id] })).filter((x) => x.s);
      const copias = wallsOnLevel(store.project, dst);
      const problemas: string[] = [];
      // pareamento por geometria (mesmo a/b)
      for (const { w, s } of pares) {
        const c = copias.find((x) => x.kind === 'wall' && Math.abs(x.a.x - w.a.x) < 1e-9 && Math.abs(x.a.y - w.a.y) < 1e-9 && Math.abs(x.b.x - w.b.x) < 1e-9 && Math.abs(x.b.y - w.b.y) < 1e-9);
        const r = c ? rd[c.id] : undefined;
        if (!c || !r) { problemas.push(`sem par/resolvida: ${w.id}`); continue; }
        if (Math.abs(r.baseZ - (s!.baseZ + dz)) > 1e-6 || Math.abs(r.height - s!.height) > 1e-6) problemas.push(`${w.id}: base ${s!.baseZ}->${r.baseZ} (esp ${s!.baseZ + dz}), h ${s!.height}->${r.height}`);
      }
      console.log(tpl, `paredes origem=${pares.length} copias=${copias.length} problemas=${problemas.length}`, problemas.slice(0, 6).join(' | '));
      expect(problemas).toEqual([]);
    });
  }
});
