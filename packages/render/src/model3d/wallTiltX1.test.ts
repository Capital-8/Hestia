import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { junctionLevel, limparCachesDeConteudo, resolveLevel } from '@hestia/engine';
import { wallLayerSolid } from './solids.ts';
import { avisosDe, build, cobertura, medirT, secaoPorCamada, volumeParede, type P, type W } from './x1Medida.ts';

/** X1 · encontro no MEIO do eixo (T) e cruzamento (X) com arco inclinado. Diagnóstico e aceite (docs/parede-formas/diagnostico-x1.md). */
const H = 3;
const mm = (v: number): string => (v * 1000).toFixed(3);
const HOST_ARCO: W = { id: 'H', a: { x: 0, y: -3 }, b: { x: 0, y: 3 }, sag: 1 }; // arco R=5, centro (4,0), meio do eixo em (-1,0)
const HOST_RETA: W = { id: 'H', a: { x: 0, y: -3 }, b: { x: 0, y: 3 } };
const NO_ARCO: P = { x: -1, y: 0 };
const NO_RETA: P = { x: 0, y: 0 };

interface CasoT { nome: string; host: W; ramo: W; no: P }
const CASOS_T: CasoT[] = [
  { nome: 'T1 reta→arco, lado convexo', host: HOST_ARCO, ramo: { id: 'R', a: { x: -4, y: 0 }, b: NO_ARCO }, no: NO_ARCO },
  { nome: 'T1 reta→arco, lado côncavo', host: HOST_ARCO, ramo: { id: 'R', a: { x: 3, y: 0 }, b: NO_ARCO }, no: NO_ARCO },
  { nome: 'T2 arco→reta, lado esquerdo', host: HOST_RETA, ramo: { id: 'R', a: { x: -4, y: -2 }, b: NO_RETA, sag: 0.5 }, no: NO_RETA },
  { nome: 'T2 arco→reta, lado direito', host: HOST_RETA, ramo: { id: 'R', a: { x: 4, y: 2 }, b: NO_RETA, sag: 0.5 }, no: NO_RETA },
  { nome: 'T3 arco→arco, lado convexo', host: HOST_ARCO, ramo: { id: 'R', a: { x: -4, y: -2 }, b: NO_ARCO, sag: 0.4 }, no: NO_ARCO },
  { nome: 'T3 arco→arco, lado côncavo', host: HOST_ARCO, ramo: { id: 'R', a: { x: 3, y: 2 }, b: NO_ARCO, sag: 0.4 }, no: NO_ARCO },
];
/** [tilt da hospedeira, tilt do ramo] */
const TILTS: Array<[number, number]> = [[15, 15], [-10, -10], [15, -10], [-20, 30], [0, 15], [15, 0], [0, 0]];
const ZS = [0.01, H * 0.4973, H - 0.01];

/** Lado do ramo em relação ao eixo da hospedeira na cota z (a parte do ramo sozinho além do eixo não existe na junção). */
function ladoDoRamo(c: CasoT, th: number, z: number): (x: number, y: number) => boolean {
  const t = Math.tan((th * Math.PI) / 180);
  const h = c.host;
  if (!h.sag) {
    const ux = h.b.x - h.a.x, uy = h.b.y - h.a.y, l = Math.hypot(ux, uy), nx = -uy / l, ny = ux / l;
    const sd = (x: number, y: number): number => (x - h.a.x) * nx + (y - h.a.y) * ny - z * t;
    const lado = Math.sign(sd(c.ramo.a.x, c.ramo.a.y));
    return (x, y) => sd(x, y) * lado >= 0;
  }
  // arco do host: centro (4,0), R = 5, centro à direita de a→b (k = +1): raio do eixo na cota z = 5 + z·tan
  const R = 5 + z * t;
  const sd = (x: number, y: number): number => Math.hypot(x - 4, y) - R;
  const lado = Math.sign(sd(c.ramo.a.x, c.ramo.a.y));
  return (x, y) => sd(x, y) * lado >= 0;
}
interface Linha { caso: string; camadas: string; tilts: string; m: Array<{ fresta: number; sobrep: number; frestaG: number; sobrepG: number; onde: string }>; cob: Array<{ vazio: number; excesso: number; maiorVazio: number; centro?: P }>; avisos: string[] }
function coberturaDe(p: ReturnType<typeof build>, ids: Array<[string, W]>, cam: number[] | 'padrao', no: P, z: number, mascara?: (x: number, y: number) => boolean) {
  const real = ids.map(([id]) => secaoPorCamada(p, id, z));
  const ideal = ids.map(([id, w]) => { limparCachesDeConteudo(); return secaoPorCamada(build([w], H, cam), id, z); });
  limparCachesDeConteudo();
  return cobertura(real, ideal, no, 2.0, 0.025, mascara);
}
function medirTodosT(): Linha[] {
  const out: Linha[] = [];
  for (const c of CASOS_T) for (const [th, tr] of TILTS) for (const cam of [[0.2], 'padrao'] as const) {
    if (process.env.HESTIA_X1_FILTRO && !`${c.nome} ${th}/${tr} ${cam === 'padrao' ? 'alv14' : '0,2'}`.includes(process.env.HESTIA_X1_FILTRO)) continue;
    limparCachesDeConteudo();
    const p = build([{ ...c.host, tilt: th }, { ...c.ramo, tilt: tr }], H, cam as number[] | 'padrao');
    const m = ZS.map((z) => medirT(p, 'R', 'b', 'H', c.no, z));
    const cob = ZS.map((z) => coberturaDe(p, [['H', { ...c.host, tilt: th }], ['R', { ...c.ramo, tilt: tr }]], cam as number[] | 'padrao', c.no, z, ladoDoRamo(c, th, z)));
    if (process.env.HESTIA_X1_FILTRO) console.log('DBG', m.map((x) => x.onde).join(' ; '), JSON.stringify(cob.map((q) => [q.vazio, q.maiorVazio, q.centro])));
    out.push({ caso: c.nome, camadas: cam === 'padrao' ? 'alv14' : '0,2', tilts: `${th}/${tr}`, m, cob, avisos: avisosDe(p, H, ['H', 'R']) });
  }
  return out;
}
const linhaT = (l: Linha): string => `| ${l.caso} | ${l.camadas} | ${l.tilts} | ${l.m.map((x, i) => `${mm(x.frestaG)} / ${mm(x.sobrepG)} [tudo ${mm(x.fresta)} / ${mm(x.sobrep)}] vazio ${(l.cob[i]!.vazio * 1e4).toFixed(0)} exc ${(l.cob[i]!.excesso * 1e4).toFixed(0)} cm²`).join(' | ')} | ${l.avisos.join(', ') || '-'} |`;

interface CasoX { nome: string; a: W; b: W }
const CASOS_X: CasoX[] = [
  { nome: 'X reta×reta', a: { id: 'H', a: { x: 0, y: -3 }, b: { x: 0, y: 3 } }, b: { id: 'R', a: { x: -3, y: 0 }, b: { x: 3, y: 0 } } },
  { nome: 'X1 reta×arco', a: HOST_ARCO, b: { id: 'R', a: { x: -5, y: 0 }, b: { x: 3, y: 0 } } },
  { nome: 'X arco×arco', a: HOST_ARCO, b: { id: 'R', a: { x: -5, y: -1 }, b: { x: 3, y: -1 }, sag: 1 } },
];
interface LinhaX { caso: string; camadas: string; tilts: string; dVol: number; fechadas: boolean; cob: Array<{ vazio: number; excesso: number; maiorVazio: number; centro?: P }>; avisos: string[] }
function medirTodosX(): LinhaX[] {
  const out: LinhaX[] = [];
  for (const c of process.env.HESTIA_X1_FILTRO ? [] : CASOS_X) for (const [ta, tb] of TILTS) for (const cam of [[0.2], 'padrao'] as const) {
    limparCachesDeConteudo();
    const pa = { ...c.a, tilt: ta }, pb = { ...c.b, tilt: tb };
    const par = build([pa, pb], H, cam as number[] | 'padrao');
    const A = volumeParede(par, 'H'), B = volumeParede(par, 'R');
    limparCachesDeConteudo();
    const sa = volumeParede(build([pa], H, cam as number[] | 'padrao'), 'H');
    limparCachesDeConteudo();
    const sb = volumeParede(build([pb], H, cam as number[] | 'padrao'), 'R');
    out.push({ caso: c.nome, camadas: cam === 'padrao' ? 'alv14' : '0,2', tilts: `${ta}/${tb}`, dVol: Math.max(Math.abs(A.vol - sa.vol), Math.abs(B.vol - sb.vol)), fechadas: A.fechada && B.fechada, cob: ZS.map((z) => coberturaDe(par, [['H', pa], ['R', pb]], cam as number[] | 'padrao', { x: -1, y: 0 }, z)), avisos: avisosDe(par, H, ['H', 'R']) });
  }
  return out;
}
const linhaX = (l: LinhaX): string => `| ${l.caso} | ${l.camadas} | ${l.tilts} | ${(l.dVol * 1e6).toFixed(1)} cm³ | ${l.fechadas ? 'sim' : 'NÃO'} | ${l.cob.map((c) => `vazio ${(c.vazio * 1e4).toFixed(0)} cm² exc ${(c.excesso * 1e4).toFixed(0)}`).join(' / ')} | ${l.avisos.join(', ') || '-'} |`;

describe('X1 · diagnóstico T e X (tabela completa: HESTIA_X1_TABELA=1, ~2 min)', () => {
  it.skipIf(!process.env.HESTIA_X1_TABELA && !process.env.HESTIA_X1_FILTRO)('tabela', () => {
    const t = medirTodosT(), x = process.env.HESTIA_X1_FILTRO ? [] : medirTodosX();
    const texto = [
      '## T (fresta / sobreposição em mm nas camadas de 5 mm ou mais, [todas as camadas]; z = 0,01 | 0,497·H | H−0,01; vazio e excesso em cm² contra a soma das paredes sozinhas)',
      '| Caso | Camadas | Tilts hosp/ramo | z baixo | z meio | z topo | Avisos |', '|---|---|---|---|---|---|---|',
      ...t.map(linhaT),
      '', '## X (diferença de volume com e sem a outra parede; malhas fechadas; cobertura contra as paredes sozinhas)',
      '| Caso | Camadas | Tilts | Δ volume | Fechadas | Cobertura z baixo / meio / topo | Avisos |', '|---|---|---|---|---|---|---|',
      ...x.map(linhaX),
    ].join('\n');
    console.log(texto);
    if (process.env.HESTIA_X1_SAIDA) writeFileSync(process.env.HESTIA_X1_SAIDA, texto);
    expect(t.length).toBeGreaterThan(0);
  }, 900000);
});

/** Vértices do sólido de uma camada na cota z (relativa à base) que passam no filtro. */
function vertsEm(p: ReturnType<typeof build>, id: string, z: number, f: (x: number, y: number) => boolean): Array<[number, number]> {
  const rl = resolveLevel(p, 'lv_0'), jl = junctionLevel(p, 'lv_0');
  const rw = rl.walls[id]!;
  const b = wallLayerSolid(rw, rw.layers[0]!, jl);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < b.positions.length / 3; i++) {
    const x = b.positions[i * 3]!, y = b.positions[i * 3 + 1]!;
    if (Math.abs(b.positions[i * 3 + 2]! - z) < 1e-6 && f(x, y) && !out.some((q) => Math.hypot(q[0] - x, q[1] - y) < 1e-7)) out.push([x, y]);
  }
  return out;
}

describe('X1 · T no meio do eixo de um arco (valores à mão, 1e-6)', () => {
  // Hospedeira: arco R=5, centro (4,0), meio do eixo em (-1,0), 0,2 de espessura. Ramo: reta vertical de (-4,0) a (-1,0), 0,2 (faces em y = ±0,1).
  // O ramo para na face externa da hospedeira, que em cada cota é o cone de raio R_f(z) = 5 + z·tanθ + 0,1/cosθ (centro fixo).
  const caso = (th: number): ReturnType<typeof build> => build([{ ...HOST_ARCO, tilt: th }, { id: 'R', a: { x: -4, y: 0 }, b: NO_ARCO }], H, [0.2]);
  const cap = (x: number, y: number): boolean => x < -0.9 && Math.hypot(x - 4, y) < 7;
  it('0°: o ramo termina no cilindro de raio 5,1 em todas as cotas (x = 4 − √26 = −1,0990195136)', () => {
    limparCachesDeConteudo();
    const p = caso(0);
    for (const z of [0, 3]) {
      const v = vertsEm(p, 'R', z, cap);
      expect(v.length).toBe(2);
      for (const [x, y] of v) { expect(Math.hypot(x - 4, y)).toBeCloseTo(5.1, 6); expect(x).toBeCloseTo(-1.0990195136, 6); expect(Math.abs(y)).toBeCloseTo(0.1, 6); }
    }
  });
  it('15°: o ramo termina no cone de raio R_f(z) em z = 0, 1,5 e 3 (5,1035276180 / 5,5054514057 / 5,9073751953)', () => {
    limparCachesDeConteudo();
    const p = caso(15);
    const lit: Array<[number, number, number]> = [[0, 5.1035276180, -1.1025478095], [1.5, 5.5054514057, -1.5045431411], [3, 5.9073751953, -1.9065287361]];
    for (const [z, Rf, x0] of lit) {
      const v = vertsEm(p, 'R', z, cap);
      expect(v.length).toBeGreaterThanOrEqual(2);
      for (const [x, y] of v) { expect(Math.hypot(x - 4, y)).toBeCloseTo(Rf, 6); expect(x).toBeCloseTo(x0, 6); expect(Math.abs(y)).toBeCloseTo(0.1, 6); }
    }
  });
  it('T1/T3 de camada única com tilts variados: fresta e sobreposição < 1 mm e sem vazio (cobertura) em z baixo, meio e topo', () => {
    for (const [c, th, tr] of [[CASOS_T[0]!, 15, 15], [CASOS_T[1]!, -10, -10], [CASOS_T[4]!, 15, -10], [CASOS_T[5]!, -20, 30]] as const) {
      limparCachesDeConteudo();
      const p = build([{ ...c.host, tilt: th }, { ...c.ramo, tilt: tr }], H, [0.2]);
      for (const z of ZS) {
        const m = medirT(p, 'R', 'b', 'H', c.no, z);
        expect(m.fresta, `${c.nome} ${th}/${tr} z=${z}`).toBeLessThan(1e-3);
        expect(m.sobrep, `${c.nome} ${th}/${tr} z=${z}`).toBeLessThan(1e-3);
      }
      const cob = coberturaDe(p, [['H', { ...c.host, tilt: th }], ['R', { ...c.ramo, tilt: tr }]], [0.2], c.no, ZS[2]!, ladoDoRamo(c, th, ZS[2]!));
      expect(cob.vazio, `${c.nome} ${th}/${tr}`).toBeLessThan(0.0015);
    }
  }, 120000);
  it('multicamada padrão, ramo em arco sobre arco com a hospedeira a 15°: sem bolsão no acabamento da hospedeira (era 21 mm)', () => {
    limparCachesDeConteudo();
    const c = CASOS_T[4]!;
    const p = build([{ ...c.host, tilt: 15 }, { ...c.ramo, tilt: 0 }], H, 'padrao');
    for (const z of ZS) {
      const m = medirT(p, 'R', 'b', 'H', c.no, z);
      expect(m.frestaG, `z=${z}`).toBeLessThan(1e-3);
    }
    expect(coberturaDe(p, [['H', { ...c.host, tilt: 15 }], ['R', { ...c.ramo, tilt: 0 }]], 'padrao', c.no, ZS[1]!, ladoDoRamo(c, 15, ZS[1]!)).vazio).toBeLessThan(0.0015);
  }, 120000);
  it('vertical (0°/0°): a mesma medição dá fresta 0 e sobreposição 0 (comportamento de hoje)', () => {
    for (const c of CASOS_T) {
      limparCachesDeConteudo();
      const p = build([{ ...c.host }, { ...c.ramo }], H, [0.2]);
      const m = medirT(p, 'R', 'b', 'H', c.no, ZS[1]!);
      expect(m.fresta).toBeLessThan(1e-6);
      expect(m.sobrep).toBeLessThan(1e-6);
    }
  }, 120000);
});

describe('X1 · X (cruzamento): os corpos se interpenetram, sem abertura', () => {
  it.each([
    ['reta×reta 15°/15° (camada única)', 0, [15, 15], [0.2]],
    ['reta×arco 15°/−10° (camada única)', 1, [15, -10], [0.2]],
    ['arco×arco −20°/30° (camada única)', 2, [-20, 30], [0.2]],
    ['reta×arco 15°/−10° (multicamada padrão)', 1, [15, -10], 'padrao'],
  ] as const)('%s', (_n, k, [ta, tb], cam) => {
    const c = CASOS_X[k]!;
    limparCachesDeConteudo();
    const pa = { ...c.a, tilt: ta }, pb = { ...c.b, tilt: tb };
    const par = build([pa, pb], H, cam as number[] | 'padrao');
    const A = volumeParede(par, 'H'), B = volumeParede(par, 'R');
    limparCachesDeConteudo();
    const sa = volumeParede(build([pa], H, cam as number[] | 'padrao'), 'H');
    limparCachesDeConteudo();
    const sb = volumeParede(build([pb], H, cam as number[] | 'padrao'), 'R');
    // cada parede com a outra presente tem o volume de quando está sozinha (nenhuma cede o cruzamento à outra)
    expect(A.vol).toBeCloseTo(sa.vol, 6);
    expect(B.vol).toBeCloseTo(sb.vol, 6);
    expect(A.fechada && B.fechada).toBe(true);
    for (const z of ZS) {
      const cob = coberturaDe(par, [['H', pa], ['R', pb]], cam as number[] | 'padrao', { x: -1, y: 0 }, z);
      expect(cob.vazio, `z=${z}`).toBeLessThan(1e-4);
    }
  }, 180000);
  it('reta×reta 15°/15°: cada camada única tem o volume de uma laje inclinada, L·H·t/cosθ = 3,7269942495 (6 × 3 × 0,2 / cos 15°)', () => {
    limparCachesDeConteudo();
    const par = build([{ ...CASOS_X[0]!.a, tilt: 15 }, { ...CASOS_X[0]!.b, tilt: 15 }], H, [0.2]);
    expect(volumeParede(par, 'H').vol).toBeCloseTo(3.7269942495, 6);
    expect(volumeParede(par, 'R').vol).toBeCloseTo(3.7269942495, 6);
  });
  it('vertical (0°/0°) idêntico ao de hoje: uma das paredes cede o quadrado 0,2×0,2 do cruzamento (0,12 m³ no total)', () => {
    limparCachesDeConteudo();
    const par = build([CASOS_X[0]!.a, CASOS_X[0]!.b], H, [0.2]);
    expect(volumeParede(par, 'H').vol + volumeParede(par, 'R').vol).toBeCloseTo(3.6 * 2 - 0.12, 6);
  });
});

describe('X1 · X4: dois arcos inclinados que se cruzam no meio dos dois eixos', () => {
  const c = CASOS_X[2]!; // arco R=5 (centro (4,0)) × arco que passa por (-1,0) com a corda horizontal
  const linhas: string[] = [];
  it.each([[15, -10], [20, -20], [30, 15], [15, 15], [0, 0]] as ReadonlyArray<readonly [number, number]>)('tilts %i/%i, camada única e multicamada: interpenetração fechada, sem abertura', (ta, tb) => {
    for (const cam of [[0.2], 'padrao'] as const) {
      limparCachesDeConteudo();
      const pa = { ...c.a, tilt: ta }, pb = { ...c.b, tilt: tb };
      const par = build([pa, pb], H, cam as number[] | 'padrao');
      const A = volumeParede(par, 'H'), B = volumeParede(par, 'R');
      limparCachesDeConteudo();
      const sa = volumeParede(build([pa], H, cam as number[] | 'padrao'), 'H');
      limparCachesDeConteudo();
      const sb = volumeParede(build([pb], H, cam as number[] | 'padrao'), 'R');
      const vazio = ZS.map((z) => coberturaDe(par, [['H', pa], ['R', pb]], cam as number[] | 'padrao', { x: -1, y: 0 }, z).vazio);
      linhas.push(`| X4 arco×arco | ${cam === 'padrao' ? 'alv14' : '0,2'} | ${ta}/${tb} | ${(Math.abs(A.vol - sa.vol) * 1e6).toFixed(1)} / ${(Math.abs(B.vol - sb.vol) * 1e6).toFixed(1)} cm³ | ${vazio.map((v) => (v * 1e4).toFixed(0)).join(' / ')} cm² |`);
      if (ta === 0 && tb === 0) continue; // vertical: o pintor segue cedendo a área do cruzamento (idêntico a hoje)
      expect(A.vol).toBeCloseTo(sa.vol, 6);
      expect(B.vol).toBeCloseTo(sb.vol, 6);
      for (const v of vazio) expect(v).toBeLessThan(1e-4);
      if (ta !== 0 && tb !== 0) { expect(A.fechada).toBe(true); expect(B.fechada).toBe(true); }
    }
    if (process.env.HESTIA_X1_SAIDA) console.log(linhas.splice(0).join('\n'));
  }, 180000);
});
