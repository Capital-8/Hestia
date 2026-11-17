// Contornos externos da massa em cotas ARBITRÁRIAS, sem duplicar a malha em TS: o kernel só fatia nos níveis do projeto (consulta 142), então
// cria-se um projeto SINTÉTICO com níveis auxiliares nas cotas pedidas e pergunta-se a fatia a um serviço dedicado. A massa mantém o nível e o
// deslocamento originais; só a lista de níveis cresce. Cota que já é de um nível reaproveita o nível. Cota fora da massa (ou sem fatia) fica de fora.

import type { Vec2 } from '@hestia/geom';
import { makeLevel, type Id, type Level, type Project } from '@hestia/model';
import { servicoMassaAuxiliar, type FatiaMassaProjeto } from './massaServico.ts';
import { semRepetidos, uniaoDeAneis } from './massaDerivaPisos.ts';

/** O que se pede à fonte de fatias: o mesmo formato de `ServicoMassa.fatias`. */
export interface FonteFatiasEmCotas {
  fatias(p: Project): FatiaMassaProjeto[] | null;
}

/** Chave estável de uma cota (nanômetro): as cotas viram chaves de mapa. */
export const chaveCota = (z: number): string => z.toFixed(9);

/**
 * Contornos externos (anel externo da UNIÃO 2D das cópias, um por componente) da massa em cada cota pedida. `null` se a fonte devolve `null`
 * (kernel desligado). Cotas sem fatia não aparecem no mapa.
 */
export function contornosEmCotas(p: Project, massaId: Id, cotas: readonly number[], fonte: FonteFatiasEmCotas = servicoMassaAuxiliar()): Map<string, Vec2[][]> | null {
  const unicas = [...new Set(cotas.map(chaveCota))].map(Number);
  const nivelDaCota = new Map<string, Id>();
  const auxiliares: Level[] = [];
  for (const z of unicas) {
    const existente = p.levels.find((l) => Math.abs(l.elevation - z) < 1e-9);
    if (existente) nivelDaCota.set(chaveCota(z), existente.id);
    else {
      const id = `__massa_aux_${auxiliares.length}`;
      auxiliares.push(makeLevel({ id, name: id, elevation: z }));
      nivelDaCota.set(chaveCota(z), id);
    }
  }
  const sintetico: Project = auxiliares.length === 0 ? p : { ...p, levels: [...p.levels, ...auxiliares] };
  const todas = fonte.fatias(sintetico);
  if (todas === null) return null;
  const porNivel = new Map<Id, FatiaMassaProjeto[]>();
  for (const f of todas) {
    if (f.massaId !== massaId || f.nivelId === null) continue;
    const l = porNivel.get(f.nivelId);
    if (l) l.push(f);
    else porNivel.set(f.nivelId, [f]);
  }
  const out = new Map<string, Vec2[][]>();
  for (const [chave, nivelId] of nivelDaCota) {
    const minhas = porNivel.get(nivelId);
    if (!minhas || minhas.length === 0) continue;
    out.set(chave, uniaoDeAneis(minhas.map((f) => semRepetidos(f.pontos))).map((poli) => poli[0]!));
  }
  return out;
}
