import type { Component, Material } from '../types.ts';
import type { PapelPeca } from './tipos.ts';

/** Catálogo padrão de acabamentos de marcenaria, pedras, vidros e metais para móveis no 3D. */
export type IdAcabamentoMovel =
  | 'comp_freijo'
  | 'comp_carvalho'
  | 'comp_nogueira'
  | 'comp_branco'
  | 'comp_offwhite'
  | 'comp_grafite'
  | 'comp_sage'
  | 'comp_calacatta'
  | 'comp_preto_sg'
  | 'comp_vidro_fume'
  | 'comp_vidro_incolor'
  | 'comp_vidro_bronze'
  | 'comp_vidro_verde'
  | 'comp_marmore_escuro'
  | 'comp_madeira_clara'
  | 'comp_aluminio'
  | 'comp_cobre';

export interface AcabamentoMovel {
  id: IdAcabamentoMovel;
  nome: string;
  grupo: 'madeira' | 'laca' | 'pedra' | 'vidro' | 'metal';
  cor: string;
  gloss: number;
  opacity: number;
}

export const ACABAMENTOS_MOVEIS: readonly AcabamentoMovel[] = [
  { id: 'comp_carvalho', nome: 'MDF Carvalho Natural', grupo: 'madeira', cor: '#c9a176', gloss: 0.25, opacity: 1 },
  { id: 'comp_freijo', nome: 'MDF Louro Freijó', grupo: 'madeira', cor: '#9e6b43', gloss: 0.28, opacity: 1 },
  { id: 'comp_nogueira', nome: 'MDF Nogueira Escura', grupo: 'madeira', cor: '#5c3c28', gloss: 0.28, opacity: 1 },
  { id: 'comp_branco', nome: 'Laca Branca Acetinada', grupo: 'laca', cor: '#f4f4f1', gloss: 0.42, opacity: 1 },
  { id: 'comp_offwhite', nome: 'Laca Off-White', grupo: 'laca', cor: '#e6dfd3', gloss: 0.4, opacity: 1 },
  { id: 'comp_grafite', nome: 'Laca Grafite Fosca', grupo: 'laca', cor: '#3c4046', gloss: 0.3, opacity: 1 },
  { id: 'comp_sage', nome: 'Laca Verde Sage', grupo: 'laca', cor: '#7d8f82', gloss: 0.35, opacity: 1 },
  { id: 'comp_calacatta', nome: 'Quartzo Calacatta', grupo: 'pedra', cor: '#f0ede6', gloss: 0.65, opacity: 1 },
  { id: 'comp_preto_sg', nome: 'Granito Preto São Gabriel', grupo: 'pedra', cor: '#25272b', gloss: 0.68, opacity: 1 },
  { id: 'comp_vidro_fume', nome: 'Vidro Reflecta Fumê', grupo: 'vidro', cor: '#49525c', gloss: 0.9, opacity: 0.42 },
  { id: 'comp_vidro_incolor', nome: 'Vidro Incolor', grupo: 'vidro', cor: '#cfe6ea', gloss: 0.9, opacity: 0.3 },
  { id: 'comp_vidro_bronze', nome: 'Vidro Bronze', grupo: 'vidro', cor: '#8a6a4a', gloss: 0.9, opacity: 0.4 },
  { id: 'comp_vidro_verde', nome: 'Vidro Verde', grupo: 'vidro', cor: '#5f8f7f', gloss: 0.9, opacity: 0.4 },
  { id: 'comp_marmore_escuro', nome: 'Mármore Nero Marquina', grupo: 'pedra', cor: '#2b2d31', gloss: 0.7, opacity: 1 },
  { id: 'comp_madeira_clara', nome: 'MDF Madeira Clara', grupo: 'madeira', cor: '#e2c9a0', gloss: 0.25, opacity: 1 },
  { id: 'comp_aluminio', nome: 'Alumínio Escovado', grupo: 'metal', cor: '#b9bec4', gloss: 0.78, opacity: 1 },
  { id: 'comp_cobre', nome: 'Bronze / Cobre', grupo: 'metal', cor: '#b47a4c', gloss: 0.78, opacity: 1 },
];

export const MAPA_ACABAMENTOS: Readonly<Record<string, AcabamentoMovel>> = Object.fromEntries(
  ACABAMENTOS_MOVEIS.map((a) => [a.id, a]),
);

/** Chaves opcionais gravadas em `component.values` para escolher o acabamento no projeto. */
export type ChaveAcabamentoInstancia = 'acabCorpo' | 'acabPorta' | 'acabTampo';

/** Material visual completo para `Materiais3D` a partir de um acabamento. */
export function materialDoAcabamento(a: AcabamentoMovel): Material {
  return {
    id: a.id,
    name: a.nome,
    color: a.cor,
    hatch: 'solid',
    gloss: a.gloss,
    opacity: a.opacity,
    cost: 0,
    unit: 'm2',
  };
}

/** Materiais de peça das famílias novas (biblioteca) e o acabamento padrão de cada um. */
const MATERIAL_ESPECIAL: Readonly<Record<string, IdAcabamentoMovel>> = {
  mat_vidro_incolor: 'comp_vidro_incolor',
  mat_vidro_bronze: 'comp_vidro_bronze',
  mat_vidro_verde: 'comp_vidro_verde',
  mat_marmore: 'comp_marmore_escuro',
  mat_quartzo: 'comp_calacatta',
  mat_madeira_clara: 'comp_madeira_clara',
  mat_estofado: 'comp_offwhite',
  mat_eletro: 'comp_branco',
  mat_ceramica: 'comp_branco',
  mat_preto: 'comp_grafite',
  mat_espelho: 'comp_aluminio',
};

/** Resolve o material visual de uma peça do componente considerando overrides de instância e material da peça. */
export function resolverMaterialVisualPeca(
  c: Component,
  papel: PapelPeca,
  materialPeca?: string,
): string {
  const vals = c.values;
  const especial = materialPeca === undefined ? undefined : MATERIAL_ESPECIAL[materialPeca];
  if (especial !== undefined) {
    // Material especial das famílias novas (vidro, mármore, quartzo): o acabamento da instância da mesma zona vence o padrão.
    const chave = papel === 'tampo' ? 'acabTampo' : papel === 'porta' || papel === 'frente_gaveta' ? 'acabPorta' : 'acabCorpo';
    const v = vals?.[chave];
    return typeof v === 'string' && MAPA_ACABAMENTOS[v] ? v : especial;
  }
  if (materialPeca === 'mat_vidro' || materialPeca === 'vidro') return 'comp_vidro_fume';
  if (materialPeca === 'mat_metal' || materialPeca === 'mat_aluminio') return 'comp_aluminio';
  if (materialPeca === 'mat_cobre') return 'comp_cobre';
  if (materialPeca === 'mat_pedra_escura') {
    const v = vals?.acabTampo;
    return typeof v === 'string' && MAPA_ACABAMENTOS[v] ? v : 'comp_preto_sg';
  }
  if (papel === 'tampo') {
    const v = vals?.acabTampo;
    return typeof v === 'string' && MAPA_ACABAMENTOS[v] ? v : 'comp_tampo';
  }
  if (papel === 'porta' || papel === 'frente_gaveta') {
    const v = vals?.acabPorta;
    return typeof v === 'string' && MAPA_ACABAMENTOS[v] ? v : 'comp_porta';
  }
  if (papel === 'fundo') return 'comp_fundo';
  if (papel === 'rodape') return 'comp_rodape';
  const v = vals?.acabCorpo;
  return typeof v === 'string' && MAPA_ACABAMENTOS[v] ? v : 'comp_corpo';
}
