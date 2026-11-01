/**
 * Topologia das paredes (v3): aplica locationLine nos "degraus de eixo" e recalcula as pontas para que as pontas coincidam
 * (<= 0,02 m), os T caiam no eixo da hospedeira e os L se encontrem no cruzamento das linhas de locação.
 * O corpo de cada parede fica onde o dado manda; só a linha de locação (a,b) muda.
 */
export type V = { x: number; y: number };
export type LocLine = 'wallCenter' | 'finishExterior' | 'finishInterior';
export interface PNode {
  id: string; espessura_m: number; a_local: number[]; b_local: number[];
  junta_inicio?: string | null; junta_inicio_tipo?: string | null; junta_fim?: string | null; junta_fim_tipo?: string | null;
  face_rente?: Array<{ com: string; lado: string; ponta: string }>; ordem_criacao_sugerida: number;
}
export interface PAdj { id: string; a: V; b: V; ca: V; cb: V; loc: LocLine; espessura: number; order: number }

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p: V, q: V, k = 1): V => ({ x: p.x + q.x * k, y: p.y + q.y * k });
const len = (p: V): number => Math.hypot(p.x, p.y);
const v = (a: number[]): V => ({ x: a[0]!, y: a[1]! });

export function ajustaPlanta(ws: PNode[], log: (s: string) => void): Map<string, PAdj> {
  const byId = new Map(ws.map((w) => [w.id, w]));
  const dirOf = (w: PNode): V => { const d = sub(v(w.b_local), v(w.a_local)); const L = len(d); return { x: d.x / L, y: d.y / L }; };
  // 1) lado rente de cada parede (todas as pontas concordam e o parceiro rente tem o mesmo lado físico)
  const loc = new Map<string, LocLine>();
  let conflitos = 0;
  for (const w of ws) {
    const lados = new Set((w.face_rente ?? []).map((f) => f.lado));
    if (lados.size === 1) loc.set(w.id, [...lados][0] === 'dir' ? 'finishInterior' : 'finishExterior');
    else if (lados.size > 1) { conflitos++; log(`  conflito de lado rente em ${w.id}: ${[...lados]}`); }
  }
  // 2) linha de locação de cada parede
  const line = new Map<string, { a: V; b: V; ca: V; cb: V; loc: LocLine }>();
  for (const w of ws) {
    const l = loc.get(w.id) ?? 'wallCenter';
    const u = dirOf(w), n = { x: -u.y, y: u.x };
    const off = l === 'wallCenter' ? 0 : l === 'finishInterior' ? -w.espessura_m / 2 : w.espessura_m / 2;
    line.set(w.id, { a: add(v(w.a_local), n, off), b: add(v(w.b_local), n, off), ca: v(w.a_local), cb: v(w.b_local), loc: l });
  }
  // o parceiro rente tem que cair na mesma linha: senão volta ao centro
  for (const w of ws) {
    const l = line.get(w.id)!;
    if (l.loc === 'wallCenter') continue;
    for (const f of w.face_rente ?? []) {
      const o = line.get(f.com);
      if (!o || o.loc === 'wallCenter') continue;
      const u = dirOf(w), n = { x: -u.y, y: u.x };
      const d = Math.abs((o.a.x - l.a.x) * n.x + (o.a.y - l.a.y) * n.y);
      if (d > 0.002) log(`  AVISO linha rente de ${w.id} x ${f.com} difere ${d.toFixed(4)} m`);
    }
  }
  const inter = (p1: V, d1: V, p2: V, d2: V): V | null => {
    const c = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(c) < 0.1) return null;
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / c;
    return add(p1, d1, t);
  };
  const proj = (p: V, q: V, d: V): V => add(q, d, (p.x - q.x) * d.x + (p.y - q.y) * d.y);
  // 3) novas pontas
  const novas = new Map<string, { a: V; b: V }>();
  let movidas = 0, maior = 0;
  for (const w of ws) {
    const l = line.get(w.id)!, u = dirOf(w);
    const fim: V[] = [];
    for (const [end, p0] of [['a', v(w.a_local)], ['b', v(w.b_local)]] as const) {
      const pid = end === 'a' ? w.junta_inicio : w.junta_fim, tipo = end === 'a' ? w.junta_inicio_tipo : w.junta_fim_tipo;
      const par = pid ? byId.get(pid) : undefined;
      const lp = par ? line.get(par.id)! : undefined;
      const alterado = l.loc !== 'wallCenter' || (lp !== undefined && tipo !== 'T' && lp.loc !== 'wallCenter');
      let q: V = proj(p0, l.a, u);
      if (!alterado) q = p0;
      else if (par && lp && (tipo === 'L' || tipo === 'X')) {
        const up = dirOf(par);
        q = inter(l.a, u, lp.a, up) ?? q;
      } else if (par && lp && tipo === 'T') {
        const up = dirOf(par);
        q = inter(l.a, u, v(par.a_local), up) ?? q;
      } else if (par && lp && (tipo === 'degrau_eixo' || tipo === 'continuacao')) {
        const op = Math.abs(dirOf(par).x * u.x + dirOf(par).y * u.y) > 0.999 ? (() => {
          const pa = v(par.a_local), pb = v(par.b_local);
          const po = len(sub(pa, p0)) <= len(sub(pb, p0)) ? pa : pb;
          return po;
        })() : p0;
        q = proj({ x: (p0.x + op.x) / 2, y: (p0.y + op.y) / 2 }, l.a, u);
      }
      const d = len(sub(q, p0));
      if (alterado && d > 1e-6) { movidas++; if (d > maior) maior = d; }
      if (d > 0.35) log(`  AVISO ${w.id} ponta ${end} movida ${d.toFixed(3)} m (${tipo})`);
      fim.push(q);
    }
    novas.set(w.id, { a: fim[0]!, b: fim[1]! });
  }
  log(`  locationLine: ${[...loc.values()].filter((x) => x === 'finishInterior').length} finishInterior, ${[...loc.values()].filter((x) => x === 'finishExterior').length} finishExterior, conflitos ${conflitos}; pontas movidas ${movidas} (máx ${maior.toFixed(3)} m)`);
  // 4) resultado: pontas na linha de locação e eixo real (centro do corpo)
  const out = new Map<string, PAdj>();
  for (const w of ws) {
    const l = line.get(w.id)!, e = novas.get(w.id)!;
    const u = dirOf(w), n = { x: -u.y, y: u.x };
    const off = l.loc === 'wallCenter' ? 0 : l.loc === 'finishInterior' ? -w.espessura_m / 2 : w.espessura_m / 2;
    // e.a/e.b já estão na linha de locação (projetados/intersectados), exceto quando 'alterado' é falso (eixo = linha)
    const a = { x: r3(e.a.x), y: r3(e.a.y) }, b = { x: r3(e.b.x), y: r3(e.b.y) };
    out.set(w.id, { id: w.id, a, b, ca: add(a, n, -off), cb: add(b, n, -off), loc: l.loc, espessura: w.espessura_m, order: w.ordem_criacao_sugerida });
  }
  return out;
}
