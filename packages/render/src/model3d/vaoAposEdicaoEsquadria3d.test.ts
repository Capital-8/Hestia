import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeLevel, makeWall, type Command, type Opening, type Project } from '@hestia/model';
import { ModelScene, type Scene3DOptions } from './scene3d.ts';

const OPT: Scene3DOptions = { edges: false, shadows: false, dark: false };

const abertura = (id: string, kind: 'door' | 'window', typeId: string, hostId: string, offset: number): Opening => ({
  id, kind, typeId, hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '',
});

/** Parede + porta (+ janela) no pavimento 1; prefixo `iot_` imita o projeto importado (ids e tipos). */
function projeto(pre: string): Project {
  const s = new ProjectStore(createEmptyProject('vao'));
  const base = createEmptyProject('x');
  const clona = (de: string, para: string): void => {
    const t = base.openingTypes[de]!;
    s.exec({ type: 'upsertOpeningType', openingType: { ...t, id: para } } as unknown as Command);
  };
  const tp = pre ? `${pre}p80` : 'ot_p80';
  const tj = pre ? `${pre}j120` : 'ot_j120';
  const tj2 = pre ? `${pre}j150` : 'ot_j150';
  if (pre) {
    clona('ot_p80', tp);
    clona('ot_j120', tj);
    clona('ot_j150', tj2);
  }
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'P2', elevation: 3 }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: `${pre}w0`, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: `${pre}w1`, typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: abertura(`${pre}d1`, 'door', tp, `${pre}w1`, 1) });
  s.exec({ type: 'addOpening', opening: abertura(`${pre}j1`, 'window', tj, `${pre}w1`, 4) });
  return s.project;
}

const niveis = (p: Project) => p.levels.map((l) => resolveLevel(p, l.id));
const edita = (p: Project, c: Command): Project => {
  const s = new ProjectStore(p);
  s.exec(c);
  return s.project;
};
function tris(ms: ModelScene): string[] {
  const v = ms.exportarVetores().trianglePositions;
  const r = (x: number): string => (Math.round(x * 1e4) / 1e4).toFixed(4);
  const out: string[] = [];
  for (let i = 0; i < v.length; i += 9) out.push([0, 3, 6].map((k) => `${r(v[i + k]!)},${r(v[i + k + 1]!)},${r(v[i + k + 2]!)}`).sort().join(' '));
  return out.sort();
}
const fresca = (p: Project): string[] => {
  const m = new ModelScene();
  m.update(p, niveis(p), OPT);
  const t = tris(m);
  m.dispose();
  return t;
};

for (const pre of ['', 'iot_']) {
  describe(`vão acompanha a edição da esquadria (ids ${pre || 'padrão'})`, () => {
    const edicoes: Array<[string, (p: Project) => Command]> = [
      ['apagar porta', () => ({ type: 'deleteElements', ids: [`${pre}d1`] })],
      ['apagar janela', () => ({ type: 'deleteElements', ids: [`${pre}j1`] })],
      ['mover porta', () => ({ type: 'updateElements', ids: [`${pre}d1`], patch: { offset: 2.5 } })],
      ['trocar tipo da janela', () => ({ type: 'updateElements', ids: [`${pre}j1`], patch: { typeId: pre ? `${pre}j150` : 'ot_j150' } })],
    ];
    for (const [nome, mk] of edicoes) {
      it(`${nome}: update completo na mesma cena refaz a parede`, () => {
        const p0 = projeto(pre);
        const p1 = edita(p0, mk(p0));
        const cena = new ModelScene();
        cena.update(p0, niveis(p0), OPT);
        const antes = tris(cena);
        cena.update(p1, niveis(p1), OPT);
        expect(tris(cena)).not.toEqual(antes);
        expect(tris(cena)).toEqual(fresca(p1));
        // desfazer
        cena.update(p0, niveis(p0), OPT);
        expect(tris(cena)).toEqual(antes);
        cena.dispose();
      });
      it(`${nome}: caminho rápido (atualizarAberturas) refaz a parede`, () => {
        const p0 = projeto(pre);
        const p1 = edita(p0, mk(p0));
        const cena = new ModelScene();
        cena.update(p0, niveis(p0), OPT);
        const antes = tris(cena);
        const ok = cena.atualizarAberturas(p1, p0, 'lv_1', [`${pre}w1`], resolveLevel(p1, 'lv_1'), OPT);
        if (ok) {
          expect(tris(cena)).not.toEqual(antes);
          expect(tris(cena)).toEqual(fresca(p1));
        } else {
          // recusa: o chamador cai no update completo, que já é coberto acima
          expect(tris(cena)).toEqual(antes);
        }
        cena.dispose();
      });
    }
  });
}
