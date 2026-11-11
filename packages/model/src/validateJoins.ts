import { arcFromSagitta, arcLocal, arcTangentAt, cross, dist, dot, len, norm, sub, type Arc, type Vec2 } from '@hestia/geom';
import { wallThicknessOf } from './wallType.ts';
import type { ValidationIssue } from './validate.ts';
import { unitsOf } from './units.ts';
import { formatQuantity } from './unitsFormat.ts';
import { wallBaseElevation, wallMaxHeight } from './queries.ts';
import type { Project, Wall } from './types.ts';

/** Tolerância de encontro das pontas: a mesma do motor (Project.settings.joinTolerance, padrão 2 cm). */
const joinTolOf = (p: Project): number => p.settings?.joinTolerance ?? 0.02;
/** Ângulo interno abaixo do qual a esquadria não tem solução limpa: avisa em vez de deixar o vão em silêncio (J-04). */
const ACUTE_CORNER_DEG = 60;
/** Domínio suportado das junções curvas (docs/08 §6.5). */
const MIN_RADIUS = 3;
const MIN_CORNER_DEG = 60;
const MAX_CORNER_DEG = 120;
/** Correntes tangentes entram como continuidade até 10° de deflexão (docs/08 §6.5). */
const TANGENT_KINK_DEG = 10;
const DEG = 180 / Math.PI;

const label = (w: Wall): string => (w.mark ? `"${w.mark}" (${w.id})` : `"${w.id}"`);

/** Distância de um ponto ao segmento a–b. */
function distToSegment(pt: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-18) return dist(pt, a);
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2));
  return dist(pt, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Pontas com "não unir" ligado que caem dentro do corpo de outra parede do mesmo nível: nada recorta a ponta contra
 * a outra, então as duas se sobrepõem (decide só a prioridade das camadas). É o caso típico de junção esquecida
 * desligada. Parede curva usa a corda como aproximação.
 */
export function unjoinedEndIssues(p: Project, walls: Wall[]): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const w of walls) {
    for (const end of ['a', 'b'] as const) {
      if (!(end === 'a' ? w.noJoinStart : w.noJoinEnd)) continue;
      const pt = end === 'a' ? w.a : w.b;
      for (const o of walls) {
        if (o.id === w.id || o.levelId !== w.levelId) continue;
        const half = (p.wallTypes[o.typeId] ? wallThicknessOf(p.wallTypes[o.typeId]!) : 0.2) / 2;
        if (distToSegment(pt, o.a, o.b) > half) continue;
        out.push({
          severity: 'warning',
          code: 'wall-end-unjoined',
          message: `A ${end === 'a' ? 'ponta inicial' : 'ponta final'} da parede "${w.mark || w.id}" está dentro da parede "${o.mark || o.id}" com a junção desligada: as duas se sobrepõem.`,
          elementId: w.id,
        });
        break;
      }
    }
  }
  return out;
}

interface End {
  wall: Wall;
  which: 'a' | 'b';
  at: Vec2;
  /** Direção unitária saindo do nó para dentro da parede. */
  dir: Vec2;
  arc: Arc | null;
}

const arcOf = (w: Wall): Arc | null => arcFromSagitta(w.a, w.b, w.sag);

function endInfo(w: Wall, which: 'a' | 'b'): End {
  const arc = arcOf(w);
  if (arc) {
    const t = arcTangentAt(arc, which === 'a' ? 0 : arc.length);
    const dir = which === 'a' ? t : { x: -t.x, y: -t.y };
    return { wall: w, which, at: which === 'a' ? w.a : w.b, dir, arc };
  }
  const u = norm(sub(w.b, w.a));
  return { wall: w, which, at: which === 'a' ? w.a : w.b, dir: which === 'a' ? u : { x: -u.x, y: -u.y }, arc };
}

const noJoin = (e: End): boolean => (e.which === 'a' ? e.wall.noJoinStart : e.wall.noJoinEnd);

/** Ângulo entre duas direções, em [0, π]. */
function angleBetween(a: Vec2, b: Vec2): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
}

/**
 * Quina fora do domínio: fora de 60°–120°, exceto a continuidade tangente (deflexão de até 10°, ou seja, ângulo
 * entre as direções de saída acima de 170°).
 */
function cornerOutOfDomain(angle: number): boolean {
  const deg = angle * DEG;
  if (deg >= MIN_CORNER_DEG - 1e-6 && deg <= MAX_CORNER_DEG + 1e-6) return false;
  return deg < 180 - TANGENT_KINK_DEG - 1e-6;
}

/** Motivos para uma junção com parede curva sair do domínio suportado (vazio = dentro). */
function domainReasons(ends: End[], angle: number, units: ReturnType<typeof unitsOf>): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const e of ends) {
    if (!e.arc || e.arc.radius >= MIN_RADIUS - 1e-9 || seen.has(e.wall.id)) continue;
    seen.add(e.wall.id);
    reasons.push(`a parede ${label(e.wall)} tem raio de ${formatQuantity(units, 'length', e.arc.radius)} (mínimo ${formatQuantity(units, 'length', 3)})`);
  }
  if (cornerOutOfDomain(angle)) reasons.push(`quina de ${formatQuantity(units, 'angle', angle)} fora de 60° a 120°`);
  return reasons;
}

function joinIssue(elementId: string, names: string[], reasons: string[]): ValidationIssue {
  return {
    severity: 'warning',
    code: 'wall-curve-join-domain',
    message: `Junção curva entre as paredes ${names.join(' e ')}: ${reasons.join('; ')}. Fora do domínio suportado, a junção pode deixar ponta ou anel extra.`,
    elementId,
  };
}

/** Comprimento do eixo da parede e posição (t, distância lateral) de um ponto. */
function axisPosition(w: Wall, p: Vec2): { t: number; lateral: number; length: number; arc: Arc | null } {
  const arc = arcOf(w);
  if (arc) {
    const l = arcLocal(arc, p);
    return { t: l.t, lateral: Math.abs(l.s), length: arc.length, arc };
  }
  const d = sub(w.b, w.a);
  const length = len(d);
  const u = norm(d);
  const rel = sub(p, w.a);
  return { t: dot(rel, u), lateral: Math.abs(cross(u, rel)), length, arc };
}

/** Avisos de junção curva fora do domínio suportado (CV-2): raio < 3 m ou quina fora de 60°–120°. */
export function curveJoinDomainIssues(p: Project, walls: Wall[]): ValidationIssue[] {
  const JOIN_TOL = joinTolOf(p);
  const out: ValidationIssue[] = [];
  const ends = walls.flatMap((w) => [endInfo(w, 'a'), endInfo(w, 'b')]);
  const grouped = new Set<End>();

  // Pares (ou nós) com pontas no mesmo ponto.
  for (let i = 0; i < ends.length; i++) {
    const a = ends[i]!;
    if (noJoin(a) || grouped.has(a)) continue;
    const partners: End[] = [];
    for (let j = i + 1; j < ends.length; j++) {
      const b = ends[j]!;
      if (b.wall.id === a.wall.id || noJoin(b)) continue;
      if (dist(a.at, b.at) <= JOIN_TOL) partners.push(b);
    }
    if (!partners.length) continue;
    grouped.add(a);
    for (const b of partners) grouped.add(b);
    if (!a.arc && partners.every((b) => !b.arc)) {
      for (const b of partners) {
        const interior = (180 * angleBetween(a.dir, b.dir)) / Math.PI;
        if (interior > 1 && interior < ACUTE_CORNER_DEG) {
          out.push({
            severity: 'warning',
            code: 'wall-acute-join',
            message: `Junção de "${a.wall.mark || a.wall.id}" com "${b.wall.mark || b.wall.id}" em ângulo de ${formatQuantity(unitsOf(p), 'angle', (interior * Math.PI) / 180)}: a esquadria não cabe e o corte fica reto, deixando vão. Abra o ângulo ou use outra junção.`,
            elementId: a.wall.id,
          });
        }
      }
      continue;
    }
    const reasons = new Set<string>();
    for (const b of partners) {
      for (const r of domainReasons([a, b], angleBetween(a.dir, b.dir), unitsOf(p))) reasons.add(r);
    }
    if (reasons.size) out.push(joinIssue(a.wall.id, [label(a.wall), ...partners.map((b) => label(b.wall))], [...reasons]));
  }

  // T: ponta de uma parede no corpo de outra (sem outra ponta no mesmo lugar).
  for (const e of ends) {
    if (grouped.has(e) || noJoin(e)) continue;
    let host: { wall: Wall; t: number; angle: number; arc: Arc | null } | null = null;
    for (const w of walls) {
      if (w.id === e.wall.id || w.levelId !== e.wall.levelId) continue;
      if (dist(e.at, w.a) <= JOIN_TOL || dist(e.at, w.b) <= JOIN_TOL) continue;
      const pos = axisPosition(w, e.at);
      if (pos.t < -JOIN_TOL || pos.t > pos.length + JOIN_TOL) continue;
      const half = (p.wallTypes[w.typeId] ? wallThicknessOf(p.wallTypes[w.typeId]!) : 0.2) / 2;
      if (pos.lateral > half + JOIN_TOL) continue;
      const tangent = pos.arc ? arcTangentAt(pos.arc, pos.t) : norm(sub(w.b, w.a));
      const raw = angleBetween(e.dir, tangent);
      // A parede atravessada tem as duas tangentes; vale a que melhor representa a continuidade (maior ângulo).
      host = { wall: w, t: pos.t, angle: Math.max(raw, Math.PI - raw), arc: pos.arc };
      break;
    }
    if (!host || (!e.arc && !host.arc)) continue;
    const reasons: string[] = [];
    for (const arc of [e.arc, host.arc]) {
      if (arc && arc.radius < MIN_RADIUS - 1e-9) {
        const owner = arc === e.arc ? e.wall : host.wall;
        const reason = `a parede ${label(owner)} tem raio de ${formatQuantity(unitsOf(p), 'length', arc.radius)} (mínimo ${formatQuantity(unitsOf(p), 'length', 3)})`;
        if (!reasons.includes(reason)) reasons.push(reason);
      }
    }
    if (cornerOutOfDomain(host.angle)) reasons.push(`quina de ${formatQuantity(unitsOf(p), 'angle', host.angle)} fora de 60° a 120°`);
    if (reasons.length) out.push(joinIssue(e.wall.id, [label(e.wall), label(host.wall)], reasons));
  }

  return out;
}

/** Ponto cai sobre o trecho do eixo de `w` (dentro dos extremos, não só perto do ponto final), a até `tol` lateralmente. */
function insideAxis(pt: Vec2, w: Wall, tol: number): boolean {
  const d = sub(w.b, w.a);
  const l = len(d);
  if (l < 1e-9) return false;
  const t = dot(sub(pt, w.a), d) / l;
  if (t <= 0 || t >= l) return false;
  return Math.abs(cross(norm(d), sub(pt, w.a))) <= tol;
}

/**
 * Pontas quase encostadas (J-04): mais longe que a tolerância (não unem) e até duas tolerâncias. Sem aviso, a ponta
 * fica solta sem explicação. Só conta paredes que se encontram em altura.
 */
export function nearMissIssues(p: Project, walls: Wall[]): ValidationIssue[] {
  const JOIN_TOL = joinTolOf(p);
  const out: ValidationIssue[] = [];
  const ends = walls.flatMap((w) => [endInfo(w, 'a'), endInfo(w, 'b')]);
  const zRange = (w: Wall): [number, number] => {
    const z0 = wallBaseElevation(p, w);
    return [z0, z0 + wallMaxHeight(p, w)];
  };
  for (let i = 0; i < ends.length; i++) {
    const a = ends[i]!;
    if (noJoin(a)) continue;
    for (let j = i + 1; j < ends.length; j++) {
      const b = ends[j]!;
      if (b.wall.id === a.wall.id || b.wall.levelId !== a.wall.levelId || noJoin(b)) continue;
      const d = dist(a.at, b.at);
      if (d <= JOIN_TOL || d > 2 * JOIN_TOL) continue;
      // Ponta que cai sobre o eixo da outra parede é sobreposição (aviso próprio), não quase-encosto.
      if (insideAxis(a.at, b.wall, 2 * JOIN_TOL) || insideAxis(b.at, a.wall, 2 * JOIN_TOL)) continue;
      const za = zRange(a.wall);
      const zb = zRange(b.wall);
      if (!(za[0] < zb[1] - 1e-6 && zb[0] < za[1] - 1e-6)) continue;
      out.push({
        severity: 'warning',
        code: 'wall-end-near-miss',
        message: `A ponta de "${a.wall.mark || a.wall.id}" está a ${formatQuantity(unitsOf(p), 'smallLength', d)} da ponta de "${b.wall.mark || b.wall.id}": quase encostada, não une (tolerância de ${formatQuantity(unitsOf(p), 'smallLength', JOIN_TOL)}). Encoste as pontas ou ajuste a tolerância do projeto.`,
        elementId: a.wall.id,
      });
    }
  }
  return out;
}
