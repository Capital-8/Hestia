import { CATALOGO_PADRAO, FAMILIA_ARMARIO } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { custoEstimado, etiquetaDaLinha, listaDePecas, listaPecasCsv, resumirLista, type LinhaLista } from './listaPecas.ts';
import type { PecaResolvida } from './pecas.ts';
import { resolverFamilia } from './resolver.ts';

const resolvida = (tipoId = 'A80') => resolverFamilia(FAMILIA_ARMARIO, { tipoId });
const peca = (extra: Partial<PecaResolvida>): PecaResolvida => ({
  id: 'p', nome: 'P', indice: 1, papel: 'painel', eixo: 'z', vazio: false, origem: [0, 0, 0], tamanho: [0.5, 0.4], espessura: 0.018, extensao: [0.5, 0.4, 0.018],
  contorno: null, material: null, fita: null, veio: null, grupo: null, chapa: null, usinagens: [], deAninhado: null, ...extra,
});
const nl = (linhas: LinhaLista[], nome: string): LinhaLista => linhas.find((l) => l.nomes.includes(nome))!;

describe('listaDePecas: armário A80', () => {
  const linhas = listaDePecas(resolvida().pecas);
  it('11 peças viram 8 linhas; as idênticas somam quantidade', () => {
    expect(linhas).toHaveLength(8);
    expect(linhas.reduce((s, l) => s + l.quantidade, 0)).toBe(11);
    const lat = nl(linhas, 'Lateral esquerda');
    expect(lat.quantidade).toBe(2);
    expect(lat.nomes).toEqual(['Lateral esquerda', 'Lateral direita']);
    expect(lat.ids).toEqual(['latE', 'latD']);
    expect(nl(linhas, 'Porta 1').quantidade).toBe(2);
    expect(nl(linhas, 'Travessa frontal').quantidade).toBe(2);
  });
  it('lateral: comprimento = a maior dimensão, fita no lado certo, veio ao longo do comprimento', () => {
    const l = nl(linhas, 'Lateral esquerda');
    expect([l.comprimento, l.largura, l.espessura]).toEqual([577, 560, 18]);
    expect(l.fita).toEqual({ c1: null, c2: null, l1: null, l2: 'fita_pvc' });
    expect(l.veio).toBe('comprimento');
    expect(l.chapa).toBe('mdf18');
    expect(l.papel).toBe('lateral');
    expect(l.area).toBeCloseTo(0.56 * 0.577, 9);
  });
  it('prateleira (a ≥ b): c1 = s, c2 = n; a fita norte cai em c2', () => {
    const p = nl(linhas, 'Prateleira');
    expect([p.comprimento, p.largura]).toEqual([764, 519]);
    expect(p.fita).toEqual({ c1: null, c2: 'fita_pvc', l1: null, l2: null });
    expect(p.veio).toBe('comprimento');
  });
  it('porta: fita nos 4 lados; material livre sem chapa; fundo com veio livre', () => {
    const p = nl(linhas, 'Porta 1');
    expect(p.fita).toEqual({ c1: 'fita_pvc', c2: 'fita_pvc', l1: 'fita_pvc', l2: 'fita_pvc' });
    expect([p.comprimento, p.largura]).toEqual([591, 396]);
    expect(p.chapa).toBeNull();
    expect(p.material).toBe('mat_porta');
    expect(nl(linhas, 'Fundo').veio).toBe('livre');
  });
  it('ordem: por chapa/material, espessura, comprimento e largura decrescentes', () => {
    for (let i = 1; i < linhas.length; i++) {
      const [a, b] = [linhas[i - 1]!, linhas[i]!];
      const ka = a.chapa ?? a.material ?? ''; const kb = b.chapa ?? b.material ?? '';
      expect(ka <= kb).toBe(true);
      if (ka === kb) {
        expect(a.espessura >= b.espessura).toBe(true);
        if (a.espessura === b.espessura) expect(a.comprimento >= b.comprimento).toBe(true);
      }
    }
  });
});

describe('listaDePecas: casos de borda', () => {
  it('peças vazias não entram; lista vazia; não altera a entrada', () => {
    expect(listaDePecas([])).toEqual([]);
    expect(listaDePecas([peca({ vazio: true })])).toEqual([]);
    const l = [peca({ id: 'a' }), peca({ id: 'b' })];
    const antes = JSON.stringify(l);
    expect(listaDePecas(l)).toHaveLength(1);
    expect(JSON.stringify(l)).toBe(antes);
  });
  it('a == b usa u como comprimento; a < b usa v; veio b com a < b é comprimento, com a >= b é largura', () => {
    const quad = listaDePecas([peca({ tamanho: [0.4, 0.4], veio: 'a', fita: { s: 'f', o: 'g' } })])[0]!;
    expect(quad.fita).toEqual({ c1: 'f', c2: null, l1: 'g', l2: null });
    expect(quad.veio).toBe('comprimento');
    const alto = listaDePecas([peca({ tamanho: [0.3, 0.5], veio: 'a', fita: { l: 'x' } })])[0]!;
    expect([alto.comprimento, alto.largura]).toEqual([500, 300]);
    expect(alto.fita).toEqual({ c1: null, c2: 'x', l1: null, l2: null });
    expect(alto.veio).toBe('largura');
    const largo = listaDePecas([peca({ tamanho: [0.5, 0.3], veio: 'b' })])[0]!;
    expect(largo.veio).toBe('largura');
  });
  it('contorno poligonal usa a área do polígono; usinagens contadas por tipo e separam grupos', () => {
    const ele = [0, 0, 0.6, 0, 0.6, 0.3, 0.3, 0.3, 0.3, 0.6, 0, 0.6];
    const u = (id: string, tipo: 'furo' | 'rasgo' | 'recorte', x: number) => ({ id, tipo, face: 'a' as const, u: x, v: 0.1, diametro: tipo === 'furo' ? 0.005 : 0, largura: tipo === 'furo' ? 0 : 0.01, comprimento: tipo === 'furo' ? 0 : 0.1, profundidade: 0.01 });
    const l = listaDePecas([peca({ contorno: ele, tamanho: [0.6, 0.6], extensao: [0.6, 0.6, 0.018] })]);
    expect(l[0]!.area).toBeCloseTo(0.27, 9);
    const g = listaDePecas([
      peca({ id: 'a', usinagens: [u('1', 'furo', 0.1), u('2', 'furo', 0.2), u('3', 'rasgo', 0.3), u('4', 'recorte', 0.4)] }),
      peca({ id: 'b', usinagens: [u('1', 'furo', 0.1)] }),
      peca({ id: 'c', usinagens: [u('1', 'furo', 0.1)] }),
    ]);
    expect(g).toHaveLength(2);
    const ga = g.find((x) => x.furos === 2)!;
    expect([ga.furos, ga.rasgos, ga.recortes, ga.quantidade]).toEqual([2, 1, 1, 1]);
    expect(g.find((x) => x.furos === 1)!.quantidade).toBe(2);
  });
});

describe('resumirLista e custo', () => {
  const linhas = listaDePecas(resolvida().pecas);
  const r = resumirLista(linhas);
  it('totais por chapa, fita e usinagem', () => {
    expect(r.totalPecas).toBe(11);
    expect(r.areaM2).toBeCloseTo(linhas.reduce((s, l) => s + l.quantidade * l.area, 0), 9);
    expect(r.porChapa.map((x) => `${x.chapa}:${x.espessura}`)).toEqual(['mdf18:18', 'null:6', 'null:18', 'null:25']);
    expect(r.porChapa.find((x) => x.chapa === 'mdf18')!.pecas).toBe(7);
    expect(r.porChapa.at(-1)!.chapa).toBeNull();
    expect(r.porChapa.reduce((s, x) => s + x.area, 0)).toBeCloseTo(r.areaM2, 9);
    expect(r.usinagens).toEqual({ furos: 0, rasgos: 0, recortes: 0 });
  });
  it('fita em metros: soma de quantidade × lado', () => {
    expect(r.fitaMetros).toHaveLength(1);
    expect(r.fitaMetros[0]!.fita).toBe('fita_pvc');
    // laterais 2 × 0,56 + base 0,8 + prateleira 0,764 + rodapé 0,764 + tampo 0,8 + portas 2 × 2 × (0,591 + 0,396)
    expect(r.fitaMetros[0]!.metros).toBeCloseTo(2 * 0.56 + 0.8 + 0.764 + 0.764 + 0.8 + 2 * 2 * (0.591 + 0.396), 6);
  });
  it('custo: chapas com perda, fitas com perda, ferragens (própria, catálogo ou zero) e total das parcelas arredondadas', () => {
    const ferr = [{ id: 'dobradica', nome: 'D', codigo: null, quantidade: 8, custo: null }, { id: 'x', nome: 'X', codigo: null, quantidade: 2, custo: 10 }, { id: 'sem', nome: 'S', codigo: null, quantidade: 5, custo: null }];
    const catalogo = { ...CATALOGO_PADRAO, fitas: [{ id: 'fita_pvc', nome: 'Fita', espessura: 1, altura: 22, custoM: 1.2 }] };
    const c = custoEstimado(r, catalogo, ferr);
    const area18 = r.porChapa.find((x) => x.chapa === 'mdf18')!.area;
    expect(c.chapas).toBeCloseTo(Math.round(area18 * 1.15 * 90 * 100) / 100, 2);
    expect(c.fitas).toBeCloseTo(Math.round(r.fitaMetros[0]!.metros * 1.1 * 1.2 * 100) / 100, 2);
    expect(c.ferragens).toBe(8 * 6 + 2 * 10);
    expect(c.total).toBeCloseTo(c.chapas + c.fitas + c.ferragens, 2);
    expect(custoEstimado(r, catalogo, [], { perdaChapa: 0, perdaFita: 0 }).chapas).toBeCloseTo(Math.round(area18 * 90 * 100) / 100, 2);
    expect(custoEstimado(resumirLista([]), CATALOGO_PADRAO, [])).toEqual({ chapas: 0, fitas: 0, ferragens: 0, total: 0 });
  });
});

describe('csv e etiqueta', () => {
  const linhas = listaDePecas(resolvida().pecas);
  it('cabeçalho, separador ; e vírgula decimal, aspas quando preciso', () => {
    const csv = listaPecasCsv(linhas);
    const ls = csv.split('\n');
    expect(ls[0]).toBe('Qtd;Peça;Papel;Chapa;Material;Comprimento;Largura;Espessura;Veio;Fita C1;Fita C2;Fita L1;Fita L2;Furos;Rasgos;Recortes;Área');
    expect(ls).toHaveLength(linhas.length + 1);
    const lat = ls.find((x) => x.includes('Lateral esquerda'))!;
    expect(lat).toBe('2;Lateral esquerda / Lateral direita;lateral;mdf18;mdf18;577;560;18;comprimento;;;;fita_pvc;0;0;0;0,3231');
    const estranha = listaPecasCsv([{ ...linhas[0]!, nome: 'Peça "A"; teste', nomes: ['Peça "A"; teste'], comprimento: 12.5 }]);
    expect(estranha.split('\n')[1]).toContain('"Peça ""A""; teste"');
    expect(estranha.split('\n')[1]).toContain(';12,5;');
    expect(listaPecasCsv([])).toBe(ls[0]);
  });
  it('etiqueta de 3 linhas', () => {
    const e = etiquetaDaLinha(nl(linhas, 'Lateral esquerda'));
    expect(e).toEqual(['Lateral esquerda', '577 x 560 x 18 mm  |  mdf18', 'Fita: C1 - C2 - L1 - L2 fita_pvc  |  Veio: comprimento']);
    expect(etiquetaDaLinha(nl(linhas, 'Fundo'))[2]).toBe('Fita: C1 - C2 - L1 - L2 -  |  Veio: livre');
  });
});
