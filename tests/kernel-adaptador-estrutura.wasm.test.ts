/**
 * Estrutura, ficha R1a (docs/estrutura/PLANO.md): o adaptador TS (`ServicoEstr`) monta as seções 19 e 200 a 206 de um projeto pequeno e o Rust REAL devolve
 * a malha (consulta 200) e o contorno do perfil (consulta 205). Fixtures da A.10: E1 (pilar 0,20 x 0,40, h 3,00: 0,24 m3) e E5 (viga 0,15 x 0,40 x 5,00: 0,30 m3).
 * Roda só em `npm run test:wasm`. A consulta 203 (K4) ainda devolve NAO_IMPLEMENTADO: a leitura é ausente.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createEmptyProject, makeBeam, makeColumn, makeFooting, ProjectStore, type ColumnType } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { ServicoEstr, type MalhaEstrElemento } from '../packages/engine/src/kernelEstrServico.ts';
import { estrAvisosDeInvalidez } from '../packages/engine/src/estrIssues.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

/** Volume com sinal (divergência) dos triângulos de todas as partes do elemento. */
function volume(m: MalhaEstrElemento): number {
  let s = 0;
  for (const parte of m.partes) {
    const v = parte.positions;
    for (let i = 0; i < parte.indices.length; i += 3) {
      const [a, b, c] = [parte.indices[i]!, parte.indices[i + 1]!, parte.indices[i + 2]!].map((k) => [v[3 * k]!, v[3 * k + 1]!, v[3 * k + 2]!] as const);
      s += (a![0] * (b![1] * c![2] - b![2] * c![1]) - a![1] * (b![0] * c![2] - b![2] * c![0]) + a![2] * (b![0] * c![1] - b![1] * c![0])) / 6;
    }
  }
  return s;
}

const tipo20x40: ColumnType = { id: 'pil_20x40', name: 'Estrutural 20 x 40', code: 'PE-20x40', description: '', disciplina: 'estrutural', perfil: { forma: 'retangular', b: 0.2, h: 0.4 }, materialId: 'mat_concreto', cost: 0 };

function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertColumnType', columnType: tipo20x40 });
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'p1', typeId: 'pil_20x40', levelId: 'lv_0', pos: { x: 0, y: 0 }, height: 3 }) });
  s.exec({ type: 'addBeam', beam: makeBeam({ id: 'v1', typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, zOffsetA: 3, zOffsetB: 3 }) });
  return s;
}

describe('estrutura, ficha R1a: adaptador TS + kernel Rust real', () => {
  it.skipIf(!bytes)('pilar 0,20 x 0,40 h 3,00 = 0,24 m3 e viga 0,15 x 0,40 x 5,00 = 0,30 m3 (consulta 200)', () => {
    const srv = new ServicoEstr(() => ger);
    const p = projeto().project;
    expect(srv.pronto()).toBe(true);
    const m = srv.malha(p, null, 1)!;
    expect(m.map((e) => [e.elementId, e.categoria])).toEqual([['p1', 'pilar'], ['v1', 'viga']]);
    expect(volume(m[0]!)).toBeCloseTo(0.24, 9);
    expect(volume(m[1]!)).toBeCloseTo(0.3, 9);
    // O material do corpo volta como id do projeto.
    expect(m[0]!.partes[0]!.materialId).toBe('mat_concreto');
    // Por nível: tudo está no nível 0; o nível 1 não tem nada.
    expect(srv.malha(p, 'lv_0', 1)).toHaveLength(2);
    expect(srv.malha(p, 'lv_1', 1)).toEqual([]);
    srv.encerrar();
  });

  it.skipIf(!bytes)('pilar arquitetônico, perfil I e fundação: a consulta não falha e o que o kernel entrega tem volume correto', () => {
    const s = projeto();
    s.exec({ type: 'upsertColumnType', columnType: { ...tipo20x40, id: 'pil_i', perfil: { forma: 'I', b: 0.1, h: 0.2, tf: 0.008, tw: 0.005 } } });
    s.exec({ type: 'addColumn', column: makeColumn({ id: 'pi', typeId: 'pil_i', levelId: 'lv_0', pos: { x: 8, y: 0 }, height: 3 }) });
    s.exec({ type: 'addColumn', column: makeColumn({ id: 'pa', typeId: 'pil_arq_20x20', levelId: 'lv_0', disciplina: 'arquitetonico', pos: { x: 2, y: 2 }, topLevelId: 'lv_1', height: null }) });
    s.exec({ type: 'addFooting', footing: makeFooting({ id: 'f1', typeId: 'sap_80x80x30', levelId: 'lv_0', pos: { x: 0, y: 0 }, topOffset: -0.5 }) });
    const srv = new ServicoEstr(() => ger);
    const m = srv.malha(s.project, null, 1)!;
    const por = (id: string) => m.find((e) => e.elementId === id);
    expect(volume(por('pi')!)).toBeCloseTo(0.00756, 9);
    expect(volume(por('pa')!)).toBeCloseTo(0.2 * 0.2 * 3, 9);
    // A fundação (E7: 0,22325 m3) vem com a ficha K3; antes dela o kernel a ignora, sem recusar a consulta.
    const f = por('f1');
    if (f) expect(volume(f)).toBeCloseTo(0.22325, 9);
    expect(srv.recusados(s.project)).toEqual([]);
    srv.encerrar();
  });

  it.skipIf(!bytes)('elemento inválido nunca chega ao kernel: a consulta segue valendo e o aviso estr-invalida sai', () => {
    const s = projeto();
    const q = structuredClone(s.project);
    q.elements['sem_altura'] = { ...(q.elements['p1'] as object), id: 'sem_altura', height: 0 } as never;
    const srv = new ServicoEstr(() => ger);
    const m = srv.malha(q, null, 1)!;
    expect(m.map((e) => e.elementId)).toEqual(['p1', 'v1']);
    expect(srv.invalidos(q)).toEqual(['sem_altura']);
    expect(estrAvisosDeInvalidez(q).map((a) => [a.code, a.elementId])).toEqual([['estr-invalida', 'sem_altura']]);
    srv.encerrar();
  });

  it.skipIf(!bytes)('envio por diferença: editar um pilar reenvia ao kernel; trocar algo fora da estrutura não; a malha muda só no que mudou', () => {
    const s = projeto();
    const srv = new ServicoEstr(() => ger);
    const m0 = srv.malha(s.project, null, 1)!;
    expect(srv.enviosAoKernel).toBe(1);
    // Edição que não toca na estrutura (nome do projeto): a cena não é reenviada e a malha é o MESMO objeto.
    s.exec({ type: 'updateColumn', id: 'p1', patch: { mark: 'P1' } });
    const m1 = srv.malha(s.project, null, 1)!;
    expect(srv.enviosAoKernel).toBe(1);
    expect(m1).toBe(m0);
    // Mexer na altura reenvia a linha e a malha muda.
    s.exec({ type: 'updateColumn', id: 'p1', patch: { height: 4 } });
    const m2 = srv.malha(s.project, null, 1)!;
    expect(srv.enviosAoKernel).toBe(2);
    expect(volume(m2[0]!)).toBeCloseTo(0.2 * 0.4 * 4, 9);
    expect(volume(m2[1]!)).toBeCloseTo(0.3, 9);
    srv.encerrar();
  });

  it.skipIf(!bytes)('consulta 205: contorno do perfil (tubo com furo) e perfil inválido dá null; a 203 ainda é ausente', () => {
    const srv = new ServicoEstr(() => ger);
    const tubo = srv.contorno({ forma: 'tuboRetangular', b: 0.1, h: 0.1, t: 0.005 })!;
    expect(tubo.anel).toHaveLength(4);
    expect(tubo.furos).toHaveLength(1);
    expect(tubo.area).toBeCloseTo(0.0019, 12);
    expect(srv.contorno({ forma: 'circular', d: 0.3 })!.anel).toHaveLength(96);
    const l = srv.contorno({ forma: 'personalizado', anel: [[0, 0], [0.3, 0], [0.3, 0.05], [0.05, 0.05], [0.05, 0.4], [0, 0.4]] })!;
    expect(l.area).toBeCloseTo(0.3 * 0.05 + 0.35 * 0.05, 12);
    expect(srv.contorno({ forma: 'I', b: 0.1, h: 0.2, tf: 0.1, tw: 0.005 })).toBeNull();
    const p = projeto().project;
    expect(srv.leituras(p)).toBeNull();
    srv.encerrar();
  });
});
