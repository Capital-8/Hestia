import type { Material } from '../types.ts';

/*
 * Materiais de instalações e estrutura (fase 2, fichas K1 e K2). Até aqui todo CORPO saía com o material fixo do móvel (carvalho). O
 * material do corpo agora é resolvido como o da peça: id de material do projeto, id deste catálogo (`comp_*`), ou um apelido de
 * família (`mat_*`, mapa abaixo). Sem material, ou material desconhecido, o corpo sai em cinza neutro (nunca madeira). Cores e
 * brilho são APARÊNCIA de projeto, não dado de fabricante.
 */

export interface MaterialInstalacao {
  id: string;
  nome: string;
  grupo: 'plastico' | 'metal' | 'mineral' | 'neutro';
  cor: string;
  gloss: number;
  opacity: number;
  /** Hachura de corte (padrão de desenho da seção). */
  hachura: 'solid' | 'diagonal' | 'cross';
}

export const MATERIAL_NEUTRO = 'comp_cinza_neutro';

export const MATERIAIS_INSTALACOES: readonly MaterialInstalacao[] = [
  { id: 'comp_pvc_branco', nome: 'PVC branco (esgoto)', grupo: 'plastico', cor: '#f1f1ec', gloss: 0.42, opacity: 1, hachura: 'solid' },
  { id: 'comp_pvc_bege', nome: 'PVC bege (esgoto reforçado)', grupo: 'plastico', cor: '#d9cdb1', gloss: 0.4, opacity: 1, hachura: 'solid' },
  { id: 'comp_pvc_marrom', nome: 'PVC marrom (água fria soldável)', grupo: 'plastico', cor: '#a8592e', gloss: 0.4, opacity: 1, hachura: 'solid' },
  { id: 'comp_pvc_azul', nome: 'PVC azul (água fria)', grupo: 'plastico', cor: '#2f6db0', gloss: 0.4, opacity: 1, hachura: 'solid' },
  { id: 'comp_pvc_cinza', nome: 'PVC cinza (eletroduto, ventilação)', grupo: 'plastico', cor: '#8d9399', gloss: 0.35, opacity: 1, hachura: 'solid' },
  { id: 'comp_aco_galv', nome: 'Aço galvanizado', grupo: 'metal', cor: '#aeb5bc', gloss: 0.7, opacity: 1, hachura: 'diagonal' },
  { id: 'comp_aco', nome: 'Aço', grupo: 'metal', cor: '#8a9098', gloss: 0.65, opacity: 1, hachura: 'diagonal' },
  { id: 'comp_concreto', nome: 'Concreto', grupo: 'mineral', cor: '#a8a59e', gloss: 0.12, opacity: 1, hachura: 'cross' },
  // Apelidos `mat_*` de luminárias, quadros e caixas que apontavam para ids inexistentes (saíam cinza neutro): aluminio, vidro, cobre, cerâmica.
  { id: 'comp_aluminio', nome: 'Alumínio', grupo: 'metal', cor: '#c9ced4', gloss: 0.75, opacity: 1, hachura: 'diagonal' },
  { id: 'comp_vidro_incolor', nome: 'Vidro incolor (difusor)', grupo: 'mineral', cor: '#c4e4ea', gloss: 0.8, opacity: 1, hachura: 'solid' },
  { id: 'comp_cobre', nome: 'Cobre', grupo: 'metal', cor: '#b87333', gloss: 0.7, opacity: 1, hachura: 'diagonal' },
  { id: 'comp_branco', nome: 'Branco (cerâmica)', grupo: 'mineral', cor: '#f4f4f1', gloss: 0.5, opacity: 1, hachura: 'solid' },
  { id: MATERIAL_NEUTRO, nome: 'Neutro (sem material)', grupo: 'neutro', cor: '#a9adb2', gloss: 0.3, opacity: 1, hachura: 'solid' },
];

const POR_ID: Readonly<Record<string, MaterialInstalacao>> = Object.fromEntries(MATERIAIS_INSTALACOES.map((m) => [m.id, m]));

/** Apelidos de material usados nas famílias (`corpo.material`) → id visual. `mat_pvc` antigo vira PVC branco. */
export const APELIDOS_MATERIAL_CORPO: Readonly<Record<string, string>> = {
  mat_pvc: 'comp_pvc_branco',
  mat_pvc_branco: 'comp_pvc_branco',
  mat_pvc_bege: 'comp_pvc_bege',
  mat_pvc_marrom: 'comp_pvc_marrom',
  mat_pvc_azul: 'comp_pvc_azul',
  mat_pvc_cinza: 'comp_pvc_cinza',
  mat_aco_galvanizado: 'comp_aco_galv',
  mat_aco: 'comp_aco',
  mat_metal: 'comp_aco',
  mat_aluminio: 'comp_aluminio',
  mat_cobre: 'comp_cobre',
  mat_concreto: 'comp_concreto',
  mat_vidro: 'comp_vidro_incolor',
  mat_ceramica: 'comp_branco',
};

/** Opções do seletor de material do corpo no editor: apelido de família, nome e cor (para a amostra). */
export const OPCOES_MATERIAL_CORPO: ReadonlyArray<{ apelido: string; nome: string }> = [
  { apelido: 'mat_pvc_branco', nome: 'PVC branco' },
  { apelido: 'mat_pvc_bege', nome: 'PVC bege' },
  { apelido: 'mat_pvc_marrom', nome: 'PVC marrom' },
  { apelido: 'mat_pvc_azul', nome: 'PVC azul' },
  { apelido: 'mat_pvc_cinza', nome: 'PVC cinza' },
  { apelido: 'mat_cobre', nome: 'Cobre' },
  { apelido: 'mat_aco_galvanizado', nome: 'Aço galvanizado' },
  { apelido: 'mat_aco', nome: 'Aço' },
  { apelido: 'mat_aluminio', nome: 'Alumínio' },
  { apelido: 'mat_concreto', nome: 'Concreto' },
  { apelido: 'mat_vidro', nome: 'Vidro' },
];

export function materialDaInstalacao(m: MaterialInstalacao): Material {
  return { id: m.id, name: m.nome, color: m.cor, hatch: m.hachura, gloss: m.gloss, opacity: m.opacity, cost: 0, unit: 'm2' };
}

/**
 * Id do material visual de um corpo. `materiaisDoProjeto`: materiais do projeto (um id dele vale como está). Ordem: id do projeto;
 * id `comp_*` conhecido (instalações ou os de `conhecidos`, ex.: acabamentos de móveis); apelido `mat_*`; senão cinza neutro.
 */
export function resolverMaterialVisualCorpo(material: string | null | undefined, materiaisDoProjeto: Readonly<Record<string, unknown>> = {}, conhecidos: (id: string) => boolean = () => false): string {
  if (material === null || material === undefined || material.trim() === '') return MATERIAL_NEUTRO;
  if (materiaisDoProjeto[material] !== undefined) return material;
  if (POR_ID[material] !== undefined || conhecidos(material)) return material;
  const apelido = APELIDOS_MATERIAL_CORPO[material];
  return apelido !== undefined ? apelido : MATERIAL_NEUTRO;
}

/** Cor "#rrggbb" de um id de instalações (para o editor), ou `undefined`. */
export function corDoMaterialInstalacao(id: string): string | undefined {
  return POR_ID[id]?.cor;
}
