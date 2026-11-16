import { isMass, type Mass } from '@hestia/model';
import { gid, langOf, storeyOf, type IfcCtx } from './ifcCtx.ts';
import { faceSetOf, tessellatedShape } from './ifcGeneric.ts';
import { addPropertySet, type PropValue } from './ifcProperties.ts';
import { localPlacement } from './ifcSolids.ts';
import { en, OMIT, ref, stepString } from './ifcStep.ts';
import { t } from '../i18n.ts';
import type { IfcGeometry, IfcMassaGeo } from './ifcTypes.ts';

/**
 * Massa conceitual no IFC4 (plano de massa, ficha X1): um `IFCBUILDINGELEMENTPROXY` por massa, contido no pavimento do nível dela, com a malha `lod 2`
 * do kernel em `IFCTRIANGULATEDFACESET` (molde do objeto importado, `ifcGeneric.ts`). As cópias do arranjo são cascas da mesma malha: um proxy por
 * massa, não por cópia. O nome da massa vai em `Name`; Altura, Volume e áreas vão em `Pset_Hestia_Massa` quando o kernel deu as quantidades.
 *
 * O io não tem geometria da massa (A.5: nenhum caminho TS a gera): sem a malha do kernel a massa NÃO sai e o exportador avisa.
 */

/** Propriedades mínimas da massa: nome do arranjo e quantidades do kernel (altura, volume, áreas). */
function propriedadesDe(m: Mass, g: IfcMassaGeo): Array<readonly [string, PropValue]> {
  const props: Array<readonly [string, PropValue]> = [['Secoes', m.secoes.length], ['Copias', g.copias]];
  const q = g.quantidades;
  if (q) props.push(['Altura', q.altura], ['Volume', q.volume], ['AreaBase', q.areaBase], ['AreaTopo', q.areaTopo], ['AreaLateral', q.areaLateral]);
  return props;
}

function addMassa(c: IfcCtx, m: Mass, g: IfcMassaGeo): boolean {
  const st = storeyOf(c, m.levelId);
  if (!st) return false;
  const faceSet = faceSetOf(c.w, g.mesh, st.elev);
  if (faceSet === null) return false;
  const place = localPlacement(c.w, st.place, [0, 0, 0]);
  const shape = tessellatedShape(c.w, c.ctx, faceSet);
  const proxy = c.w.add('IFCBUILDINGELEMENTPROXY', [
    gid(`mass:${m.id}`),
    OMIT,
    stepString(m.name || m.id),
    OMIT,
    stepString('MASSA'),
    ref(place),
    ref(shape),
    OMIT,
    en('ELEMENT'),
  ]);
  c.products?.set(m.id, proxy);
  st.contained.push(proxy);
  addPropertySet(c, `pset:mass:${m.id}`, 'Pset_Hestia_Massa', propriedadesDe(m, g), proxy);
  return true;
}

/** Ordem estável das massas: ordem de criação e, no empate, o id. */
const porOrdemEId = (a: Mass, b: Mass): number => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Massas do projeto com malha em `geo.masses`; as demais (sem kernel ou recusadas por ele) não saem e ganham um aviso por massa. */
export function addMasses(c: IfcCtx, geo: IfcGeometry): void {
  const porId = new Map((geo.masses ?? []).map((g) => [g.massaId, g] as const));
  for (const m of Object.values(c.p.elements).filter(isMass).sort(porOrdemEId)) {
    const g = porId.get(m.id);
    if (g && addMassa(c, m, g)) continue;
    c.avisos?.push(t(langOf(c), 'io_ifc_mass_without_kernel', { name: m.name || m.id }));
  }
}
