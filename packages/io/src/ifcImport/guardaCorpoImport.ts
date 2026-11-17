import { makeGuardaCorpo, type GuardaCorpo, type Id } from '@hestia/model';
import { hull2, rectangleAxis } from './geometry.ts';
import { bodyFor, levelAt } from './genericImport.ts';
import { propertiesOf } from './psets.ts';
import type { Pt2 } from './ifc.ts';
import type { Ctx } from './mapping.ts';
import type { StepEntity } from './step.ts';
import { t } from '../i18n.ts';

/**
 * `IFCRAILING` como guarda-corpo nativo de trecho reto. Só converte quando a peça é, de fato, um guarda-corpo ou corrimão
 * de piso a topo: `PredefinedType` HANDRAIL/GUARDRAIL/BALUSTRADE, ou (IFC2X3 e `NOTDEFINED`/`USERDEFINED`, que não dizem
 * nada) nome indicando corrimão/guarda-corpo. Nomes de suporte, console e fixação NUNCA entram: o Revit exporta o
 * "suporte metálico" do corrimão como `IFCRAILING`, e esses seguem genéricos.
 * A planta deduzida é um único trecho reto: a caixa mínima da malha em planta (comprimento >= 0,5 m, no máximo 0,4 m de
 * largura e 4x mais comprida que larga), altura entre 0,6 e 1,6 m e topo nivelado nas duas metades (guarda-corpo de rampa
 * ou escada inclinado fica genérico). Em L, em curva, em vários trechos ou só a barra do corrimão (sem altura de
 * piso a topo) fica genérico, porque o caminho de planta não seria confiável.
 * O tipo vem do `PredefinedType`: HANDRAIL = corrimão de parede, o resto = balaústres. O `GuardaCorpo` não tem campo para
 * o nome/psets do IFC: o nome de origem fica no comentário.
 */

const SUPPORT = /suporte|support|bracket|console|fixa[cç]|m[aã]o[- ]francesa|cantoneira|apoio/i;
const RAILING_NAME = /corrim|guarda[- ]?corpo|balaustr|balaústr|parapeito|handrail|guard ?rail|balustrade|railing/i;
const PREDEFINED = new Set(['HANDRAIL', 'GUARDRAIL', 'BALUSTRADE']);

const MIN_HEIGHT = 0.6;
const MAX_HEIGHT = 1.6;
const LEVEL_TOL = 0.05;

function isRailing(ctx: Ctx, e: StepEntity): boolean {
  const name = `${ctx.f.text(e, 2)} ${ctx.f.text(ctx.typeOf.get(e.id), 2)}`;
  if (SUPPORT.test(name)) return false;
  const pre = ctx.f.enum(e, 8) || ctx.f.enum(ctx.typeOf.get(e.id), 9);
  if (PREDEFINED.has(pre)) return true;
  if (pre && pre !== 'NOTDEFINED' && pre !== 'USERDEFINED') return false;
  return RAILING_NAME.test(name);
}

interface Trace {
  a: Pt2;
  b: Pt2;
  z0: number;
  z1: number;
}

/** Trecho reto em planta, ou null (côncavo/curvo/inclinado/fora da faixa). */
export function straightTraceOf(tris: number[]): Trace | null {
  if (tris.length < 9) return null;
  const pts: Pt2[] = [];
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i + 2 < tris.length; i += 3) {
    pts.push({ x: tris[i]!, y: tris[i + 1]! });
    z0 = Math.min(z0, tris[i + 2]!);
    z1 = Math.max(z1, tris[i + 2]!);
  }
  const height = z1 - z0;
  if (!(height >= MIN_HEIGHT && height <= MAX_HEIGHT)) return null;
  const rect = rectangleAxis(hull2(pts));
  if (!rect || rect.length < 0.5 || rect.thickness > 0.4 || rect.length < 4 * rect.thickness) return null;
  const dx = (rect.b.x - rect.a.x) / rect.length;
  const dy = (rect.b.y - rect.a.y) / rect.length;
  // Topo nivelado: a cota máxima de cada metade (ao longo do eixo) tem que bater.
  const mid = rect.length / 2;
  let top0 = -Infinity;
  let top1 = -Infinity;
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const u = (tris[i]! - rect.a.x) * dx + (tris[i + 1]! - rect.a.y) * dy;
    if (u < mid) top0 = Math.max(top0, tris[i + 2]!);
    else top1 = Math.max(top1, tris[i + 2]!);
  }
  if (!Number.isFinite(top0) || !Number.isFinite(top1) || Math.abs(top0 - top1) > LEVEL_TOL) return null;
  return { a: rect.a, b: rect.b, z0, z1 };
}

function typeFor(ctx: Ctx, e: StepEntity): Id | null {
  const pre = ctx.f.enum(e, 8) || ctx.f.enum(ctx.typeOf.get(e.id), 9);
  const tipos = ctx.p.tiposGuardaCorpo ?? {};
  const want = pre === 'HANDRAIL' ? 'gct_corrimao_parede' : 'gct_balaustres';
  return tipos[want] ? want : (Object.keys(tipos)[0] ?? null);
}

/** Converte os guarda-corpos dedutíveis; o resto (suportes, trechos em L, barras soltas) segue para o fallback genérico. */
export function addGuardaCorpos(ctx: Ctx): void {
  for (const e of ctx.f.byType('IFCRAILING')) {
    if (ctx.handled.has(e.id) || !ctx.f.ref(e, 5) || ctx.f.ent(e, 6)?.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
    if (!isRailing(ctx, e)) continue;
    const typeId = typeFor(ctx, e);
    const trace = typeId ? straightTraceOf(bodyFor(ctx, e).tris) : null;
    const name = ctx.f.text(e, 2).trim() || e.type;
    if (!typeId || !trace) {
      ctx.warn(t(ctx.lang, 'io_ifc_warn_railing_fallback', { name }));
      continue;
    }
    const level = levelAt(ctx, trace.z0);
    const tipo = ctx.p.tiposGuardaCorpo![typeId]!;
    const height = trace.z1 - trace.z0;
    const id = `gc_${ctx.f.text(e, 0) || `#${e.id}`}`;
    const g: Omit<GuardaCorpo, 'order'> = makeGuardaCorpo({
      id,
      levelId: level.id,
      typeId,
      hospedeiro: {
        tipo: 'manual',
        uso: 'livre',
        caminho: [
          { x: trace.a.x, y: trace.a.y, dz: 0 },
          { x: trace.b.x, y: trace.b.y, dz: 0 },
        ],
        fechado: false,
        ladoDeslocamento: 'centro',
      },
      cotaBase: trace.z0 - level.elevation,
      deslocamento: 0,
      altura: Math.abs(height - tipo.altura) > 0.02 ? Math.round(height * 1000) / 1000 : null,
      mark: ctx.f.text(e, 7),
      comments: name,
    });
    ctx.p.elements[id] = { ...g, order: ctx.order++ };
    if (propertiesOf(ctx.f, e, ctx.typeOf.get(e.id)).length) ctx.warn(t(ctx.lang, 'io_ifc_warn_props_dropped', { kind: t(ctx.lang, 'io_ifc_kind_railing') }));
    ctx.handled.add(e.id);
    ctx.bodies.delete(e.id);
    ctx.count('guarda-corpos');
  }
}
