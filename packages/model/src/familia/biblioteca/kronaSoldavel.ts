import type { Familia } from '../tipos.ts';
import { AGUA_FRIA, montarKrona, type SpecKrona } from './kronaEsgotoApoio.ts';
import { cap, curvaBolsas, joelho, luva, luvaDeCorrer, luvaReducao, teBolsas, tubo } from './kronaReceitas.ts';

/*
 * Água fria soldável da Krona (PVC marrom) montada DIRETO do catálogo (ficha P4). A conexão traz o diâmetro externo A, então a
 * espessura da parede é (A − D) / 2 (CONFERIR). Bitola sem todas as cotas no catálogo fica de fora. Pendentes: curva de transposição,
 * buchas de redução, joelho de redução, união com rosca e adaptadores (as colunas de rosca não são numéricas).
 */

const C = AGUA_FRIA;
const CONNECTOR = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'CONNECTOR' } as const;
const BEND = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' } as const;
const JUNCTION = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'JUNCTION' } as const;
const A = 'Aext';

const SPECS: SpecKrona[] = [
  { id: 'fam_krona_soldavel_tubo', nome: 'Tubo de PVC soldável Krona (bolsa e ponta)', categoria: 'tubulacao', descricao: 'Tubo reto de PVC soldável para água fria, bolsa na ponta A e ponta lisa na B; comprimento L livre (3 m ou 6 m).', pedido: { itens: ['tubo_de_pvc_soldavel_6m'], mapa: { B: 'B', D: 'Db', d: 'De', e: 'e' }, serie: 'soldavel' }, receita: tubo(C), ifc: { classe: 'IFCPIPESEGMENT' } },
  { id: 'fam_krona_soldavel_joelho90', nome: 'Joelho 90° soldável Krona', categoria: 'conexao_tubo', descricao: 'Joelho de 90° soldável com bolsa nas duas pontas.', pedido: { itens: ['joelho_90_soldavel'], mapa: { A, B: 'B', Z: 'Z', D: 'Db' }, espessuraDoA: true, serie: 'soldavel' }, receita: joelho(90, C), ifc: BEND },
  { id: 'fam_krona_soldavel_joelho45', nome: 'Joelho 45° soldável Krona', categoria: 'conexao_tubo', descricao: 'Joelho de 45° soldável com bolsa nas duas pontas.', pedido: { itens: ['joelho_45_soldavel'], mapa: { A, B: 'B', Z: 'Z', D: 'Db' }, espessuraDoA: true, serie: 'soldavel' }, receita: joelho(45, C), ifc: BEND },
  { id: 'fam_krona_soldavel_curva90', nome: 'Curva 90° soldável Krona', categoria: 'conexao_tubo', descricao: 'Curva de 90° soldável (varredura, bolsa nas duas pontas).', pedido: { itens: ['curva_90_soldavel'], mapa: { A, B: 'B', Z: 'Z', D: 'Db' }, espessuraDoA: true, serie: 'soldavel' }, receita: curvaBolsas(90, C), ifc: BEND },
  { id: 'fam_krona_soldavel_curva45', nome: 'Curva 45° soldável Krona', categoria: 'conexao_tubo', descricao: 'Curva de 45° soldável (varredura, bolsa nas duas pontas).', pedido: { itens: ['curva_45_sodavel'], mapa: { A, B: 'B', Z: 'Z', D: 'Db' }, espessuraDoA: true, serie: 'soldavel' }, receita: curvaBolsas(45, C), ifc: BEND },
  { id: 'fam_krona_soldavel_luva', nome: 'Luva soldável Krona', categoria: 'conexao_tubo', descricao: 'Luva soldável com duas bolsas e batente central.', pedido: { itens: ['luva_soldavel'], mapa: { A, B: 'B', C: 'C', D: 'Db' }, copias: { B2: 'B' }, espessuraDoA: true, serie: 'soldavel' }, receita: luva(C), ifc: CONNECTOR },
  { id: 'fam_krona_soldavel_uniao', nome: 'União soldável Krona', categoria: 'conexao_tubo', descricao: 'União soldável modelada como luva com duas bolsas (sem a porca).', pedido: { itens: ['uniao_soldavel'], mapa: { A, B: 'B', C: 'C', D: 'Db' }, copias: { B2: 'B' }, espessuraDoA: true, serie: 'soldavel' }, receita: luva(C), ifc: CONNECTOR },
  { id: 'fam_krona_soldavel_luva_correr', nome: 'Luva de correr soldável Krona', categoria: 'conexao_tubo', descricao: 'Luva de correr soldável (manga lisa).', pedido: { itens: ['luva_de_correr_soldavel'], mapa: { A, C: 'C', D: 'Db' }, espessuraDoA: true, serie: 'soldavel' }, receita: luvaDeCorrer(C), ifc: CONNECTOR },
  { id: 'fam_krona_soldavel_luva_reducao', nome: 'Luva de redução soldável Krona', categoria: 'conexao_tubo', descricao: 'Luva de redução soldável: bolsa grande e bolsa pequena (bitola maior x menor).', pedido: { itens: ['luva_de_reducaosoldavel'], mapa: { A, B1: 'B', B2: 'B2', C: 'C', D1: 'Db', D2: 'Db2' }, espessuraDoA: true, serie: 'soldavel' }, receita: luvaReducao(C), ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'TRANSITION' } },
  { id: 'fam_krona_soldavel_te', nome: 'Tê soldável Krona', categoria: 'conexao_tubo', descricao: 'Tê soldável com bolsa nas três pontas.', pedido: { itens: ['te_soldavel'], mapa: { A, B: 'B', C1: 'C1', C2: 'C2', D: 'Db' }, espessuraDoA: true, serie: 'soldavel' }, receita: teBolsas(false, C), ifc: JUNCTION },
  { id: 'fam_krona_soldavel_te_reducao', nome: 'Tê de redução soldável Krona', categoria: 'conexao_tubo', descricao: 'Tê soldável com ramal de diâmetro menor (bitola maior x menor). No catálogo deste item C1 é o comprimento da corrida e C2 o do ramal (o inverso do tê comum).', pedido: { itens: ['te_de_reducao_soldavel'], mapa: { A, B1: 'B', B2: 'B2', C1: 'C2', C2: 'C1', D1: 'Db', D2: 'Db2' }, espessuraDoA: true, serie: 'soldavel' }, receita: teBolsas(true, C), ifc: JUNCTION },
  { id: 'fam_krona_soldavel_tampao', nome: 'Cap (tampão) soldável Krona', categoria: 'conexao_tubo', descricao: 'Tampão soldável com bolsa e fundo fechado.', pedido: { itens: ['cap_soldavel'], mapa: { A, B: 'B', C: 'C', D: 'Db' }, espessuraDoA: true, serie: 'soldavel' }, receita: cap(C), ifc: CONNECTOR },
];

/** Famílias de água fria soldável da Krona montadas do catálogo. */
export const KRONA_SOLDAVEL_FAMILIAS: Familia[] = SPECS.map(montarKrona);
