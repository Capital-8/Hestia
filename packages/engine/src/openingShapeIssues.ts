import { isOpening, isWall, openingFamilyOf, openingHeight, openingShapeOf, openingShapeProblems, openingTypeById, outline, shapeCompat, type OpeningShapeKind, type Project, type ValidationIssue } from '@hestia/model';
import { t as tr, type Lang } from './i18nMessages.ts';
import { clienteFuroContorno } from './furoContornoDespacho.ts';
import { problemasDaEsquadria } from './openingShapeEsquadria.ts';
import { excessoForaDoEnvelope } from './openingShapeEnvelope.ts';
import { ferragemIssues } from './openingFerragemIssues.ts';

/** Parede curva atendida pelo contorno: cliente com `curva` e sem perfil de topo/base (docs/estudo-esquadrias/33 §4). */
const curvaPorContorno = (w: { topProfile?: unknown; attachTopToRoof?: boolean; attachTopToFloor?: boolean }): boolean => clienteFuroContorno()?.curva === true && !w.topProfile && !w.attachTopToRoof && !w.attachTopToFloor;

/** Nome curto da forma na mensagem (pt e en; os outros idiomas usam o inglês). */
const NOME_FORMA: Readonly<Record<'pt' | 'en', Readonly<Record<OpeningShapeKind, string>>>> = {
  pt: { rect: 'retangular', round: 'arco pleno', segmental: 'arco abatido', pointed: 'ogival', circle: 'círculo ou elipse', horseshoe: 'ferradura', gable: 'empena', trapezoid: 'trapézio', polygon: 'polígono livre' },
  en: { rect: 'rectangular', round: 'round arch', segmental: 'segmental arch', pointed: 'pointed arch', circle: 'circle or ellipse', horseshoe: 'horseshoe', gable: 'gable', trapezoid: 'trapezoid', polygon: 'free polygon' },
};

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
 * - `forma-incompatível-com-operação`: a operação da esquadria (correr, guilhotina, giro, sanfonada...) não é construtiva nessa forma
 *   (matriz `shapeCompat`, docs/estudo-esquadrias/39); o motor gera a esquadria FIXA (aro e vidro) dentro do contorno. O veredito
 *   `adaptado` não avisa (funciona com a ressalva da matriz, que a interface mostra).
 * - `ferragem-dobradicas-reduzidas` / `ferragem-macaneta-removida`: a folha não tem onde prender todas as dobradiças ou a maçaneta no
 *   contorno (docs/estudo-esquadrias/42); a esquadria sai com o que coube, nenhuma ferragem fica solta.
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
    const compat = shapeCompat(t, t.shape);
    if (compat.verdict === 'incompatível') {
      const nome = NOME_FORMA[lang === 'pt' ? 'pt' : 'en'][t.shape.kind];
      out.push({ severity: 'warning', code: 'forma-incompatível-com-operação', message: tr(lang, 'egb_issue_opening_shape_operation', { id: o.id, op: openingFamilyOf(t, lang)?.name ?? t.plan, shape: nome }), elementId: o.id });
    }
    out.push(...ferragemIssues(p, o, lang));
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
