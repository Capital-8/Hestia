/**
 * Tabelas do adaptador da estrutura (docs/estrutura/PLANO.md, A.5; ficha R1a): nomes e colunas das seções 19 e 200 a 206 e códigos dos enums.
 * Espelha `crates/geom-wasm/schema/cena-v11.json` (versão 19, congelada pela K1); o teste `kernelEstr.test.ts` confere contra o esquema gerado.
 * Só dados: nenhuma geometria é calculada aqui (A.0 item 2).
 */
import type { BeamAlinhamento, BeamExtremidade, DisciplinaPilar, FootingForma, FootingModo, FormaDePerfil } from '@hestia/model';

/** `ID_AUSENTE` do esquema: "nenhum" onde o contrato permite (nível de topo, hospedeiro, perfil que não é personalizado). */
export const ID_AUSENTE_ESTR = 0xffffffff;
export const NIVEL_TODOS_ESTR = 4294967295;
/** `pescoco_forma` 255: a fundação não tem pescoço. */
export const SEM_PESCOCO = 255;

/** Códigos de erro do kernel que o adaptador trata (`CODIGOS` do esquema gerado). */
export const COD_ENTRADA = 3;
export const COD_NAO_IMPLEMENTADO = 4;

/** Seções enviadas, na ordem: níveis (cotas), tipos e perfis antes dos elementos que os referenciam. */
export const NOMES_SECOES_ESTR = ['niveis', 'perfis', 'tipos_pilar', 'tipos_viga', 'tipos_fundacao', 'pilares', 'vigas', 'fundacoes'] as const;
export type NomeSecaoEstr = (typeof NOMES_SECOES_ESTR)[number];
export type ColunasEstr = Record<string, number[]>;

export const COLUNAS_ESTR: Record<NomeSecaoEstr, readonly string[]> = {
  niveis: ['id_num', 'nivel_num', 'cota'],
  perfis: ['id_num', 'perfil_num', 'anel', 'indice', 'x', 'y'],
  tipos_pilar: ['id_num', 'disciplina', 'forma', 'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'perfil_num', 'material_num', 'espessura_camadas'],
  tipos_viga: ['id_num', 'forma', 'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'perfil_num', 'material_num'],
  tipos_fundacao: [
    'id_num',
    'modo',
    'forma',
    'base_forma',
    'base_p0',
    'base_p1',
    'base_p2',
    'base_p3',
    'base_p4',
    'base_p5',
    'base_perfil_num',
    'altura_base',
    'pescoco_forma',
    'pescoco_p0',
    'pescoco_p1',
    'pescoco_p2',
    'pescoco_p3',
    'pescoco_p4',
    'pescoco_p5',
    'pescoco_perfil_num',
    'altura_pescoco',
    'material_num',
  ],
  pilares: ['id_num', 'nivel_num', 'tipo_num', 'disciplina', 'px', 'py', 'rotacao', 'deslocamento_base', 'nivel_topo_num', 'deslocamento_topo', 'altura', 'hosp_num'],
  vigas: ['id_num', 'nivel_num', 'tipo_num', 'ax', 'ay', 'bx', 'by', 'deslocamento_z_a', 'deslocamento_z_b', 'alinhamento', 'rotacao', 'extremidade_a', 'extremidade_b'],
  fundacoes: ['id_num', 'nivel_num', 'tipo_num', 'px', 'py', 'rotacao', 'ax', 'ay', 'bx', 'by', 'hosp_num', 'deslocamento_topo'],
};

export const FORMA_PERFIL_CODIGO: Record<FormaDePerfil, number> = {
  retangular: 0,
  circular: 1,
  L: 2,
  T: 3,
  I: 4,
  U: 5,
  tuboRetangular: 6,
  tuboCircular: 7,
  personalizado: 8,
};
export const DISCIPLINA_CODIGO: Record<DisciplinaPilar, number> = { arquitetonico: 0, estrutural: 1 };
export const ALINHAMENTO_CODIGO: Record<BeamAlinhamento, number> = { topo: 0, centro: 1, base: 2 };
export const EXTREMIDADE_CODIGO: Record<BeamExtremidade, number> = { rigida: 0, articulada: 1 };
export const MODO_FUNDACAO_CODIGO: Record<FootingModo, number> = { isolada: 0, corrida: 1 };
export const FORMA_FUNDACAO_CODIGO: Record<FootingForma, number> = { sapata: 0, bloco: 1, estaca: 2 };

/** Categoria das saídas das consultas (`estr_malha` e as demais): 0 pilar, 1 viga, 2 fundação. */
export const CATEGORIA_ESTR = { pilar: 0, viga: 1, fundacao: 2 } as const;
export type CategoriaEstr = keyof typeof CATEGORIA_ESTR;
/** Parte do grupo da malha: 0 corpo, 1 base da fundação isolada, 2 pescoço, 3 camadas de acabamento do pilar arquitetônico. */
export const PARTE_ESTR = ['corpo', 'base', 'pescoco', 'camadas'] as const;
export type ParteEstr = (typeof PARTE_ESTR)[number];
