/**
 * A3b sem wasm: a montagem das colunas novas e a referência (`referenciaA3b`) do motor TypeScript. Prova que (1) as seções
 * têm o formato do esquema v5, (2) a referência é `insertMode`/`insertReturns` + `makeReturnClipper` sobre o pintado de planta,
 * na ordem de `resolveLevel`, e (3) cada decisão de modo muda a saída do TypeScript: se não mudasse nada, a mutação no Rust
 * seria invisível ao teste de equivalência (`kernel-a3b.wasm.test.ts`).
 */
import { ProjectStore, createEmptyProject, makeWall, openingType, type Command, type Opening, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3, referenciaA3b } from '../packages/engine/src/kernelA3.ts';
import { frameOfWall } from '../packages/engine/src/resolve.ts';
import { insertMode, insertReturns } from '../packages/engine/src/wrap.ts';
import { SECOES } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { IDS_TIPOS_ABERTURA_ANTIGOS } from '../scripts/catalogo-estresse.mts';
import { casosDeLimiarA3b, projetoDeEstresseA3a, tiposDeParedeRetorno } from '../scripts/kernel-a3a-estresse.mts';

const ref = (p: Project) => {
  const a1 = montarCenaA1(p);
  const a3 = montarCenaA3(p, a1);
  return p.levels.flatMap((l) => referenciaA3b(p, l.id, a1, a3));
};

describe('A3b: montagem e referência do motor TypeScript', () => {
  it('as seções têm as colunas do esquema v5, com o mesmo comprimento', () => {
    const p = projetoDeEstresseA3a(2, { paredes: 20, pavimentos: 1 });
    const a1 = montarCenaA1(p);
    const a3 = montarCenaA3(p, a1);
    expect(Object.keys(a3.secoes.tipos_abertura)).toEqual(SECOES.tipos_abertura.colunas.map((c) => c.nome));
    expect(Object.keys(a1.secoes.tipos_parede)).toEqual(SECOES.tipos_parede.colunas.map((c) => c.nome));
    for (const v of Object.values(a3.secoes.tipos_abertura)) expect(v.length).toBe(a3.nLinhas.tipos_abertura);
    expect(a3.nLinhas.tipos_abertura).toBeGreaterThan(20);
  });

  it('a referência é insertReturns, na ordem de wallsOnLevel e openingsOfWall, com cobertura dos modos', () => {
    const p = projetoDeEstresseA3a(4, { paredes: 25, pavimentos: 1 });
    const a1 = montarCenaA1(p);
    const a3 = montarCenaA3(p, a1);
    const r = referenciaA3b(p, p.levels[0]!.id, a1, a3);
    expect(r.length).toBeGreaterThan(20);
    let esperados = 0;
    for (const x of r) {
      const [id] = [...a3.aberturaDe].find(([, n]) => n === x.abertura)!;
      const o = p.elements[id] as Parameters<typeof openingType>[1];
      const f = frameOfWall(p, o.hostId)!;
      const ot = openingType(p, o);
      const modo = insertMode(f.type, ot);
      const camadas = insertReturns(f, o.offset, ot.width, modo, { ot, side: o.flipFacing ? -1 : 1 }).map((q) => q.layerIndex);
      expect(camadas).toContain(x.camada);
      esperados++;
    }
    expect(esperados).toBe(r.length);
    const modos = new Set(ref(projetoDeEstresseA3a(1, { paredes: 30, pavimentos: 2 })).map((x) => x.modo));
    expect([...modos].sort()).toEqual([1, 2, 3]);
    for (const x of r) expect(x.modo).toBeGreaterThan(0);
  });

  it('o recorte só tira área do retorno', () => {
    const p = projetoDeEstresseA3a(6, { paredes: 30, pavimentos: 1 });
    const r = ref(p);
    const area = (m: typeof r[number]['bruto']): number => m.reduce((s, pol) => s + pol.reduce((t, a, i) => t + (i === 0 ? 1 : -1) * Math.abs(a.reduce((u, q, k) => u + q.x * a[(k + 1) % a.length]!.y - a[(k + 1) % a.length]!.x * q.y, 0) / 2), 0), 0);
    expect(r.length).toBeGreaterThan(20);
    for (const x of r) expect(area(x.recorte)).toBeLessThanOrEqual(area(x.bruto) + 1e-6);
    expect(r.some((x) => area(x.recorte) < area(x.bruto) - 1e-6)).toBe(true);
  });

  it('as aberturas do projeto de estresse cobrem alizar, estilos, fechamentos e vãos livres', () => {
    const col = (): Set<number> => new Set();
    const vistos = { estilo: col(), fecha: col(), prof: col(), alizar: new Set<number>(), folhas: new Set<number>() };
    for (let s = 1; s <= 8; s++) {
      const p = projetoDeEstresseA3a(s, { paredes: 30, pavimentos: 1 });
      const t = montarCenaA3(p, montarCenaA1(p)).secoes.tipos_abertura;
      t['estilo_batente']!.forEach((x) => vistos.estilo.add(x));
      t['fechamento']!.forEach((x) => vistos.fecha.add(x));
      t['modo_prof']!.forEach((x) => vistos.prof.add(x));
      t['tem_alizar']!.forEach((x) => vistos.alizar.add(x));
      t['folhas']!.forEach((x) => vistos.folhas.add(x));
    }
    expect(vistos.estilo.size).toBe(4);
    expect(vistos.fecha.size).toBe(5);
    expect(vistos.prof.size).toBe(3);
    expect(vistos.alizar.has(1)).toBe(true);
    expect(vistos.folhas.has(0)).toBe(true);
  });
});

describe('A3b: tipos de abertura acrescentados depois dos estresses (portas alu/pvc/vid) têm cobertura', () => {
  // Os geradores não sorteiam estes tipos (ver scripts/catalogo-estresse.mts): aqui cada um recebe uma parede com retorno
  // (`wt_r_both`) e UMA abertura, sozinho, no meio de uma parede de 6 m. Prova que a montagem não lança e a referência roda.
  const catalogo = createEmptyProject().openingTypes;
  const novos = Object.values(catalogo).filter((t) => !IDS_TIPOS_ABERTURA_ANTIGOS.has(t.id));
  it('os antigos são 130 e todos existem no catálogo; os novos são o resto', () => {
    expect(IDS_TIPOS_ABERTURA_ANTIGOS.size).toBe(130);
    for (const id of IDS_TIPOS_ABERTURA_ANTIGOS) expect(catalogo[id]).toBeDefined();
    expect(novos.length).toBeGreaterThanOrEqual(24);
  });
  for (const t of novos) {
    it(`${t.id}: uma abertura numa parede de retorno monta e a referência TS roda`, () => {
      const p = createEmptyProject();
      const parede = tiposDeParedeRetorno(Object.values(p.wallTypes)[0]!).find((w) => w.id === 'wt_r_both')!;
      p.wallTypes[parede.id] = parede;
      const cmds: Command[] = [
        { type: 'addWall', wall: makeWall({ id: 'W', typeId: parede.id, levelId: p.levels[0]!.id, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, locationLine: 'wallCenter', flipped: false, sag: 0, height: 2.8 }) },
        { type: 'addOpening', opening: { id: 'O', kind: t.kind, typeId: t.id, hostId: 'W', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening },
      ];
      const store = new ProjectStore(p);
      store.exec({ type: 'batch', commands: cmds });
      const q = store.project;
      const a1 = montarCenaA1(q);
      const a3 = montarCenaA3(q, a1);
      expect(a3.aberturaDe.size).toBe(1);
      // Nem todo tipo gera retorno (batente sem caixilho, por exemplo): o que se prova é que a referência roda e devolve uma lista.
      const r = referenciaA3b(q, q.levels[0]!.id, a1, a3);
      expect(Array.isArray(r)).toBe(true);
      for (const x of r) expect(x.modo).toBeGreaterThan(0);
    });
  }
});

describe('A3b: cada limiar de decisão muda a saída do motor TypeScript entre os dois lados', () => {
  const porLimiar = new Map<string, Partial<Record<'abaixo' | 'acima', Project>>>();
  for (const c of casosDeLimiarA3b()) porLimiar.set(c.limiar, { ...porLimiar.get(c.limiar), [c.lado]: c.projeto });
  for (const [limiar, lados] of porLimiar) {
    it(limiar, () => {
      const a = ref(lados.abaixo!);
      const b = ref(lados.acima!);
      expect(JSON.stringify(a.map((x) => [x.camada, x.bruto]))).not.toBe(JSON.stringify(b.map((x) => [x.camada, x.bruto])));
    });
  }
});
