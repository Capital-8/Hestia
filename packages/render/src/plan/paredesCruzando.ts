import { levelElevation, wallBaseElevation, wallsCrossingCut, type Id, type Project } from '@hestia/model';

/**
 * Projeto da planta de um nível: as paredes de outros níveis que cruzam o plano de corte (`wallsCrossingCut`) entram como
 * paredes do nível, com a MESMA base e o MESMO topo (`baseOffset` compensa a troca de nível; `topLevelId` e `height` ficam).
 * Assim o motor da vista (quadros, junção, corte, camadas, aberturas, ambientes) as trata como paredes do nível, sem
 * código especial. O projeto real não muda (o dono continua sendo o nível de origem, o arquivo e as quantidades idem):
 * esta cópia só alimenta a planta daquele nível. Sem parede cruzando, devolve o próprio projeto.
 * Memorizada por projeto e nível (o projeto é imutável), para os caches da vista reencontrarem o mesmo objeto.
 */
const memo = new WeakMap<Project, Map<Id, Project>>();

export function projetoDaPlanta(p: Project, levelId: Id): Project {
  let porNivel = memo.get(p);
  if (!porNivel) {
    porNivel = new Map();
    memo.set(p, porNivel);
  }
  const hit = porNivel.get(levelId);
  if (hit) return hit;
  const cruzam = wallsCrossingCut(p, levelId);
  let out = p;
  if (cruzam.length > 0) {
    const elements = { ...p.elements };
    const elev = levelElevation(p, levelId);
    for (const w of cruzam) elements[w.id] = { ...w, levelId, baseOffset: wallBaseElevation(p, w) - elev };
    out = { ...p, elements };
  }
  porNivel.set(levelId, out);
  return out;
}
