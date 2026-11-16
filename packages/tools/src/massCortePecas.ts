import { ESTILO_CORTE_MASSA, linhasCorteDaMassa, type SectionResult } from '@hestia/engine';
import type { MultiPolygon } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import type { Piece } from './sectionEditTools.ts';

/**
 * Peças da MASSA na vista de corte e elevação (ficha T1c, item d). A massa fica fora do `SectionResult` (o kernel a desenha na camada própria,
 * como o guarda-corpo): as linhas são as MESMAS que a vista desenha (consulta 143, `linhasCorteDaMassa`, em `(s, z)`). Cada massa vira uma
 * peça só, com os contornos cortado e projetado dela, para o Alinhar, o clique e o fantasma do Mover e do Copiar tratarem a massa inteira.
 * A feição (estilo 3) é linha aberta, então não entra: é só traço dentro da peça. Sem kernel pronto não há peça (A.5).
 */

const porLinhas = new WeakMap<object, Piece[]>();

/** Peças da massa na vista (uma por massa, com todos os contornos dela). Oculta na vista não entra. Vazio sem kernel ou sem massa. */
export function massaCortePieces(p: Project, result: SectionResult, hidden?: ReadonlySet<Id>): Piece[] {
  const linhas = linhasCorteDaMassa(p, result);
  if (!linhas || linhas.length === 0) return [];
  let hit = porLinhas.get(linhas);
  if (!hit) {
    const porId = new Map<Id, MultiPolygon>();
    for (const l of linhas) {
      if (l.estilo === ESTILO_CORTE_MASSA.feicao || l.pontos.length < 3) continue;
      let polys = porId.get(l.massaId);
      if (!polys) { polys = []; porId.set(l.massaId, polys); }
      polys.push([l.pontos.map((q) => ({ x: q.s, y: q.z }))]);
    }
    hit = [...porId].map(([hostId, polygons]) => ({ hostId, depth: 0, polygons }));
    porLinhas.set(linhas, hit);
  }
  return hidden && hidden.size > 0 ? hit.filter((q) => !hidden.has(q.hostId)) : hit;
}
