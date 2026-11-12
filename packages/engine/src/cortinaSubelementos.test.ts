import { describe, expect, it } from 'vitest';
import type { SubelementoCortina } from '@hestia/model';
import {
  itemDoSubelemento,
  montarParedeSubelementos,
  mesmoSubelemento,
  proximoSubelemento,
  segmentosDoSubelemento3d,
  subelementoEmPonto,
  tracosDoSubelementoPlanta,
  type ContextoParede,
  type ParedeSubelementos,
} from './cortinaSubelementos.ts';
import type { GradeCortina } from './kernelCortinaConsultas.ts';

/** Parede 4 m x 3 m, base 10 m, sistema de 0,1 m; uma extra em U (x = 2,5 m). */
const ctx: ContextoParede = {
  wallId: 'w',
  a: { x: 0, y: 0 },
  b: { x: 4, y: 0 },
  L: 4,
  H: 3,
  zBase: 10,
  profundidade: 0.1,
  extras: [{ id: 'ex1', axis: 'u', pos: 2.5 }],
};

/**
 * Grade de referência (as linhas são as que o kernel devolve, em metros): U gerada em x = 1, extra em x = 2,5 (kernel: índice 2) e V gerada em
 * z = 1,5. Colunas [0, 1, 2,5, 4] e fileiras [0, 1,5, 3]: seis células. Segmentos: borda de início (1), U gerada (2, um removido), extra (1) e
 * V gerada (2): 6 no total.
 */
function gradeReferencia(): GradeCortina {
  const cols = [0, 1, 2.5, 4];
  const rows = [0, 1.5, 3];
  const celulas = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) celulas.push({ cortina: 1, i, j, regiao: i * 2 + j, painel: 1, flags: 0, s0: cols[i]!, s1: cols[i + 1]!, z0: rows[j]!, z1: rows[j + 1]! });
  }
  return {
    linhas: [
      { cortina: 1, eixo: 'u', indice: 1, origem: 0, flags: 0, pos: 1 },
      { cortina: 1, eixo: 'u', indice: 2, origem: 1, flags: 0, pos: 2.5 },
      { cortina: 1, eixo: 'v', indice: 1, origem: 0, flags: 0, pos: 1.5 },
    ],
    celulas,
    segmentos: [
      { cortina: 1, linha: 0, k: 0, removido: false, montante: 2, de: 0, ate: 3 },
      { cortina: 1, linha: 1, k: 0, removido: false, montante: 2, de: 0, ate: 1.5 },
      { cortina: 1, linha: 1, k: 1, removido: true, montante: null, de: 1.5, ate: 3 },
      { cortina: 1, linha: 2, k: 0, removido: false, montante: 2, de: 0, ate: 3 },
      { cortina: 1, linha: 5, k: 0, removido: false, montante: 2, de: 0, ate: 2 },
      { cortina: 1, linha: 5, k: 1, removido: false, montante: 2, de: 2, ate: 4 },
    ],
  };
}

/** Cortina sem linha interna: só a borda de cada lado e uma célula. */
function gradeSemLinhas(): GradeCortina {
  return {
    linhas: [],
    celulas: [{ cortina: 1, i: 0, j: 0, regiao: 0, painel: 1, flags: 0, s0: 0, s1: 4, z0: 0, z1: 3 }],
    segmentos: [
      { cortina: 1, linha: 0, k: 0, removido: false, montante: 2, de: 0, ate: 3 },
      { cortina: 1, linha: 1, k: 0, removido: false, montante: 2, de: 0, ate: 3 },
      { cortina: 1, linha: 2, k: 0, removido: false, montante: 2, de: 0, ate: 4 },
      { cortina: 1, linha: 3, k: 0, removido: false, montante: 2, de: 0, ate: 4 },
    ],
  };
}

const parede = (): ParedeSubelementos => montarParedeSubelementos(gradeReferencia(), ctx);

describe('lista de subelementos a partir da grade', () => {
  it('monta linhas (U antes de V), segmentos e células, nessa ordem', () => {
    const p = parede();
    expect(p.itens.map((it) => it.sub.kind)).toEqual([...Array(3).fill('line'), ...Array(6).fill('segment'), ...Array(6).fill('cell')]);
  });

  it('linha gerada usa o índice entre as geradas e n = geradas + 1; a extra vira { added }', () => {
    const [gu, extra, gv] = parede().itens.map((it) => it.sub);
    expect(gu).toEqual({ wallId: 'w', kind: 'line', line: { axis: 'u', index: 1, pos: 0.25, n: 2 } });
    expect(extra).toEqual({ wallId: 'w', kind: 'line', line: { added: 'ex1' } });
    expect(gv).toEqual({ wallId: 'w', kind: 'line', line: { axis: 'v', index: 1, pos: 0.5, n: 2 } });
  });

  it('segmento: a borda usa índice 0 ou n; o meio é normalizado pelo comprimento da linha', () => {
    const itens = parede().itens;
    const borda = itens[3]!.sub;
    expect(borda.kind === 'segment' && borda.segment.line).toEqual({ axis: 'u', index: 0, pos: 0, n: 2 });
    const meioDoPrimeiro = itens[4]!.sub;
    // U gerada: k = 0 vai de z 0 a 1,5 (meio 0,75 de H = 3).
    expect(meioDoPrimeiro.kind === 'segment' && meioDoPrimeiro.segment).toEqual({ line: { axis: 'u', index: 1, pos: 0.25, n: 2 }, k: 0, nk: 2, mid: 0.25 });
    const vertical = itens[8]!.sub;
    // V gerada: k = 1 vai de x 2 a 4 (meio 3 de L = 4).
    expect(vertical.kind === 'segment' && vertical.segment).toEqual({ line: { axis: 'v', index: 1, pos: 0.5, n: 2 }, k: 1, nk: 2, mid: 0.75 });
  });

  it('segmento removido segue na lista (para restaurar) e marca `removido`', () => {
    const itens = parede().itens;
    expect(itens[5]!.removido).toBe(true);
    expect(itens[4]!.removido).toBe(false);
  });

  it('célula: CellKey com o centro normalizado e as contagens que contam as extras', () => {
    const c = parede().itens[9]!.sub;
    expect(c).toEqual({ wallId: 'w', kind: 'cell', cell: { i: 0, j: 0, s: 0.125, z: 0.25, nu: 3, nv: 2 } });
  });

  it('cortina sem linhas: o ciclo passa só pelas bordas e pela célula', () => {
    const p = montarParedeSubelementos(gradeSemLinhas(), ctx);
    expect(p.itens.map((it) => it.sub.kind)).toEqual(['segment', 'segment', 'segment', 'segment', 'cell']);
    const fim = p.itens[1]!.sub;
    expect(fim.kind === 'segment' && fim.segment.line).toEqual({ axis: 'u', index: 1, pos: 1, n: 1 });
    const base = p.itens[2]!.sub;
    expect(base.kind === 'segment' && base.segment.line).toEqual({ axis: 'v', index: 0, pos: 0, n: 1 });
    expect(proximoSubelemento(p, null)).toEqual(p.itens[0]!.sub);
    expect(proximoSubelemento(p, p.itens[4]!.sub)).toBeNull();
  });
});

describe('ciclo do Tab (proximoSubelemento)', () => {
  it('avança parede → linha → … → célula → parede, e a volta à parede dá a volta completa', () => {
    const p = parede();
    const visitados: Array<SubelementoCortina | null> = [];
    let atual: SubelementoCortina | null = null;
    for (let k = 0; k < p.itens.length + 1; k++) {
      atual = proximoSubelemento(p, atual);
      visitados.push(atual);
    }
    expect(visitados[visitados.length - 1]).toBeNull();
    expect(visitados.slice(0, -1).map((s, k) => mesmoSubelemento(s, p.itens[k]!.sub))).toEqual(Array(p.itens.length).fill(true));
  });

  it('Shift+Tab (reverso) vai da parede para a última célula e volta a ordem', () => {
    const p = parede();
    const ultima = p.itens[p.itens.length - 1]!.sub;
    expect(proximoSubelemento(p, null, true)).toEqual(ultima);
    expect(proximoSubelemento(p, ultima, true)).toEqual(p.itens[p.itens.length - 2]!.sub);
    expect(proximoSubelemento(p, p.itens[0]!.sub, true)).toBeNull();
  });

  it('Esc sai: a parede (null) é o ponto de saída do ciclo; sem itens, Tab fica na parede', () => {
    const vazia = montarParedeSubelementos({ linhas: [], celulas: [], segmentos: [] }, ctx);
    expect(proximoSubelemento(vazia, null)).toBeNull();
    expect(proximoSubelemento(vazia, null, true)).toBeNull();
  });

  it('subelemento que sumiu da lista é tratado como a parede', () => {
    const p = parede();
    const sumiu: SubelementoCortina = { wallId: 'w', kind: 'cell', cell: { i: 9, j: 9, s: 0, z: 0, nu: 3, nv: 2 } };
    expect(proximoSubelemento(p, sumiu)).toEqual(p.itens[0]!.sub);
  });
});

describe('identidade e busca', () => {
  it('mesmo subelemento: mesma parede, mesmo tipo e mesma referência', () => {
    const p = parede();
    const linha = p.itens[0]!.sub;
    expect(mesmoSubelemento(linha, { ...linha })).toBe(true);
    expect(mesmoSubelemento(linha, p.itens[1]!.sub)).toBe(false);
    expect(mesmoSubelemento(linha, { ...linha, wallId: 'outra' })).toBe(false);
    expect(itemDoSubelemento(p, p.itens[9]!.sub)?.geo).toEqual({ kind: 'cell', s0: 0, s1: 1, z0: 0, z1: 1.5 });
    expect(itemDoSubelemento(p, null)).toBeUndefined();
  });

  it('clique: linha mais perto dentro da tolerância; senão a célula que contém o ponto; senão nada', () => {
    const p = parede();
    const z = (zr: number) => 10 + zr;
    expect(subelementoEmPonto(p, 1.02, z(0.5), 0.05)).toEqual(p.itens[0]!.sub);
    expect(subelementoEmPonto(p, 2.52, z(0.5), 0.05)).toEqual(p.itens[1]!.sub);
    expect(subelementoEmPonto(p, 0.5, z(1.5), 0.05)).toEqual(p.itens[2]!.sub);
    const cel = subelementoEmPonto(p, 0.5, z(2), 0.05);
    expect(cel?.kind === 'cell' && [cel.cell.i, cel.cell.j]).toEqual([0, 1]);
    const cel2 = subelementoEmPonto(p, 3.5, z(0.5), 0.05);
    expect(cel2?.kind === 'cell' && [cel2.cell.i, cel2.cell.j]).toEqual([2, 0]);
    expect(subelementoEmPonto(p, 5, z(0.5), 0.05)).toBeNull();
  });

  it('segmento não é alvo de clique (só se chega a ele pelo Tab)', () => {
    const p = parede();
    // Ponto sobre a borda de início (x = 0), longe de qualquer linha interna: a célula ainda ganha.
    const hit = subelementoEmPonto(p, 0.01, 10.5, 0.005);
    expect(hit?.kind).toBe('cell');
  });
});

describe('geometria do destaque (puro)', () => {
  it('planta: linha de montante é um traço atravessando a profundidade; faixa e célula são contornos fechados', () => {
    const p = parede();
    const [traco] = tracosDoSubelementoPlanta(p, p.itens[0]!);
    expect(traco).toEqual({ pts: [{ x: 1, y: -0.05 }, { x: 1, y: 0.05 }], fechado: false });
    const [faixa] = tracosDoSubelementoPlanta(p, p.itens[2]!);
    expect(faixa!.fechado).toBe(true);
    expect(faixa!.pts).toHaveLength(4);
    const [celula] = tracosDoSubelementoPlanta(p, p.itens[9]!);
    expect(celula!.fechado).toBe(true);
    expect(celula!.pts.map((q) => q.x)).toEqual([0, 1, 1, 0]);
  });

  it('3D: montante vertical na altura da parede; linha V horizontal na cota dela; célula são 12 arestas', () => {
    const p = parede();
    expect(segmentosDoSubelemento3d(p, p.itens[0]!)).toEqual([[{ x: 1, y: 0, z: 10 }, { x: 1, y: 0, z: 13 }]]);
    expect(segmentosDoSubelemento3d(p, p.itens[2]!)).toEqual([[{ x: 0, y: 0, z: 11.5 }, { x: 4, y: 0, z: 11.5 }]]);
    expect(segmentosDoSubelemento3d(p, p.itens[9]!)).toHaveLength(12);
  });
});
