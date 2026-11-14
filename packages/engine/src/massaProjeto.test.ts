import { describe, expect, it } from 'vitest';
import { ProjectStore, secaoCirculo, type Project } from '@hestia/model';
import { entradaMassaDoProjeto, massasDoProjeto } from './massaProjeto.ts';
import { montarCenaMassa, type CenaMassa, type NomeSecaoMassa } from './kernelMassa.ts';
import { massaM1, massaM2, massaM3, projetoComMassas, RAIO_M3 } from './fixtureMassa.ts';

/** Linhas de uma seção da cena como objetos (coluna → valor). */
const linhasDe = (c: CenaMassa, nome: NomeSecaoMassa): Array<Record<string, number>> =>
  Array.from({ length: c.nLinhas[nome] }, (_, i) => Object.fromEntries(Object.entries(c.secoes[nome]).map(([k, v]) => [k, v[i]!])));

describe('massa: projeto → seções 140 a 142', () => {
  it('M1 (livre), M2 (círculo) e M3 (polígono) geram as colunas esperadas', () => {
    const p = projetoComMassas();
    const cena = montarCenaMassa(entradaMassaDoProjeto(p).entrada);
    const num = (id: string): number => cena.massaDe.get(id)!;
    const secoes = linhasDe(cena, 'massa_secoes');

    const doM1 = secoes.filter((s) => s['massa_num'] === num('m1'));
    expect(doM1).toHaveLength(2);
    expect(doM1[0]).toMatchObject({ ordem: 0, z: 0, forma: 3, p1: 0, p2: 0, lados: 0, rot: 0, escala: 1, dx: 0, dy: 0 });
    expect(doM1[1]).toMatchObject({ ordem: 1, z: 9, forma: 3 });
    const pontosM1 = linhasDe(cena, 'massa_pontos').filter((q) => q['secao_num'] === doM1[0]!['id_num']);
    expect(pontosM1.map((q) => [q['ordem'], q['x'], q['y']])).toEqual([
      [0, -5, -3],
      [1, 5, -3],
      [2, 5, 3],
      [3, -5, 3],
    ]);

    const doM2 = secoes.filter((s) => s['massa_num'] === num('m2'));
    expect(doM2[0]).toMatchObject({ forma: 0, p1: 5, p2: 0, lados: 0 });
    expect(doM2[1]).toMatchObject({ z: 12, forma: 0, p1: 5 });

    const doM3 = secoes.filter((s) => s['massa_num'] === num('m3'));
    expect(doM3[0]).toMatchObject({ forma: 2, p1: RAIO_M3, lados: 4, rot: 0 });
    expect(doM3[1]).toMatchObject({ z: 30, forma: 2, p1: RAIO_M3, lados: 4, rot: Math.PI / 2 });

    const massas = linhasDe(cena, 'massas');
    expect(massas.find((m) => m['id_num'] === num('m1'))).toMatchObject({ nivel_num: 0, ox: 0, oy: 0, z_base: 0, interp: 0, resolucao: 64, arr_n: 1, arr_cx: 0, arr_cy: 0, arr_ang: 0 });
    expect(massas.find((m) => m['id_num'] === num('m5p'))).toMatchObject({ interp: 1, arr_n: 12, arr_cx: 0, arr_cy: 0, arr_ang: 2 * Math.PI });
  });

  it('a cota da base é a do nível mais o deslocamento da base', () => {
    const s = new ProjectStore(projetoComMassas());
    s.exec({ type: 'addMass', mass: { ...massaM2(), id: 'm9', levelId: 'lv_1', baseOffset: 1.5 } });
    const e = entradaMassaDoProjeto(s.project);
    const m9 = e.entrada.massas.find((m) => m.id === 'm9')!;
    expect(m9.nivelNum).toBe(1);
    expect(m9.zBase).toBe(3 + 1.5);
  });

  it('o perfil de círculo, polígono e livre sai com a forma certa e sem pontos sobrando', () => {
    const e = entradaMassaDoProjeto(projetoComMassas()).entrada;
    const porId = new Map(e.massas.map((m) => [m.id, m] as const));
    expect(porId.get('m2')!.secoes[0]!.pontos).toEqual([]);
    expect(porId.get('m3')!.secoes[0]!.pontos).toEqual([]);
    expect(porId.get('m1')!.secoes[0]!.pontos).toHaveLength(4);
    expect(porId.get('m1')!.secoes[0]!.forma).toBe(3);
  });

  it('mudar a cor ou o nome não muda nenhuma assinatura de geometria', () => {
    const antes = entradaMassaDoProjeto(projetoComMassas());
    const s = new ProjectStore(projetoComMassas());
    s.exec({ type: 'updateMass', id: 'm1', patch: { color: '#ff0000', name: 'Outro nome' } });
    const depois = entradaMassaDoProjeto(s.project);
    expect(depois.assinaturas.get('m1')).toBe(antes.assinaturas.get('m1'));
    expect(depois.assinatura).toBe(antes.assinatura);
  });

  it('mudar a geometria de uma massa muda a assinatura só dela', () => {
    const antes = entradaMassaDoProjeto(projetoComMassas());
    const s = new ProjectStore(projetoComMassas());
    s.exec({ type: 'updateMass', id: 'm1', patch: { origem: { x: 2, y: 0 } } });
    const depois = entradaMassaDoProjeto(s.project);
    expect(depois.assinaturas.get('m1')).not.toBe(antes.assinaturas.get('m1'));
    expect(depois.assinaturas.get('m2')).toBe(antes.assinaturas.get('m2'));
    expect(depois.assinatura).not.toBe(antes.assinatura);
  });

  it('massa recusada pelo modelo ou em nível inexistente fica fora do envio e aparece como inválida', () => {
    const p = projetoComMassas();
    const ruim = { ...massaM1(), id: 'ruim', secoes: [secaoCirculo(0, 2)] };
    const semNivel = { ...massaM3(), id: 'semNivel', levelId: 'lv_nao_existe' };
    const q: Project = { ...p, elements: { ...p.elements, ruim, semNivel } };
    const e = entradaMassaDoProjeto(q);
    expect(e.invalidas.sort()).toEqual(['ruim', 'semNivel']);
    expect(e.enviadas).not.toContain('ruim');
    expect(e.enviadas).not.toContain('semNivel');
    expect(e.enviadas).toContain('m1');
    expect(massasDoProjeto(q)).toHaveLength(8);
  });
});
