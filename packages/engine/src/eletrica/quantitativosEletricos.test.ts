import { createEmptyProject, familiaDaBiblioteca, isComponent, type CircuitoEletrico, type Component, type Familia, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { classeEletrica, quantitativosEletricosDoProjeto } from './quantitativosEletricos.ts';

/*
 * Quantitativos elétricos (ficha C6) sobre cenas sintéticas: traçado (quadro qd -(t1 3 m)- cx -(t2 2 m)- tom1 e cx -(t3 1 m)- tom2),
 * sem dimensionamento. As ligações gravadas são o que liga as peças; o comprimento de cada eletroduto é o parâmetro `L` dele.
 */

/** Famílias reais da biblioteca (DN é parâmetro de tipo: `dn20`, `dn25`...; o comprimento `L` vai na instância). */
const IDS = [
  'fam_quadro_distribuicao_eletrico',
  'fam_eletroduto_rigido',
  'fam_eletroduto_curva90',
  'fam_eletroduto_luva',
  'fam_eletrocalha_reta',
  'fam_caixa_4x4',
  'fam_caixa_octogonal',
  'fam_tomada_2p_t',
  'fam_interruptor_simples',
  'fam_luminaria_plafon_redondo',
  'fam_tubo_agua_fria',
];
const FAMILIAS: Familia[] = IDS.map((id) => {
  const f = familiaDaBiblioteca(id);
  if (!f) throw new Error(`família ausente da biblioteca: ${id}`);
  return structuredClone(f);
});

/** Componentes do projeto (o mapa de elementos mistura tipos). */
const elementosDe = (p: Project): Component[] => Object.values(p.elements).filter(isComponent);

const comp = (id: string, familyId: string, extra: Partial<Component> = {}): Component => ({
  id,
  kind: 'component',
  familyId,
  typeId: null,
  levelId: 'lv_0',
  order: 0,
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: id,
  ...extra,
});
const eletroduto = (id: string, L: number, DN: number, lig: Component['ligacoes'], familyId = 'fam_eletroduto_rigido'): Component =>
  comp(id, familyId, { typeId: `dn${DN}`, values: { L }, ligacoes: lig });

interface Cena {
  elementos?: Component[];
  circuitos?: Record<string, CircuitoEletrico>;
  familias?: Familia[];
}

/** Cena base: quadro, 3 eletrodutos (DN 20 de 3 m e 1 m; DN 25 de 2 m), uma caixa 4x4, duas tomadas e um interruptor ligados. */
function cenaBase(extra: Partial<Cena> = {}): Project {
  const elementos: Component[] = extra.elementos ?? [
    comp('qd', 'fam_quadro_distribuicao_eletrico', { ligacoes: { a: { componenteId: 't1', ligacaoId: 'a' } } }),
    eletroduto('t1', 3000, 20, { a: { componenteId: 'qd', ligacaoId: 'a' }, b: { componenteId: 'cx', ligacaoId: 'a' } }),
    comp('cx', 'fam_caixa_4x4', {
      ligacoes: {
        a: { componenteId: 't1', ligacaoId: 'b' },
        b: { componenteId: 't2', ligacaoId: 'a' },
        c: { componenteId: 't3', ligacaoId: 'a' },
      },
    }),
    eletroduto('t2', 2000, 25, { a: { componenteId: 'cx', ligacaoId: 'b' }, b: { componenteId: 'tom1', ligacaoId: 'a' } }),
    eletroduto('t3', 1000, 20, { a: { componenteId: 'cx', ligacaoId: 'c' }, b: { componenteId: 'tom2', ligacaoId: 'a' } }),
    comp('tom1', 'fam_tomada_2p_t', { ligacoes: { a: { componenteId: 't2', ligacaoId: 'b' } } }),
    comp('tom2', 'fam_tomada_2p_t', { ligacoes: { a: { componenteId: 't3', ligacaoId: 'b' } } }),
    comp('int1', 'fam_interruptor_simples'),
  ];
  const circuitos = extra.circuitos ?? {
    cir_1: { id: 'cir_1', nome: 'C1', tipo: 'tomadas_uso_geral', quadroId: 'qd', tensao: 127, cor: '#d9480f', pontos: [{ componenteId: 'tom1', potenciaVA: 600 }, { componenteId: 'tom2', potenciaVA: 600, fator: 0.5 }] },
  };
  const base = createEmptyProject('t');
  const familias = extra.familias ?? FAMILIAS;
  return {
    ...base,
    componentFamilies: Object.fromEntries(familias.map((f) => [f.id, f])),
    elements: Object.fromEntries(elementos.map((e) => [e.id, e])),
    circuitosEletricos: circuitos,
  };
}

describe('classeEletrica', () => {
  const p = cenaBase();
  const cls = (familyId: string) => classeEletrica(p, comp('x', familyId));

  it('classifica eletroduto, curva, luva, caixa, tomada, interruptor, luminária e quadro pela família', () => {
    expect(cls('fam_eletroduto_rigido')).toBe('eletroduto');
    expect(cls('fam_eletroduto_curva90')).toBe('curva');
    expect(cls('fam_eletroduto_luva')).toBe('luva');
    expect(cls('fam_caixa_4x4')).toBe('caixa');
    expect(cls('fam_tomada_2p_t')).toBe('tomada');
    expect(cls('fam_interruptor_simples')).toBe('interruptor');
    expect(cls('fam_luminaria_plafon_redondo')).toBe('luminaria');
    expect(cls('fam_quadro_distribuicao_eletrico')).toBe('quadro');
  });
  it('eletrocalha e dispositivo sem regra conhecida entram como outros; tubulação de água fria fica fora (null)', () => {
    expect(cls('fam_eletrocalha_reta')).toBe('outros');
    expect(cls('fam_caixa_inspecao_quadrada')).toBe('outros');
    expect(cls('fam_tubo_agua_fria')).toBeNull();
  });
});

describe('quantitativos elétricos do projeto', () => {
  it('eletrodutos por bitola: DN 20 com 2 trechos e 4 m; DN 25 com 1 trecho e 2 m; em ordem crescente', () => {
    const q = quantitativosEletricosDoProjeto(cenaBase());
    expect(q.eletrodutos).toEqual([
      { bitola: 20, trechos: 2, comprimentoM: 4 },
      { bitola: 25, trechos: 1, comprimentoM: 2 },
    ]);
  });
  it('o comprimento é a soma dos L das peças cortadas, sem somar recuos nem contar a mesma peça duas vezes', () => {
    const q = quantitativosEletricosDoProjeto(cenaBase());
    const total = q.eletrodutos.reduce((s, l) => s + l.comprimentoM, 0);
    expect(total).toBeCloseTo(3 + 2 + 1, 9);
  });
  it('curvas e luvas por bitola (contagem por DN)', () => {
    const elementos = [
      comp('qd', 'fam_quadro_distribuicao_eletrico'),
      comp('c1', 'fam_eletroduto_curva90', { typeId: 'dn20' }),
      comp('c2', 'fam_eletroduto_curva90', { typeId: 'dn20' }),
      comp('c3', 'fam_eletroduto_curva90', { typeId: 'dn25' }),
      comp('l1', 'fam_eletroduto_luva', { typeId: 'dn25' }),
    ];
    const q = quantitativosEletricosDoProjeto(cenaBase({ elementos, circuitos: {} }));
    expect(q.curvas).toEqual([
      { bitola: 20, quantidade: 2 },
      { bitola: 25, quantidade: 1 },
    ]);
    expect(q.luvas).toEqual([{ bitola: 25, quantidade: 1 }]);
  });
  it('caixas por tipo: duas caixas 4x4 viram uma linha com quantidade 2, e a octogonal sai em linha própria', () => {
    const elementos = [comp('c1', 'fam_caixa_4x4'), comp('c2', 'fam_caixa_4x4'), comp('c3', 'fam_caixa_octogonal')];
    const q = quantitativosEletricosDoProjeto(cenaBase({ elementos, circuitos: {} }));
    expect(q.caixas.map((c) => [c.familiaId, c.quantidade])).toEqual([
      ['fam_caixa_4x4', 2],
      ['fam_caixa_octogonal', 1],
    ]);
    expect(q.caixas[0]!.nome).toBe('Caixa de embutir 4×4');
  });
  it('quadros do projeto com o nome e as posições de disjuntor da família', () => {
    const q = quantitativosEletricosDoProjeto(cenaBase());
    expect(q.quadros).toHaveLength(1);
    expect(q.quadros[0]).toMatchObject({ id: 'qd', nome: 'QD 1' });
    expect(typeof q.quadros[0]!.posicoes).toBe('number');
  });
  it('pontos do projeto por tipo: 2 tomadas, 1 interruptor e 0 luminárias; a luminária entra quando existe', () => {
    const q = quantitativosEletricosDoProjeto(cenaBase());
    expect(q.pontos).toEqual({ tomadas: 2, interruptores: 1, luminarias: 0, outros: 0 });
    const comLuz = quantitativosEletricosDoProjeto(cenaBase({ elementos: [...elementosDe(cenaBase()), comp('lum1', 'fam_luminaria_plafon_redondo')] }));
    expect(comLuz.pontos.luminarias).toBe(1);
  });
  it('peça de família que não existe na biblioteca do projeto entra como outros, com o id como nome', () => {
    const elementos = [comp('x1', 'fam_desconhecida')];
    const q = quantitativosEletricosDoProjeto(cenaBase({ elementos, circuitos: {} }));
    expect(q.outros).toEqual([{ familiaId: 'fam_desconhecida', nome: 'fam_desconhecida', quantidade: 1 }]);
  });
  it('peça de outra disciplina (tubulação de água fria) fica fora de todos os quantitativos', () => {
    const elementos = [...elementosDe(cenaBase()), comp('agua', 'fam_tubo_agua_fria', { values: { L: 5000 } })];
    const q = quantitativosEletricosDoProjeto(cenaBase({ elementos }));
    expect(q.eletrodutos.reduce((s, l) => s + l.trechos, 0)).toBe(3);
    expect(q.outros).toEqual([]);
  });
  it('projeto sem componentes elétricos: tudo vazio e sem circuitos', () => {
    const q = quantitativosEletricosDoProjeto(createEmptyProject('vazio'));
    expect(q).toEqual({ eletrodutos: [], curvas: [], luvas: [], caixas: [], quadros: [], pontos: { tomadas: 0, interruptores: 0, luminarias: 0, outros: 0 }, outros: [], circuitos: [] });
  });
  it('é determinístico: duas chamadas dão o mesmo resultado', () => {
    const p = cenaBase();
    expect(quantitativosEletricosDoProjeto(p)).toEqual(quantitativosEletricosDoProjeto(p));
  });
});

describe('quantitativos por circuito', () => {
  it('o circuito conta cada eletroduto do caminho uma vez: t1 (3 m) + t2 (2 m) + t3 (1 m) = 6 m, e a caixa no caminho', () => {
    const [c] = quantitativosEletricosDoProjeto(cenaBase()).circuitos;
    expect(c!.eletrodutos).toEqual([
      { bitola: 20, trechos: 2, comprimentoM: 4 },
      { bitola: 25, trechos: 1, comprimentoM: 2 },
    ]);
    expect(c!.caixas).toEqual([{ familiaId: 'fam_caixa_4x4', nome: 'Caixa de embutir 4×4', quantidade: 1 }]);
    expect(c!.semCaminho).toBe(0);
  });
  it('o total em VA usa potência × fator (600 + 600 × 0,5 = 900 VA) e os pontos por tipo', () => {
    const [c] = quantitativosEletricosDoProjeto(cenaBase()).circuitos;
    expect(c!.totalVA).toBe(900);
    expect(c!.pontos).toEqual({ tomadas: 2, interruptores: 0, luminarias: 0, outros: 0 });
    expect(c!.quadroNome).toBe('QD 1');
    expect(c!.rotuloTipo).toBe('Tomadas de uso geral');
  });
  it('ponto que a rede não liga ao quadro conta em semCaminho e não traz eletroduto', () => {
    const elementos = elementosDe(cenaBase()).filter((e) => e.id !== 't3');
    const p = cenaBase({ elementos: elementos.map((e) => (e.id === 'cx' ? { ...e, ligacoes: { a: { componenteId: 't1', ligacaoId: 'b' }, b: { componenteId: 't2', ligacaoId: 'a' } } } : e)) });
    const [c] = quantitativosEletricosDoProjeto(p).circuitos;
    expect(c!.semCaminho).toBe(1);
    expect(c!.pontos.tomadas).toBe(2);
    expect(c!.eletrodutos.reduce((s, l) => s + l.trechos, 0)).toBe(2);
  });
  it('circuito sem quadro: nenhum eletroduto, todos os pontos sem caminho e VA somado mesmo assim', () => {
    const p = cenaBase({ circuitos: { cir_1: { id: 'cir_1', nome: 'C1', tipo: 'iluminacao', tensao: 127, cor: '#d9480f', pontos: [{ componenteId: 'tom1', potenciaVA: 300 }] } } });
    const [c] = quantitativosEletricosDoProjeto(p).circuitos;
    expect(c!.quadroNome).toBeNull();
    expect(c!.eletrodutos).toEqual([]);
    expect(c!.semCaminho).toBe(1);
    expect(c!.totalVA).toBe(300);
  });
  it('ponto cujo componente não existe mais sai do circuito e dos totais', () => {
    const p = cenaBase({ circuitos: { cir_1: { id: 'cir_1', nome: 'C1', tipo: 'tomadas_uso_geral', quadroId: 'qd', tensao: 127, cor: '#d9480f', pontos: [{ componenteId: 'tom1', potenciaVA: 400 }, { componenteId: 'fantasma', potenciaVA: 999 }] } } });
    const [c] = quantitativosEletricosDoProjeto(p).circuitos;
    expect(c!.totalVA).toBe(400);
    expect(c!.pontos.tomadas).toBe(1);
  });
  it('quadro que o circuito cita e não existe mais: quadroNome nulo, sem caminho', () => {
    const p = cenaBase({ circuitos: { cir_1: { id: 'cir_1', nome: 'C1', tipo: 'tomadas_uso_geral', quadroId: 'qd_sumiu', tensao: 127, cor: '#d9480f', pontos: [{ componenteId: 'tom1', potenciaVA: 100 }] } } });
    const [c] = quantitativosEletricosDoProjeto(p).circuitos;
    expect(c!.quadroNome).toBeNull();
    expect(c!.semCaminho).toBe(1);
  });
  it('circuitos saem em ordem de nome e cada um traz o seu tipo em português', () => {
    const p = cenaBase({
      circuitos: {
        b: { id: 'b', nome: 'C2', tipo: 'iluminacao', quadroId: 'qd', tensao: 127, cor: '#d9480f', pontos: [] },
        a: { id: 'a', nome: 'C1', tipo: 'tomadas_uso_especifico', quadroId: 'qd', tensao: 220, cor: '#1c7ed6', pontos: [] },
      },
    });
    const q = quantitativosEletricosDoProjeto(p);
    expect(q.circuitos.map((c) => [c.nome, c.rotuloTipo])).toEqual([
      ['C1', 'Tomadas de uso específico'],
      ['C2', 'Iluminação'],
    ]);
    expect(q.circuitos[0]!.totalVA).toBe(0);
  });
});
