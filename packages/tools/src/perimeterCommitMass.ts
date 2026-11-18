import { polygonArea, type Vec2 } from '@hestia/geom';
import { simplificarAnel } from '@hestia/engine';
import { formatQuantity, isMass, makeMass, massIssue, MASSA_LIMITES, newId, normalizarSecoes, unitsOf, type Mass, type PerfilMassa, type Project, type SecaoMassa } from '@hestia/model';
import { anelDoPerfil, capturaLivre, pilhaDeDois } from './massToolPerfis.ts';
import { refuse as refuseBase } from './perimeterCommitShared.ts';
import type { CommitPerimeterOptions, CommitPerimeterResult } from './perimeterCommitTypes.ts';
import { t as translate, type Lang } from './i18n.ts';

/**
 * Esboço de massa (frente massa-forma-livre): o laço EXTERNO do esboço vira o perfil `livre` da massa (3 a 256 pontos).
 * Decisões:
 *  - Furos: o modelo de seção da massa NÃO tem furos (`PerfilMassa` é um anel só); o esboço com laço interno é recusado com
 *    mensagem clara, sem tocar no formato salvo nem nas fixtures M1 a M5.
 *  - Arcos e círculos da galeria já chegam amostrados em polilinha (erro de corda de 2 mm, `sampleRing`). Se o anel passar de
 *    256 pontos, `reduzirAnel` simplifica por Douglas-Peucker dobrando a tolerância (2 mm, 4 mm, 8 mm... até 5 cm) até caber.
 *  - Criar: duas seções iguais (z = 0 e z = altura), interpolação linear, `baseOffset` = cota absoluta da base menos a
 *    elevação do nível. Editar: troca o perfil das seções que tinham o mesmo perfil da base (extrusão); numa mistura/loft só a
 *    seção da base muda. Altura, cotas, torção e arranjo ficam como estavam.
 */

/** Tolerância inicial e final (m) da redução de anel. */
const TOL_INICIAL = 0.002;
const TOL_MAX = 0.05;

/** Anel com no máximo `max` pontos: o próprio, ou o simplificado com a menor tolerância (dobrando) que cabe. Sem solução, `null`. */
export function reduzirAnel(anel: readonly Vec2[], max: number = MASSA_LIMITES.pontosLivre): Vec2[] | null {
  if (anel.length <= max) return anel.map((p) => ({ ...p }));
  for (let tol = TOL_INICIAL; tol <= TOL_MAX + 1e-12; tol *= 2) {
    const r = simplificarAnel(anel, tol);
    if (r.length <= max) return r;
  }
  return null;
}

/** Ponto do anel local (centro, escala e rotação da seção) levado ao mundo: o inverso de `contornoDaSecao`. */
export function paraLocal(mundo: readonly Vec2[], origem: Vec2, s: Pick<SecaoMassa, 'dx' | 'dy' | 'rotacao' | 'escala'>): Vec2[] {
  const c = Math.cos(-s.rotacao);
  const sn = Math.sin(-s.rotacao);
  return mundo.map((p) => {
    const x = p.x - origem.x - s.dx;
    const y = p.y - origem.y - s.dy;
    return { x: (x * c - y * sn) / s.escala, y: (x * sn + y * c) / s.escala };
  });
}

/** Seção `i` (0 = base, 'topo' = a última) em mundo: ver `massRing`. */

/** Contorno da seção da base em mundo (escala, rotação, deslocamento e origem da massa); círculo e elipse em 64 pontos. */
export function massRing(origem: Vec2, s: SecaoMassa): Vec2[] {
  const c = Math.cos(s.rotacao);
  const sn = Math.sin(s.rotacao);
  return anelDoPerfil(s.perfil, { x: 0, y: 0 }, 64).map((q) => {
    const x = q.x * s.escala;
    const y = q.y * s.escala;
    return { x: origem.x + s.dx + x * c - y * sn, y: origem.y + s.dy + x * sn + y * c };
  });
}

const mesmoPerfil = (a: PerfilMassa, b: PerfilMassa): boolean => JSON.stringify(a) === JSON.stringify(b);

const elevacaoDe = (p: Project, levelId: string): number => p.levels.find((l) => l.id === levelId)?.elevation ?? 0;

/** Conclui o esboço de massa: cria (`addMass`) ou atualiza o contorno (`updateMass`). Recusa devolve o motivo em `message`. */
export function commitMass(p: Project, s: { editing?: string }, outer: Vec2[], holes: Vec2[][], opts: CommitPerimeterOptions, lang: Lang = 'pt'): CommitPerimeterResult {
  if (holes.length > 0) return refuseBase(translate(lang, 'tl_msg_mass_holes'));
  const anel = reduzirAnel(outer);
  if (!anel) return refuseBase(translate(lang, 'tl_mass_livre_max', { max: MASSA_LIMITES.pontosLivre }));
  const u = unitsOf(p);
  const area = formatQuantity(u, 'area', Math.abs(polygonArea([anel])));
  if (s.editing) return editarContorno(p, s.editing, anel, area, lang, opts.massa?.editar ?? 'base');
  const levelId = opts.levelId;
  if (!levelId) return refuseBase(translate(lang, 'tl_msg_no_level'));
  if (!p.levels.some((l) => l.id === levelId)) return refuseBase(translate(lang, 'tl_msg_level_missing'));
  const altura = opts.massa?.altura ?? 9;
  const baseRing = opts.massa?.baseRing;
  // Mistura e loft: `baseRing` é o anel da base (1ª fase) e `anel` o do topo; extrusão: duas seções iguais.
  const cap = capturaLivre(baseRing ? reduzirAnel(baseRing) ?? baseRing : anel);
  const capTopo = baseRing ? capturaLivre(anel) : cap;
  const base = opts.massa?.cotaBase ?? null;
  const baseOffset = base === null ? 0 : base - elevacaoDe(p, levelId);
  const massa = makeMass({ id: newId('mass'), levelId, baseOffset, ...pilhaDeDois(cap, capTopo, altura), secoes: normalizarSecoes(pilhaDeDois(cap, capTopo, altura).secoes), interpolacao: 'linear' });
  const issue = massIssue({ ...massa, order: 0 }, lang);
  if (issue) return refuseBase(issue);
  const cotaBase = elevacaoDe(p, levelId) + baseOffset;
  const message = translate(lang, 'tl_msg_mass_created', { pts: anel.length, area, base: formatQuantity(u, 'length', cotaBase), top: formatQuantity(u, 'length', cotaBase + altura) });
  return { ok: true, id: massa.id, commands: [{ type: 'addMass', mass: massa }], message };
}

function editarContorno(p: Project, id: string, anel: Vec2[], area: string, lang: Lang, qual: 'base' | 'topo'): CommitPerimeterResult {
  const m = p.elements[id];
  if (!isMass(m)) return refuseBase(translate(lang, 'tl_msg_not_found', { name: translate(lang, 'tl_name_mass') }));
  const ultimo = m.secoes.length - 1;
  const ref = m.secoes[qual === 'topo' ? ultimo : 0]!;
  const novo: PerfilMassa = { forma: 'livre', pontos: paraLocal(anel, m.origem, ref) };
  // Base: troca também as seções iguais a ela (extrusão). Topo: só a última seção.
  const secoes = m.secoes.map((s, i) => (qual === 'topo' ? (i === ultimo ? { ...s, perfil: novo } : s) : i === 0 || mesmoPerfil(s.perfil, ref.perfil) ? { ...s, perfil: novo } : s));
  const next: Mass = { ...m, secoes: normalizarSecoes(secoes) };
  const issue = massIssue(next, lang);
  if (issue) return refuseBase(issue);
  return { ok: true, id, commands: [{ type: 'updateMass', id, patch: { secoes } }], message: translate(lang, 'tl_msg_mass_updated', { pts: anel.length, area }) };
}
