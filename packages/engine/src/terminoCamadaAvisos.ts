import { isFloor, isSlab, terminoCamadaOf, terminoOf, type Id, type Layer, type Project, type ValidationIssue } from '@hestia/model';
import { resolveAllFloors } from './floors.ts';
import { t, type Lang } from './i18nMessages.ts';
import { resolveAllSlabs } from './slabs.ts';
import { adjacentLevelIds, wallsOfLevel } from './terminoBlock.ts';
import { regionCamada, type AvisoTerminoCamada } from './terminoCamada.ts';

/**
 * Avisos do término por camada da parede (decisão 0054): a parede que a camada toca não tem a função pedida no lado pedido, e a borda foi
 * para a camada seguinte, em direção ao lado oposto. Nada silencioso: um aviso por elemento, camada e parede, com os dois ids.
 * O contorno de partida é o do elemento resolvido (o mesmo da camada na maioria dos casos); o aviso depende só do tipo da parede e do lado.
 */

/** Algum tipo de piso ou de laje, de um elemento existente, tem camada com `{ camada }`? Sem isso a conta não é feita. */
export const temTerminoCamada = (p: Project): boolean => {
  const usa = (layers: readonly Layer[]): boolean => layers.some((l) => terminoCamadaOf(terminoOf(l)) !== null);
  return Object.values(p.elements).some((e) => (isFloor(e) && usa(p.floorTypes[e.typeId]?.layers ?? [])) || (isSlab(e) && usa(p.slabTypes[e.typeId]?.layers ?? [])));
};

/** Avisos do término por camada de todo o projeto. */
export function avisosTerminoCamada(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  if (!temTerminoCamada(p)) return [];
  const out: ValidationIssue[] = [];
  const visto = new Set<string>();
  const examina = (elementId: Id, tipo: readonly Layer[], levelId: Id, laje: boolean, polygon: Parameters<typeof regionCamada>[1], zonas: ReadonlyArray<{ z0: number; z1: number }>): void => {
    const niveis = laje ? [levelId, ...adjacentLevelIds(p, levelId)] : [levelId];
    const paredes = niveis.flatMap((id) => wallsOfLevel(p, id));
    tipo.forEach((l, i) => {
      const regra = terminoCamadaOf(terminoOf(l));
      if (!regra) return;
      const avisos: AvisoTerminoCamada[] = [];
      regionCamada(p, polygon, paredes, regra, zonas[i]!.z0, zonas[i]!.z1, avisos);
      for (const a of avisos) {
        const chave = `${elementId}|${i}|${a.wallId}`;
        if (visto.has(chave)) continue;
        visto.add(chave);
        out.push({
          severity: 'warning',
          code: 'termino-camada-sem-funcao',
          message: t(lang, 'egb_issue_termino_camada_sem_funcao', {
            elemento: `"${elementId}"`,
            parede: `"${a.wallId}"`,
            funcao: a.funcao,
            lado: t(lang, a.lado === 'proximo' ? 'egb_issue_termino_lado_proximo' : 'egb_issue_termino_lado_distante'),
            camada: i + 1,
          }),
          elementId,
          ids: [elementId, a.wallId],
        });
      }
    });
  };
  for (const f of resolveAllFloors(p)) examina(f.floorId, p.floorTypes[f.typeId]?.layers ?? [], f.levelId, false, f.polygon, f.layers);
  for (const s of resolveAllSlabs(p)) examina(s.slabId, p.slabTypes[s.typeId]?.layers ?? [], s.levelId, true, s.polygon, s.layers);
  return out;
}
