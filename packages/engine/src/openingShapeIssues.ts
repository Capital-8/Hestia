import { isOpening, isWall, openingHeight, openingShapeOf, openingShapeProblems, openingTypeById, outline, type Project, type ValidationIssue } from '@hestia/model';
import { t as tr, type Lang } from './i18nMessages.ts';
import { clienteFuroContorno } from './furoContornoDespacho.ts';
import { problemasDaEsquadria } from './openingShapeEsquadria.ts';
import { excessoForaDoEnvelope } from './openingShapeEnvelope.ts';

/** Parede curva atendida pelo contorno: cliente com `curva` e sem perfil de topo/base (docs/estudo-esquadrias/33 §4). */
const curvaPorContorno = (w: { topProfile?: unknown; attachTopToRoof?: boolean; attachTopToFloor?: boolean }): boolean => clienteFuroContorno()?.curva === true && !w.topProfile && !w.attachTopToRoof && !w.attachTopToFloor;

/** Anel anti-horário com alguma reentrância (curva para a direita)? */
function concavo(r: ReadonlyArray<readonly [number, number]>): boolean {
  return r.some((b, i) => {
    const a = r[(i + r.length - 1) % r.length]!;
    const c = r[(i + 1) % r.length]!;
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-9;
  });
}

/**
 * Avisos da forma do vão (docs/estudo-esquadrias/24, §3). Nenhum bloqueia: o vão com forma inválida, ou numa parede que o
 * caminho de contorno ainda não atende, continua recortado como retângulo.
 * - `forma-vao-invalida`: a forma efetiva do vão (tipo + altura da instância + folga do vão bruto) não passa em `validateOpeningShape`.
 * - `forma-vao-ignorada-na-parede`: forma válida em parede inclinada (`tilt` ≠ 0), ou curva (`sag` ≠ 0) sem cliente com `curva`; o furo é retangular nelas.
 * - `forma-esquadria-retangular`: a forma cabe no vão bruto mas a flecha não cabe na esquadria menor (docs/estudo-esquadrias/28 §7);
 *   as peças ficam retangulares e o furo na parede segue a forma.
 * - `forma-vao-poligono-concavo`: polígono livre côncavo (docs/estudo-esquadrias/32): o recuo concêntrico das peças pode ser recusado
 *   nas reentrâncias e a peça fica como era (caixa); o furo na parede segue o polígono.
 * - `vao-fora-do-envelope`: a forma sai do retângulo da parede reta (comprimento x altura); o furo remove só a parte que cabe (docs/estudo-esquadrias/33).
 * Só instâncias são avaliadas; um tipo com forma e sem uso não gera aviso.
 */
export function openingShapeIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const o of Object.values(p.elements)) {
    if (!isOpening(o)) continue;
    const t = openingTypeById(p, o.typeId);
    if (!t?.shape || t.shape.kind === 'rect') continue;
    const problems = openingShapeProblems(t, openingHeight(t, o));
    if (problems.length > 0) {
      out.push({ severity: 'warning', code: 'forma-vao-invalida', message: tr(lang, 'egb_issue_opening_shape_invalid', { id: o.id, problems: problems.join(', ') }), elementId: o.id });
      continue;
    }
    if (t.shape.kind === 'polygon' && concavo(outline(openingShapeOf(t, openingHeight(t, o))!))) {
      out.push({ severity: 'warning', code: 'forma-vao-poligono-concavo', message: tr(lang, 'egb_issue_opening_shape_concave', { id: o.id }), elementId: o.id });
    }
    const menor = problemasDaEsquadria(t.shape, t.width, openingHeight(t, o));
    if (menor.length > 0) {
      out.push({ severity: 'warning', code: 'forma-esquadria-retangular', message: tr(lang, 'egb_issue_opening_shape_frame', { id: o.id, problems: menor.join(', ') }), elementId: o.id });
    }
    const host = p.elements[o.hostId];
    // Parede curva: só avisa se o vão não vai por contorno (sem cliente com `curva`, ou com perfil de topo/base); inclinada sempre avisa.
    const curvaRetangular = isWall(host) && host.sag !== 0 && !host.tilt && !curvaPorContorno(host);
    if (isWall(host) && (!!host.tilt || curvaRetangular)) {
      out.push({ severity: 'warning', code: 'forma-vao-ignorada-na-parede', message: tr(lang, 'egb_issue_opening_shape_host', { id: o.id, wall: host.id }), elementId: o.id, ids: [o.id, host.id] });
    }
    const excesso = excessoForaDoEnvelope(p, o);
    if (excesso > 0) {
      // units-ok: texto técnico em m, 2 casas; testes fixam o formato
      out.push({ severity: 'warning', code: 'vao-fora-do-envelope', message: tr(lang, 'egb_issue_opening_shape_envelope', { id: o.id, wall: o.hostId, excess: excesso.toFixed(2) }), elementId: o.id, ids: [o.id, o.hostId] });
    }
  }
  return out;
}
