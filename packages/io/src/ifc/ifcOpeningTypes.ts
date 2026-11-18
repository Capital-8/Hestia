import { OPENING_FRAME_DEFAULTS, openingHeight, type Opening, type OpeningType } from '@hestia/model';
import { gid, materialOf, optStr, type IfcCtx } from './ifcCtx.ts';
import { en, list, OMIT, ref, stepString } from './ifcStep.ts';
import { singleValue, type PropInput } from './ifcProperties.ts';
import { liningPanelIds } from './ifcOpeningLining.ts';

/**
 * `Pset_ManufacturerTypeInformation` do tipo (IFC4: ligado pelo `HasPropertySets` do próprio tipo, não por
 * `IfcRelDefinesByProperties`) com `Manufacturer`. Sem fabricante (vazio ou em branco) não há conjunto.
 */
function manufacturerSet(c: IfcCtx, t: OpeningType): number | undefined {
  const manufacturer = t.manufacturer?.trim();
  if (!manufacturer) return undefined;
  const single = singleValue(c.w, 'Manufacturer', manufacturer);
  return c.w.add('IFCPROPERTYSET', [gid(`typemanuf:${t.id}`), OMIT, stepString('Pset_ManufacturerTypeInformation'), OMIT, list([ref(single)])]);
}

/** Operação de porta (IfcDoorTypeOperationEnum). `userDefined` só existe quando `operation` é `USERDEFINED`. */
export interface DoorOperation {
  operation: string;
  userDefined?: string;
}

/**
 * Operação da porta pela família e pelo número de folhas. `flipHand` inverte a dobradiça. Critérios:
 * - duas folhas (`leaves >= 2`) usam o valor de duas folhas da mesma família (`DOUBLE_DOOR_*`), não o de uma;
 * - `double` (duas folhas de giro) = `DOUBLE_DOOR_SINGLE_SWING`; `dblact` (vai-e-vem) = `DOUBLE_SWING_*` com uma folha e
 *   `DOUBLE_DOOR_DOUBLE_SWING` com duas;
 * - `pivot` (eixo vertical no meio da folha, não na lateral) não tem valor no enum: `USERDEFINED` + `PIVOT`;
 * - folha de giro com painel fixo lateral (`sidelights`) = `SWING_FIXED_*`, escolhido pelo lado da dobradiça (o enum não
 *   diz de que lado fica o painel fixo: ambiguidade registrada no relatório);
 * - seccionado (`garage`) = `ROLLINGUP`, o mais próximo no IFC4 (não há seccional); o `PredefinedType` vira `GATE`.
 */
export function doorOperationOf(t: Pick<OpeningType, 'plan'> & Partial<Pick<OpeningType, 'leaves' | 'sidelights'>>, flipHand: boolean): DoorOperation {
  const double = (t.leaves ?? 1) >= 2;
  const fixedSide = t.sidelights?.left || t.sidelights?.right;
  const side = (left: string, right: string): string => (flipHand ? right : left);
  switch (t.plan) {
    case 'swing':
      if (double) return { operation: 'DOUBLE_DOOR_SINGLE_SWING' };
      if (fixedSide) return { operation: side('SWING_FIXED_LEFT', 'SWING_FIXED_RIGHT') };
      return { operation: side('SINGLE_SWING_LEFT', 'SINGLE_SWING_RIGHT') };
    case 'double':
      return { operation: double ? 'DOUBLE_DOOR_SINGLE_SWING' : side('SINGLE_SWING_LEFT', 'SINGLE_SWING_RIGHT') };
    case 'dblact':
      return { operation: double ? 'DOUBLE_DOOR_DOUBLE_SWING' : side('DOUBLE_SWING_LEFT', 'DOUBLE_SWING_RIGHT') };
    case 'sliding':
    case 'pocket':
      return { operation: double ? 'DOUBLE_DOOR_SLIDING' : side('SLIDING_TO_LEFT', 'SLIDING_TO_RIGHT') };
    case 'pivot':
      return { operation: 'USERDEFINED', userDefined: 'PIVOT' };
    case 'bifold':
    case 'accordion':
      return { operation: double ? 'DOUBLE_DOOR_FOLDING' : side('FOLDING_TO_LEFT', 'FOLDING_TO_RIGHT') };
    case 'garage':
      return { operation: 'ROLLINGUP' };
    default:
      return { operation: 'NOTDEFINED' };
  }
}

/** Operação da porta como texto do IFC (ver `doorOperationOf`). */
export function doorOperation(t: Parameters<typeof doorOperationOf>[0], flipHand: boolean): string {
  return doorOperationOf(t, flipHand).operation;
}

/** `PredefinedType` da porta: `GATE` para o portão seccionado de garagem (acesso de veículo), `DOOR` nos demais. */
export function doorPredefinedType(t: Pick<OpeningType, 'plan'>): 'DOOR' | 'GATE' {
  return t.plan === 'garage' ? 'GATE' : 'DOOR';
}

/** Entrada de operação da janela: a família e, para a basculante, a posição do eixo horizontal. */
export type WindowOperationInput = Pick<OpeningType, 'plan'> & Partial<Pick<OpeningType, 'tiltAxis'>>;

/**
 * Operação da janela pela família (IfcWindowPanelOperationEnum), com `flipHand` invertendo a dobradiça. A basculante
 * (`tilt`) é `PIVOTHORIZONTAL` com eixo perto do centro (0,4 a 0,6, padrão 0,5) e `OTHEROPERATION` com eixo deslocado;
 * a veneziana não tem valor próprio e vai como `OTHEROPERATION` (o nome do tipo identifica a família).
 */
export function windowOperation(t: WindowOperationInput, flipHand: boolean): string {
  switch (t.plan) {
    case 'hinged':
      return flipHand ? 'SIDEHUNGRIGHTHAND' : 'SIDEHUNGLEFTHAND';
    case 'hung':
      return 'SLIDINGVERTICAL';
    case 'pivotwin':
      return 'PIVOTVERTICAL';
    case 'louver':
      return 'OTHEROPERATION';
    case 'casement':
      return 'TOPHUNG';
    case 'tilt':
      return Math.abs((t.tiltAxis ?? 0.5) - 0.5) <= 0.1 ? 'PIVOTHORIZONTAL' : 'OTHEROPERATION';
    case 'sliding':
      return 'SLIDINGHORIZONTAL';
    case 'fixed':
      return 'FIXEDCASEMENT';
    default:
      return 'NOTDEFINED';
  }
}

/**
 * Operação de cada folha de uma janela com várias folhas. Nas famílias de giro lateral (`hinged`, `louver`) a folha
 * seguinte é espelhada (dobradiça do outro lado); nas demais todas abrem igual.
 */
export function windowLeafOperation(t: WindowOperationInput, flipHand: boolean, index: number): string {
  const mirrored = (t.plan === 'hinged' || t.plan === 'louver') && index % 2 === 1;
  return windowOperation(t, mirrored ? !flipHand : flipHand);
}

/** Divisão de painéis de uma janela (IfcWindowTypePartitioningEnum) e o rótulo quando o valor é `USERDEFINED`. */
export interface WindowPartition {
  partition: string;
  userDefined?: string;
}

/**
 * Divisão da janela pelas folhas e pelo caixilho. Grade `n×m` e mais de três folhas não têm valor no enum: `USERDEFINED`
 * com o rótulo da divisão. Bandeira (painel fixo acima de uma folha) = `DOUBLE_PANEL_HORIZONTAL`; com mais folhas, `USERDEFINED`.
 */
export function windowPartitionOf(t: Pick<OpeningType, 'leaves'> & Partial<Pick<OpeningType, 'grid' | 'transom'>>): WindowPartition {
  const cols = Math.max(1, Math.trunc(t.grid?.cols ?? 1));
  const rows = Math.max(1, Math.trunc(t.grid?.rows ?? 1));
  if (cols > 1 || rows > 1) return { partition: 'USERDEFINED', userDefined: `GRADE ${cols}x${rows}` };
  if (t.transom) return t.leaves === 1 ? { partition: 'DOUBLE_PANEL_HORIZONTAL' } : { partition: 'USERDEFINED', userDefined: `${t.leaves} FOLHAS + BANDEIRA` };
  switch (t.leaves) {
    case 0:
    case 1:
      return { partition: 'SINGLE_PANEL' };
    case 2:
      return { partition: 'DOUBLE_PANEL_VERTICAL' };
    case 3:
      return { partition: 'TRIPLE_PANEL_VERTICAL' };
    default:
      return { partition: 'USERDEFINED', userDefined: `${t.leaves} FOLHAS` };
  }
}

/** Divisão de painéis como texto do IFC (ver `windowPartitionOf`). */
export function windowPartition(t: Parameters<typeof windowPartitionOf>[0]): string {
  return windowPartitionOf(t).partition;
}

/** Posição de cada folha na janela: uma folha não tem posição (`NOTDEFINED`); duas, esquerda e direita; três ou mais, com centro. */
function panelPosition(index: number, count: number): string {
  if (count === 1) return 'NOTDEFINED';
  if (index === 0) return 'LEFT';
  return index === count - 1 ? 'RIGHT' : 'MIDDLE';
}

/**
 * `IFCWINDOWPANELPROPERTIES` de uma janela: um por folha (B6), com `PanelPosition` da folha e a operação da folha. Janela
 * sem folha ou com uma folha escreve um único painel, como antes. `key` ancora os GlobalIds (`winpanel:<id>` ou
 * `wintypepanel:<tipo>`).
 */
export function windowPanels(c: IfcCtx, t: OpeningType, flipHand: boolean, key: string): number[] {
  const count = t.leaves >= 2 ? t.leaves : 1;
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const panelKey = count === 1 ? key : `${key}:${i}`;
    ids.push(
      c.w.add('IFCWINDOWPANELPROPERTIES', [
        gid(panelKey),
        OMIT,
        stepString(t.name),
        OMIT,
        en(windowLeafOperation(t, flipHand, i)),
        en(panelPosition(i, count)),
        OMIT,
        OMIT,
        OMIT,
      ]),
    );
  }
  return ids;
}

/**
 * Fração vidrada estimada do tipo de janela: área do vidro (descontando o caixilho no perímetro e as divisões do `grid`)
 * sobre a área total do vão. É uma estimativa do tipo — o `OpeningType` não guarda a área de vidro medida — e vão livre
 * (sem folha) não tem vidro.
 */
export function glazingAreaFraction(t: OpeningType): number | null {
  if (t.kind !== 'window' || t.leaves === 0 || !(t.width > 0) || !(t.height > 0)) return null;
  const frame = t.frameWidth && t.frameWidth > 0 ? t.frameWidth : OPENING_FRAME_DEFAULTS.frameWidth;
  const cols = Math.max(1, Math.trunc(t.grid?.cols ?? 1));
  const rows = Math.max(1, Math.trunc(t.grid?.rows ?? 1));
  const glassW = t.width - 2 * frame - (cols - 1) * frame;
  const glassH = t.height - 2 * frame - (rows - 1) * frame;
  if (!(glassW > 0) || !(glassH > 0)) return null;
  return Math.min(1, Math.max(0, (glassW * glassH) / (t.width * t.height)));
}

/**
 * Fração vidrada estimada da porta com vidro: `glassRatio` é a fração da altura da folha ocupada pelo vidro (a partir do
 * topo), e a folha ocupa a altura do vão menos a bandeira. Estimativa de altura apenas (a largura não entra).
 */
export function doorGlazingAreaFraction(t: OpeningType, height: number): number | null {
  if (t.kind !== 'door' || t.leaves === 0 || typeof t.glassRatio !== 'number' || !(height > 0)) return null;
  const leafHeight = height - (t.transom?.height ?? 0);
  if (!(leafHeight > 0)) return null;
  return Math.min(1, Math.max(0, (t.glassRatio * leafHeight) / height));
}

/**
 * Tipo da abertura (`IFCDOORTYPE`/`IFCWINDOWTYPE`), um por tipo do projeto: operação e `PredefinedType` da porta, e
 * divisão de painéis da janela. O IFC4 não tem `Operation` no `IFCWINDOWTYPE`; a operação da janela vai nas
 * `IFCWINDOWPANELPROPERTIES` do tipo (`HasPropertySets`), uma por folha, como o Revit exporta.
 */
export function openingTypeEntity(c: IfcCtx, t: OpeningType): number {
  const known = c.openingTypes.get(t.id);
  if (known !== undefined) return known;
  const properties: number[] = [];
  if (t.kind === 'window') properties.push(...windowPanels(c, t, false, `wintypepanel:${t.id}`));
  // Lining e painéis de porta/janela (`IfcDoorLiningProperties` etc.): conjuntos do tipo, ver `ifcOpeningLining.ts`.
  properties.push(...liningPanelIds(c, t));
  const manufacturer = manufacturerSet(c, t);
  if (manufacturer !== undefined) properties.push(manufacturer);
  const isDoor = t.kind === 'door';
  const operation = doorOperationOf(t, false);
  const partition = windowPartitionOf(t);
  const id = c.w.add(isDoor ? 'IFCDOORTYPE' : 'IFCWINDOWTYPE', [
    gid(`type:${t.id}`),
    OMIT,
    stepString(t.name),
    optStr(t.description?.trim() || undefined),
    OMIT,
    properties.length > 0 ? list(properties.map(ref)) : OMIT,
    OMIT,
    optStr(t.code?.trim() || undefined),
    OMIT,
    en(isDoor ? doorPredefinedType(t) : 'WINDOW'),
    en(isDoor ? operation.operation : partition.partition),
    OMIT,
    optStr(isDoor ? operation.userDefined : partition.userDefined),
  ]);
  c.openingTypes.set(t.id, id);
  // Material de fallback do tipo: leitores que propagam IFCRELDEFINESBYTYPE (IfcOpenShell, web-ifc 0.0.79+) usam
  // quando a ocorrência não tem material próprio. O web-ifc 0.0.78 (base do Any3D) ainda não propaga, por isso
  // `addOpenings` também associa o material à ocorrência. As peças com IFCSTYLEDITEM mantêm a cor específica.
  c.w.add('IFCRELASSOCIATESMATERIAL', [gid(`typemat:${t.id}`), OMIT, OMIT, OMIT, list([ref(id)]), ref(materialOf(c, t.frameMaterialId))]);
  return id;
}

/** `IFCRELDEFINESBYTYPE` de cada tipo de abertura com as instâncias escritas. */
export function addTypeRelations(c: IfcCtx): void {
  for (const [typeId, members] of c.openingTypeMembers) {
    const type = c.openingTypes.get(typeId);
    if (type === undefined || members.length === 0) continue;
    c.w.add('IFCRELDEFINESBYTYPE', [gid(`rtype:${typeId}`), OMIT, OMIT, OMIT, list(members.map(ref)), ref(type)]);
  }
}

/**
 * `Pset_DoorCommon`/`Pset_WindowCommon` com os tipos de medida do template IFC4 (ADD2): `Reference` é o código do TIPO
 * (IfcIdentifier; sem código, o nome do tipo), `IsExternal` (parede hospedeira externa) e, quando o tipo informa,
 * `FireRating`, `ThermalTransmittance` (IfcThermalTransmittanceMeasure) e `AcousticRating`. `GlazingAreaFraction` (ratio
 * positivo) sai na janela e na porta com vidro. O fator solar não está aqui: ver `openingGlazingProps`.
 */
export function openingCommonProps(o: Opening, t: OpeningType, external: boolean): Array<[string, PropInput]> {
  const props: Array<[string, PropInput]> = [
    ['Reference', { ifc: 'IFCIDENTIFIER', value: t.code?.trim() || t.name }],
    ['IsExternal', external],
  ];
  if (t.fireRating?.trim()) props.push(['FireRating', t.fireRating.trim()]);
  if (typeof t.uValue === 'number' && Number.isFinite(t.uValue)) props.push(['ThermalTransmittance', { ifc: 'IFCTHERMALTRANSMITTANCEMEASURE', value: t.uValue }]);
  if (typeof t.acousticRw === 'number' && Number.isFinite(t.acousticRw)) props.push(['AcousticRating', `${t.acousticRw} dB`]);
  const height = openingHeight(t, o);
  const fraction = t.kind === 'window' ? glazingAreaFraction({ ...t, height }) : doorGlazingAreaFraction(t, height);
  if (fraction !== null) props.push(['GlazingAreaFraction', { ifc: 'IFCPOSITIVERATIOMEASURE', value: fraction }]);
  return props;
}

/**
 * `Pset_DoorWindowGlazingType` da janela: `SolarHeatGainTransmittance` (IfcNormalisedRatioMeasure). O pset está no
 * template IFC4 com `ApplicableEntity` IfcDoor e IfcWindow, mas o Hestia só guarda o fator solar de janelas.
 */
export function openingGlazingProps(t: OpeningType): Array<[string, PropInput]> {
  if (t.kind !== 'window' || typeof t.solarFactor !== 'number' || !Number.isFinite(t.solarFactor)) return [];
  return [['SolarHeatGainTransmittance', { ifc: 'IFCNORMALISEDRATIOMEASURE', value: t.solarFactor }]];
}

