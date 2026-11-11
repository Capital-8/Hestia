// Do projeto para a entrada neutra do adaptador da parede cortina (decisão 0056, fase 1). Só lê o modelo: a geometria e as
// quantidades são do Rust. Ligado aqui para que a tabela de quantitativos e, depois, o render usem a mesma entrada.

import { curtainPanelTypesOf, isCurtainType, isWall, mullionTypesOf, type CurtainSpec, type GridAxisSpec, type Project, type Wall, type WallType } from '@hestia/model';
import type { CortinaKernel, EixoGradeKernel, EntradaCenaCortina, MontanteKernel, PainelKernel, TipoCortinaKernel } from './kernelCortina.ts';
import { ENUM_CORTINA, ID_AUSENTE_CORTINA } from './kernelCortinaTabelas.ts';
import { wallZRange } from './wallZ.ts';

const LINHAS_DE_LOCALIZACAO = new Set<string>(Object.keys(ENUM_CORTINA.locationLine));

/** Eixo do modelo para o eixo do adaptador. A sobra mínima é do sistema (`CurtainSpec.minRemainder`), repetida nos dois eixos. */
function eixo(g: Partial<GridAxisSpec>, minRemainder: number | undefined): EixoGradeKernel {
  return {
    mode: g.mode!,
    count: g.count,
    distance: g.distance,
    justify: g.justify,
    positions: g.positions,
    anchor: g.anchor,
    offset: g.offset,
    angle: g.angle,
    minRemainder,
  };
}

function tipoDoKernel(t: WallType & { curtain: CurtainSpec }): TipoCortinaKernel {
  const c = t.curtain;
  const m = c.mullions;
  return {
    id: t.id,
    depth: c.depth,
    u: eixo(c.u, c.minRemainder),
    v: eixo(c.v, c.minRemainder),
    mullions: {
      interiorVertical: m.interiorVertical,
      interiorHorizontal: m.interiorHorizontal,
      borderStart: m.borderStart,
      borderEnd: m.borderEnd,
      borderBottom: m.borderBottom,
      borderTop: m.borderTop,
      corner: m.corner,
      joinPriority: m.joinPriority,
    },
    defaultPanelTypeId: c.defaultPanelTypeId,
    minCell: c.minCell,
    facetMaxChord: c.facetMaxChord,
  };
}

/** Sobrescrita de grade da instância: só os campos que ela traz (o resto herda do tipo). */
function gradeDaInstancia(w: Wall): CortinaKernel['grid'] {
  const g = w.curtain?.grid;
  if (!g) return undefined;
  const out: NonNullable<CortinaKernel['grid']> = {};
  if (g.u) out.u = eixo(g.u, undefined);
  if (g.v) out.v = eixo(g.v, undefined);
  return out;
}

/**
 * Entrada do adaptador para todas as paredes cortina do projeto. `materialNum` numera os materiais na ordem de
 * `p.materials` (1 em diante); material ausente ou desconhecido vira `ID_AUSENTE`.
 */
export function entradaCortinasDoProjeto(p: Project): EntradaCenaCortina {
  const niveis = new Map(p.levels.map((l, i) => [l.id, i] as const));
  const materiais = new Map(Object.keys(p.materials).map((id, i) => [id, i + 1] as const));

  const cortinas: CortinaKernel[] = [];
  const usados = new Set<string>();
  for (const w of Object.values(p.elements)) {
    if (!isWall(w)) continue;
    const tipo = p.wallTypes[w.typeId];
    if (!isCurtainType(tipo)) continue;
    usados.add(tipo.id);
    const z = wallZRange(p, w);
    cortinas.push({
      id: w.id,
      levelNum: niveis.get(w.levelId) ?? 0,
      typeId: tipo.id,
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      zBase: z.z0,
      height: z.height,
      sag: w.sag,
      flipped: w.flipped,
      locationLine: LINHAS_DE_LOCALIZACAO.has(w.locationLine) ? (w.locationLine as CortinaKernel['locationLine']) : undefined,
      grid: gradeDaInstancia(w),
      defaultPanelTypeId: w.curtain?.defaultPanelTypeId ?? undefined,
    });
  }

  const tipos: TipoCortinaKernel[] = Object.values(p.wallTypes)
    .filter((t): t is WallType & { curtain: CurtainSpec } => isCurtainType(t) && usados.has(t.id))
    .map(tipoDoKernel);

  const montantes: MontanteKernel[] = Object.values(mullionTypesOf(p)).map((mt) => ({
    id: mt.id,
    shape: mt.profile.shape,
    width: mt.profile.width,
    depth: mt.profile.depth,
    thickness: mt.profile.thickness,
    widthBack: mt.profile.widthBack,
    offset: mt.offset,
    position: mt.position,
    materialId: mt.materialId,
  }));

  const paineis: PainelKernel[] = Object.values(curtainPanelTypesOf(p)).map((pn) => ({
    id: pn.id,
    kind: pn.kind,
    thickness: pn.thickness,
    offset: pn.offset,
    bite: pn.bite,
    materialId: pn.materialId,
  }));

  return {
    montantes,
    paineis,
    tipos,
    cortinas,
    materialNum: (id) => (id && materiais.get(id)) || ID_AUSENTE_CORTINA,
  };
}
