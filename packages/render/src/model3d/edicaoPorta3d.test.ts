import { describe, expect, it } from 'vitest';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeLevel, makeSlab, makeWall, type Command, type Opening, type Project } from '@hestia/model';
import { ModelScene, type Scene3DOptions } from './scene3d.ts';

/**
 * Regressão do fluxo de edição de porta: depois de editar uma porta pelo caminho comum do 3D (`atualizarAberturas`,
 * e a remontagem `update` quando o caminho rápido recusa), o resultado exportado tem de ser igual ao de uma cena
 * montada do zero. Projeto sintético: paredes, uma porta, piso com término explícito (`ft_unico`) e laje com término
 * explícito (`ls_unica`). Nesse caso o caminho rápido recusa a porta (motivo 10) e a remontagem é que roda.
 */

const OPT: Scene3DOptions = { edges: true, shadows: false, dark: false };
const PTS = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 5, y: 4 },
  { x: 0, y: 4 },
];
const LADOS: Array<[string, number, number]> = [
  ['a', 0, 1],
  ['b', 1, 2],
  ['c', 2, 3],
  ['d', 3, 0],
];

const porta = (id: string, typeId: string, hostId: string, offset: number): Opening => ({
  id,
  kind: 'door',
  typeId,
  hostId,
  offset,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
});

/** Térreo com paredes, porta na parede `a` e piso `ft_unico`; pavimento de cima com paredes e laje `ls_unica`. */
function sintetico(): Project {
  const s = new ProjectStore(createEmptyProject('EdicaoPorta'));
  const cmds: Command[] = [{ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'P2', elevation: 3 }) }];
  for (const levelId of ['lv_0', 'lv_1']) {
    for (const [id, i, j] of LADOS) cmds.push({ type: 'addWall', wall: makeWall({ id: `${id}_${levelId}`, typeId: 'wt_alv14', levelId, a: PTS[i]!, b: PTS[j]!, height: 2.8 }) });
  }
  s.exec({ type: 'batch', commands: cmds });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'pis', typeId: 'ft_unico', levelId: 'lv_0', boundary: PTS }) });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'laj', typeId: 'ls_unica', levelId: 'lv_1', boundary: PTS }) });
  s.exec({ type: 'addOpening', opening: porta('d1', 'ot_p80', 'a_lv_0', 1) });
  return s.project;
}

const niveis = (p: Project): ResolvedLevel[] => p.levels.map((l) => resolveLevel(p, l.id));

/** Triângulos do modelo no mundo, canônicos (vértices arredondados e ordenados): igual = mesma geometria visível. */
function triangulos(ms: ModelScene): string[] {
  const v = ms.exportarVetores().trianglePositions;
  const r = (x: number): string => (Math.round(x * 1e4) / 1e4).toFixed(4);
  const out: string[] = [];
  for (let i = 0; i < v.length; i += 9) {
    const pts = [0, 3, 6].map((k) => `${r(v[i + k]!)},${r(v[i + k + 1]!)},${r(v[i + k + 2]!)}`).sort();
    out.push(pts.join(' '));
  }
  return out.sort();
}

/** Segmentos de aresta do modelo, canônicos (pontas ordenadas em cada segmento). */
function arestas(ms: ModelScene): string[] {
  const v = ms.exportarVetores().edges;
  const r = (x: number): string => (Math.round(x * 1e4) / 1e4).toFixed(4);
  const out: string[] = [];
  for (let i = 0; i + 5 < v.length; i += 6) out.push([`${r(v[i]!)},${r(v[i + 1]!)},${r(v[i + 2]!)}`, `${r(v[i + 3]!)},${r(v[i + 4]!)},${r(v[i + 5]!)}`].sort().join(' '));
  return out.sort();
}

const EDICOES: Array<[string, Command]> = [
  ['apagar porta', { type: 'deleteElements', ids: ['d1'] }],
  ['mover porta', { type: 'updateElements', ids: ['d1'], patch: { offset: 2.2 } }],
  ['trocar tipo da porta', { type: 'updateElements', ids: ['d1'], patch: { typeId: 'ot_p160' } }],
];

describe('edição de porta: caminho comum igual à remontagem do zero (exportarVetores)', () => {
  for (const [nome, cmd] of EDICOES) {
    it(nome, () => {
      const p0 = sintetico();
      const s = new ProjectStore(p0);
      s.exec(cmd);
      const p1 = s.project;
      const hostId = 'a_lv_0';
      const nivel = 'lv_0';

      // Caminho comum: o rápido tenta primeiro; se recusa, a cena remonta o projeto editado sobre a cena já usada.
      const cena = new ModelScene();
      cena.update(p0, niveis(p0), OPT);
      const lv1 = resolveLevel(p1, nivel);
      if (!cena.atualizarAberturas(p1, p0, nivel, [hostId], lv1, OPT)) cena.update(p1, niveis(p1), OPT);

      const remontada = new ModelScene();
      remontada.update(p1, niveis(p1), OPT);

      const vCena = cena.exportarVetores();
      const vRemontada = remontada.exportarVetores();
      expect(vCena.trianglePositions.length / 9).toBe(vRemontada.trianglePositions.length / 9);
      expect(vCena.edges.length / 6).toBe(vRemontada.edges.length / 6);
      expect(triangulos(cena)).toEqual(triangulos(remontada));
      expect(arestas(cena)).toEqual(arestas(remontada));
      cena.dispose();
      remontada.dispose();
    });
  }
});
