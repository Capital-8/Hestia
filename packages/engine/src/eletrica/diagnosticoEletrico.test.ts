import { createEmptyProject, FAMILIA_ARMARIO, type CircuitoEletrico, type Component, type Familia, type Ligacao, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { diagnosticarRede, type CodigoDiagnostico, type Diagnostico } from '../componentes/diagnosticoRede.ts';
import { comprimentoDoCircuito } from './comprimentoCircuito.ts';
import { mesclarTabelas, TABELAS_PROVISORIAS } from './tabelasEletricas.ts';

/*
 * Diagnóstico elétrico (ficha C5) sobre uma cena sintética: quadro qd -(t1, 3 m)- cx -(t2, 2 m)- tom1 e cx -(t3, 1 m)- tom2.
 * Só as conexões gravadas importam para o caminho; a geometria das pontas não é conferida aqui (é assunto dos outros códigos).
 */
const eletroduto = (id: string, nome: string, z: string): Ligacao => ({ id, nome, dominio: 'eletroduto', secao: 'redonda', diametro: '20', posicao: ['0', '0', z], direcao: ['0', '0', z === '0' ? '-1' : '1'], fluxo: 'ambos' });
function familia(id: string, categoria: Familia['categoria'], ligacoes: Ligacao[], posicoes?: number): Familia {
  const f: Familia = { ...structuredClone(FAMILIA_ARMARIO), id, nome: id, categoria, pecas: [], ferragens: [], conectores: [], planos: [], escolhas: [], tipos: [], tipoPadrao: undefined, corpos: [], ligacoes, parametros: [{ id: 'L', nome: 'L', tipo: 'comprimento', escopo: 'instancia', padrao: 1000, min: 1, max: 100000, passo: 1, grupo: 'D' }] };
  if (posicoes !== undefined) f.parametros = [...f.parametros, { id: 'posicoes', nome: 'Posições', tipo: 'inteiro', escopo: 'instancia', padrao: posicoes, min: 1, max: 96, passo: 1, grupo: 'Elétrica' }];
  return f;
}
const FAMS = (posicoes = 12): Familia[] => [
  familia('fam_quadro_distribuicao_eletrico', 'dispositivo_eletrico', [eletroduto('a', 'a', '0')], posicoes),
  familia('cx', 'dispositivo_eletrico', [eletroduto('a', 'a', '0'), eletroduto('b', 'b', '0'), eletroduto('c', 'c', '0')]),
  familia('tubo', 'eletroduto', [eletroduto('a', 'a', '0'), eletroduto('b', 'b', 'L')]),
  familia('tom', 'dispositivo_eletrico', [eletroduto('a', 'a', '0')]),
];
const comp = (id: string, familyId: string, extra: Partial<Component> = {}): Component => ({ id, kind: 'component', familyId, typeId: null, levelId: 'lv_0', order: 0, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id, ...extra });
const tubo = (id: string, L: number, lig: Component['ligacoes']): Component => comp(id, 'tubo', { values: { L }, ligacoes: lig });
const cx = (a: string, b: string): Component['ligacoes'] => ({ a: { componenteId: a, ligacaoId: 'b' }, b: { componenteId: b, ligacaoId: 'a' } });

interface Opcoes { posicoes?: number; ligados?: boolean; circuito?: Partial<CircuitoEletrico>; potencias?: [number, number]; tabelas?: Parameters<typeof diagnosticarRede>[1] }
function cena(o: Opcoes = {}): Project {
  const ligados = o.ligados ?? true;
  const elementos: Component[] = [
    comp('qd', 'fam_quadro_distribuicao_eletrico', ligados ? { ligacoes: { a: { componenteId: 't1', ligacaoId: 'a' } } } : {}),
    tubo('t1', 3000, ligados ? { a: { componenteId: 'qd', ligacaoId: 'a' }, b: { componenteId: 'cx', ligacaoId: 'a' } } : {}),
    comp('cx', 'cx', ligados ? { ligacoes: { a: { componenteId: 't1', ligacaoId: 'b' }, b: { componenteId: 't2', ligacaoId: 'a' }, c: { componenteId: 't3', ligacaoId: 'a' } } } : {}),
    tubo('t2', 2000, ligados ? { a: { componenteId: 'cx', ligacaoId: 'b' }, b: { componenteId: 'tom1', ligacaoId: 'a' } } : {}),
    tubo('t3', 1000, ligados ? { a: { componenteId: 'cx', ligacaoId: 'c' }, b: { componenteId: 'tom2', ligacaoId: 'a' } } : {}),
    comp('tom1', 'tom', ligados ? { ligacoes: { a: { componenteId: 't2', ligacaoId: 'b' } } } : {}),
    comp('tom2', 'tom', ligados ? { ligacoes: { a: { componenteId: 't3', ligacaoId: 'b' } } } : {}),
  ];
  const [p1, p2] = o.potencias ?? [500, 500];
  const circuito: CircuitoEletrico = { id: 'cir_1', nome: 'C1', tipo: 'tomadas_uso_geral', quadroId: 'qd', tensao: 127, cor: '#d9480f', pontos: [{ componenteId: 'tom1', potenciaVA: p1 }, { componenteId: 'tom2', potenciaVA: p2 }], ...o.circuito };
  const base = createEmptyProject('t');
  return { ...base, componentFamilies: Object.fromEntries(FAMS(o.posicoes).map((f) => [f.id, f])), elements: Object.fromEntries(elementos.map((e) => [e.id, e])), circuitosEletricos: { cir_1: circuito } };
}
const codigos = (p: Project, t?: Opcoes['tabelas']): CodigoDiagnostico[] => diagnosticarRede(p, t).map((d) => d.codigo);
const so = (p: Project, c: CodigoDiagnostico, t?: Opcoes['tabelas']): Diagnostico[] => diagnosticarRede(p, t).filter((d) => d.codigo === c);

describe('comprimento do circuito pela rede', () => {
  it('soma os eletrodutos do quadro ao ponto mais distante: 3 + 2 = 5 m (o outro ponto, 4 m)', () => {
    const r = comprimentoDoCircuito(cena(), cena().circuitosEletricos!.cir_1!);
    expect(r.comprimentoM).toBeCloseTo(5, 9);
    expect(r.porPonto.tom2).toBeCloseTo(4, 9);
    expect(r.semCaminho).toEqual([]);
  });
  it('rede desligada: sem comprimento e todos os pontos sem caminho (nada inventado)', () => {
    const p = cena({ ligados: false });
    const r = comprimentoDoCircuito(p, p.circuitosEletricos!.cir_1!);
    expect(r.comprimentoM).toBeNull();
    expect(r.semCaminho).toEqual(['tom1', 'tom2']);
  });
  it('circuito sem quadro: sem comprimento', () => {
    const p = cena({ circuito: { quadroId: undefined } });
    expect(comprimentoDoCircuito(p, p.circuitosEletricos!.cir_1!).comprimentoM).toBeNull();
  });
});

describe('diagnóstico elétrico', () => {
  it('cena íntegra: nenhum código elétrico', () => {
    // A geometria sintética não encosta as pontas: só os códigos ELÉTRICOS interessam aqui.
    const elet = codigos(cena()).filter((c) => ['circuito_sem_quadro', 'ponto_sem_eletroduto', 'dispositivo_sem_eletroduto', 'quadro_sem_posicao', 'circuito_sobrecarregado', 'queda_tensao_excedida', 'ponto_potencia_zero'].includes(c));
    expect(elet).toEqual([]);
  });
  it('circuito_sem_quadro: aponta o circuito e seu primeiro ponto; com quadro não aparece', () => {
    const d = so(cena({ circuito: { quadroId: undefined } }), 'circuito_sem_quadro');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ circuitoId: 'cir_1', elementId: 'tom1' });
    expect(so(cena(), 'circuito_sem_quadro')).toEqual([]);
  });
  it('ponto_sem_eletroduto: rede desligada acusa os dois pontos; ligada, nenhum', () => {
    expect(so(cena({ ligados: false }), 'ponto_sem_eletroduto').map((d) => d.elementId)).toEqual(['tom1', 'tom2']);
    expect(so(cena(), 'ponto_sem_eletroduto')).toEqual([]);
  });
  it('ponto_sem_eletroduto não aparece sem quadro (o problema é outro)', () => {
    expect(so(cena({ circuito: { quadroId: undefined } }), 'ponto_sem_eletroduto')).toEqual([]);
  });
  it('dispositivo_sem_eletroduto: caixa, quadro e tomada soltos acusam; ligados não', () => {
    expect(so(cena({ ligados: false }), 'dispositivo_sem_eletroduto').map((d) => d.elementId).sort()).toEqual(['cx', 'qd', 'tom1', 'tom2']);
    expect(so(cena(), 'dispositivo_sem_eletroduto')).toEqual([]);
  });
  it('quadro_sem_posicao: 2 circuitos para 1 posição acusa; com 12 posições não', () => {
    const p = cena({ posicoes: 1 });
    p.circuitosEletricos = { ...p.circuitosEletricos, cir_2: { id: 'cir_2', nome: 'C2', tipo: 'iluminacao', quadroId: 'qd', tensao: 127, cor: '#1c7ed6', pontos: [] } };
    const d = so(p, 'quadro_sem_posicao');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ elementId: 'qd', valor: 2, limite: 1 });
    const q = cena();
    q.circuitosEletricos = p.circuitosEletricos;
    expect(so(q, 'quadro_sem_posicao')).toEqual([]);
  });
  it('circuito_sobrecarregado: 40 kVA a 127 V não cabe em nenhuma seção; 1 kVA cabe', () => {
    const d = so(cena({ potencias: [20000, 20000] }), 'circuito_sobrecarregado');
    expect(d).toHaveLength(1);
    expect(d[0]?.valor).toBeCloseTo(40000 / 127, 6);
    expect(d[0]?.limite).toBe(125);
    expect(so(cena(), 'circuito_sobrecarregado')).toEqual([]);
  });
  it('circuito_sobrecarregado: seção adotada pequena demais acusa e disjuntor adotado abaixo da corrente também', () => {
    const p = cena({ potencias: [1500, 1500], circuito: { secaoMm2: 1.5 } });
    expect(so(p, 'circuito_sobrecarregado')).toHaveLength(1);
    expect(so(cena({ potencias: [1500, 1500], circuito: { disjuntorA: 16 } }), 'circuito_sobrecarregado')).toHaveLength(1);
    expect(so(cena({ potencias: [1500, 1500] }), 'circuito_sobrecarregado')).toEqual([]);
  });
  it('queda_tensao_excedida: seção adotada 2,5 mm2, 23 m e 23,6 A: 7,7 % passa de 4 %; sem adoção a seção sobe e não acusa', () => {
    // 3000 VA / 127 V = 23,6 A; caminho 3 + 20 = 23 m; 2 x 0,0225 x 23 x 23,6 / (2,5 x 127) x 100 = 7,7 %.
    const longa = cena({ potencias: [1500, 1500], circuito: { secaoMm2: 2.5 } });
    longa.elements.t2 = { ...longa.elements.t2!, values: { L: 20000 } } as Component;
    const d = so(longa, 'queda_tensao_excedida');
    expect(d).toHaveLength(1);
    expect(d[0]?.limite).toBe(4);
    expect(d[0]?.valor).toBeGreaterThan(4);
    const auto = cena({ potencias: [1500, 1500] });
    auto.elements.t2 = { ...auto.elements.t2!, values: { L: 20000 } } as Component;
    expect(so(auto, 'queda_tensao_excedida')).toEqual([]);
  });
  it('ponto_potencia_zero: ponto com 0 VA acusa o ponto; potência positiva não', () => {
    const d = so(cena({ potencias: [0, 500] }), 'ponto_potencia_zero');
    expect(d.map((x) => x.elementId)).toEqual(['tom1']);
    expect(so(cena(), 'ponto_potencia_zero')).toEqual([]);
  });
  it('as tabelas editadas valem: queda máxima de 0,1 % passa a acusar o que antes passava', () => {
    expect(so(cena(), 'queda_tensao_excedida')).toEqual([]);
    const t = mesclarTabelas(TABELAS_PROVISORIAS, { quedaMaximaPct: 0.1, secoes: [1.5], capacidadeA: { '1.5': 17.5 } });
    expect(so(cena(), 'queda_tensao_excedida', { tabelas: t }).length).toBe(1);
  });
  it('sem projeto elétrico (sem circuitos) não há código novo', () => {
    const p = createEmptyProject('t');
    expect(diagnosticarRede(p)).toEqual([]);
  });
});
