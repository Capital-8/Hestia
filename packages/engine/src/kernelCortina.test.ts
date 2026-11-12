import { describe, expect, it } from 'vitest';
import { CONSULTAS, ESQUEMA_VERSAO, NIVEL_TODOS, SECOES } from '../../geom/src/kernel/v2/esquema.gerado.ts';
import {
  AVISO_CORTINA,
  COLUNAS_CORTINA,
  ENUM_CORTINA,
  HERDA_CORTINA,
  ID_AUSENTE_CORTINA,
  NOMES_SECOES_CORTINA,
  diferencaCortina,
  lerAvisosCortina,
  lerGradeCortina,
  lerMalhaCortina,
  lerPlantaCortina,
  lerQuantCortina,
  montarCenaCortina,
  type EntradaCenaCortina,
  type NomeSecaoCortina,
} from './kernelCortina.ts';

const IDS_SECAO: Record<NomeSecaoCortina, number> = { cortinas: 100, tipos_cortina: 101, grades_cortina: 102, grade_posicoes_cortina: 103, tipos_montante_cortina: 104, tipos_painel_cortina: 105, cortina_linhas_extras: 106, cortina_segmentos_removidos: 107, cortina_linhas_sobrescritas: 108, cortina_celulas_sobrescritas: 109, cortina_extremidades: 110, tipos_abertura: 7, cortina_celulas_abertura: 112, cortina_hospedes: 113 };

const entrada = (): EntradaCenaCortina => ({
  montantes: [
    { id: 'ret', shape: 'rect', width: 0.05, depth: 0.1, materialId: 'mat_alu' },
    { id: 'red', shape: 'round', width: 0.05, depth: 0.05, offset: 0.01, materialId: 'mat_alu' },
  ],
  paineis: [
    { id: 'vidro', kind: 'glass', thickness: 0.01, materialId: 'mat_vidro' },
    { id: 'solido', kind: 'solid', thickness: 0.004, bite: 0.01, materialId: 'mat_alu' },
  ],
  tipos: [
    {
      id: 'wt_loja',
      depth: 0.12,
      u: { mode: 'fixedDistance', distance: 1.5, justify: 'center' },
      v: { mode: 'manual', positions: [1, 2.4], anchor: 'start' },
      mullions: { interiorVertical: 'ret', interiorHorizontal: 'red', borderStart: 'ret', borderEnd: 'ret', borderBottom: null, borderTop: 'ret', corner: null, joinPriority: 'horizontal' },
      defaultPanelTypeId: 'vidro',
      minCell: 0.2,
    },
  ],
  cortinas: [
    { id: 'c2', levelNum: 1, typeId: 'wt_loja', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, zBase: 3, height: 3 },
    {
      id: 'c1',
      levelNum: 0,
      typeId: 'wt_loja',
      a: { x: 1, y: 2 },
      b: { x: 4, y: 6 },
      zBase: 0,
      height: 2.8,
      flipped: true,
      locationLine: 'finishExterior',
      grid: { u: { justify: 'end', offset: 0.1 }, v: { positions: [1.5] } },
      defaultPanelTypeId: 'solido',
    },
  ],
  materialNum: (id) => (id === 'mat_alu' ? 5 : id === 'mat_vidro' ? 6 : ID_AUSENTE_CORTINA),
});

describe('contrato da parede cortina', () => {
  it('as seções 100 a 113 (mais a 7) e as colunas conferem com o esquema gerado do JSON', () => {
    expect(ESQUEMA_VERSAO).toBe(17);
    expect(NOMES_SECOES_CORTINA).toHaveLength(14);
    for (const nome of NOMES_SECOES_CORTINA) {
      const s = SECOES[nome];
      expect(s.id, nome).toBe(IDS_SECAO[nome]);
      expect(s.colunas.map((c) => c.nome), nome).toEqual(COLUNAS_CORTINA[nome]);
    }
  });

  it('as consultas 100 a 102, 104 a 107 existem e a 103 (corte) fica para a fase 6', () => {
    expect(CONSULTAS.cortina_grade.id).toBe(100);
    expect(CONSULTAS.cortina_malha.id).toBe(101);
    expect(CONSULTAS.cortina_planta.id).toBe(102);
    expect(CONSULTAS.quant_cortina.id).toBe(104);
    expect(CONSULTAS.cortina_avisos.id).toBe(105);
    expect(Object.keys(CONSULTAS).filter((n) => n.startsWith('cortina_') || n.endsWith('_cortina'))).toHaveLength(7);
    expect(CONSULTAS.cortina_recorte_hospedeiro.id).toBe(106);
    expect(CONSULTAS.cortina_celula_porta.id).toBe(107);
    expect(CONSULTAS.cortina_malha.args).toEqual(['nivel_num', 'lod']);
    expect(CONSULTAS.cortina_planta.args).toEqual(['nivel_num', 'corte_z', 'detalhe']);
    expect(NIVEL_TODOS).toBe(0xffffffff);
  });

  it('os códigos dos enums seguem a ordem do contrato', () => {
    expect(ENUM_CORTINA.modo).toEqual({ fixedNumber: 0, fixedDistance: 1, maxDistance: 2, manual: 3 });
    expect(ENUM_CORTINA.justificacao).toEqual({ start: 0, center: 1, end: 2 });
    expect(ENUM_CORTINA.painel).toEqual({ glass: 0, solid: 1, empty: 2 });
    expect(Object.values(AVISO_CORTINA)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

describe('montarCenaCortina: esquadria na célula e cortina embutida (fase 5)', () => {
  const valores = { largura: 0.8, altura: 2.1, peitoril: 0, folga_w: 0, folga_h: 0, folhas: 1, plano: 0, janela: 0, fechamento: 0, tem_alizar: 0, estilo_batente: 0, modo_prof: 0, prof_pedida: 0, larg_batente: 0.05, esp_folha: 0.04 };
  const com = (mexe: (e: EntradaCenaCortina) => EntradaCenaCortina): EntradaCenaCortina => mexe(entrada());

  it('a esquadria vai à seção 112 com o tipo da seção 7 e a soleira NaN quando ausente; a cortina embutida vai à 113 e marca o bit 1', () => {
    const e = com((b) => ({
      ...b,
      tiposAbertura: [{ id: 'ot_p80', valores }],
      hospedeiroNum: (id) => (id === 'w9' ? 4 : undefined),
      cortinas: b.cortinas.map((c) =>
        c.id === 'c1'
          ? {
              ...c,
              hospedeiro: { wallId: 'w9', offset: 2, width: 3, sill: 0.1, height: 2.8 },
              sobrescritas: { esquadrias: [{ i: 1, j: 0, nu: 3, nv: 2, s: 0.5, z: 0.25, tipoAbertura: 'ot_p80', flipHand: true, flipFacing: false, fit: 'grid', align: 'start' }, { i: 0, j: 0, nu: 3, nv: 2, s: 0.1, z: 0.2, tipoAbertura: 'inexistente', flipHand: false, flipFacing: false }] },
            }
          : c,
      ),
    }));
    const c = montarCenaCortina(e);
    expect(c.nLinhas.tipos_abertura).toBe(1);
    expect(c.secoes.tipos_abertura.largura).toEqual([0.8]);
    expect(c.nLinhas.cortina_celulas_abertura).toBe(1);
    const a = c.secoes.cortina_celulas_abertura;
    expect([a.i![0], a.j![0], a.tipo_abertura_num![0], a.flip_mao![0], a.flip_sentido![0], a.ajuste![0], a.alinhamento![0]]).toEqual([1, 0, c.tipoAberturaDe.get('ot_p80'), 1, 0, 1, 1]);
    expect(Number.isNaN(a.soleira![0])).toBe(true);
    expect(a.cortina_num![0]).toBe(c.cortinaDe.get('c1'));
    expect(c.nLinhas.cortina_hospedes).toBe(1);
    const h = c.secoes.cortina_hospedes;
    expect([h.hospedeiro_num![0], h.deslocamento![0], h.largura![0], h.peitoril![0], h.altura![0]]).toEqual([4, 2, 3, 0.1, 2.8]);
    const flags = c.secoes.cortinas.flags!;
    expect(flags[c.secoes.cortinas.id_num!.indexOf(c.cortinaDe.get('c1')!)]! & 2).toBe(2);
    expect(flags[c.secoes.cortinas.id_num!.indexOf(c.cortinaDe.get('c2')!)]! & 2).toBe(0);
  });

  it('sem esquadria nem hospedeiro as seções novas saem vazias e a diferença entre duas montagens iguais é nula', () => {
    const c = montarCenaCortina(entrada());
    expect([c.nLinhas.tipos_abertura, c.nLinhas.cortina_celulas_abertura, c.nLinhas.cortina_hospedes]).toEqual([0, 0, 0]);
    expect(diferencaCortina(c, montarCenaCortina(entrada(), c))).toEqual([]);
  });
});

describe('montarCenaCortina', () => {
  const c = montarCenaCortina(entrada());

  it('toda coluna de toda seção tem o mesmo comprimento e a ordem das cortinas é por id', () => {
    for (const nome of NOMES_SECOES_CORTINA) for (const col of Object.values(c.secoes[nome])) expect(col.length).toBe(c.nLinhas[nome]);
    expect(c.nLinhas.cortinas).toBe(2);
    expect(c.nLinhas.tipos_cortina).toBe(1);
    expect(c.nLinhas.tipos_montante_cortina).toBe(2);
    expect(c.nLinhas.tipos_painel_cortina).toBe(2);
    // Grades: U e V do tipo, mais U e V da instância c1. Posições: 2 do tipo (V) e 1 da instância (V).
    expect(c.nLinhas.grades_cortina).toBe(4);
    expect(c.nLinhas.grade_posicoes_cortina).toBe(3);
    expect(c.cortinaDe.get('c1')).toBeLessThan(c.cortinaDe.get('c2')!);
  });

  it('a cortina leva nível, cota, linha de localização, painel padrão e a sobrescrita de grade em flags', () => {
    const i = c.secoes.cortinas['id_num']!.indexOf(c.cortinaDe.get('c1')!);
    const col = (n: string) => c.secoes.cortinas[n]![i]!;
    expect([col('nivel_num'), col('ax'), col('by'), col('altura'), col('flipped'), col('loc'), col('flags')]).toEqual([0, 1, 6, 2.8, 1, ENUM_CORTINA.locationLine.finishExterior, 1]);
    expect(col('painel_padrao_num')).toBe(c.painelDe.get('solido'));
    const j = c.secoes.cortinas['id_num']!.indexOf(c.cortinaDe.get('c2')!);
    expect(c.secoes.cortinas['painel_padrao_num']![j]).toBe(ID_AUSENTE_CORTINA);
    expect(c.secoes.cortinas['flags']![j]).toBe(0);
    expect(c.secoes.cortinas['loc']![j]).toBe(0);
  });

  it('o tipo leva os montantes por papel (null = ID_AUSENTE), a prioridade e a célula mínima', () => {
    const t = (n: string) => c.secoes.tipos_cortina[n]![0]!;
    expect([t('mont_int_v'), t('mont_int_h'), t('mont_borda_base'), t('mont_canto')]).toEqual([c.montanteDe.get('ret'), c.montanteDe.get('red'), ID_AUSENTE_CORTINA, ID_AUSENTE_CORTINA]);
    expect([t('prioridade'), t('celula_minima'), t('profundidade')]).toEqual([1, 0.2, 0.12]);
    expect(Number.isNaN(t('faceta_max'))).toBe(true);
  });

  it('a grade do tipo leva só o que foi dado e a da instância herda o resto (255, ID_AUSENTE e NaN)', () => {
    const g = c.secoes.grades_cortina;
    const linha = (dono: number, eixo: number) => {
      const k = g['dono']!.findIndex((d, q) => d === dono && g['eixo']![q] === eixo);
      return Object.fromEntries(Object.entries(g).map(([n, col]) => [n, col[k]!]));
    };
    const tu = linha(0, 0)!;
    expect([tu['modo'], tu['distancia'], tu['justificacao'], tu['ancora'], tu['numero']]).toEqual([1, 1.5, 1, HERDA_CORTINA, ID_AUSENTE_CORTINA]);
    expect(Number.isNaN(tu['deslocamento']!)).toBe(true);
    const iu = linha(1, 0)!;
    expect([iu['modo'], iu['justificacao'], iu['deslocamento'], iu['numero']]).toEqual([HERDA_CORTINA, 2, 0.1, ID_AUSENTE_CORTINA]);
    expect(Number.isNaN(iu['distancia']!)).toBe(true);
    // As posições manuais apontam para a grade V correta.
    const gv = linha(0, 1)!;
    expect(c.secoes.grade_posicoes_cortina['grade_num']!.filter((x) => x === gv['id_num']).length).toBe(2);
    expect(c.secoes.grade_posicoes_cortina['pos']).toEqual([1, 2.4, 1.5]);
  });

  it('a numeração é estável: remontar com a cena anterior mantém os números e a diferença é vazia', () => {
    const e = entrada();
    const outra = montarCenaCortina(e, c);
    expect(outra.cortinaDe.get('c1')).toBe(c.cortinaDe.get('c1'));
    expect(diferencaCortina(c, outra)).toEqual([]);
    // Mudar a altura de uma cortina toca só a seção `cortinas`, e só a linha dela.
    e.cortinas[0]!.height = 3.3;
    const d = diferencaCortina(c, montarCenaCortina(e, c));
    expect(d.map((x) => x.secao)).toEqual(['cortinas']);
    expect(d[0]!.nUpsert).toBe(1);
    expect(d[0]!.remover).toEqual([]);
    // Tirar uma cortina remove a linha (e as grades dela somem).
    const sem = montarCenaCortina({ ...e, cortinas: [e.cortinas[0]!] }, c);
    const d2 = diferencaCortina(c, sem);
    expect(d2.find((x) => x.secao === 'cortinas')!.remover).toEqual([c.cortinaDe.get('c1')]);
    expect(d2.find((x) => x.secao === 'grades_cortina')!.remover).toHaveLength(2);
  });

  it('referência inexistente é erro claro', () => {
    const e = entrada();
    e.tipos[0]!.defaultPanelTypeId = 'nao-existe';
    expect(() => montarCenaCortina(e)).toThrow(/painel inexistente/);
    const f = entrada();
    f.cortinas[0]!.typeId = 'nao-existe';
    expect(() => montarCenaCortina(f)).toThrow(/tipo de cortina inexistente/);
    const g = entrada();
    g.montantes = [];
    expect(() => montarCenaCortina(g)).toThrow(/montante inexistente/);
  });
});

describe('leitura das saídas das consultas', () => {
  it('cortina_grade: linhas, células e segmentos', () => {
    const g = lerGradeCortina({
      linhas: Uint32Array.from([1, 0, 1, 0, 0, 1, 1, 2, 2, 0]),
      linhas_pos: Float64Array.from([1.5, 2.25]),
      celulas: Uint32Array.from([1, 0, 0, 0, 7, 1]),
      celulas_ret: Float64Array.from([0, 1.5, 0, 3]),
      segmentos: Uint32Array.from([1, 0, 0, 0, 3, 1, 5, 1, 1, ID_AUSENTE_CORTINA]),
      segmentos_ext: Float64Array.from([0, 3, 0, 1.5]),
    });
    expect(g.linhas).toEqual([
      { cortina: 1, eixo: 'u', indice: 1, origem: 0, flags: 0, pos: 1.5 },
      { cortina: 1, eixo: 'v', indice: 2, origem: 2, flags: 0, pos: 2.25 },
    ]);
    expect(g.celulas).toEqual([{ cortina: 1, i: 0, j: 0, regiao: 0, painel: 7, flags: 1, s0: 0, s1: 1.5, z0: 0, z1: 3 }]);
    expect(g.segmentos[0]).toEqual({ cortina: 1, linha: 0, k: 0, removido: false, montante: 3, de: 0, ate: 3 });
    expect(g.segmentos[1]).toEqual({ cortina: 1, linha: 5, k: 1, removido: true, montante: null, de: 0, ate: 1.5 });
  });

  it('cortina_malha: protótipos com vértices e índices próprios e instâncias com a matriz', () => {
    const m = lerMalhaCortina({
      prototipos: Uint32Array.from([0, 0, 4, 5, 0, 2, 0, 3, 1, 1, 9, ID_AUSENTE_CORTINA, 2, 1, 3, 3]),
      vertices: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5]),
      indices: Uint32Array.from([0, 1, 1, 0, 0, 0]),
      instancias: Uint32Array.from([1, 1, 1, 0, 0, 1]),
      matrizes: Float64Array.from([1, 0, 0, 2, 0, 1, 0, 3, 0, 0, 1, 4]),
      grupos: Uint32Array.from([]),
      vertices_av: Float64Array.from([]),
      indices_av: Uint32Array.from([]),
    });
    expect(m.protos).toHaveLength(2);
    expect([...m.protos[0]!.vertices]).toEqual([0, 0, 0, 1, 0, 0]);
    expect([...m.protos[0]!.indices]).toEqual([0, 1, 1]);
    expect([...m.protos[1]!.vertices]).toEqual([0, 1, 0]);
    expect(m.protos[1]!.material).toBeNull();
    expect(m.instancias[0]).toMatchObject({ cortina: 1, proto: 1, papel: 1, transparente: true });
    expect([...m.instancias[0]!.matriz]).toEqual([1, 0, 0, 2, 0, 1, 0, 3, 0, 0, 1, 4]);
  });

  it('cortina_malha: grupos levam vértices próprios no mundo e índices locais (os absolutos viram locais à peça)', () => {
    const m = lerMalhaCortina({
      prototipos: Uint32Array.from([]),
      vertices: Float64Array.from([]),
      indices: Uint32Array.from([]),
      instancias: Uint32Array.from([]),
      matrizes: Float64Array.from([]),
      // Grupo 0: cortina 1, montante 4, um triângulo nos vértices 0 a 2. Grupo 1: cortina 2, sem material, vidro, dois triângulos nos vértices 4 a 6.
      grupos: Uint32Array.from([1, 0, 4, 0, 3, 0, 2, 0, ID_AUSENTE_CORTINA, 3, 6, 1]),
      vertices_av: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 9, 9, 9, 5, 5, 5, 6, 5, 5, 5, 6, 5]),
      indices_av: Uint32Array.from([0, 1, 2, 4, 5, 6, 4, 6, 5]),
    });
    expect(m.grupos).toHaveLength(2);
    expect(m.grupos[0]).toMatchObject({ cortina: 1, papel: 0, material: 4, transparente: false });
    expect([...m.grupos[0]!.vertices]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...m.grupos[0]!.indices]).toEqual([0, 1, 2]);
    expect(m.grupos[1]).toMatchObject({ cortina: 2, material: null, transparente: true });
    expect([...m.grupos[1]!.vertices]).toEqual([5, 5, 5, 6, 5, 5, 5, 6, 5]);
    expect([...m.grupos[1]!.indices]).toEqual([0, 1, 2, 0, 2, 1]);
  });

  it('cortina_malha: grupos inconsistentes são ENTRADA (não viram geometria torta)', () => {
    const base = () => ({
      prototipos: Uint32Array.from([]),
      vertices: Float64Array.from([]),
      indices: Uint32Array.from([]),
      instancias: Uint32Array.from([]),
      matrizes: Float64Array.from([]),
      vertices_av: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices_av: Uint32Array.from([0, 1, 2]),
    });
    expect(() => lerMalhaCortina({ ...base(), grupos: Uint32Array.from([1, 0, 0]) })).toThrow(/6 valores/);
    expect(() => lerMalhaCortina({ ...base(), grupos: Uint32Array.from([1, 0, 0, 0, 4, 0]) })).toThrow(/índices fora/);
    expect(() => lerMalhaCortina({ ...base(), grupos: Uint32Array.from([1, 0, 0, 0, 3, 2]) })).toThrow(/transparente/);
    expect(() => lerMalhaCortina({ ...base(), indices_av: Uint32Array.from([0, 1, 7]), grupos: Uint32Array.from([1, 0, 0, 0, 3, 0]) })).toThrow(/vértice 7/);
    expect(() => lerMalhaCortina({ ...base(), grupos: undefined as never })).toThrow(/não veio/);
  });

  it('cortina_planta, quant_cortina e cortina_avisos', () => {
    const p = lerPlantaCortina({ linhas: Uint32Array.from([1, 0, 0, 3, 1, 1, 2, 2]), pontos: Float64Array.from([0, 0, 1, 0, 1, 1, 5, 5, 6, 6]) });
    expect(p).toHaveLength(2);
    expect(p[0]!.pontos).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(p[1]).toMatchObject({ papel: 1, estilo: 2, pontos: [{ x: 5, y: 5 }, { x: 6, y: 6 }] });
    const q = lerQuantCortina({ linhas: Uint32Array.from([1, 20, 0, 0, 1]), valores: Float64Array.from([6, 18, 17, 2.16]) });
    expect(q).toEqual([{ cortina: 1, papel: 20, tipo: 0, material: 0, n: 1, comprimento: 6, area: 18, areaLiquida: 17, volume: 2.16 }]);
    const a = lerAvisosCortina({ avisos: Uint32Array.from([1, AVISO_CORTINA.celulaPequena, 2, ID_AUSENTE_CORTINA]), valores: Float64Array.from([0.1, 0.15, 1, 2, 3]) });
    expect(a).toEqual([{ cortina: 1, codigo: 1, i: 2, j: null, medido: 0.1, limite: 0.15, x: 1, y: 2, z: 3 }]);
    expect(() => lerAvisosCortina({ avisos: new Uint32Array(0) })).toThrow(/não veio/);
  });
});
