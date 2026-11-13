import { describe, expect, it } from 'vitest';
import { ProjectStore, makeWall, type Project, type Wall } from '@hestia/model';
import { entradaCortinaDoProjeto } from './cortinaProjeto.ts';
import { ID_AUSENTE_CORTINA, montarCenaCortina, type EntradaCenaCortina } from './kernelCortina.ts';
import { projetoComCortina } from './fixtureCortina.ts';

/** O projeto base (cortina `ct1` de (0,0) a (6,0), 0,1 m de profundidade, e a parede comum `w1` em y = 5) mais as paredes dadas. */
function com(paredes: Array<Partial<Wall> & { id: string; a: { x: number; y: number }; b: { x: number; y: number } }>, tipo = 'wt_alv14'): Project {
  const s = new ProjectStore(projetoComCortina());
  for (const w of paredes) s.exec({ type: 'addWall', wall: makeWall({ typeId: tipo, levelId: 'lv_0', height: 3, ...w }) });
  return s.project;
}

const extremidades = (p: Project, id = 'ct1') => entradaCortinaDoProjeto(p).entrada.cortinas.find((c) => c.id === id)?.extremidades;

describe('vizinhança das pontas da cortina (seção 110)', () => {
  it('sem parede no nó e sem noJoin, a cortina não leva extremidades (nada muda em relação à fase 2)', () => {
    expect(extremidades(projetoComCortina())).toBeUndefined();
  });

  it('parede comum que SAI do nó (L): vizinha, ângulo reto, lado esquerdo, faces e espessura', () => {
    const p = com([{ id: 'wl', a: { x: 0, y: 0 }, b: { x: 0, y: 4 } }]);
    const [ini, fim] = extremidades(p)!;
    expect(ini).toMatchObject({ fim: 'start', vizinhaId: 'wl', vizinhaCortina: false, atravessa: false, lado: 0, noJoin: false });
    expect(ini!.angulo).toBeCloseTo(Math.PI / 2, 9);
    expect(ini!.espessura).toBeGreaterThan(0.05);
    const t = ini!.espessura;
    // As duas faces são paralelas ao eixo da parede (x = ±t/2) e correm do nó (y = 0) a y = 4.
    expect(Math.abs(ini!.face1[0])).toBeCloseTo(t / 2, 9);
    expect(ini!.face1[1]).toBeCloseTo(0, 9);
    expect(ini!.face1[3]).toBeCloseTo(4, 9);
    expect(ini!.face1[0] * ini!.face2[0]).toBeLessThan(0);
    expect(fim).toMatchObject({ fim: 'end', vizinhaId: null, vizinhaCortina: false });
    expect(Number.isNaN(fim!.angulo)).toBe(true);
  });

  it('parede comum que ATRAVESSA o nó (T) e a do outro lado do eixo (lado direito)', () => {
    const t = com([{ id: 'wt', a: { x: 6, y: -3 }, b: { x: 6, y: 3 } }]);
    const [, fim] = extremidades(t)!;
    expect(fim).toMatchObject({ fim: 'end', vizinhaId: 'wt', atravessa: true, lado: 2 });
    // Parede que sai do nó para baixo: lado direito (-y) em relação a quem sai do nó para dentro da cortina.
    const l = com([{ id: 'wb', a: { x: 0, y: 0 }, b: { x: 0, y: -3 } }]);
    expect(extremidades(l)![0]).toMatchObject({ vizinhaId: 'wb', atravessa: false, lado: 1 });
  });

  it('outra cortina que sai do nó é vizinha cortina; colinear dá ângulo de 180°', () => {
    const s = new ProjectStore(projetoComCortina());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'ct2', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 6, y: 0 }, b: { x: 6, y: 4 }, height: 3 }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'ct3', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: -5, y: 0 }, height: 3 }) });
    const e1 = extremidades(s.project, 'ct1')!;
    expect(e1[1]).toMatchObject({ vizinhaId: 'ct2', vizinhaCortina: true, atravessa: false });
    expect(e1[1]!.angulo).toBeCloseTo(Math.PI / 2, 9);
    expect(e1[0]).toMatchObject({ vizinhaId: 'ct3', vizinhaCortina: true });
    expect(e1[0]!.angulo).toBeCloseTo(Math.PI, 9);
    // As faces de uma cortina vizinha são as da faixa do sistema dela (0,1 m de profundidade, linha central).
    expect(Math.abs(e1[1]!.face1[0] - 6)).toBeCloseTo(0.05, 9);
    expect(e1[1]!.espessura).toBeCloseTo(0.1, 9);
  });

  it('nó com três paredes em direções diferentes não é resolvido na v1; a passante dividida no nó vale como T', () => {
    const tres = com([
      { id: 'wa', a: { x: 0, y: 0 }, b: { x: 0, y: 4 } },
      { id: 'wb', a: { x: 0, y: 0 }, b: { x: -4, y: 0 } },
    ]);
    expect(extremidades(tres)).toBeUndefined();
    const passante = com([
      { id: 'wa', a: { x: 0, y: 0 }, b: { x: 0, y: 4 } },
      { id: 'wb', a: { x: 0, y: 0 }, b: { x: 0, y: -4 } },
    ]);
    expect(extremidades(passante)![0]).toMatchObject({ vizinhaId: 'wa', atravessa: true, lado: 2 });
  });

  it('a tolerância de junção do projeto decide o que é "no nó"; parede de outro nível ou em outra altura não conta', () => {
    const longe = com([{ id: 'wl', a: { x: 0, y: 0.05 }, b: { x: 0, y: 4 } }]);
    // A ponta da parede está a 5 cm do nó e o nó fica fora do corpo dela: sem vizinha com a tolerância padrão (2 cm).
    expect(extremidades(longe)).toBeUndefined();
    const perto = structuredClone(longe);
    perto.settings.joinTolerance = 0.06;
    expect(extremidades(perto)![0]).toMatchObject({ vizinhaId: 'wl' });
    const outroNivel = com([{ id: 'wl', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, levelId: 'lv_1' }]);
    expect(extremidades(outroNivel)).toBeUndefined();
    const alta = com([{ id: 'wl', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, baseOffset: 3.5 }]);
    expect(extremidades(alta)).toBeUndefined();
  });

  it('noJoinStart e noJoinEnd da parede desligam a junção da ponta, com ou sem vizinha', () => {
    const s = new ProjectStore(com([{ id: 'wl', a: { x: 0, y: 0 }, b: { x: 0, y: 4 } }]));
    s.exec({ type: 'updateElements', ids: ['ct1'], patch: { noJoinStart: true, noJoinEnd: true } });
    const [ini, fim] = extremidades(s.project)!;
    expect(ini).toMatchObject({ vizinhaId: 'wl', noJoin: true });
    expect(fim).toMatchObject({ vizinhaId: null, noJoin: true });
  });
});

describe('seção 110 montada pelo adaptador', () => {
  const entradaCom = (p: Project): EntradaCenaCortina => entradaCortinaDoProjeto(p).entrada;

  it('toda cortina tem duas linhas; sem vizinha as colunas de face e ângulo são NaN e a vizinha é ID_AUSENTE', () => {
    const c = montarCenaCortina(entradaCom(projetoComCortina()));
    expect(c.nLinhas.cortina_extremidades).toBe(2);
    const s = c.secoes.cortina_extremidades;
    expect(s['fim']).toEqual([0, 1]);
    expect(s['vizinha_num']).toEqual([ID_AUSENTE_CORTINA, ID_AUSENTE_CORTINA]);
    expect(s['flags']).toEqual([0, 0]);
    expect(s['angulo']!.every(Number.isNaN)).toBe(true);
    expect(s['face1_ax']!.every(Number.isNaN)).toBe(true);
  });

  it('parede comum e cortina vizinhas: tipo, lado, flags, ângulo e número da cortina vizinha', () => {
    const s0 = new ProjectStore(com([{ id: 'wt', a: { x: 0, y: -3 }, b: { x: 0, y: 3 } }]));
    s0.exec({ type: 'addWall', wall: makeWall({ id: 'ct2', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 6, y: 0 }, b: { x: 6, y: 4 }, height: 3 }) });
    const c = montarCenaCortina(entradaCom(s0.project));
    const col = c.secoes.cortina_extremidades;
    const linha = (cortina: string, fim: number) => {
      const k = col['cortina_num']!.findIndex((n, i) => n === c.cortinaDe.get(cortina) && col['fim']![i] === fim);
      return Object.fromEntries(Object.entries(col).map(([nome, v]) => [nome, v[k]!]));
    };
    const ini = linha('ct1', 0)!;
    expect([ini['vizinha_tipo'], ini['lado'], ini['flags']]).toEqual([0, 2, 4]);
    expect(ini['vizinha_num']).not.toBe(ID_AUSENTE_CORTINA);
    const fim = linha('ct1', 1)!;
    expect([fim['vizinha_num'], fim['vizinha_tipo'], fim['flags']]).toEqual([c.cortinaDe.get('ct2'), 1, 0]);
    expect(fim['angulo']).toBeCloseTo(Math.PI / 2, 9);
    expect(linha('ct2', 0)!['vizinha_num']).toBe(c.cortinaDe.get('ct1'));
    // A cortina leva noJoin nos bits 2 e 3 de `flags`.
    expect(c.secoes.cortinas['flags']).toEqual([0, 0]);
  });

  it('noJoin vai ao bit 0 da ponta e aos bits 2 e 3 da cortina; a numeração é estável ao remontar', () => {
    const s = new ProjectStore(com([{ id: 'wl', a: { x: 0, y: 0 }, b: { x: 0, y: 4 } }]));
    s.exec({ type: 'updateElements', ids: ['ct1'], patch: { noJoinEnd: true } });
    const a = montarCenaCortina(entradaCom(s.project));
    expect(a.secoes.cortina_extremidades['flags']).toEqual([0, 1]);
    expect(a.secoes.cortinas['flags']).toEqual([8]);
    const b = montarCenaCortina(entradaCom(s.project), a);
    expect(b.secoes.cortina_extremidades['id_num']).toEqual(a.secoes.cortina_extremidades['id_num']);
  });
});
