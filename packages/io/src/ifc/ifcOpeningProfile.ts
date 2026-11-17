/**
 * Perfil do vão e IfcOpeningElement (IFC4) a partir de um `OpeningShape` do modelo.
 *
 * O contorno vem de `outline()` (anel aberto, anti-horário, em metros: x ao longo da parede, z para cima a partir da
 * base do vão). O anel é fechado em `IFCPOLYLINE` e extrudado na espessura pelo mesmo caminho dos demais sólidos
 * (`bodyShape` + `IFCEXTRUDEDAREASOLID`), como faz `topProfileSolid` em `ifcExport.ts`.
 *
 * [I] Arcos viram cordas (erro máximo `tol`, 1 mm por padrão) em vez de `IFCTRIMMEDCURVE` sobre `IFCCIRCLE`. Motivos:
 * uma única representação cobre as cinco formas (a elipse não é círculo; a ogival tem dois centros), e o trim exige
 * ângulos na unidade de ângulo do projeto (coleta 17, §5). A representação de arco em IfcCircle/IfcTrimmedCurve não foi
 * validada em visualizador; a polilinha é a escolha simples e robusta até lá.
 */
import { gid } from './ifcCtx.ts';
import { en, list, num, OMIT, ref, stepString, type StepWriter } from './ifcStep.ts';
import { bodyShape, direction } from './ifcSolids.ts';
import { CHORD_TOL, outline, type OpeningShape } from '@hestia/model';

/** Folga por face (m) entre o vazio e as faces da parede. Mesmo valor do cortador de `ifcExport.ts` (`thickness + 0.02`). */
export const MARGEM_FACE = 0.01;

export interface OpeningProfileOptions {
  /** Espessura da parede (m), finita e > 0. */
  thickness: number;
  /** Folga por face (m), >= 0. Padrão: 1 cm, para não deixar faces coplanares no CSG. */
  margin?: number;
  /** Erro máximo da corda de arco (m). Padrão: `CHORD_TOL` (1 mm). */
  tol?: number;
}

export interface OpeningProfileIds {
  /** IFCARBITRARYCLOSEDPROFILEDEF do vão. */
  profile: number;
  /** IFCEXTRUDEDAREASOLID do vazio. */
  solid: number;
  /** IFCPRODUCTDEFINITIONSHAPE do corpo do vazio. */
  shape: number;
  /** IFCOPENINGELEMENT. */
  opening: number;
}

/**
 * Escreve em `w` o perfil do vão, o vazio extrudado e o IfcOpeningElement, e devolve os ids criados.
 *
 * Contrato de colocação (a cargo de quem chama):
 * - `placement`: IFCLOCALPLACEMENT do elemento, com eixo X ao longo da parede, Z para cima e origem na base do vão
 *   (peitoril). O eixo Y é normal à parede; a espessura fica centrada em y = 0.
 * - `ctx`: IFCGEOMETRICREPRESENTATIONCONTEXT do modelo.
 *
 * Sem estado global: só escreve em `w`. Mesma entrada, mesmas linhas. Forma inválida lança erro antes de escrever
 * qualquer linha, então `w` não fica com entidades parciais.
 */
export function addOpeningProfile(
  w: StepWriter,
  ctx: number,
  placement: number,
  key: string,
  name: string,
  shape: OpeningShape,
  opts: OpeningProfileOptions,
): OpeningProfileIds {
  const { thickness, margin = MARGEM_FACE, tol = CHORD_TOL } = opts;
  if (!Number.isFinite(thickness) || thickness <= 0) throw new Error(`espessura de vão inválida: ${thickness}`);
  if (!Number.isFinite(margin) || margin < 0) throw new Error(`folga de vão inválida: ${margin}`);
  // Valida a forma (lança se inválida) antes de qualquer escrita.
  const ring = outline(shape, tol);

  // Perfil: anel fechado (o primeiro ponto repetido no fim), como as polilinhas de `ifcSolids.ts`.
  const points = ring.map(([x, z]) => w.add('IFCCARTESIANPOINT', [list([num(x), num(z)])]));
  const curve = w.add('IFCPOLYLINE', [list([...points, points[0]!].map(ref))]);
  const profile = w.add('IFCARBITRARYCLOSEDPROFILEDEF', [en('AREA'), OMIT, ref(curve)]);

  // Sólido: eixo local Z = -Y do mundo e eixo local X = X do mundo. Então o Y local é o Z do mundo (o perfil cresce
  // para cima) e a extrusão (local +Z) segue de y = +half até y = -half, centrada na espessura.
  // [I] Orientação dos eixos verificada só por cálculo do produto vetorial (Z × X = Y), não em visualizador.
  const half = thickness / 2 + margin;
  const origin = w.add('IFCCARTESIANPOINT', [list([num(0), num(half), num(0)])]);
  const axisZ = direction(w, 0, -1, 0);
  const refX = direction(w, 1, 0, 0);
  const position = w.add('IFCAXIS2PLACEMENT3D', [ref(origin), ref(axisZ), ref(refX)]);
  const solid = w.add('IFCEXTRUDEDAREASOLID', [ref(profile), ref(position), ref(direction(w, 0, 0, 1)), num(2 * half)]);
  const shape3d = bodyShape(w, ctx, 'SweptSolid', [solid]);

  const opening = w.add('IFCOPENINGELEMENT', [gid(key), OMIT, stepString(name), OMIT, OMIT, ref(placement), ref(shape3d), OMIT, en('OPENING')]);
  return { profile, solid, shape: shape3d, opening };
}
