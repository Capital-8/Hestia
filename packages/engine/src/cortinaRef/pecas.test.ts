import { describe, expect, it } from 'vitest';
import { MONTANTES, PAINEIS, gerarCasos } from './casos.ts';
import { resolverCortina } from './consulta.ts';
import {
  AVISO_CELULA_PEQUENA, AVISO_MONTANTE_SOBREPOSTO, AVISO_PROFUNDIDADE_MENOR_QUE_PERFIL, AVISO_SOBRA_FUNDIDA, AVISO_POSICAO_FORA,
} from './avisos.ts';
import { PAPEL_BORDA_BASE, PAPEL_BORDA_FIM, PAPEL_BORDA_INICIO, PAPEL_BORDA_TOPO, PAPEL_INTERIOR_H, PAPEL_INTERIOR_V, PAPEL_SISTEMA, PAPEL_SOLIDO, PAPEL_VIDRO, PAPEL_VAZIO } from './pecas.ts';
import { ID_AUSENTE, type CortinaEntrada, type CurtainMullions } from './tipos.ts';

const todos = (id: string | null, join: 'vertical' | 'horizontal' = 'vertical'): CurtainMullions => ({
  interiorVertical: id, interiorHorizontal: id, borderStart: id, borderEnd: id, borderBottom: id, borderTop: id, corner: null, joinPriority: join,
});

/** Cortina 4 × 3 com grade 2 × 2 e montante 50 × 100 mm em tudo. */
function base(over: Partial<CortinaEntrada> & { mullions?: CurtainMullions; painel?: string } = {}): CortinaEntrada {
  return {
    L: 4, H: 3,
    tipo: {
      depth: 0.1, u: { mode: 'fixedNumber', count: 2 }, v: { mode: 'fixedNumber', count: 2 },
      mullions: over.mullions ?? todos('mul_ret_50x100'), defaultPanelTypeId: over.painel ?? 'pnl_vidro_10',
    },
    montantes: MONTANTES, paineis: PAINEIS, ...over,
  };
}
const achar = (nome: string): CortinaEntrada => gerarCasos().find((c) => c.nome === nome)!;
const soma = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('cortinaRef/pecas: montantes e prioridade de junção', () => {
  it('vertical manda: verticais contínuos (H), horizontais aparados na face do vertical', () => {
    const r = resolverCortina(base());
    expect(r.pecas.segmentos).toHaveLength(12); // 3 linhas × 2 segmentos em cada direção
    const v = r.pecas.montantes.filter((m) => m.vertical);
    const h = r.pecas.montantes.filter((m) => !m.vertical);
    expect(v).toHaveLength(6);
    expect(h).toHaveLength(6);
    expect(soma(v.map((m) => m.comprimento))).toBeCloseTo(3 * 3, 12); // 3 linhas × H
    v.forEach((m) => { expect(m.continuo).toBe(true); expect(m.comprimento).toBeCloseTo(1.5, 12); });
    h.forEach((m) => { expect(m.continuo).toBe(false); expect(m.comprimento).toBeCloseTo(2 - 0.025 - 0.025, 12); });
    // as pontas aparadas começam na face do vertical
    const primeiro = h.find((m) => m.indiceLinha === 0 && m.k === 0)!;
    expect(primeiro.s).toBeCloseTo(0.025, 12);
    expect(primeiro.z).toBe(0);
  });

  it('horizontal manda: o inverso', () => {
    const r = resolverCortina(base({ mullions: todos('mul_ret_50x100', 'horizontal') }));
    const v = r.pecas.montantes.filter((m) => m.vertical);
    const h = r.pecas.montantes.filter((m) => !m.vertical);
    h.forEach((m) => { expect(m.continuo).toBe(true); expect(m.comprimento).toBeCloseTo(2, 12); });
    v.forEach((m) => { expect(m.continuo).toBe(false); expect(m.comprimento).toBeCloseTo(1.5 - 0.05, 12); });
    expect(soma(h.map((m) => m.comprimento))).toBeCloseTo(3 * 4, 12); // 3 linhas × L
  });

  it('papéis: borda início/fim/base/topo e interiores', () => {
    const r = resolverCortina(base());
    const papeis = (p: number): number => r.pecas.montantes.filter((m) => m.papel === p).length;
    expect(papeis(PAPEL_BORDA_INICIO)).toBe(2);
    expect(papeis(PAPEL_BORDA_FIM)).toBe(2);
    expect(papeis(PAPEL_INTERIOR_V)).toBe(2);
    expect(papeis(PAPEL_BORDA_BASE)).toBe(2);
    expect(papeis(PAPEL_BORDA_TOPO)).toBe(2);
    expect(papeis(PAPEL_INTERIOR_H)).toBe(2);
  });

  it('papel nulo: o segmento consta da tabela mas não gera peça; a aresta livre não apara ninguém', () => {
    const r = resolverCortina(base({ mullions: { ...todos('mul_ret_50x100'), borderStart: null } }));
    expect(r.pecas.segmentos.filter((s) => s.eixo === 'u' && s.indiceLinha === 0).every((s) => s.tipoNum === null)).toBe(true);
    expect(r.pecas.montantes.filter((m) => m.papel === PAPEL_BORDA_INICIO)).toHaveLength(0);
    // o horizontal da primeira coluna começa na borda (s = 0), sem aparo
    const h = r.pecas.montantes.find((m) => !m.vertical && m.indiceLinha === 0 && m.k === 0)!;
    expect(h.s).toBe(0);
    expect(h.comprimento).toBeCloseTo(2 - 0.025, 12);
    // e o painel da primeira coluna tem só um lado com montante
    const p = r.pecas.paineis.find((x) => x.i === 0 && x.j === 0)!;
    expect(p.ladosV).toBe(1);
    expect(p.livre.s0).toBe(0);
  });

  it('montante redondo: seção circular, profundidade igual à largura', () => {
    const r = resolverCortina(base({ mullions: todos('mul_red_50') }));
    const m = r.pecas.montantes[0]!;
    expect(m.forma).toBe('round');
    expect(m.profundidade).toBeCloseTo(0.05, 12);
    expect(m.areaPerfil).toBeCloseTo(Math.PI * 0.025 * 0.025, 12);
  });

  it('peça cujo comprimento some no aparo não existe (mas o segmento sim)', () => {
    const r = resolverCortina(achar('montante largo consome a peca horizontal'));
    expect(r.pecas.montantes.filter((m) => !m.vertical)).toHaveLength(0);
    expect(r.pecas.segmentos.filter((s) => s.eixo === 'v')).toHaveLength(4); // 2 linhas (base e topo) × 2 colunas
    const p = r.pecas.paineis[0]!;
    expect(p.areaVisivel).toBe(0);
    expect(p.areaBruta).toBe(0);
  });

  it('forma não suportada na fase 1 e tipo inexistente são ENTRADA', () => {
    const e = base();
    expect(() => resolverCortina({ ...e, montantes: [{ ...MONTANTES[0]!, profile: { shape: 'L', width: 0.05, depth: 0.1, thickness: 0.005 } }, ...MONTANTES.slice(1)] })).toThrow('ENTRADA');
    expect(() => resolverCortina(base({ mullions: todos('nao_existe') }))).toThrow('ENTRADA');
    expect(() => resolverCortina(base({ painel: 'nao_existe' }))).toThrow('ENTRADA');
    expect(() => resolverCortina({ ...e, L: 0 })).toThrow('ENTRADA');
  });
});

describe('cortinaRef/pecas: painéis', () => {
  it('retângulo livre = célula menos a meia largura dos montantes; área bruta soma o bite nos lados com montante', () => {
    const r = resolverCortina(base());
    expect(r.pecas.paineis).toHaveLength(4);
    const p = r.pecas.paineis[0]!;
    expect(p.larguraLivre).toBeCloseTo(2 - 0.05, 12);
    expect(p.alturaLivre).toBeCloseTo(1.5 - 0.05, 12);
    expect(p.areaVisivel).toBeCloseTo(1.95 * 1.45, 12);
    expect(p.areaBruta).toBeCloseTo((1.95 + 0.024) * (1.45 + 0.024), 12);
    expect(p.volume).toBeCloseTo(p.areaBruta * 0.01, 12);
    expect(p.papel).toBe(PAPEL_VIDRO);
  });
  it('painel vazio: sem vidro, área bruta = vão livre, volume 0', () => {
    const p = resolverCortina(base({ painel: 'pnl_vazio' })).pecas.paineis[0]!;
    expect(p.papel).toBe(PAPEL_VAZIO);
    expect(p.areaBruta).toBeCloseTo(p.areaVisivel, 12);
    expect(p.volume).toBe(0);
  });
  it('painel sólido usa o bite do próprio tipo', () => {
    const p = resolverCortina(base({ painel: 'pnl_solido_alu_4' })).pecas.paineis[0]!;
    expect(p.areaBruta).toBeCloseTo((1.95 + 0.02) * (1.45 + 0.02), 12);
  });
  it('sem montante nenhum: o painel é a célula inteira e bite 0 nas arestas', () => {
    const r = resolverCortina(base({ mullions: todos(null) }));
    expect(r.pecas.montantes).toHaveLength(0);
    r.pecas.paineis.forEach((p) => { expect(p.areaVisivel).toBeCloseTo(3, 12); expect(p.areaBruta).toBeCloseTo(3, 12); });
  });
  it('a instância troca o painel padrão e o eixo (campo a campo)', () => {
    const r = resolverCortina(achar('instancia sobrescreve o eixo e o painel'));
    expect(r.grade.u.linhas).toEqual([2, 4]); // u troca para fixedDistance 2 (center) em L = 6
    expect(r.grade.v.linhas).toEqual([1.5]); // v só troca o count (de 3 para 2) e herda o modo
    expect(r.pecas.paineis).toHaveLength(6);
    expect(r.pecas.paineis.every((p) => p.papel === PAPEL_SOLIDO)).toBe(true);
  });
});

describe('cortinaRef/avisos', () => {
  const contar = (e: CortinaEntrada, cod: number): number => resolverCortina(e).avisos.filter((a) => a.codigo === cod).length;

  it('célula mínima: lado livre menor que minCell (padrão 0,15)', () => {
    expect(contar(achar('celulas menores que a minima e montantes sobrepostos'), AVISO_CELULA_PEQUENA)).toBe(5);
    expect(contar(base(), AVISO_CELULA_PEQUENA)).toBe(0);
  });
  it('célula mínima configurável', () => {
    expect(contar(achar('minCell personalizada'), AVISO_CELULA_PEQUENA)).toBe(9);
    const e = base();
    e.tipo.minCell = 1.46; // menor lado livre = 1,45 (a altura)
    expect(contar(e, AVISO_CELULA_PEQUENA)).toBe(4);
    e.tipo.minCell = 1.45; // exatamente o limite: não avisa
    expect(contar(e, AVISO_CELULA_PEQUENA)).toBe(0);
  });
  it('a medida é o menor lado livre, não o nominal', () => {
    // célula 0,19 de largura nominal, mas livre 0,14 com montantes de 50 mm
    const e: CortinaEntrada = { ...base(), L: 0.19, tipo: { ...base().tipo, u: { mode: 'fixedNumber', count: 1 }, v: { mode: 'fixedNumber', count: 1 } } };
    const a = resolverCortina(e).avisos.find((x) => x.codigo === AVISO_CELULA_PEQUENA)!;
    expect(a.medido).toBeCloseTo(0.14, 12);
    expect(a.limite).toBe(0.15);
  });
  it('montante sobreposto: linhas vizinhas mais próximas que a largura do perfil', () => {
    const r = resolverCortina(achar('celulas menores que a minima e montantes sobrepostos'));
    const s = r.avisos.filter((a) => a.codigo === AVISO_MONTANTE_SOBREPOSTO);
    expect(s).toHaveLength(5);
    expect(s[0]!.medido).toBeCloseTo(0.02, 12);
    expect(s[0]!.limite).toBeCloseTo(0.05, 12);
    expect(s[0]!.j).toBe(ID_AUSENTE);
  });
  it('sobra fundida e posição fora saem como informativos do eixo', () => {
    expect(contar(achar('fixedDistance sobra fundida passa de 1,5 d'), AVISO_SOBRA_FUNDIDA)).toBeGreaterThan(0);
    expect(contar(achar('preset wt_cortina_vitrine'), AVISO_POSICAO_FORA)).toBe(1);
  });
  it('perfil mais fundo que o sistema', () => {
    const a = resolverCortina(achar('perfil mais fundo que o sistema')).avisos.filter((x) => x.codigo === AVISO_PROFUNDIDADE_MENOR_QUE_PERFIL);
    expect(a).toHaveLength(1);
    expect(a[0]!.medido).toBeCloseTo(0.15, 12);
    expect(a[0]!.limite).toBeCloseTo(0.08, 12);
  });
});

describe('cortinaRef/quant', () => {
  it('cortina 4 × 3, grade 2 × 2, 50 × 100 mm, vidro 10 mm', () => {
    const r = resolverCortina(base());
    const q = (papel: number) => r.quant.find((x) => x.papel === papel)!;
    expect(q(PAPEL_SISTEMA)).toMatchObject({ n: 1, comprimento: 4, area: 12, areaLiquida: 12, volume: 0 });
    // verticais: 3 linhas × 2 segmentos de 1,5 m; 2 de borda início/fim (cada 2 segmentos), 1 interior
    expect(q(PAPEL_BORDA_INICIO)).toMatchObject({ n: 2, tipoNum: 1, materialNum: 1 });
    expect(q(PAPEL_BORDA_INICIO).comprimento).toBeCloseTo(3, 12);
    expect(q(PAPEL_INTERIOR_V).comprimento).toBeCloseTo(3, 12);
    expect(q(PAPEL_INTERIOR_V).area).toBeCloseTo(3 * 0.05, 12);
    expect(q(PAPEL_INTERIOR_V).volume).toBeCloseTo(3 * 0.05 * 0.1, 12);
    // horizontais aparados: 2 segmentos por linha de 1,95 m
    expect(q(PAPEL_INTERIOR_H).n).toBe(2);
    expect(q(PAPEL_INTERIOR_H).comprimento).toBeCloseTo(3.9, 12);
    // vidro: 4 painéis
    expect(q(PAPEL_VIDRO).n).toBe(4);
    expect(q(PAPEL_VIDRO).areaLiquida).toBeCloseTo(4 * 1.95 * 1.45, 12);
    expect(q(PAPEL_VIDRO).area).toBeCloseTo(4 * 1.974 * 1.474, 12);
    expect(q(PAPEL_VIDRO).materialNum).toBe(2);
  });
  it('o comprimento total de montante muda com a prioridade, o número de peças não', () => {
    // larguras diferentes nos dois sentidos (com larguras iguais a soma coincide por simetria)
    const mista = (join: 'vertical' | 'horizontal'): CurtainMullions => ({ ...todos('mul_ret_50x100', join), interiorVertical: 'mul_largo_200' });
    const a = resolverCortina(base({ mullions: mista('vertical') })).quant.filter((x) => x.papel <= 5);
    const b = resolverCortina(base({ mullions: mista('horizontal') })).quant.filter((x) => x.papel <= 5);
    expect(soma(a.map((x) => x.n))).toBe(soma(b.map((x) => x.n)));
    expect(soma(a.map((x) => x.comprimento))).not.toBeCloseTo(soma(b.map((x) => x.comprimento)), 3);
  });
  it('linhas ordenadas por papel, tipo e material', () => {
    const q = resolverCortina(achar('montante redondo sem borda')).quant;
    for (let i = 1; i < q.length; i++) expect(q[i]!.papel * 1e6 + q[i]!.tipoNum).toBeGreaterThanOrEqual(q[i - 1]!.papel * 1e6 + q[i - 1]!.tipoNum);
    expect(q.some((x) => x.papel === PAPEL_BORDA_INICIO)).toBe(false);
  });
});
