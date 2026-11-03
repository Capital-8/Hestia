import { FAMILIA_ARMARIO, FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type Peca, type Usinagem } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import type { PecaResolvida } from './pecas.ts';
import { resolverFamilia } from './resolver.ts';

const clone = <T>(x: T): T => structuredClone(x);
const por = (pecas: PecaResolvida[], id: string): PecaResolvida[] => pecas.filter((p) => p.id === id);
const perto = (a: readonly number[], b: readonly number[]): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe('armário baixo A80 (tipo padrão)', () => {
  const r = resolverFamilia(FAMILIA_ARMARIO);
  it('resolve sem erro: 11 peças (2 laterais, base, 2 travessas, prateleira, fundo, 2 portas, rodapé, tampo)', () => {
    expect(r.erros).toEqual([]);
    expect(r.pecas).toHaveLength(11);
    expect(r.pecas.map((p) => p.id)).toEqual(['latE', 'latD', 'base', 'trF', 'trT', 'prat', 'fundo', 'porta', 'porta', 'rodap', 'tampo']);
  });
  it('valores do env em mm e derivados corretos', () => {
    expect(r.env).toMatchObject({ L: 800, A: 720, P: 560, 'corpo.esp': 18, esp: 18, zBase: 118, tampoEsp: 25, hCorpo: 695, fundoEsp: 6, profL: 560, yFundo: 539 });
  });
  it('lateral esquerda em metros, com extensão e eixo certos', () => {
    const l = por(r.pecas, 'latE')[0]!;
    expect(l.eixo).toBe('x');
    perto(l.origem, [0, 0, 0.118]);
    perto(l.tamanho, [0.56, 0.577]);
    expect(l.espessura).toBeCloseTo(0.018, 9);
    perto(l.extensao, [0.018, 0.56, 0.577]);
    expect(l.material).toBe('mdf18');
    expect(l.fita).toEqual({ n: 'fita_pvc' });
    expect(l.veio).toBe('b');
    expect(l.deAninhado).toBeNull();
    expect(l.contorno).toBeNull();
  });
  it('duas portas repetidas: índices, nomes, posições e quando', () => {
    const p = por(r.pecas, 'porta');
    expect(p.map((x) => x.indice)).toEqual([1, 2]);
    expect(p.map((x) => x.nome)).toEqual(['Porta 1', 'Porta 2']);
    perto(p[0]!.origem, [0.002, -0.018, 0.102]);
    perto(p[1]!.origem, [0.402, -0.018, 0.102]);
    perto(p[0]!.tamanho, [0.396, 0.591]);
    expect(p[0]!.material).toBe('mat_porta');
  });
  it('tudo em metros arredondado a 1 µm (nenhum valor com mais de 6 casas)', () => {
    for (const p of r.pecas) for (const v of [...p.origem, ...p.tamanho, ...p.extensao, p.espessura]) expect(Math.abs(v * 1e6 - Math.round(v * 1e6))).toBeLessThan(1e-6);
  });
  it('é determinística e não altera a família', () => {
    const f = clone(FAMILIA_ARMARIO);
    const a = resolverFamilia(f);
    expect(JSON.stringify(f)).toBe(JSON.stringify(FAMILIA_ARMARIO));
    expect(resolverFamilia(f)).toEqual(a);
  });
});

describe('tipos, valores e flex', () => {
  it('tipo escolhido muda valores; instância sobrescreve; sem tipo vale o padrão do parâmetro', () => {
    const a60 = resolverFamilia(FAMILIA_ARMARIO, { tipoId: 'A60' });
    expect(a60.env).toMatchObject({ L: 600, nPortas: 1 });
    expect(por(a60.pecas, 'porta')).toHaveLength(1);
    const a120 = resolverFamilia(FAMILIA_ARMARIO, { tipoId: 'A120' });
    expect(a120.erros).toEqual([]);
    expect(por(a120.pecas, 'porta')).toHaveLength(0);
    expect(por(a120.pecas, 'fundo')).toHaveLength(0);
    expect(por(a120.pecas, 'prat')).toHaveLength(2);
    expect(por(a120.pecas, 'latE')[0]!.material).toBe('mdf25');
    expect(por(a120.pecas, 'latE')[0]!.espessura).toBeCloseTo(0.025, 9);
    expect(resolverFamilia(FAMILIA_ARMARIO, { tipoId: 'A80', valores: { L: 1000 } }).env.L).toBe(1000);
    expect(resolverFamilia({ ...clone(FAMILIA_ARMARIO), tipoPadrao: undefined }).env.L).toBe(800);
  });
  it('todos os tipos do exemplo resolvem limpos e com as peças dentro da caixa do módulo', () => {
    for (const t of FAMILIA_ARMARIO.tipos) {
      const r = resolverFamilia(FAMILIA_ARMARIO, { tipoId: t.id });
      expect(r.erros, t.id).toEqual([]);
      const L = Number(r.env.L) / 1000;
      for (const p of r.pecas.filter((x) => x.papel !== 'porta' && x.papel !== 'tampo')) {
        expect(p.origem[0]).toBeGreaterThanOrEqual(-1e-9);
        expect(p.origem[0] + p.extensao[0]).toBeLessThanOrEqual(L + 1e-9);
      }
    }
  });
  it('propriedade: aumentar L em Δ alarga exatamente a caixa em Δ (60 amostras)', () => {
    const largura = (L: number): number => {
      const r = resolverFamilia(FAMILIA_ARMARIO, { valores: { L } });
      const xs = r.pecas.flatMap((p) => [p.origem[0], p.origem[0] + p.extensao[0]]);
      return Math.max(...xs) - Math.min(...xs);
    };
    for (let L = 400; L <= 1190; L += 13) expect(largura(L + 10) - largura(L)).toBeCloseTo(0.01, 6);
  });
  it('trocar a chapa muda espessura e dependentes, sem erro', () => {
    for (const corpo of ['mdf15', 'mdf18', 'mdf25']) {
      const r = resolverFamilia(FAMILIA_ARMARIO, { valores: { corpo } });
      expect(r.erros).toEqual([]);
      const esp = Number(r.env['corpo.esp']) / 1000;
      expect(por(r.pecas, 'latE')[0]!.espessura).toBeCloseTo(esp, 9);
      expect(por(r.pecas, 'base')[0]!.tamanho[0]).toBeCloseTo(0.8, 9);
    }
  });
  it('montagem base entre laterais: a base fica entre as laterais', () => {
    const r = resolverFamilia(FAMILIA_ARMARIO, { valores: { montagem: 'base_entre_laterais' } });
    perto(por(r.pecas, 'base')[0]!.origem, [0.018, 0, 0.1]);
    expect(por(r.pecas, 'base')[0]!.tamanho[0]).toBeCloseTo(0.764, 9);
  });
});

const caixa = (extra: Partial<Peca> = {}, mais: Partial<Familia> = {}): Familia => ({
  ...clone(FAMILIA_ARMARIO), parametros: clone(FAMILIA_ARMARIO.parametros).slice(0, 3), planos: [], ferragens: [], tipos: [], tipoPadrao: undefined,
  pecas: [{ id: 'p', nome: 'P', papel: 'painel', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: '18', ...extra }], ...mais,
});

describe('erros e casos de borda (nunca lança)', () => {
  it('fórmula quebrada: erro com onde e a peça fica de fora, as outras seguem', () => {
    const f = clone(FAMILIA_ARMARIO);
    f.pecas.find((p) => p.id === 'base')!.origem[1] = '0 +';
    const r = resolverFamilia(f);
    expect(r.erros.some((e) => e.onde === 'peca:base.origem[1]')).toBe(true);
    expect(r.pecas.some((p) => p.id === 'base')).toBe(false);
    expect(r.pecas.some((p) => p.id === 'latE')).toBe(true);
  });
  it('dimensão não positiva é erro', () => {
    const r = resolverFamilia(caixa({ espessura: '0' }));
    expect(r.pecas).toEqual([]);
    expect(r.erros[0]).toMatchObject({ onde: 'peca:p.dimensao' });
    expect(resolverFamilia(caixa({ tamanho: ['L - 5000', 'P'] })).pecas).toEqual([]);
  });
  it('fórmula que não dá número (texto) e divisão por zero são erros', () => {
    expect(resolverFamilia(caixa({ espessura: '"x"' })).erros.length).toBeGreaterThan(0);
    expect(resolverFamilia(caixa({ espessura: '1 / 0' })).erros.length).toBeGreaterThan(0);
  });
  it('ciclo entre derivados: erro de família e nenhuma peça', () => {
    const f = clone(FAMILIA_ARMARIO);
    f.parametros.find((p) => p.id === 'esp')!.formula = 'zBase - rodape';
    const r = resolverFamilia(f);
    expect(r.pecas).toEqual([]);
    expect(r.erros[0]).toMatchObject({ onde: 'familia' });
    expect(r.erros[0]!.mensagem).toContain('ciclo');
  });
  it('valor fora das opções e chapa inexistente são erros que não derrubam', () => {
    const r = resolverFamilia(FAMILIA_ARMARIO, { valores: { fundo: 'xyz', corpo: 'mdf99' } });
    expect(r.erros.some((e) => e.onde === 'parametro:fundo')).toBe(true);
    expect(r.erros.some((e) => e.onde === 'parametro:corpo')).toBe(true);
    expect(Array.isArray(r.pecas)).toBe(true);
  });
  it('repetir: limita a 64, aceita 0 e ignora negativos; i e n valem nas fórmulas e em quando', () => {
    expect(resolverFamilia(caixa({ repetir: '1000' })).pecas).toHaveLength(64);
    expect(resolverFamilia(caixa({ repetir: '0' })).pecas).toEqual([]);
    expect(resolverFamilia(caixa({ repetir: '-3' })).pecas).toEqual([]);
    const r = resolverFamilia(caixa({ repetir: '5', origem: ['(i - 1) * 100', '0', '0'], quando: 'i != 3' }));
    expect(r.erros).toEqual([]);
    expect(r.pecas.map((p) => p.indice)).toEqual([1, 2, 4, 5]);
    expect(r.pecas.map((p) => p.origem[0])).toEqual([0, 0.1, 0.3, 0.4]);
  });
  it('vazio, grupo, material de projeto e veio passam adiante', () => {
    const r = resolverFamilia(caixa({ vazio: true, grupo: 'g1', material: 'mat_x', veio: 'livre' }));
    expect(r.pecas[0]).toMatchObject({ vazio: true, grupo: 'g1', material: 'mat_x', veio: 'livre' });
  });
  it('entrada com lixo não derruba', () => {
    const lixo = { ...clone(FAMILIA_ARMARIO), parametros: [], pecas: [{ id: 'x' }] } as unknown as Familia;
    expect(() => resolverFamilia(lixo)).not.toThrow();
    expect(() => resolverFamilia({ ...clone(FAMILIA_ARMARIO), formato: FAMILIA_FORMATO, versao: FAMILIA_VERSAO, pecas: undefined } as unknown as Familia)).not.toThrow();
  });
});

describe('contorno poligonal (depende da ficha E2-contorno)', () => {
  const pontos: Array<[string, string]> = [['0', '0'], ['L', '0'], ['L', 'P / 2'], ['L / 2', 'P / 2'], ['L / 2', 'P'], ['0', 'P']];
  it('avalia, valida e orienta anti-horário; em metros', () => {
    const r = resolverFamilia(caixa({ contorno: { tipo: 'poligono', pontos } }), { valores: { L: 1000, P: 600 } });
    expect(r.erros).toEqual([]);
    perto(r.pecas[0]!.contorno!, [0, 0, 1, 0, 1, 0.3, 0.5, 0.3, 0.5, 0.6, 0, 0.6]);
    const horario = [...pontos].reverse();
    const r2 = resolverFamilia(caixa({ contorno: { tipo: 'poligono', pontos: horario } }), { valores: { L: 1000, P: 600 } });
    expect(r2.pecas[0]!.contorno).toHaveLength(12);
    const c = r2.pecas[0]!.contorno!;
    let a2 = 0;
    for (let i = 0; i < c.length; i += 2) { const j = (i + 2) % c.length; a2 += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!; }
    expect(a2).toBeGreaterThan(0);
  });
  it('contorno inválido vira erro e a peça fica de fora', () => {
    const r = resolverFamilia(caixa({ contorno: { tipo: 'poligono', pontos: [['0', '0'], ['L', '0']] } }));
    expect(r.pecas).toEqual([]);
    expect(r.erros.some((e) => e.onde === 'peca:p.contorno')).toBe(true);
  });
});

describe('chapa e usinagens (E5)', () => {
  it('peças com material de parâmetro chapa levam o id da chapa; material livre não', () => {
    const r = resolverFamilia(FAMILIA_ARMARIO);
    expect(por(r.pecas, 'latE')[0]!.chapa).toBe('mdf18');
    expect(por(r.pecas, 'porta')[0]!.chapa).toBeNull();
    expect(por(r.pecas, 'porta')[0]!.material).toBe('mat_porta');
    expect(resolverFamilia(FAMILIA_ARMARIO, { tipoId: 'A120' }).pecas.find((p) => p.id === 'latE')!.chapa).toBe('mdf25');
    expect(r.pecas.every((p) => Array.isArray(p.usinagens))).toBe(true);
  });
  const com = (usinagens: Usinagem[]): Familia => ({ ...clone(FAMILIA_ARMARIO), pecas: [{ ...clone(FAMILIA_ARMARIO).pecas.find((p) => p.id === 'latE')!, usinagens }] });
  it('furo, rasgo e recorte viram metros; passante vira -1; repetição por quantidade com i e n', () => {
    const f = com([
      { id: 'f1', tipo: 'furo', face: 'a', posicao: ['50', '100'], diametro: '5', profundidade: '10' },
      { id: 'pinos', tipo: 'furo', face: 'b', posicao: ['40 + (i - 1) * 32', '37'], diametro: '5', profundidade: 'passante', quantidade: '4' },
      { id: 'r1', tipo: 'rasgo', face: 'a', posicao: ['10', '20'], largura: '6', comprimento: '300', profundidade: '8' },
      { id: 'c1', tipo: 'recorte', face: 'a', posicao: ['100', '100'], largura: '100', comprimento: '200', profundidade: 'passante' },
    ]);
    const r = resolverFamilia(f);
    expect(r.erros).toEqual([]);
    const u = r.pecas[0]!.usinagens;
    expect(u).toHaveLength(7);
    expect(u[0]).toEqual({ id: 'f1', tipo: 'furo', face: 'a', u: 0.05, v: 0.1, diametro: 0.005, largura: 0, comprimento: 0, profundidade: 0.01 });
    expect(u.slice(1, 5).map((x) => x.u)).toEqual([0.04, 0.072, 0.104, 0.136]);
    expect(u.slice(1, 5).every((x) => x.profundidade === -1 && x.face === 'b')).toBe(true);
    expect(u[5]).toEqual({ id: 'r1', tipo: 'rasgo', face: 'a', u: 0.01, v: 0.02, diametro: 0, largura: 0.006, comprimento: 0.3, profundidade: 0.008 });
    expect(u[6]).toMatchObject({ tipo: 'recorte', largura: 0.1, comprimento: 0.2, profundidade: -1 });
  });
  it('quando falso pula; quantidade 0 pula; erros descartam só a usinagem, com onde', () => {
    const f = com([
      { id: 'a', tipo: 'furo', face: 'a', posicao: ['50', '50'], diametro: '5', profundidade: '5', quando: 'L > 5000' },
      { id: 'b', tipo: 'furo', face: 'a', posicao: ['50', '50'], diametro: '5', profundidade: '5', quantidade: '0' },
      { id: 'c', tipo: 'furo', face: 'a', posicao: ['50', '50'], profundidade: '5' },
      { id: 'd', tipo: 'furo', face: 'a', posicao: ['5000', '50'], diametro: '5', profundidade: '5' },
      { id: 'e', tipo: 'furo', face: 'a', posicao: ['50', '50'], diametro: '5', profundidade: '500' },
      { id: 'g', tipo: 'rasgo', face: 'a', posicao: ['10', '10'], largura: '0', comprimento: '10', profundidade: '5' },
      { id: 'h', tipo: 'furo', face: 'a', posicao: ['1 +', '50'], diametro: '5', profundidade: '5' },
      { id: 'ok', tipo: 'furo', face: 'a', posicao: ['50', '50'], diametro: '5', profundidade: '5' },
    ]);
    const r = resolverFamilia(f);
    expect(r.pecas[0]!.usinagens.map((x) => x.id)).toEqual(['ok']);
    const ondes = r.erros.map((e) => e.onde);
    for (const o of ['peca:latE.usinagem:c.diametro', 'peca:latE.usinagem:d.posicao', 'peca:latE.usinagem:e.profundidade', 'peca:latE.usinagem:g.largura', 'peca:latE.usinagem:h.posicao[0]']) expect(ondes, o).toContain(o);
  });
});

describe('furo em borda (E5)', () => {
  const com = (usinagens: Usinagem[]): Familia => ({ ...clone(FAMILIA_ARMARIO), pecas: [{ ...clone(FAMILIA_ARMARIO).pecas.find((p) => p.id === 'base')!, usinagens }] });
  it('borda aceita furo com posição ao longo da borda e distância da face a; recusa fora, rasgo e profundidade demais', () => {
    const ok = resolverFamilia(com([{ id: 'b1', tipo: 'furo', face: 'o', posicao: ['100', '9'], diametro: '8', profundidade: '30' }]));
    expect(ok.erros).toEqual([]);
    expect(ok.pecas[0]!.usinagens[0]).toMatchObject({ face: 'o', u: 0.1, v: 0.009, diametro: 0.008, profundidade: 0.03 });
    const ruins: Array<[Usinagem, string]> = [
      [{ id: 'x1', tipo: 'furo', face: 'n', posicao: ['100', '2'], diametro: '8', profundidade: '10' }, 'posicao'],
      [{ id: 'x2', tipo: 'furo', face: 'l', posicao: ['5000', '9'], diametro: '8', profundidade: '10' }, 'posicao'],
      [{ id: 'x3', tipo: 'rasgo', face: 's', posicao: ['10', '9'], largura: '5', comprimento: '50', profundidade: '5' }, 'face'],
      [{ id: 'x4', tipo: 'furo', face: 's', posicao: ['100', '9'], diametro: '8', profundidade: '900' }, 'profundidade'],
    ];
    for (const [u, campo] of ruins) {
      const r = resolverFamilia(com([u]));
      expect(r.pecas[0]!.usinagens, u.id).toEqual([]);
      expect(r.erros.some((e) => e.onde.startsWith(`peca:base.usinagem:${u.id}.${campo}`)), u.id).toBe(true);
    }
  });
});
