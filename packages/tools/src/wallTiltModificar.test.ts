/**
 * F2.11 (docs/parede-formas/METODOLOGIA.md): comandos de modificar preservam a inclinação. Matriz comandos × {reta, arco} ×
 * tilt {+15°, −15°}. O aceite é geométrico: depois do comando, o eixo da parede nas cotas z = 0, 1,5 e 3 (`axisAtLevel`:
 * extremos e ápice) bate com o esperado a 1e-9, não só o campo `tilt`. Nos comandos que movem o corpo rígido (Mover, Copiar,
 * Girar, Matriz) e no Espelhar o esperado é a imagem dos pontos de nível da parede original, sem passar pelo campo.
 * Parede de teste: a=(0,0), b=(6,0); arco com sag=1,5 (R=3,75, centro (3; −2,25), à direita de a→b). Filete: não existe para parede.
 */
import { describe, expect, it } from 'vitest';
import { axisAtLevel } from '../../engine/src/wallTilt.ts';
import type { Vec2 } from '@hestia/geom';
import { makeWall, type Wall } from '@hestia/model';
import { clickAt, makeEnv, P, tool, walls } from './testEnv.ts';
import { DEFAULT_SNAP } from './types.ts';

type Ctx = ReturnType<typeof makeEnv>;
type Forma = 'reta' | 'arco';
const FORMAS: readonly Forma[] = ['reta', 'arco'];
const TILTS = [15, -15] as const;
const ZS = [0, 1.5, 3] as const;
const TOL = 1e-9;

/** Pontos de conferência de um eixo: extremos e ápice (meio da corda deslocado pela flecha, + = esquerda de a→b). */
const pts = (a: Vec2, b: Vec2, sag: number): Vec2[] => {
  const dx = b.x - a.x, dy = b.y - a.y, c = Math.hypot(dx, dy);
  return [a, b, { x: (a.x + b.x) / 2 - (dy / c) * sag, y: (a.y + b.y) / 2 + (dx / c) * sag }];
};
const nivel = (w: Pick<Wall, 'a' | 'b' | 'sag'> & { tilt?: number }, z: number): Vec2[] => {
  const ax = axisAtLevel(w.a, w.b, w.sag, z, w.tilt ?? 0);
  return pts(ax.a, ax.b, ax.sag);
};
const perto = (obt: Vec2[], esp: Vec2[], rot: string): void => {
  expect(obt, rot).toHaveLength(esp.length);
  esp.forEach((e, i) => {
    expect(obt[i]!.x, `${rot} [${i}].x`).toBeCloseTo(e.x, 9);
    expect(obt[i]!.y, `${rot} [${i}].y`).toBeCloseTo(e.y, 9);
  });
};
/** O eixo da parede obtida, nas três cotas, bate com o esperado (parede literal). */
function confere(w: Wall, esp: { a: Vec2; b: Vec2; sag: number; tilt: number }, rot: string): void {
  expect(w.tilt, `${rot}: tilt`).toBeCloseTo(esp.tilt, 9);
  for (const z of ZS) perto(nivel(w, z), nivel(esp, z), `${rot} z=${z}`);
}
/** Idem, para uma imagem T dos pontos de nível da parede original `o`. */
function conferePorImagem(w: Wall, o: Wall, T: (p: Vec2) => Vec2, rot: string): void {
  for (const z of ZS) perto(nivel(w, z), nivel(o, z).map(T), `${rot} z=${z}`);
}

function criar(forma: Forma, tilt: number): { c: Ctx; w: Wall } {
  const c = makeEnv();
  Object.assign(c.options, { offsetCopy: false, mirrorCopy: false, rotateCopy: false, snap: { ...DEFAULT_SNAP, enabled: false }, alignPrefer: 'eixos' });
  const wall = makeWall({ id: 'W', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3, sag: forma === 'arco' ? 1.5 : 0, tilt });
  c.store.exec({ type: 'addWall', wall });
  c.env.setSelection(['W']);
  return { c, w: wall };
}
/** Referência vertical (sem tilt) x=`x`, de y=-6 a y=6. */
const referenciaX = (c: Ctx, x: number): void => c.store.exec({ type: 'addWall', wall: makeWall({ id: 'REF', typeId: 'wt_alv14', levelId: 'lv_0', a: { x, y: -6 }, b: { x, y: 6 } }) });
const porId = (c: Ctx, id: string): Wall => walls(c.store).find((w) => w.id === id)!;

describe('F2.11 · comandos de modificar × {reta, arco} × tilt ±15°', () => {
  for (const forma of FORMAS) for (const tilt of TILTS) {
    const nome = `${forma} ${tilt > 0 ? '+' : '−'}15°`;

    it(`Mover (1,2) · ${nome}`, () => {
      const { c, w } = criar(forma, tilt);
      const t = tool('move', c.env);
      clickAt(t, 0, 0);
      clickAt(t, 1, 2);
      conferePorImagem(porId(c, 'W'), w, (p) => ({ x: p.x + 1, y: p.y + 2 }), 'Mover');
      expect(porId(c, 'W').tilt).toBe(tilt);
    });

    it(`Copiar (0,8) · ${nome}: original intacta, cópia inclinada igual`, () => {
      const { c, w } = criar(forma, tilt);
      const t = tool('copy', c.env);
      clickAt(t, 0, 0);
      clickAt(t, 0, 8);
      t.cancel();
      const ws = walls(c.store);
      expect(ws).toHaveLength(2);
      conferePorImagem(ws.find((x) => x.id === 'W')!, w, (p) => p, 'Copiar original');
      conferePorImagem(ws.find((x) => x.id !== 'W')!, w, (p) => ({ x: p.x, y: p.y + 8 }), 'Copiar cópia');
    });

    it(`Girar 90° em (0,0) · ${nome}: (x,y) vira (−y,x); o tilt não troca`, () => {
      const { c, w } = criar(forma, tilt);
      const t = tool('rotate', c.env);
      clickAt(t, 0, 0);
      expect(t.type('90')).toBe(true);
      conferePorImagem(porId(c, 'W'), w, (p) => ({ x: -p.y, y: p.x }), 'Girar');
      expect(porId(c, 'W').tilt).toBe(tilt);
    });

    it(`Espelhar em y=1 · ${nome}: o sinal do tilt inverte e o plano é a imagem do original`, () => {
      const { c, w } = criar(forma, tilt);
      const t = tool('mirror', c.env);
      clickAt(t, -5, 1);
      clickAt(t, 5, 1);
      const m = porId(c, 'W');
      expect(m.tilt).toBe(-tilt);
      conferePorImagem(m, w, (p) => ({ x: p.x, y: 2 - p.y }), 'Espelhar');
    });

    it(`Espelhar em x=3 (eixo vertical, mantém a↔b na imagem) · ${nome}`, () => {
      const { c, w } = criar(forma, tilt);
      const t = tool('mirror', c.env);
      clickAt(t, 3, -5);
      clickAt(t, 3, 5);
      const m = porId(c, 'W');
      expect(m.tilt).toBe(-tilt);
      conferePorImagem(m, w, (p) => ({ x: 6 - p.x, y: p.y }), 'Espelhar x');
    });

    it(`Matriz linear 3 itens, espaçamento 10 · ${nome}: as cópias levam o mesmo tilt`, () => {
      const { c, w } = criar(forma, tilt);
      c.options.arrayCount = 3;
      const t = tool('array', c.env);
      clickAt(t, 0, 0);
      t.move(P(10, 0));
      expect(t.type('10')).toBe(true);
      const ws = walls(c.store);
      expect(ws).toHaveLength(3);
      const dx = ws.map((x) => x.a.x).sort((p, q) => p - q);
      expect(dx[0]).toBeCloseTo(0, 9);
      expect(dx[1]).toBeCloseTo(10, 9);
      expect(dx[2]).toBeCloseTo(20, 9);
      for (const x of ws) conferePorImagem(x, w, (p) => ({ x: p.x + x.a.x, y: p.y }), `Matriz +${x.a.x}`);
    });

    it(`Deslocar 0,5 m · ${nome}: a linha de base anda e o tilt fica`, () => {
      const { c } = criar(forma, tilt);
      const t = tool('offset', c.env);
      c.options.offsetDistance = 0.5;
      clickAt(t, 3, forma === 'arco' ? 1.5 : 0);
      const o = porId(c, 'W');
      expect(o.tilt).toBe(tilt);
      if (forma === 'reta') {
        const y = o.a.y;
        expect(Math.abs(y)).toBeCloseTo(0.5, 9);
        confere(o, { a: { x: 0, y }, b: { x: 6, y }, sag: 0, tilt }, 'Deslocar');
      } else {
        // Concêntrico: R = 3,75 ± 0,5, mesmo centro (3; −2,25), extremos na mesma direção radial.
        const R = Math.hypot(o.a.x - 3, o.a.y + 2.25);
        expect(Math.abs(R - 3.75)).toBeCloseTo(0.5, 9);
        const k = R / 3.75;
        const a = { x: 3 + (0 - 3) * k, y: -2.25 + (0 + 2.25) * k }, b = { x: 3 + (6 - 3) * k, y: -2.25 + (0 + 2.25) * k };
        confere(o, { a, b, sag: R - (R * 2.25) / 3.75, tilt }, 'Deslocar');
      }
    });

    it(`Deslocar com Cadeia · ${nome}: cada parede da cadeia mantém o seu tilt`, () => {
      const c = makeEnv();
      Object.assign(c.options, { offsetCopy: false, offsetChain: true, offsetDistance: 0.5, snap: { ...DEFAULT_SNAP, enabled: false } });
      const dif = [tilt, -tilt] as const;
      c.store.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, height: 3, tilt: dif[0] }) });
      c.store.exec({ type: 'addWall', wall: makeWall({ id: 'B', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 4, y: 0 }, b: { x: 4, y: 4 }, height: 3, tilt: dif[1] }) });
      const t = tool('offset', c.env);
      clickAt(t, 2, 0.01);
      const a = porId(c, 'A'), b = porId(c, 'B');
      expect(a.tilt).toBe(dif[0]);
      expect(b.tilt).toBe(dif[1]);
      // Base deslocada 0,5 pelo mesmo lado (a linha de A passa a y=±0,5; a de B a x=4∓0,5), canto recalculado.
      expect(Math.abs(a.a.y)).toBeCloseTo(0.5, 9);
      expect(a.b.x).toBeCloseTo(b.a.x, 9);
      expect(a.b.y).toBeCloseTo(b.a.y, 9);
      const ya = a.a.y;
      confere(a, { a: a.a, b: { x: a.b.x, y: ya }, sag: 0, tilt: dif[0] }, 'Cadeia A');
      confere(b, { a: b.a, b: b.b, sag: 0, tilt: dif[1] }, 'Cadeia B');
    });

    it(`Aparar numa referência · ${nome}: a parede para na referência e conserva o plano`, () => {
      const { c } = criar(forma, tilt);
      c.options.trimMode = 'varios';
      referenciaX(c, forma === 'arco' ? 1.5 : 3);
      const t = tool('trim', c.env);
      clickAt(t, 0.75, 0.75 * (forma === 'arco' ? 1 : 0), { shift: true });
      clickAt(t, forma === 'arco' ? 1.5 : 3, 5);
      const o = porId(c, 'W');
      if (forma === 'reta') confere(o, { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, sag: 0, tilt }, 'Aparar');
      else {
        expect(o.tilt).toBe(tilt);
        expect(o.b.x).toBeCloseTo(1.5, 9);
        expect(o.b.y).toBeCloseTo(-2.25 + Math.sqrt(11.8125), 9);
        // Mesmo círculo (centro (3; −2,25), R=3,75) depois de aparar: o raio do nível z é o do original.
        const ax = axisAtLevel(o.a, o.b, o.sag, 3, tilt);
        const R3 = 3.75 + Math.sign(1.5) * 3 * Math.tan((tilt * Math.PI) / 180);
        expect(Math.hypot(ax.a.x - 3, ax.a.y + 2.25)).toBeCloseTo(R3, 9);
        expect(Math.hypot(ax.b.x - 3, ax.b.y + 2.25)).toBeCloseTo(R3, 9);
      }
    });

    it(`Estender até uma referência · ${nome}: o plano segue o mesmo`, () => {
      const c = makeEnv();
      Object.assign(c.options, { trimMode: 'varios', snap: { ...DEFAULT_SNAP, enabled: false } });
      const curto = forma === 'reta' ? { b: { x: 2, y: 0 }, sag: 0 } : { b: { x: 6, y: 0 }, sag: 1.5 };
      c.store.exec({ type: 'addWall', wall: makeWall({ id: 'W', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, height: 3, tilt, ...curto }) });
      referenciaX(c, forma === 'reta' ? 4 : 6.5);
      const t = tool('trim', c.env);
      clickAt(t, forma === 'reta' ? 1.9 : 5.5, forma === 'reta' ? 0 : 0.5, { shift: true });
      clickAt(t, forma === 'reta' ? 4 : 6.5, 5);
      const o = porId(c, 'W');
      if (forma === 'reta') confere(o, { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, sag: 0, tilt }, 'Estender');
      else {
        expect(o.tilt).toBe(tilt);
        expect(o.b.x).toBeCloseTo(6.5, 9);
        const R3 = 3.75 + 3 * Math.tan((tilt * Math.PI) / 180);
        const ax = axisAtLevel(o.a, o.b, o.sag, 3, tilt);
        expect(Math.hypot(ax.b.x - 3, ax.b.y + 2.25)).toBeCloseTo(R3, 9);
      }
    });

    it(`Alinhar numa reta de referência · ${nome}: a parede anda e o tilt fica`, () => {
      const { c } = criar(forma, tilt);
      c.store.exec({ type: 'addWall', wall: makeWall({ id: 'REF', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: -10, y: -5 }, b: { x: 10, y: -5 } }) });
      const t = tool('align', c.env);
      clickAt(t, 3, -5);
      clickAt(t, 3, forma === 'arco' ? 1.5 : 0);
      const o = porId(c, 'W');
      expect(o.tilt).toBe(tilt);
      expect(o.sag).toBeCloseTo(forma === 'arco' ? 1.5 : 0, 9);
      // Mesma forma da original transladada em y; a base fica sobre a referência (corda ou ápice).
      const dy = o.a.y;
      expect(o.b.y).toBeCloseTo(dy, 9);
      confere(o, { a: { x: 0, y: dy }, b: { x: 6, y: dy }, sag: forma === 'arco' ? 1.5 : 0, tilt }, 'Alinhar');
      expect(forma === 'arco' ? dy + 1.5 : dy).toBeCloseTo(-5, 9);
    });

    it(`Dividir em x=3 · ${nome}: os dois pedaços mantêm o tilt e os níveis casam com os do original`, () => {
      const { c, w } = criar(forma, tilt);
      const t = tool('split', c.env);
      clickAt(t, 3, forma === 'arco' ? 1.5 : 0);
      const ws = walls(c.store);
      expect(ws).toHaveLength(2);
      for (const x of ws) expect(x.tilt).toBe(tilt);
      const ini = ws.find((x) => Math.abs(x.a.x) < 1e-9)!;
      const fim = ws.find((x) => x !== ini)!;
      // Extremos externos do eixo no nível z = os do original no mesmo nível.
      for (const z of ZS) {
        const o = nivel(w, z);
        const p = nivel(ini, z), q = nivel(fim, z);
        perto([p[0]!, q[1]!], [o[0]!, o[1]!], `Dividir extremos z=${z}`);
        // O ponto de corte no nível z é comum aos dois pedaços.
        perto([p[1]!], [q[0]!], `Dividir corte z=${z}`);
      }
      // Pedaço do arco: mesmo círculo do original no nível z=3.
      if (forma === 'arco') {
        const R3 = 3.75 + 3 * Math.tan((tilt * Math.PI) / 180);
        for (const x of [ini, fim]) {
          const ax = axisAtLevel(x.a, x.b, x.sag, 3, tilt);
          expect(Math.hypot(ax.a.x - 3, ax.a.y + 2.25)).toBeCloseTo(R3, 9);
          expect(Math.hypot(ax.b.x - 3, ax.b.y + 2.25)).toBeCloseTo(R3, 9);
        }
      }
    });
  }

  it('trocar a↔b (regra, sem comando no código): sag e tilt de sinais invertidos descrevem os mesmos planos', () => {
    // Não há comando que troque a com b numa parede existente; a regra vale para quem o criar (e para o desenho invertido de
    // formas): o eixo no nível z de (b, a, −sag, −tilt) é o de (a, b, sag, tilt).
    for (const sag of [0, 1.5]) for (const tilt of TILTS) {
      const o = { a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, sag, tilt };
      const r = { a: o.b, b: o.a, sag: -sag, tilt: -tilt };
      for (const z of ZS) {
        const p = nivel(o, z), q = nivel(r, z);
        perto([q[1]!, q[0]!, q[2]!], p, `a↔b sag=${sag} tilt=${tilt} z=${z}`);
      }
    }
  });

  it('Filete não existe para parede: nenhuma ferramenta de filete registrada', () => {
    const c = makeEnv();
    expect(() => tool('fillet' as never, c.env)).toThrow();
  });
});
