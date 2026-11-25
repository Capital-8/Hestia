import {
  ehQuadro,
  proximaCorCircuito,
  proximoIdCircuito,
  proximoNomeCircuito,
  type CircuitoEletrico,
  type Command,
  type Id,
  type PontoCircuito,
  type Project,
  type TipoCircuito,
} from '@hestia/model';

/*
 * Ações do painel Circuitos (ficha C4), sem JSX: cada uma monta comandos do modelo e roda numa única transação (um passo de
 * desfazer). Funcionam sobre qualquer objeto com `project` e `transaction/exec` (o `ProjectStore` do editor ou um de teste).
 */

export interface AlvoDeComandos {
  readonly project: Project;
  exec(cmd: Command, label?: string): void;
  transaction(label: string, fn: () => void): void;
}

/** Potência (VA) sugerida para pontos novos no painel: só um ponto de partida, o projetista edita ponto a ponto. */
export const POTENCIA_INICIAL_VA = 100;

/** Resultado de atribuir a seleção: quantos entraram e quantos foram ignorados (não são componentes, ou são o próprio quadro). */
export interface ResultadoAtribuicao {
  atribuidos: number;
  ignorados: number;
}

/** Cria um circuito com nome, id e cor livres; o quadro inicial é o dado, ou o único quadro do projeto. Devolve o id. */
export function novoCircuito(alvo: AlvoDeComandos, quadroId?: Id): Id {
  const p = alvo.project;
  const cs = p.circuitosEletricos ?? {};
  const quadros = Object.values(p.elements).filter(ehQuadro);
  const quadro = quadroId ?? (quadros.length === 1 ? quadros[0]!.id : undefined);
  const circuito: CircuitoEletrico = { id: proximoIdCircuito(cs), nome: proximoNomeCircuito(cs), tipo: 'iluminacao', tensao: 127, pontos: [], cor: proximaCorCircuito(cs), ...(quadro !== undefined ? { quadroId: quadro } : {}) };
  alvo.exec({ type: 'addCircuitoEletrico', circuito });
  return circuito.id;
}

/** Atribui os componentes selecionados (menos quadros) ao circuito, todos com a mesma potência inicial. Num só passo de desfazer. */
export function atribuirSelecionados(alvo: AlvoDeComandos, circuitoId: Id, selecao: readonly Id[], potenciaVA: number): ResultadoAtribuicao {
  const p = alvo.project;
  const validos = selecao.filter((id) => p.elements[id]?.kind === 'component' && !ehQuadro(p.elements[id]));
  if (validos.length === 0) return { atribuidos: 0, ignorados: selecao.length };
  alvo.transaction('Atribuir pontos ao circuito', () => {
    for (const id of validos) alvo.exec({ type: 'assignPontoCircuito', circuitoId, ponto: { componenteId: id, potenciaVA } });
  });
  return { atribuidos: validos.length, ignorados: selecao.length - validos.length };
}

/** Define a potência (e, opcionalmente, o fator) de um ponto que já está no circuito. */
export function definirPotencia(alvo: AlvoDeComandos, circuitoId: Id, ponto: PontoCircuito): void {
  alvo.exec({ type: 'assignPontoCircuito', circuitoId, ponto });
}

export const tirarPonto = (alvo: AlvoDeComandos, componenteId: Id): void => alvo.exec({ type: 'removePontoCircuito', componenteId });
export const apagarCircuitoPorId = (alvo: AlvoDeComandos, id: Id): void => alvo.exec({ type: 'removeCircuitoEletrico', id });
export const renomear = (alvo: AlvoDeComandos, id: Id, nome: string): void => alvo.exec({ type: 'renameCircuitoEletrico', id, nome });
export const mudarQuadro = (alvo: AlvoDeComandos, id: Id, quadroId: Id | undefined): void => alvo.exec({ type: 'moveCircuitoEletrico', id, ...(quadroId !== undefined ? { quadroId } : {}) });
export const mudarTipo = (alvo: AlvoDeComandos, id: Id, tipo: TipoCircuito): void => alvo.exec({ type: 'updateCircuitoEletrico', id, patch: { tipo } });
export const mudarTensao = (alvo: AlvoDeComandos, id: Id, tensao: number): void => alvo.exec({ type: 'updateCircuitoEletrico', id, patch: { tensao } });
export const mudarCor = (alvo: AlvoDeComandos, id: Id, cor: string): void => alvo.exec({ type: 'updateCircuitoEletrico', id, patch: { cor } });
export const renomearQuadro = (alvo: AlvoDeComandos, id: Id, nome: string): void => alvo.exec({ type: 'renameQuadroEletrico', id, nome });

/** Roda a ação e devolve a mensagem de erro do modelo (português) em vez de lançar, para o painel mostrar. */
export function tentarAcao(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Formata VA: inteiro sem casas, senão uma casa (vírgula decimal do português). */
export function textoVA(va: number): string {
  // units-ok: VA não é grandeza do sistema de unidades do projeto (comprimento, área...); o texto já traz a unidade
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(va)} VA`;
}
