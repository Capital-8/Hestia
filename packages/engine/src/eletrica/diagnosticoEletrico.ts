import { consultarCircuitos, isComponent, validarCircuitos, type Component, type Id, type Project } from '@hestia/model';
import type { Diagnostico } from '../componentes/diagnosticoRede.ts';
import { comprimentoDoCircuito } from './comprimentoCircuito.ts';

/*
 * Diagnóstico ELÉTRICO (ficha C5), parte de `diagnosticarRede`: circuito sem quadro, ponto sem caminho de eletroduto até o quadro,
 * caixa/dispositivo sem eletroduto, quadro com mais circuitos que posições e ponto com potência zero. Só TRAÇADO: o programa não
 * dimensiona (sem corrente, seção, disjuntor nem queda de tensão). Só códigos e números (sem texto); a interface traduz.
 */

/** Dispositivo/caixa elétrica que declara entrada de eletroduto (caixas, tomadas, interruptores, luminárias, quadros). */
function temEntradaDeEletroduto(p: Project, c: Component): string[] {
  const f = p.componentFamilies?.[c.familyId];
  if (f?.categoria !== 'dispositivo_eletrico') return [];
  return (f.ligacoes ?? []).filter((l) => l.dominio === 'eletroduto').map((l) => l.id);
}

export function diagnosticarEletrica(p: Project): Diagnostico[] {
  const out: Diagnostico[] = [];
  const circuitos = p.circuitosEletricos ?? {};
  // Fora do circuito: caixa ou dispositivo sem NENHUM eletroduto ligado.
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e)) continue;
    const entradas = temEntradaDeEletroduto(p, e);
    if (entradas.length > 0 && !entradas.some((id) => e.ligacoes?.[id] !== undefined)) out.push({ codigo: 'dispositivo_sem_eletroduto', elementId: e.id });
  }
  // Do modelo dos circuitos: sem quadro e quadro com mais circuitos que posições.
  for (const q of validarCircuitos(p)) {
    if (q.codigo === 'circuito_sem_quadro' && q.circuitoId !== undefined) {
      out.push({ codigo: 'circuito_sem_quadro', elementId: circuitos[q.circuitoId]?.pontos[0]?.componenteId ?? q.circuitoId, circuitoId: q.circuitoId });
    } else if (q.codigo === 'quadro_sem_posicao' && q.quadroId !== undefined) {
      const quadro = consultarCircuitos(p).quadros.find((x) => x.id === q.quadroId);
      out.push({ codigo: 'quadro_sem_posicao', elementId: q.quadroId, valor: quadro?.circuitos.length ?? 0, limite: quadro?.posicoes ?? 0 });
    }
  }
  // Caminho de eletrodutos e caixas até o quadro, e pontos com VA 0. Nenhum cálculo elétrico: só o traçado.
  for (const c of consultarCircuitos(p).circuitos) {
    const aqui = (codigo: Diagnostico['codigo'], elementId: Id): void => void out.push({ codigo, elementId, circuitoId: c.id });
    if (c.quadroId !== undefined && isComponent(p.elements[c.quadroId])) {
      for (const id of comprimentoDoCircuito(p, c).semCaminho) aqui('ponto_sem_eletroduto', id);
    }
    for (const pt of c.pontos) if (pt.va === 0) aqui('ponto_potencia_zero', pt.componenteId);
  }
  return out;
}
