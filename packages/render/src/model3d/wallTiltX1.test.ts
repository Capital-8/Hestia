import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { limparCachesDeConteudo } from '@hestia/engine';
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

interface Linha { caso: string; camadas: string; tilts: string; m: Array<{ fresta: number; sobrep: number; frestaG: number; sobrepG: number }>; cob: Array<{ vazio: number; excesso: number; maiorVazio: number }>; avisos: string[] }
function coberturaDe(p: ReturnType<typeof build>, ids: Array<[string, W]>, cam: number[] | 'padrao', no: P, z: number) {
  const real = ids.map(([id]) => secaoPorCamada(p, id, z));
  const ideal = ids.map(([id, w]) => { limparCachesDeConteudo(); return secaoPorCamada(build([w], H, cam), id, z); });
  limparCachesDeConteudo();
  return cobertura(real, ideal, no);
}
function medirTodosT(): Linha[] {
  const out: Linha[] = [];
  for (const c of CASOS_T) for (const [th, tr] of TILTS) for (const cam of [[0.2], 'padrao'] as const) {
    limparCachesDeConteudo();
    const p = build([{ ...c.host, tilt: th }, { ...c.ramo, tilt: tr }], H, cam as number[] | 'padrao');
    const m = ZS.map((z) => medirT(p, 'R', 'b', 'H', c.no, z));
    const cob = ZS.map((z) => coberturaDe(p, [['H', { ...c.host, tilt: th }], ['R', { ...c.ramo, tilt: tr }]], cam as number[] | 'padrao', c.no, z));
    out.push({ caso: c.nome, camadas: cam === 'padrao' ? 'alv14' : '0,2', tilts: `${th}/${tr}`, m, cob, avisos: avisosDe(p, H, ['H', 'R']) });
  }
  return out;
}
const linhaT = (l: Linha): string => `| ${l.caso} | ${l.camadas} | ${l.tilts} | ${l.m.map((x, i) => `${mm(x.fresta)} / ${mm(x.sobrep)} (vazio ${(l.cob[i]!.vazio * 1e4).toFixed(0)} cm², exc ${(l.cob[i]!.excesso * 1e4).toFixed(0)})`).join(' | ')} | ${l.avisos.join(', ') || '-'} |`;

interface CasoX { nome: string; a: W; b: W }
const CASOS_X: CasoX[] = [
  { nome: 'X reta×reta', a: { id: 'H', a: { x: 0, y: -3 }, b: { x: 0, y: 3 } }, b: { id: 'R', a: { x: -3, y: 0 }, b: { x: 3, y: 0 } } },
  { nome: 'X1 reta×arco', a: HOST_ARCO, b: { id: 'R', a: { x: -5, y: 0 }, b: { x: 3, y: 0 } } },
  { nome: 'X arco×arco', a: HOST_ARCO, b: { id: 'R', a: { x: -5, y: -1 }, b: { x: 3, y: -1 }, sag: 1 } },
];
interface LinhaX { caso: string; camadas: string; tilts: string; dVol: number; fechadas: boolean; cob: Array<{ vazio: number; excesso: number; maiorVazio: number }>; avisos: string[] }
function medirTodosX(): LinhaX[] {
  const out: LinhaX[] = [];
  for (const c of CASOS_X) for (const [ta, tb] of TILTS) for (const cam of [[0.2], 'padrao'] as const) {
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

describe('X1 · diagnóstico T e X', () => {
  it('tabela', () => {
    const t = medirTodosT(), x = medirTodosX();
    const texto = [
      '## T (fresta / sobreposição em mm; z = 0,01 | 0,497·H | H−0,01)',
      '| Caso | Camadas | Tilts hosp/ramo | z baixo | z meio | z topo | Avisos |', '|---|---|---|---|---|---|---|',
      ...t.map(linhaT),
      '', '## X (diferença de volume com e sem a outra parede; malhas fechadas)',
      '| Caso | Camadas | Tilts | Δ volume | Fechadas | Cobertura z baixo / meio / topo | Avisos |', '|---|---|---|---|---|---|---|',
      ...x.map(linhaX),
    ].join('\n');
    console.log(texto);
    if (process.env.HESTIA_X1_SAIDA) writeFileSync(process.env.HESTIA_X1_SAIDA, texto);
    expect(t.length).toBeGreaterThan(0);
  }, 600000);
});
void dirname; void resolve; void fileURLToPath;
