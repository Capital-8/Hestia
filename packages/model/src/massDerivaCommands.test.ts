import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { comandoDerivarPisos } from './massDerivaCommands.ts';
import { makeFloor } from './floor.ts';
import { makeLevel } from './level.ts';
import { makeMass, secaoCirculo } from './mass.ts';
import { migrateProject } from './migrate.ts';
import { createEmptyProject, ProjectStore, type Floor, type Id, type Project, type Slab } from './index.ts';
import { floorIssues } from './validateFloors.ts';
import { slabIssues } from './validateSlabs.ts';

const quadrado = (lado: number, x0 = 0, y0 = 0): Vec2[] => [
  { x: x0, y: y0 },
  { x: x0 + lado, y: y0 },
  { x: x0 + lado, y: y0 + lado },
  { x: x0, y: y0 + lado },
];

const pisos = (p: Project): Floor[] => Object.values(p.elements).filter((e): e is Floor => e.kind === 'floor');
const lajes = (p: Project): Slab[] => Object.values(p.elements).filter((e): e is Slab => e.kind === 'slab');

/** Projeto com a massa `m1` (cilindro de raio 5, 30 m) no nível `lv_0` e os níveis `lv_a` (3 m) e `lv_b` (6 m). */
function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_a', name: 'A', elevation: 3 }) });
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_b', name: 'B', elevation: 6 }) });
  const nivel0 = s.project.levels[0]!.id;
  s.exec({ type: 'addMass', mass: makeMass({ id: 'm1', levelId: nivel0, name: 'Torre', secoes: [secaoCirculo(0, 5), secaoCirculo(30, 5)] }) });
  return s;
}

const tipoPiso = (p: Project): Id => Object.keys(p.floorTypes)[0]!;
const tipoLaje = (p: Project): Id => Object.keys(p.slabTypes)[0]!;

describe('derivação de pisos da massa (ficha D1): comando', () => {
  it('cria um piso por nível com origemMassa e contorno estático (sem outlineSource)', () => {
    const s = projeto();
    const typeId = tipoPiso(s.project);
    const cmd = comandoDerivarPisos(s.project, {
      massaId: 'm1',
      tipo: 'piso',
      typeId,
      contornos: [
        { id: 'f_a', nivelId: 'lv_a', boundary: quadrado(8), holes: [] },
        { id: 'f_b', nivelId: 'lv_b', boundary: quadrado(8), holes: [] },
      ],
    });
    s.exec(cmd);
    const fs = pisos(s.project);
    expect(fs.map((f) => f.id).sort()).toEqual(['f_a', 'f_b']);
    for (const f of fs) {
      expect(f.origemMassa).toEqual({ massaId: 'm1', nivelId: f.levelId });
      expect(f.outlineSource).toBeUndefined();
      expect(f.boundary).toHaveLength(4);
    }
  });

  it('um desfazer remove todos os pisos gerados de uma vez', () => {
    const s = projeto();
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId: tipoPiso(s.project), contornos: [
      { id: 'f_a', nivelId: 'lv_a', boundary: quadrado(8), holes: [] },
      { id: 'f_b', nivelId: 'lv_b', boundary: quadrado(8), holes: [] },
    ] }));
    expect(pisos(s.project)).toHaveLength(2);
    s.undo();
    expect(pisos(s.project)).toHaveLength(0);
    expect(s.project.elements['m1']).toBeDefined();
  });

  it('rodar de novo substitui os gerados antes pela mesma massa e nível (não duplica)', () => {
    const s = projeto();
    const typeId = tipoPiso(s.project);
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: [{ id: 'f_1', nivelId: 'lv_a', boundary: quadrado(8), holes: [] }] }));
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: [{ id: 'f_2', nivelId: 'lv_a', boundary: quadrado(9), holes: [] }] }));
    expect(pisos(s.project).map((f) => f.id)).toEqual(['f_2']);
  });

  it('laje gerada substitui piso gerado antes no mesmo nível (de qualquer tipo)', () => {
    const s = projeto();
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId: tipoPiso(s.project), contornos: [{ id: 'f_1', nivelId: 'lv_a', boundary: quadrado(8), holes: [] }] }));
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'laje', typeId: tipoLaje(s.project), contornos: [{ id: 's_1', nivelId: 'lv_a', boundary: quadrado(8), holes: [] }] }));
    expect(pisos(s.project)).toHaveLength(0);
    expect(lajes(s.project).map((l) => l.id)).toEqual(['s_1']);
    expect(lajes(s.project)[0]!.origemMassa).toEqual({ massaId: 'm1', nivelId: 'lv_a' });
  });

  it('não apaga piso à mão nem piso gerado em outro nível', () => {
    const s = projeto();
    const typeId = tipoPiso(s.project);
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'manual', typeId, levelId: 'lv_a', boundary: quadrado(2) }) });
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: [{ id: 'f_b', nivelId: 'lv_b', boundary: quadrado(8), holes: [] }] }));
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: [{ id: 'f_a', nivelId: 'lv_a', boundary: quadrado(8), holes: [] }] }));
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: [{ id: 'f_a2', nivelId: 'lv_a', boundary: quadrado(7), holes: [] }] }));
    expect(pisos(s.project).map((f) => f.id).sort()).toEqual(['f_a2', 'f_b', 'manual']);
  });

  it('recusa massa, tipo, nível ou contorno inválidos sem mudar o projeto', () => {
    const s = projeto();
    const typeId = tipoPiso(s.project);
    const ok = [{ id: 'f_a', nivelId: 'lv_a', boundary: quadrado(8), holes: [] }];
    expect(() => comandoDerivarPisos(s.project, { massaId: 'nao_existe', tipo: 'piso', typeId, contornos: ok })).toThrow();
    expect(() => comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId: 'ft_nao', contornos: ok })).toThrow();
    expect(() => comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'laje', typeId: 'ls_nao', contornos: ok })).toThrow();
    expect(() => comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: [{ id: 'f_x', nivelId: 'lv_zz', boundary: quadrado(8), holes: [] }] })).toThrow();
    expect(() => comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: [{ id: 'f_x', nivelId: 'lv_a', boundary: quadrado(8).slice(0, 2), holes: [] }] })).toThrow();
    expect(pisos(s.project)).toHaveLength(0);
  });

  it('os pisos e lajes gerados passam em validateFloors e validateSlabs sem erro', () => {
    const s = projeto();
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId: tipoPiso(s.project), contornos: [{ id: 'f_a', nivelId: 'lv_a', boundary: quadrado(8), holes: [] }] }));
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'laje', typeId: tipoLaje(s.project), contornos: [{ id: 's_b', nivelId: 'lv_b', boundary: quadrado(8), holes: [] }] }));
    expect(floorIssues(s.project).filter((i) => i.severity === 'error')).toEqual([]);
    expect(slabIssues(s.project).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('origemMassa é opcional: arquivo antigo sem o campo abre, valida e mantém o piso', () => {
    const s = projeto();
    const typeId = tipoPiso(s.project);
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'antigo', typeId, levelId: 'lv_a', boundary: quadrado(3) }) });
    const ida = JSON.parse(JSON.stringify(s.project)) as Project;
    expect('origemMassa' in ida.elements['antigo']!).toBe(false);
    const aberto = migrateProject(ida);
    expect(aberto.elements['antigo']).toBeDefined();
    expect(floorIssues(aberto).filter((i) => i.severity === 'error')).toEqual([]);
    s.exec(comandoDerivarPisos(s.project, { massaId: 'm1', tipo: 'piso', typeId, contornos: [{ id: 'f_a', nivelId: 'lv_a', boundary: quadrado(8), holes: [] }] }));
    const comOrigem = migrateProject(JSON.parse(JSON.stringify(s.project)));
    expect((comOrigem.elements['f_a'] as Floor).origemMassa).toEqual({ massaId: 'm1', nivelId: 'lv_a' });
    expect(comOrigem.elements['antigo']).toBeDefined();
  });
});
