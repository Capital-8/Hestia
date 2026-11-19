import type { PecaResolvida, UsinagemResolvida } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { dxfProblems2000 } from './dxfCheck.ts';
import { dxfDasPecas } from './dxfPecas.ts';

const peca = (extra: Partial<PecaResolvida>): PecaResolvida => ({
  id: 'p', nome: 'P', indice: 1, papel: 'painel', eixo: 'z', vazio: false, origem: [0, 0, 0], tamanho: [0.4, 0.5], espessura: 0.018, extensao: [0.4, 0.5, 0.018],
  contorno: null, material: null, fita: null, veio: null, grupo: null, chapa: null, usinagens: [], deAninhado: null, ...extra,
});
const us = (id: string, tipo: UsinagemResolvida['tipo'], face: UsinagemResolvida['face'], u: number, v: number, d: number, l: number, c: number): UsinagemResolvida => ({ id, tipo, face, u, v, diametro: d, largura: l, comprimento: c, profundidade: 0.01 });

interface Ent { tipo: string; layer: string; pares: Array<[number, string]> }
/** Entidades da seção ENTITIES, com camada e pares. */
function entidades(txt: string): Ent[] {
  const ls = txt.split('\r\n'); if (ls.at(-1) === '') ls.pop();
  const pares: Array<[number, string]> = [];
  for (let i = 0; i + 1 < ls.length; i += 2) pares.push([Number(ls[i]), ls[i + 1]!]);
  const ini = pares.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && pares[i - 1]?.[1] === 'SECTION');
  const fim = pares.findIndex(([c, v], i) => i > ini && c === 0 && v === 'ENDSEC');
  const out: Ent[] = [];
  for (const par of pares.slice(ini + 1, fim)) {
    if (par[0] === 0) out.push({ tipo: par[1], layer: '', pares: [] });
    else { const e = out.at(-1)!; e.pares.push(par); if (par[0] === 8 && e.layer === '') e.layer = par[1]; }
  }
  return out;
}
const vertices = (txt: string): Array<{ layer: string; x: number; y: number }> => entidades(txt).filter((e) => e.tipo === 'VERTEX').map((e) => ({ layer: e.layer, x: Number(e.pares.find(([c]) => c === 10)![1]), y: Number(e.pares.find(([c]) => c === 20)![1]) }));
const contar = (txt: string, tipo: string, layer?: string): number => entidades(txt).filter((e) => e.tipo === tipo && (layer === undefined || e.layer === layer)).length;

describe('dxfDasPecas', () => {
  const p1 = peca({ id: 'a', nome: 'Painel A', usinagens: [us('f1', 'furo', 'a', 0.1, 0.2, 0.008, 0, 0), us('f2', 'furo', 'b', 0.3, 0.2, 0.008, 0, 0), us('f3', 'furo', 'o', 0.1, 0.009, 0.008, 0, 0), us('r1', 'rasgo', 'a', 0.01, 0.01, 0, 0.006, 0.3), us('c1', 'recorte', 'b', 0.1, 0.1, 0, 0.05, 0.1)] });
  const p2 = peca({ id: 'b', nome: 'Painel B', tamanho: [0.3, 0.2], extensao: [0.3, 0.2, 0.018] });
  const txt = dxfDasPecas([p1, p2]);
  it('estrutura R2000 válida, termina em CRLF, unidade mm e camadas esperadas', () => {
    expect(dxfProblems2000(txt)).toEqual([]);
    expect(txt.endsWith('\r\n')).toBe(true);
    expect(txt).toContain('AC1015');
    for (const l of ['PECA', 'FURO_A', 'FURO_B', 'RASGO', 'RECORTE', 'TEXTO']) expect(txt, l).toContain(`\r\n${l}\r\n`);
  });
  it('conta: 1 contorno por peça, furos em face a/b (borda não entra), rasgo, recorte e 1 texto por peça', () => {
    expect(contar(txt, 'POLYLINE', 'PECA')).toBe(2);
    expect(contar(txt, 'POLYLINE', 'FURO_A')).toBe(1);
    expect(contar(txt, 'POLYLINE', 'FURO_B')).toBe(1);
    expect(contar(txt, 'POLYLINE', 'RASGO')).toBe(1);
    expect(contar(txt, 'POLYLINE', 'RECORTE')).toBe(1);
    expect(contar(txt, 'TEXT', 'TEXTO')).toBe(2);
    expect(contar(txt, 'POLYLINE')).toBe(6);
  });
  it('geometria em mm: retângulo da primeira peça de 0 a 400 × 0 a 500; segunda peça deslocada 400 + 50', () => {
    const v = vertices(txt).filter((x) => x.layer === 'PECA');
    expect(v).toHaveLength(8);
    expect(v.slice(0, 4).map((x) => [x.x, x.y])).toEqual([[0, 0], [400, 0], [400, 500], [0, 500]]);
    expect(v.slice(4).map((x) => [x.x, x.y])).toEqual([[450, 0], [750, 0], [750, 200], [450, 200]]);
  });
  it('furo: 24 vértices num círculo de raio 4 mm em torno do centro; rasgo e recorte são retângulos', () => {
    const f = vertices(txt).filter((x) => x.layer === 'FURO_A');
    expect(f).toHaveLength(24);
    for (const x of f) expect(Math.hypot(x.x - 100, x.y - 200)).toBeCloseTo(4, 3);
    const r = vertices(txt).filter((x) => x.layer === 'RASGO').map((x) => [x.x, x.y]);
    expect(r).toEqual([[10, 10], [310, 10], [310, 16], [10, 16]]);
    expect(vertices(txt).filter((x) => x.layer === 'RECORTE')).toHaveLength(4);
  });
  it('segmentos do furo e espaço são opções; mínimo de 8 segmentos', () => {
    const t2 = dxfDasPecas([p1, p2], { segmentosDoFuro: 12, espaco: 0.1 });
    expect(vertices(t2).filter((x) => x.layer === 'FURO_A')).toHaveLength(12);
    expect(vertices(t2).filter((x) => x.layer === 'PECA')[4]!.x).toBeCloseTo(500, 3);
    expect(vertices(dxfDasPecas([p1], { segmentosDoFuro: 3 })).filter((x) => x.layer === 'FURO_A')).toHaveLength(8);
  });
  it('contorno poligonal vira a polilinha da peça; vazias ficam de fora; lista vazia continua válida', () => {
    const ele = peca({ id: 'l', nome: 'L', contorno: [0, 0, 0.6, 0, 0.6, 0.3, 0.3, 0.3, 0.3, 0.6, 0, 0.6], tamanho: [0.6, 0.6], extensao: [0.6, 0.6, 0.018] });
    const t = dxfDasPecas([ele, { ...p2, vazio: true }]);
    expect(dxfProblems2000(t)).toEqual([]);
    expect(vertices(t).filter((x) => x.layer === 'PECA')).toHaveLength(6);
    expect(contar(t, 'TEXT')).toBe(1);
    const vazio = dxfDasPecas([]);
    expect(dxfProblems2000(vazio)).toEqual([]);
    expect(contar(vazio, 'POLYLINE')).toBe(0);
  });
  it('é determinística', () => { expect(dxfDasPecas([p1, p2])).toBe(dxfDasPecas([p1, p2])); });
});
