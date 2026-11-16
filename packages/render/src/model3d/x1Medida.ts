import { junctionLevel, levelFrames, resolveLevel, tangentAt, analyzeLevelTilt, type WallFrame } from '@hestia/engine';
import { ProjectStore, createEmptyProject, layerPriority, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { wallLayerSolid, type SolidBatch } from './solids.ts';

/** X1: construção de projetos sintéticos e medição de fresta, sobreposição e corte por cota (método da J5, `projetosDoDono.test.ts`). */
export type P = { x: number; y: number };
export interface W { id: string; a: P; b: P; tilt?: number; sag?: number }
export type Seg = [number, number, number, number];

export const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });

/** `camadas`: espessuras (camada única de concreto) ou `'padrao'` = parede multicamada padrão `wt_alv14` (tinta, reboco, bloco, reboco, tinta). */
export function build(walls: W[], height: number, camadas: number[] | 'padrao' = [0.2]): Project {
  const base = createEmptyProject();
  if (camadas !== 'padrao') base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: camadas.map(camada) };
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  for (const w of walls) {
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: camadas === 'padrao' ? 'wt_alv14' : 'wt_t', levelId: 'lv_0', height, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall });
  }
  return s.project;
}

/** Seção horizontal (segmentos) de cada camada da parede na cota z. */
export function secaoPorCamada(p: Project, id: string, z: number, rl = resolveLevel(p, 'lv_0'), jl = junctionLevel(p, 'lv_0')): Seg[][] {
  const rw = rl.walls[id]!;
  const out: Seg[][] = [];
  for (const l of rw.layers) {
    const b: SolidBatch = wallLayerSolid(rw, l, jl);
    const segs: Seg[] = [];
    for (let i = 0; i < b.indices.length; i += 3) {
      const t = [0, 1, 2].map((j) => [0, 1, 2].map((c) => b.positions[b.indices[i + j]! * 3 + c]!));
      const pts: number[][] = [];
      for (let j = 0; j < 3; j++) {
        const a = t[j]!, c = t[(j + 1) % 3]!;
        const da = a[2]! - z, dc = c[2]! - z;
        if (Math.abs(da) < 1e-9 && Math.abs(dc) < 1e-9) continue;
        if (Math.abs(da) < 1e-9) pts.push([a[0]!, a[1]!]);
        else if (da * dc < 0) { const k = da / (da - dc); pts.push([a[0]! + k * (c[0]! - a[0]!), a[1]! + k * (c[1]! - a[1]!)]); }
      }
      const u: number[][] = [];
      for (const q of pts) if (!u.some((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!) < 1e-9)) u.push(q);
      if (u.length === 2) segs.push([u[0]![0]!, u[0]![1]!, u[1]![0]!, u[1]![1]!]);
    }
    out.push(segs);
  }
  return out;
}
export const dentro = (s: Seg[], x0: number, y0: number): boolean => {
  // desloca o raio 0,12 µm: um canto da tampa que cai exatamente na altura de um vértice da vizinha dava paridade errada (falso "dentro")
  const x = x0, y = y0 + 1.2345e-7;
  let c = false;
  for (const [x1, y1, x2, y2] of s) if ((y1 > y) !== (y2 > y) && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) c = !c;
  return c;
};
export const distSeg = (s: Seg[], x: number, y: number): number => {
  let m = 1e9;
  for (const [x1, y1, x2, y2] of s) {
    const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l));
    m = Math.min(m, Math.hypot(x1 + t * dx - x, y1 + t * dy - y));
  }
  return m;
};
const emAlguma = (L: Seg[][], x: number, y: number): boolean => L.some((s) => dentro(s, x, y));
const distAlguma = (L: Seg[][], x: number, y: number): number => Math.min(...L.map((s) => distSeg(s, x, y)));

/** Pontos das tampas (arestas de extremidade, não paralelas ao eixo) da ponta `w` perto do nó `no`. */
export function tampas(A: Seg[][], g: WallFrame, w: 'a' | 'b', no: P, raio = 0.9): Array<[number, number, number]> {
  const t0 = tangentAt(g, w === 'a' ? 0 : g.length);
  const out: Array<[number, number, number]> = [];
  for (const [li, s] of A.entries()) for (const [x1, y1, x2, y2] of s) {
    const l = Math.hypot(x2 - x1, y2 - y1);
    if (l < 1e-6) continue;
    if (Math.hypot((x1 + x2) / 2 - no.x, (y1 + y2) / 2 - no.y) > raio) continue;
    if (Math.abs((x2 - x1) * t0.x + (y2 - y1) * t0.y) / l > 0.75) continue;
    for (let k = 0; k <= 10; k++) out.push([x1 + ((x2 - x1) * k) / 10, y1 + ((y2 - y1) * k) / 10, li]);
  }
  return out;
}

export interface MedidaT { fresta: number; sobrep: number; frestaG: number; sobrepG: number; onde: string }

/**
 * T: a tampa do ramo (ponta `w` perto de `no`) contra a seção da hospedeira. Fresta = distância da tampa ao corpo da hospedeira (união das camadas)
 * quando está fora; sobreposição = profundidade da tampa dentro das camadas da hospedeira de prioridade igual ou mais forte que a camada do ramo.
 */
export function medirT(p: Project, ramo: string, w: 'a' | 'b', host: string, no: P, z: number, rl = resolveLevel(p, 'lv_0'), jl = junctionLevel(p, 'lv_0')): MedidaT {
  const fr = new Map(levelFrames(p, 'lv_0').map((f) => [f.wall.id, f] as const));
  const R = secaoPorCamada(p, ramo, z, rl, jl), H = secaoPorCamada(p, host, z, rl, jl);
  const tr = p.wallTypes[(p.elements[ramo] as Wall).typeId]!, th = p.wallTypes[(p.elements[host] as Wall).typeId]!;
  const lay = (id: string, tipo: typeof tr, li: number): Layer => tipo.layers[rl.walls[id]!.layers[li]!.layerIndex]!;
  let fresta = 0, sobrep = 0, frestaG = 0, sobrepG = 0, onde = '';
  for (const [x, y, li] of tampas(R, fr.get(ramo)!, w, no)) {
    const lr = lay(ramo, tr, li);
    const grossa = lr.thickness >= 0.005;
    const fortes = H.filter((_, hi) => layerPriority(lay(host, th, hi)) <= layerPriority(lr));
    const eDentro = emAlguma(fortes, x, y);
    if (eDentro) {
      const e = Math.min(...fortes.filter((s) => dentro(s, x, y)).map((s) => distSeg(s, x, y)));
      sobrep = Math.max(sobrep, e);
      if (grossa) sobrepG = Math.max(sobrepG, e);
    }
    if (!emAlguma(H, x, y)) {
      const d = distAlguma(H, x, y);
      if (d > fresta) onde = `fresta camada ${li} (${x.toFixed(4)}, ${y.toFixed(4)})`; // units-ok: mensagem de diagnóstico de teste
      fresta = Math.max(fresta, d);
      if (grossa) frestaG = Math.max(frestaG, d);
    }
  }
  return { fresta, sobrep, frestaG, sobrepG, onde };
}

/** Volume do sólido (malha fechada). */
export function volume(b: SolidBatch): number {
  const pt = (i: number): number[] => [b.positions[i * 3]!, b.positions[i * 3 + 1]!, b.positions[i * 3 + 2]!];
  let v = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const a = pt(b.indices[i]!), c = pt(b.indices[i + 1]!), d = pt(b.indices[i + 2]!);
    v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
  }
  return v;
}
/** Malha fechada: cada aresta dirigida tem a oposta (vértices soldados a 1e-6). */
export function fechada(b: SolidBatch): boolean {
  const pt = (i: number): number[] => [b.positions[i * 3]!, b.positions[i * 3 + 1]!, b.positions[i * 3 + 2]!];
  const k = (i: number): string => pt(i).map((x) => x.toFixed(6)).join(','); // units-ok: chave de teste
  const m = new Map<string, number>();
  for (let i = 0; i < b.indices.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = k(b.indices[i + j]!), c = k(b.indices[i + (j + 1) % 3]!);
    if (a === c) continue;
    m.set(`${a}>${c}`, (m.get(`${a}>${c}`) ?? 0) + 1);
  }
  for (const [e, n] of m) { const [a, c] = e.split('>'); if (m.get(`${c}>${a}`) !== n) return false; }
  return true;
}
/** Volume (soma das camadas) da parede com o projeto inteiro. */
export function volumeParede(p: Project, id: string): { vol: number; fechada: boolean } {
  const rl = resolveLevel(p, 'lv_0'), jl = junctionLevel(p, 'lv_0');
  const rw = rl.walls[id]!;
  let vol = 0, ok = true;
  for (const l of rw.layers) { const b = wallLayerSolid(rw, l, jl); vol += volume(b); ok = ok && fechada(b); }
  return { vol, fechada: ok };
}
export const avisosDe = (p: Project, H: number, ids: string[]): string[] => {
  const rl = resolveLevel(p, 'lv_0');
  const heights = new Map(Object.values(rl.walls).map((w) => [w.wallId, w.height] as const));
  void H;
  return [...new Set(analyzeLevelTilt(levelFrames(p, 'lv_0'), heights).avisos.filter((a) => ids.includes(a.wallId)).map((a) => a.code))];
};

/** Área (em metros quadrados) em que a união das seções difere da união das seções "ideais" (cada parede sozinha), numa janela em torno de `c`. `vazio` = ideal e não real (abertura); `excesso` = real e não ideal. */
export function cobertura(real: Seg[][][], ideal: Seg[][][], c: P, meio = 2.0, passo = 0.025, mascara?: (x: number, y: number) => boolean): { vazio: number; excesso: number; maiorVazio: number; centro?: P } {
  /** `mascara` (T): só vale para a 2ª parede (o ramo) do conjunto ideal: a parte dele além do eixo da hospedeira não existe. */
  const emU = (U: Seg[][][], x: number, y: number, ideal2 = false): boolean => U.some((w, i) => (!ideal2 || i === 0 || !mascara || mascara(x, y)) && w.some((l) => dentro(l, x, y)));
  let vazio = 0, excesso = 0;
  const pontosVazios: P[] = [];
  for (let x = c.x - meio; x <= c.x + meio; x += passo) for (let y = c.y - meio; y <= c.y + meio; y += passo) {
    const a = emU(real, x, y), b = emU(ideal, x, y, true);
    if (b && !a) { vazio += passo * passo; pontosVazios.push({ x, y }); }
    if (a && !b) excesso += passo * passo;
  }
  let maior = 0;
  for (const p of pontosVazios) for (const q of pontosVazios) maior = Math.max(maior, Math.hypot(p.x - q.x, p.y - q.y));
  const centro = pontosVazios.length ? { x: pontosVazios.reduce((a, q) => a + q.x, 0) / pontosVazios.length, y: pontosVazios.reduce((a, q) => a + q.y, 0) / pontosVazios.length } : undefined;
  return { vazio, excesso, maiorVazio: maior, ...(centro ? { centro } : {}) };
}
