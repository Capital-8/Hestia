import type { CeilingType, FloorType, Id, OpeningType, Project, SlabType, WallType } from '@hestia/model';
import type { IfcFile } from './ifc.ts';
import { styleOf, type IfcStyle } from './psets.ts';
import type { StepEntity } from './step.ts';
import { t as tr, type Lang } from '../i18n.ts';

/** Nome curto e estável para compor ids de tipo. */
export const slug = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** O mínimo que a criação de tipos precisa do contexto da importação. */
export interface TypeCtx {
  f: IfcFile;
  p: Project;
  typeOf: Map<number, StepEntity>;
  types: Map<string, Id>;
  /** Idioma dos nomes padrão criados na importação; ausente = `'pt'`. */
  lang?: Lang;
}

/**
 * Tipo de parede por nome + espessura, com uma camada de estrutura. O IFC traz a espessura (e, quando há
 * `IfcMaterialLayerSet`, as camadas); o desenho de camadas do Hestia não é reconstruído na v1.
 */
export function wallType(ctx: TypeCtx, name: string, thickness: number, materialId?: Id): Id {
  const mm = Math.round(thickness * 1000);
  const key = `wall|${name}|${mm}|${materialId ?? ''}`;
  const hit = ctx.types.get(key);
  if (hit) return hit;
  const id = `iwt_${slug(name) || tr(ctx.lang ?? 'pt', 'io_ifc_slug_wall')}_${mm}${materialId ? `_${materialId}` : ''}`;
  const type: WallType = {
    id,
    name: name || tr(ctx.lang ?? 'pt', 'io_ifc_default_wall_type', { mm }),
    description: '',
    code: '',
    layers: [{ function: 'structure', materialId: materialId ?? 'mat_bloco14', thickness, wraps: true }],
    wrapInserts: 'none',
    wrapEnds: 'none',
    strips: [],
    cost: 0,
    thermalU: null,
    acousticRw: null,
    fireRating: null,
    manufacturer: 'IFC',
  };
  ctx.p.wallTypes[id] = type;
  ctx.types.set(key, id);
  return id;
}

/** Tipo de piso, laje ou forro com uma camada de estrutura da espessura importada. */
export function slabLikeType(ctx: TypeCtx, kind: 'floor' | 'slab' | 'ceiling', name: string, thickness: number, materialId?: Id): Id {
  const mm = Math.max(1, Math.round(thickness * 1000));
  const key = `${kind}|${name}|${mm}|${materialId ?? ''}`;
  const hit = ctx.types.get(key);
  if (hit) return hit;
  const id = `i${kind === 'floor' ? 'ft' : kind === 'slab' ? 'st' : 'ct'}_${slug(name) || tr(ctx.lang ?? 'pt', 'io_ifc_slug_type')}_${mm}${materialId ? `_${materialId}` : ''}`;
  const layers = [{ function: 'structure' as const, materialId: materialId ?? 'mat_concreto', thickness, wraps: false }];
  if (kind === 'floor') {
    const t: FloorType = { id, name: name || tr(ctx.lang ?? 'pt', 'io_ifc_default_floor_type', { mm }), code: '', description: '', layers, cost: 0 };
    ctx.p.floorTypes[id] = t;
  } else if (kind === 'slab') {
    const t: SlabType = { id, name: name || tr(ctx.lang ?? 'pt', 'io_ifc_default_slab_type', { mm }), code: '', description: '', layers, cost: 0 };
    ctx.p.slabTypes[id] = t;
  } else {
    const t: CeilingType = { id, name: name || tr(ctx.lang ?? 'pt', 'io_ifc_default_ceiling_type', { mm }), code: '', description: '', layers, cost: 0 };
    ctx.p.ceilingTypes[id] = t;
  }
  ctx.types.set(key, id);
  return id;
}

/** Enum de operação de um tipo de porta/janela, procurando em todos os atributos. */
export function operationOf(type: StepEntity | undefined): string {
  if (!type) return '';
  for (const a of type.args) if (a.k === 'enum' && /SWING|SLIDING|DOOR|WINDOW|PANEL|FIXED|PIVOT|FOLD/.test(a.v)) return a.v;
  return '';
}

/** Tipo de porta/janela: família de planta e folhas deduzidas da operação, senão o padrão do tipo. */
export function openingType(
  ctx: TypeCtx,
  filler: StepEntity,
  kind: 'door' | 'window',
  w: number,
  h: number,
  sill: number,
): Id {
  const f = ctx.f;
  const declared = ctx.typeOf.get(filler.id);
  const name = f.text(declared, 2).trim() || f.text(filler, 2).trim() || tr(ctx.lang ?? 'pt', kind === 'door' ? 'io_ifc_default_door' : 'io_ifc_default_window');
  const op = operationOf(declared) || operationOf(filler);
  const mm = `${Math.round(w * 1000)}x${Math.round(h * 1000)}`;
  const key = `open|${kind}|${name}|${mm}`;
  const hit = ctx.types.get(key);
  if (hit) return hit;
  const double = /DOUBLE|TWO|PANEL_2|BIFOLD/.test(op);
  const sliding = /SLIDING|POCKET/.test(op);
  const plan: OpeningType['plan'] = double ? 'double' : sliding ? 'sliding' : kind === 'door' ? 'swing' : 'fixed';
  const id = `iot_${slug(name) || kind}_${mm}`;
  const type: OpeningType = {
    id,
    kind,
    name: `${name} ${Math.round(w * 100)}x${Math.round(h * 100)}`,
    width: w,
    height: h,
    sill: kind === 'door' ? 0 : Math.max(0, sill),
    leaves: double ? 2 : 1,
    plan,
    frameMaterialId: 'mat_aluminio',
    glassMaterialId: 'mat_vidro',
    closure: 'inherit',
  };
  ctx.p.openingTypes[id] = type;
  ctx.types.set(key, id);
  return id;
}

/** Material do IFC para uma cor `#rrggbb` (um por cor, reaproveitado): é o que pinta o genérico no 3D. */
/** Material do IFC para um estilo `#rrggbb` + opacidade (um por combinação, reaproveitado): pinta nativo e genérico. */
export function materialIdOfStyle(ctx: { p: Project }, style: IfcStyle | undefined): Id | undefined {
  if (!style) return undefined;
  const hex = style.color.replace('#', '').toLowerCase();
  const pct = Math.round(Math.max(0, Math.min(1, style.opacity)) * 100);
  const id = pct >= 100 ? `im_${hex}` : `im_${hex}_${String(pct).padStart(3, '0')}`;
  if (!ctx.p.materials[id]) {
    ctx.p.materials[id] = {
      id,
      name: `IFC ${style.color}${pct >= 100 ? '' : ` (${pct}%)`}`,
      color: style.color,
      hatch: 'none',
      gloss: 0.1,
      opacity: pct / 100,
      cost: 0,
      unit: 'm2',
    };
  }
  return id;
}

/** Estilo do produto IFC, criando o material correspondente no projeto. */
export function styleOfWithMaterial(
  ctx: { p: Project; typeOf: Map<number, StepEntity> },
  f: IfcFile,
  e: StepEntity,
): IfcStyle | undefined {
  const style = styleOf(f, e, ctx.typeOf.get(e.id));
  materialIdOfStyle(ctx, style);
  return style;
}

/** Cor do produto IFC, criando o material correspondente no projeto (o 3D do genérica usa esse material). */
export function colorOfWithMaterial(
  ctx: { p: Project; typeOf: Map<number, StepEntity> },
  f: IfcFile,
  e: StepEntity,
): string | undefined {
  return styleOfWithMaterial(ctx, f, e)?.color;
}
