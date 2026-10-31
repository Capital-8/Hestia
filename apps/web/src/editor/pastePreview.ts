import type { Vec2 } from '@hestia/geom';
import {
  ProjectStore,
  isCad,
  isCeiling,
  isFloor,
  isGeneric,
  isRamp,
  isRoof,
  isSlab,
  isStair,
  isWall,
  totalThickness,
  type Element,
  type Id,
  type Project,
  type StairLanding,
  type StairRun,
} from '@hestia/model';
import { pasteAlignedCommand, previewPasteLevels, type ClipBuffer } from '@hestia/tools';

/** Ponto (m) no mundo. */
export interface Ponto3D {
  x: number;
  y: number;
  z: number;
}

/** Caixa alinhada aos eixos (m), no mesmo formato do `THREE.Box3` que o canvas usa. */
export interface CaixaDaPrevia {
  min: Ponto3D;
  max: Ponto3D;
}

/** Retrato da câmera orbital para o cancelamento da prévia (posição, alvo e zoom). */
export interface CameraDaPrevia {
  azimuth: number;
  elevation: number;
  distance: number;
  ortho: boolean;
  target: Ponto3D;
}

/** O mínimo mutável de uma `OrbitCamera` que o guardar/restaurar usa. */
export interface CameraOrbital {
  azimuth: number;
  elevation: number;
  distance: number;
  ortho: boolean;
  target: Ponto3D & { set(x: number, y: number, z: number): unknown };
  apply(): void;
  cancelAnimation?(): void;
}

/**
 * Construtor do rascunho da prévia. É a assinatura de `previewPasteLevels` de `@hestia/tools`
 * (`W1`); enquanto ela não estiver exportada pelo pacote, o padrão é `montarPreviaProvisoria` e
 * o integrador pode passar a função definitiva ou um `Project` já montado sem mexer na cena.
 */
export type MontadorDePrevia = (p: Project, clip: ClipBuffer, levelIds: Id[], o?: { link?: boolean }) => Project;

/** Distância mínima/máxima do zoom da órbita (a mesma de `OrbitCamera`). */
const DISTANCIA = { min: 0.5, max: 600 };

/**
 * Confirmação da prévia: o canvas deve manter o enquadramento dos fantasmas (o resultado acabou de entrar no
 * modelo). No cancelamento, a câmera volta para antes do comando. O sinal é consumido uma vez pelo canvas.
 */
let manterCameraAoFechar = false;
export function manterCameraDaPrevia(): void { manterCameraAoFechar = true; }
export function consumirManterCameraDaPrevia(): boolean {
  const manter = manterCameraAoFechar;
  manterCameraAoFechar = false;
  return manter;
}

/**
 * Monta o rascunho do Colar alinhado para os níveis dados. Níveis inexistentes e repetidos são
 * descartados; sem nenhum nível válido, devolve null (a prévia não abre).
 *
 * A função de montagem é injetável: `previewPasteLevels` do `@hestia/tools` quando o motor
 * entregar o rascunho completo (forros, genéricos e CAD). Sem ela, o provisório abaixo já cobre
 * paredes, aberturas, pisos, lajes, telhados, escadas, rampas e ambientes com o comando de colar
 * existente.
 */
export function montarPrevia(
  p: Project,
  clip: ClipBuffer,
  levelIds: readonly Id[],
  link: boolean,
  montar: MontadorDePrevia = previewPasteLevels,
): Project | null {
  const niveis = [...new Set(levelIds)].filter((id) => p.levels.some((l) => l.id === id));
  if (!niveis.length) return null;
  return montar(p, clip, niveis, { link });
}

/**
 * Rascunho provisório: aplica o comando de colar já existente, nível a nível, num `ProjectStore`
 * isolado. Serve para a prévia funcionar antes de `previewPasteLevels` (W1); o resultado não toca
 * no projeto real e some quando o integrador passar o montador definitivo.
 */
export function montarPreviaProvisoria(p: Project, clip: ClipBuffer, levelIds: readonly Id[], _o?: { link?: boolean }): Project {
  const store = new ProjectStore(p);
  for (const levelId of new Set(levelIds)) {
    const r = pasteAlignedCommand(store.project, clip, levelId);
    if (r) store.exec(r.command);
  }
  return store.project;
}

/**
 * Caixa da prévia: a seleção de origem **e** as cópias em cada nível de destino. Os X/Y são os
 * mesmos (o colar preserva a posição); o Z de cada cópia é a cota do elemento relativa ao nível
 * de origem deslocada para o nível de destino.
 */
export function caixaDaPrevia(p: Project, clip: ClipBuffer, levelIds: readonly Id[]): CaixaDaPrevia | null {
  const caixa = caixaVazia();
  const destinos = [...new Set(levelIds)].filter((id) => p.levels.some((l) => l.id === id));
  for (const e of elementosDoBuffer(clip)) {
    unir(caixa, caixaDeElemento(p, e, 0));
    const origem = elevacaoDoNivel(p, 'levelId' in e ? e.levelId : '');
    for (const destino of destinos) unir(caixa, caixaDeElemento(p, e, elevacaoDoNivel(p, destino) - origem));
  }
  return caixaTemConteudo(caixa) ? { min: { ...caixa.min }, max: { ...caixa.max } } : null;
}

/** Guarda posição, alvo e zoom da câmera (cópia só de números; nenhum objeto do three vai para o estado). */
export function guardarCamera(o: CameraOrbital): CameraDaPrevia {
  return {
    azimuth: o.azimuth,
    elevation: o.elevation,
    distance: o.distance,
    ortho: o.ortho,
    target: { x: o.target.x, y: o.target.y, z: o.target.z },
  };
}

/** Restaura a câmera guardada (o cancelamento da prévia volta à vista de onde o comando abriu). */
export function restaurarCamera(o: CameraOrbital, c: CameraDaPrevia | null): boolean {
  if (!c) return false;
  o.cancelAnimation?.();
  o.azimuth = c.azimuth;
  o.elevation = c.elevation;
  o.distance = Math.max(DISTANCIA.min, Math.min(DISTANCIA.max, c.distance));
  o.ortho = c.ortho;
  o.target.set(c.target.x, c.target.y, c.target.z);
  o.apply();
  return true;
}

// ---- caixa: elementos do clipboard em coordenadas absolutas ----

interface CaixaMutavel extends CaixaDaPrevia {
  vazia: boolean;
}

const caixaVazia = (): CaixaMutavel => ({ min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity }, vazia: true });

const caixaTemConteudo = (c: CaixaMutavel): boolean => !c.vazia;

function unir(c: CaixaMutavel, outra: CaixaDaPrevia | null): void {
  if (!outra) return;
  c.min.x = Math.min(c.min.x, outra.min.x);
  c.min.y = Math.min(c.min.y, outra.min.y);
  c.min.z = Math.min(c.min.z, outra.min.z);
  c.max.x = Math.max(c.max.x, outra.max.x);
  c.max.y = Math.max(c.max.y, outra.max.y);
  c.max.z = Math.max(c.max.z, outra.max.z);
  c.vazia = false;
}

function elevacaoDoNivel(p: Project, levelId: Id): number {
  return p.levels.find((l) => l.id === levelId)?.elevation ?? 0;
}

/** Elementos do buffer, incluindo os opcionais que o motor do colar passa a guardar (W1/W2). */
function elementosDoBuffer(clip: ClipBuffer): Element[] {
  const extras = clip as ClipBuffer & { ceilings?: Element[]; generics?: Element[]; cad?: Element[] };
  return [
    ...clip.walls,
    ...clip.openings,
    ...clip.floors,
    ...clip.slabs,
    ...clip.roofs,
    ...(clip.stairs ?? []),
    ...(clip.ramps ?? []),
    ...(clip.rooms ?? []),
    ...(extras.ceilings ?? []),
    ...(extras.generics ?? []),
    ...(extras.cad ?? []),
  ];
}

/** Caixa de um elemento na cota do próprio nível, deslocada por `deltaZ` (a cópia em outro nível). */
function caixaDeElemento(p: Project, e: Element, deltaZ: number): CaixaDaPrevia | null {
  const zNivel = elevacaoDoNivel(p, 'levelId' in e ? e.levelId : '') + deltaZ;
  const pontos: Vec2[] = [];
  let z0 = zNivel;
  let z1 = zNivel;
  if (isWall(e)) {
    pontos.push(e.a, e.b);
    const tipo = p.wallTypes[e.typeId];
    const margem = tipo ? totalThickness(tipo) / 2 : 0;
    z0 = zNivel + e.baseOffset;
    z1 = e.topLevelId ? elevacaoDoNivel(p, e.topLevelId) + deltaZ + e.topOffset : z0 + e.height;
    const b = caixaDosPontos(pontos, z0, z1);
    return b && { min: { x: b.min.x - margem, y: b.min.y - margem, z: b.min.z }, max: { x: b.max.x + margem, y: b.max.y + margem, z: b.max.z } };
  }
  if (isFloor(e)) {
    pontos.push(...e.boundary, ...e.holes.flat());
    z1 = zNivel + e.heightOffset;
    z0 = z1 - espessura(p.floorTypes[e.typeId]?.layers);
  } else if (isSlab(e)) {
    pontos.push(...e.boundary, ...e.holes.flat());
    z1 = zNivel + e.heightOffset;
    z0 = z1 - espessura(p.slabTypes[e.typeId]?.layers);
  } else if (isCeiling(e)) {
    pontos.push(...e.boundary, ...e.holes.flat());
    z1 = zNivel + e.heightOffset;
    z0 = z1 - espessura(p.ceilingTypes[e.typeId]?.layers);
  } else if (isRoof(e)) {
    pontos.push(...e.boundary, ...e.holes.flat());
    z0 = zNivel + e.heightOffset;
    const vao = Math.max(pontosX(pontos), pontosY(pontos));
    z1 = z0 + Math.max(0, e.slopePercent) / 100 * (e.shape === 'extrusion' ? 1 : vao / 2);
  } else if (isStair(e) || isRamp(e)) {
    pontos.push(...pontosDosComponentes(e.components), ...(e.freePath ?? []));
    z0 = zNivel + e.baseOffset;
    z1 = e.topLevelId ? elevacaoDoNivel(p, e.topLevelId) + deltaZ + e.topOffset : z0 + e.height;
  } else if (isGeneric(e)) {
    return caixaDaMalha(e.mesh.positions, deltaZ);
  } else if (isCad(e)) {
    for (const path of e.paths) pontos.push(...path.pts);
    for (const t of e.texts) pontos.push(t.at);
    z0 = zNivel + (e.offsetZ ?? 0);
    z1 = z0;
  } else {
    return null;
  }
  return caixaDosPontos(pontos, z0, z1);
}

function caixaDosPontos(pontos: readonly Vec2[], z0: number, z1: number): CaixaDaPrevia | null {
  if (!pontos.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pontos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: { x: minX, y: minY, z: Math.min(z0, z1) }, max: { x: maxX, y: maxY, z: Math.max(z0, z1) } };
}

function caixaDaMalha(positions: readonly number[], deltaZ: number): CaixaDaPrevia | null {
  if (positions.length < 3) return null;
  const c = caixaVazia();
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = (positions[i + 2] ?? 0) + deltaZ;
    unir(c, { min: { x, y, z }, max: { x, y, z } });
  }
  return caixaTemConteudo(c) ? c : null;
}

function pontosDosComponentes(components: readonly (StairRun | StairLanding)[]): Vec2[] {
  const pontos: Vec2[] = [];
  for (const c of components) {
    if (c.kind === 'landing') {
      for (const curva of c.boundary) pontos.push(curva.a, curva.b);
    } else {
      for (const curva of [...c.boundaryLeft, ...c.boundaryRight]) pontos.push(curva.a, curva.b);
    }
  }
  return pontos;
}

function pontosX(pontos: readonly Vec2[]): number {
  return pontos.length ? Math.max(...pontos.map((p) => p.x)) - Math.min(...pontos.map((p) => p.x)) : 0;
}

function pontosY(pontos: readonly Vec2[]): number {
  return pontos.length ? Math.max(...pontos.map((p) => p.y)) - Math.min(...pontos.map((p) => p.y)) : 0;
}

function espessura(layers: readonly { thickness: number }[] | undefined): number {
  return layers?.reduce((s, l) => s + l.thickness, 0) ?? 0;
}
