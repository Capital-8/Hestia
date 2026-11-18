import { isOpening, isWall, openingHeight, openingShapeProblems, openingTypeById, type Project, type ValidationIssue } from '@hestia/model';
import { t as tr, type Lang } from './i18nMessages.ts';
import { problemasDaEsquadria } from './openingShapeEsquadria.ts';

/**
 * Avisos da forma do vão (docs/estudo-esquadrias/24, §3). Nenhum bloqueia: o vão com forma inválida, ou numa parede que o
 * caminho de contorno ainda não atende, continua recortado como retângulo.
 * - `forma-vao-invalida`: a forma efetiva do vão (tipo + altura da instância + folga do vão bruto) não passa em `validateOpeningShape`.
 * - `forma-vao-ignorada-na-parede`: forma válida em parede curva (`sag` ≠ 0) ou inclinada (`tilt` ≠ 0); o furo é retangular nelas.
 * - `forma-esquadria-retangular`: a forma cabe no vão bruto mas a flecha não cabe na esquadria menor (docs/estudo-esquadrias/28 §7);
 *   as peças ficam retangulares e o furo na parede segue a forma.
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
    const menor = problemasDaEsquadria(t.shape, t.width, openingHeight(t, o));
    if (menor.length > 0) {
      out.push({ severity: 'warning', code: 'forma-esquadria-retangular', message: tr(lang, 'egb_issue_opening_shape_frame', { id: o.id, problems: menor.join(', ') }), elementId: o.id });
    }
    const host = p.elements[o.hostId];
    if (isWall(host) && (host.sag !== 0 || !!host.tilt)) {
      out.push({ severity: 'warning', code: 'forma-vao-ignorada-na-parede', message: tr(lang, 'egb_issue_opening_shape_host', { id: o.id, wall: host.id }), elementId: o.id, ids: [o.id, host.id] });
    }
  }
  return out;
}
