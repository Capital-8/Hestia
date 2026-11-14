/**
 * Campos consultáveis de cada tipo de elemento para `checks` e `schedules` dos suplementos (ADR 0057, spec 08 §4).
 * É a ÚNICA vista que uma expressão tem do projeto (ver `pluginExpr.ts`): valores simples, copiados, sem referências.
 * Todas as medidas ficam nas unidades do modelo: comprimento em metro, área em metro quadrado, volume em metro cúbico.
 *
 * Origem (`source`/`applyTo`): `wall`, `opening` (porta e janela), `door`, `window`, `floor`, `room` ou qualquer outro
 * `kind` de elemento (nesse caso só os campos comuns existem).
 */
import { polygonArea } from '@hestia/geom';
import type { ExprValue, ExprVars } from './pluginExpr.ts';
import { openingTypeById } from './openingNominal.ts';
import { layerMaterials } from './pluginLayerMaterials.ts';
import { isCurtainType, wallThicknessOf } from './wallType.ts';
import { isOpening, isWall, type Element, type Project } from './types.ts';

/** Campos consultáveis por origem, para a documentação e para a tela de ajuda (a ordem é a de exibição). */
export const PLUGIN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  common: ['id', 'kind', 'mark', 'levelId', 'levelName'],
  wall: ['typeId', 'typeName', 'length', 'height', 'thickness', 'area', 'volume', 'material', 'materials', 'cost', 'thermalU', 'acousticRw'],
  opening: ['typeId', 'typeName', 'typeCode', 'hostId', 'width', 'height', 'sill', 'area', 'leaves'],
  floor: ['typeId', 'typeName', 'area', 'material', 'materials'],
  room: ['name', 'number'],
};

/** O elemento pertence à origem pedida (`opening` cobre porta e janela). */
export function matchesSource(e: Element, source: string): boolean {
  if (source === 'opening') return isOpening(e);
  return e.kind === source;
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

function levelOf(p: Project, e: Element): { levelId: ExprValue; levelName: ExprValue } {
  const id = 'levelId' in e && typeof e.levelId === 'string' ? e.levelId : null;
  const hostId = 'hostId' in e && typeof e.hostId === 'string' ? e.hostId : null;
  const host = hostId ? p.elements[hostId] : undefined;
  const lid = id ?? (host && 'levelId' in host && typeof host.levelId === 'string' ? host.levelId : null);
  return { levelId: lid, levelName: lid ? (p.levels.find((l) => l.id === lid)?.name ?? lid) : null };
}

/** Campos do elemento. Nunca lança: dado ausente vira `null` (a expressão trata `null` sem erro). */
export function pluginFieldsOf(p: Project, e: Element): ExprVars {
  const out: Record<string, ExprValue> = {
    id: e.id, kind: e.kind, mark: 'mark' in e && typeof e.mark === 'string' ? e.mark : '', ...levelOf(p, e),
  };
  if (isWall(e)) {
    const t = p.wallTypes[e.typeId];
    const length = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y); // comprimento da corda do eixo, em metro
    const thickness = t ? wallThicknessOf(t) : null;
    Object.assign(out, {
      typeId: e.typeId, typeName: t?.name ?? null, length: round6(length), height: e.height, thickness,
      area: round6(length * e.height), volume: thickness === null ? null : round6(length * e.height * thickness),
      ...layerMaterials(p, isCurtainType(t) ? undefined : t), // cortina: a camada-sombra não é fonte de verdade (decisão 0056)
      cost: t?.cost ?? null, thermalU: t?.thermalU ?? null, acousticRw: t?.acousticRw ?? null,
    });
  } else if (isOpening(e)) {
    const t = openingTypeById(p, e.typeId);
    const height = e.heightOverride ?? t?.height ?? null;
    Object.assign(out, {
      typeId: e.typeId, typeName: t?.name ?? null, typeCode: t?.code ?? null, hostId: e.hostId,
      width: t?.width ?? null, height, sill: e.sillOverride ?? t?.sill ?? null,
      area: t && height !== null ? round6(t.width * height) : null, leaves: t?.leaves ?? null,
    });
  } else if (e.kind === 'floor') {
    const t = p.floorTypes[e.typeId];
    Object.assign(out, {
      typeId: e.typeId, typeName: t?.name ?? null, area: round6(polygonArea([e.boundary, ...e.holes])),
      ...layerMaterials(p, t),
    });
  } else if (e.kind === 'room') {
    Object.assign(out, { name: e.name, number: e.number });
  }
  return out;
}
