import { OPENING_FRAME_DEFAULTS, openingHeight, type Opening, type OpeningType } from '@hestia/model';
import { gid, materialOf, optStr, type IfcCtx } from './ifcCtx.ts';
import { en, list, OMIT, ref, stepString } from './ifcStep.ts';
import { singleValue, type PropValue } from './ifcProperties.ts';

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

/** Sentido de operação de uma porta pela família (IfcDoorTypeOperationEnum); `flipHand` inverte a dobradiça. */
export function doorOperation(t: Pick<OpeningType, 'plan'>, flipHand: boolean): string {
  switch (t.plan) {
    case 'swing':
      return flipHand ? 'SINGLE_SWING_RIGHT' : 'SINGLE_SWING_LEFT';
    case 'double':
      return 'DOUBLE_DOOR_DOUBLE_SWING';
    case 'sliding':
      return flipHand ? 'SLIDING_TO_RIGHT' : 'SLIDING_TO_LEFT';
    case 'pivot':
      return 'REVOLVING';
    case 'dblact':
      return flipHand ? 'DOUBLE_SWING_RIGHT' : 'DOUBLE_SWING_LEFT';
    case 'pocket':
      return flipHand ? 'SLIDING_TO_RIGHT' : 'SLIDING_TO_LEFT';
    case 'bifold':
    case 'accordion':
      return flipHand ? 'FOLDING_TO_RIGHT' : 'FOLDING_TO_LEFT';
    case 'garage':
      // IfcDoorTypeOperationEnum não tem SECTIONAL_OVERHEAD (isso é operação de painel): o portão seccionado sai ROLLINGUP.
      return 'ROLLINGUP';
    default:
      return 'NOTDEFINED';
  }
}

/**
 * Operação da janela pela família (IfcWindowPanelOperationEnum), com `flipHand` invertendo a dobradiça. O IFC4 não tem
 * `Operation` no IFCWINDOW (esse atributo é do IFCWINDOWPANELPROPERTIES); a função centraliza o mapeamento mais próximo
 * para o exportador e para o teste. A veneziana não tem valor próprio no enum e usa o `TILTANDTURN` mais próximo.
 */
export function windowOperation(t: Pick<OpeningType, 'plan'>, flipHand: boolean): string {
  switch (t.plan) {
    case 'hinged':
      return flipHand ? 'SIDEHUNGRIGHTHAND' : 'SIDEHUNGLEFTHAND';
    case 'hung':
      return 'SLIDINGVERTICAL';
    case 'pivotwin':
      return 'PIVOTVERTICAL';
    case 'louver':
      return flipHand ? 'TILTANDTURNRIGHTHAND' : 'TILTANDTURNLEFTHAND';
    case 'casement':
      return 'TOPHUNG';
    case 'tilt':
      return 'BOTTOMHUNG';
    case 'sliding':
      return 'SLIDINGHORIZONTAL';
    case 'fixed':
      return 'FIXEDCASEMENT';
    default:
      return 'NOTDEFINED';
  }
}

/** Divisão de folhas de uma janela (IfcWindowTypePartitioningEnum) pela contagem de folhas da família. */
export function windowPartition(leaves: number): string {
  if (leaves >= 3) return 'TRIPLE_PANEL_VERTICAL';
  if (leaves === 2) return 'DOUBLE_PANEL_VERTICAL';
  return 'SINGLE_PANEL';
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
 * Tipo da abertura (`IFCDOORTYPE`/`IFCWINDOWTYPE`), um por tipo do projeto: `OperationType` para a porta e
 * `PartitioningType` para a janela. O IFC4 não tem `Operation` no `IFCWINDOWTYPE`; a operação da janela vai nas
 * `IFCWINDOWPANELPROPERTIES` do tipo (`HasPropertySets`), como o Revit exporta.
 */
export function openingTypeEntity(c: IfcCtx, t: OpeningType): number {
  const known = c.openingTypes.get(t.id);
  if (known !== undefined) return known;
  const properties: number[] = [];
  if (t.kind === 'window') {
    properties.push(
      c.w.add('IFCWINDOWPANELPROPERTIES', [
        gid(`wintypepanel:${t.id}`),
        OMIT,
        stepString(t.name),
        OMIT,
        en(windowOperation(t, false)),
        en('NOTDEFINED'),
        OMIT,
        OMIT,
        OMIT,
      ]),
    );
  }
  const manufacturer = manufacturerSet(c, t);
  if (manufacturer !== undefined) properties.push(manufacturer);
  const id = c.w.add(t.kind === 'door' ? 'IFCDOORTYPE' : 'IFCWINDOWTYPE', [
    gid(`type:${t.id}`),
    OMIT,
    stepString(t.name),
    optStr(t.description?.trim() || undefined),
    OMIT,
    properties.length > 0 ? list(properties.map(ref)) : OMIT,
    OMIT,
    optStr(t.code?.trim() || undefined),
    OMIT,
    en(t.kind === 'door' ? 'DOOR' : 'WINDOW'),
    en(t.kind === 'door' ? doorOperation(t, false) : windowPartition(t.leaves)),
    OMIT,
    OMIT,
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
 * `Pset_DoorCommon`/`Pset_WindowCommon`: `Reference` (mark do vão), `IsExternal` (parede hospedeira externa) e, quando
 * o tipo informa, `FireRating`, `ThermalTransmittance`, `AcousticRating`; na janela, também `GlazingAreaFraction` e
 * `SolarHeatGainTransmittance` (fator solar: a porta não tem esse campo no `Pset_DoorCommon`).
 */
export function openingCommonProps(o: Opening, t: OpeningType, external: boolean): Array<[string, PropValue]> {
  const props: Array<[string, PropValue]> = [
    ['Reference', o.mark.trim() || t.code?.trim() || t.name],
    ['IsExternal', external],
  ];
  if (t.fireRating?.trim()) props.push(['FireRating', t.fireRating.trim()]);
  if (typeof t.uValue === 'number' && Number.isFinite(t.uValue)) props.push(['ThermalTransmittance', t.uValue]);
  if (typeof t.acousticRw === 'number' && Number.isFinite(t.acousticRw)) props.push(['AcousticRating', `${t.acousticRw} dB`]);
  if (t.kind === 'window') {
    if (typeof t.solarFactor === 'number' && Number.isFinite(t.solarFactor)) props.push(['SolarHeatGainTransmittance', t.solarFactor]);
    const fraction = glazingAreaFraction({ ...t, height: openingHeight(t, o) });
    if (fraction !== null) props.push(['GlazingAreaFraction', fraction]);
  }
  return props;
}
