/**
 * F1.6 (docs/parede-formas/METODOLOGIA.md, Fase 1): matriz dos comandos de modificar × {círculo, elipse, hexágono} sobre as
 * paredes com forma da F1.2/F1.3. Só testes; defeito achado virou `it.fails` (resolvidos na F1.9).
 *
 * Cada caso cria a forma pela ferramenta Parede, aplica o comando sem UI e confere: contagem de paredes, pontas coincidentes a
 * 1e-6 m (cadeia fechada), tangência nos arcos (círculo e elipse; o hexágono tem cantos, então só confere a coincidência),
 * `joinStatus` das pontas e um valor literal (ex.: Mover (1,2) desloca cada ponta exatamente (1,2)).
 *
 * Captura desligada (`snap.enabled = false`): com ela o cursor se encaixa em pontos da própria forma e o valor deixa de ser o
 * clicado. Filete não entra: não há ferramenta de filete para parede (só `sketchShapes*` e `perimeterToolShape`).
 *
 * Os valores literais estão escritos aqui (círculo r=3, elipse 4×2, hexágono inscrito r=3); nada é recalculado pelo código testado.
 * Sobre os vizinhos: a parede movida por um comando isolado estica a ponta compartilhada com a vizinha (a ponta anda junto).
 * Isso fecha a forma quando todas as paredes se movem de forma consistente, e a deforma quando só uma se move.
 */
import { describe, expect, it } from 'vitest';
import { joinStatus, levelFrames } from '@hestia/engine';
import type { Vec2 } from '@hestia/geom';
import type { Wall } from '@hestia/model';
import { clickAt, drawWall, makeEnv, P, tool, walls } from './testEnv.ts';
import { DEFAULT_SNAP } from './types.ts';

type Forma = 'circulo' | 'elipse' | 'hexagono';
const FORMAS: readonly Forma[] = ['circulo', 'elipse', 'hexagono'];
const TOL = 1e-6;
const SNAP_OFF = { ...DEFAULT_SNAP, enabled: false };

/** Pontas iniciais literais: círculo (r=3), elipse (4×2, pontos cardeais) e hexágono inscrito (r=3, um vértice em (3,0)). */
const ANCORAS: Record<Forma, Vec2[]> = {
  circulo: [{ x: -3, y: 0 }, { x: 3, y: 0 }],
  elipse: [{ x: 4, y: 0 }, { x: 0, y: 2 }, { x: -4, y: 0 }, { x: 0, y: -2 }],
  hexagono: [
    { x: 3, y: 0 }, { x: 1.5, y: -2.598076 }, { x: -1.5, y: -2.598076 },
    { x: -3, y: 0 }, { x: -1.5, y: 2.598076 }, { x: 1.5, y: 2.598076 },
  ],
};

type Ctx = ReturnType<typeof criar>;

/** Forma pela ferramenta Parede (captura desligada) e, depois, a seleção com todas as suas paredes. */
function criar(forma: Forma) {
  const ctx = makeEnv();
  Object.assign(ctx.options, {
    wallShape: forma === 'circulo' ? 'circle' : forma === 'elipse' ? 'ellipse' : 'polygon',
    wallPolygonSides: 6, offsetCopy: false, mirrorCopy: false, rotateCopy: false, offsetDistance: 0.5, snap: SNAP_OFF,
  });
  const w = tool('wall', ctx.env);
  if (forma === 'elipse') {
    clickAt(w, 0, 0);
    clickAt(w, 4, 0);
    clickAt(w, 0, 2);
  } else {
    clickAt(w, 0, 0);
    clickAt(w, 3, 0);
  }
  ctx.options.wallShape = 'line';
  ctx.env.setSelection(todas(ctx).map((x) => x.id));
  return ctx;
}

const todas = (ctx: Ctx): Wall[] => walls(ctx.store);
const porId = (ctx: Ctx, id: string): Wall => todas(ctx).find((w) => w.id === id)!;
const pontas = (ws: readonly Wall[]): Vec2[] => ws.flatMap((w) => [w.a, w.b]);
const perto = (p: Vec2, q: Vec2, tol = TOL): boolean => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
const contem = (lista: readonly Vec2[], p: Vec2): boolean => lista.some((q) => perto(p, q));
const distintas = (ps: readonly Vec2[]): Vec2[] => ps.reduce<Vec2[]>((acc, p) => (contem(acc, p) ? acc : [...acc, p]), []);
const desloc = (ps: readonly Vec2[], dx: number, dy: number): Vec2[] => ps.map((p) => ({ x: p.x + dx, y: p.y + dy }));
const fmt = (p: Vec2): string => `(${p.x.toFixed(6)}, ${p.y.toFixed(6)})`;
const ang = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));

/** Mesmo conjunto de pontas distintas (cada esperada presente, nenhuma sobrando). */
function mesmoConjunto(obtidos: readonly Vec2[], esperados: readonly Vec2[], rotulo: string): void {
  const A = distintas(obtidos);
  const B = distintas(esperados);
  expect(A.length, `${rotulo}: pontas distintas ${A.map(fmt).join(' ')}`).toBe(B.length);
  for (const p of B) expect(contem(A, p), `${rotulo}: falta a ponta ${fmt(p)}`).toBe(true);
}

/** Pontos literais presentes entre as pontas (subconjunto). */
function contemLiterais(obtidos: readonly Vec2[], literais: readonly Vec2[], rotulo: string): void {
  for (const p of literais) expect(contem(obtidos, p), `${rotulo}: falta ${fmt(p)}`).toBe(true);
}

/** Cada ponta encontra exatamente uma ponta de outra parede a 1e-6 m (cadeia fechada, sem ponta livre). */
function cadeiaFechada(ws: readonly Wall[]): void {
  ws.forEach((w, i) => (['a', 'b'] as const).forEach((e) => {
    const p = w[e];
    const pares = ws.flatMap((v, j) => (j === i ? [] : (['a', 'b'] as const).filter((f) => perto(v[f], p))));
    expect(pares.length, `ponta ${w.id}.${e} ${fmt(p)} tem ${pares.length} pares, esperado 1`).toBe(1);
  }));
}

/** Direção em que a curva sai da ponta `e` (flecha com sinal; Θ = 4·atan(2s/c)). Na ponta `b` o sentido é o inverso da chegada. */
function sai(w: Wall, e: 'a' | 'b'): number {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const c = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx);
  const theta = w.sag === 0 ? 0 : 4 * Math.atan((2 * w.sag) / c);
  return e === 'a' ? phi + theta / 2 : phi - theta / 2 + Math.PI;
}

/** Em cada ponta coincidente, as duas curvas saem em sentidos opostos (tangência). Vale para círculo e elipse, não para hexágono. */
function cadeiaTangente(ws: readonly Wall[]): void {
  ws.forEach((w, i) => (['a', 'b'] as const).forEach((e) => {
    ws.forEach((v, j) => {
      if (j === i) return;
      (['a', 'b'] as const).forEach((f) => {
        if (!perto(v[f], w[e])) return;
        const d = ang(sai(w, e) - sai(v, f) - Math.PI);
        expect(Math.abs(d), `ponta ${w.id}.${e} não é tangente a ${v.id}.${f} (erro ${d} rad)`).toBeLessThan(TOL);
      });
    });
  }));
}

/** `joinStatus` de todas as pontas do conjunto (ordem: a, b de cada parede). */
function estados(ctx: Ctx, ws: readonly Wall[]): string[] {
  const fr = levelFrames(ctx.store.project, 'lv_0');
  return ws.flatMap((w) => (['a', 'b'] as const).map((e) => joinStatus(fr, w.id, e).kind));
}

/** Pontas sem par (`joinStatus` free) do conjunto. */
function livres(ctx: Ctx, ws: readonly Wall[]): Vec2[] {
  const fr = levelFrames(ctx.store.project, 'lv_0');
  return ws.flatMap((w) => (['a', 'b'] as const).filter((e) => joinStatus(fr, w.id, e).kind === 'free').map((e) => w[e]));
}

/** Ápice do arco (ou meio da reta): ponto da flecha sobre o eixo. Flecha positiva à esquerda de a→b. */
function apice(w: Wall): Vec2 {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const c = Math.hypot(dx, dy);
  const n = { x: -dy / c, y: dx / c };
  return { x: (w.a.x + w.b.x) / 2 + w.sag * n.x, y: (w.a.y + w.b.y) / 2 + w.sag * n.y };
}

/** Arco da elipse que cruza x=1 no semiplano de cima (corda de (0; 2) a (2,191; 1,675)). */
const arcoQueCruzaX1 = (ctx: Ctx): Wall =>
  todas(ctx).find((w) => Math.min(w.a.x, w.b.x) < 1 && Math.max(w.a.x, w.b.x) > 1 && w.a.y > 0 && w.b.y > 0)!;

/** Reta de referência horizontal y=-5 (eixo), para o Alinhar. */
function referenciaHorizontal(ctx: Ctx): string {
  drawWall(ctx.env, [-10, -5], [10, -5]);
  return todas(ctx).at(-1)!.id;
}

describe('F1.6 · matriz de modificar × forma (círculo, elipse, hexágono)', () => {
  for (const f of FORMAS) {
    it(`pré-condição · ${f}: pontas literais, cadeia fechada, joinStatus pair`, () => {
      const c = criar(f);
      contemLiterais(pontas(todas(c)), ANCORAS[f], `${f} inicial`);
      cadeiaFechada(todas(c));
      expect(estados(c, todas(c)).every((k) => k === 'pair')).toBe(true);
    });
  }

  // ─── Mover ────────────────────────────────────────────────────────────────────────────────────────────────────────────

  for (const f of FORMAS) {
    it(`Mover (1,2) · ${f}: cada ponta desloca exatamente (1,2); contagem, cadeia e joinStatus mantidos; desfazer volta`, () => {
      const c = criar(f);
      const pre = pontas(todas(c));
      const n = todas(c).length;
      const t = tool('move', c.env);
      clickAt(t, 0, 0);
      clickAt(t, 1, 2);
      const ws = todas(c);
      expect(ws).toHaveLength(n);
      contemLiterais(pontas(ws), desloc(ANCORAS[f], 1, 2), `Mover ${f}`);
      mesmoConjunto(pontas(ws), desloc(pre, 1, 2), `Mover ${f}`);
      cadeiaFechada(ws);
      if (f !== 'hexagono') cadeiaTangente(ws);
      expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
      c.store.undo();
      mesmoConjunto(pontas(todas(c)), pre, `Mover ${f} desfeito`);
    });
  }

  // ─── Copiar ───────────────────────────────────────────────────────────────────────────────────────────────────────────

  for (const f of FORMAS) {
    it(`Copiar (0,8) · ${f}: a original fica, a cópia tem ids novos e pontas em (0,8)`, () => {
      const c = criar(f);
      const pre = pontas(todas(c));
      const antes = todas(c).map((w) => w.id);
      const t = tool('copy', c.env);
      clickAt(t, 0, 0);
      clickAt(t, 0, 8);
      t.cancel();
      const ws = todas(c);
      expect(ws).toHaveLength(2 * antes.length);
      const originais = ws.filter((w) => antes.includes(w.id));
      const copias = ws.filter((w) => !antes.includes(w.id));
      expect(copias).toHaveLength(antes.length);
      mesmoConjunto(pontas(originais), pre, `Copiar ${f} original`);
      contemLiterais(pontas(copias), desloc(ANCORAS[f], 0, 8), `Copiar ${f} cópia`);
      mesmoConjunto(pontas(copias), desloc(pre, 0, 8), `Copiar ${f} cópia`);
      cadeiaFechada(originais);
      cadeiaFechada(copias);
      if (f !== 'hexagono') cadeiaTangente(copias);
      expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
    });
  }

  // ─── Girar ────────────────────────────────────────────────────────────────────────────────────────────────────────────

  for (const f of FORMAS) {
    it(`Girar 90° em (0,0) · ${f}: (x,y) vira (-y,x); o sag não muda`, () => {
      const c = criar(f);
      const pre = pontas(todas(c));
      const sags = new Map(todas(c).map((w) => [w.id, w.sag]));
      const t = tool('rotate', c.env);
      clickAt(t, 0, 0);
      expect(t.type('90')).toBe(true);
      const ws = todas(c);
      const girar = (p: Vec2): Vec2 => ({ x: -p.y, y: p.x });
      contemLiterais(pontas(ws), ANCORAS[f].map(girar), `Girar ${f}`);
      mesmoConjunto(pontas(ws), pre.map(girar), `Girar ${f}`);
      for (const w of ws) expect(w.sag).toBeCloseTo(sags.get(w.id)!, 9);
      cadeiaFechada(ws);
      if (f !== 'hexagono') cadeiaTangente(ws);
      expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
    });
  }

  // ─── Espelhar ─────────────────────────────────────────────────────────────────────────────────────────────────────────

  for (const f of FORMAS) {
    it(`Espelhar em y=1 · ${f}: (x,y) vira (x,2-y) e o sag troca de sinal`, () => {
      const c = criar(f);
      const pre = pontas(todas(c));
      const sags = new Map(todas(c).map((w) => [w.id, w.sag]));
      const t = tool('mirror', c.env);
      clickAt(t, -5, 1);
      clickAt(t, 5, 1);
      const ws = todas(c);
      const espelhar = (p: Vec2): Vec2 => ({ x: p.x, y: 2 - p.y });
      contemLiterais(pontas(ws), ANCORAS[f].map(espelhar), `Espelhar ${f}`);
      mesmoConjunto(pontas(ws), pre.map(espelhar), `Espelhar ${f}`);
      for (const w of ws) expect(w.sag).toBeCloseTo(-sags.get(w.id)!, 9);
      cadeiaFechada(ws);
      if (f !== 'hexagono') cadeiaTangente(ws);
      expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
    });
  }

  // ─── Matriz ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // F1.9: `copiesOverlap` passou a comparar a geometria real do arco (corda + flecha), então as cópias dos dois semicírculos
  // (mesma corda, flechas opostas) não se sobrepõem e a matriz do círculo é aceita.

  for (const f of FORMAS) {
    it(`Matriz linear 3 itens, espaçamento 10 · ${f}`, () => {
      const c = criar(f);
      const pre = pontas(todas(c));
      const n = todas(c).length;
      c.options.arrayCount = 3;
      const t = tool('array', c.env);
      clickAt(t, 0, 0);
      t.move(P(10, 0));
      expect(t.type('10')).toBe(true);
      const ws = todas(c);
      expect(ws).toHaveLength(3 * n);
      mesmoConjunto(pontas(ws), [...pre, ...desloc(pre, 10, 0), ...desloc(pre, 20, 0)], `Matriz ${f}`);
      expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
    });
  }

  // ─── Deslocar ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Deslocar move uma parede por clique (concêntrico nos arcos). Círculo: um clique em cada arco. Hexágono: um clique em cada
  // lado. Elipse: um clique no ápice de cada um dos 16 arcos.

  it('Deslocar 0,5 m · círculo: arcos de fora viram raio 3,5 e de dentro raio 2,5', () => {
    const fora = criar('circulo');
    const tf = tool('offset', fora.env);
    clickAt(tf, 0, 3.02); // Cadeia: um clique desloca os dois arcos
    const wf = todas(fora);
    expect(wf).toHaveLength(2);
    mesmoConjunto(pontas(wf), [{ x: -3.5, y: 0 }, { x: 3.5, y: 0 }], 'Deslocar fora');
    for (const w of wf) expect(w.sag).toBeCloseTo(3.5, 6);
    cadeiaFechada(wf);
    cadeiaTangente(wf);
    expect(estados(fora, wf).every((k) => k === 'pair')).toBe(true);

    const dentro = criar('circulo');
    const td = tool('offset', dentro.env);
    clickAt(td, 0, 2.98);
    const wd = todas(dentro);
    expect(wd).toHaveLength(2);
    mesmoConjunto(pontas(wd), [{ x: -2.5, y: 0 }, { x: 2.5, y: 0 }], 'Deslocar dentro');
    for (const w of wd) expect(w.sag).toBeCloseTo(2.5, 6);
    cadeiaFechada(wd);
    cadeiaTangente(wd);
  });

  // Opção "Cadeia" (F1.9, padrão ligada): um clique num lado desloca a cadeia inteira de paredes em junção pair pelo mesmo lado,
  // com os cantos recalculados; o hexágono continua hexágono (apótema 2,598076 + 0,5 = 3,098076) e o círculo/elipse mantêm tangência.
  it('Deslocar 0,5 m · hexágono com Cadeia: um clique leva os 6 lados ao apótema 3,098076, paralelos aos originais', () => {
    const c = criar('hexagono');
    const antes = todas(c);
    const meios = antes.map((w) => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }));
    const t = tool('offset', c.env);
    clickAt(t, meios[0]!.x * 1.02, meios[0]!.y * 1.02);
    const ws = todas(c);
    expect(ws).toHaveLength(6);
    antes.forEach((w, i) => {
      const m = meios[i]!;
      const k = Math.hypot(m.x, m.y);
      const normal = { x: m.x / k, y: m.y / k };
      const depois = porId(c, w.id);
      expect(normal.x * depois.a.x + normal.y * depois.a.y, `lado ${w.id} ponta a`).toBeCloseTo(3.098076, 5);
      expect(normal.x * depois.b.x + normal.y * depois.b.y, `lado ${w.id} ponta b`).toBeCloseTo(3.098076, 5);
      // Paralelo ao original: mesmo vetor a→b.
      expect(depois.b.x - depois.a.x, `lado ${w.id} dx`).toBeCloseTo((w.b.x - w.a.x) * (3.098076 / 2.598076), 5);
      expect(depois.b.y - depois.a.y, `lado ${w.id} dy`).toBeCloseTo((w.b.y - w.a.y) * (3.098076 / 2.598076), 5);
    });
    // Vértice literal: o vértice (3, 0) vai para (3,098076 / cos 30° = 3,577350; 0).
    contemLiterais(pontas(ws), [{ x: 3.57735, y: 0 }], 'Deslocar hexágono');
    cadeiaFechada(ws);
    expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
  });

  it('Deslocar 0,5 m · hexágono com Cadeia desligada: comportamento de parede única (só o lado clicado anda)', () => {
    const c = criar('hexagono');
    c.options.offsetChain = false;
    const antes = todas(c);
    const m = { x: (antes[0]!.a.x + antes[0]!.b.x) / 2, y: (antes[0]!.a.y + antes[0]!.b.y) / 2 };
    clickAt(tool('offset', c.env), m.x * 1.02, m.y * 1.02);
    const ws = todas(c);
    expect(ws).toHaveLength(6);
    antes.slice(1).forEach((w, i) => {
      const d = porId(c, w.id);
      const lados = [d.a, d.b].filter((p) => !contem([w.a, w.b], p)).length;
      expect(lados, `lado ${i + 1}`).toBeLessThanOrEqual(1);
    });
  });

  it('Deslocar 0,5 m · elipse: os 16 arcos saem 0,5 m; os cardeais vão para (4,5; 0), (0; 2,5), (-4,5; 0), (0; -2,5)', () => {
    const c = criar('elipse');
    const alvos = todas(c).map((w) => apice(w));
    const t = tool('offset', c.env);
    clickAt(t, alvos[0]!.x * 1.01, alvos[0]!.y * 1.01); // Cadeia: um clique desloca os 16 arcos
    const ws = todas(c);
    expect(ws).toHaveLength(16);
    contemLiterais(pontas(ws), [{ x: 4.5, y: 0 }, { x: 0, y: 2.5 }, { x: -4.5, y: 0 }, { x: 0, y: -2.5 }], 'Deslocar elipse');
    cadeiaFechada(ws);
    cadeiaTangente(ws);
    expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
  });

  // ─── Aparar/Estender (canto, modo padrão) ─────────────────────────────────────────────────────────────────────────────
  // No modo padrão, Aparar corta as duas paredes no canto (como `trimAlignArc.test.ts`); a referência também para no canto.

  it('Aparar no canto · círculo: arco de cima para em (1; 2√2) com flecha 3−√3; referência para no mesmo canto', () => {
    const c = criar('circulo');
    const [arco1, arco2] = todas(c).map((w) => w.id) as [string, string];
    drawWall(c.env, [1, -5], [1, 5]);
    const ref = todas(c).at(-1)!.id;
    const t = tool('trim', c.env);
    clickAt(t, -2, 2.2360679775);
    clickAt(t, 1, 0);
    const ws = todas(c);
    expect(ws).toHaveLength(3);
    const a1 = porId(c, arco1);
    expect(a1.a.x).toBeCloseTo(-3, 9);
    expect(a1.a.y).toBeCloseTo(0, 9);
    expect(a1.b.x).toBeCloseTo(1, 9);
    expect(a1.b.y).toBeCloseTo(2.8284271, 6);
    expect(a1.sag).toBeCloseTo(1.2679492, 6);
    const a2 = porId(c, arco2);
    mesmoConjunto([a2.a, a2.b], [{ x: 3, y: 0 }, { x: -3, y: 0 }], 'arco de baixo intacto');
    expect(a2.sag).toBeCloseTo(3, 9);
    const r = porId(c, ref);
    expect(r.a.y).toBeCloseTo(-5, 9);
    expect(r.b.x).toBeCloseTo(1, 9);
    expect(r.b.y).toBeCloseTo(2.8284271, 6);
    // Pontas sem par: (3,0) do arco de baixo, que perdeu o vizinho, e (1,-5) da referência. O canto (1; 2√2) é par.
    mesmoConjunto(livres(c, ws), [{ x: 3, y: 0 }, { x: 1, y: -5 }], 'pontas livres');
    expect(estados(c, ws).filter((k) => k === 'pair')).toHaveLength(4);
  });

  it('Aparar no canto · hexágono: lado V0V1 para em (2; −√3); referência para no mesmo canto', () => {
    const c = criar('hexagono');
    const [lado] = todas(c).map((w) => w.id);
    drawWall(c.env, [2, -5], [2, 5]);
    const ref = todas(c).at(-1)!.id;
    const t = tool('trim', c.env);
    clickAt(t, 2.7, -0.5196);
    clickAt(t, 2, 0);
    const ws = todas(c);
    expect(ws).toHaveLength(7);
    const l = porId(c, lado!);
    mesmoConjunto([l.a, l.b], [{ x: 3, y: 0 }, { x: 2, y: -1.732051 }], 'lado V0V1 aparado');
    const r = porId(c, ref);
    mesmoConjunto([r.a, r.b], [{ x: 2, y: -1.732051 }, { x: 2, y: 5 }], 'referência no canto');
    mesmoConjunto(livres(c, ws), [{ x: 1.5, y: -2.598076 }, { x: 2, y: 5 }], 'pontas livres');
  });

  it('Aparar no canto · elipse: arco que cruza x=1 para no canto (1; ≈1,93649); referência para no mesmo canto', () => {
    const c = criar('elipse');
    const alvo = arcoQueCruzaX1(c);
    const p = apice(alvo);
    drawWall(c.env, [1, -5], [1, 5]);
    const ref = todas(c).at(-1)!.id;
    const t = tool('trim', c.env);
    clickAt(t, p.x, p.y);
    clickAt(t, 1, 0);
    const ws = todas(c);
    expect(ws).toHaveLength(17);
    const cortado = porId(c, alvo.id);
    const canto = [cortado.a, cortado.b].find((q) => Math.abs(q.x - 1) < TOL);
    expect(canto, 'o arco aparado tem uma ponta em x = 1').toBeDefined();
    // Tolerância de 5 mm: o ajuste da elipse (S3) tem desvio de até 4,94 mm; y da elipse exata em x=1 é √15/2 = 1,9364917.
    expect(Math.abs(canto!.y - 1.9364917)).toBeLessThan(0.005);
    const r = porId(c, ref);
    mesmoConjunto([r.a, r.b], [{ x: 1, y: -5 }, canto!], 'referência no canto');
    mesmoConjunto(livres(c, ws), [{ x: 0, y: 2 }, { x: 1, y: -5 }], 'pontas livres');
  });

  // ─── Dividir ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Não é defeito: `cutOn` (splitTool.ts) arredonda o comprimento de arco à grade de 0,1 m (snap de grade do desenho) quando o clique
  // está a até 5 px. Num arco isso move o corte ao longo da curva em no máximo meia célula (0,05 m): círculo, clique em (0; 3,02)
  // corta em (-0,0124; 3,0000); elipse, 12 mm do ápice. Por isso o teste aceita o corte a até 0,05 m do ponto clicado.
  // Parede reta e o meio do lado do hexágono (comprimento 1,5, múltiplo de 0,1) cortam exato.
  const MEIA_CELULA = 0.05;
  const novaPonta = (ws: readonly Wall[], antes: readonly Vec2[]): Vec2 => {
    const novas = distintas(pontas(ws)).filter((q) => !contem(antes, q));
    expect(novas, 'o corte cria exatamente uma ponta nova').toHaveLength(1);
    return novas[0]!;
  };

  it('Dividir no ápice · círculo: corte na grade de 0,1 m, a até meia célula de (0; 3), sobre o círculo r=3', () => {
    const c = criar('circulo');
    const antes = pontas(todas(c));
    const t = tool('split', c.env);
    clickAt(t, 0, 3.02);
    const ws = todas(c);
    expect(ws).toHaveLength(3);
    const q = novaPonta(ws, antes);
    expect(Math.hypot(q.x - 0, q.y - 3)).toBeLessThanOrEqual(MEIA_CELULA);
    expect(Math.hypot(q.x, q.y), 'o corte fica sobre o círculo').toBeCloseTo(3, 6);
    cadeiaFechada(ws);
    expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
  });

  it('Dividir no meio do lado · hexágono: corte em (0; 2,598076), 7 paredes, cadeia fechada, joinStatus pair', () => {
    const c = criar('hexagono');
    const t = tool('split', c.env);
    clickAt(t, 0, 2.62);
    const ws = todas(c);
    expect(ws).toHaveLength(7);
    expect(contem(pontas(ws), { x: 0, y: 2.598076 }), 'corte esperado em (0; 2,598076)').toBe(true);
    cadeiaFechada(ws);
    expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
  });

  it('Dividir no ápice do arco · elipse: corte na grade de 0,1 m, a até meia célula do ápice; cadeia tangente', () => {
    const c = criar('elipse');
    const antes = pontas(todas(c));
    const p = apice(arcoQueCruzaX1(c));
    const t = tool('split', c.env);
    clickAt(t, p.x, p.y);
    const ws = todas(c);
    expect(ws).toHaveLength(17);
    const q = novaPonta(ws, antes);
    expect(Math.hypot(q.x - p.x, q.y - p.y), `corte ${fmt(q)} a até meia célula do ápice ${fmt(p)}`).toBeLessThanOrEqual(MEIA_CELULA);
    cadeiaFechada(ws);
    cadeiaTangente(ws);
    expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
  });

  // ─── Alinhar ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Alinhar move a parede clicada até a referência; as vizinhas da cadeia esticam nas pontas compartilhadas. Referência: reta y=-5.
  // Círculo: os dois arcos se encontram nas duas pontas, então a cadeia inteira anda junto e a forma se move (passa).

  it('Alinhar à reta y=-5 · círculo: a tangente de baixo vai para y=-5; a cadeia desloca (0; -2)', () => {
    const c = criar('circulo');
    c.options.alignPrefer = 'eixos';
    const ref = referenciaHorizontal(c);
    const t = tool('align', c.env);
    clickAt(t, 0, -5);
    clickAt(t, 0, -3);
    const ws = todas(c).filter((w) => w.id !== ref);
    mesmoConjunto(pontas(ws), desloc(ANCORAS.circulo, 0, -2), 'Alinhar círculo');
    for (const w of ws) expect(w.sag).toBeCloseTo(3, 9);
    expect(porId(c, ref).a.y).toBeCloseTo(-5, 9);
    cadeiaFechada(ws);
    cadeiaTangente(ws);
    expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
  });

  // Não é defeito: Alinhar move só a parede clicada e as vizinhas esticam nas pontas compartilhadas (semântica existente, igual para
  // qualquer parede). A forma inteira não translada; o que se confere é a ponta alinhada, as demais pontas no lugar, a cadeia
  // fechada (pontas coincidentes) e o `joinStatus` pair.
  it('Alinhar à reta y=-5 · hexágono: o lado de baixo vai para y=-5, os vizinhos esticam; pontas coincidentes e pair', () => {
    const c = criar('hexagono');
    c.options.alignPrefer = 'eixos';
    const ref = referenciaHorizontal(c);
    const t = tool('align', c.env);
    clickAt(t, 0, -5);
    clickAt(t, 0, -2.598076);
    const ws = todas(c).filter((w) => w.id !== ref);
    expect(ws).toHaveLength(6);
    // Vértices de baixo em (±1,5; -5); os outros quatro ficam onde estavam.
    mesmoConjunto(pontas(ws), [
      { x: 3, y: 0 }, { x: 1.5, y: -5 }, { x: -1.5, y: -5 },
      { x: -3, y: 0 }, { x: -1.5, y: 2.598076 }, { x: 1.5, y: 2.598076 },
    ], 'Alinhar hexágono');
    cadeiaFechada(ws);
    expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
  });

  // Elipse: o arco de baixo vai para y=-5 e os vizinhos esticam; a tangência do anel não se mantém (consequência da mesma semântica).
  it('Alinhar à reta y=-5 · elipse: o arco de baixo vai para (0; -5), os cardeais restantes ficam; pontas coincidentes e pair', () => {
    const c = criar('elipse');
    c.options.alignPrefer = 'eixos';
    const ref = referenciaHorizontal(c);
    const t = tool('align', c.env);
    clickAt(t, 0, -5);
    clickAt(t, 0, -2);
    const ws = todas(c).filter((w) => w.id !== ref);
    expect(ws).toHaveLength(16);
    contemLiterais(pontas(ws), [{ x: 0, y: -5 }, { x: 4, y: 0 }, { x: -4, y: 0 }, { x: 0, y: 2 }], 'Alinhar elipse');
    expect(Math.min(...pontas(ws).map((p) => p.y))).toBeCloseTo(-5, 9);
    cadeiaFechada(ws);
    expect(estados(c, ws).every((k) => k === 'pair')).toBe(true);
  });
});
