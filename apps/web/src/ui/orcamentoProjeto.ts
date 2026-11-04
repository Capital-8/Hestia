import type { FerragemResolvida, OrcamentoFerragem, OrcamentoProjeto } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { nomeDoArquivo } from './familia/familiaLista.ts';

/*
 * Parte lógica (pura) da janela "Orçamento do projeto": opções do seletor de nível, adaptação das ferragens
 * agregadas para as tabelas reaproveitadas do editor de famílias, nome do CSV e quando mostrar o aviso de
 * projeto sem componentes. Testes em `orcamentoProjeto.test.ts`.
 */

export interface OpcaoNivel {
  /** `null` = todos os níveis. */
  id: Id | null;
  rotulo: string;
}

/** Opções do seletor de nível: "Todos os níveis" primeiro, depois os níveis na ordem do projeto. */
export function nivelOptions(p: Project): OpcaoNivel[] {
  const todos: OpcaoNivel = { id: null, rotulo: 'Todos os níveis' };
  return [todos, ...p.levels.map((l) => ({ id: l.id, rotulo: l.name }))];
}

/** Ferragens agregadas do orçamento no formato que a tabela da lista de peças entende. */
export function ferragensParaTabela(ferragens: readonly OrcamentoFerragem[]): FerragemResolvida[] {
  return ferragens.map((f) => ({ id: f.id, nome: f.nome, codigo: null, custo: null, quantidade: f.quantidade }));
}

/** Nome do CSV do projeto: `orcamento-<nome do projeto>.csv`, sem acentos nem caracteres estranhos. */
export function nomeArquivoOrcamento(p: Project): string {
  return nomeDoArquivo('orcamento', p.name || 'projeto', 'csv');
}

/** Sem nenhum componente (nem quebrado): a janela mostra o aviso em vez das abas. */
export function mostraSemComponentes(orc: OrcamentoProjeto): boolean {
  return orc.moveis.length === 0 && orc.avisos.length === 0;
}

/** Texto do nível no título da janela. */
export function rotuloNivel(p: Project, nivelId: Id | null): string {
  if (nivelId === null) return 'todos os níveis';
  const nivel = p.levels.find((l) => l.id === nivelId);
  return nivel === undefined ? 'nível removido' : nivel.name;
}
