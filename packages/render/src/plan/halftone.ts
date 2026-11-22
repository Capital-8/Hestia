import { union, type MultiPolygon } from '@hestia/geom';
import { frameOfWall, openingBandRing, openingGeometry, pegadaDoComponente, type ResolvedLevel } from '@hestia/engine';
import { isCad, isComponent, isGeneric, isOpening, isWall, type Id, type Project } from '@hestia/model';
import { planViewOf } from './view.ts';
import { planIdOf } from './planContext.ts';
import { escadasDoNivel, lajesDoNivel, pisosDoNivel, rampasDoNivel, telhadosDoNivel } from './resolucao.ts';
import { roofFootprint } from './roofs.ts';
import { planFootprint } from './stairs.ts';
import { rampFootprint } from './ramps.ts';
import { structuralPegadas } from './structural.ts';
import { linhasGuardaCorpoPlanta } from './guardaCorpo.ts';
import { massaOps } from './massa.ts';
import { mix } from './color.ts';
import { planStyleOf } from './style.ts';
import { contornoDaCortina } from './cortina.ts';
import type { PlanInput } from './build.ts';
import type { PlanOps, StrokeOp } from './types.ts';

/** Meio-tom (decisão 0060 §4.3): peso de projeção mínimo do contorno, em px. */
const MEIO_TOM_PX = 1;
/** Quanto o traço do meio-tom se aproxima do papel: a cor sai do cinza da planta (`theme.inkSoft`), nunca cheia. */
const MEIO_TOM_PAPEL = 0.35;

/** Contorno da parede inteira na planta (sem a junção com as vizinhas), como o fantasma dos ocultos usa. */
function wallOutline(p: Project, geo: ResolvedLevel, id: Id, cutZ: number | undefined): MultiPolygon {
  const rw = geo.walls[id];
  if (!rw) return contornoDaCortina(p, geo.levelId, id, cutZ);
  return union(...rw.layers.map((l) => l.fragment));
}

/**
 * Desenho do meio-tom da disciplina (decisão 0060 §4.3): os elementos de `input.halftone` saem da geometria normal
 * (entram em `hidden` no `planContext`) e voltam aqui como contorno atenuado, por baixo do desenho normal. É a mesma
 * técnica do fantasma dos ocultos (`hiddenSelectionOps`, em planOverlay.ts/view.ts): reaproveita a geometria que a
 * planta já resolve (parede inteira, vão da abertura, pegada de piso/laje/telhado/escada/rampa e dos estruturais) e
 * desenha só o contorno, sem preenchimento nem hachura de corte. Peso de projeção mínimo (`MEIO_TOM_PX`) e cor
 * misturada ao cinza da planta.
 */
export function buildPlanHalftone(input: PlanInput): PlanOps {
  const vazio = (): PlanOps => ({ fills: [], strokes: [], labels: [] });
  if (!input.halftone?.size) return vazio();
  const p = input.project;
  const levelId = input.levelId;
  const theme = input.theme;
  const view = input.roofPlanMode === true ? null : planViewOf(p, levelId, planIdOf(input));
  // Oculto vence o tom (a mesma ordem do `visibilityOf`): não desenha de novo o que o Hide in View tirou. Fora do
  // intervalo de vista também não: a vista já o resolve como `hidden`.
  const ids = [...input.halftone].filter((id) => p.elements[id] && !input.hidden?.has(id) && !input.revealed?.has(id) && !view?.hidden.has(id) && view?.cls.get(id) !== 'hidden');
  if (ids.length === 0) return vazio();
  const cor = mix(theme.inkSoft, theme.bg, MEIO_TOM_PAPEL);
  const style: Omit<StrokeOp, 'pts' | 'closed'> = { widthPx: MEIO_TOM_PX, color: cor, alpha: 1 };
  const out = vazio();
  const traco = (pts: StrokeOp['pts'], closed: boolean): void => {
    out.strokes.push({ ...style, pts, closed });
  };
  const addRings = (m: MultiPolygon): void => {
    for (const ring of m.flat()) traco(ring, true);
  };
  // As mesmas pegadas do destaque do Reveal: piso, laje, telhado, escada, rampa e os estruturais (pilar, viga, sapata).
  const pegadas = new Map<Id, MultiPolygon>();
  for (const f of pisosDoNivel(p, levelId)) pegadas.set(f.floorId, f.polygon);
  for (const s of lajesDoNivel(p, levelId)) pegadas.set(s.slabId, s.polygon);
  for (const t of telhadosDoNivel(p, levelId)) pegadas.set(t.roofId, roofFootprint(t));
  for (const s of escadasDoNivel(p, levelId)) pegadas.set(s.id, planFootprint(s));
  for (const r of rampasDoNivel(p, levelId)) pegadas.set(r.id, rampFootprint(r));
  for (const [id, poly] of structuralPegadas(p, levelId)) pegadas.set(id, poly);
  for (const id of ids) {
    const e = p.elements[id];
    if (!e) continue;
    if (isWall(e)) {
      // Parede de outro nível que cruza o corte entra na vista do nível; as demais não têm geometria aqui.
      addRings(wallOutline(p, view?.geo ?? input.resolved, id, view?.cutZ));
      continue;
    }
    // A abertura não tem nível próprio: segue o da parede que a hospeda.
    if (isOpening(e)) {
      const host = p.elements[e.hostId];
      if (host?.kind !== 'wall' || host.levelId !== levelId) continue;
      const f = frameOfWall(p, e.hostId);
      if (!f) continue;
      traco(openingBandRing(openingGeometry(p, e, f)), true);
      continue;
    }
    // Só os elementos do nível (o conjunto de tons do app é do projeto inteiro).
    if (e.levelId !== levelId) continue;
    const m = pegadas.get(id);
    if (m) {
      addRings(m);
      continue;
    }
    if (isComponent(e)) {
      for (const ring of pegadaDoComponente(p, e).flat()) traco(ring, true);
      continue;
    }
    if (isGeneric(e) && e.outline?.length) {
      traco(e.outline, true);
      continue;
    }
    if (isCad(e)) for (const path of e.paths) if (path.pts.length >= 2) traco(path.pts, path.closed);
  }
  // Guarda-corpos e massas têm camada própria na planta (ver guardaCorpoCamada.ts e massaCamada.ts): o meio-tom deles
  // volta aqui com as mesmas linhas atenuadas, senão o `hidden` do `planContext` os apagaria das duas camadas.
  const selecionados = new Set(ids);
  const gc = new Set(ids.filter((id) => p.elements[id]?.kind === 'railing' && p.elements[id]?.levelId === levelId));
  if (gc.size > 0) {
    for (const l of linhasGuardaCorpoPlanta(p, levelId, view?.cutZ) ?? []) {
      if (!gc.has(l.guardaId) || l.pontos.length < 2) continue;
      traco(l.pontos.map((q) => ({ x: q.x, y: q.y })), l.papel !== 255);
    }
  }
  const massas = ids.filter((id) => p.elements[id]?.kind === 'mass');
  if (massas.length > 0) {
    const outras = new Set(Object.values(p.elements).filter((e) => e.kind === 'mass' && !selecionados.has(e.id)).map((e) => e.id));
    const paint = planStyleOf(p, levelId, input.viewport.zoom, input.areaPlan?.scale, planIdOf(input)).paint;
    for (const s of massaOps(p, levelId, outras, theme, input.dark, paint.mass, view?.cutZ).strokes) out.strokes.push({ ...s, widthPx: MEIO_TOM_PX, color: cor, alpha: 1 });
  }
  return out;
}
