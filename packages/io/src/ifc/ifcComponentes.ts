import { isComponent, type Component, type Project } from '@hestia/model';
import { caixaDoComponente, malhaDoComponente, resolverComponente, type ResolucaoFamilia } from '@hestia/engine';
import { gid, optStr, storeyOf, type IfcCtx } from './ifcCtx.ts';
import { faceSetOf, tessellatedShape } from './ifcGeneric.ts';
import { addPropertySet, type PropValue } from './ifcProperties.ts';
import { localPlacement } from './ifcSolids.ts';
import { OMIT, ref, stepString } from './ifcStep.ts';

/** Nome do property set dos componentes de marcenaria e equipamentos colocados no projeto. */
const PSET_NAME = 'Pset_Hestia_Componente';

/** Nome do produto: o nome da família e a marca, quando a instância tem uma. */
function nomeDoComponente(p: Project, comp: Component): string {
  const familia = p.componentFamilies?.[comp.familyId]?.nome ?? comp.familyId;
  const marca = comp.mark.trim();
  return marca ? `${familia} ${marca}` : familia;
}

/** Propriedades do componente: família, tipo, marca, dimensões da caixa (mm) e a quantidade de peças não vazias. */
function propriedadesDoComponente(p: Project, comp: Component, res: ResolucaoFamilia): Array<[string, PropValue]> {
  const props: Array<[string, PropValue]> = [
    ['Familia', comp.familyId],
    ['Tipo', comp.typeId ?? 'padrao'],
    ['Marca', comp.mark],
    ['Pecas', res.pecas.filter((q) => !q.vazio).length],
  ];
  const caixa = caixaDoComponente(p, comp, res);
  if (caixa) {
    // A caixa vem em metros; o pset publica as três medidas em milímetros, como o resto da família.
    props.push(
      ['Largura', (caixa.max[0] - caixa.min[0]) * 1000],
      ['Altura', (caixa.max[2] - caixa.min[2]) * 1000],
      ['Profundidade', (caixa.max[1] - caixa.min[1]) * 1000],
    );
  }
  return props;
}

/**
 * Componente colocado vira `IFCFURNITURE` (IFC4) no pavimento do nível: `ObjectType` = id da família, `Name` = nome da
 * família com a marca, `PredefinedType` omitido e o corpo em `IFCTRIANGULATEDFACESET` com a malha das peças sólidas
 * (metros, cota local do nível). Componente sem malha sai como produto sem forma.
 */
function addComponente(c: IfcCtx, comp: Component): void {
  const st = storeyOf(c, comp.levelId);
  if (!st) return;
  const res = resolverComponente(c.p, comp);
  const malha = malhaDoComponente(c.p, comp, res).solidas;
  const faceSet = faceSetOf(c.w, malha, st.elev);
  const shape = faceSet === null ? OMIT : ref(tessellatedShape(c.w, c.ctx, faceSet));
  const place = localPlacement(c.w, st.place, [0, 0, 0]);
  const produto = c.w.add('IFCFURNITURE', [
    gid(`component:${comp.id}`),
    OMIT,
    stepString(nomeDoComponente(c.p, comp)),
    OMIT,
    stepString(comp.familyId),
    ref(place),
    shape,
    optStr(comp.mark.trim() || undefined),
    OMIT,
  ]);
  st.contained.push(produto);
  addPropertySet(c, `pset:component:${comp.id}`, PSET_NAME, propriedadesDoComponente(c.p, comp, res), produto);
}

/** Ordem estável dos componentes: a ordem de criação e, no empate, o id. */
const byOrderAndId = (a: Component, b: Component): number => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Componentes do projeto, depois dos elementos nativos e dos importados, contidos no pavimento pelo exportador. */
export function addComponents(c: IfcCtx): void {
  for (const comp of Object.values(c.p.elements).filter(isComponent).sort(byOrderAndId)) addComponente(c, comp);
}
