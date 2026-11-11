import type { Id, Project } from '@hestia/model';

/** Campos do projeto que não entram na geometria 3D (mesma lista de `assinaturasDoProjeto`). */
const CAMPOS_FORA_DA_GEOMETRIA = new Set(['elements', 'views', 'planViews', 'roomCategories', 'colorSchemes', 'nextOrder', 'name']);

/**
 * Edição só de esquadrias? Compara os elementos dos dois projetos por identidade: se tudo o que mudou é janela ou porta
 * cuja parede hospedeira (antes e depois) é a mesma, não mudou, e está num só nível, devolve o nível e as paredes. Qualquer
 * outra diferença (outro campo do projeto, outro tipo de elemento, parede editada) devolve `null`: caminho comum.
 */
export function edicaoSoDeEsquadrias(antes: Project, depois: Project): { nivel: Id; paredes: Id[] } | null {
  const a = antes as unknown as Record<string, unknown>;
  const d = depois as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) if (!CAMPOS_FORA_DA_GEOMETRIA.has(k) && a[k] !== d[k]) return null;
  const hospedeiras = new Set<Id>();
  const ids = new Set([...Object.keys(antes.elements), ...Object.keys(depois.elements)]);
  for (const id of ids) {
    const x = antes.elements[id];
    const y = depois.elements[id];
    if (x === y) continue;
    for (const e of [x, y]) {
      if (!e) continue;
      if (e.kind !== 'door' && e.kind !== 'window') return null;
      hospedeiras.add(e.hostId);
    }
  }
  if (hospedeiras.size === 0) return null;
  let nivel: Id | null = null;
  for (const h of hospedeiras) {
    const w1 = antes.elements[h];
    const w2 = depois.elements[h];
    if (!w1 || w1 !== w2 || w1.kind !== 'wall') return null;
    if (nivel !== null && nivel !== w1.levelId) return null;
    nivel = w1.levelId;
  }
  return nivel === null ? null : { nivel, paredes: [...hospedeiras] };
}
