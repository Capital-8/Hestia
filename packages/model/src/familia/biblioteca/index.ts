import type { Familia } from '../tipos.ts';
import { FAMILIA_ARMARIO } from '../exemplos.ts';
import { COZINHA } from './cozinha.ts';
import { DORMITORIO } from './dormitorio.ts';
import { GERAL } from './geral.ts';
import { SALA_AREAS } from './salaAreas.ts';
import { FAMILIA_GAVETA } from './gaveta.ts';
import { ALTO_PADRAO } from './altoPadrao.ts';
import { NOVAS } from './novas.ts';
import { DISCIPLINAS_EXEMPLO } from './disciplinasExemplo.ts';
import { TUBULACAO_ESGOTO } from './tuboEsgoto.ts';
import { TUBULACAO_AGUA_FRIA } from './tuboAguaFria.ts';
import { CAIXAS_HIDRO } from './caixasHidro.ts';
import { PERFIS_METALICOS } from './perfisMetalicos.ts';
import { ELETRICA } from './eletrica.ts';
import { FOSSAS_SEPTICAS } from './fossasSeptica.ts';
import { LUMINARIAS } from './luminarias.ts';
import { HVAC } from './hvac.ts';
import { KRONA_ESGOTO_FAMILIAS } from './kronaEsgoto.ts';
import { KRONA_SOLDAVEL_FAMILIAS } from './kronaSoldavel.ts';

/*
 * Biblioteca base de famílias AUTORAIS do Hestia (ADR 0049 §3.3: nenhum ativo de terceiros). Cada grupo vive em seu arquivo; este
 * registro só junta. Medidas em mm; as regras de montagem e as folgas são PROPOSTAS do Hestia, a validar com marceneiro ou fabricante.
 * Uma família pode aninhar `fam_gaveta` e `fam_armario_baixo` (o teste de biblioteca entrega a lista toda como `biblioteca`).
 */

export { FAMILIA_GAVETA };
export { NOVAS as FAMILIAS_NOVAS };
export { DISCIPLINAS_EXEMPLO };
/*
 * Tubulação de esgoto (ficha F1): exportada aqui, mas FORA de BIBLIOTECA_BASE de propósito. O teste de conectores da biblioteca
 * exige cada família da base na tabela de etiquetas com conectores laterais de móvel, e a de snapshot exige uma entrada nova
 * por família; a decisão de registrar fica com o orquestrador (ver relatório da ficha F1).
 */
export { TUBULACAO_ESGOTO };
/* Estrutura metálica (ficha F7): perfis, tubos, chapa de base e parafuso. Fora de BIBLIOTECA_BASE, pela mesma razão. */
export { PERFIS_METALICOS };
export const BIBLIOTECA_BASE: readonly Familia[] = [FAMILIA_ARMARIO, FAMILIA_GAVETA, ...COZINHA, ...DORMITORIO, ...SALA_AREAS, ...GERAL, ...ALTO_PADRAO, ...NOVAS, ...DISCIPLINAS_EXEMPLO];

/*
 * Biblioteca MEP (ficha F1b): famílias de instalações (hoje, a tubulação de esgoto e as conexões). Separada de BIBLIOTECA_BASE,
 * que é só de móveis: os testes de conectores e de snapshot da base não se aplicam a elas.
 */
/** Famílias MEP e estruturais (ADR 0061). UMA entrada por linha: acrescentar uma lista nova não conflita com as outras. */
export const BIBLIOTECA_MEP: readonly Familia[] = [
  ...TUBULACAO_ESGOTO,
  ...TUBULACAO_AGUA_FRIA,
  ...CAIXAS_HIDRO,
  ...PERFIS_METALICOS,
  ...ELETRICA,
  ...FOSSAS_SEPTICAS,
  ...LUMINARIAS,
  ...HVAC,
  ...KRONA_ESGOTO_FAMILIAS,
  ...KRONA_SOLDAVEL_FAMILIAS,
];

/** Ids que cada grupo TEM de conter (o teste confere). */
export const IDS_OBRIGATORIOS = {
  cozinha: ['fam_base_gavetas', 'fam_base_pia', 'fam_base_cooktop', 'fam_aereo', 'fam_aereo_basculante', 'fam_torre_forno', 'fam_paneleiro', 'fam_canto_l'],
  dormitorio: ['fam_guarda_roupa_modulo', 'fam_guarda_roupa_conjunto', 'fam_comoda', 'fam_criado_mudo', 'fam_cama_bau', 'fam_painel_tv'],
  salaAreas: ['fam_rack', 'fam_estante', 'fam_mesa_gaveteiro', 'fam_gabinete_banheiro', 'fam_armario_lavanderia', 'fam_escrivaninha'],
  geral: ['fam_modulo_branco', 'fam_bloco_livre', 'fam_mesa', 'fam_banco', 'fam_prateleira', 'fam_painel_ripado'],
  disciplinasExemplo: ['fam_vaso_sanitario', 'fam_lavatorio', 'fam_ralo', 'fam_tomada', 'fam_interruptor', 'fam_luminaria_teto', 'fam_quadro_distribuicao', 'fam_difusor_teto'],
} as const;

/** Família da biblioteca (base ou MEP) pelo id; `undefined` se não existe em nenhuma das duas. */
export function familiaDaBiblioteca(id: string): Familia | undefined {
  return BIBLIOTECA_BASE.find((f) => f.id === id) ?? BIBLIOTECA_MEP.find((f) => f.id === id);
}
