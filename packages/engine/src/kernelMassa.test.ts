import { describe, expect, it } from 'vitest';
import { ProjectStore, type Mass } from '@hestia/model';
import { SECOES } from '../../geom/src/kernel/v2/esquema.gerado.ts';
import { diferencaMassa, montarCenaMassa, type CenaMassa, type DiferencaSecaoMassa, type NomeSecaoMassa } from './kernelMassa.ts';
import { entradaMassaDoProjeto } from './massaProjeto.ts';
import { projetoComMassas } from './fixtureMassa.ts';

const cenaDe = (s: ProjectStore, anterior?: CenaMassa): CenaMassa => montarCenaMassa(entradaMassaDoProjeto(s.project).entrada, anterior);
const dif = (d: DiferencaSecaoMassa[], nome: NomeSecaoMassa): DiferencaSecaoMassa | undefined => d.find((x) => x.secao === nome);

describe('kernelMassa: montagem das seções 140 a 142 e niveis', () => {
  it('as colunas vêm do esquema gerado e as contagens batem com as massas de referência', () => {
    const c = montarCenaMassa(entradaMassaDoProjeto(projetoComMassas()).entrada);
    expect(Object.keys(c.secoes.massas).sort()).toEqual(SECOES.massas.colunas.map((x) => x.nome).sort());
    expect(Object.keys(c.secoes.massa_secoes).sort()).toEqual(SECOES.massa_secoes.colunas.map((x) => x.nome).sort());
    expect(Object.keys(c.secoes.massa_pontos).sort()).toEqual(SECOES.massa_pontos.colunas.map((x) => x.nome).sort());
    // 6 massas; M1 e M3 com 2 seções, M2 com 2, M4 e o bulbo da M5 com 5, a pétala com 4; livres: M1 (2 x 4) e a pétala (4 x 8).
    expect(c.nLinhas.massas).toBe(6);
    expect(c.nLinhas.massa_secoes).toBe(2 + 2 + 2 + 5 + 5 + 4);
    expect(c.nLinhas.massa_pontos).toBe(2 * 4 + 4 * 8);
    expect(c.nLinhas.niveis).toBe(11);
  });

  it('a numeração é estável: editar uma massa mantém o número das outras', () => {
    const s = new ProjectStore(projetoComMassas());
    const antes = cenaDe(s);
    s.exec({ type: 'updateMass', id: 'm1', patch: { origem: { x: 1, y: 0 } } });
    const depois = cenaDe(s, antes);
    for (const id of ['m2', 'm3', 'm4', 'm5', 'm5p']) expect(depois.massaDe.get(id)).toBe(antes.massaDe.get(id));
    expect(depois.massaDe.get('m1')).toBe(antes.massaDe.get('m1'));
  });

  it('sem montagem anterior, a diferença é tudo novo', () => {
    const c = cenaDe(new ProjectStore(projetoComMassas()));
    const d = diferencaMassa(null, c);
    expect(dif(d, 'massas')!.nUpsert).toBe(c.nLinhas.massas);
    expect(dif(d, 'niveis')!.nUpsert).toBe(11);
    expect(d.every((x) => x.remover.length === 0)).toBe(true);
  });
});

describe('kernelMassa: envio por diferença (A.8 item 4)', () => {
  it('editar a origem de M1 reenvia só a linha de M1 na seção 140 e nada das outras seções', () => {
    const s = new ProjectStore(projetoComMassas());
    const antes = cenaDe(s);
    s.exec({ type: 'updateMass', id: 'm1', patch: { origem: { x: 1, y: 0 } } });
    const d = diferencaMassa(antes, cenaDe(s, antes));
    expect(d.map((x) => x.secao)).toEqual(['massas']);
    const massas = dif(d, 'massas')!;
    expect(massas.nUpsert).toBe(1);
    expect(massas.upsert['id_num']![0]).toBe(antes.massaDe.get('m1'));
    expect(massas.upsert['ox']![0]).toBe(1);
  });

  it('editar uma seção de M1 reenvia só as seções e os pontos de M1', () => {
    const s = new ProjectStore(projetoComMassas());
    const antes = cenaDe(s);
    const m1 = s.project.elements['m1'] as Mass;
    const secoes = m1.secoes.map((x, i) => (i === 1 ? { ...x, rotacao: 0.5 } : x));
    s.exec({ type: 'setMassSecoes', id: 'm1', secoes });
    const d = diferencaMassa(antes, cenaDe(s, antes));
    const numM1 = antes.massaDe.get('m1');
    expect(dif(d, 'massas')).toBeUndefined();
    expect(dif(d, 'massa_secoes')!.nUpsert).toBe(1);
    expect(dif(d, 'massa_secoes')!.upsert['massa_num']).toEqual([numM1]);
    expect(dif(d, 'massa_pontos')).toBeUndefined();
  });

  it('mudar só a cor não gera diferença nenhuma', () => {
    const s = new ProjectStore(projetoComMassas());
    const antes = cenaDe(s);
    s.exec({ type: 'updateMass', id: 'm2', patch: { color: '#00ff00', name: 'Cilindro' } });
    expect(diferencaMassa(antes, cenaDe(s, antes))).toEqual([]);
  });

  it('apagar uma massa vira remoção dela, sem tocar nas outras', () => {
    const s = new ProjectStore(projetoComMassas());
    const antes = cenaDe(s);
    s.exec({ type: 'deleteElements', ids: ['m3'] });
    const d = diferencaMassa(antes, cenaDe(s, antes));
    expect(dif(d, 'massas')!.remover).toEqual([antes.massaDe.get('m3')]);
    expect(dif(d, 'massas')!.nUpsert).toBe(0);
    expect(dif(d, 'massa_secoes')!.remover).toHaveLength(2);
    expect(dif(d, 'massa_secoes')!.nUpsert).toBe(0);
  });
});
