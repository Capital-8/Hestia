import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { comandoDerivarParedes, comandoDerivarPisos, type CadeiaDerivadaParedes } from './massDerivaCommands.ts';
import { makeLevel } from './level.ts';
import { makeMass, secaoCirculo } from './mass.ts';
import { migrateProject } from './migrate.ts';
import { createEmptyProject, isFloor, isWall, ProjectStore, validateProject, type Floor, type Id, type Project, type Wall } from './index.ts';
import { floorIssues } from './validateFloors.ts';
import { makeWall } from './wall.ts';

/** Retângulo de 10 × 6 m (ficha D2, caixa M1). */
const caixa: Vec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 6 },
  { x: 0, y: 6 },
];

const paredes = (p: Project): Wall[] => Object.values(p.elements).filter(isWall);
const pisos = (p: Project): Floor[] => Object.values(p.elements).filter(isFloor);

/** Projeto com a massa `m1` (de 0 a 9 m) no térreo e os níveis `lv_a` (3 m) e `lv_b` (6 m). */
function projeto(): { s: ProjectStore; terreo: Id; tipo: Id } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_a', name: 'A', elevation: 3 }) });
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_b', name: 'B', elevation: 6 }) });
  const terreo = s.project.levels.find((l) => l.elevation === 0)!.id;
  s.exec({ type: 'addMass', mass: makeMass({ id: 'm1', levelId: terreo, name: 'Torre', secoes: [secaoCirculo(0, 5), secaoCirculo(9, 5)] }) });
  return { s, terreo, tipo: Object.keys(s.project.wallTypes)[0]! };
}

/** Cadeia de 4 paredes da caixa no nível `nivelId`, com topo no próximo nível ou altura dada. */
const cadeia = (nivelId: Id, topoNivelId: Id | null = null, altura = 3, pontos: Vec2[] = caixa): CadeiaDerivadaParedes => ({ nivelId, pontos, topoNivelId, altura });

describe('derivação de paredes da massa (ficha D2): comando', () => {
  it('cria uma parede por segmento, em cadeia fechada (o último segmento termina onde o primeiro começa), com origemMassa', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    const ws = paredes(s.project);
    expect(ws).toHaveLength(4);
    for (const w of ws) {
      expect(w.origemMassa).toEqual({ massaId: 'm1', nivelId: terreo });
      expect(w.levelId).toBe(terreo);
      expect(w.topLevelId).toBe('lv_a');
      expect(w.topOffset).toBe(0);
      expect(w.baseOffset).toBe(0);
    }
    // Cada parede começa onde a anterior termina: a cadeia fecha.
    const ordem = [...ws].sort((x, y) => x.order - y.order);
    for (let i = 0; i < ordem.length; i++) {
      const prox = ordem[(i + 1) % ordem.length]!;
      expect(ordem[i]!.b).toEqual(prox.a);
    }
  });

  it('sem topo de nível: a altura vale e topLevelId fica null', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, null, 4.2)] }));
    for (const w of paredes(s.project)) {
      expect(w.topLevelId).toBeNull();
      expect(w.height).toBeCloseTo(4.2, 12);
    }
  });

  it('um desfazer remove todas as paredes geradas de uma vez', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    expect(paredes(s.project)).toHaveLength(4);
    s.undo();
    expect(paredes(s.project)).toHaveLength(0);
    expect(s.project.elements['m1']).toBeDefined();
  });

  it('rodar de novo no mesmo nível substitui (não duplica)', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    expect(paredes(s.project)).toHaveLength(4);
  });

  it('rodar de novo só mexe nos níveis escolhidos: paredes de outro nível ficam', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo, 'lv_a'], cadeias: [cadeia(terreo, 'lv_a'), cadeia('lv_a', 'lv_b')] }));
    expect(paredes(s.project)).toHaveLength(8);
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a', 3, caixa.map((q) => ({ x: q.x * 2, y: q.y })))] }));
    const ws = paredes(s.project);
    expect(ws).toHaveLength(8);
    expect(ws.filter((w) => w.levelId === 'lv_a')).toHaveLength(4);
  });

  it('um nível escolhido sem cadeia nova perde as paredes antigas (não sobra parede velha)', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [] }));
    expect(paredes(s.project)).toHaveLength(0);
  });

  it('não apaga parede feita à mão nem parede gerada por outra massa', () => {
    const { s, terreo, tipo } = projeto();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'manual', typeId: tipo, levelId: terreo, a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'outra', typeId: tipo, levelId: terreo, a: { x: 0, y: 0 }, b: { x: 3, y: 1 }, origemMassa: { massaId: 'm9', nivelId: terreo } }) });
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    const ids = paredes(s.project).map((w) => w.id);
    expect(ids).toContain('manual');
    expect(ids).toContain('outra');
    expect(paredes(s.project)).toHaveLength(6);
  });

  it('recusa massa, tipo ou nível inexistente sem mudar o projeto', () => {
    const { s, terreo, tipo } = projeto();
    const ok = [cadeia(terreo, 'lv_a')];
    expect(() => comandoDerivarParedes(s.project, { massaId: 'nao_existe', typeId: tipo, niveis: [terreo], cadeias: ok })).toThrow();
    expect(() => comandoDerivarParedes(s.project, { massaId: 'm1', typeId: 'wt_nao', niveis: [terreo], cadeias: ok })).toThrow();
    expect(() => comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: ['lv_zz'], cadeias: ok })).toThrow();
    expect(() => comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia('lv_zz', 'lv_a')] })).toThrow();
    expect(() => comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_zz')] })).toThrow();
    expect(paredes(s.project)).toHaveLength(0);
  });

  it('as paredes geradas passam em validateProject sem erro novo (junções pelo motor)', () => {
    const { s, terreo, tipo } = projeto();
    const antes = validateProject(s.project).filter((i) => i.severity === 'error').length;
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    const ids = new Set(paredes(s.project).map((w) => w.id));
    expect(validateProject(s.project).filter((i) => i.severity === 'error').length).toBe(antes);
    expect(validateProject(s.project).filter((i) => i.elementId && ids.has(i.elementId))).toEqual([]);
  });

  it('origemMassa é opcional: parede antiga sem o campo abre e valida; a geração não mexe nela', () => {
    const { s, terreo, tipo } = projeto();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'antiga', typeId: tipo, levelId: terreo, a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) });
    const ida = JSON.parse(JSON.stringify(s.project)) as Project;
    expect('origemMassa' in ida.elements['antiga']!).toBe(false);
    const aberto = migrateProject(ida);
    expect(aberto.elements['antiga']).toBeDefined();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    expect(s.project.elements['antiga']).toBeDefined();
  });
});

describe('cópia e movimento de piso e parede gerados (emenda E16 item 3)', () => {
  it('copiar uma parede gerada no mesmo nível: a cópia não tem origemMassa e sobrevive a nova geração', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    const original = paredes(s.project)[0]!;
    s.exec({ type: 'transform', ids: [original.id], transform: { kind: 'translate', d: { x: 20, y: 0 } }, copy: { idMap: { [original.id]: 'parede_copia' } } });
    expect(s.project.elements['parede_copia']).toBeDefined();
    expect('origemMassa' in s.project.elements['parede_copia']!).toBe(false);
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    expect(s.project.elements['parede_copia']).toBeDefined();
    expect(paredes(s.project).filter((w) => w.origemMassa)).toHaveLength(4);
  });

  it('mover uma parede gerada mantém origemMassa (não é cópia)', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [cadeia(terreo, 'lv_a')] }));
    const original = paredes(s.project)[0]!;
    s.exec({ type: 'transform', ids: [original.id], transform: { kind: 'translate', d: { x: 1, y: 0 } } });
    const movida = s.project.elements[original.id];
    expect(isWall(movida) ? movida.origemMassa : undefined).toEqual({ massaId: 'm1', nivelId: terreo });
  });

  it('copiar um piso gerado no mesmo nível: gerar de novo não apaga a cópia', () => {
    const { s, terreo } = projeto();
    const typeId = Object.keys(s.project.floorTypes)[0]!;
    const contorno = [{ id: 'f_1', nivelId: terreo, boundary: caixa, holes: [] }];
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: contorno }));
    const gerado = pisos(s.project)[0]!;
    s.exec({ type: 'transform', ids: [gerado.id], transform: { kind: 'translate', d: { x: 30, y: 0 } }, copy: { idMap: { [gerado.id]: 'piso_copia' } } });
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: [{ id: 'f_2', nivelId: terreo, boundary: caixa, holes: [] }] }));
    const ids = pisos(s.project).map((f) => f.id).sort();
    expect(ids).toEqual(['f_2', 'piso_copia']);
    expect(floorIssues(s.project).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
