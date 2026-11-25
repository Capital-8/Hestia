import { CATALOGO_MEP_FORMATO, CATALOGO_MEP_VERSAO, type CatalogoMep, type ItemCatalogo } from '../catalogoMep.ts';

/*
 * GERADO por docs/familias-parametricas/catalogos/ferramentas (extrair-krona.py + gerar-ts.py) a partir do PDF indicado na fonte.
 * Transcrição AUTOMÁTICA do texto do PDF: todo item nasce CONFERIR. Compare com o documento antes de usar em projeto real.
 * As letras das colunas seguem o desenho do fabricante; o significado de D, Z, A e E é leitura nossa (CONFERIR).
 */

type Cols = Record<string, string>;
type Linha = readonly [string, string, Record<string, number>];

function item(id: string, nome: string, tipo: string, serie: string, pagina: number, colunas: Cols, linhas: Linha[]): ItemCatalogo {
  return { id, nome, tipo, serie, colunas, pagina, estado: 'CONFERIR', linhas: linhas.map(([codigo, bitola, valores]) => ({ codigo, bitola, valores })) };
}

export const KRONA_ESGOTO: CatalogoMep = {
  formato: CATALOGO_MEP_FORMATO,
  versao: CATALOGO_MEP_VERSAO,
  id: 'catalogo_krona_esgoto',
  nome: 'Catálogo Técnico Esgoto',
  dominio: 'esgoto',
  fonte: { fabricante: 'Krona', documento: 'Catálogo Técnico Esgoto', edicao: '2025', url: 'https://www.krona.com.br/wp-content/uploads/2023/01/Catalogo-Tecnico-Esgoto-2025.pdf', sha256: '10c24aa86eb44a2ecb5618d73a59d5d28d134dc1143bdc52c72024fffedadb33' },
  itens: [
  item('tubo_de_pvc_esgoto_primario_6m', 'Tubo de PVC Esgoto Primário 6m', 'tubo', 'Esgoto série normal', 10, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', e: 'espessura da parede' }, [
    ['0101', '50', { B: 39, C: 6000, D: 50.7, d: 50.7, e: 1.6 }],
    ['0102', '75', { B: 44, C: 6000, D: 75.5, d: 75.5, e: 1.7 }],
    ['0103', '100', { B: 50, C: 6000, D: 101.6, d: 101.6, e: 1.8 }],
    ['0104', '150', { B: 60, C: 6000, D: 150, d: 150, e: 2.6 }],
    ['0105', '200', { B: 72, C: 6000, D: 200, d: 200, e: 3.5 }],
  ]),
  item('tubo_de_pvc_esgoto_primario_3m', 'Tubo de PVC Esgoto Primário 3m', 'tubo', 'Esgoto série normal', 10, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', e: 'espessura da parede' }, [
    ['0111', '50', { B: 39, C: 3000, D: 50.7, d: 50.7, e: 1.6 }],
    ['0112', '75', { B: 44, C: 3000, D: 75.5, d: 75.5, e: 1.7 }],
    ['0113', '100', { B: 50, C: 3000, D: 101.6, d: 101.6, e: 1.8 }],
    ['0114', '150', { B: 60, C: 3000, D: 150, d: 150, e: 2.6 }],
    ['0115', '200', { B: 72, C: 3000, D: 200, d: 200, e: 3.5 }],
  ]),
  item('tubos_de_pvc_esgoto_secundario_6m', 'Tubos de PVC Esgoto Secundário 6m', 'tubo', 'Esgoto série normal', 10, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', e: 'espessura da parede' }, [
    ['0100', '40', { B: 18, C: 6000, D: 40, d: 40, e: 1.2 }],
  ]),
  item('tubos_de_pvc_esgoto_secundario_6m_2', 'Tubos de PVC Esgoto Secundário 6m', 'tubo', 'Esgoto série normal', 10, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', e: 'espessura da parede' }, [
    ['0110', '40', { B: 18, C: 3000, D: 40, d: 40, e: 1.2 }],
  ]),
  item('tubos_de_pvc_esgoto_secundario_6m_3', 'Tubos de PVC Esgoto Secundário 6m', 'tubo', 'Esgoto série normal', 11, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', e: 'espessura da parede' }, [
    ['0106', '250', { B: 104, C: 6000, D: 250, d: 250, e: 2.8 }],
  ]),
  item('bucha_de_reducao_longa_esgoto', 'Bucha de Redução Longa Esgoto', 'bucha', 'Esgoto série normal', 11, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0592', '50x40', { B: 18, Z: 43, D: 40, d: 50.7 }],
  ]),
  item('cap_esgoto_primario', 'Cap Esgoto Primário', 'cap', 'Esgoto série normal', 11, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0594', '50', { B: 39, C: 41.1, D: 50.7 }],
    ['0595', '75', { B: 44, C: 46.3, D: 75.5 }],
    ['0596', '100', { B: 50, C: 52.3, D: 101.6 }],
    ['0597', '150', { B: 63, C: 66.5, D: 150 }],
    ['0598', '200', { B: 72, C: 76.9, D: 200 }],
  ]),
  item('cap_esgoto_secundario', 'Cap Esgoto Secundário', 'cap', 'Esgoto série normal', 11, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0593', '40', { B: 18, C: 21, D: 40 }],
  ]),
  item('curva_45_curta_esgoto_primario', 'Curva 45° Curta Esgoto Primário', 'curva45', 'Esgoto série normal', 12, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0729', '100', { B: 45, Z: 40.1, C: 110.1, D: 101.6, d: 101.6 }],
  ]),
  item('curva_90_curta_esgoto_secundario', 'Curva 90° Curta Esgoto Secundário', 'curva90', 'Esgoto série normal', 12, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0599', '40', { B: 18, Z: 42, D: 40 }],
  ]),
  item('curva_90_longa_esgoto_primario', 'Curva 90° Longa Esgoto Primário', 'curva90', 'Esgoto série normal', 12, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0634', '50', { B: 39, Z: 89, C: 149.9, D: 50.7, d: 50.7 }],
    ['0635', '75', { B: 44, Z: 156.7, C: 227.4, D: 75.5, d: 75.5 }],
    ['0636', '100', { B: 45, Z: 182.5, C: 257.6, D: 101.6, d: 101.6 }],
    ['0637', '150', { B: 60, Z: 426.5, C: 530, D: 150, d: 150 }],
  ]),
  item('curva_90_longa_esgoto_secundario', 'Curva 90° Longa Esgoto Secundário', 'curva90', 'Esgoto série normal', 12, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0633', '40', { B: 18, Z: 99.5, D: 40 }],
  ]),
  item('curva_90_curta_esgoto_secundario_2', 'Curva 90° Curta Esgoto Secundário', 'curva90', 'Esgoto série normal', 12, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0600', '50', { B: 39, Z: 52.8, C: 94, D: 50.7, d: 50.7 }],
    ['0601', '75', { B: 44, Z: 66.6, C: 112, D: 75.5, d: 75.5 }],
    ['0602', '100', { B: 45, Z: 79, C: 136, D: 101.6, d: 101.6 }],
  ]),
  item('curva_45_longa_esgoto_primario', 'Curva 45° Longa Esgoto Primário', 'curva45', 'Esgoto série normal', 13, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0607', '50', { B: 39, Z: 93.8, C: 122.8, D: 50.7, d: 50.7 }],
    ['0608', '75', { B: 44, Z: 142.5, C: 174.7, D: 75.5, d: 75.5 }],
    ['0609', '100', { B: 45, Z: 168.5, C: 230.5, D: 101.6, d: 101.6 }],
    ['0610', '150', { B: 72, Z: 259, C: 285, D: 150, d: 150 }],
  ]),
  item('curva_45_longa_esgoto_secundario', 'Curva 45° Longa Esgoto Secundário', 'curva45', 'Esgoto série normal', 13, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0606', '40', { B: 26, C: 93.8, D: 40 }],
  ]),
  item('joelho_90_esgoto_primario', 'Joelho 90° Esgoto Primário', 'joelho90', 'Esgoto série normal', 13, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0617', '50', { B: 39, Z: 31, C: 70, D: 50.7, d: 50.7 }],
    ['0618', '75', { B: 44, Z: 42, C: 88, D: 75.5, d: 75.5 }],
    ['0619', '100', { B: 45, Z: 58, C: 103, D: 101.6, d: 101.6 }],
    ['0621', '150', { B: 62, Z: 82, C: 142, D: 150, d: 150 }],
    ['0716', '200', { B: 72, Z: 112, C: 174.2, D: 200, d: 200 }],
  ]),
  item('joelho_90_esgoto_secundario', 'Joelho 90° Esgoto Secundário', 'joelho90', 'Esgoto série normal', 13, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0616', '40', { B: 18, Z: 22, D: 40 }],
  ]),
  item('joelho_45_esgoto_primario', 'Joelho 45° Esgoto Primário', 'joelho45', 'Esgoto série normal', 13, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0612', '50', { B: 39, Z: 13, C: 56.2, D: 50.7, d: 50.7 }],
    ['0613', '75', { B: 44, Z: 36, C: 69, D: 75.5, d: 75.5 }],
    ['0614', '100', { B: 45, Z: 29.6, C: 74.5, D: 101.6, d: 101.6 }],
    ['0615', '150', { B: 60, Z: 40, C: 100, D: 150, d: 150 }],
    ['0714', '200', { B: 72, Z: 78.2, C: 121.7, D: 200, d: 200 }],
  ]),
  item('joelho_45_esgoto_secundario', 'Joelho 45° Esgoto Secundário', 'joelho45', 'Esgoto série normal', 14, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0611', '40', { B: 18, Z: 10, D: 40 }],
  ]),
  item('joelho_90_esgoto_com_visita', 'Joelho 90° Esgoto Com Visita', 'joelho90', 'Esgoto série normal', 14, { B1: 'bolsa 1', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D1: 'diâmetro 1', d: 'diâmetro externo da ponta', B2: 'bolsa 2', Z2: 'Z do ramal 2', C: 'comprimento total', D2: 'diâmetro 2' }, [
    ['0622', '100x50', { B1: 45, Z: 58, D1: 101.6, d: 101.6, B2: 39, Z2: 52.8, C: 200, D2: 50.7 }],
  ]),
  item('joelho_90_branco_esgoto_com_anel_de_vedacao', 'Joelho 90° Branco Esgoto Com Anel de Vedação', 'joelho90', 'Esgoto série normal', 14, { B1: 'bolsa 1', Z1: 'Z do ramal 1', D1: 'diâmetro 1', B2: 'bolsa 2', Z2: 'Z do ramal 2', Z2_2: 'Z2_2', D2: 'diâmetro 2' }, [
    ['0623', '40x40', { B1: 26.1, Z1: 20.9, D1: 40, B2: 18, Z2: 20.5, Z2_2: 52.8, D2: 40 }],
  ]),
  item('joelho_90_azul_esgoto_com_anel_de_vedacao', 'Joelho 90° Azul Esgoto Com Anel de Vedação', 'joelho90', 'Esgoto série normal', 14, { B1: 'bolsa 1', Z1: 'Z do ramal 1', D1: 'diâmetro 1', B2: 'bolsa 2', Z2: 'Z do ramal 2', D2: 'diâmetro 2' }, [
    ['0624', '38x40', { B1: 26, Z1: 20, D1: 40, B2: 18, Z2: 20.5, D2: 38 }],
  ]),
  item('juncao_45_esgoto_simples_primario', 'Junção 45° Esgoto Simples Primário', 'juncao', 'Esgoto série normal', 14, { B: 'profundidade da bolsa', C: 'comprimento total', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0627', '50', { B: 39, C: 155, Z: 73, D: 50.7, d: 50.7 }],
    ['0628', '75', { B: 44, C: 205, Z: 97.6, D: 75.5, d: 75.5 }],
    ['0629', '100', { B: 45, C: 253, Z: 130, D: 101.6, d: 101.6 }],
    ['0630', '150', { B: 60, C: 350, Z: 190.5, D: 150, d: 150 }],
    ['0718', '200', { B: 72, C: 440, Z: 247.5, D: 200, d: 200 }],
  ]),
  item('juncao_45_esgoto_simples_secundario', 'Junção 45° Esgoto Simples Secundário', 'juncao', 'Esgoto série normal', 15, { B: 'profundidade da bolsa', C1: 'comprimento 1', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0626', '40', { B: 18, C1: 105.5, Z: 50.5, D: 40 }],
  ]),
  item('juncao_45_esgoto_invertida_primario', 'Junção 45° Esgoto Invertida Primário', 'juncao', 'Esgoto série normal', 15, { B: 'profundidade da bolsa', C: 'comprimento total', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0704', '75x75', { B: 44, C: 211, Z1: 19.1, Z2: 93.6, D: 75.5, d: 75.5 }],
    ['0709', '100x100', { B: 45, C: 260, Z1: 26, Z2: 125.5, D: 101.6, d: 101.6 }],
  ]),
  item('juncao_45_invertida_de_reducao_para_esgoto_primario', 'Junção 45° Invertida de Redução para Esgoto Primário', 'juncao', 'Esgoto série normal', 15, { B1: 'bolsa 1', C: 'comprimento total', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2', D1: 'diâmetro 1', d: 'diâmetro externo da ponta', B2: 'bolsa 2', D2: 'diâmetro 2' }, [
    ['0700', '70x50', { B1: 44, C: 178, Z1: 131.7, Z2: 81.3, D1: 75.5, d: 75.5, B2: 39, D2: 50.7 }],
    ['0701', '100x50', { B1: 45, C: 186, Z1: 148, Z2: 98.8, D1: 101.6, d: 101.6, B2: 39, D2: 50.7 }],
    ['0702', '100x75', { B1: 45, C: 223, Z1: 165.5, Z2: 112.1, D1: 101.6, d: 101.6, B2: 44, D2: 75.5 }],
  ]),
  item('juncao_45_esgoto_dupla_primario', 'Junção 45° Esgoto Dupla Primário', 'juncao', 'Esgoto série normal', 15, { B: 'profundidade da bolsa', C: 'comprimento total', Z: 'distância do centro à entrada da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0708', '75x75', { B: 44, C: 210, Z: 97.6, d: 75.5, D: 75.5 }],
    ['0710', '100x100', { B: 45, C: 260, Z: 130, d: 101.6, D: 101.6 }],
  ]),
  item('juncao_de_reducao_45_esgoto_primario', 'Junção de Redução 45° Esgoto Primário', 'juncao', 'Esgoto série normal', 15, { B1: 'bolsa 1', C: 'comprimento total', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2', D1: 'diâmetro 1', d: 'diâmetro externo da ponta', B2: 'bolsa 2', D2: 'diâmetro 2' }, [
    ['0638', '70x50', { B1: 44, C: 172, Z1: 80.3, Z2: 85.3, D1: 75.5, d: 75.5, B2: 39, D2: 50.7 }],
    ['0639', '100x50', { B1: 45, C: 172, Z1: 92.5, Z2: 103.3, D1: 101.6, d: 101.6, B2: 39, D2: 50.7 }],
    ['0640', '100x75', { B1: 45, C: 218, Z1: 110, Z2: 115.6, D1: 101.6, d: 101.6, B2: 44, D2: 75.5 }],
    ['0641', '150x100', { B1: 60, C: 300, Z1: 160, Z2: 177, D1: 150, d: 150, B2: 45, D2: 101.6 }],
  ]),
  item('luva_esgoto_primaria', 'Luva Esgoto Primária', 'luva', 'Esgoto série normal', 16, { B1: 'bolsa 1', C: 'comprimento total', B2: 'bolsa 2', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0645', '50', { B1: 39, C: 62.4, B2: 21.4, Z: 2, D: 50.7 }],
    ['0646', '75', { B1: 44, C: 73, B2: 26, Z: 3, D: 75.5 }],
    ['0647', '100', { B1: 45, C: 79, B2: 31, Z: 3, D: 101.6 }],
    ['0648', '150', { B1: 60, C: 113, B2: 49.2, Z: 3.8, D: 150 }],
    ['0720', '200', { B1: 72, C: 132.5, B2: 54, Z: 6.5, D: 200 }],
  ]),
  item('luva_esgoto_secundario', 'Luva Esgoto Secundário', 'luva', 'Esgoto série normal', 16, { B1: 'bolsa 1', C: 'comprimento total', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0644', '40', { B1: 18, C: 38, Z: 2, D: 40 }],
  ]),
  item('luva_de_esgoto', 'Luva de Esgoto', 'luva', 'Esgoto série normal', 16, { C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0649', '40', { C: 66, D: 40.4 }],
    ['0650', '50', { C: 78, D: 51.3 }],
    ['0651', '75', { C: 90, D: 75.9 }],
    ['0652', '100', { C: 133, D: 102 }],
    ['0653', '150', { C: 140, D: 150.4 }],
  ]),
  item('reducao_excentrica_esgoto', 'Redução Excêntrica Esgoto', 'reducao', 'Esgoto série normal', 16, { B: 'profundidade da bolsa', C1: 'comprimento 1', C2: 'comprimento 2', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0654', '75x50', { B: 39, C1: 104.1, C2: 47, D: 50.7, d: 75.5 }],
    ['0655', '100x50', { B: 39, C1: 131, C2: 59, D: 50.7, d: 101.6 }],
    ['0656', '100x75', { B: 44, C1: 122, C2: 59, D: 75.5, d: 101.6 }],
    ['0657', '150x100', { B: 45, C1: 150, C2: 65, D: 101.6, d: 15 }],
    ['0724', '200x150', { B: 60, C1: 170.4, C2: 72.5, D: 150, d: 200 }],
  ]),
  item('te_esgoto_primario', 'Tê Esgoto Primário', 'te', 'Esgoto série normal', 17, { B: 'profundidade da bolsa', C: 'comprimento total', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['0659', '50', { B: 39, C: 152.5, Z1: 39.8, Z2: 28.3, D: 50.7, d: 50.7 }],
    ['0660', '75', { B: 44, C: 184, Z1: 55.5, Z2: 35, D: 75.5, d: 75.5 }],
    ['0661', '100', { B: 45, C: 216, Z1: 46, Z2: 53, D: 101.6, d: 101.6 }],
    ['0662', '150', { B: 60, C: 296, Z1: 113, Z2: 53, D: 150, d: 150 }],
    ['0726', '200', { B: 72, C: 390, Z1: 142.5, Z2: 105.5, D: 200, d: 200 }],
  ]),
  item('te_esgoto_secundario', 'Tê Esgoto Secundário', 'te', 'Esgoto série normal', 17, { B: 'profundidade da bolsa', C1: 'comprimento 1', C2: 'comprimento 2', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['0658', '40', { B: 18, C1: 88, C2: 44, Z: 22.5, D: 40 }],
  ]),
  item('te_de_reducao_esgoto', 'Tê de Redução Esgoto', 'te', 'Esgoto série normal', 17, { B1: 'bolsa 1', C: 'comprimento total', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2', D1: 'diâmetro 1', d: 'diâmetro externo da ponta', B2: 'bolsa 2', D2: 'diâmetro 2' }, [
    ['0663', '75x50', { B1: 44, C: 160, Z1: 27.6, Z2: 50.8, D1: 75.5, d: 75.5, B2: 39, D2: 50.7 }],
    ['0664', '100x50', { B1: 45, C: 167, Z1: 24.5, Z2: 63.5, D1: 101.6, d: 101.6, B2: 39, D2: 50.7 }],
    ['0665', '100x75', { B1: 45, C: 224, Z1: 41, Z2: 67.1, D1: 101.6, d: 101.6, B2: 44, D2: 75.5 }],
    ['0666', '150x100', { B1: 60, C: 243, Z1: 54, Z2: 93.2, D1: 150, d: 150, B2: 45, D2: 101.6 }],
  ]),
  item('aneis_de_vedacao_esgoto_sn_e_sr', 'Anéis de Vedação Esgoto SN e SR', 'outro', 'Esgoto série normal', 17, { D: 'diâmetro do anel (CONFERIR)', d: 'seção do anel (CONFERIR; o desenho marca e)' }, [
    ['0670', '40', { D: 37.2, d: 5 }],
    ['0671', '50', { D: 49, d: 6.2 }],
    ['0672', '75', { D: 74, d: 6.2 }],
    ['0673', '100', { D: 100.5, d: 6.2 }],
    ['0674', '150', { D: 149, d: 9.2 }],
    ['0678', '200', { D: 199, d: 10.3 }],
  ]),
  item('te_de_inspecao_esgoto', 'Tê de Inspeção Esgoto', 'te', 'Esgoto série normal', 17, { B: 'profundidade da bolsa', C1: 'comprimento 1', Z: 'distância do centro à entrada da bolsa (CONFERIR)', C2: 'comprimento 2', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', T: 'T' }, [
    ['0728', '100x75', { B: 45, C1: 186, Z: 42.5, C2: 71.4, D: 101.6, d: 101.6, T: 82 }],
  ]),
  item('valvula_de_retencao_esgoto', 'Válvula de Retenção Esgoto', 'outro', 'Esgoto série normal', 18, { B: 'profundidade da bolsa', C1: 'comprimento 1', C2: 'comprimento 2', C3: 'C3', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2', D1: 'diâmetro 1', T: 'T', D2: 'diâmetro 2' }, [
    ['0668', '100', { B: 45, C1: 221, C2: 128.5, C3: 113.5, Z1: 67, Z2: 54, D1: 101.6, T: 167, D2: 150 }],
    ['0669', '150', { B: 60, C1: 299, C2: 160.7, C3: 145.7, Z1: 100, Z2: 79, D1: 150, T: 208, D2: 200 }],
  ]),
  item('terminal_de_ventilacao_esgoto', 'Terminal de Ventilação Esgoto', 'outro', 'Esgoto série normal', 18, { ØA: 'ØA', ØB: 'ØB', ØC: 'ØC', D: 'letra D do desenho (CONFERIR)', E: 'letra E do desenho (CONFERIR)' }, [
    ['1165', '50', { ØA: 62.2, ØB: 50.7, ØC: 54.3, D: 22, E: 57 }],
    ['1166', '75', { ØA: 86.5, ØB: 75.5, ØC: 79.1, D: 26, E: 63.2 }],
    ['1167', '100', { ØA: 115, ØB: 101.6, ØC: 106, D: 31, E: 73.5 }],
  ]),
  item('luva_de_esgoto_com_fixador', 'Luva de Esgoto Com Fixador', 'luva', 'Esgoto série normal', 18, { ØA: 'ØA', ØB: 'ØB', ØC: 'ØC', D: 'letra D do desenho (CONFERIR)', E: 'letra E do desenho (CONFERIR)', F: 'F', ØG: 'ØG' }, [
    ['1168', '100', { ØA: 101.6, ØB: 105.6, ØC: 150.6, D: 165.6, E: 28.5, F: 60, ØG: 60 }],
    ['1169', '150', { ØA: 150, ØB: 155.4, ØC: 198, D: 213, E: 31, F: 65, ØG: 65 }],
  ]),
  item('bolsa_acoplavel_cx_sifonada_pvc', 'Bolsa Acoplável CX Sifonada PVC', 'outro', 'Esgoto série normal', 22, { A: 'altura (CONFERIR)', B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', E: 'E (CONFERIR)', F: 'F' }, [
    ['0089', '100', { A: 60, B: 55, C: 97, D: 30, E: 12, F: 12 }],
    ['0090', '150', { A: 60, B: 56, C: 142, D: 30, E: 11, F: 12 }],
  ]),
  item('prolongamento_para_caixa_sifonada', 'Prolongamento para Caixa Sifonada', 'caixa', 'Esgoto série normal', 28, { A: 'altura (CONFERIR)', B: 'profundidade da bolsa' }, [
    ['0965', '150x150', { A: 150, B: 150 }],
    ['0966', '150x200', { A: 150, B: 200 }],
    ['0964', '250x200', { A: 250, B: 200 }],
  ]),
  item('tubo_de_pvc_esgoto_serie_reforcada_6m', 'Tubo de PVC Esgoto Série Reforçada 6m', 'tubo', 'Esgoto série reforçada', 31, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', e: 'espessura da parede' }, [
    ['0135', '50', { B: 40, C: 6000, D: 40, d: 50.7, e: 1.8 }],
    ['0136', '50', { B: 45, C: 6000, D: 50.7, d: 75.5, e: 1.8 }],
    ['0137', '75', { B: 46, C: 6000, D: 75.5, d: 101.6, e: 2 }],
    ['0138', '100', { B: 55, C: 6000, D: 101.6, d: 150, e: 2.5 }],
    ['0139', '150', { B: 70, C: 6000, D: 150, d: 200, e: 3.6 }],
  ]),
  item('bucha_de_reducao_esgoto_serie_reforcada', 'Bucha de Redução Esgoto Série Reforçada', 'bucha', 'Esgoto série reforçada', 31, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['1400', '50x40', { B: 18, Z: 45, D: 40, d: 50.7 }],
  ]),
  item('cap_esgoto_serie_reforcada', 'Cap Esgoto Série Reforçada', 'cap', 'Esgoto série reforçada', 31, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['1401', '40', { B: 18, C: 20.6, D: 40 }],
    ['1402', '50', { B: 39.3, C: 42, D: 50.7 }],
    ['1403', '75', { B: 44, C: 46.9, D: 75.5 }],
    ['1404', '100', { B: 45, C: 48.5, D: 101.6 }],
    ['1405', '150', { B: 60, C: 64.2, D: 150 }],
  ]),
  item('curva_90_esgoto_serie_reforcada', 'Curva 90° Esgoto Série Reforçada', 'curva90', 'Esgoto série reforçada', 31, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['1407', '50', { B: 39, Z: 52, C: 92, D: 50.7, d: 50.7 }],
    ['1425', '75', { B: 44.4, Z: 66.6, C: 112, D: 75.5, d: 75.5 }],
  ]),
  item('curva_90_curta_pe_coluna_esgoto_serie_reforcada', 'Curva 90° Curta Pé Coluna Esgoto Série Reforçada', 'curva90', 'Esgoto série reforçada', 31, { A1: 'A1', A2: 'A2', B1: 'bolsa 1', B2: 'bolsa 2', D1: 'diâmetro 1', D2: 'diâmetro 2' }, [
    ['1409', '75', { A1: 99.3, A2: 96.7, B1: 44, B2: 44, D1: 75.5, D2: 75.5 }],
    ['1410', '100', { A1: 125, A2: 120, B1: 45, B2: 45, D1: 101.6, D2: 101.6 }],
    ['1411', '150', { A1: 172.2, A2: 172.2, B1: 60, B2: 60, D1: 150, D2: 150 }],
  ]),
  item('joelho_45_esgoto_serie_reforcada_primario', 'Joelho 45° Esgoto Série Reforçada Primário', 'joelho45', 'Esgoto série reforçada', 32, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta' }, [
    ['1414', '50', { B: 39, Z: 15.9, C: 42.7, D: 50.7, d: 50.7 }],
    ['1416', '100', { B: 45, Z: 28, C: 62, D: 101.6, d: 101.6 }],
    ['1417', '150', { B: 60, Z: 37.8, C: 65.2, D: 150, d: 150 }],
  ]),
  item('item_sem_titulo_codigo_1413_reforcada', 'Item sem título (código 1413)', 'outro', 'Esgoto série reforçada', 32, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['1413', '40', { B: 18, Z: 9.5, D: 40 }],
  ]),
  item('joelho_90_esgoto_serie_reforcada_primario', 'Joelho 90° Esgoto Série Reforçada Primário', 'joelho90', 'Esgoto série reforçada', 32, { B: 'profundidade da bolsa', C: 'comprimento total', Z: 'distância do centro à entrada da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['1420', '50', { B: 39, C: 65.9, Z: 30.8, d: 50.7, D: 50.7 }],
    ['1421', '75', { B: 44.5, C: 84.4, Z: 42, d: 75.5, D: 75.5 }],
    ['1422', '100', { B: 45, C: 104.2, Z: 58, d: 101.6, D: 101.6 }],
    ['1423', '150', { B: 60, C: 139, Z: 84.8, d: 150, D: 150 }],
  ]),
  item('joelho_90_esgoto_serie_reforcada_secundario', 'Joelho 90° Esgoto Série Reforçada Secundário', 'joelho90', 'Esgoto série reforçada', 32, { B: 'profundidade da bolsa', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['1419', '40', { B: 18, Z: 21, D: 40 }],
  ]),
  item('juncao_dupla_esgoto_serie_reforcada', 'Junção Dupla Esgoto Série Reforçada', 'juncao', 'Esgoto série reforçada', 32, { B: 'profundidade da bolsa', C: 'comprimento total', Z: 'distância do centro à entrada da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['1426', '100', { B: 45, C: 245, Z: 127, d: 101.6, D: 101.6 }],
  ]),
  item('juncao_simples_esgoto_serie_reforcada_primario', 'Junção Simples Esgoto Série Reforçada Primário', 'juncao', 'Esgoto série reforçada', 33, { B: 'profundidade da bolsa', C: 'comprimento total', Z: 'distância do centro à entrada da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['1428', '50', { B: 39, C: 162, Z: 67.5, d: 50.7, D: 50.7 }],
    ['1429', '75', { B: 44, C: 200, Z: 95, d: 75.5, D: 75.5 }],
    ['1430', '100', { B: 45, C: 245, Z: 127, d: 101.6, D: 101.6 }],
    ['1431', '150', { B: 60, C: 340, Z: 186.5, d: 150, D: 150 }],
  ]),
  item('juncao_simples_esgoto_serie_reforcada_secundario', 'Junção Simples Esgoto Série Reforçada Secundário', 'juncao', 'Esgoto série reforçada', 33, { B: 'profundidade da bolsa', C: 'comprimento total', Z: 'distância do centro à entrada da bolsa (CONFERIR)', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['1427', '40', { B: 18, C: 101, Z: 53, D: 40 }],
  ]),
  item('juncao_simples_reducao_esgoto_serie_reforcada', 'Junção Simples Redução Esgoto Série Reforçada', 'juncao', 'Esgoto série reforçada', 33, { B1: 'bolsa 1', B2: 'bolsa 2', C: 'comprimento total', D1: 'diâmetro 1', D2: 'diâmetro 2', d: 'diâmetro externo da ponta', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2' }, [
    ['1433', '75x50', { B1: 39, B2: 44, C: 166, D1: 75.5, D2: 50.7, d: 75.5, Z1: 77.2, Z2: 82.4 }],
    ['1434', '100x50', { B1: 45, B2: 39, C: 177, D1: 101.6, D2: 75.5, d: 101.6, Z1: 92.5, Z2: 103.3 }],
    ['1435', '100x75', { B1: 45, B2: 44, C: 208, D1: 101.6, D2: 75.5, d: 101.6, Z1: 92.5, Z2: 114 }],
    ['1436', '150x100', { B1: 60, B2: 45, C: 271, D1: 150, D2: 101.6, d: 150, Z1: 152.2, Z2: 162.3 }],
  ]),
  item('luva_simples_esgoto_serie_reforcada_primario', 'Luva Simples Esgoto Série Reforçada Primário', 'luva', 'Esgoto série reforçada', 33, { B1: 'bolsa 1', B2: 'bolsa 2', D: 'diâmetro interno da bolsa (CONFERIR)', Z: 'distância do centro à entrada da bolsa (CONFERIR)' }, [
    ['1439', '50', { B1: 39, B2: 21.4, D: 50.7, Z: 2.1 }],
    ['1440', '75', { B1: 44.4, B2: 26, D: 75.5, Z: 2.6 }],
    ['1440', '100', { B1: 45, B2: 31.5, D: 101.6, Z: 3 }],
    ['1442', '150', { B1: 60, B2: 49.5, D: 150, Z: 5.5 }],
  ]),
  item('luva_simples_esgoto_serie_reforcada_secundario', 'Luva Simples Esgoto Série Reforçada Secundário', 'luva', 'Esgoto série reforçada', 33, { B: 'profundidade da bolsa', D: 'diâmetro interno da bolsa (CONFERIR)', Z: 'distância do centro à entrada da bolsa (CONFERIR)' }, [
    ['1438', '40', { B: 18, D: 40, Z: 3 }],
  ]),
  item('luva_de_correr_para_tubo_esgoto_serie_reforcada', 'Luva de Correr para Tubo Esgoto Série Reforçada', 'luva', 'Esgoto série reforçada', 34, { C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['1444', '40', { C: 660, D: 40.4 }],
    ['1445', '50', { C: 78, D: 51.3 }],
    ['1446', '75', { C: 90, D: 75.9 }],
    ['1447', '100', { C: 133, D: 102 }],
    ['1448', '150', { C: 140, D: 150.6 }],
  ]),
  item('reducao_excentrica_esgoto_serie_reforcada', 'Redução Excêntrica Esgoto Série Reforçada', 'reducao', 'Esgoto série reforçada', 34, { B: 'profundidade da bolsa', C1: 'comprimento 1', C2: 'comprimento 2', d: 'diâmetro externo da ponta', D: 'diâmetro interno da bolsa (CONFERIR)' }, [
    ['1450', '75x50', { B: 39.2, C1: 103.5, C2: 46.5, d: 75.5, D: 50.7 }],
    ['1453', '150x100', { B: 45, C1: 142, C2: 60, d: 150, D: 101.6 }],
    ['1451', '200x150', { B: 60, C1: 170, C2: 75, d: 200, D: 150 }],
    ['1452', '100x75', { B: 44, C1: 115, C2: 51.5, d: 101.6, D: 75.5 }],
  ]),
  item('te_esgoto_serie_reforcada_primario', 'Tê Esgoto Série Reforçada Primário', 'te', 'Esgoto série reforçada', 34, { B: 'profundidade da bolsa', C: 'comprimento total', D: 'diâmetro interno da bolsa (CONFERIR)', d: 'diâmetro externo da ponta', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2' }, [
    ['1457', '50', { B: 39, C: 140, D: 50.7, d: 50.7, Z1: 40, Z2: 27 }],
    ['1458', '75', { B: 44, C: 175, D: 75.5, d: 75.5, Z1: 44, Z2: 40 }],
    ['1459', '100', { B: 45, C: 212, D: 101.6, d: 101.6, Z1: 45, Z2: 55 }],
    ['1460', '150', { B: 60, C: 287, D: 150, d: 150, Z1: 62, Z2: 78 }],
  ]),
  item('te_esgoto_serie_reforcada_secundario', 'Tê Esgoto Série Reforçada Secundário', 'te', 'Esgoto série reforçada', 34, { B: 'profundidade da bolsa', C1: 'comprimento 1', C2: 'comprimento 2', D: 'diâmetro interno da bolsa (CONFERIR)', Z: 'distância do centro à entrada da bolsa (CONFERIR)' }, [
    ['1456', '40', { B: 18, C1: 79, C2: 39.5, D: 40, Z: 21.5 }],
  ]),
  item('te_de_reducao_esgoto_serie_reforcada', 'Tê de Redução Esgoto Série Reforçada', 'te', 'Esgoto série reforçada', 34, { B1: 'bolsa 1', B2: 'bolsa 2', C: 'comprimento total', D1: 'diâmetro 1', D2: 'diâmetro 2', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2', d: 'diâmetro externo da ponta' }, [
    ['1462', '75x50', { B1: 44, B2: 39, C: 150, D1: 75.5, D2: 50.7, Z1: 29.5, Z2: 68, d: 75.5 }],
    ['1463', '100x50', { B1: 45, B2: 39, C: 157, D1: 101.6, D2: 50.7, Z1: 30, Z2: 64, d: 101.6 }],
    ['1464', '150x75', { B1: 45, B2: 44, C: 186, D1: 101.6, D2: 75.5, Z1: 45, Z2: 67.5, d: 101.6 }],
    ['1465', '150x100', { B1: 60, B2: 45, C: 240, D1: 150, D2: 102, Z1: 56, Z2: 98.2, d: 150 }],
  ]),
  item('te_de_inspecao_esgoto_serie_reforcada', 'Tê de Inspeção Esgoto Série Reforçada', 'te', 'Esgoto série reforçada', 35, { B1: 'bolsa 1', C1: 'comprimento 1', C2: 'comprimento 2', D: 'diâmetro interno da bolsa (CONFERIR)', Z: 'distância do centro à entrada da bolsa (CONFERIR)', T: 'T', d: 'diâmetro externo da ponta' }, [
    ['1467', '75x75', { B1: 44, C1: 176, C2: 54.5, D: 75.5, Z: 43.2, T: 72.2, d: 75.5 }],
    ['1468', '100x75', { B1: 45, C1: 182, C2: 67, D: 101.6, Z: 43.2, T: 72.2, d: 101.6 }],
    ['1469', '150x100', { B1: 60, C1: 250, C2: 100, D: 150, Z: 68, T: 110.1, d: 150 }],
  ]),
  item('joelho_90_visita_esgoto_serie_reforcada', 'Joelho 90° Visita Esgoto Série Reforçada', 'joelho90', 'Esgoto série reforçada', 35, { B1: 'bolsa 1', B2: 'bolsa 2', C: 'comprimento total', d: 'diâmetro externo da ponta', D2: 'diâmetro 2', Z1: 'Z do ramal 1', Z2: 'Z do ramal 2' }, [
    ['1472', '100x75', { B1: 45, B2: 44, C: 202.6, d: 101.6, D2: 75.5, Z1: 57.5, Z2: 58 }],
  ]),
  ],
};
