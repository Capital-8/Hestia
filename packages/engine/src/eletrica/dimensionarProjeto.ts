import { consultarCircuitos, type CircuitoConsultado, type Id, type Project } from '@hestia/model';
import { dimensionarCircuito, type ResultadoCircuito } from './calculosEletricos.ts';
import { comprimentoDoCircuito, type ComprimentoDoCircuito } from './comprimentoCircuito.ts';
import { TABELAS_PROVISORIAS, type TabelasEletricas } from './tabelasEletricas.ts';

/*
 * Dimensionamento dos circuitos do PROJETO (ficha C5): junta a consulta dos circuitos, o comprimento pela rede de eletrodutos e os
 * cálculos puros, com as tabelas dadas (padrão: as provisórias, CONFERIR). Totais por quadro: soma das potências aplicadas e das
 * correntes de projeto dos circuitos do quadro (soma aritmética, sem fator de diversidade entre circuitos).
 */

export interface CircuitoDimensionado {
  circuito: CircuitoConsultado;
  comprimento: ComprimentoDoCircuito;
  resultado: ResultadoCircuito;
  /** Pontos com potência zero (componentes). */
  pontosSemPotencia: Id[];
}

export interface QuadroDimensionado {
  id: Id;
  nome: string;
  circuitos: Id[];
  potenciaAplicadaVA: number;
  potenciaAplicadaW: number;
  correnteTotalA: number;
}

export interface ProjetoDimensionado {
  tabelas: TabelasEletricas;
  circuitos: Record<Id, CircuitoDimensionado>;
  quadros: QuadroDimensionado[];
}

export function dimensionarProjeto(p: Project, tabelas: TabelasEletricas = TABELAS_PROVISORIAS): ProjetoDimensionado {
  const consulta = consultarCircuitos(p);
  const circuitos: Record<Id, CircuitoDimensionado> = {};
  for (const c of consulta.circuitos) {
    const comprimento = comprimentoDoCircuito(p, c);
    const resultado = dimensionarCircuito(
      {
        tipo: c.tipo, tensaoV: c.tensao, totalVA: c.totalVA, comprimentoM: comprimento.comprimentoM,
        ...(c.fp !== undefined ? { fp: c.fp } : {}), ...(c.secaoMm2 !== undefined ? { secaoAdotadaMm2: c.secaoMm2 } : {}), ...(c.disjuntorA !== undefined ? { disjuntorAdotadoA: c.disjuntorA } : {}),
      },
      tabelas,
    );
    circuitos[c.id] = { circuito: c, comprimento, resultado, pontosSemPotencia: c.pontos.filter((x) => x.va === 0).map((x) => x.componenteId) };
  }
  const quadros = consulta.quadros.map((q): QuadroDimensionado => {
    const seus = q.circuitos.map((id) => circuitos[id]?.resultado).filter((r): r is ResultadoCircuito => r !== undefined);
    return {
      id: q.id, nome: q.nome, circuitos: q.circuitos,
      potenciaAplicadaVA: seus.reduce((s, r) => s + r.potenciaAplicadaVA, 0),
      potenciaAplicadaW: seus.reduce((s, r) => s + r.potenciaAplicadaW, 0),
      correnteTotalA: seus.reduce((s, r) => s + (Number.isFinite(r.correnteA) ? r.correnteA : 0), 0),
    };
  });
  return { tabelas, circuitos, quadros };
}
