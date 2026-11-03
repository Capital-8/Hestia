import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Aninhado, type Familia, type Parametro, type Peca, type Usinagem } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverFamilia } from './resolver.ts';
import type { PecaResolvida, UsinagemResolvida } from './pecas.ts';

const comp = (id: string, padrao: number): Parametro => ({ id, nome: id, tipo: 'comprimento', escopo: 'instancia', padrao, min: 0, max: 10000 });
const mk = (id: string, pecas: Peca[], extra: Partial<Familia> = {}, params: Parametro[] = []): Familia => ({
  formato: FAMILIA_FORMATO, versao: FAMILIA_VERSAO, id, nome: id, categoria: 'marcenaria', unidade: 'mm', hospedagem: 'nivel', origem: 'canto',
  parametros: [comp('L', 2000), comp('A', 2000), comp('P', 600), ...params], planos: [], pecas, aninhados: [], ferragens: [], tipos: [], ...extra,
});
const tampo: Peca = { id: 'tampo', nome: 'Tampo', papel: 'tampo', eixo: 'z', origem: ['0', '0', 'A'], tamanho: ['L', 'P'], espessura: '18' };
const lat: Peca = { id: 'lat', nome: 'Lateral', papel: 'lateral', eixo: 'x', origem: ['0', '0', '0'], tamanho: ['P', 'A'], espessura: '18' };
const caixa = (pecas: Peca[] = [tampo, lat]): Familia => mk('caixa', pecas, {}, []);
const filhoPadrao = (): Familia => ({ ...caixa(), parametros: [comp('L', 500), comp('A', 400), comp('P', 300)] });
const aninhado = (extra: Partial<Aninhado> = {}): Aninhado => ({ id: 'mod', nome: 'Módulo', familiaId: 'caixa', valores: { L: '400', A: '700', P: '500' }, origem: ['100', '50', '0'], ...extra });
const pai = (a: Aninhado[], pecas: Peca[] = [], params: Parametro[] = []): Familia => mk('pai', pecas, { aninhados: a }, params);
const bib = (...fs: Familia[]) => (id: string): Familia | undefined => fs.find((f) => f.id === id);
const resolve = (f: Familia, ...filhas: Familia[]) => resolverFamilia(f, { biblioteca: bib(f, ...filhas) });
const por = (r: { pecas: PecaResolvida[] }, id: string): PecaResolvida => r.pecas.find((p) => p.id === id)!;
const perto = (a: readonly number[], b: readonly number[]): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe('aninhado sem rotação', () => {
  it('traz as peças da filha com identidade, valores e translação', () => {
    const r = resolve(pai([aninhado()]), caixa());
    expect(r.erros).toEqual([]);
    expect(r.pecas.map((p) => p.id)).toEqual(['mod/tampo', 'mod/lat']);
    const t = por(r, 'mod/tampo');
    perto(t.origem, [0.1, 0.05, 0.7]);
    perto(t.extensao, [0.4, 0.5, 0.018]);
    perto(t.tamanho, [0.4, 0.5]);
    expect(t.nome).toBe('Módulo: Tampo');
    expect(t.deAninhado).toBe('mod');
    expect(t.papel).toBe('tampo');
    perto(por(r, 'mod/lat').origem, [0.1, 0.05, 0]);
    perto(por(r, 'mod/lat').extensao, [0.018, 0.5, 0.7]);
  });
  it('valores são fórmulas do pai e tipoId escolhe o tipo da filha', () => {
    const filha: Familia = { ...caixa(), tipos: [{ id: 'T', nome: 'T', valores: { A: 900 } }] };
    const f = pai([aninhado({ valores: { L: 'largura * 2', P: '500' }, tipoId: 'T' })], [], [{ id: 'largura', nome: 'largura', tipo: 'comprimento', escopo: 'tipo', padrao: 250 }]);
    const r = resolve(f, filha);
    expect(r.erros).toEqual([]);
    perto(por(r, 'mod/tampo').origem, [0.1, 0.05, 0.9]);
    perto(por(r, 'mod/tampo').tamanho, [0.5, 0.5]);
  });
  it('quando falsa pula; repetir 0 pula; repetir n traz n cópias com ids distintos', () => {
    expect(resolve(pai([aninhado({ quando: '1 > 2' })]), caixa()).pecas).toEqual([]);
    expect(resolve(pai([aninhado({ repetir: '0' })]), caixa()).pecas).toEqual([]);
    const r = resolve(pai([aninhado({ repetir: '3', origem: ['(i - 1) * 500', '0', '0'] })]), caixa());
    expect(r.erros).toEqual([]);
    expect(r.pecas.map((p) => p.id)).toEqual(['mod[1]/tampo', 'mod[1]/lat', 'mod[2]/tampo', 'mod[2]/lat', 'mod[3]/tampo', 'mod[3]/lat']);
    expect(por(r, 'mod[3]/tampo').origem[0]).toBeCloseTo(1, 6);
    expect(por(r, 'mod[2]/tampo').nome).toBe('Módulo 2: Tampo');
  });
});

describe('rotação em múltiplos de 90°', () => {
  const caso = (rot: string) => resolve(pai([aninhado({ rotacao: rot })]), caixa());
  it('90°: gira anti-horário em torno da origem local e depois translada', () => {
    const r = caso('90');
    const t = por(r, 'mod/tampo');
    perto(t.origem, [-0.4, 0.05, 0.7]);
    perto(t.extensao, [0.5, 0.4, 0.018]);
    perto(t.tamanho, [0.5, 0.4]);
    expect(t.eixo).toBe('z');
    const l = por(r, 'mod/lat');
    perto(l.origem, [-0.4, 0.05, 0]);
    perto(l.extensao, [0.5, 0.018, 0.7]);
    perto(l.tamanho, [0.5, 0.7]);
    expect(l.eixo).toBe('y');
  });
  it('180°', () => {
    const r = caso('180');
    perto(por(r, 'mod/tampo').origem, [-0.3, -0.45, 0.7]);
    perto(por(r, 'mod/tampo').extensao, [0.4, 0.5, 0.018]);
    perto(por(r, 'mod/tampo').tamanho, [0.4, 0.5]);
    perto(por(r, 'mod/lat').origem, [0.082, -0.45, 0]);
    expect(por(r, 'mod/lat').eixo).toBe('x');
  });
  it('270°, -90° e 450° (equivalentes a 270, 270 e 90)', () => {
    const t270 = por(caso('270'), 'mod/tampo');
    perto(t270.origem, [0.1, -0.35, 0.7]);
    perto(t270.extensao, [0.5, 0.4, 0.018]);
    expect(por(caso('270'), 'mod/lat').eixo).toBe('y');
    perto(por(caso('-90'), 'mod/tampo').origem, t270.origem);
    perto(por(caso('450'), 'mod/tampo').origem, por(caso('90'), 'mod/tampo').origem);
  });
  it('360 vira 0 e rotação que não é múltiplo de 90 é erro e pula o aninhado', () => {
    perto(por(caso('360'), 'mod/tampo').origem, [0.1, 0.05, 0.7]);
    const r = caso('45');
    expect(r.pecas).toEqual([]);
    expect(r.erros.some((e) => e.onde.startsWith('aninhado:mod') && e.mensagem.includes('múltiplo de 90'))).toBe(true);
  });
});

describe('contornos poligonais ficam coerentes no mundo', () => {
  const ele = [['0', '0'], ['L', '0'], ['L', 'P / 2'], ['L / 2', 'P / 2'], ['L / 2', 'P'], ['0', 'P']] as Array<[string, string]>;
  const polZ: Peca = { id: 'pz', nome: 'Tampo L', papel: 'tampo', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: '18', contorno: { tipo: 'poligono', pontos: ele } };
  const polY: Peca = { id: 'py', nome: 'Frente L', papel: 'painel', eixo: 'y', origem: ['0', '0', '0'], tamanho: ['L', 'A'], espessura: '18', contorno: { tipo: 'poligono', pontos: [['0', '0'], ['L', '0'], ['L', 'A / 2'], ['L / 2', 'A / 2'], ['L / 2', 'A'], ['0', 'A']] } };
  const verts = (p: PecaResolvida): string[] => {
    const c = p.contorno!;
    const out: string[] = [];
    for (let i = 0; i < c.length; i += 2) {
      const u = c[i]!; const v = c[i + 1]!;
      const [x, y, z] = p.origem;
      // coordenadas do plano da peça no mundo (a que fica depois de descartar o eixo da espessura)
      const q = p.eixo === 'x' ? [y + u, z + v] : p.eixo === 'y' ? [x + u, z + v] : [x + u, y + v];
      out.push(q.map((n) => (Math.round(n * 1e6) / 1e6).toFixed(6)).join(','));
    }
    return out.sort();
  };
  const esperado = (orig: PecaResolvida, rotGraus: number, tx: number, ty: number, novoEixo: 'x' | 'y' | 'z'): string[] => {
    const c = orig.contorno!;
    const th = (rotGraus * Math.PI) / 180;
    const out: string[] = [];
    for (let i = 0; i < c.length; i += 2) {
      const u = c[i]!; const v = c[i + 1]!;
      const [ox, oy, oz] = orig.origem;
      const w = orig.eixo === 'x' ? [ox, oy + u, oz + v] : orig.eixo === 'y' ? [ox + u, oy, oz + v] : [ox + u, oy + v, oz];
      const x = w[0]! * Math.cos(th) - w[1]! * Math.sin(th) + tx;
      const y = w[0]! * Math.sin(th) + w[1]! * Math.cos(th) + ty;
      const q = novoEixo === 'x' ? [y, w[2]!] : novoEixo === 'y' ? [x, w[2]!] : [x, y];
      out.push(q.map((n) => (Math.round(n * 1e6) / 1e6).toFixed(6)).join(','));
    }
    return out.sort();
  };
  for (const rot of [0, 90, 180, 270]) {
    for (const [peca, nome] of [[polZ, 'eixo z'], [polY, 'eixo y']] as const) {
      it(`${nome}, ${rot}°`, () => {
        const filha = mk('caixa', [peca]);
        const alone = resolverFamilia(filha, { valores: { L: 400, A: 700, P: 500 } }).pecas[0]!;
        const r = resolve(pai([aninhado({ rotacao: String(rot) })]), filha);
        expect(r.erros).toEqual([]);
        const nova = r.pecas[0]!;
        expect(nova.contorno).not.toBeNull();
        const novoEixo = alone.eixo === 'z' ? 'z' : rot % 180 === 0 ? alone.eixo : alone.eixo === 'x' ? 'y' : 'x';
        expect(nova.eixo).toBe(novoEixo);
        expect(verts(nova)).toEqual(esperado(alone, rot, 0.1, 0.05, novoEixo));
        // contorno anti-horário e dentro da caixa da peça
        let a2 = 0; const c = nova.contorno!;
        for (let i = 0; i < c.length; i += 2) { const j = (i + 2) % c.length; a2 += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!; }
        expect(a2).toBeGreaterThan(0);
        expect(Math.min(...c.filter((_, i) => i % 2 === 0))).toBeCloseTo(0, 6);
        expect(Math.min(...c.filter((_, i) => i % 2 === 1))).toBeCloseTo(0, 6);
      });
    }
  }
});

describe('erros', () => {
  it('família ausente na biblioteca ou sem biblioteca', () => {
    const f = pai([aninhado()]);
    const r = resolverFamilia(f, { biblioteca: bib(f) });
    expect(r.pecas).toEqual([]);
    expect(r.erros[0]!.mensagem).toContain('caixa');
    expect(r.erros[0]!.mensagem).toContain('não encontrada');
    expect(resolverFamilia(f).erros.length).toBeGreaterThan(0);
  });
  it('família que aninha a si mesma', () => {
    const f = mk('pai', [], { aninhados: [aninhado({ familiaId: 'pai' })] });
    const r = resolve(f);
    expect(r.erros.some((e) => e.mensagem.includes('a si mesma'))).toBe(true);
  });
  it('recursão mútua para no limite de aninhamento, sem estourar', () => {
    const a = mk('a', [tampo], { aninhados: [aninhado({ id: 'x', familiaId: 'b' })] });
    const b = mk('b', [tampo], { aninhados: [aninhado({ id: 'y', familiaId: 'a' })] });
    const r = resolverFamilia(a, { biblioteca: bib(a, b) });
    expect(r.erros.some((e) => e.mensagem.includes('limite'))).toBe(true);
    expect(r.pecas.length).toBeGreaterThan(0);
  });
  it('erro dentro da filha vem prefixado e não derruba o resto', () => {
    const ruim: Familia = { ...caixa([{ ...tampo, espessura: '0' }, lat]), parametros: [comp('L', 500), comp('A', 400), comp('P', 300)] };
    const r = resolve(pai([aninhado()]), ruim);
    expect(r.pecas.map((p) => p.id)).toEqual(['mod/lat']);
    expect(r.erros.some((e) => e.onde.startsWith('aninhado:mod/'))).toBe(true);
  });
  it('fórmula quebrada no aninhado vira erro com onde do aninhado', () => {
    const r = resolve(pai([aninhado({ origem: ['1 +', '0', '0'] })]), caixa());
    expect(r.pecas).toEqual([]);
    expect(r.erros.some((e) => e.onde.startsWith('aninhado:mod'))).toBe(true);
  });
  it('não altera as famílias de entrada e é determinístico', () => {
    const f = pai([aninhado({ rotacao: '90' })]);
    const filha = filhoPadrao();
    const antes = JSON.stringify([f, filha]);
    const a = resolve(f, filha);
    expect(JSON.stringify([f, filha])).toBe(antes);
    expect(resolve(f, filha)).toEqual(a);
  });
});

describe('usinagens giradas junto com a peça (E5)', () => {
  const AX = { x: { U: 1, V: 2, T: 0 }, y: { U: 0, V: 2, T: 1 }, z: { U: 0, V: 1, T: 2 } } as const;
  /** Ponto de entrada e direção da usinagem (furo) no mundo, na convenção de `pecas.ts` e `model/tipos.ts`. */
  function entrada(p: PecaResolvida, u: UsinagemResolvida): { pt: number[]; dir: number[] } {
    const pt = [...p.origem]; const dir = [0, 0, 0]; const { U, V, T } = AX[p.eixo]; const [a, b] = p.tamanho;
    if (u.face === 'a' || u.face === 'b') { pt[U]! += u.u; pt[V]! += u.v; if (u.face === 'b') { pt[T]! += p.espessura; dir[T] = -1; } else dir[T] = 1; }
    else if (u.face === 'o' || u.face === 'l') { pt[V]! += u.u; pt[T]! += u.v; if (u.face === 'l') { pt[U]! += a; dir[U] = -1; } else dir[U] = 1; }
    else { pt[U]! += u.u; pt[T]! += u.v; if (u.face === 'n') { pt[V]! += b; dir[V] = -1; } else dir[V] = 1; }
    return { pt, dir };
  }
  const cantos = (p: PecaResolvida, u: UsinagemResolvida): string[] => {
    const { U, V, T } = AX[p.eixo];
    return ([[u.u, u.v], [u.u + u.comprimento, u.v], [u.u + u.comprimento, u.v + u.largura], [u.u, u.v + u.largura]] as const).map(([x, y]) => {
      const pt = [...p.origem]; pt[U]! += x; pt[V]! += y; if (u.face === 'b') pt[T]! += p.espessura;
      return pt.map((n) => (Math.round(n * 1e6) / 1e6).toFixed(6)).join(',');
    }).sort();
  };
  const giro = (graus: number) => { const t = (graus * Math.PI) / 180; const c = Math.round(Math.cos(t)); const s = Math.round(Math.sin(t)); return (v: number[]): number[] => [v[0]! * c - v[1]! * s, v[0]! * s + v[1]! * c, v[2]!]; };
  const furos: Usinagem[] = [
    { id: 'fa', tipo: 'furo', face: 'a', posicao: ['100', '150'], diametro: '8', profundidade: '10' },
    { id: 'fb', tipo: 'furo', face: 'b', posicao: ['120', '60'], diametro: '8', profundidade: 'passante' },
    { id: 'fo', tipo: 'furo', face: 'o', posicao: ['120', '9'], diametro: '8', profundidade: '30' },
    { id: 'fl', tipo: 'furo', face: 'l', posicao: ['200', '9'], diametro: '8', profundidade: '30' },
    { id: 'fn', tipo: 'furo', face: 'n', posicao: ['150', '9'], diametro: '8', profundidade: '30' },
    { id: 'fs', tipo: 'furo', face: 's', posicao: ['250', '9'], diametro: '8', profundidade: '30' },
  ];
  const retas: Usinagem[] = [
    { id: 'ra', tipo: 'rasgo', face: 'a', posicao: ['20', '30'], largura: '6', comprimento: '200', profundidade: '8' },
    { id: 'cb', tipo: 'recorte', face: 'b', posicao: ['50', '70'], largura: '100', comprimento: '150', profundidade: 'passante' },
  ];
  for (const eixo of ['x', 'y', 'z'] as const) {
    for (const rot of [0, 90, 180, 270]) {
      it(`eixo ${eixo}, ${rot}°: entrada e direção dos furos e cantos dos recortes coincidem no mundo`, () => {
        const peca: Peca = { id: 'p', nome: 'P', papel: 'painel', eixo, origem: ['30', '40', '50'], tamanho: ['400', '500'], espessura: '18', usinagens: [...furos, ...retas] };
        const filha = mk('caixa', [peca]);
        const sozinha = resolverFamilia(filha).pecas[0]!;
        expect(sozinha.usinagens).toHaveLength(8);
        const r = resolve(pai([aninhado({ rotacao: String(rot), valores: {} })]), filha);
        expect(r.erros).toEqual([]);
        const nova = r.pecas[0]!;
        expect(nova.usinagens).toHaveLength(8);
        const R = giro(rot);
        for (const u0 of sozinha.usinagens) {
          const u1 = nova.usinagens.find((x) => x.id === u0.id)!;
          expect(u1, u0.id).toBeDefined();
          expect(u1.tipo).toBe(u0.tipo);
          expect(u1.profundidade).toBeCloseTo(u0.profundidade, 9);
          if (u0.tipo === 'furo') {
            const e0 = entrada(sozinha, u0); const e1 = entrada(nova, u1);
            const esperadoPt = R(e0.pt).map((n, k) => n + [0.1, 0.05, 0][k]!);
            e1.pt.forEach((n, k) => expect(n, `${u0.id} pt${k}`).toBeCloseTo(esperadoPt[k]!, 6));
            e1.dir.forEach((n, k) => expect(n, `${u0.id} dir${k}`).toBeCloseTo(R(e0.dir)[k]!, 6));
            expect(u1.diametro).toBeCloseTo(u0.diametro, 9);
          } else {
            const esperado = cantos(sozinha, u0).map((s) => { const v = s.split(',').map(Number); const w = R(v); return [w[0]! + 0.1, w[1]! + 0.05, w[2]!].map((n) => (Math.round(n * 1e6) / 1e6).toFixed(6)).join(','); }).sort();
            expect(cantos(nova, u1), u0.id).toEqual(esperado);
            expect(u1.largura * u1.comprimento).toBeCloseTo(u0.largura * u0.comprimento, 9);
          }
        }
      });
    }
  }
  it('furos de aninhado repetido e sem rotação mantêm a face e só transladam', () => {
    const peca: Peca = { id: 'p', nome: 'P', papel: 'painel', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['400', '500'], espessura: '18', usinagens: [furos[0]!] };
    const r = resolve(pai([aninhado({ repetir: '2', origem: ['(i - 1) * 500', '0', '0'], valores: {} })]), mk('caixa', [peca]));
    expect(r.pecas.map((p) => p.usinagens[0]!.face)).toEqual(['a', 'a']);
    expect(r.pecas.map((p) => p.usinagens[0]!.u)).toEqual([0.1, 0.1]);
  });
});
