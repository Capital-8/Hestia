// Quantitativos da massa (plano de massa, A.4 regra 11 e A.6 "Massas por pavimento"). TS só agrega o que o kernel devolve: o volume e as áreas
// vêm da consulta 144 e a área e o perímetro por pavimento da consulta 142. Sem kernel não há linhas, e a tabela não mostra zero no lugar do que
// não foi calculado (quem chama recebe `null` do serviço).

import type { Id } from '@hestia/model';
import type { FatiaMassaProjeto, QuantMassaProjeto } from './massaServico.ts';

/** Área e perímetro de uma massa num pavimento, somados sobre as cópias do arranjo (A.4 regra 11). */
export interface LinhaPavimentoMassa {
  massaId: Id;
  nivelId: Id | null;
  /** Cota absoluta do pavimento. */
  z: number;
  area: number;
  perimetro: number;
  /** Quantas cópias entraram na soma (o aviso 2 de sobreposição pode ter contado em dobro). */
  copias: number;
}

/** Soma por (massa, pavimento) das fatias de todas as cópias. Ordem: massa, depois cota crescente. */
export function somaPorPavimento(fatias: readonly FatiaMassaProjeto[]): LinhaPavimentoMassa[] {
  const porChave = new Map<string, LinhaPavimentoMassa>();
  for (const f of fatias) {
    const chave = `${f.massaId}|${f.nivelId ?? ''}`;
    const atual = porChave.get(chave);
    if (atual) {
      atual.area += f.area;
      atual.perimetro += f.perimetro;
      atual.copias++;
    } else porChave.set(chave, { massaId: f.massaId, nivelId: f.nivelId, z: f.z, area: f.area, perimetro: f.perimetro, copias: 1 });
  }
  return [...porChave.values()].sort((a, b) => (a.massaId < b.massaId ? -1 : a.massaId > b.massaId ? 1 : a.z - b.z));
}

/** Totais do projeto somados sobre as massas (volume e áreas da consulta 144). */
export interface TotaisMassas {
  volume: number;
  areaLateral: number;
  areaBase: number;
  areaTopo: number;
}

export function totaisDasMassas(linhas: readonly QuantMassaProjeto[]): TotaisMassas {
  const t: TotaisMassas = { volume: 0, areaLateral: 0, areaBase: 0, areaTopo: 0 };
  for (const q of linhas) {
    t.volume += q.volume;
    t.areaLateral += q.areaLateral;
    t.areaBase += q.areaBase;
    t.areaTopo += q.areaTopo;
  }
  return t;
}
