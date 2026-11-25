import { describe, expect, it } from 'vitest';
import { buscaDaColuna, bitolasDoItem, pendentesDeConferencia, validarCatalogoMep, type ItemCatalogo } from './catalogoMep.ts';
import { KRONA_ELETRICA } from './catalogosMep/kronaEletrica.ts';
import { avaliar, parse } from './expressao.ts';

const item = (id: string): ItemCatalogo => {
  const it = KRONA_ELETRICA.itens.find((i) => i.id === id);
  if (!it) throw new Error(`item de referência ausente: ${id}`);
  return it;
};

describe('catálogo MEP: Krona elétrica (eletrodutos e caixas de luz, páginas 6 a 11)', () => {
  it('tem a fonte rastreável (url e hash do PDF de 47 páginas)', () => {
    expect(KRONA_ELETRICA.fonte.url).toBe('https://www.krona.com.br/wp-content/uploads/2026/02/CATALOGO-TENICO-LINHA-ELETRICA-2026.pdf');
    expect(KRONA_ELETRICA.fonte.sha256).toBe('53e4a8f9909f1061511cbb9595717e732ad4712b27e216abb93e826675fd3a5e');
    expect(KRONA_ELETRICA.fonte.edicao).toBe('2026');
    expect(KRONA_ELETRICA.dominio).toBe('eletroduto');
  });

  it('transcreveu 22 tabelas e 71 linhas, todas nas páginas 6 a 11', () => {
    expect(KRONA_ELETRICA.itens).toHaveLength(22);
    expect(KRONA_ELETRICA.itens.reduce((n, i) => n + i.linhas.length, 0)).toBe(71);
    expect(KRONA_ELETRICA.itens.every((i) => i.pagina !== undefined && i.pagina >= 6 && i.pagina <= 11)).toBe(true);
  });

  it('nasce todo CONFERIR e sem conferente', () => {
    expect(pendentesDeConferencia(KRONA_ELETRICA)).toBe(KRONA_ELETRICA.itens.length);
    expect(KRONA_ELETRICA.itens.every((i) => i.estado === 'CONFERIR' && i.conferidoPor === undefined)).toBe(true);
  });

  it('cobre os tipos de peça do trecho: tubo, curva 90, luva, caixa (e "outro" para o que o gerador não reconhece)', () => {
    const tipos = new Set(KRONA_ELETRICA.itens.map((i) => i.tipo));
    for (const t of ['tubo', 'curva90', 'luva', 'caixa', 'outro']) expect(tipos.has(t)).toBe(true);
    // "outro": curvas de 135° e 180°, eletroduto corrugado e prolongador. O gerador só reconhece palavras de tubo e conexão.
    expect(item('curva_135_para_eletroduto_roscavel').tipo).toBe('outro');
    expect(item('eletroduto_de_pvc_corrugado_flexivel_parede').tipo).toBe('outro');
  });

  it('não tem erro de forma além das anomalias do PDF listadas abaixo', () => {
    const erros = validarCatalogoMep(KRONA_ELETRICA).filter((p) => p.nivel === 'erro').map((p) => `${p.onde}: ${p.mensagem}`);
    expect(erros).toEqual([
      // ANOMALIA 1 (página 8 do PDF): o eletroduto corrugado flexível (parede) lista a bitola 20 e a 25 três vezes, e a 32
      // duas, uma linha para cada comprimento de rolo (C(m) = 10, 25 ou 50). O validador pede bitola única; a família
      // escolheria uma linha às cegas. Mantido como impresso, com C(m) na coluna Cm. Decidir a forma: um item por comprimento.
      'item eletroduto_de_pvc_corrugado_flexivel_parede, bitola 20: bitola repetida',
      'item eletroduto_de_pvc_corrugado_flexivel_parede, bitola 20: bitola repetida',
      'item eletroduto_de_pvc_corrugado_flexivel_parede, bitola 25: bitola repetida',
      'item eletroduto_de_pvc_corrugado_flexivel_parede, bitola 25: bitola repetida',
      'item eletroduto_de_pvc_corrugado_flexivel_parede, bitola 32: bitola repetida',
      // ANOMALIA 2: a regra "B não pode passar de C" vale para tubo e conexão (B é a profundidade da bolsa). Nas caixas de luz
      // a letra B é outra dimensão (largura da caixa), então a regra dispara sem erro real. Os valores estão como impressos.
      'item prolongador_para_caixa_de_luz_octogonal, bitola 4x4: profundidade da bolsa B (90.7) maior que o comprimento C (56.5)',
      'item prolongador_reforcado_para_caixa_de_luz_para_laje, bitola 4x4: profundidade da bolsa B (90.7) maior que o comprimento C (56.5)',
      'item caixa_de_luz_octogonal_com_fundo_movel_para_eletroduto_corrugado_flexivel, bitola 4x4: profundidade da bolsa B (91.4) maior que o comprimento C (51)',
      'item caixa_de_luz_octogonal_com_fundo_movel_para_eletroduto_corrugado_reforcado, bitola 4x4: profundidade da bolsa B (91.4) maior que o comprimento C (51)',
      'item caixa_de_luz_empilhavel_para_eletroduto_corrugado_flexivel, bitola 4x2: profundidade da bolsa B (116) maior que o comprimento C (46.8)',
      'item caixa_de_luz_para_eletroduto_corrugado_flexivel, bitola 4x4: profundidade da bolsa B (91.4) maior que o comprimento C (51)',
      'item caixa_de_luz_para_eletroduto_corrugado_flexivel_2, bitola 4x4: profundidade da bolsa B (111) maior que o comprimento C (47)',
    ]);
  });

  it('avisa D e d diferentes no tubo e nos eletrodutos corrugados (leitura da letra D pendente, como no esgoto)', () => {
    const avisos = validarCatalogoMep(KRONA_ELETRICA).filter((p) => p.nivel === 'aviso');
    expect(avisos.some((p) => p.onde.includes('tubo_eletroduto_de_pvc_rigido_roscavel_3m') && /D \(21\.1\)/.test(p.mensagem))).toBe(true);
    expect(avisos.some((p) => p.onde.includes('eletroduto_de_pvc_corrugado_reforcado_flexivel_vdi'))).toBe(true);
  });

  it('tubo de 3 m: o "3m" do PDF vira 3000 mm. ANOMALIA 4: a tabela roscável diz "Dimensões (pol.)", mas os valores foram lidos como mm (CONFERIR a unidade)', () => {
    const t = item('tubo_eletroduto_de_pvc_rigido_roscavel_3m');
    expect(t.linhas.every((l) => l.valores.C === 3000)).toBe(true);
    expect(t.linhas.find((l) => l.codigo === '1100')?.valores).toEqual({ B: 16.5, C: 3000, D: 21.1, d: 15.3 });
    expect(t.colunas.D).toBeDefined();
    expect(t.serie).toBe('Eletroduto rígido roscável');
  });

  it('a coluna D das luvas e curvas roscáveis é a rosca em texto (1/2”): sai do item, não é número', () => {
    const luva = item('luva_para_eletroduto_roscavel');
    expect(Object.keys(luva.colunas)).toEqual(['B', 'C']);
    expect(luva.linhas.find((l) => l.codigo === '1181')).toEqual({ codigo: '1181', bitola: '1/2”', valores: { B: 17, C: 37 } });
    const curta = item('curva_90_curta_para_eletroduto_roscavel');
    expect(Object.keys(curta.colunas)).toEqual(['B', 'C', 'd', 'R']);
    expect(curta.linhas.find((l) => l.codigo === '1142')?.valores).toEqual({ B: 17, C: 49.9, d: 15.3, R: 44 });
  });

  it('a curva 90 longa roscável não tem coluna d no PDF', () => {
    expect(Object.keys(item('curva_90_longa_para_eletroduto_roscavel').colunas)).toEqual(['B', 'C', 'R']);
  });

  it('as bitolas do soldável são numéricas e a família lê a coluna d pela busca', () => {
    const s = item('tubo_eletroduto_de_pvc_rigido_soldavel_3m');
    expect(bitolasDoItem(s)).toEqual([20, 25, 32]);
    const expr = buscaDaColuna(s, 'd', 'DN');
    expect(expr).toBe('busca(DN, 20, 15.9, 25, 20.5, 32, 26.7)');
    expect(avaliar(parse(expr ?? ''), { DN: 25 })).toBeCloseTo(20.5, 9);
  });

  it('o roscável não entra na busca numérica (bitola em rosca é texto)', () => {
    expect(buscaDaColuna(item('tubo_eletroduto_de_pvc_rigido_roscavel_3m'), 'd', 'DN')).toBeNull();
  });

  it('o comprimento do corrugado vem em metros (C(m) = 10, 25, 50) e o do reforçado em cm (C(cm)), como impresso', () => {
    const p = item('eletroduto_de_pvc_corrugado_flexivel_parede');
    expect(p.colunas.Cm).toBeDefined();
    expect(p.linhas.find((l) => l.codigo === '1225')?.valores).toEqual({ Cm: 10, D: 20, d: 15.8 });
    expect(item('eletroduto_de_pvc_corrugado_reforcado_flexivel_laje').colunas.Ccm).toBeDefined();
  });

  it('caixas de luz: 4x2, 4x4 e laje como impressas', () => {
    const e = item('caixa_de_luz_empilhavel_para_eletroduto_corrugado_flexivel');
    expect(e.linhas).toEqual([{ codigo: '1265', bitola: '4x2', valores: { A: 65, B: 116, C: 46.8, D: 107, E: 83.5 } }]);
    expect(item('caixa_de_luz_para_laje').linhas.map((l) => l.bitola)).toEqual(['250', '300']);
  });

  it('a caixa 1266 tem duas colunas C: a segunda é C_2 (cabeçalho repetido no PDF)', () => {
    const c = item('caixa_de_luz_para_eletroduto_corrugado_flexivel_2');
    expect(Object.keys(c.colunas)).toEqual(['A', 'B', 'C', 'C_2', 'E']);
  });

  it('ANOMALIA 3: o código 2369 (caixa de luz, página 10) fica fora da sequência 1254-1266 da mesma página', () => {
    // O PDF imprime 2369 para a caixa 4x4 flexível, com as mesmas medidas da 1255. O título é igual ao da 1266 (página 11).
    // Transcrito como impresso; conferir se é erro de impressão.
    expect(item('caixa_de_luz_para_eletroduto_corrugado_flexivel').linhas[0]?.codigo).toBe('2369');
  });

  it('todas as colunas têm rótulo, e os rótulos são o da letra do desenho (CONFERIR)', () => {
    for (const it of KRONA_ELETRICA.itens) {
      for (const [col, meaning] of Object.entries(it.colunas)) {
        expect(meaning.length, `${it.id} coluna ${col}`).toBeGreaterThan(0);
      }
    }
    expect(item('caixa_de_luz_para_laje').colunas.B).toBe('letra do desenho (CONFERIR)');
  });
});
