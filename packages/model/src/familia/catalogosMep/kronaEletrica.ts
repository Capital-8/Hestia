import { CATALOGO_MEP_FORMATO, CATALOGO_MEP_VERSAO, type CatalogoMep, type ItemCatalogo } from '../catalogoMep.ts';

/*
 * GERADO por docs/familias-parametricas/catalogos/ferramentas (extrair-krona-eletrica.py + gerar-ts.py) a partir do PDF indicado na fonte.
 * Transcrição AUTOMÁTICA do texto do PDF: todo item nasce CONFERIR. Compare com o documento antes de usar em projeto real.
 * As letras das colunas seguem o desenho do fabricante. Os rótulos das colunas foram AJUSTADOS À MÃO (o gerador usa o dicionário de
 * tubos de esgoto, que não vale para caixas de luz): cada letra é 'letra do desenho (CONFERIR)'. Ver README, seção da Krona elétrica.
 */

type Cols = Record<string, string>;
type Linha = readonly [string, string, Record<string, number>];

function item(id: string, nome: string, tipo: string, serie: string, pagina: number, colunas: Cols, linhas: Linha[]): ItemCatalogo {
  return { id, nome, tipo, serie, colunas, pagina, estado: 'CONFERIR', linhas: linhas.map(([codigo, bitola, valores]) => ({ codigo, bitola, valores })) };
}

export const KRONA_ELETRICA: CatalogoMep = {
  formato: CATALOGO_MEP_FORMATO,
  versao: CATALOGO_MEP_VERSAO,
  id: 'catalogo_krona_eletrica',
  nome: 'Catálogo Técnico Linha Elétrica',
  dominio: 'eletroduto',
  fonte: { fabricante: 'Krona', documento: 'Catálogo Técnico Linha Elétrica', edicao: '2026', url: 'https://www.krona.com.br/wp-content/uploads/2026/02/CATALOGO-TENICO-LINHA-ELETRICA-2026.pdf', sha256: '53e4a8f9909f1061511cbb9595717e732ad4712b27e216abb93e826675fd3a5e' },
  itens: [
  item('tubo_eletroduto_de_pvc_rigido_roscavel_3m', 'Tubo Eletroduto de PVC Rígido Roscável 3m', 'tubo', 'Eletroduto rígido roscável', 6, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)', d: 'letra do desenho (CONFERIR)' }, [
    ['1100', '1/2”', { B: 16.5, C: 3000, D: 21.1, d: 15.3 }],
    ['1101', '3/4”', { B: 17.5, C: 3000, D: 26.2, d: 20.2 }],
    ['1102', '1”', { B: 21, C: 3000, D: 33.2, d: 26.4 }],
    ['1103', '1.1/4”', { B: 23, C: 3000, D: 42.2, d: 34.8 }],
    ['1104', '1.1/2”', { B: 23, C: 3000, D: 47.8, d: 40 }],
    ['1105', '2”', { B: 27, C: 3000, D: 59.4, d: 51.4 }],
    ['1106', '3”', { B: 31, C: 3000, D: 88, d: 78 }],
    ['1107', '4”', { B: 33, C: 3000, D: 113.5, d: 101.1 }],
    ['1108', '2.1/2”', { B: 31, C: 3000, D: 75.1, d: 65.7 }],
  ]),
  item('tubo_eletroduto_de_pvc_rigido_soldavel_3m', 'Tubo Eletroduto de PVC Rígido Soldável 3m', 'tubo', 'Eletroduto rígido soldável', 6, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)', d: 'letra do desenho (CONFERIR)' }, [
    ['1200', '20', { B: 16.5, C: 3000, D: 20, d: 15.9 }],
    ['1201', '25', { B: 19, C: 3000, D: 25, d: 20.5 }],
    ['1202', '32', { B: 22.5, C: 3000, D: 32, d: 26.7 }],
  ]),
  item('curva_90_curta_para_eletroduto_roscavel', 'Curva 90 Curta para Eletroduto Roscável', 'curva90', 'Eletroduto rígido roscável', 7, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', d: 'letra do desenho (CONFERIR)', R: 'raio, leitura nossa (CONFERIR)' }, [
    ['1142', '1/2”', { B: 17, C: 49.9, d: 15.3, R: 44 }],
    ['1143', '3/4”', { B: 17, C: 62.9, d: 20.2, R: 56 }],
    ['1144', '1”', { B: 20, C: 80, d: 26.4, R: 70.5 }],
    ['1145', '1.1/4”', { B: 22, C: 91.3, d: 34, R: 80 }],
    ['1146', '1.1/2”', { B: 22, C: 111.9, d: 39, R: 100 }],
  ]),
  item('curva_90_longa_para_eletroduto_roscavel', 'Curva 90 Longa para Eletroduto Roscável', 'curva90', 'Eletroduto rígido roscável', 7, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', R: 'raio, leitura nossa (CONFERIR)' }, [
    ['1151', '1/2”', { B: 16, C: 73.4, R: 66 }],
    ['1152', '3/4”', { B: 17, C: 88.8, R: 80 }],
    ['1153', '1”', { B: 20, C: 99.5, R: 90 }],
    ['1154', '1.1/4”', { B: 22, C: 178, R: 100 }],
    ['1155', '1.1/2”', { B: 22, C: 178, R: 100 }],
    ['1156', '2”', { B: 27, C: 190, R: 85 }],
    ['1157', '2.1/2”', { B: 31, C: 220, R: 100 }],
    ['1158', '3”', { B: 31, C: 250, R: 105 }],
    ['1159', '4”', { B: 33, C: 295, R: 130 }],
  ]),
  item('curva_135_para_eletroduto_roscavel', 'Curva 135° para Eletroduto Roscável', 'outro', 'Eletroduto rígido roscável', 7, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', d: 'letra do desenho (CONFERIR)', R: 'raio, leitura nossa (CONFERIR)' }, [
    ['1160', '3/4”', { B: 14.5, C: 107, d: 21.3, R: 82 }],
    ['1161', '1”', { B: 17.5, C: 115, d: 26.5, R: 85 }],
  ]),
  item('curva_180_curta_para_eletroduto_roscavel', 'Curva 180° Curta para Eletroduto Roscável', 'outro', 'Eletroduto rígido roscável', 7, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', d: 'letra do desenho (CONFERIR)', R: 'raio, leitura nossa (CONFERIR)' }, [
    ['1162', '3/4”', { B: 14.5, C: 122, d: 21.3, R: 82 }],
    ['1163', '1”', { B: 17.5, C: 130.5, d: 26.5, R: 85 }],
  ]),
  item('curva_90_para_eletroduto_soldavel', 'Curva 90° para Eletroduto Soldável', 'curva90', 'Eletroduto rígido soldável', 8, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)', R: 'raio, leitura nossa (CONFERIR)' }, [
    ['1218', '20', { B: 16, C: 77.2, D: 20, R: 66 }],
    ['1219', '25', { B: 18.5, C: 79.2, D: 25, R: 80 }],
    ['1220', '32', { B: 22, C: 103.2, D: 32, R: 90 }],
  ]),
  item('luva_para_eletroduto_roscavel', 'Luva para Eletroduto Roscável', 'luva', 'Eletroduto rígido roscável', 8, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)' }, [
    ['1181', '1/2”', { B: 17, C: 37 }],
    ['1182', '3/4”', { B: 17, C: 37 }],
    ['1183', '1”', { B: 21.5, C: 46 }],
    ['1184', '1.1/4”', { B: 25, C: 53 }],
    ['1185', '1.1/2”', { B: 25, C: 53 }],
    ['1186', '2”', { B: 28.5, C: 60 }],
    ['1187', '3”', { B: 38.5, C: 85 }],
    ['1188', '4”', { B: 44.5, C: 95 }],
  ]),
  item('luva_para_eletroduto_soldavel', 'Luva para Eletroduto Soldável', 'luva', 'Eletroduto rígido soldável', 8, { A: 'letra do desenho (CONFERIR)', B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)' }, [
    ['1207', '20', { A: 25.8, B: 16, C: 35, D: 20 }],
    ['1208', '25', { A: 30.8, B: 19, C: 40, D: 25 }],
  ]),
  item('eletroduto_de_pvc_corrugado_flexivel_parede', 'Eletroduto de PVC Corrugado Flexível (Parede)', 'outro', 'Eletroduto corrugado', 8, { Cm: 'comprimento em metros (CONFERIR)', D: 'letra do desenho (CONFERIR)', d: 'letra do desenho (CONFERIR)' }, [
    ['1225', '20', { Cm: 10, D: 20, d: 15.8 }],
    ['1226', '20', { Cm: 25, D: 20, d: 15.8 }],
    ['1230', '20', { Cm: 50, D: 20, d: 15.8 }],
    ['1227', '25', { Cm: 10, D: 25, d: 19.4 }],
    ['1228', '25', { Cm: 25, D: 25, d: 19.4 }],
    ['1231', '25', { Cm: 50, D: 25, d: 19.4 }],
    ['1229', '32', { Cm: 10, D: 32, d: 25.6 }],
    ['1232', '32', { Cm: 25, D: 32, d: 25.6 }],
  ]),
  item('eletroduto_de_pvc_corrugado_reforcado_flexivel_laje', 'Eletroduto de PVC Corrugado Reforçado Flexível (Laje)', 'outro', 'Eletroduto corrugado reforçado', 9, { Ccm: 'comprimento em centímetros (CONFERIR)', D: 'letra do desenho (CONFERIR)', d: 'letra do desenho (CONFERIR)' }, [
    ['1235', '20', { Ccm: 24.1, D: 20.2, d: 15.4 }],
    ['1236', '25', { Ccm: 29.5, D: 25.2, d: 18.8 }],
    ['1237', '32', { Ccm: 37.3, D: 32.1, d: 24.9 }],
  ]),
  item('eletroduto_de_pvc_corrugado_reforcado_flexivel_vdi', 'Eletroduto de PVC Corrugado Reforçado Flexível (VDI)', 'outro', 'Eletroduto corrugado reforçado', 9, { Ccm: 'comprimento em centímetros (CONFERIR)', D: 'letra do desenho (CONFERIR)', d: 'letra do desenho (CONFERIR)' }, [
    ['1233', '25', { Ccm: 50, D: 25.2, d: 18.8 }],
    ['1234', '32', { Ccm: 25, D: 32.1, d: 24.9 }],
  ]),
  item('luva_de_pressao_para_eletroduto_corrugado_reforcado_flexivel', 'Luva de Pressão para Eletroduto Corrugado Reforçado Flexível', 'luva', 'Eletroduto corrugado reforçado', 9, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)' }, [
    ['1250', '20', { B: 17.7, C: 37, D: 20.3 }],
    ['1251', '25', { B: 19.5, C: 41, D: 25.3 }],
    ['1252', '32', { B: 20, C: 42, D: 32.3 }],
  ]),
  item('luva_de_pressao_para_eletroduto_corrugado_flexivel', 'Luva de Pressão para Eletroduto Corrugado Flexível', 'luva', 'Eletroduto corrugado', 9, { B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)' }, [
    ['1245', '20', { B: 17.7, C: 37, D: 20.3 }],
    ['1246', '25', { B: 19.5, C: 41, D: 25.3 }],
    ['1247', '32', { B: 20, C: 42, D: 32.3 }],
  ]),
  item('prolongador_para_caixa_de_luz_octogonal', 'Prolongador para Caixa de Luz Octogonal', 'caixa', 'Caixas de luz', 9, { A: 'letra do desenho (CONFERIR)', B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)' }, [
    ['1260', '4x4', { A: 104.6, B: 90.7, C: 56.5 }],
  ]),
  item('prolongador_reforcado_para_caixa_de_luz_para_laje', 'Prolongador Reforçado para Caixa de Luz para Laje', 'caixa', 'Caixas de luz', 10, { A: 'letra do desenho (CONFERIR)', B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)' }, [
    ['1261', '4x4', { A: 104.6, B: 90.7, C: 56.5 }],
  ]),
  item('caixa_de_luz_octogonal_com_fundo_movel_para_eletroduto_corrugado_flexivel', 'Caixa de Luz Octogonal com Fundo Móvel para Eletroduto Corrugado Flexível', 'caixa', 'Caixas de luz', 10, { A: 'letra do desenho (CONFERIR)', B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)', E: 'letra do desenho (CONFERIR)' }, [
    ['1255', '4x4', { A: 104.6, B: 91.4, C: 51, D: 110, E: 85 }],
  ]),
  item('caixa_de_luz_octogonal_com_fundo_movel_para_eletroduto_corrugado_reforcado', 'Caixa de Luz Octogonal com Fundo Móvel para Eletroduto Corrugado Reforçado', 'caixa', 'Caixas de luz', 10, { A: 'letra do desenho (CONFERIR)', B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)', E: 'letra do desenho (CONFERIR)' }, [
    ['1254', '4x4', { A: 104.6, B: 91.4, C: 51, D: 110, E: 85 }],
  ]),
  item('caixa_de_luz_empilhavel_para_eletroduto_corrugado_flexivel', 'Caixa de Luz Empilhável para Eletroduto Corrugado Flexível', 'caixa', 'Caixas de luz', 10, { A: 'letra do desenho (CONFERIR)', B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)', E: 'letra do desenho (CONFERIR)' }, [
    ['1265', '4x2', { A: 65, B: 116, C: 46.8, D: 107, E: 83.5 }],
  ]),
  item('caixa_de_luz_para_eletroduto_corrugado_flexivel', 'Caixa de Luz para Eletroduto Corrugado Flexível', 'caixa', 'Caixas de luz', 10, { A: 'letra do desenho (CONFERIR)', B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)', E: 'letra do desenho (CONFERIR)' }, [
    ['2369', '4x4', { A: 104.6, B: 91.4, C: 51, D: 110, E: 85 }],
  ]),
  item('caixa_de_luz_para_eletroduto_corrugado_flexivel_2', 'Caixa de Luz para Eletroduto Corrugado Flexível', 'caixa', 'Caixas de luz', 11, { A: 'letra do desenho (CONFERIR)', B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', C_2: 'letra do desenho (CONFERIR)', E: 'letra do desenho (CONFERIR)' }, [
    ['1266', '4x4', { A: 111, B: 111, C: 47, C_2: 83.5, E: 45 }],
  ]),
  item('caixa_de_luz_para_laje', 'Caixa de Luz para Laje', 'caixa', 'Caixas de luz', 11, { A: 'letra do desenho (CONFERIR)', B: 'letra do desenho (CONFERIR)', C: 'letra do desenho (CONFERIR)', D: 'letra do desenho (CONFERIR)' }, [
    ['1256', '250', { A: 57, B: 112, C: 284, D: 250 }],
    ['1257', '300', { A: 57, B: 112, C: 334, D: 300 }],
  ]),
  ],
};
