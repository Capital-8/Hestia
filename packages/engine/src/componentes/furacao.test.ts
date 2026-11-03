import { FAMILIA_ARMARIO } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { aplicarFuracao, detectarContatos, gerarCavilhas, REGRA_CAVILHA_PADRAO } from './furacao.ts';
import type { PecaResolvida, UsinagemResolvida } from './pecas.ts';
import { resolverFamilia } from './resolver.ts';

const peca = (id: string, eixo: 'x' | 'y' | 'z', origem: [number, number, number], ext: [number, number, number], extra: Partial<PecaResolvida> = {}): PecaResolvida => ({
  id, nome: id, indice: 1, papel: 'painel', eixo, vazio: false, origem, tamanho: eixo === 'x' ? [ext[1], ext[2]] : eixo === 'y' ? [ext[0], ext[2]] : [ext[0], ext[1]],
  espessura: eixo === 'x' ? ext[0] : eixo === 'y' ? ext[1] : ext[2], extensao: ext, contorno: null, material: null, fita: null, veio: null, grupo: null, chapa: null, usinagens: [], deAninhado: null, ...extra,
});
const AX = { x: { U: 1, V: 2, T: 0 }, y: { U: 0, V: 2, T: 1 }, z: { U: 0, V: 1, T: 2 } } as const;
function entrada(p: PecaResolvida, u: UsinagemResolvida): { pt: number[]; dir: number[] } {
  const pt = [...p.origem]; const dir = [0, 0, 0]; const { U, V, T } = AX[p.eixo]; const [a, b] = p.tamanho;
  if (u.face === 'a' || u.face === 'b') { pt[U]! += u.u; pt[V]! += u.v; if (u.face === 'b') { pt[T]! += p.espessura; dir[T] = -1; } else dir[T] = 1; }
  else if (u.face === 'o' || u.face === 'l') { pt[V]! += u.u; pt[T]! += u.v; if (u.face === 'l') { pt[U]! += a; dir[U] = -1; } else dir[U] = 1; }
  else { pt[U]! += u.u; pt[T]! += u.v; if (u.face === 'n') { pt[V]! += b; dir[V] = -1; } else dir[V] = 1; }
  return { pt, dir };
}
const perto = (a: readonly number[], b: readonly number[]): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

// latE (0), latD (1), prateleira (2): a prateleira encosta nas duas laterais em x = 0.018 e x = 0.782
const latE = peca('latE', 'x', [0, 0, 0], [0.018, 0.56, 0.7]);
const latD = peca('latD', 'x', [0.782, 0, 0], [0.018, 0.56, 0.7]);
const prat = peca('prat', 'z', [0.018, 0.02, 0.3], [0.764, 0.5, 0.018]);

describe('detectarContatos', () => {
  it('prateleira entre duas laterais: dois contatos em x, na ordem (i, j)', () => {
    const c = detectarContatos([latE, latD, prat]);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ baixo: 0, cima: 2, eixo: 'x', eixos: ['y', 'z'] });
    expect(c[0]!.plano).toBeCloseTo(0.018, 9);
    perto(c[0]!.faixa1, [0.02, 0.52]);
    perto(c[0]!.faixa2, [0.3, 0.318]);
    expect(c[1]).toMatchObject({ baixo: 2, cima: 1, eixo: 'x' });
    expect(c[1]!.plano).toBeCloseTo(0.782, 9);
  });
  it('tampo sobre a lateral: contato em z', () => {
    const tampo = peca('tampo', 'z', [0, 0, 0.7], [0.8, 0.56, 0.025]);
    const c = detectarContatos([latE, tampo]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ baixo: 0, cima: 1, eixo: 'z', eixos: ['x', 'y'] });
    perto(c[0]!.faixa1, [0, 0.018]);
    perto(c[0]!.faixa2, [0, 0.56]);
  });
  it('sem toque, só de quina (sem área), peças vazias e afastadas não geram contato', () => {
    expect(detectarContatos([latE, peca('longe', 'x', [1, 0, 0], [0.018, 0.5, 0.5])])).toEqual([]);
    expect(detectarContatos([peca('a', 'x', [0, 0, 0], [0.1, 0.1, 0.1]), peca('b', 'x', [0.1, 0.1, 0], [0.1, 0.1, 0.1])])).toEqual([]);
    expect(detectarContatos([latE, { ...prat, vazio: true }])).toEqual([]);
    expect(detectarContatos([])).toEqual([]);
  });
  it('respeita a tolerância', () => {
    const quase = peca('q', 'z', [0.018 + 5e-7, 0.02, 0.3], [0.5, 0.5, 0.018]);
    expect(detectarContatos([latE, quase])).toHaveLength(1);
    expect(detectarContatos([latE, quase], 1e-9)).toEqual([]);
  });
});

describe('gerarCavilhas', () => {
  it('prateleira na lateral esquerda: 3 furos alinhados, face b na lateral e borda o na prateleira', () => {
    const g = gerarCavilhas([latE, latD, prat]).filter((f) => f.usinagem.id.startsWith('cav0-2-'));
    expect(g).toHaveLength(6);
    const naLateral = g.filter((f) => f.peca === 0).map((f) => f.usinagem);
    const naPrat = g.filter((f) => f.peca === 2).map((f) => f.usinagem);
    expect(naLateral.map((u) => u.face)).toEqual(['b', 'b', 'b']);
    expect(naPrat.map((u) => u.face)).toEqual(['o', 'o', 'o']);
    perto(naLateral.map((u) => u.u), [0.07, 0.27, 0.47]);
    perto(naLateral.map((u) => u.v), [0.309, 0.309, 0.309]);
    perto(naPrat.map((u) => u.u), [0.05, 0.25, 0.45]);
    perto(naPrat.map((u) => u.v), [0.009, 0.009, 0.009]);
    expect(naLateral[0]).toMatchObject({ tipo: 'furo', diametro: 0.008, largura: 0, comprimento: 0 });
    expect(naLateral[0]!.profundidade).toBeCloseTo(0.012, 9);
    expect(naPrat[0]!.profundidade).toBeCloseTo(0.03, 9);
    expect(g.map((f) => f.usinagem.id)).toEqual(['cav0-2-0', 'cav0-2-0', 'cav0-2-1', 'cav0-2-1', 'cav0-2-2', 'cav0-2-2']);
    expect(g.map((f) => f.peca)).toEqual([0, 2, 0, 2, 0, 2]);
  });
  it('prateleira na lateral direita usa face a e borda l', () => {
    const g = gerarCavilhas([latE, latD, prat]).filter((f) => f.usinagem.id.startsWith('cav2-1-'));
    expect(g.filter((f) => f.peca === 1).map((f) => f.usinagem.face)).toEqual(['a', 'a', 'a']);
    expect(g.filter((f) => f.peca === 2).map((f) => f.usinagem.face)).toEqual(['l', 'l', 'l']);
  });
  it('tampo sobre a lateral: face a no tampo e borda n no topo da lateral', () => {
    const tampo = peca('tampo', 'z', [0, 0, 0.7], [0.8, 0.56, 0.025]);
    const g = gerarCavilhas([latE, tampo]);
    expect(g).toHaveLength(6);
    expect(g.filter((f) => f.peca === 1).map((f) => f.usinagem.face)).toEqual(['a', 'a', 'a']);
    expect(g.filter((f) => f.peca === 0).map((f) => f.usinagem.face)).toEqual(['n', 'n', 'n']);
    perto(g.filter((f) => f.peca === 0).map((f) => f.usinagem.u), [0.05, 0.28, 0.51]);
    perto(g.filter((f) => f.peca === 0).map((f) => f.usinagem.v), [0.009, 0.009, 0.009]);
    perto(g.filter((f) => f.peca === 1).map((f) => f.usinagem.u), [0.009, 0.009, 0.009]);
    perto(g.filter((f) => f.peca === 1).map((f) => f.usinagem.v), [0.05, 0.28, 0.51]);
  });
  it('face com face, borda com borda, contato estreito, curto ou raso não geram', () => {
    expect(gerarCavilhas([peca('a', 'z', [0, 0, 0], [0.5, 0.5, 0.018]), peca('b', 'z', [0, 0, 0.018], [0.5, 0.5, 0.018])])).toEqual([]);
    expect(gerarCavilhas([peca('a', 'y', [0, 0, 0], [0.5, 0.018, 0.5]), peca('b', 'z', [0.5, 0, 0], [0.5, 0.5, 0.018])])).toEqual([]);
    expect(gerarCavilhas([latE, peca('fino', 'z', [0.018, 0.02, 0.3], [0.5, 0.5, 0.006])])).toEqual([]);
    expect(gerarCavilhas([latE, peca('curto', 'z', [0.018, 0.02, 0.3], [0.5, 0.09, 0.018])])).toEqual([]);
    expect(gerarCavilhas([peca('f', 'x', [0.013, 0, 0], [0.005, 0.5, 0.5]), prat])).toEqual([]);
    expect(gerarCavilhas([latE, { ...peca('porta', 'y', [0.002, -0.018, 0.1], [0.396, 0.018, 0.5]), papel: 'porta' }])).toEqual([]);
    expect(gerarCavilhas([latE, { ...prat, papel: 'fundo' }])).toEqual([]);
  });
  it('contato curto mas com espaço para um furo só: furo no meio; regra personalizada muda a contagem', () => {
    const p = peca('p', 'z', [0.018, 0.02, 0.3], [0.5, 0.11, 0.018]);
    const g = gerarCavilhas([latE, p]);
    expect(g).toHaveLength(2);
    expect(g.find((f) => f.peca === 1)!.usinagem.u).toBeCloseTo(0.055, 9);
    const mais = gerarCavilhas([latE, prat], { ...REGRA_CAVILHA_PADRAO, espacamentoMax: 0.1, minimoPorContato: 2 });
    expect(mais.filter((f) => f.peca === 0)).toHaveLength(5);
    const menos = gerarCavilhas([latE, prat], { ...REGRA_CAVILHA_PADRAO, margem: 0.2 });
    expect(menos.filter((f) => f.peca === 0)).toHaveLength(2);
  });
  it('não altera a entrada e é determinística', () => {
    const lista = [latE, latD, prat];
    const antes = JSON.stringify(lista);
    const a = gerarCavilhas(lista);
    expect(JSON.stringify(lista)).toBe(antes);
    expect(gerarCavilhas(lista)).toEqual(a);
  });
});

describe('aplicarFuracao', () => {
  it('acrescenta as usinagens ao fim, em cópias', () => {
    const base = [{ ...latE, usinagens: [{ id: 'x', tipo: 'furo' as const, face: 'a' as const, u: 0.1, v: 0.1, diametro: 0.005, largura: 0, comprimento: 0, profundidade: -1 }] }, latD, prat];
    const g = gerarCavilhas(base);
    const r = aplicarFuracao(base, g);
    expect(base[0]!.usinagens).toHaveLength(1);
    expect(r[0]!.usinagens.map((u) => u.id)).toEqual(['x', 'cav0-2-0', 'cav0-2-1', 'cav0-2-2']);
    expect(r[2]!.usinagens).toHaveLength(6);
    expect(r[1]!.usinagens).toHaveLength(3);
    expect(r[0]).not.toBe(base[0]);
  });
});

describe('propriedade: no armário baixo os furos de cada par se encontram', () => {
  it('em todos os tipos: ponto de entrada igual e direções opostas, dentro de cada peça', () => {
    for (const t of FAMILIA_ARMARIO.tipos) {
      const pecas = resolverFamilia(FAMILIA_ARMARIO, { tipoId: t.id }).pecas;
      const g = gerarCavilhas(pecas);
      expect(g.length, t.id).toBeGreaterThan(0);
      expect(g.length % 2).toBe(0);
      for (let i = 0; i < g.length; i += 2) {
        const [a, b] = [g[i]!, g[i + 1]!];
        expect(a.usinagem.id).toBe(b.usinagem.id);
        expect(a.peca).not.toBe(b.peca);
        const ea = entrada(pecas[a.peca]!, a.usinagem); const eb = entrada(pecas[b.peca]!, b.usinagem);
        perto(ea.pt, eb.pt);
        perto(ea.dir, eb.dir.map((n) => -n));
        for (const [pc, u] of [[pecas[a.peca]!, a.usinagem], [pecas[b.peca]!, b.usinagem]] as const) {
          const [x, y] = pc.tamanho;
          if (u.face === 'a' || u.face === 'b') { expect(u.u - u.diametro / 2).toBeGreaterThanOrEqual(-1e-9); expect(u.u + u.diametro / 2).toBeLessThanOrEqual(x + 1e-9); expect(u.v + u.diametro / 2).toBeLessThanOrEqual(y + 1e-9); expect(u.profundidade).toBeLessThanOrEqual(pc.espessura); }
          else { const ao = u.face === 'n' || u.face === 's' ? x : y; expect(u.u + u.diametro / 2).toBeLessThanOrEqual(ao + 1e-9); expect(u.v + u.diametro / 2).toBeLessThanOrEqual(pc.espessura + 1e-9); expect(u.v - u.diametro / 2).toBeGreaterThanOrEqual(-1e-9); }
        }
      }
    }
  });
});
