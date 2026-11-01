import { cross, dist, dot, norm, sub, type Vec2 } from '@hestia/geom';
import { curveJoinDomainIssues, nearMissIssues, unjoinedEndIssues } from './validateJoins.ts';
import { floorIssues } from './validateFloors.ts';
import { slabIssues } from './validateSlabs.ts';
import { roofIssues } from './validateRoofs.ts';
import { stairIssues } from './validateStairs.ts';
import { rampIssues } from './validateRamps.ts';
import { roomIssues } from './validateRooms.ts';
import { profileError } from './profile.ts';
import { wallBaseElevation, wallTopElevation } from './queries.ts';
import { viewRangeIssues } from './viewRange.ts';
import { graphicsIssues, graphicsOf, levelGraphicsOf, sectionGraphicsOf, view3dOf } from './graphics.ts';
import { sectionRefIssues, sectionViewIssue } from './sectionView.ts';
import { projectSheets } from './sheet.ts';
import { viewSourceIssue } from './sheetCommands.ts';
import { planAnnotationsOf } from './areaPlan.ts';
import { isOpening, isWall, type Element, type Id, type Level, type Opening, type Project, type Wall } from './types.ts';
import { openingTypeById } from './openingNominal.ts';
import { formatQuantity } from './unitsFormat.ts';
import { unitsOf } from './units.ts';

/** `info`: aviso informativo (não é problema; ex.: parede anexada só em parte ao piso). */
export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Código estável para filtrar e testar (ex.: 'wall-overlap'). */
  code: string;
  /** Mensagem em português do Brasil, pronta para a interface. */
  message: string;
  elementId?: string;
  /** Elementos envolvidos quando o aviso é de uma relação (ex.: escada e parede); o "Ir para" usa `elementId`. */
  ids?: string[];
}

/** Abaixo disso a parede não tem direção definida. */
const MIN_WALL_LENGTH = 0.001;
/** Tolerância numérica para comparar posições ao longo da parede (1 µm). */
const EPS = 1e-6;
/** Trecho comum mínimo para duas paredes colineares serem consideradas sobrepostas (item C14). */
const WALL_OVERLAP_MIN = 0.05;
/** Ângulo máximo entre eixos para serem "praticamente colineares" (1°). */
const COLLINEAR_ANGLE = (1 * Math.PI) / 180;
/** Distância lateral máxima entre eixos para serem "praticamente colineares" (1 cm). */
const COLLINEAR_OFFSET = 0.01;

const label = (e: Element): string => ('mark' in e && e.mark ? `"${e.mark}" (${e.id})` : `"${e.id}"`);
/** Nome do elemento nas mensagens (mesma forma dos avisos): `"marca" (id)` ou `"id"`. */
export const elementLabel = label;

function wallIssues(p: Project, w: Wall): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const name = label(w);
  const len = dist(w.a, w.b);
  if (len < MIN_WALL_LENGTH) {
    out.push({
      severity: 'error',
      code: 'wall-zero-length',
      message: `Parede ${name} tem comprimento de ${formatQuantity(unitsOf(p), 'smallLength', len)}; o mínimo é ${formatQuantity(unitsOf(p), 'smallLength', 0.001)}.`,
      elementId: w.id,
    });
  }
  if (!p.wallTypes[w.typeId]) {
    out.push({
      severity: 'error',
      code: 'wall-type-missing',
      message: `Parede ${name} usa o tipo "${w.typeId}", que não existe no projeto.`,
      elementId: w.id,
    });
  }
  if (w.topProfile) {
    const err = profileError(w.topProfile);
    if (err) out.push({ severity: 'error', code: 'wall-profile-invalid', message: `Parede ${name}: perfil superior inválido — ${err}.`, elementId: w.id });
    if (w.sag !== 0) out.push({ severity: 'warning', code: 'wall-profile-arc', message: `Parede ${name} é curva: o perfil superior só vale em parede reta e foi ignorado.`, elementId: w.id });
  }
  const levelOk = p.levels.some((l) => l.id === w.levelId);
  if (!levelOk) {
    out.push({
      severity: 'error',
      code: 'level-missing',
      message: `Parede ${name} está no nível "${w.levelId}", que não existe.`,
      elementId: w.id,
    });
  }
  const topOk = w.topLevelId === null || p.levels.some((l) => l.id === w.topLevelId);
  if (!topOk) {
    out.push({
      severity: 'error',
      code: 'top-level-missing',
      message: `Parede ${name} tem topo no nível "${w.topLevelId}", que não existe.`,
      elementId: w.id,
    });
  }
  // A altura só é conferida quando os níveis de base e de topo existem; senão o cálculo usaria cota 0.
  if (levelOk && topOk) {
    const h = wallTopElevation(p, w) - wallBaseElevation(p, w);
    if (!(h > 0)) {
      out.push({
        severity: 'error',
        code: 'wall-height-invalid',
        message: `Altura da parede ${name} é ${formatQuantity(unitsOf(p), 'length', h)}; precisa ser maior que zero.`,
        elementId: w.id,
      });
    }
  }
  return out;
}

function openingIssues(p: Project, o: Opening): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const name = label(o);
  const host = p.elements[o.hostId];
  const type = openingTypeById(p, o.typeId);
  if (!isWall(host)) {
    out.push({
      severity: 'error',
      code: 'opening-host-missing',
      message: `Abertura ${name} não tem parede anfitriã (hostId "${o.hostId}").`,
      elementId: o.id,
    });
  }
  if (!type) {
    out.push({
      severity: 'error',
      code: 'opening-type-missing',
      message: `Abertura ${name} usa o tipo "${o.typeId}", que não existe no projeto.`,
      elementId: o.id,
    });
  }
  if (isWall(host) && type) {
    const L = dist(host.a, host.b);
    const half = type.width / 2;
    const start = o.offset - half;
    const end = o.offset + half;
    if (start < -EPS || end > L + EPS) {
      out.push({
        severity: 'warning',
        code: 'opening-out-of-wall',
        message: `Abertura ${name} não cabe na parede ${label(host)}: vão de ${formatQuantity(unitsOf(p), 'length', start)} a ${formatQuantity(unitsOf(p), 'length', end)}, parede com ${formatQuantity(unitsOf(p), 'length', L)}.`,
        elementId: o.id,
      });
    }
  }
  return out;
}

/** Duas aberturas da mesma parede cujos vãos se cruzam (warning). */
function openingOverlaps(p: Project, openings: Opening[]): ValidationIssue[] {
  const byHost = new Map<Id, Array<{ o: Opening; lo: number; hi: number }>>();
  for (const o of openings) {
    const type = openingTypeById(p, o.typeId);
    if (!type || !isWall(p.elements[o.hostId])) continue;
    const list = byHost.get(o.hostId) ?? [];
    list.push({ o, lo: o.offset - type.width / 2, hi: o.offset + type.width / 2 });
    byHost.set(o.hostId, list);
  }
  const out: ValidationIssue[] = [];
  for (const [hostId, list] of byHost) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i]!;
        const y = list[j]!;
        if (Math.min(x.hi, y.hi) - Math.max(x.lo, y.lo) > EPS) {
          out.push({
            severity: 'warning',
            code: 'opening-overlap',
            message: `Aberturas ${label(x.o)} e ${label(y.o)} se sobrepõem na parede ${hostId}.`,
            elementId: y.o.id,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Comprimento do trecho comum de duas paredes colineares e distância lateral medida no meio desse trecho.
 * Devolve null quando as paredes não são praticamente colineares ou não se sobrepõem.
 */
function collinearOverlap(A: Wall, B: Wall): { length: number } | null {
  const uA = norm(sub(A.b, A.a));
  const uB = norm(sub(B.b, B.a));
  // Ângulo entre as retas (sentido ignorado: paredes em sentidos opostos também se sobrepõem).
  const angle = Math.atan2(Math.abs(cross(uA, uB)), Math.abs(dot(uA, uB)));
  if (angle >= COLLINEAR_ANGLE) return null;
  const LA = dist(A.a, A.b);
  const tB1 = dot(sub(B.a, A.a), uA);
  const tB2 = dot(sub(B.b, A.a), uA);
  const lo = Math.max(0, Math.min(tB1, tB2));
  const hi = Math.min(LA, Math.max(tB1, tB2));
  const length = hi - lo;
  if (length <= WALL_OVERLAP_MIN) return null;
  const mid: Vec2 = { x: A.a.x + uA.x * ((lo + hi) / 2), y: A.a.y + uA.y * ((lo + hi) / 2) };
  const lateral = Math.abs(cross(uB, sub(mid, B.a)));
  return lateral < COLLINEAR_OFFSET ? { length } : null;
}

/** Paredes colineares do mesmo nível com trechos em comum (item C14, warning). */
function wallOverlaps(walls: Wall[]): ValidationIssue[] {
  const valid = walls.filter((w) => dist(w.a, w.b) >= MIN_WALL_LENGTH);
  const out: ValidationIssue[] = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const A = valid[i]!;
      const B = valid[j]!;
      if (A.levelId !== B.levelId) continue;
      const hit = collinearOverlap(A, B);
      if (!hit) continue;
      out.push({
        severity: 'warning',
        code: 'wall-overlap',
        message: `Paredes ${label(A)} e ${label(B)} se sobrepõem por ${Math.round(hit.length * 100)} cm no mesmo nível.`,
        elementId: A.id,
      });
    }
  }
  return out;
}

/** Intervalo de vista de cada nível (decisão 0013): uma mensagem por violação. */
function levelIssues(l: Level): ValidationIssue[] {
  const problems = l.viewRange ? viewRangeIssues(l.viewRange) : ['Falta o intervalo de vista do nível.'];
  return problems.map((message) => ({
    severity: 'error' as const,
    code: 'level-view-range-invalid',
    message: `Nível "${l.name}" (${l.id}): ${message}`,
  }));
}

/** Gráficos salvos com valor inválido (decisão 0015): uma mensagem por violação, com o nome do nível ou "Vista 3D". */
function graphicsProblems(p: Project): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const add = (prefix: string, msgs: string[]): void => {
    for (const m of msgs) out.push({ severity: 'error', code: 'graphics-invalid', message: `${prefix}${m}` });
  };
  add('Gráficos do projeto: ', graphicsIssues(graphicsOf(p)));
  for (const l of p.levels) add(`Nível "${l.name}" (${l.id}): `, graphicsIssues(levelGraphicsOf(p, l.id)));
  add('Vista 3D: ', graphicsIssues(view3dOf(p)));
  add('Corte/elevação: ', graphicsIssues(sectionGraphicsOf(p)));
  return out;
}

/** Vistas de corte/elevação: geometria, nomes repetidos e referências de parede que sumiram. */
function viewProblems(p: Project): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const byId = new Set<string>();
  const byName = new Map<string, string>();
  for (const v of p.views) {
    const name = v.name.trim() || v.id;
    if (byId.has(v.id)) {
      out.push({ severity: 'error', code: 'view-id-duplicate', message: `A vista "${name}" repete o id "${v.id}".`, elementId: v.id });
    }
    byId.add(v.id);
    const issue = sectionViewIssue(v);
    if (issue) out.push({ severity: 'error', code: 'view-invalid', message: `Vista "${name}": ${issue}`, elementId: v.id });
    const other = byName.get(v.name);
    if (other) {
      out.push({ severity: 'error', code: 'view-name-duplicate', message: `As vistas com ids "${other}" e "${v.id}" usam o mesmo nome "${v.name}".`, elementId: v.id, ids: [other, v.id] });
    } else byName.set(v.name, v.id);
    for (const msg of sectionRefIssues(p, v)) out.push({ severity: 'warning', code: 'view-ref-missing', message: msg, elementId: v.id });
  }
  return out;
}

/** Pranchas: viewport apontando para nível ou corte que não existe mais. */
function sheetProblems(p: Project): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const s of projectSheets(p)) {
    for (const vp of s.viewports) {
      const issue = viewSourceIssue(p, vp.view);
      if (issue) out.push({ severity: 'error', code: 'sheet-view-missing', message: `Prancha "${s.number}": ${issue.toLowerCase()}.`, ids: [s.id, vp.id] });
    }
  }
  return out;
}

/** Plantas de área: etiqueta de elemento apontando para elemento que não existe mais (aviso, não erro). */
function areaPlanProblems(p: Project): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const plan of p.areaPlans ?? []) {
    for (const tag of planAnnotationsOf(plan).tags) {
      if (p.elements[tag.hostId]) continue;
      out.push({
        severity: 'warning',
        code: 'area-plan-tag-host-missing',
        message: `Planta de área "${plan.name}": a etiqueta "${tag.id}" aponta para o elemento "${tag.hostId}", que não existe.`,
        elementId: tag.id,
      });
    }
  }
  return out;
}

/** Verificação do modelo: devolve todos os problemas, sem alterar o projeto. */
export function validateProject(p: Project): ValidationIssue[] {
  const elements = Object.values(p.elements);
  const walls = elements.filter(isWall);
  const openings = elements.filter(isOpening);
  return [
    ...graphicsProblems(p),
    ...viewProblems(p),
    ...sheetProblems(p),
    ...areaPlanProblems(p),
    ...p.levels.flatMap((l) => levelIssues(l)),
    ...walls.flatMap((w) => wallIssues(p, w)),
    ...openings.flatMap((o) => openingIssues(p, o)),
    ...openingOverlaps(p, openings),
    ...wallOverlaps(walls),
    ...unjoinedEndIssues(p, walls),
    ...nearMissIssues(p, walls),
    ...curveJoinDomainIssues(p, walls),
    ...floorIssues(p),
    ...slabIssues(p),
    ...roofIssues(p),
    ...stairIssues(p),
    ...rampIssues(p),
    ...roomIssues(p),
  ];
}
