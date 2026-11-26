import type { Familia } from '../tipos.ts';
import { montarKrona, type SpecKrona } from './kronaEsgotoApoio.ts';
import { curvaPeColuna, joelhoVisita, juncaoDupla, teInspecao } from './kronaReceitasEspeciais.ts';

/*
 * Peças especiais da Krona esgoto montadas do catálogo (ficha D3b): tê de inspeção, junção 45° dupla, joelho 90° com visita e curva
 * pé de coluna, nas séries normal e reforçada. O significado de C1/C2/T, Z1/Z2 e A1/A2 NÃO foi confirmado pelo fabricante: leitura
 * mais simples consistente com a tabela, CONFERIR (ver kronaReceitasEspeciais.ts e o README dos catálogos). Ficam de fora: anéis,
 * junção invertida, válvula de retenção e terminal de ventilação.
 */

const JUNCTION = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'JUNCTION' } as const;
const BEND = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' } as const;
const CONFERIR = ' Leitura das letras sem confirmação do fabricante (CONFERIR).';

const SPECS: SpecKrona[] = [
  { id: 'fam_krona_esgoto_te_inspecao', nome: 'Tê de inspeção de esgoto Krona', categoria: 'conexao_tubo', descricao: `Tê de inspeção: corrida com bolsa em cima e ponta embaixo e ramal de inspeção terminado em tampa (sem bolsa de ramal).${CONFERIR}`, pedido: { itens: ['te_de_inspecao_esgoto'], mapa: { B: 'B', C1: 'C', Z: 'Z', C2: 'C2', D: 'Db', d: 'De', T: 'T' }, serie: 'normal' }, receita: teInspecao(), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_reforcado_te_inspecao', nome: 'Tê de inspeção de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: `Tê de inspeção da série reforçada, ramal terminado em tampa.${CONFERIR}`, pedido: { itens: ['te_de_inspecao_esgoto_serie_reforcada'], mapa: { B1: 'B', C1: 'C', Z: 'Z', C2: 'C2', D: 'Db', d: 'De', T: 'T' }, serie: 'reforcada' }, receita: teInspecao(), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_juncao45_dupla', nome: 'Junção 45° dupla de esgoto Krona', categoria: 'conexao_tubo', descricao: `Junção dupla: corrida e dois ramais a 45° com bolsa, saindo do mesmo cruzamento (um para cada lado).${CONFERIR}`, pedido: { itens: ['juncao_45_esgoto_dupla_primario'], mapa: { B: 'B', C: 'C', Z: 'Z', D: 'Db', d: 'De' }, serie: 'normal' }, receita: juncaoDupla(), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_reforcado_juncao45_dupla', nome: 'Junção dupla de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: `Junção dupla da série reforçada.${CONFERIR}`, pedido: { itens: ['juncao_dupla_esgoto_serie_reforcada'], mapa: { B: 'B', C: 'C', Z: 'Z', D: 'Db', d: 'De' }, serie: 'reforcada' }, receita: juncaoDupla(), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_joelho90_visita', nome: 'Joelho 90° com visita de esgoto Krona', categoria: 'conexao_tubo', descricao: `Joelho 90° com visita: perna vertical com bolsa embaixo e visita fechada por tampa em cima, perna horizontal com bolsa.${CONFERIR}`, pedido: { itens: ['joelho_90_esgoto_com_visita'], mapa: { B1: 'B1', Z: 'Z', D1: 'Db', B2: 'B2', Z2: 'Z2', C: 'C', D2: 'Db2' }, serie: 'normal' }, receita: joelhoVisita(), ifc: BEND },
  { id: 'fam_krona_esgoto_reforcado_joelho90_visita', nome: 'Joelho 90° com visita de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: `Joelho 90° com visita da série reforçada (Ø da bolsa vertical = d do catálogo).${CONFERIR}`, pedido: { itens: ['joelho_90_visita_esgoto_serie_reforcada'], mapa: { B1: 'B1', Z1: 'Z', d: 'Db', B2: 'B2', Z2: 'Z2', C: 'C', D2: 'Db2' }, serie: 'reforcada' }, receita: joelhoVisita(), ifc: BEND },
  { id: 'fam_krona_esgoto_reforcado_curva90_pe_coluna', nome: 'Curva 90° pé de coluna de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: `Curva 90° curta de pé de coluna, pernas A1 e A2 diferentes, bolsa nas duas pontas.${CONFERIR}`, pedido: { itens: ['curva_90_curta_pe_coluna_esgoto_serie_reforcada'], mapa: { A1: 'A1', A2: 'A2', B1: 'B1', B2: 'B2', D1: 'Db' }, serie: 'reforcada' }, receita: curvaPeColuna(), ifc: BEND },
];

/** Famílias especiais de esgoto da Krona (ficha D3b). */
export const KRONA_ESGOTO_ESPECIAIS: Familia[] = SPECS.map(montarKrona);
