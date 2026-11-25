import { consultarCircuitos, isComponent, validarCircuitos, type Component, type Id, type Project } from '@hestia/model';
import type { Diagnostico } from '../componentes/diagnosticoRede.ts';
import { dimensionarProjeto } from './dimensionarProjeto.ts';
import { TABELAS_PROVISORIAS, type TabelasEletricas } from './tabelasEletricas.ts';

/*
 * Diagnóstico ELÉTRICO (ficha C5), parte de `diagnosticarRede`: circuito sem quadro, ponto sem caminho de eletroduto até o quadro,
 * caixa/dispositivo sem eletroduto, quadro com mais circuitos que posições, circuito sobrecarregado, queda de tensão acima do limite
 * e ponto com potência zero. Só números e códigos (sem texto); a interface traduz. Os códigos de sobrecarga e de queda dependem
 * das tabelas recebidas (provisórias, CONFERIR, por padrão) e NÃO afirmam conformidade com norma.
 */

/** Dispositivo/caixa elétrica que declara entrada de eletroduto (caixas, tomadas, interruptores, luminárias, quadros). */
function temEntradaDeEletroduto(p: Project, c: Component): string[] {
  const f = p.componentFamilies?.[c.familyId];
  if (f?.categoria !== 'dispositivo_eletrico') return [];
  return (f.ligacoes ?? []).filter((l) => l.dominio === 'eletroduto').map((l) => l.id);
}

export function diagnosticarEletrica(p: Project, tabelas: TabelasEletricas = TABELAS_PROVISORIAS): Diagnostico[] {
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
  // Dimensionamento com as tabelas: caminho, potência, sobrecarga e queda.
  const dim = dimensionarProjeto(p, tabelas);
  for (const d of Object.values(dim.circuitos)) {
    const c = d.circuito;
    const r = d.resultado;
    const aqui = (extra: Partial<Diagnostico> & Pick<Diagnostico, 'codigo'>, elementId: Id): void => void out.push({ elementId, circuitoId: c.id, ...extra });
    const ref = c.quadroId ?? c.pontos[0]?.componenteId ?? c.id;
    if (c.quadroId !== undefined && isComponent(p.elements[c.quadroId])) {
      for (const id of d.comprimento.semCaminho) aqui({ codigo: 'ponto_sem_eletroduto' }, id);
    }
    for (const id of d.pontosSemPotencia) aqui({ codigo: 'ponto_potencia_zero' }, id);
    if (r.sobrecarregado) {
      const teto = Math.min(r.disjuntorA ?? Infinity, r.capacidadeA ?? Infinity);
      const maior = Math.max(0, ...Object.values(tabelas.capacidadeA));
      aqui({ codigo: 'circuito_sobrecarregado', valor: r.correnteA, limite: Number.isFinite(teto) ? teto : maior }, ref);
    }
    if (r.quedaExcedida && r.quedaPct !== null) aqui({ codigo: 'queda_tensao_excedida', valor: r.quedaPct, limite: r.quedaMaximaPct }, ref);
  }
  return out;
}
