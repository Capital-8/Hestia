import type { Discipline } from '../planView.ts';
import type { CategoriaFamilia, Familia } from './tipos.ts';
import type { ClasseIfc } from './tiposRepresentacao.ts';

/*
 * Categorias da família (ADR 0061, CONTRATO §6): rótulo em pt-BR, disciplina padrão e classe IFC padrão.
 * É só tabela. `Familia.ifc`, quando existe, sobrescreve a classe IFC; a disciplina do componente segue `Familia.disciplina`.
 */

export const ROTULO_CATEGORIA: Record<CategoriaFamilia, string> = {
  marcenaria: 'Marcenaria',
  mobiliario: 'Mobiliário',
  loucas: 'Louças e metais',
  equipamento: 'Equipamentos',
  generico: 'Genéricos',
  tubulacao: 'Tubulação',
  conexao_tubo: 'Conexões de tubo',
  terminal_hidraulico: 'Terminais hidráulicos',
  reservatorio: 'Reservatórios',
  eletroduto: 'Eletrodutos e eletrocalhas',
  dispositivo_eletrico: 'Dispositivos elétricos',
  luminaria: 'Luminárias',
  duto: 'Dutos',
  terminal_ar: 'Terminais de ar',
  perfil_estrutural: 'Perfis estruturais',
  chapa_estrutural: 'Chapas estruturais',
};

/** Disciplina padrão de cada categoria. Marcenaria, mobiliário, equipamento e genérico ficam em `arquitetura`, como os arquivos antigos. */
export const DISCIPLINA_DA_CATEGORIA: Record<CategoriaFamilia, Discipline> = {
  marcenaria: 'arquitetura',
  mobiliario: 'arquitetura',
  equipamento: 'arquitetura',
  generico: 'arquitetura',
  loucas: 'hidrossanitario',
  terminal_hidraulico: 'hidrossanitario',
  tubulacao: 'hidrossanitario',
  conexao_tubo: 'hidrossanitario',
  reservatorio: 'hidrossanitario',
  eletroduto: 'eletrico',
  dispositivo_eletrico: 'eletrico',
  luminaria: 'eletrico',
  duto: 'hvac',
  terminal_ar: 'hvac',
  perfil_estrutural: 'estrutura',
  chapa_estrutural: 'estrutura',
};

/** Classe IFC padrão (CONTRATO §6). `dispositivo_eletrico` vale tomada (`IFCOUTLET`); o interruptor sai por `Familia.ifc`. */
export const CLASSE_IFC_DA_CATEGORIA: Record<CategoriaFamilia, ClasseIfc> = {
  marcenaria: 'IFCFURNITURE',
  mobiliario: 'IFCFURNITURE',
  generico: 'IFCFURNITURE',
  loucas: 'IFCSANITARYTERMINAL',
  terminal_hidraulico: 'IFCSANITARYTERMINAL',
  equipamento: 'IFCFLOWTERMINAL',
  tubulacao: 'IFCPIPESEGMENT',
  conexao_tubo: 'IFCPIPEFITTING',
  reservatorio: 'IFCTANK',
  eletroduto: 'IFCCABLECARRIERSEGMENT',
  dispositivo_eletrico: 'IFCOUTLET',
  luminaria: 'IFCLIGHTFIXTURE',
  duto: 'IFCDUCTSEGMENT',
  terminal_ar: 'IFCAIRTERMINAL',
  perfil_estrutural: 'IFCMEMBER',
  chapa_estrutural: 'IFCPLATE',
};

/** Classe IFC de exportação: a sobrescrita `Familia.ifc.classe` ganha; senão, a da categoria. */
export function classeIfcDaFamilia(f: Familia): ClasseIfc {
  return f.ifc?.classe ?? CLASSE_IFC_DA_CATEGORIA[f.categoria];
}
