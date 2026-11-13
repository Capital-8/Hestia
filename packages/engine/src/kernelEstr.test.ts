import { describe, expect, it } from 'vitest';
import type { CenaV2 } from '@hestia/geom';
import { CONSULTAS, ESQUEMA_VERSAO, SECOES } from '../../geom/src/kernel/v2/esquema.gerado.ts';
import { createEmptyProject, makeBeam, makeColumn, makeFooting, ProjectStore, type Project } from '@hestia/model';
import {
  COLUNAS_ESTR,
  FORMA_PERFIL_CODIGO,
  ID_AUSENTE_ESTR,
  NOMES_SECOES_ESTR,
  diferencaEstr,
  enviarCenaEstr,
  montarCenaEstr,
  sincronizarCenaEstr,
  type CenaEstr,
  type NomeSecaoEstr,
} from './kernelEstr.ts';

/** Linhas de uma seção como objetos coluna -> valor. */
const linhas = (c: CenaEstr, nome: NomeSecaoEstr): Array<Record<string, number>> =>
  [...c.secoes[nome].values()].map((l) => Object.fromEntries(COLUNAS_ESTR[nome].map((col, i) => [col, l[i]!])));

/** Projeto com pilar arquitetônico, pilar estrutural, viga, sapata isolada e baldrame. */
function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'pa', typeId: 'pil_arq_20x20', levelId: 'lv_0', disciplina: 'arquitetonico', pos: { x: 1, y: 1 }, topLevelId: 'lv_1', height: null }) });
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'pe', typeId: 'pil_est_25x25', levelId: 'lv_0', pos: { x: 4, y: 0 }, rotation: 0.5, height: 3 }) });
  s.exec({ type: 'addBeam', beam: makeBeam({ id: 'v1', typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, zOffsetA: 3, zOffsetB: 3.2 }) });
  s.exec({ type: 'addFooting', footing: makeFooting({ id: 'f1', typeId: 'sap_80x80x30', levelId: 'lv_0', pos: { x: 4, y: 0 }, topOffset: -0.5 }) });
  s.exec({ type: 'addFooting', footing: makeFooting({ id: 'f2', typeId: 'bal_40x30', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, topOffset: -0.3 }) });
  return s;
}

describe('contrato da estrutura (cena-v11.json, versão 19)', () => {
  it('as seções 19 e 200 a 206 e as colunas conferem com o esquema gerado', () => {
    expect(ESQUEMA_VERSAO).toBeGreaterThanOrEqual(19);
    const ids: Record<NomeSecaoEstr, number> = { niveis: 19, perfis: 206, tipos_pilar: 203, tipos_viga: 204, tipos_fundacao: 205, pilares: 200, vigas: 201, fundacoes: 202 };
    expect(NOMES_SECOES_ESTR).toHaveLength(8);
    for (const nome of NOMES_SECOES_ESTR) {
      const s = SECOES[nome];
      expect(s.id, nome).toBe(ids[nome]);
      expect(s.colunas.map((c) => c.nome), nome).toEqual(COLUNAS_ESTR[nome]);
    }
    expect([CONSULTAS.estr_malha.id, CONSULTAS.estr_quant.id, CONSULTAS.estr_perfil.id]).toEqual([200, 203, 205]);
  });

  it('o código da forma de perfil segue a ordem do contrato', () => {
    expect(Object.values(FORMA_PERFIL_CODIGO)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('montarCenaEstr', () => {
  const p = projeto().project;
  const c = montarCenaEstr(p);

  it('gera as seções com as colunas certas e só os tipos usados', () => {
    expect(c.invalidos).toEqual([]);
    for (const nome of NOMES_SECOES_ESTR) for (const l of c.secoes[nome].values()) expect(l.length, nome).toBe(COLUNAS_ESTR[nome].length);
    expect(linhas(c, 'niveis').map((l) => [l['nivel_num'], l['cota']])).toEqual([[0, 0], [1, 3]]);
    expect(linhas(c, 'pilares')).toHaveLength(2);
    expect(linhas(c, 'vigas')).toHaveLength(1);
    expect(linhas(c, 'fundacoes')).toHaveLength(2);
    expect(linhas(c, 'tipos_pilar')).toHaveLength(2);
    expect(linhas(c, 'tipos_viga')).toHaveLength(1);
    expect(linhas(c, 'tipos_fundacao')).toHaveLength(2);
    expect(linhas(c, 'perfis')).toHaveLength(0);
  });

  it('pilar arquitetônico e estrutural: disciplina, topo por nível ou por altura, rotação', () => {
    const por = (id: string) => linhas(c, 'pilares').find((l) => l['id_num'] === c.elementos.get(id)!.num)!;
    const pa = por('pa');
    expect(pa).toMatchObject({ disciplina: 0, nivel_num: 0, px: 1, py: 1, rotacao: 0, nivel_topo_num: 1, deslocamento_base: 0, hosp_num: ID_AUSENTE_ESTR });
    expect(Number.isNaN(pa['altura'])).toBe(true);
    const pe = por('pe');
    expect(pe).toMatchObject({ disciplina: 1, nivel_topo_num: ID_AUSENTE_ESTR, altura: 3, rotacao: 0.5 });
    const tipoPa = linhas(c, 'tipos_pilar').find((l) => l['id_num'] === pa['tipo_num'])!;
    expect(tipoPa).toMatchObject({ disciplina: 0, forma: 0, p0: 0.2, p1: 0.2, perfil_num: ID_AUSENTE_ESTR, espessura_camadas: 0 });
    expect(Number.isNaN(tipoPa['p2'])).toBe(true);
    expect(c.materialDe.get('mat_reboco')).toBe(tipoPa['material_num']);
  });

  it('viga: eixo, deslocamentos z, alinhamento e extremidades', () => {
    const v = linhas(c, 'vigas')[0]!;
    expect(v).toMatchObject({ ax: 0, ay: 0, bx: 5, by: 0, deslocamento_z_a: 3, deslocamento_z_b: 3.2, alinhamento: 0, rotacao: 0, extremidade_a: 0, extremidade_b: 0 });
    expect(linhas(c, 'tipos_viga')[0]).toMatchObject({ forma: 0, p0: 0.15, p1: 0.4 });
  });

  it('fundação isolada (com pescoço) e corrida: grupos de posição e tipo', () => {
    const f1 = linhas(c, 'fundacoes').find((l) => l['id_num'] === c.elementos.get('f1')!.num)!;
    expect(f1).toMatchObject({ px: 4, py: 0, deslocamento_topo: -0.5, hosp_num: ID_AUSENTE_ESTR });
    expect(Number.isNaN(f1['ax'])).toBe(true);
    const f2 = linhas(c, 'fundacoes').find((l) => l['id_num'] === c.elementos.get('f2')!.num)!;
    expect(f2).toMatchObject({ ax: 0, ay: 0, bx: 6, by: 0 });
    expect(Number.isNaN(f2['px'])).toBe(true);
    const t1 = linhas(c, 'tipos_fundacao').find((l) => l['id_num'] === f1['tipo_num'])!;
    expect(t1).toMatchObject({ modo: 0, forma: 0, base_forma: 0, base_p0: 0.8, base_p1: 0.8, altura_base: 0.3, pescoco_forma: 0, pescoco_p0: 0.25, altura_pescoco: 0.5 });
    const t2 = linhas(c, 'tipos_fundacao').find((l) => l['id_num'] === f2['tipo_num'])!;
    expect(t2).toMatchObject({ modo: 1, pescoco_forma: 255, pescoco_perfil_num: ID_AUSENTE_ESTR });
    expect(Number.isNaN(t2['altura_pescoco'])).toBe(true);
  });

  it('perfil personalizado com furo: uma linha por vértice, anel 0 e furos 1..k, compartilhado entre tipos iguais', () => {
    const s = projeto();
    const perfil = { forma: 'personalizado' as const, anel: [[0, 0], [0.4, 0], [0.4, 0.4], [0, 0.4]] as Array<[number, number]>, furos: [[[0.1, 0.1], [0.1, 0.3], [0.3, 0.3], [0.3, 0.1]]] as Array<Array<[number, number]>> };
    const tipo = (id: string) => ({ id, name: id, code: id, description: '', disciplina: 'estrutural' as const, perfil, materialId: 'mat_concreto', cost: 0 });
    s.exec({ type: 'upsertColumnType', columnType: tipo('pil_p1') });
    s.exec({ type: 'upsertColumnType', columnType: tipo('pil_p2') });
    s.exec({ type: 'addColumn', column: makeColumn({ id: 'x1', typeId: 'pil_p1', levelId: 'lv_0', pos: { x: 0, y: 5 } }) });
    s.exec({ type: 'addColumn', column: makeColumn({ id: 'x2', typeId: 'pil_p2', levelId: 'lv_0', pos: { x: 1, y: 5 } }) });
    const cena = montarCenaEstr(s.project);
    const v = linhas(cena, 'perfis');
    expect(v).toHaveLength(8);
    expect(new Set(v.map((l) => l['perfil_num'])).size).toBe(1);
    expect(v.filter((l) => l['anel'] === 0).map((l) => l['indice'])).toEqual([0, 1, 2, 3]);
    expect(v.filter((l) => l['anel'] === 1)).toHaveLength(4);
    const tipos = linhas(cena, 'tipos_pilar').filter((l) => l['forma'] === 8);
    expect(tipos).toHaveLength(2);
    expect(tipos.every((l) => l['perfil_num'] === v[0]!['perfil_num'])).toBe(true);
  });

  it('elemento inválido fica de fora e é listado (tipo inexistente, viga curta, pilar sem altura, perfil inválido)', () => {
    const s = projeto();
    const q = structuredClone(s.project) as Project;
    q.elements['vc'] = { ...(q.elements['v1'] as object), id: 'vc', a: { x: 0, y: 0 }, b: { x: 0.0005, y: 0 } } as never;
    q.elements['sem_tipo'] = { ...(q.elements['pe'] as object), id: 'sem_tipo', typeId: 'nao_existe' } as never;
    q.elements['sem_altura'] = { ...(q.elements['pe'] as object), id: 'sem_altura', height: 0 } as never;
    const cena = montarCenaEstr(q);
    expect([...cena.invalidos].sort()).toEqual(['sem_altura', 'sem_tipo', 'vc']);
    expect(linhas(cena, 'pilares')).toHaveLength(2);
    expect(linhas(cena, 'vigas')).toHaveLength(1);
  });
});

describe('envio por diferença e cache por assinatura', () => {
  it('cena anterior mantém os id_num e a diferença de nada é vazia', () => {
    const p = projeto().project;
    const a = montarCenaEstr(p);
    const b = montarCenaEstr(structuredClone(p), { anterior: a });
    expect(b.elementos.get('pe')!.num).toBe(a.elementos.get('pe')!.num);
    expect(diferencaEstr(a, b)).toEqual([]);
  });

  it('mexer num pilar reenvia só a linha dele; elementos iguais reaproveitam a linha (cache por assinatura)', () => {
    const s = projeto();
    const a = montarCenaEstr(s.project);
    s.exec({ type: 'updateColumn', id: 'pe', patch: { rotation: 1.2 } });
    const b = montarCenaEstr(s.project, { anterior: a });
    const d = diferencaEstr(a, b);
    expect(d.map((x) => x.secao)).toEqual(['pilares']);
    expect(d[0]!.nUpsert).toBe(1);
    expect(d[0]!.upsert['rotacao']).toEqual([1.2]);
    expect(d[0]!.remover).toEqual([]);
    expect(b.elementos.get('v1')!.linha).toBe(a.elementos.get('v1')!.linha);
    expect(b.elementos.get('pa')!.linha).toBe(a.elementos.get('pa')!.linha);
    expect(b.elementos.get('pe')!.linha).not.toBe(a.elementos.get('pe')!.linha);
  });

  it('editar o tipo reenvia só o tipo; mudar a cota de um nível reenvia só a seção de níveis (as linhas dos pilares não mudam)', () => {
    const s = projeto();
    const a = montarCenaEstr(s.project);
    s.exec({ type: 'upsertColumnType', columnType: { ...(s.project.columnTypes?.['pil_est_25x25'] ?? { id: 'pil_est_25x25', name: 'E', code: 'E', description: '', disciplina: 'estrutural', materialId: 'mat_concreto', cost: 0 }), perfil: { forma: 'retangular', b: 0.3, h: 0.3 } } as never });
    const b = montarCenaEstr(s.project, { anterior: a });
    expect(diferencaEstr(a, b).map((x) => x.secao)).toEqual(['tipos_pilar']);
    s.exec({ type: 'upsertLevel', level: { ...s.project.levels[1]!, elevation: 3.5 } as never });
    const c = montarCenaEstr(s.project, { anterior: b });
    expect(diferencaEstr(b, c).map((x) => x.secao)).toEqual(['niveis']);
    expect(c.elementos.get('pa')!.assinatura).not.toBe(b.elementos.get('pa')!.assinatura);
  });

  it('remover elementos remove só as linhas deles e os tipos que ninguém mais usa', () => {
    const s = projeto();
    const a = montarCenaEstr(s.project);
    s.exec({ type: 'deleteElements', ids: ['v1'] });
    const b = montarCenaEstr(s.project, { anterior: a });
    const d = diferencaEstr(a, b);
    expect(d.map((x) => [x.secao, x.nUpsert, x.remover.length])).toEqual([['tipos_viga', 0, 1], ['vigas', 0, 1]]);
  });

  it('sincronizarCenaEstr: sem anterior envia tudo; com anterior só o que mudou (cena fingida)', () => {
    const chamadas: string[] = [];
    const cena = {
      definirSecao: (n: string, _c: unknown, k: number) => chamadas.push(`def:${n}:${k}`),
      upsert: (n: string, _c: unknown, k: number) => chamadas.push(`ups:${n}:${k}`),
      remover: (n: string, ids: ArrayLike<number>) => chamadas.push(`rem:${n}:${ids.length}`),
    } as unknown as CenaV2;
    const s = projeto();
    const a = montarCenaEstr(s.project);
    enviarCenaEstr(cena, a);
    expect(chamadas).toContain('def:pilares:2');
    expect(chamadas.filter((x) => x.startsWith('def:'))).toHaveLength(8);
    chamadas.length = 0;
    s.exec({ type: 'updateBeam', id: 'v1', patch: { zOffsetB: 3.5 } });
    const b = montarCenaEstr(s.project, { anterior: a });
    sincronizarCenaEstr(cena, a, b);
    expect(chamadas).toEqual(['ups:vigas:1']);
  });
});
