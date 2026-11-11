import { boxOf, boxesOverlap, dist, dot, intersectSegments, len, sub, type Vec2 } from '@hestia/geom';
import { angularDimensionGeometry, dimensionGeometry, dimensionStyleFor, DIM_TEXT_MM, type DimensionGeometry, dimensionPoints, floorViewId, planViewOf, viewAnnotationsOf as anotacoesDaVista, viewGraphicsOf, viewOwnAnnotationsOf, viewProfileOf, wallsOnLevel, type DetailLine, type DetailRegion, type Dimension, type DimensionRef, type ElementTag, type Id, type Project, type RoomTag, type TextNote } from '@hestia/model';
import { resolveAngularDimension } from '@hestia/engine';

/** Tolerância (m) para dizer que um ponto é a extremidade de uma parede. */
const END_TOL = 1e-4;

/**
 * Referência a uma extremidade de parede do nível quando o ponto cai nela (a cota passa a acompanhar a parede).
 * Ponto no meio da face ou no vazio: sem referência, a cota fica livre.
 */
export function endRefAt(p: Project, levelId: Id, point: Vec2): DimensionRef | undefined {
  for (const w of wallsOnLevel(p, levelId)) {
    if (dist(w.a, point) <= END_TOL) return { wallId: w.id, end: 'a' };
    if (dist(w.b, point) <= END_TOL) return { wallId: w.id, end: 'b' };
  }
  return undefined;
}

/** Normal esquerda da direção a→b (unitária), ou null se a ou b coincidem. */
export function leftNormal(a: Vec2, b: Vec2): Vec2 | null {
  const d = sub(b, a);
  const l = len(d);
  if (l < 1e-9) return null;
  return { x: -d.y / l, y: d.x / l };
}

/** Distância com sinal do ponto `q` à reta a–b, medida no lado da normal esquerda de a→b. */
export const signedOffset = (a: Vec2, b: Vec2, q: Vec2): number => {
  const n = leftNormal(a, b);
  return n ? dot(sub(q, a), n) : 0;
};

/** Distância de `q` ao segmento p–r. */
function distToSegment(q: Vec2, p: Vec2, r: Vec2): number {
  const d = sub(r, p);
  const l2 = dot(d, d);
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(q, p), d) / l2)) : 0;
  return dist(q, { x: p.x + d.x * t, y: p.y + d.y * t });
}

/** Largura média de um caractere, em múltiplos do corpo da fonte (estimativa para o retângulo do texto). */
const TEXT_CHAR_EM = 0.6;

/**
 * Texto sob o cursor: o retângulo do texto, centrado na âncora e girado com ele, mais a tolerância de 6 px.
 * Corpo (m de modelo) = altura em mm de papel × escala ÷ 1000; largura = caracteres × 0,6 do corpo.
 */
export function textHit(t: TextNote, scale: number, at: Vec2, tol: number): boolean {
  const { w, h } = textBlockSize(t, scale);
  const hw = w / 2 + tol;
  const hh = h / 2 + tol;
  // Coordenadas do cursor no referencial do texto (girado por `rotation` graus, anti-horário, como na planta).
  const r = (t.rotation * Math.PI) / 180;
  const dx = at.x - t.at.x, dy = at.y - t.at.y;
  const u = dx * Math.cos(r) + dy * Math.sin(r);
  const v = -dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(u) <= hw && Math.abs(v) <= hh;
}


/**
 * Geometria da cota com as MESMAS opções do desenho (render/plan/dimDraw.ts `baseLayout`): estilo da família da cota +
 * estilo global + campos da própria cota (altura do texto), folga/ultrapassagem das extensões, meia-marca, convenção de
 * leitura e texto centrado, na escala da vista. Não depende do render (tools não importa render). Limite: o deslocamento
 * automático do texto por anti-sobreposição (leader sem `textAt`) depende das outras cotas e só existe no layout do
 * render; o `textAt` manual coincide.
 */
export function dimHitGeometry(p: Project, d: Dimension, a: Vec2, b: Vec2, scale: number): DimensionGeometry {
  const st = dimensionStyleFor(p.settings, d);
  const th = d.textHeight ?? st.textHeight;
  return dimensionGeometry(a, b, d.offset, scale / 1000, th > 0 ? th : DIM_TEXT_MM, d.textAt, {
    extensionGapMm: st.extensionGap,
    extensionOvershootMm: st.extensionOvershoot,
    tickHalfMm: st.tickSize / 2,
    textGapMm: st.textGap,
    centered: st.textPlacement === 'centered',
    readConvention: st.readConvention,
  });
}

/** Anotações que a vista mostra, com a escala dela: as do nível (planta de piso) ou as da planta de área. */
export interface ViewAnnotations {
  /** Escala da vista (1:N), usada no tamanho de papel dos textos e das cotas. */
  scale: number;
  dimensions: Dimension[];
  texts: TextNote[];
  detailLines: DetailLine[];
  detailRegions: DetailRegion[];
  tags: ElementTag[];
}

/**
 * Anotações que a vista de planta oferece à seleção. `viewId` é a vista exata (piso `pv_`, cobertura `pvr_` ou planta de
 * área); ausente (ou desconhecida), a planta de piso do nível. Cada vista só enxerga as próprias: as do piso não vazam
 * para a cobertura nem para a área, e vice-versa. Na planta de área o perfil da vista decide o que aparece (categoria
 * oculta não é alvo de seleção nem de alça); piso e cobertura entregam o conjunto inteiro.
 */
export function anotacoesSelecionaveis(p: Project, levelId: Id, viewId?: Id): ViewAnnotations {
  const vista = viewId ? planViewOf(p, viewId) : undefined;
  if (vista && vista.kind === 'area') {
    const a = { ...viewOwnAnnotationsOf(p, vista.id) };
    const ly = viewProfileOf(p, vista.id).layers;
    if (!ly.dimensions) a.dimensions = [];
    if (!ly.texts) a.texts = [];
    if (!ly.detail) { a.detailLines = []; a.detailRegions = []; }
    if (!ly.tags) a.tags = [];
    const escala = vista.area?.scale ?? NaN;
    const scale = Number.isFinite(escala) && escala > 0 ? escala : viewGraphicsOf(p, floorViewId(levelId)).scale;
    return { scale, ...a };
  }
  const id = vista ? vista.id : floorViewId(levelId);
  const nivel = anotacoesDaVista(p, id);
  return {
    scale: viewGraphicsOf(p, id).scale,
    dimensions: nivel.dimensions,
    texts: nivel.texts,
    detailLines: nivel.detailLines,
    detailRegions: nivel.detailRegions,
    tags: nivel.tags,
  };
}

/** Detalhes desenhados por cima do modelo têm prioridade de seleção quando suas áreas se sobrepõem. */
export function detailItemAt(p: Project, levelId: Id, at: Vec2, mpp: number, viewId?: Id): Id | null {
  const a = anotacoesSelecionaveis(p, levelId, viewId);
  for (const region of [...a.detailRegions].reverse()) {
    let inside = false;
    for (let i = 0, j = region.boundary.length - 1; i < region.boundary.length; j = i++) {
      const q = region.boundary[i]!; const r = region.boundary[j]!;
      if ((q.y > at.y) !== (r.y > at.y) && at.x < ((r.x - q.x) * (at.y - q.y)) / (r.y - q.y) + q.x) inside = !inside;
    }
    if (inside) return region.id;
  }
  for (const line of [...a.detailLines].reverse()) if (distToSegment(at, line.a, line.b) <= 6 * mpp) return line.id;
  return null;
}

/** Cota, etiqueta, texto ou detalhe sob o cursor (tolerância de 6 px; o texto vale pelo retângulo, não só pela âncora). */
export function annotationAt(p: Project, levelId: Id, at: Vec2, mpp: number, viewId?: Id): { id: Id; kind: 'dimension' | 'text' } | null {
  const a = anotacoesSelecionaveis(p, levelId, viewId);
  for (const tag of a.tags) if (dist(at, tag.at) <= 14 * mpp) return { id: tag.id, kind: 'text' };
  for (const t of a.texts) {
    if (textHit(t, a.scale, at, 6 * mpp)) return { id: t.id, kind: 'text' };
    if (t.leader?.some((q, i) => i > 0 && distToSegment(at, t.leader![i - 1]!, q) <= 6 * mpp)) return { id: t.id, kind: 'text' };
  }
  for (const line of a.detailLines) if (distToSegment(at, line.a, line.b) <= 6 * mpp) return { id: line.id, kind: 'text' };
  for (const region of a.detailRegions) {
    let inside = false;
    for (let i = 0, j = region.boundary.length - 1; i < region.boundary.length; j = i++) {
      const q = region.boundary[i]!; const r = region.boundary[j]!;
      if ((q.y > at.y) !== (r.y > at.y) && at.x < ((r.x - q.x) * (at.y - q.y)) / (r.y - q.y) + q.x) inside = !inside;
    }
    if (inside) return { id: region.id, kind: 'text' };
  }
  for (const d of a.dimensions) {
    if (d.angular) {
      const g = angularDimensionGeometry(resolveAngularDimension(p, levelId, d));
      if (!g) continue;
      if (dist(at, g.textAt) <= 10 * mpp) return { id: d.id, kind: 'dimension' };
      for (const [s, e] of [...g.arc.slice(0, -1).map((q, i) => [q, g.arc[i + 1]!] as const), ...g.extensions]) if (distToSegment(at, s, e) <= 6 * mpp) return { id: d.id, kind: 'dimension' };
      continue;
    }
    const pts = dimensionPoints(p, d);
    const g = dimHitGeometry(p, d, pts.a, pts.b, a.scale);
    if (dist(at, g.textAt) <= 10 * mpp) return { id: d.id, kind: 'dimension' };
    if (d.textAt && distToSegment(at, mid(g.line[0], g.line[1]), d.textAt) <= 6 * mpp) return { id: d.id, kind: 'dimension' };
    for (const [s, e] of [g.line, ...g.extensions]) if (distToSegment(at, s, e) <= 6 * mpp) return { id: d.id, kind: 'dimension' };
  }
  return null;
}

/** Anotações da vista dentro da janela de seleção (esquerda→direita contém; direita→esquerda cruza). */
export function annotationIdsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2, _mpp: number, viewId?: Id): Id[] {
  const a0 = anotacoesSelecionaveis(p, levelId, viewId);
  return annotationIdsInBoxOf(a0, a, b, {
    linear: (d) => { const pts = dimensionPoints(p, d); return dimHitGeometry(p, d, pts.a, pts.b, a0.scale); },
    angular: (d) => angularDimensionGeometry(resolveAngularDimension(p, levelId, d)),
  });
}

/** Como a geometria de cada cota é obtida: a planta resolve `refs` no projeto; o corte usa os pontos gravados. */
export interface DimensionBoxSource {
  linear(d: Dimension): DimensionGeometry;
  angular(d: Dimension): ReturnType<typeof angularDimensionGeometry>;
}

/**
 * Regra única de caixa (janela contém, cruzamento toca) sobre as anotações de qualquer vista: a planta passa as do nível
 * ou da planta de área; o corte passa as dele, em (t,z). Só muda de onde vem a geometria da cota.
 */
export function annotationIdsInBoxOf(a0: Pick<ViewAnnotations, 'scale' | 'dimensions' | 'texts' | 'detailLines' | 'detailRegions' | 'tags'>, a: Vec2, b: Vec2, src: DimensionBoxSource): Id[] {
  const box = boxOf([a, b]);
  const crossing = b.x < a.x;
  const dentro = (q: Vec2): boolean => q.x >= box.minX && q.x <= box.maxX && q.y >= box.minY && q.y <= box.maxY;
  const segmento = (s: Vec2, e: Vec2): boolean => {
    if (dentro(s) || dentro(e)) return true;
    if (!crossing || !boxesOverlap(boxOf([s, e]), box)) return false;
    const cantos = [
      { x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY },
    ];
    return cantos.some((c, i) => intersectSegments(s, e, c, cantos[(i + 1) % 4]!) !== null);
  };
  const ids: Id[] = [];
  for (const d of a0.dimensions) {
    if (d.angular) {
      const g = src.angular(d);
      if (!g) continue;
      const pontos = [...g.arc, g.textAt];
      if (pontos.every(dentro) || (crossing && boxesOverlap(boxOf(pontos), box))) ids.push(d.id);
      continue;
    }
    const g = src.linear(d);
    const pontos = [g.line[0], g.line[1], ...g.extensions.flat(), ...(d.textAt ? [d.textAt] : [])];
    if (pontos.every(dentro) || [g.line, ...g.extensions].some(([s, e]) => segmento(s!, e!))) ids.push(d.id);
  }
  for (const t of a0.texts) {
    const cantos = textBlockCorners(t, a0.scale);
    if (cantos.every(dentro) || (crossing && boxesOverlap(boxOf(cantos), box))) ids.push(t.id);
  }
  for (const l of a0.detailLines) if (dentro(l.a) && dentro(l.b) || segmento(l.a, l.b)) ids.push(l.id);
  for (const r of a0.detailRegions) {
    const cantos = r.boundary;
    const contida = cantos.length > 0 && cantos.every(dentro);
    const cruza = crossing && (boxesOverlap(boxOf(cantos), box) || cantos.some(dentro));
    if (contida || cruza) ids.push(r.id);
  }
  for (const t of a0.tags) if (dentro(t.at)) ids.push(t.id);
  return ids;
}

/** Alça da cota selecionada: o ponto médio da linha de cota. Arrastá-la muda o deslocamento. */
export function dimGripAt(p: Project, levelId: Id, sel: Id[], at: Vec2, mpp: number, viewId?: Id): Id | null {
  if (sel.length !== 1) return null;
  const va = anotacoesSelecionaveis(p, levelId, viewId);
  const d = va.dimensions.find((x) => x.id === sel[0]);
  if (!d || d.angular) return null;
  const pts = dimensionPoints(p, d);
  const g = dimHitGeometry(p, { ...d, textAt: undefined }, pts.a, pts.b, va.scale);
  return dist(at, mid(g.line[0], g.line[1])) <= 6 * mpp ? d.id : null;
}

/** Alça do texto da cota, que pode ser deslocado sem alterar os pontos medidos nem o afastamento da linha. */
export function dimTextGripAt(p: Project, levelId: Id, sel: Id[], at: Vec2, mpp: number, viewId?: Id): Id | null {
  if (sel.length !== 1) return null;
  const va = anotacoesSelecionaveis(p, levelId, viewId);
  const d = va.dimensions.find((x) => x.id === sel[0]);
  if (!d) return null;
  if (d.angular) {
    const g = angularDimensionGeometry(resolveAngularDimension(p, levelId, d));
    return g && dist(at, g.textAt) <= 9 * mpp ? d.id : null;
  }
  const pts = dimensionPoints(p, d);
  const g = dimHitGeometry(p, d, pts.a, pts.b, va.scale);
  return dist(at, g.textAt) <= 9 * mpp ? d.id : null;
}

/**
 * Canto inferior esquerdo da caixa de seleção do texto, onde o render desenha o quadradinho. A conta acompanha
 * `textBlockModel`/`alcaDoTextoEm` do render (largura por `width`, quebra por `\\n`, entrelinha e folga da seleção).
 */
function textBlockSize(t: Pick<TextNote, 'text' | 'height' | 'width'>, scale: number): { w: number; h: number } {
  const fontMm = t.height > 0 ? t.height : 2.5;
  const paragrafos = t.text.split('\n');
  const linhas: string[] = [];
  if (t.width && t.width > 0) {
    const porLinha = Math.max(1, Math.floor(t.width / (fontMm * TEXT_CHAR_EM)));
    for (const paragrafo of paragrafos) {
      let atual = '';
      for (const palavra of paragrafo.split(' ')) {
        let resto = palavra;
        while (resto.length > porLinha) {
          if (atual) { linhas.push(atual); atual = ''; }
          linhas.push(resto.slice(0, porLinha));
          resto = resto.slice(porLinha);
        }
        const candidata = atual ? `${atual} ${resto}` : resto;
        if (candidata.length <= porLinha) atual = candidata;
        else { linhas.push(atual); atual = resto; }
      }
      linhas.push(atual);
    }
  } else linhas.push(...paragrafos);
  const w = (t.width && t.width > 0 ? t.width : Math.max(1, ...linhas.map((l) => l.length)) * fontMm * TEXT_CHAR_EM) * scale / 1000;
  const h = Math.max(1, linhas.length) * fontMm * 1.25 * scale / 1000;
  return { w, h };
}

export function textHandleAt(t: Pick<TextNote, 'at' | 'text' | 'height' | 'width' | 'rotation'>, scale: number): Vec2 {
  const { w, h } = textBlockSize(t, scale);
  const folga = 1.15 * scale / 1000;
  const hw = w / 2 + folga;
  const hh = h / 2 + folga;
  const r = (t.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: t.at.x + -hw * c - -hh * s, y: t.at.y + -hw * s + -hh * c };
}

/** Os quatro cantos do bloco do texto (sem a folga), no mundo, para a seleção por janela. */
function textBlockCorners(t: Pick<TextNote, 'at' | 'text' | 'height' | 'width' | 'rotation'>, scale: number): Vec2[] {
  const { w, h } = textBlockSize(t, scale);
  const hw = w / 2;
  const hh = h / 2;
  const r = (t.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({
    x: t.at.x + x! * c - y! * s,
    y: t.at.y + x! * s + y! * c,
  }));
}

/**
 * Alça do texto selecionado: o quadradinho no canto inferior esquerdo, fora do texto (o mesmo ponto desenhado pelo
 * render). Arrastá-la move o texto (a posição só é gravada ao soltar). Devolve o id do texto, ou null.
 */
export function textGripAt(p: Project, levelId: Id, sel: Id[], at: Vec2, mpp: number, viewId?: Id): Id | null {
  if (sel.length !== 1) return null;
  const a = anotacoesSelecionaveis(p, levelId, viewId);
  const t = a.texts.find((x) => x.id === sel[0]);
  if (!t) return null;
  // O quadradinho fica no canto inferior esquerdo; a âncora também vale (é o centro do texto e o alvo natural do clique).
  return dist(at, textHandleAt(t, a.scale)) <= 8 * mpp || dist(at, t.at) <= 6 * mpp ? t.id : null;
}

/** Ponto médio de um segmento. */
export const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Meia-largura/altura (m) aproximada da etiqueta de ambiente na escala da vista (nome + linha de informação). */
function roomTagHalf(scale: number): { hw: number; hh: number } {
  return { hw: (12 * 2.5 * TEXT_CHAR_EM * scale) / 2000, hh: (2 * 3.2 * scale) / 2000 };
}

/** Etiquetas de ambiente (RoomTag) visíveis da planta de área. */
const visibleRoomTags = (p: Project, planId: Id | undefined): { tags: RoomTag[]; scale: number } => {
  const area = planId ? planViewOf(p, planId)?.area : undefined;
  return area ? { tags: area.tags.filter((t) => t.visible), scale: area.scale > 0 ? area.scale : 50 } : { tags: [], scale: 50 };
};

/** Etiqueta de ambiente da planta de área sob o cursor (a caixa do texto mais 6 px). Planta de piso: sempre null. */
export function roomTagAt(p: Project, at: Vec2, mpp: number, planId?: Id): Id | null {
  const { tags, scale } = visibleRoomTags(p, planId);
  const { hw, hh } = roomTagHalf(scale);
  for (const t of [...tags].reverse()) {
    if (Math.abs(at.x - t.at.x) <= hw + 6 * mpp && Math.abs(at.y - t.at.y) <= hh + 6 * mpp) return t.id;
  }
  return null;
}

/** Etiquetas de ambiente da planta de área dentro da janela (esq→dir contém; dir→esq cruza). */
export function roomTagIdsInBox(p: Project, a: Vec2, b: Vec2, planId?: Id): Id[] {
  const { tags, scale } = visibleRoomTags(p, planId);
  const { hw, hh } = roomTagHalf(scale);
  const box = boxOf([a, b]);
  const crossing = b.x < a.x;
  return tags.filter((t) => {
    const bx = { minX: t.at.x - hw, maxX: t.at.x + hw, minY: t.at.y - hh, maxY: t.at.y + hh };
    if (crossing) return bx.minX <= box.maxX && bx.maxX >= box.minX && bx.minY <= box.maxY && bx.maxY >= box.minY;
    return bx.minX >= box.minX && bx.maxX <= box.maxX && bx.minY >= box.minY && bx.maxY <= box.maxY;
  }).map((t) => t.id);
}

/** Retângulo (anel) da etiqueta, para o realce de hover/seleção. */
export function roomTagRing(p: Project, id: Id, planId?: Id, at?: Vec2): Vec2[] | null {
  const { tags, scale } = visibleRoomTags(p, planId);
  const t = tags.find((x) => x.id === id);
  if (!t) return null;
  const c = at ?? t.at;
  const { hw, hh } = roomTagHalf(scale);
  return [{ x: c.x - hw, y: c.y - hh }, { x: c.x + hw, y: c.y - hh }, { x: c.x + hw, y: c.y + hh }, { x: c.x - hw, y: c.y + hh }];
}
