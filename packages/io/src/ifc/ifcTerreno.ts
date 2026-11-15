import { isTerrain, type Project, type Terrain } from '@hestia/model';
import { gid, langOf, type IfcCtx } from './ifcCtx.ts';
import { faceSetOf, tessellatedShape } from './ifcGeneric.ts';
import { localPlacement } from './ifcSolids.ts';
import { en, list, num, OMIT, ref, stepString } from './ifcStep.ts';
import type { IfcGeometry } from './ifcTypes.ts';
import { t } from '../i18n.ts';

/**
 * Terreno no IFC4 (A.7 do plano do terreno): um `IFCGEOGRAPHICELEMENT` de tipo `TERRAIN` por terreno, com a malha da superfície PROPOSTA (sem saia nem
 * base) em `IFCTRIANGULATEDFACESET`, contido no `IFCSITE` (e não num pavimento). A malha vem do kernel (consulta `terreno_malha`) já resolvida em
 * `geo.terrenos`; este módulo não calcula geometria. As cotas saem como no projeto (z do projeto, como as dos pavimentos); a altitude real da cota 0
 * vai em `RefElevation` do `IFCSITE`. Sem `geo.terrenos` (kernel não pronto) o terreno NÃO sai e o exportador avisa, sem falhar. Lote e regiões não saem.
 */

/** Aviso de exportação: o terreno ficou fora do arquivo porque o kernel não deu a malha. */
export function avisoTerrenoSemKernel(c: IfcCtx, nome: string): void {
  c.avisos?.push(t(langOf(c), 'io_ifc_terrain_without_kernel', { name: nome }));
}

const porOrdemEId = (a: Terrain, b: Terrain): number => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** `RefElevation` do `IFCSITE`: a altitude real da cota 0 do projeto (`localizacao.cotaZero`); sem localização fica omitida. */
export const refElevationDoSitio = (p: Project): string => (p.localizacao ? num(p.localizacao.cotaZero) : OMIT);

/** Terrenos do projeto como `IFCGEOGRAPHICELEMENT` (`TERRAIN`) sob o `IFCSITE` (`site`: id e colocação); sem malha do kernel, só o aviso. */
export function addTerrenos(c: IfcCtx, geo: IfcGeometry, site: { id: number; place: number }): void {
  const terrenos = Object.values(c.p.elements).filter(isTerrain).sort(porOrdemEId);
  if (terrenos.length === 0) return;
  const malhas = new Map((geo.terrenos ?? []).map((m) => [m.terrenoId, m.mesh] as const));
  const escritos: number[] = [];
  for (const tn of terrenos) {
    const mesh = malhas.get(tn.id);
    const faceSet = mesh ? faceSetOf(c.w, mesh, 0) : null;
    if (faceSet === null) {
      avisoTerrenoSemKernel(c, tn.name || tn.id);
      continue;
    }
    const place = localPlacement(c.w, site.place, [0, 0, 0]);
    const shape = tessellatedShape(c.w, c.ctx, faceSet);
    const produto = c.w.add('IFCGEOGRAPHICELEMENT', [gid(`terreno:${tn.id}`), OMIT, stepString(tn.name || tn.id), OMIT, OMIT, ref(place), ref(shape), OMIT, en('TERRAIN')]);
    c.products?.set(tn.id, produto);
    escritos.push(produto);
  }
  if (escritos.length > 0) {
    c.w.add('IFCRELCONTAINEDINSPATIALSTRUCTURE', [gid('contain:site:terreno'), OMIT, OMIT, OMIT, list(escritos.map(ref)), ref(site.id)]);
  }
}
