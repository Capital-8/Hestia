import { BIBLIOTECA_MEP, createEmptyProject, familiaDaBiblioteca, resolverMaterialVisualCorpo, TIGRE_TIGREFLEX_AMARELO, TIGRE_TIGREFLEX_REFORCADO, validarFamilia, type Component, type Familia, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { quantitativosEletricosDoProjeto } from '../eletrica/quantitativosEletricos.ts';
import { trechosEntreCaixas } from './curvasEntreCaixas.ts';
import { curvaturasFechadas, desvioEntre, raioMinimoMm, tangenteDoCanto, tipoSemConexoes } from './curvaturaFlexivel.ts';
import { diagnosticarRede } from './diagnosticoRede.ts';
import { ligacoesCompativeis, type LigacaoNoMundo } from './ligacoesEncaixe.ts';
import { resolverFamilia } from './resolver.ts';
import { trechoDeTubo, type PontoSegmento } from './orientarSegmento.ts';
import { regrasDoTubo, tipoDaFamiliaDeTubo, FATOR_RAIO_MINIMO_PROVISORIO } from './tiposTubulacao.ts';

/*
 * Eletroduto corrugado (ficha F2): família montada do catálogo Tigreflex, tipo sem conexões, raio mínimo de curvatura, diagnóstico
 * `curvatura_fechada` e quantitativos. Os números esperados saem do CATÁLOGO (estado CONFERIR) e do fator provisório do tipo.
 */

const AMARELO = 'fam_tigre_tigreflex_amarelo';
const REFORCADO = 'fam_tigre_tigreflex_reforcado';
const familia = (id: string): Familia => {
  const f = familiaDaBiblioteca(id);
  if (!f) throw new Error(`família ausente: ${id}`);
  return structuredClone(f);
};
const linhaTigre = (cat: typeof TIGRE_TIGREFLEX_AMARELO, bitola: string): Record<string, number> => {
  const l = cat.itens.find((i) => i.tipo === 'eletroduto')?.linhas.find((x) => x.bitola === bitola);
  if (!l) throw new Error(`linha ausente: ${bitola}`);
  return l.valores;
};

/** Cadeia de trechos corrugados pelos pontos (m), ligados fim → início, sem peça nos cantos. */
function cadeia(pontos: PontoSegmento[], dn = 20, fam = AMARELO): Project {
  const p = createEmptyProject();
  p.componentFamilies = { [fam]: familia(fam) };
  const trechos: Component[] = [];
  for (let k = 0; k < pontos.length - 1; k++) {
    const t = trechoDeTubo(pontos[k] as PontoSegmento, pontos[k + 1] as PontoSegmento, { id: fam }, dn, { id: `t${k}`, levelId: 'lv_0' });
    if (!t) throw new Error('trecho nulo');
    trechos.push(t);
  }
  trechos.forEach((t, k) => {
    const lig: NonNullable<Component['ligacoes']> = {};
    if (k > 0) lig.a = { componenteId: `t${k - 1}`, ligacaoId: 'b' };
    if (k < trechos.length - 1) lig.b = { componenteId: `t${k + 1}`, ligacaoId: 'a' };
    p.elements[t.id] = { ...t, ligacoes: lig };
  });
  return p;
}
const avisosDeCanto = (p: Project) => diagnosticarRede(p).filter((d) => ['conexao_afastada', 'incompativel', 'conexoes_coladas', 'conexao_invalida', 'curvatura_fechada'].includes(d.codigo));

describe('família do trecho corrugado (catálogo Tigreflex)', () => {
  it('as duas famílias estão na biblioteca MEP, categoria eletroduto, disciplina elétrica', () => {
    for (const id of [AMARELO, REFORCADO]) {
      const f = BIBLIOTECA_MEP.find((x) => x.id === id);
      expect(f?.categoria).toBe('eletroduto');
      expect(f?.disciplina).toBe('eletrico');
    }
  });
  it('as bitolas são as do catálogo (20, 25 e 32) e as medidas vêm dele, nada escrito à mão', () => {
    for (const [id, cat] of [[AMARELO, TIGRE_TIGREFLEX_AMARELO], [REFORCADO, TIGRE_TIGREFLEX_REFORCADO]] as const) {
      const f = familia(id);
      expect(f.tipos.map((t) => t.valores.DN)).toEqual([20, 25, 32]);
      for (const dn of [20, 25, 32]) {
        const env = resolverFamilia(f, { valores: { DN: dn, L: 1000 } }).env;
        const c = linhaTigre(cat, String(dn));
        expect([env.De, env.Di, env.e]).toEqual([c.DE, c.Di, c.e]);
      }
    }
  });
  it('monta sem erro, passa na validação e o corpo é um tubo reto oco do comprimento L', () => {
    for (const id of [AMARELO, REFORCADO]) {
      const f = familia(id);
      expect(validarFamilia(f).filter((x) => x.nivel === 'erro')).toEqual([]);
      const r = resolverFamilia(f, { valores: { DN: 25, L: 750 } });
      expect(r.erros).toEqual([]);
      expect(f.corpos).toHaveLength(1);
      expect(f.corpos?.[0]?.forma).toMatchObject({ tipo: 'extrusao', comprimento: 'L' });
    }
  });
  it('liga nas duas pontas: ligação flexível, encaixe ponta que aceita qualquer outra ponta, domínio eletroduto', () => {
    const r = resolverFamilia(familia(AMARELO), { valores: { DN: 20, L: 1000 } });
    const ligs = r.ligacoes ?? [];
    expect(ligs).toHaveLength(2);
    for (const l of ligs) {
      expect(l.flexivel).toBe(true);
      expect(l.dominio).toBe('eletroduto');
      expect(l.encaixe).toMatchObject({ tipo: 'ponta', aceitaMesmoTipo: true });
    }
    expect(ligs.map((l) => l.posicao[2]).sort((a, b) => a - b)).toEqual([0, 1]);
  });
  it('a validação da família recusa flexivel que não seja verdadeiro ou falso', () => {
    const f = familia(AMARELO);
    const ruim = { ...f, ligacoes: (f.ligacoes ?? []).map((l, i) => (i === 0 ? { ...l, flexivel: 'sim' as unknown as boolean } : l)) };
    expect(validarFamilia(ruim).some((x) => x.nivel === 'erro' && /flexivel/.test(x.mensagem))).toBe(true);
  });
  it('o material é PVC amarelo (e laranja no reforçado), nunca madeira, e as cores são de aparência provisória', () => {
    expect(familia(AMARELO).corpos?.[0]?.material).toBe('mat_pvc_amarelo');
    expect(familia(REFORCADO).corpos?.[0]?.material).toBe('mat_pvc_laranja');
    expect(resolverMaterialVisualCorpo('mat_pvc_amarelo')).toBe('comp_pvc_amarelo');
    expect(resolverMaterialVisualCorpo('mat_pvc_laranja')).toBe('comp_pvc_laranja');
  });
  it('ligação flexível aceita qualquer direção de chegada; a rígida continua exigindo as direções opostas', () => {
    const base: LigacaoNoMundo = { id: 'x', nome: 'x', dominio: 'eletroduto', sistema: null, secao: 'redonda', posicao: [0, 0, 0], direcao: [0, 0, 1], diametro: 0.02, largura: 0, altura: 0, fluxo: 'ambos', aceita: ['eletroduto'], propriedades: {}, propagaParametro: null, posicaoMundo: [0, 0, 0], direcaoMundo: [0, 0, 1] };
    const lado: LigacaoNoMundo = { ...base, direcaoMundo: [1, 0, 0] };
    expect(ligacoesCompativeis(base, lado).ok).toBe(false);
    expect(ligacoesCompativeis({ ...base, flexivel: true }, lado).ok).toBe(true);
    expect(ligacoesCompativeis(lado, { ...base, flexivel: true }).ok).toBe(true);
  });
});

describe('tipo de tubulação tigreflex_corrugado', () => {
  it('existe (amarelo e reforçado), domínio eletroduto, sem conexões, bitolas do catálogo', () => {
    for (const [id, fam] of [['tigreflex_corrugado', AMARELO], ['tigreflex_corrugado_reforcado', REFORCADO]] as const) {
      const t = tipoDaFamiliaDeTubo(fam);
      expect(t?.id).toBe(id);
      expect(t?.dominio).toBe('eletroduto');
      expect(t?.semConexoes).toBe(true);
      expect(t?.bitolas).toEqual([20, 25, 32]);
      expect(Object.entries(t?.regras ?? {}).filter(([k, v]) => k !== 'tubo' && v !== '')).toEqual([]);
      expect(tipoSemConexoes(fam)).toBe(t);
    }
  });
  it('sem conexões: as regras do trecho são nulas (nem as do domínio entram)', () => {
    expect(regrasDoTubo(AMARELO, 'eletroduto')).toBeNull();
    expect(regrasDoTubo('fam_krona_eletrica_tubo_corte', 'eletroduto')).not.toBeNull();
    expect(tipoSemConexoes('fam_krona_eletrica_tubo_corte')).toBeUndefined();
  });
  it('raio mínimo por bitola: fator provisório × diâmetro externo do catálogo; porBitola editável tem prioridade', () => {
    const tipo = tipoDaFamiliaDeTubo(AMARELO)!;
    for (const dn of [20, 25, 32]) expect(raioMinimoMm(tipo, familia(AMARELO), dn)).toBeCloseTo(FATOR_RAIO_MINIMO_PROVISORIO * linhaTigre(TIGRE_TIGREFLEX_AMARELO, String(dn)).DE!, 6);
    expect(raioMinimoMm({ ...tipo, raioMinimoCurvatura: { fatorDiametroExterno: 6, porBitola: { 25: 123 } } }, familia(AMARELO), 25)).toBe(123);
    expect(raioMinimoMm({ ...tipo, raioMinimoCurvatura: undefined }, familia(AMARELO), 25)).toBeNull();
  });
  it('geometria do canto: tangente = R·tan(θ/2); reto não consome nada', () => {
    expect(tangenteDoCanto(100, 90)).toBeCloseTo(100, 9);
    expect(tangenteDoCanto(100, 60)).toBeCloseTo(100 * Math.tan(Math.PI / 6), 9);
    expect(tangenteDoCanto(100, 0)).toBe(0);
    expect(desvioEntre([1, 0, 0], [0, 1, 0])).toBeCloseTo(90, 9);
    expect(desvioEntre([1, 0, 0], [1, 0, 0])).toBeCloseTo(0, 9);
  });
});

describe('rede com cantos flexíveis', () => {
  const R20 = FATOR_RAIO_MINIMO_PROVISORIO * 20;
  it('4 cantos livres de 90° com trechos que cabem: a rede não acusa afastada, incompatível, coladas nem curvatura', () => {
    const p = cadeia([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0.4, 1.5], [0.8, 0.4, 1.5]]);
    expect(avisosDeCanto(p)).toEqual([]);
  });
  it('canto fechado demais: trecho curto entre dois cantos de 90° é acusado com os mm necessários e disponíveis', () => {
    const curto = (2 * R20 - 40) / 1000; // dois cantos de 90° pedem 2R; o trecho do meio tem 40 mm a menos
    const p = cadeia([[0, 0, 1], [1, 0, 1], [1, curto, 1], [0, curto, 1]]);
    const d = diagnosticarRede(p).filter((x) => x.codigo === 'curvatura_fechada');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ elementId: 't1' });
    expect(d[0]?.valor).toBeCloseTo(2 * R20, 3);
    expect(d[0]?.limite).toBeCloseTo(2 * R20 - 40, 3);
    expect(curvaturasFechadas(p)).toHaveLength(1);
  });
  it('o mesmo canto aberto (45°) com trechos curtos cabe: só o desvio importa', () => {
    const t45 = R20 * Math.tan(Math.PI / 8);
    const p = cadeia([[0, 0, 1], [0.5, 0, 1], [0.5 + (t45 * 2.2) / 1000 * Math.SQRT1_2, (t45 * 2.2) / 1000 * Math.SQRT1_2, 1]]);
    expect(curvaturasFechadas(p)).toEqual([]);
  });
  it('mudança de cota entre trechos não cria peça: trecho inclinado é válido e a rede fica sem avisos', () => {
    const p = cadeia([[0, 0, 1], [1, 0, 1], [2, 0, 2]]);
    expect(avisosDeCanto(p)).toEqual([]);
    expect(Object.values(p.elements)).toHaveLength(2);
  });
  it('curvas entre caixas não contam curva nenhuma do corrugado', () => {
    const p = cadeia([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 2, 1]]);
    const t = trechosEntreCaixas(p);
    expect(t).toHaveLength(1);
    expect(t[0]?.componentes).toHaveLength(4);
    expect(t[0]?.curvas).toBe(0);
    expect(diagnosticarRede(p).filter((d) => d.codigo === 'curvas_entre_caixas')).toEqual([]);
  });
});

describe('quantitativos do corrugado', () => {
  it('soma o corrugado por família, bitola e comprimento em m, sem curvas nem luvas', () => {
    const p = cadeia([[0, 0, 1], [1, 0, 1], [1, 2, 1]], 20);
    const q = quantitativosEletricosDoProjeto(p);
    expect(q.eletrodutos).toEqual([]);
    expect(q.curvas).toEqual([]);
    expect(q.luvas).toEqual([]);
    expect(q.outros).toEqual([]);
    expect(q.corrugados).toHaveLength(1);
    expect(q.corrugados?.[0]).toMatchObject({ familiaId: AMARELO, bitola: 20, trechos: 2 });
    expect(q.corrugados?.[0]?.comprimentoM).toBeCloseTo(3, 6);
  });
});
