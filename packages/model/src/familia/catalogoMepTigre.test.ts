import { describe, expect, it } from 'vitest';
import { CATALOGO_MEP_FORMATO, CATALOGO_MEP_VERSAO, bitolaNumerica, validarCatalogoMep, type CatalogoMep, type ItemCatalogo } from './catalogoMep.ts';
import { TIGRE_ESGOTO_NORMAL, TIGRE_ESGOTO_REFORCADA } from './catalogosMep/tigreEsgoto.ts';
import { TIGRE_SOLDAVEL } from './catalogosMep/tigreSoldavel.ts';
import { TIGRE_ROSCAVEL } from './catalogosMep/tigreRoscavel.ts';
import { TIGRE_CAIXA_PASSAGEM_PAREDE, TIGRE_TIGREFLEX_AMARELO, TIGRE_TIGREFLEX_REFORCADO } from './catalogosMep/tigreEletrica.ts';

const CATALOGOS: CatalogoMep[] = [
  TIGRE_ESGOTO_NORMAL,
  TIGRE_ESGOTO_REFORCADA,
  TIGRE_SOLDAVEL,
  TIGRE_ROSCAVEL,
  TIGRE_TIGREFLEX_AMARELO,
  TIGRE_TIGREFLEX_REFORCADO,
  TIGRE_CAIXA_PASSAGEM_PAREDE,
];

const ITENS = CATALOGOS.flatMap((c) => c.itens.map((i) => ({ c, i })));

const item = (catalogo: CatalogoMep, id: string): ItemCatalogo => {
  const achado = catalogo.itens.find((i) => i.id === id);
  if (!achado) throw new Error(`item ${id} não existe em ${catalogo.id}`);
  return achado;
};

const celula = (catalogo: CatalogoMep, itemId: string, bitola: string, coluna: string): number | undefined =>
  item(catalogo, itemId).linhas.find((l) => l.bitola === bitola)?.valores[coluna];

// Itens de caixa e de braçadeira: a letra C não é "comprimento de bolsa", então B > C é esperado nestes itens.
const ITENS_COM_B_MAIOR_QUE_C = new Set([
  'bracadeira_soldavel',
  'bracadeira_roscavel',
  'luva_pressao_amarela',
  'luva_pressao_reforcada',
  'caixa_luz_tigreflex_4x2',
  'caixa_luz_tigreflex_4x4',
  'caixa_3x3_anel_deslizante_tigreflex',
  'caixa_octogonal_fundo_movel_tigreflex',
  'prolongador_caixa_octogonal_tigreflex',
  'caixa_octogonal_fundo_movel_reforcada',
  'prolongador_caixa_octogonal_reforcada',
  'caixa_3x3_anel_deslizante_reforcada',
  'caixa_passagem_parede_embutir',
  'caixa_passagem_parede_sobrepor',
]);

const FONTES_SHA256 = {
  esgotoNormal: 'c9bd25d62ec26433b4c956f07b182f92e8c1ce2c5d962e58a429ee2bab45d43e',
  esgotoReforcada: '15e0948b9a72b9d21e30df72805687336d148c3236adeee6d60884732e505c35',
  soldavel: '028a01d642092744377d1405556058c164603ccfc460c95b2d11c84662388b0d',
  roscavel: 'fed95ca7b779392114eecb8c60a35fce248e32a06fe068e38e03ac06f3fcd665',
  tigreflexAmarelo: 'e122867d181bc4ce1641618c1d00b98420c0edda0c63470598af3a24b63ad660',
  tigreflexReforcado: 'd883c5c14e4df79c45ad7cfe82500d6b33add58f562f661fe3d636a843a2372b',
  caixaPassagemParede: 'bce96a380f469792b486f8e839aae26161fcaf315bd934927a28af7e4d0ba7f6',
};

describe('catálogos Tigre (ficha D5): carga e fonte', () => {
  it('os sete catálogos carregam com formato e versão do catálogo', () => {
    for (const c of CATALOGOS) {
      expect(c.formato).toBe(CATALOGO_MEP_FORMATO);
      expect(c.versao).toBe(CATALOGO_MEP_VERSAO);
    }
  });

  it('cada catálogo cita a Tigre, documento, URL https e SHA-256 de 64 caracteres hexadecimais', () => {
    for (const c of CATALOGOS) {
      expect(c.fonte.fabricante).toBe('Tigre');
      expect(c.fonte.documento.length).toBeGreaterThan(0);
      expect(c.fonte.url?.startsWith('https://tigresite.s3.amazonaws.com/')).toBe(true);
      expect(c.fonte.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('os SHA-256 de cada PDF batem com os arquivos baixados', () => {
    expect(TIGRE_ESGOTO_NORMAL.fonte.sha256).toBe(FONTES_SHA256.esgotoNormal);
    expect(TIGRE_ESGOTO_REFORCADA.fonte.sha256).toBe(FONTES_SHA256.esgotoReforcada);
    expect(TIGRE_SOLDAVEL.fonte.sha256).toBe(FONTES_SHA256.soldavel);
    expect(TIGRE_ROSCAVEL.fonte.sha256).toBe(FONTES_SHA256.roscavel);
    expect(TIGRE_TIGREFLEX_AMARELO.fonte.sha256).toBe(FONTES_SHA256.tigreflexAmarelo);
    expect(TIGRE_TIGREFLEX_REFORCADO.fonte.sha256).toBe(FONTES_SHA256.tigreflexReforcado);
    expect(TIGRE_CAIXA_PASSAGEM_PAREDE.fonte.sha256).toBe(FONTES_SHA256.caixaPassagemParede);
  });

  it('os ids de catálogo são únicos e não colidem com os da Krona', () => {
    const ids = CATALOGOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('catalogo_tigre_'))).toBe(true);
  });

  it('os ids de item são únicos dentro de cada catálogo', () => {
    for (const c of CATALOGOS) {
      const ids = c.itens.map((i) => i.id);
      expect(new Set(ids).size, c.id).toBe(ids.length);
    }
  });

  it('nenhum item sai conferido: todos nascem CONFERIR, sem quem conferiu', () => {
    for (const { i } of ITENS) {
      expect(i.estado, i.id).toBe('CONFERIR');
      expect(i.conferidoPor, i.id).toBeUndefined();
      expect(i.conferidoEm, i.id).toBeUndefined();
    }
  });

  it('todo item tem página do PDF, colunas declaradas e pelo menos uma linha', () => {
    for (const { i } of ITENS) {
      expect(Number.isInteger(i.pagina) && (i.pagina as number) > 0, i.id).toBe(true);
      expect(Object.keys(i.colunas).length, i.id).toBeGreaterThan(0);
      expect(i.linhas.length, i.id).toBeGreaterThan(0);
    }
  });
});

describe('catálogos Tigre: transcrição (forma e números)', () => {
  it('toda célula tem coluna declarada e valor numérico, finito e positivo', () => {
    for (const { i } of ITENS) {
      for (const l of i.linhas) {
        for (const [coluna, valor] of Object.entries(l.valores)) {
          expect(i.colunas, `${i.id} ${coluna}`).toHaveProperty(coluna);
          expect(Number.isFinite(valor), `${i.id} ${l.bitola} ${coluna}`).toBe(true);
          expect(valor, `${i.id} ${l.bitola} ${coluna}`).toBeGreaterThan(0);
        }
        for (const coluna of Object.keys(i.colunas)) {
          expect(l.valores[coluna], `${i.id} ${l.bitola} falta ${coluna}`).toBeDefined();
        }
      }
    }
  });

  it('bitolas numéricas estão em ordem crescente e não se repetem dentro do item', () => {
    for (const { i } of ITENS) {
      const numericas = i.linhas.map((l) => bitolaNumerica(l.bitola)).filter((b): b is number => b !== null);
      expect([...numericas].sort((a, b) => a - b), i.id).toEqual(numericas);
      expect(new Set(i.linhas.map((l) => l.bitola)).size, i.id).toBe(i.linhas.length);
    }
  });

  it('tubos de 6 m e 3 m trazem o comprimento L da tabela impressa (6000 ou 3000)', () => {
    const tubos = ITENS.filter(({ i }) => i.tipo === 'tubo');
    expect(tubos.length).toBe(8);
    for (const { i } of tubos) {
      const esperado = i.id.endsWith('_6m') ? 6000 : 3000;
      for (const l of i.linhas) expect(l.valores.L, `${i.id} ${l.bitola}`).toBe(esperado);
    }
  });

  it('o validador só acusa erro de "B maior que C" nas caixas e braçadeiras, e em nenhum tubo ou conexão', () => {
    for (const c of CATALOGOS) {
      const erros = validarCatalogoMep(c).filter((p) => p.nivel === 'erro');
      for (const e of erros) {
        expect(e.mensagem, `${c.id}: ${e.onde}`).toContain('profundidade da bolsa B');
        const id = /^item ([^,]+),/.exec(e.onde)?.[1] ?? '';
        expect(ITENS_COM_B_MAIOR_QUE_C.has(id), `${c.id}: ${e.onde}`).toBe(true);
      }
    }
  });

  it('nenhuma linha repete bitola nem tem coluna fora do declarado (erro de digitação)', () => {
    for (const c of CATALOGOS) {
      const erros = validarCatalogoMep(c).filter((p) => p.nivel === 'erro');
      expect(erros.filter((e) => /repetida|não está declarada|valor inválido/.test(e.mensagem)), c.id).toEqual([]);
    }
  });

  it('anomalias de impressão ficaram como nota na linha, não corrigidas em silêncio', () => {
    expect(celula(TIGRE_ESGOTO_NORMAL, 'tubo_esgoto_serie_normal_3m', '200', 'B')).toBe(77);
    const nota = item(TIGRE_ESGOTO_NORMAL, 'tubo_esgoto_serie_normal_3m').linhas.find((l) => l.bitola === '200')?.nota;
    expect(nota).toContain('1200');
    const cap = item(TIGRE_SOLDAVEL, 'cap_soldavel').linhas.find((l) => l.bitola === '60')?.nota;
    expect(cap).toContain('38,6');
  });
});

describe('catálogos Tigre: amostra contra o texto da ficha (cada valor copiado do .txt)', () => {
  it('amostra 1, esgoto série normal DN 100: B = 55, D = 101,6, e = 1,8, L = 6000', () => {
    expect(celula(TIGRE_ESGOTO_NORMAL, 'tubo_esgoto_serie_normal_6m', '100', 'B')).toBe(55);
    expect(celula(TIGRE_ESGOTO_NORMAL, 'tubo_esgoto_serie_normal_6m', '100', 'D')).toBe(101.6);
    expect(celula(TIGRE_ESGOTO_NORMAL, 'tubo_esgoto_serie_normal_6m', '100', 'e')).toBe(1.8);
    expect(celula(TIGRE_ESGOTO_NORMAL, 'tubo_esgoto_serie_normal_6m', '100', 'L')).toBe(6000);
  });

  it('amostra 2, esgoto série reforçada DN 150, 6 m: B = 73, e = 3,6', () => {
    expect(celula(TIGRE_ESGOTO_REFORCADA, 'tubo_esgoto_serie_reforcada_6m', '150', 'B')).toBe(73);
    expect(celula(TIGRE_ESGOTO_REFORCADA, 'tubo_esgoto_serie_reforcada_6m', '150', 'e')).toBe(3.6);
  });

  it('amostra 3, soldável DN 110, 6 m: B = 91, D = 110, e = 6,1', () => {
    expect(celula(TIGRE_SOLDAVEL, 'tubo_soldavel_6m', '110', 'B')).toBe(91);
    expect(celula(TIGRE_SOLDAVEL, 'tubo_soldavel_6m', '110', 'D')).toBe(110);
    expect(celula(TIGRE_SOLDAVEL, 'tubo_soldavel_6m', '110', 'e')).toBe(6.1);
  });

  it('amostra 4, roscável 2”, 6 m: B = 23,4 (a bitola é a rosca, não número)', () => {
    expect(celula(TIGRE_ROSCAVEL, 'tubo_roscavel_6m', '2”', 'B')).toBe(23.4);
    expect(celula(TIGRE_ROSCAVEL, 'tubo_roscavel_6m', '2”', 'L')).toBe(6000);
  });

  it('amostra 5, Tigreflex amarelo DN 25 (¾”): Di = 19,5, e = 2,8', () => {
    expect(celula(TIGRE_TIGREFLEX_AMARELO, 'eletroduto_corrugado_amarelo', '25', 'Di')).toBe(19.5);
    expect(celula(TIGRE_TIGREFLEX_AMARELO, 'eletroduto_corrugado_amarelo', '25', 'e')).toBe(2.8);
  });

  it('amostra 6, Tigreflex reforçado DN 25: Di = 18,6, e = 3,2', () => {
    expect(celula(TIGRE_TIGREFLEX_REFORCADO, 'eletroduto_corrugado_reforcado', '25', 'Di')).toBe(18.6);
    expect(celula(TIGRE_TIGREFLEX_REFORCADO, 'eletroduto_corrugado_reforcado', '25', 'e')).toBe(3.2);
  });

  it('amostra 7, caixa de passagem CPT 20: E = 200 (embutir) e C = 85 (sobrepor, CPT 40 = 98)', () => {
    expect(celula(TIGRE_CAIXA_PASSAGEM_PAREDE, 'caixa_passagem_parede_embutir', 'CPT 20', 'E')).toBe(200);
    expect(celula(TIGRE_CAIXA_PASSAGEM_PAREDE, 'caixa_passagem_parede_sobrepor', 'CPT 40', 'C')).toBe(98);
  });

  it('a série reforçada tem bolsa B = 40 no DN 40, a normal tem 26 (as duas tabelas não se confundem)', () => {
    expect(celula(TIGRE_ESGOTO_NORMAL, 'tubo_esgoto_serie_normal_6m', '40', 'B')).toBe(26);
    expect(celula(TIGRE_ESGOTO_REFORCADA, 'tubo_esgoto_serie_reforcada_6m', '40', 'B')).toBe(40);
  });

  it('contagens de tubo: esgoto normal 6 bitolas, soldável 6 m com 9, roscável 6 m com 11', () => {
    expect(item(TIGRE_ESGOTO_NORMAL, 'tubo_esgoto_serie_normal_6m').linhas.length).toBe(6);
    expect(item(TIGRE_SOLDAVEL, 'tubo_soldavel_6m').linhas.length).toBe(9);
    expect(item(TIGRE_ROSCAVEL, 'tubo_roscavel_6m').linhas.length).toBe(11);
  });

  it('o item da caixa com suporte para lajota guarda a faixa de altura A (250 a 310) em duas colunas', () => {
    const lajota = item(TIGRE_TIGREFLEX_REFORCADO, 'caixa_octogonal_suporte_lajota_reforcada');
    expect(lajota.colunas).toHaveProperty('Amax');
    expect(lajota.linhas[0]?.valores).toEqual({ A: 250, Amax: 310, B: 112, H: 74 });
  });
});
