import { boxOf, closestOnSegment, pointInMulti, type Box, type MultiPolygon, type Vec2 } from '@hestia/geom';
import type { SectionOrigin, SectionPart, SectionResult } from '@hestia/engine';
import { categoriaDoElemento, GRAPHICS_CATEGORIES, sectionGraphicsOf, type Element, type GraphicsCategory, type Id, type Project } from '@hestia/model';

/** O mínimo do projeto que o picking do corte lê (categorias dos elementos e visibilidade da vista de corte). */
type SecaoProject = Pick<Project, 'elements' | 'componentFamilies' | 'graphics' | 'sectionGraphics'>;

// Clique e caixa da massa no corte (ficha V3): reexportados aqui porque o barrel do render exporta este módulo por inteiro.
export { massasNaCaixaDoCorte, pickMassaNoCorte } from './massa.ts';

/**
 * Seleção nos cortes e elevações (decisão 0016, seção "Seleção em cortes e elevações"). Trabalha só com o resultado
 * do motor: os polígonos visíveis (linha oculta já aplicada) e a origem de cada item. Não recalcula geometria.
 */

/** Elemento sob o ponto: o id do modelo e a categoria gráfica (parede, porta, janela, piso, laje, telhado, escada). */
export interface SectionPick {
  id: Id;
  kind: GraphicsCategory;
}

/** Item visível de um corte ou elevação, com os elementos que o originaram. */
export interface SectionItem {
  /** Distância do plano (0 no corte). */
  depth: number;
  /** Empate na mesma profundidade: corte (0), vão (1), além (2). Mesma ordem da oclusão no motor. */
  rank: number;
  polygons: MultiPolygon;
  /** Donos do item: um para parede, piso, laje, telhado, escada e vão; no corte unido, as origens de `sources`. */
  owners: SectionPick[];
  box: Box;
  /** Peças por origem do corte unido (decisão 0016 §7); ausente quando o motor não separa as origens. */
  parts?: SectionPart[];
}

/** Ordem de empate da oclusão no motor (`OCCLUSION_RANK` em sectionOcclusion.ts): corte, vão, além. */
const RANK = { cut: 0, opening: 1, beyond: 2 } as const;

/**
 * Campo da origem → kind do elemento. É a ponte para o elemento do projeto (quando ele existe, vale o kind DELE); a
 * categoria gráfica nunca é escrita aqui: vem sempre de `categoriaDoElemento` (adendo 2 do ADR 0060).
 */
const OWNER_FIELDS: Array<[Exclude<keyof SectionOrigin, 'openingId'>, Element['kind']]> = [
  ['wallId', 'wall'],
  ['floorId', 'floor'],
  ['slabId', 'slab'],
  ['ceilingId', 'ceiling'],
  ['roofId', 'roof'],
  ['stairId', 'stair'],
  ['rampId', 'ramp'],
  ['columnId', 'column'],
  ['beamId', 'beam'],
  ['footingId', 'footing'],
  ['componentId', 'component'],
  ['furnitureId', 'furniture'],
];

/**
 * Dono de uma origem do motor (parede, piso, laje, telhado, escada...). Com o projeto, a categoria sai do elemento
 * verdadeiro (`categoriaDoElemento`, inclusive a disciplina da família do componente); sem ele (resultado sintético),
 * cai no kind do campo — ainda assim a categoria é resolvida pelo modelo, nunca por uma tabela paralela aqui.
 */
export function ownerOf(o: SectionOrigin, p?: SecaoProject): SectionPick | null {
  for (const [field, kind] of OWNER_FIELDS) {
    const id = o[field];
    if (id === undefined) continue;
    const el = p?.elements[id];
    const cat = categoriaDoElemento(el ?? { kind }, el ? p : undefined);
    return { id, kind: cat ?? 'generic' };
  }
  return null;
}

/**
 * Itens visíveis do corte, na ordem do picking: do mais perto ao mais longe (profundidade); em empate, corte antes de
 * vão e vão antes do além; por fim, a ordem da lista do motor. É a ordem de oclusão do motor, então o que está na
 * frente vem primeiro (a pintura faz o inverso: o mais longe primeiro e o corte por último).
 */
export function sectionItems(s: SectionResult, hidden?: ReadonlySet<Id>, p?: Pick<Project, 'elements' | 'componentFamilies' | 'graphics' | 'sectionGraphics'>): SectionItem[] {
  const items: Array<SectionItem & { order: number }> = [];
  // Categoria oculta pela vista de corte (`sectionGraphics.overrides[c].visible === false`): o que o desenho não mostra
  // também não é alvo de clique nem de caixa, como na planta.
  const categoriaOculta = p ? new Set(GRAPHICS_CATEGORIES.filter((c) => !sectionGraphicsOf(p).overrides[c].visible)) : null;
  const visivel = (o: SectionPick): boolean => !hidden?.has(o.id) && !categoriaOculta?.has(o.kind);
  const push = (depth: number, rank: number, polygons0: MultiPolygon, owners0: SectionPick[], parts0?: SectionPart[]): void => {
    let polygons = polygons0;
    let owners = owners0;
    let parts = parts0;
    // Oculto na vista (Hide in View/Isolar) ou categoria oculta: quem não é desenhado também não é selecionável.
    if ((hidden?.size ?? 0) > 0 || categoriaOculta?.size) {
      owners = owners0.filter(visivel);
      if (parts0) {
        parts = parts0.filter((pt) => { const d = ownerOf(pt.origin, p); return !d || visivel(d); });
        // A área do item passa a ser só a dos pedaços que sobraram.
        if (parts.length !== parts0.length) polygons = parts.flatMap((pt) => pt.polygons);
      }
    }
    if (polygons.length === 0 || owners.length === 0) return;
    items.push({ depth, rank, polygons, owners, box: boxOf(polygons.flatMap((p) => p.flatMap((r) => r))), order: items.length, parts });
  };
  for (const r of s.cut) {
    const owners = uniquePicks(r.sources.map((o) => ownerOf(o, p)).filter((o): o is SectionPick => o !== null));
    push(0, RANK.cut, r.polygons, owners, r.parts);
  }
  for (const o of s.openings) push(o.depth, RANK.opening, o.polygons, [{ id: o.openingId, kind: o.kind === 'door' ? 'door' : 'window' }]);
  for (const b of s.beyond) {
    const owner = ownerOf(b, p);
    push(b.depth, RANK.beyond, b.polygons, owner ? [owner] : []);
  }
  items.sort((x, y) => x.depth - y.depth || x.rank - y.rank || x.order - y.order);
  return items;
}

/** Donos sem repetição (por categoria e id), na ordem da primeira aparição. */
function uniquePicks(list: SectionPick[]): SectionPick[] {
  const seen = new Set<string>();
  return list.filter((o) => {
    const key = `${o.kind}|${o.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Distância do ponto à borda do multipolígono (zero se a borda passa por ele). */
function distanceToBoundary(p: Vec2, m: MultiPolygon): number {
  let best = Infinity;
  for (const poly of m) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const c = closestOnSegment(p, ring[i]!, ring[(i + 1) % ring.length]!);
        best = Math.min(best, Math.hypot(p.x - c.x, p.y - c.y));
      }
    }
  }
  return best;
}

/** Interior de um item: caixa envolvente primeiro (barato), depois o teste exato com furos. */
function containsPoint(it: SectionItem, p: Vec2): boolean {
  const b = it.box;
  if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) return false;
  return pointInMulti(p, it.polygons);
}

/** Dono do item no interior: sem `parts`, o primeiro dono; com `parts`, o da peça que contém o ponto. */
function ownerInside(it: SectionItem, p: Vec2, project?: SecaoProject): SectionPick {
  if (it.parts) {
    for (const part of it.parts) {
      if (pointInMulti(p, part.polygons)) {
        const o = ownerOf(part.origin, project);
        if (o) return o;
      }
    }
  }
  return it.owners[0]!;
}

/** Dono do item na borda: sem `parts`, o primeiro dono; com `parts`, o da peça mais próxima dentro da tolerância. */
function ownerNear(it: SectionItem, p: Vec2, tolerance: number, project?: SecaoProject): SectionPick {
  if (!it.parts) return it.owners[0]!;
  let best: SectionPick | null = null;
  let bestD = Infinity;
  for (const part of it.parts) {
    const d = distanceToBoundary(p, part.polygons);
    if (d <= tolerance && d < bestD) {
      const o = ownerOf(part.origin, project);
      if (o) {
        best = o;
        bestD = d;
      }
    }
  }
  return best ?? it.owners[0]!;
}

/**
 * Elemento sob o ponto (t, z) do corte ou da elevação. Duas passagens sobre os itens visíveis, cada uma do mais perto
 * ao mais longe: primeiro o interior (o que está visível sob o ponto ganha); se nenhum contém o ponto, a borda a
 * `tolerance` (unidades do desenho: o chamador converte os 4 px com `4 / zoom`). Itens totalmente ocultos não entram:
 * não são selecionáveis, intencional.
 *
 * Corte unido (decisão 0016 §7): com `parts`, o dono é o da peça cujo polígono contém o ponto (interior) ou, na
 * segunda passagem, o da peça mais próxima da borda dentro da tolerância. Sem `parts`, vale o primeiro de `sources`.
 */
export function pickSection(s: SectionResult, point: Vec2, tolerance = 0, hidden?: ReadonlySet<Id>, project?: SecaoProject): SectionPick | null {
  const items = sectionItems(s, hidden, project);
  for (const it of items) if (containsPoint(it, point)) return ownerInside(it, point, project);
  if (tolerance <= 0) return null;
  for (const it of items) {
    const b = it.box;
    if (point.x < b.minX - tolerance || point.x > b.maxX + tolerance || point.y < b.minY - tolerance || point.y > b.maxY + tolerance) continue;
    if (distanceToBoundary(point, it.polygons) <= tolerance) return ownerNear(it, point, tolerance, project);
  }
  return null;
}
