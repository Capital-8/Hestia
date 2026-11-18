/**
 * Esquadria como dado IFC (docs/estudo-esquadrias/30): `IfcDoorLiningProperties`, `IfcDoorPanelProperties` e
 * `IfcWindowLiningProperties` no TIPO (`HasPropertySets`), e `Qto_DoorBaseQuantities`/`Qto_WindowBaseQuantities` na
 * OCORRÊNCIA. Só entra o que o `OpeningType` tem. O que depende da parede (profundidade do batente, largura da folha em
 * relação ao vão) não entra no tipo: fica sem valor, em vez de um número chutado.
 *
 * [I] = mapeamento de significado (atributo IFC ↔ campo do Hestia) inferido da definição do atributo, não conferido
 * em visualizador nem em `ifcopenshell.validate`.
 */
import { openingFrame, openingFrameStyle, type OpeningShape, type OpeningType } from '@hestia/model';
import { areaPerimetroDoContorno } from '@hestia/engine';
import { gid, type IfcCtx } from './ifcCtx.ts';
import { addSet } from './ifcQuantities.ts';
import { en, num, OMIT, stepString } from './ifcStep.ts';
import type { IfcOpeningGeo } from './ifcTypes.ts';

/** Largura do batente de aduela no engine (`openingFrameDims`, `J = 0.03` quando `frameStyle` é 'aduela'). */
const ADUELA_JAMB = 0.03;

/**
 * Operação do painel de porta (IfcDoorPanelOperationEnum) pela família do tipo. Sem valor próprio no enum: `pivot` vira
 * `SWINGING` [I]; família sem correspondência vira `NOTDEFINED`.
 */
const PANEL_OPERATION: Partial<Record<OpeningType['plan'], string>> = {
  swing: 'SWINGING',
  pivot: 'SWINGING',
  double: 'SWINGING',
  dblact: 'DOUBLE_ACTING',
  sliding: 'SLIDING',
  pocket: 'SLIDING',
  bifold: 'FOLDING',
  accordion: 'FOLDING',
  garage: 'ROLLINGUP',
};

/**
 * Posição da folha (IfcDoorPanelPositionEnum). Uma folha sem painel fixo não tem posição (`NOTDEFINED`); com painel
 * lateral, a folha fica no meio [I]. Duas ou mais: esquerda, centro e direita.
 */
function leafPosition(i: number, leaves: number, sidelit: boolean): string {
  if (leaves === 1) return sidelit ? 'MIDDLE' : 'NOTDEFINED';
  if (i === 0) return 'LEFT';
  return i === leaves - 1 ? 'RIGHT' : 'MIDDLE';
}

/** Largura do batente como o engine a usa (`openingFrameDims`): `frameWidth` do tipo, ou a de aduela. */
function jambWidth(t: OpeningType): number {
  return openingFrameStyle(t) === 'aduela' ? ADUELA_JAMB : openingFrame(t, Number.POSITIVE_INFINITY).frameWidth;
}

/** `IFCDOORLININGPROPERTIES` do tipo de porta. `LiningDepth` fica de fora: depende da espessura da parede. */
function doorLining(c: IfcCtx, t: OpeningType): number {
  const casing = t.casing;
  return c.w.add('IFCDOORLININGPROPERTIES', [
    gid(`lining:${t.id}`),
    OMIT,
    stepString(t.name),
    OMIT,
    OMIT, // LiningDepth: profundidade do batente depende da parede (frameDepthMode), não do tipo
    num(jambWidth(t)), // LiningThickness [V] = batente do tipo
    OMIT, // ThresholdDepth: o modelo não tem profundidade de soleira
    t.threshold ? num(t.threshold.thickness) : OMIT, // ThresholdThickness [V] = soleira do tipo
    OMIT, // TransomThickness: a bandeira do modelo é altura de vidro, não espessura de travessa
    OMIT,
    OMIT,
    OMIT,
    casing ? num(casing.width) : OMIT, // CasingThickness [I] = largura do alizar no plano da parede
    casing ? num(casing.thickness) : OMIT, // CasingDepth [I] = projeção do alizar perpendicular à parede
    OMIT,
    OMIT,
    OMIT,
  ]);
}

/** `IFCWINDOWLININGPROPERTIES` do tipo de janela. `LiningDepth` fica de fora, pelo mesmo motivo da porta. */
function windowLining(c: IfcCtx, t: OpeningType): number {
  return c.w.add('IFCWINDOWLININGPROPERTIES', [
    gid(`lining:${t.id}`),
    OMIT,
    stepString(t.name),
    OMIT,
    OMIT, // LiningDepth
    num(jambWidth(t)), // LiningThickness [V]
    OMIT, // TransomThickness
    OMIT, // MullionThickness: o modelo não tem espessura de montante
    OMIT,
    OMIT,
    OMIT,
    OMIT,
    OMIT, // ShapeAspectStyle
    OMIT, // LiningOffset
    OMIT,
    OMIT,
  ]);
}

/** `IFCDOORPANELPROPERTIES` de uma folha (ou painel fixo lateral). `PanelWidth` fica de fora: é razão da largura do vão. */
function doorPanel(c: IfcCtx, key: string, t: OpeningType, operation: string, position: string, depth: number): number {
  return c.w.add('IFCDOORPANELPROPERTIES', [gid(key), OMIT, stepString(t.name), OMIT, num(depth), en(operation), OMIT, en(position), OMIT]);
}

/** Painéis de uma porta: uma folha por painel, e um painel fixo para cada bandeira lateral (`sidelights`). */
function doorPanels(c: IfcCtx, t: OpeningType): number[] {
  const ids: number[] = [];
  const leaves = t.leaves;
  const sides = t.sidelights;
  const sidelit = Boolean(sides?.left || sides?.right);
  const depth = openingFrame(t, Number.POSITIVE_INFINITY).leafThickness; // PanelDepth [V] = espessura da folha
  const operation = PANEL_OPERATION[t.plan] ?? 'NOTDEFINED';
  for (let i = 0; i < leaves; i++) ids.push(doorPanel(c, `doorpanel:${t.id}:${i}`, t, operation, leafPosition(i, leaves, sidelit), depth));
  if (sides?.left) ids.push(doorPanel(c, `doorpanel:${t.id}:fixedL`, t, 'FIXEDPANEL', 'LEFT', depth));
  if (sides?.right) ids.push(doorPanel(c, `doorpanel:${t.id}:fixedR`, t, 'FIXEDPANEL', 'RIGHT', depth));
  return ids;
}

/**
 * Conjuntos de batente e de folha do tipo, para `HasPropertySets` do `IFCDOORTYPE`/`IFCWINDOWTYPE`. Porta: lining e um
 * painel por folha (mais os fixos laterais). Janela: só o lining; os painéis da janela (operação por folha) são de
 * `openingTypeEntity` (`windowPanels`). Vão livre (`leaves` 0) não tem painel de porta.
 */
export function liningPanelIds(c: IfcCtx, t: OpeningType): number[] {
  if (t.kind === 'window') return [windowLining(c, t)];
  return [doorLining(c, t), ...doorPanels(c, t)];
}

/**
 * `Qto_DoorBaseQuantities`/`Qto_WindowBaseQuantities` da ocorrência: Width, Height, Perimeter e Area. Vão com forma usa o
 * contorno (`areaPerimetroDoContorno`, a mesma conta de `quantities.ts`), dimensionado pelo vão bruto; vão retangular
 * usa a própria esquadria (`width` × `height`). Por isso, para forma, Width/Height podem diferir de `OverallWidth`/
 * `OverallHeight` quando há folga de vão bruto [V-código: `openingShapeOf`].
 */
export function addOpeningQto(c: IfcCtx, g: IfcOpeningGeo, t: OpeningType, fillId: number): void {
  const shape: OpeningShape = g.forma ?? { kind: 'rect', width: g.width, height: g.height };
  const { area, perimetro } = areaPerimetroDoContorno(shape);
  addSet(c, `${t.kind}:${g.openingId}`, t.kind === 'door' ? 'Qto_DoorBaseQuantities' : 'Qto_WindowBaseQuantities', fillId, [
    ['length', 'Width', shape.width],
    ['length', 'Height', shape.height],
    ['length', 'Perimeter', perimetro],
    ['area', 'Area', area],
  ]);
}
