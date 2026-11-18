import { afterEach, describe, expect, it } from 'vitest';
import { multiArea } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type OpeningShape, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry, resolveLevel } from './resolve.ts';
import { quantifyLevel } from './quantities.ts';
import { buildOpeningSchedule } from './openingSchedule.ts';
import { areaPerimetroDoContorno, camadaFurada } from './furoContornoParede.ts';
import { definirClienteFuroContorno } from './furoContornoDespacho.ts';
import { clienteFuroContornoFalso } from './furoContornoFalso.ts';
import { definirDespachanteDeNivel } from './resolveDespacho.ts';
import type { Opening } from '@hestia/model';

const L = 6;
const H = 3;
const FORMA: OpeningShape = { kind: 'round', width: 0.9, height: 2.4 };

/** Parede de 6 m com uma porta retangular (offset 1) e um vão livre (offset 4), com forma ou sem ela. */
function projeto(forma: boolean, wall: { sag?: number; tilt?: number } = {}, closure: 'none' | 'both' = 'none'): Project {
  const base = createEmptyProject();
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', width: 0.9, height: 2.4, leaves: 0, closure, ...(forma ? { shape: FORMA } : {}) };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: H, a: { x: 0, y: 0 }, b: { x: L, y: 0 }, ...wall }) });
  const mk = (id: string, typeId: string, offset: number): Opening => ({ id, kind: 'door', typeId, hostId: 'w1', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' });
  s.exec({ type: 'addOpening', opening: mk('o_porta', 'ot_p80', 1) });
  s.exec({ type: 'addOpening', opening: mk('o_arco', 'ot_arco', 4) });
  return s.project;
}
const geom = (p: Project, id: string) => openingGeometry(p, p.elements[id] as Opening, frameOfWall(p, 'w1')!);
const espessuras = (p: Project): number[] => p.wallTypes.wt_alv14!.layers.map((l) => l.thickness);
const somaEsp = (p: Project): number => espessuras(p).reduce((a, b) => a + b, 0);

afterEach(() => {
  definirClienteFuroContorno(null);
  definirDespachanteDeNivel(null);
});

describe('troca atômica do furo por contorno', () => {
  it('sem cliente a forma é só dado: faixas, planta e quantitativo iguais aos do vão retangular', () => {
    const a = projeto(true);
    const b = projeto(false);
    const ra = resolveLevel(a, 'lv_0').walls.w1!;
    const rb = resolveLevel(b, 'lv_0').walls.w1!;
    expect(ra.furosContorno).toBeUndefined();
    expect(JSON.stringify(ra.layers.map((l) => l.bands))).toBe(JSON.stringify(rb.layers.map((l) => l.bands)));
    expect(JSON.stringify(quantifyLevel(a, resolveLevel(a, 'lv_0')))).toBe(JSON.stringify(quantifyLevel(b, resolveLevel(b, 'lv_0'))));
  });

  it('vão retangular fica idêntico com cliente instalado', () => {
    const p = projeto(false);
    const sem = JSON.stringify([resolveLevel(p, 'lv_0'), quantifyLevel(p, resolveLevel(p, 'lv_0'))]);
    definirClienteFuroContorno(clienteFuroContornoFalso());
    expect(JSON.stringify([resolveLevel(p, 'lv_0'), quantifyLevel(p, resolveLevel(p, 'lv_0'))])).toBe(sem);
  });

  it('com cliente falso o vão com forma sai da rota retangular e a porta continua furada', () => {
    const p = projeto(true);
    const g = geom(p, 'o_arco');
    const gp = geom(p, 'o_porta');
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const rw = resolveLevel(p, 'lv_0').walls.w1!;
    expect(rw.furosContorno?.map((f) => f.g.openingId)).toEqual(['o_arco']);
    const e = espessuras(p);
    rw.layers.forEach((l) => {
      const th = e[l.layerIndex]!;
      // Sem quebra em z no vão com forma (nem na soleira nem no topo dele): só o topo da porta.
      expect(l.bands.some((b) => Math.abs(b.z1 - g.sill - g.roughHeight) < 1e-6)).toBe(false);
      // A faixa baixa tem só o furo da porta; o vão com forma NÃO está recortado nela.
      expect(multiArea(l.bands[0]!.poly)).toBeCloseTo((L - gp.roughWidth) * th, 6);
    });
  });

  it('quantitativo: volume líquido pela malha furada, área real do contorno; só o vão com forma muda', () => {
    const p = projeto(true);
    const g = geom(p, 'o_arco');
    const base = quantifyLevel(p, resolveLevel(p, 'lv_0')).walls[0]!;
    const { area } = areaPerimetroDoContorno(g.forma!);
    definirClienteFuroContorno(clienteFuroContornoFalso({ retorno: false }));
    const r = resolveLevel(p, 'lv_0');
    const q = quantifyLevel(p, r).walls[0]!;
    // Retangular recortava rough W x rough H; o contorno recorta a área real (menor): mais volume que antes.
    expect(q.volume - base.volume).toBeCloseTo((g.roughWidth * g.roughHeight - area) * somaEsp(p), 6);
    expect(q.openingsArea - base.openingsArea).toBeCloseTo(area - 0.9 * 2.4, 6);
    expect(area).toBeLessThan(g.roughWidth * g.roughHeight);
  });

  it('cliente sem furarPrisma: recua para o furo retangular na hora de montar (a parede não fica sem vão)', () => {
    const p = projeto(true);
    const base = quantifyLevel(p, resolveLevel(p, 'lv_0')).walls[0]!;
    definirClienteFuroContorno(clienteFuroContornoFalso({ prisma: false, retorno: false }));
    const r = resolveLevel(p, 'lv_0');
    const rw = r.walls.w1!;
    const cf = camadaFurada(rw, rw.layers[0]!, rw.layers[0]!.bands)!;
    expect(cf.malhas).toBeNull();
    expect(quantifyLevel(p, r).walls[0]!.volume).toBeCloseTo(base.volume, 9);
  });

  it('planta: a hachura abre pela largura real do contorno na cota do corte', () => {
    const p = projeto(true);
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const g = geom(p, 'o_arco');
    const area = (cutZ: number): number => {
      const rw = resolveLevel(p, 'lv_0', undefined, { cutZ }).walls.w1!;
      return rw.layers.reduce((s, l) => s + multiArea(l.cut), 0);
    };
    const e = somaEsp(p);
    const gp = geom(p, 'o_porta');
    const cheio = L * e - gp.roughWidth * e; // só a porta aberta
    const R = g.forma!.width / 2;
    const spring = g.forma!.height - R;
    expect(area(1.2)).toBeCloseTo(cheio - g.forma!.width * e, 3); // abaixo da nascença: largura cheia
    const z = spring + 0.3;
    expect(area(z)).toBeCloseTo(cheio - 2 * Math.sqrt(R * R - 0.09) * e, 2); // no arco: corda
    expect(area(g.forma!.height + 0.2)).toBeCloseTo(cheio, 6); // acima do topo: sem furo
  });

  it('retorno do acabamento segue o contorno: sem ombreiras retangulares, volume pelo cliente', () => {
    const p = projeto(true, {}, 'both');
    const semRet = projeto(true, {}, 'none');
    definirClienteFuroContorno(clienteFuroContornoFalso({ retorno: false }));
    const q0 = quantifyLevel(semRet, resolveLevel(semRet, 'lv_0')).walls[0]!.volume;
    expect(quantifyLevel(p, resolveLevel(p, 'lv_0')).walls[0]!.volume).toBeCloseTo(q0, 9); // sem retornoDoVao: nenhum retorno
    const cli = clienteFuroContornoFalso();
    definirClienteFuroContorno(cli);
    const r = resolveLevel(p, 'lv_0');
    const rw = r.walls.w1!;
    expect(rw.furosContorno![0]!.retornos.length).toBeGreaterThan(0);
    const soma = rw.layers.reduce((s, l) => s + camadaFurada(rw, l, l.bands)!.retornos.reduce((a, x) => a + x.volume, 0), 0);
    expect(soma).toBeGreaterThan(0);
    expect(quantifyLevel(p, r).walls[0]!.volume - q0).toBeCloseTo(soma, 9);
    const { perimetro } = areaPerimetroDoContorno(geom(p, 'o_arco').forma!);
    const ret = rw.furosContorno![0]!.retornos[0]!;
    const um = rw.layers.find((l) => l.layerIndex === ret.layerIndex)!;
    expect(camadaFurada(rw, um, um.bands)!.retornos[0]!.volume).toBeCloseTo(perimetro * ret.espessura * (ret.y1 - ret.y0), 9);
  });

  it('quadro de esquadrias: área real do contorno só com o cliente instalado', () => {
    const p = projeto(true);
    const linha = () => buildOpeningSchedule(p).rows.find((x) => x.typeId === 'ot_arco')!.unitArea;
    expect(linha()).toBeCloseTo(0.9 * 2.4, 9);
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const forma = geom(p, 'o_arco').forma!;
    expect(linha()).toBeCloseTo(areaPerimetroDoContorno(forma).area, 9);
    expect(linha()).toBeLessThan(0.9 * 2.4);
  });

  it('parede curva ou inclinada fica no caminho retangular', () => {
    definirClienteFuroContorno(clienteFuroContornoFalso());
    expect(resolveLevel(projeto(true, { sag: 1 }), 'lv_0').walls.w1!.furosContorno).toBeUndefined();
    expect(resolveLevel(projeto(true, { tilt: 5 }), 'lv_0').walls.w1!.furosContorno).toBeUndefined();
  });

  it('nível com vão por contorno não passa pelo despachante do kernel Rust', () => {
    const p = projeto(true);
    let chamou = 0;
    definirDespachanteDeNivel((_p, _l, _o, ts) => { chamou++; return ts(); });
    resolveLevel(p, 'lv_0');
    expect(chamou).toBe(1); // sem cliente: despacho de sempre
    definirClienteFuroContorno(clienteFuroContornoFalso());
    resolveLevel(p, 'lv_0');
    expect(chamou).toBe(1);
  });
});
