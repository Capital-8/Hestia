import type { Familia } from '../tipos.ts';
import { montarKrona, type SpecKrona } from './kronaEsgotoApoio.ts';
import { bucha, cap, curva, joelho, luva, luvaDeCorrer, reducaoExcentrica, te, tubo } from './kronaReceitas.ts';

/*
 * Esgoto da Krona montado DIRETO do catálogo (ficha P4): série normal (DN 40 a 250 onde o catálogo traz as cotas) e série reforçada.
 * Cada família lê suas cotas por `busca(chave, ...)`; bitola que não tem todas as cotas no catálogo FICA DE FORA (nada é inventado).
 * Pendentes (catálogo transcrito, geometria não): junção dupla e invertida, joelho com visita, tê de inspeção, curva de pé de coluna,
 * válvula de retenção, terminal, luva com fixador, anéis, sifão e caixas sifonadas, e o tubo reforçado (bitola repetida no PDF).
 */

const BEND = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' } as const;
const JUNCTION = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'JUNCTION' } as const;
const CONNECTOR = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'CONNECTOR' } as const;
const TRANSITION = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'TRANSITION' } as const;
const N = 'normal';
const R = 'reforcada';

const SIMPLES = { B: 'B', Z: 'Z', D: 'Db' };
const TE = { B: 'B', C: 'C', Z1: 'Z', Z2: 'Z2', D: 'Db', d: 'De' };
const TE_RED = { B1: 'B', C: 'C', Z1: 'Z', Z2: 'Z2', D1: 'Db', d: 'De', B2: 'B2', D2: 'Db2' };
const TE_RED_R = { B1: 'B', B2: 'B2', C: 'C', Z1: 'Z', Z2: 'Z2', D1: 'Db', D2: 'Db2', d: 'De' };

const SPECS: SpecKrona[] = [
  { id: 'fam_krona_esgoto_tubo', nome: 'Tubo de esgoto PVC Krona (bolsa e ponta)', categoria: 'tubulacao', descricao: 'Tubo reto de PVC de esgoto, bolsa na ponta A e ponta lisa na B; comprimento L livre (comercial 3 m ou 6 m).', pedido: { itens: ['tubo_de_pvc_esgoto_primario_6m', 'tubos_de_pvc_esgoto_secundario_6m', 'tubos_de_pvc_esgoto_secundario_6m_3'], mapa: { B: 'B', D: 'Db', d: 'De' }, serie: N }, receita: tubo(), ifc: { classe: 'IFCPIPESEGMENT' } },
  { id: 'fam_krona_esgoto_joelho90', nome: 'Joelho 90° de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Joelho de 90° com bolsa nas duas pontas: braço vertical (−Z) e horizontal (+X).', pedido: { itens: ['joelho_90_esgoto_primario', 'joelho_90_esgoto_secundario'], mapa: SIMPLES, serie: N }, receita: joelho(90), ifc: BEND },
  { id: 'fam_krona_esgoto_joelho45', nome: 'Joelho 45° de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Joelho de 45° com bolsa nas duas pontas: braço A (−Z) e braço B desviado 45°.', pedido: { itens: ['joelho_45_esgoto_primario', 'joelho_45_esgoto_secundario'], mapa: SIMPLES, serie: N }, receita: joelho(45), ifc: BEND },
  { id: 'fam_krona_esgoto_curva90_curta', nome: 'Curva 90° curta de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Curva de 90° curta: ponta lisa em baixo e bolsa para +X, varredura com arco de tangente Z.', pedido: { itens: ['curva_90_curta_esgoto_secundario_2'], mapa: { B: 'B', Z: 'Z', C: 'C', D: 'Db', d: 'De' }, serie: N }, receita: curva(90), ifc: BEND },
  { id: 'fam_krona_esgoto_curva90_longa', nome: 'Curva 90° longa de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Curva de 90° longa: ponta lisa em baixo e bolsa para +X, varredura com arco de tangente Z.', pedido: { itens: ['curva_90_longa_esgoto_primario'], mapa: { B: 'B', Z: 'Z', C: 'C', D: 'Db', d: 'De' }, serie: N }, receita: curva(90), ifc: BEND },
  { id: 'fam_krona_esgoto_curva45_curta', nome: 'Curva 45° curta de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Curva de 45° curta (DN 100): ponta lisa em baixo e bolsa desviada 45°.', pedido: { itens: ['curva_45_curta_esgoto_primario'], mapa: { B: 'B', Z: 'Z', C: 'C', D: 'Db', d: 'De' }, serie: N }, receita: curva(45), ifc: BEND },
  { id: 'fam_krona_esgoto_curva45_longa', nome: 'Curva 45° longa de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Curva de 45° longa: ponta lisa em baixo e bolsa desviada 45°.', pedido: { itens: ['curva_45_longa_esgoto_primario'], mapa: { B: 'B', Z: 'Z', C: 'C', D: 'Db', d: 'De' }, serie: N }, receita: curva(45), ifc: BEND },
  { id: 'fam_krona_esgoto_luva', nome: 'Luva de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Luva com duas bolsas (B e B2) separadas por um batente central.', pedido: { itens: ['luva_esgoto_primaria', 'luva_esgoto_secundario'], mapa: { B1: 'B', B2: 'B2', C: 'C', D: 'Db' }, padroes: { B2: 'B1' }, serie: N }, receita: luva(), ifc: CONNECTOR },
  { id: 'fam_krona_esgoto_luva_correr', nome: 'Luva de correr de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Luva de correr (manga lisa) com comprimento C e furo D.', pedido: { itens: ['luva_de_esgoto'], mapa: { C: 'C', D: 'Db' }, serie: N }, receita: luvaDeCorrer(), ifc: CONNECTOR },
  { id: 'fam_krona_esgoto_te', nome: 'Tê de esgoto Krona (90°)', categoria: 'conexao_tubo', descricao: 'Tê de 90°: corrida ao longo de Z (bolsa em cima, ponta lisa embaixo) e ramal com bolsa para +X.', pedido: { itens: ['te_esgoto_primario'], mapa: TE, serie: N }, receita: te(90, false), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_te_reducao', nome: 'Tê de redução de esgoto Krona (90°)', categoria: 'conexao_tubo', descricao: 'Tê de 90° com ramal de diâmetro menor (bitola maior x menor).', pedido: { itens: ['te_de_reducao_esgoto'], mapa: TE_RED, serie: N }, receita: te(90, true), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_juncao45', nome: 'Junção 45° simples de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Junção simples a 45°: corrida ao longo de Z e ramal com bolsa a 45°.', pedido: { itens: ['juncao_45_esgoto_simples_primario'], mapa: { B: 'B', C: 'C', Z: 'Z', D: 'Db', d: 'De' }, copias: { Z2: 'Z' }, serie: N }, receita: te(45, false), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_juncao45_reducao', nome: 'Junção de redução 45° de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Junção a 45° com ramal de diâmetro menor (bitola maior x menor).', pedido: { itens: ['juncao_de_reducao_45_esgoto_primario'], mapa: TE_RED, serie: N }, receita: te(45, true), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_reducao_excentrica', nome: 'Redução excêntrica de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Redução excêntrica: ponta lisa grande embaixo e bolsa pequena em cima, eixos deslocados.', pedido: { itens: ['reducao_excentrica_esgoto'], mapa: { B: 'B', C1: 'C', C2: 'C2', D: 'Db', d: 'De' }, excluir: ['0657'], serie: N }, receita: reducaoExcentrica(), ifc: TRANSITION },
  { id: 'fam_krona_esgoto_bucha', nome: 'Bucha de redução longa de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Bucha de redução longa 50 x 40: bolsa pequena em cima e ponta grande embaixo.', pedido: { itens: ['bucha_de_reducao_longa_esgoto'], mapa: { B: 'B', Z: 'Z', D: 'Db', d: 'De' }, serie: N }, receita: bucha(), ifc: TRANSITION },
  { id: 'fam_krona_esgoto_tampao', nome: 'Cap (tampão) de esgoto Krona', categoria: 'conexao_tubo', descricao: 'Tampão com bolsa e fundo fechado.', pedido: { itens: ['cap_esgoto_primario', 'cap_esgoto_secundario'], mapa: { B: 'B', C: 'C', D: 'Db' }, serie: N }, receita: cap(), ifc: CONNECTOR },
  // Série reforçada (bege): só o que o catálogo traz completo.
  { id: 'fam_krona_esgoto_reforcado_joelho90', nome: 'Joelho 90° de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: 'Joelho de 90° da série reforçada.', pedido: { itens: ['joelho_90_esgoto_serie_reforcada_primario', 'joelho_90_esgoto_serie_reforcada_secundario'], mapa: SIMPLES, serie: R }, receita: joelho(90), ifc: BEND },
  { id: 'fam_krona_esgoto_reforcado_joelho45', nome: 'Joelho 45° de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: 'Joelho de 45° da série reforçada.', pedido: { itens: ['joelho_45_esgoto_serie_reforcada_primario'], mapa: SIMPLES, serie: R }, receita: joelho(45), ifc: BEND },
  { id: 'fam_krona_esgoto_reforcado_curva90', nome: 'Curva 90° de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: 'Curva de 90° da série reforçada.', pedido: { itens: ['curva_90_esgoto_serie_reforcada'], mapa: { B: 'B', Z: 'Z', C: 'C', D: 'Db', d: 'De' }, serie: R }, receita: curva(90), ifc: BEND },
  { id: 'fam_krona_esgoto_reforcado_tampao', nome: 'Cap (tampão) de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: 'Tampão da série reforçada.', pedido: { itens: ['cap_esgoto_serie_reforcada'], mapa: { B: 'B', C: 'C', D: 'Db' }, serie: R }, receita: cap(), ifc: CONNECTOR },
  { id: 'fam_krona_esgoto_reforcado_te', nome: 'Tê de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: 'Tê de 90° da série reforçada.', pedido: { itens: ['te_esgoto_serie_reforcada_primario'], mapa: TE, serie: R }, receita: te(90, false), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_reforcado_te_reducao', nome: 'Tê de redução de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: 'Tê de 90° com ramal menor, série reforçada.', pedido: { itens: ['te_de_reducao_esgoto_serie_reforcada'], mapa: TE_RED_R, serie: R }, receita: te(90, true), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_reforcado_juncao45', nome: 'Junção simples 45° de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: 'Junção simples a 45°, série reforçada.', pedido: { itens: ['juncao_simples_esgoto_serie_reforcada_primario'], mapa: { B: 'B', C: 'C', Z: 'Z', d: 'De', D: 'Db' }, copias: { Z2: 'Z' }, serie: R }, receita: te(45, false), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_reforcado_juncao45_reducao', nome: 'Junção simples de redução 45° de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: 'Junção a 45° com ramal menor, série reforçada.', pedido: { itens: ['juncao_simples_reducao_esgoto_serie_reforcada'], mapa: TE_RED_R, serie: R }, receita: te(45, true), ifc: JUNCTION },
  { id: 'fam_krona_esgoto_reforcado_reducao_excentrica', nome: 'Redução excêntrica de esgoto Krona (série reforçada)', categoria: 'conexao_tubo', descricao: 'Redução excêntrica da série reforçada.', pedido: { itens: ['reducao_excentrica_esgoto_serie_reforcada'], mapa: { B: 'B', C1: 'C', C2: 'C2', d: 'De', D: 'Db' }, serie: R }, receita: reducaoExcentrica(), ifc: TRANSITION },
];

/** Famílias de esgoto da Krona montadas do catálogo (série normal e reforçada). */
export const KRONA_ESGOTO_FAMILIAS: Familia[] = SPECS.map(montarKrona);

const porId = (id: string): Familia => {
  const f = KRONA_ESGOTO_FAMILIAS.find((x) => x.id === id);
  if (!f) throw new Error(`família ausente: ${id}`);
  return f;
};
export const FAMILIA_KRONA_TUBO = porId('fam_krona_esgoto_tubo');
export const FAMILIA_KRONA_JOELHO90 = porId('fam_krona_esgoto_joelho90');
export const FAMILIA_KRONA_JOELHO45 = porId('fam_krona_esgoto_joelho45');
export const FAMILIA_KRONA_LUVA = porId('fam_krona_esgoto_luva');
export const FAMILIA_KRONA_TE = porId('fam_krona_esgoto_te');
export const FAMILIA_KRONA_CAP = porId('fam_krona_esgoto_tampao');
