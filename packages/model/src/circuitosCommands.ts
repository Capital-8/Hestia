import {
  apagarCircuito,
  atribuirPonto,
  atualizarCircuito,
  criarCircuito,
  limparExcluidos,
  moverCircuito,
  removerPonto,
  renomearCircuito,
  type CircuitoEletrico,
  type PontoCircuito,
} from './circuitosEletricos.ts';
import { ehQuadro } from './circuitosEletricosConsulta.ts';
import type { Id, Project } from './types.ts';

/*
 * Comandos dos circuitos elétricos no projeto (ficha C4). Cada um valida antes de gravar (lança `Error` em português; o histórico
 * trabalha sobre rascunho, então o projeto fica como estava) e entra no desfazer/refazer. Os dados e as regras estão em
 * `circuitosEletricos.ts`.
 */

export type CircuitoCommand =
  | { type: 'addCircuitoEletrico'; circuito: CircuitoEletrico }
  | { type: 'renameCircuitoEletrico'; id: Id; nome: string }
  | { type: 'updateCircuitoEletrico'; id: Id; patch: Partial<Pick<CircuitoEletrico, 'tipo' | 'tensao' | 'cor' | 'notas'>> }
  | { type: 'removeCircuitoEletrico'; id: Id }
  /** Põe o componente no circuito com a potência; se estava em outro circuito, sai de lá. Repetir no mesmo circuito atualiza a potência. */
  | { type: 'assignPontoCircuito'; circuitoId: Id; ponto: PontoCircuito }
  | { type: 'removePontoCircuito'; componenteId: Id }
  /** Liga o circuito a um quadro (componente da família do quadro); `quadroId` ausente solta o circuito. */
  | { type: 'moveCircuitoEletrico'; id: Id; quadroId?: Id }
  /** Dá nome ao quadro (componente da família do quadro). */
  | { type: 'renameQuadroEletrico'; id: Id; nome: string };

export function applyCircuitoCommand(p: Project, c: CircuitoCommand): void {
  const cs = p.circuitosEletricos ?? {};
  switch (c.type) {
    case 'addCircuitoEletrico':
      if (c.circuito.quadroId !== undefined && !ehQuadro(p.elements[c.circuito.quadroId])) throw new Error('O quadro do circuito não existe: ' + c.circuito.quadroId);
      p.circuitosEletricos = criarCircuito(cs, c.circuito);
      break;
    case 'renameCircuitoEletrico':
      p.circuitosEletricos = renomearCircuito(cs, c.id, c.nome);
      break;
    case 'updateCircuitoEletrico':
      p.circuitosEletricos = atualizarCircuito(cs, c.id, c.patch);
      break;
    case 'removeCircuitoEletrico':
      p.circuitosEletricos = apagarCircuito(cs, c.id);
      break;
    case 'assignPontoCircuito':
      if (p.elements[c.ponto.componenteId]?.kind !== 'component') throw new Error('Componente inexistente: ' + c.ponto.componenteId);
      p.circuitosEletricos = atribuirPonto(cs, c.circuitoId, c.ponto);
      break;
    case 'removePontoCircuito':
      p.circuitosEletricos = removerPonto(cs, c.componenteId);
      break;
    case 'moveCircuitoEletrico':
      if (c.quadroId !== undefined && !ehQuadro(p.elements[c.quadroId])) throw new Error('O quadro não existe: ' + c.quadroId);
      p.circuitosEletricos = moverCircuito(cs, c.id, c.quadroId);
      break;
    case 'renameQuadroEletrico': {
      if (!ehQuadro(p.elements[c.id])) throw new Error('O componente não é um quadro de distribuição: ' + c.id);
      const nome = c.nome.trim();
      if (!nome) throw new Error('O quadro precisa de um nome.');
      p.quadrosEletricos = { ...(p.quadrosEletricos ?? {}), [c.id]: { id: c.id, nome } };
      break;
    }
  }
}

/** Depois de excluir componentes: tira-os dos circuitos, solta o quadro excluído e apaga o nome dele. */
export function limparCircuitosExcluidos(p: Project, excluidos: ReadonlySet<Id>): void {
  if (p.circuitosEletricos) p.circuitosEletricos = limparExcluidos(p.circuitosEletricos, excluidos);
  if (p.quadrosEletricos) {
    const sobra = Object.fromEntries(Object.entries(p.quadrosEletricos).filter(([id]) => !excluidos.has(id)));
    if (Object.keys(sobra).length !== Object.keys(p.quadrosEletricos).length) p.quadrosEletricos = sobra;
  }
}

export function circuitoCommandLabel(c: CircuitoCommand): string {
  switch (c.type) {
    case 'addCircuitoEletrico': return 'Criar circuito';
    case 'renameCircuitoEletrico': return 'Renomear circuito';
    case 'updateCircuitoEletrico': return 'Alterar circuito';
    case 'removeCircuitoEletrico': return 'Apagar circuito';
    case 'assignPontoCircuito': return 'Atribuir ponto ao circuito';
    case 'removePontoCircuito': return 'Tirar ponto do circuito';
    case 'moveCircuitoEletrico': return 'Mover circuito de quadro';
    case 'renameQuadroEletrico': return 'Renomear quadro';
  }
}
