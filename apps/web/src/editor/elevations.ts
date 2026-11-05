import type { Vec2 } from '@hestia/geom';
import type { Command, SectionRole, SectionView } from '@hestia/model';
import { t, useI18n, type Lang } from './i18n.ts';

/** Caixa em planta (metros), no formato de `levelBox`. */
export interface PlanBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Afastamento das elevações em relação à caixa. */
export const ELEVATION_OFFSET = 3;

export interface ElevationSpec {
  name: string;
  role: SectionRole;
  a: Vec2;
  b: Vec2;
  depth: number;
}

/**
 * Direção para onde o observador olha. O nome segue a fachada mostrada (convenção de projeto brasileira e do
 * Revit/ArchiCAD): a elevação "Norte" mostra a fachada norte, vista de norte olhando para -y.
 */
const LOOKS: Array<{ key: 'edc_elev_north' | 'edc_elev_south' | 'edc_elev_east' | 'edc_elev_west'; role: SectionRole; look: Vec2 }> = [
  { key: 'edc_elev_north', role: 'north', look: { x: 0, y: -1 } },
  { key: 'edc_elev_south', role: 'south', look: { x: 0, y: 1 } },
  { key: 'edc_elev_east', role: 'east', look: { x: -1, y: 0 } },
  { key: 'edc_elev_west', role: 'west', look: { x: 1, y: 0 } },
];

/**
 * As quatro linhas de elevação. Cada linha fica a `offset` metros atrás da face da caixa, com a normal à esquerda
 * (o lado para onde o observador olha) apontando para dentro da construção. Largura e profundidade cobrem a caixa
 * com `offset` de folga em cada lado. Os nomes nascem no idioma ativo.
 */
export function elevationSpecs(box: PlanBox, offset = ELEVATION_OFFSET, lang: Lang = useI18n.getState().lang): ElevationSpec[] {
  const corners: Vec2[] = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  return LOOKS.map(({ key, role, look: u }) => {
    const name = t(lang, key);
    // Para que a normal à esquerda de a→b seja u, a direção é d = (u.y, -u.x), pois perp(d) = (-d.y, d.x) = u.
    const d: Vec2 = { x: u.y, y: -u.x };
    // Face de trás da caixa ao longo de u, menos o afastamento.
    const back = Math.min(...corners.map((c) => c.x * u.x + c.y * u.y));
    const shift = back - offset - (cx * u.x + cy * u.y);
    const p: Vec2 = { x: cx + u.x * shift, y: cy + u.y * shift };
    const along = Math.abs(d.x) * w + Math.abs(d.y) * h + 2 * offset;
    const depth = Math.abs(u.x) * w + Math.abs(u.y) * h + 2 * offset;
    return {
      name,
      role,
      a: { x: p.x - (d.x * along) / 2, y: p.y - (d.y * along) / 2 },
      b: { x: p.x + (d.x * along) / 2, y: p.y + (d.y * along) / 2 },
      depth,
    };
  });
}

/**
 * Comando único que gera as quatro elevações. Uma elevação com o mesmo papel (ou, nas antigas sem papel, o mesmo
 * nome) é atualizada no lugar (mantém o id); duplicatas extras são removidas. Tudo entra em um batch, então um único
 * desfazer reverte a operação.
 */
export function elevationCommand(views: SectionView[], box: PlanBox, makeId: (prefix: string) => string, lang: Lang = useI18n.getState().lang): Command {
  const commands: Command[] = [];
  for (const spec of elevationSpecs(box, ELEVATION_OFFSET, lang)) {
    // O papel (norte/sul/leste/oeste) é a identidade estável: renomear a elevação não cria uma duplicata. Vistas
    // antigas, sem papel, ainda são encontradas pelo nome e ganham o papel na primeira geração.
    const byRole = views.filter((v) => v.kind === 'elevation' && v.role === spec.role);
    const same = byRole.length ? byRole : views.filter((v) => v.kind === 'elevation' && !v.role && v.name === spec.name);
    const [keep, ...extra] = same;
    if (keep) {
      commands.push({ type: 'updateView', id: keep.id, patch: { a: spec.a, b: spec.b, depth: spec.depth, role: spec.role } });
      for (const v of extra) commands.push({ type: 'deleteView', id: v.id });
    } else {
      commands.push({ type: 'addView', view: { id: makeId('v'), name: spec.name, kind: 'elevation', a: spec.a, b: spec.b, depth: spec.depth, role: spec.role } });
    }
  }
  return { type: 'batch', commands };
}
