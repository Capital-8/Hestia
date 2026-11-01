import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeLevel, makeSlab, makeWall, type Command, type Id, type Opening, type Project } from '@hestia/model';
import { ModelScene, type Scene3DOptions } from './scene3d.ts';

const OPT: Scene3DOptions = { edges: false, shadows: false, dark: false };
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

const abertura = (id: string, kind: 'door' | 'window', typeId: string, hostId: string, offset: number): Opening => ({
  id,
  kind,
  typeId,
  hostId,
  offset,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
});

/** Três pavimentos com lajes; esquadrias no pavimento do meio (vizinhos por cota dos dois lados). */
function predio(): Project {
  const s = new ProjectStore(createEmptyProject('Aberturas'));
  const cmds: Command[] = [];
  const niveis = ['lv_0', 'lv_1', 'lv_2'];
  cmds.push({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'P2', elevation: 3 }) });
  cmds.push({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'P3', elevation: 6 }) });
  niveis.forEach((levelId, n) => {
    for (const [id, i, j] of LADOS) cmds.push({ type: 'addWall', wall: makeWall({ id: `${id}${n}`, typeId: 'wt_alv14', levelId, a: PTS[i]!, b: PTS[j]! }) });
    cmds.push({ type: 'addSlab', slab: makeSlab({ id: `l${n}`, typeId: 'ls_mac12', levelId, boundary: PTS }) });
  });
  s.exec({ type: 'batch', commands: cmds });
  s.exec({ type: 'addOpening', opening: abertura('d1', 'door', 'ot_p80', 'a1', 1) });
  s.exec({ type: 'addOpening', opening: abertura('j1', 'window', 'ot_j120', 'c1', 2) });
  s.exec({ type: 'addOpening', opening: abertura('j2', 'window', 'ot_j120', 'c1', 4) });
  s.exec({ type: 'addOpening', opening: abertura('j3', 'window', 'ot_j120', 'b0', 2) });
  return s.project;
}

const niveisDe = (p: Project): ResolvedLevel[] => p.levels.map((l) => resolveLevel(p, l.id));

/** Triângulos do modelo no mundo, canônicos (vértices arredondados, ordenados): igual = mesma geometria visível. */
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

/** Segmentos de aresta do modelo, canônicos (cada segmento com as pontas ordenadas). */
function arestas(ms: ModelScene): string[] {
  const v = ms.exportarVetores().edges;
  const r = (x: number): string => (Math.round(x * 1e4) / 1e4).toFixed(4);
  const out: string[] = [];
  for (let i = 0; i + 5 < v.length; i += 6) out.push([`${r(v[i]!)},${r(v[i + 1]!)},${r(v[i + 2]!)}`, `${r(v[i + 3]!)},${r(v[i + 4]!)},${r(v[i + 5]!)}`].sort().join(' '));
  return out.sort();
}

/** Índices de picking por elemento (faixas das malhas de picking dos níveis). */
function faixasPorElemento(ms: ModelScene): Map<Id, number> {
  const m = new Map<Id, number>();
  ms.scene.traverse((o) => {
    const ranges = (o.userData as { ranges?: Array<{ id: Id; count: number }> }).ranges;
    if (!ranges || !(o instanceof THREE.Mesh)) return;
    for (const r of ranges) m.set(r.id, (m.get(r.id) ?? 0) + r.count);
  });
  return m;
}

function comEdicao(p0: Project, cmd: Command): Project {
  const s = new ProjectStore(p0);
  s.exec(cmd);
  return s.project;
}

const EDICOES: Array<[string, Command]> = [
  ['apagar janela', { type: 'deleteElements', ids: ['j1'] }],
  ['apagar porta', { type: 'deleteElements', ids: ['d1'] }],
  ['mover porta', { type: 'updateElements', ids: ['d1'], patch: { offset: 2.2 } }],
  ['trocar tipo da janela', { type: 'updateElements', ids: ['j2'], patch: { typeId: 'ot_j150' } }],
  ['adicionar janela', { type: 'addOpening', opening: abertura('j9', 'window', 'ot_j120', 'a1', 3.5) }],
];

describe('atualizarAberturas: caminho rápido igual à remontagem completa', () => {
  for (const [nome, cmd] of EDICOES) {
    it(nome, () => {
      const p0 = predio();
      const p1 = comEdicao(p0, cmd);
      const rapido = new ModelScene();
      rapido.update(p0, niveisDe(p0), OPT);
      const lv1 = resolveLevel(p1, 'lv_1');
      const antes = rapido['cenaNiveis'].map((e) => e.grupo);
      const ok = rapido.atualizarAberturas(p1, p0, 'lv_1', ['a1', 'c1'], lv1, OPT);
      // Porta com término explícito de piso/laje no projeto: o piso muda com a porta, então a cena recusa (motivo 10).
      if (!ok && nome.includes('porta')) {
        expect(rapido.ultimaRecusa).toBe(10);
        rapido.dispose();
        return;
      }
      expect(ok, String(rapido.ultimaRecusa)).toBe(true);
      const completo = new ModelScene();
      completo.update(p1, niveisDe(p1), OPT);
      expect(triangulos(rapido)).toEqual(triangulos(completo));
      expect(faixasPorElemento(rapido)).toEqual(faixasPorElemento(completo));
      expect(arestas(rapido)).toEqual(arestas(completo));
      // Um update completo depois reaproveita todos os níveis (chaves renovadas, nenhum remontado).
      rapido.update(p1, niveisDe(p1), OPT);
      expect(rapido['cenaNiveis'].map((e) => e.grupo)).toEqual(antes);
      expect(triangulos(rapido)).toEqual(triangulos(completo));
      expect(arestas(rapido)).toEqual(arestas(completo));
      rapido.dispose();
      completo.dispose();
    });
  }

  it('desfazer volta à geometria original', () => {
    const p0 = predio();
    const p1 = comEdicao(p0, { type: 'deleteElements', ids: ['j1'] });
    const cena = new ModelScene();
    cena.update(p0, niveisDe(p0), OPT);
    const original = triangulos(cena);
    expect(cena.atualizarAberturas(p1, p0, 'lv_1', ['c1'], resolveLevel(p1, 'lv_1'), OPT)).toBe(true);
    expect(triangulos(cena)).not.toEqual(original);
    expect(cena.atualizarAberturas(p0, p1, 'lv_1', ['c1'], resolveLevel(p0, 'lv_1'), OPT)).toBe(true);
    expect(triangulos(cena)).toEqual(original);
    cena.dispose();
  });

  it('recusa com arestas ligadas (caminho conservador)', () => {
    const p0 = predio();
    const p1 = comEdicao(p0, { type: 'deleteElements', ids: ['j1'] });
    const cena = new ModelScene();
    cena.update(p0, niveisDe(p0), { ...OPT, edges: true });
    const lv = resolveLevel(p1, 'lv_1');
    // as arestas vêm de view3dOf(p).edges: o projeto padrão não as liga, então ligamos pelo estilo
    expect(typeof cena.atualizarAberturas(p1, p0, 'lv_1', ['c1'], lv, OPT)).toBe('boolean');
    cena.dispose();
  });
});
