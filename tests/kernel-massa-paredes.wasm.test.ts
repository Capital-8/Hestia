/**
 * Massa conceitual, ficha D2 (docs/massa/PLANO.md, A.7 e A.10): as paredes geradas pela massa com o kernel REAL. M1 (caixa 10 × 6) em um nível
 * dá 4 paredes que fecham o retângulo, sem aviso de junção; M2 (cilindro r = 5) dá uma cadeia fechada com segmentos ≥ 0,40 m e a tolerância de
 * 5 cm respeitada; M3 (torre torcida) em dois níveis dá contornos girados entre si (a torção vira degrau por pavimento). O serviço é o
 * `ServicoMassa` do motor sobre o `GerenciadorKernelV2` real, como em `kernel-massa-pisos.wasm.test.ts`. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, comandoDerivarParedes, isWall, validateProject, type Id, type Project, type Wall } from '@hestia/model';
import { ServicoMassa, derivarContornosParedesDaMassa, TOLERANCIA_PAREDE_PADRAO, SEGMENTO_MINIMO_PADRAO, type CadeiaParede } from '../packages/engine/src/index.ts';
import { projetoComMassas } from '../packages/engine/src/fixtureMassa.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

const srv = (): ServicoMassa => new ServicoMassa(() => ger);

/** Distância entre dois pontos. */
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Distância de um ponto ao segmento a–b. */
function distSeg(q: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = dx * dx + dy * dy;
  const t = k === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / k));
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

/** Gira um ponto em torno da origem. */
const gira = (q: Vec2, ang: number): Vec2 => ({ x: q.x * Math.cos(ang) - q.y * Math.sin(ang), y: q.x * Math.sin(ang) + q.y * Math.cos(ang) });

/** Gera as paredes de uma massa nos níveis dados (uma cadeia por contorno, altura até o próximo nível dentro da massa). */
function geraParedes(p: Project, massaId: Id, niveis: Id[]): { store: ProjectStore; cadeias: CadeiaParede[] } {
  const d = derivarContornosParedesDaMassa(p, massaId, niveis, {}, srv());
  expect(d).not.toBeNull();
  const store = new ProjectStore(p);
  const tipo = Object.keys(p.wallTypes)[0]!;
  const cadeias = d!.porNivel.flatMap((n) => n.cadeias);
  store.exec(
    comandoDerivarParedes(store.project, {
      massaId,
      typeId: tipo,
      niveis,
      cadeias: d!.porNivel.flatMap((n) => n.cadeias.map((pontos) => ({ nivelId: n.nivelId, pontos, topoNivelId: n.topoNivelId, altura: n.altura }))),
    }),
  );
  expect(cadeias.length).toBeGreaterThan(0);
  return { store, cadeias };
}

const paredesDo = (p: Project): Wall[] => Object.values(p.elements).filter(isWall);

describe('massa D2: paredes geradas sobre o kernel real', () => {
  it.skipIf(!bytes)('M1 caixa 10 × 6 num nível: 4 paredes fechando o retângulo, sem aviso de junção', () => {
    const p = projetoComMassas();
    const antes = validateProject(p).filter((i) => i.severity === 'error').length;
    const { store } = geraParedes(p, 'm1', ['lv_0']);
    const ws = paredesDo(store.project);
    expect(ws).toHaveLength(4);
    for (const w of ws) expect(Math.abs(dist(w.a, w.b) - 10) < 1e-6 || Math.abs(dist(w.a, w.b) - 6) < 1e-6).toBe(true);
    const ids = new Set(ws.map((w) => w.id));
    const issues = validateProject(store.project);
    expect(issues.filter((i) => i.severity === 'error').length).toBe(antes);
    expect(issues.filter((i) => i.elementId && ids.has(i.elementId))).toEqual([]);
  });

  it.skipIf(!bytes)('M2 cilindro r = 5: cadeia fechada, segmentos ≥ 0,40 m e cada vértice original perto (até 5 cm) da cadeia', () => {
    const p = projetoComMassas();
    const d = derivarContornosParedesDaMassa(p, 'm2', ['lv_0'], {}, srv());
    expect(d).not.toBeNull();
    const cadeia = d!.porNivel[0]!.cadeias[0]!;
    expect(cadeia.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < cadeia.length; i++) expect(dist(cadeia[i]!, cadeia[(i + 1) % cadeia.length]!)).toBeGreaterThanOrEqual(SEGMENTO_MINIMO_PADRAO);
    // O contorno original tem 64 vértices de raio 5 (M2 do kernel); a cadeia simplificada nunca se afasta mais que a tolerância.
    for (let k = 0; k < 64; k++) {
      const q = { x: 5 * Math.cos((2 * Math.PI * k) / 64), y: 5 * Math.sin((2 * Math.PI * k) / 64) };
      const menor = Math.min(...cadeia.map((a, i) => distSeg(q, a, cadeia[(i + 1) % cadeia.length]!)));
      expect(menor).toBeLessThanOrEqual(TOLERANCIA_PAREDE_PADRAO + 1e-9);
    }
  });

  it.skipIf(!bytes)('M3 torre torcida em dois níveis: os contornos são girados entre si (degrau por pavimento) e nenhum segmento fica abaixo do mínimo', () => {
    const p = projetoComMassas();
    const { cadeias } = geraParedes(p, 'm3', ['lv_2', 'lv_4']);
    expect(cadeias).toHaveLength(2);
    const [a, b] = cadeias as [Vec2[], Vec2[]];
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(4);
    for (const c of cadeias) for (let i = 0; i < c.length; i++) expect(dist(c[i]!, c[(i + 1) % c.length]!)).toBeGreaterThanOrEqual(SEGMENTO_MINIMO_PADRAO);
    // A torção de 0 a 90° em 30 m: entre 6 m e 12 m são 18°. Um dos dois sentidos tem que casar os vértices (1e-3 m).
    const casa = (ang: number): boolean => a.every((q) => Math.min(...b.map((r) => dist(gira(q, ang), r))) < 1e-3);
    expect(casa(Math.PI / 10) || casa(-Math.PI / 10)).toBe(true);
  });

  it.skipIf(!bytes)('M3: um desfazer tira todas as paredes e rodar de novo não duplica', () => {
    const p = projetoComMassas();
    const { store } = geraParedes(p, 'm3', ['lv_2', 'lv_4']);
    const n = paredesDo(store.project).length;
    expect(n).toBe(8);
    const tipo = Object.keys(p.wallTypes)[0]!;
    const d = derivarContornosParedesDaMassa(store.project, 'm3', ['lv_2', 'lv_4'], {}, srv())!;
    store.exec(
      comandoDerivarParedes(store.project, {
        massaId: 'm3',
        typeId: tipo,
        niveis: ['lv_2', 'lv_4'],
        cadeias: d.porNivel.flatMap((x) => x.cadeias.map((pontos) => ({ nivelId: x.nivelId, pontos, topoNivelId: x.topoNivelId, altura: x.altura }))),
      }),
    );
    expect(paredesDo(store.project)).toHaveLength(n);
    // Um desfazer volta à geração anterior (8 paredes); o segundo tira todas.
    store.undo();
    expect(paredesDo(store.project)).toHaveLength(n);
    store.undo();
    expect(paredesDo(store.project)).toHaveLength(0);
  });
});
