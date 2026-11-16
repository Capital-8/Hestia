import { openingTypeById } from './openingNominal.ts';
import { openingHeight, openingType, wallHeight, wallType } from './queries.ts';
import { expandTagFormat, tagFamilyFor, type TagToken } from './tagFamily.ts';
import { unitsOf } from './units.ts';
import { formatQuantity } from './unitsFormat.ts';
import type { ElementTag, Id, Project } from './types.ts';

/** Valores dos parâmetros de um elemento, já formatados: a matéria-prima do modelo de rótulo da família. */
export function elementTagValues(p: Project, hostId: Id, withUnit = false): Partial<Record<TagToken, string>> {
  const e = p.elements[hostId];
  if (!e) return {};
  const levelId = 'levelId' in e
    ? e.levelId
    : e.kind === 'door' || e.kind === 'window'
      ? (() => { const host = p.elements[e.hostId]; return host && 'levelId' in host ? host.levelId : null; })()
      : null;
  const type = e.kind === 'wall' ? p.wallTypes[e.typeId]
    : e.kind === 'door' || e.kind === 'window' ? openingTypeById(p, e.typeId)
    : e.kind === 'floor' ? p.floorTypes[e.typeId]
    : e.kind === 'slab' ? p.slabTypes[e.typeId]
    : e.kind === 'ceiling' ? p.ceilingTypes[e.typeId]
    : e.kind === 'roof' ? p.roofTypes[e.typeId]
    : e.kind === 'stair' ? p.stairTypes[e.typeId]
    : e.kind === 'ramp' ? p.rampTypes[e.typeId]
    : e.kind === 'column' ? p.columnTypes?.[e.typeId]
    : e.kind === 'beam' ? p.beamTypes?.[e.typeId]
    : e.kind === 'footing' ? p.footingTypes?.[e.typeId]
    : undefined;
  const units = unitsOf(p);
  const opening = e.kind === 'door' || e.kind === 'window';
  return {
    type: (type && 'code' in type ? type.code : '') || (type && 'name' in type ? type.name : '') || e.kind,
    name: e.kind === 'room' ? e.name : type && 'name' in type ? type.name : e.kind,
    mark: 'mark' in e ? e.mark : '',
    level: p.levels.find((l) => l.id === levelId)?.name ?? '',
    width: opening ? formatQuantity(units, 'length', openingType(p, e).width, { withUnit })
      : e.kind === 'wall' ? formatQuantity(units, 'smallLength', wallType(p, e).layers.reduce((s, l) => s + l.thickness, 0), { withUnit })
      : e.kind === 'column' || e.kind === 'beam' || e.kind === 'footing'
        ? (type && 'width' in type ? formatQuantity(units, 'smallLength', type.width, { withUnit }) : '')
        : '',
    height: opening ? formatQuantity(units, 'length', openingHeight(openingType(p, e), e), { withUnit })
      : e.kind === 'wall' ? formatQuantity(units, 'length', wallHeight(p, e), { withUnit })
      : e.kind === 'room' ? formatQuantity(units, 'length', e.ceilingHeight ?? p.defaults.wallHeight, { withUnit })
      : e.kind === 'beam' || e.kind === 'footing'
        ? (type && 'height' in type ? formatQuantity(units, 'smallLength', type.height, { withUnit }) : '')
        : '',
  };
}

/**
 * Valor associativo de uma etiqueta: o modelo da família (ou o `property` antigo) preenchido com os parâmetros do
 * elemento, resolvido de novo a cada quadro do projeto.
 */
export function elementTagText(p: Project, tag: ElementTag): string {
  if (!p.elements[tag.hostId]) return '';
  const family = tagFamilyFor(p.settings, tag);
  return expandTagFormat(family.format, elementTagValues(p, tag.hostId, !tag.familyId));
}
