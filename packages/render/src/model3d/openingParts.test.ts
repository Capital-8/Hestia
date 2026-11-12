import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildOpeningModel, frameOfWall, openingGeometry, partTransformed, resolveLevel, toLocal, type OpeningGeometry, type WallFrame } from '@hestia/engine';
import { openingSymbolPaths, type MultiPolygon } from '@hestia/geom';
import { DEFAULT_OPENING_TYPES, ProjectStore, coreSpan, createEmptyProject, makeWall, openingFrame, view3dOf, type Opening, type OpeningType, type Project } from '@hestia/model';
import { caixasDaAbertura, montarAbertura } from './aberturas3d.ts';
import { openingPieces, type OpeningPiece } from './openingParts.ts';

/** Dobradiça/sentido da instância; o padrão é o mesmo das demais cenas. */
interface Flips {
  flipHand?: boolean;
  flipFacing?: boolean;
}

/** Parede de 4 m com um vão no meio. `extra` completa o tipo base (acabamento, vão bruto, verga) antes de inseri-lo. */
function cena(base: string, extra: Partial<OpeningType> = {}, flips: Flips = {}): { p: Project; o: Opening; g: OpeningGeometry } {
  const s = new ProjectStore(createEmptyProject());
  const t = s.project.openingTypes[base];
  if (!t) throw new Error(`tipo padrão ausente: ${base}`);
  s.exec({ type: 'upsertOpeningType', openingType: { ...t, id: 'ot_x', ...extra } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({
    type: 'addOpening',
    opening: { id: 'v', kind: t.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: flips.flipHand ?? false, flipFacing: flips.flipFacing ?? false, sillOverride: null, mark: '' },
  });
  const p = s.project;
  const o = p.elements.v as Opening;
  const f = frameOfWall(p, 'w')!;
  return { p, o, g: openingGeometry(p, o, f) };
}

/** Peças do vão com a parede de 2,80 m (altura padrão do projeto). */
function pecas(c: { p: Project; o: Opening }, open = false): OpeningPiece[] {
  return openingPieces(c.p, c.o, openingGeometry(c.p, c.o, frameOfWall(c.p, 'w')!), frameOfWall(c.p, 'w')!, 2.8, open);
}

describe('peças 3D do vão: acabamento, peitoril e vergas', () => {
  it('sem campos novos, a porta de giro fechada traz o modelo inteiro: batente com rebaixo, folha e maçaneta', () => {
    const pc = pecas(cena('ot_p80'));
    // Batente em L em peça única por lado: 2 ombreiras + cabeça (os batedores saíram das peças, batente em L da v3);
    // folha; 8 peças de ferragem (maçaneta: roseta, pescoço e braço nas duas faces, e placa da fechadura, E2b); 3 dobradiças de batente (padrão da família de giro, E2b).
    expect(pc).toHaveLength(15);
    expect(pc.filter((x) => x.role === 'jamb')).toHaveLength(2);
    expect(pc.filter((x) => x.role === 'head')).toHaveLength(1);
    expect(pc.filter((x) => x.role === 'stop')).toHaveLength(0);
    expect(pc.filter((x) => x.role === 'leaf')).toHaveLength(1);
    expect(pc.filter((x) => x.role === 'handle')).toHaveLength(8);
    expect(pc.filter((x) => x.role === 'hinge')).toHaveLength(3);
  });

  it('alizar: quatro peças por lado na porta e cinco na janela (inclui a peça de baixo do vão)', () => {
    const base = pecas(cena('ot_p80'));
    const com = pecas(cena('ot_p80', { casing: { width: 0.05, thickness: 0.015 } }));
    const novas = com.slice(base.length);
    expect(novas).toHaveLength(6); // 3 peças por lado: ombreiras e verga do alizar, sem soleira na porta
    expect(novas.every((x) => Math.abs(x.d - 0.015) < 1e-9)).toBe(true);
    const baseJ = pecas(cena('ot_j120'));
    const comJ = pecas(cena('ot_j120', { casing: { width: 0.05, thickness: 0.015 } }));
    expect(comJ.length - baseJ.length).toBe(8); // janela: 4 peças por lado, a de baixo incluída
  });

  it('peitoril saliente só existe em janela: projeta além das duas faces da parede, abaixo do vão', () => {
    const c = cena('ot_j120', { sillBoard: { projection: 0.03, thickness: 0.02 } });
    const base = pecas(cena('ot_j120'));
    const peca = pecas(c).slice(base.length)[0]!;
    expect(peca.w).toBeCloseTo(c.g.width + 0.06, 9); // o modelo projeta 0,03 m além do vão de cada lado
    expect(peca.d).toBeCloseTo(c.g.thickness + 0.06, 9);
    expect(peca.h).toBeCloseTo(0.02, 9);
    expect(peca.z).toBeCloseTo(-0.01, 9);
    const porta = pecas(cena('ot_p80', { sillBoard: { projection: 0.03, thickness: 0.02 } }));
    expect(porta).toHaveLength(pecas(cena('ot_p80')).length);
  });

  it('verga e contraverga: peças de concreto com transpasse; sem o campo, nenhuma', () => {
    const c = cena('ot_p80', { lintel: {}, sillBeam: { over: 0.2, height: 0.25 } });
    const base = pecas(cena('ot_p80'));
    const [verga, contra] = pecas(c).slice(base.length);
    expect(verga!.w).toBeCloseTo(c.g.width + 0.6, 9); // transpasse padrão 0,30 m para cada lado
    expect(verga!.h).toBeCloseTo(0.2, 9);
    expect(verga!.z).toBeCloseTo(c.g.height + 0.1, 9);
    expect(contra!.w).toBeCloseTo(c.g.width + 0.4, 9);
    expect(contra!.h).toBeCloseTo(0.25, 9);
    expect(contra!.z).toBeCloseTo(-0.125, 9);
    expect(verga!.materialId).toBe('mat_concreto');
    expect(contra!.materialId).toBe('mat_concreto');
  });
});

describe('folha aberta no 3D', () => {
  it('porta de giro aberta gira a folha 90° na dobradiça; fechada, nenhuma peça tem dobradiça', () => {
    const c = cena('ot_p80');
    const fechada = pecas(c, false);
    const aberta = pecas(c, true);
    expect(fechada.some((x) => x.hinge)).toBe(false);
    const folha = aberta.find((x) => x.hinge);
    expect(folha).toBeDefined();
    expect(folha!.hinge!.axis).toBe('z');
    expect(Math.abs(folha!.hinge!.angle)).toBeCloseTo(Math.PI / 2, 9);
    expect(aberta).toHaveLength(fechada.length);
  });

  it('janela de correr aberta: as folhas se deslocam no trilho, sem dobradiça', () => {
    const c = cena('ot_j120');
    const fechada = pecas(c, false);
    const aberta = pecas(c, true);
    const efetivo = (x: OpeningPiece): number => x.x + (x.slide?.dx ?? 0);
    expect(aberta.some((x) => x.hinge)).toBe(false);
    expect(aberta.some((x) => x.slide && Math.abs(x.slide.dx) > 1e-9)).toBe(true);
    expect(aberta.map(efetivo)).not.toEqual(fechada.map((x) => x.x));
  });
});

describe('regressão do 3D aberto', () => {
  const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;
  const dimensoes = (pc: OpeningPiece[]): string[] => pc.map((x) => `${r6(x.w)}x${r6(x.d)}x${r6(x.h)}`).sort();
  const jambDe = (c: { p: Project; o: Opening }): number => {
    const f = frameOfWall(c.p, 'w')!;
    const core = coreSpan(f.type);
    return openingFrame(c.p.openingTypes[c.o.typeId]!, core.to - core.from).frameWidth;
  };
  const alturaDe = (c: { g: OpeningGeometry }): number => Math.min(c.g.height, 2.8 - c.g.sill);

  /** Lado do arco/folha da planta em relação a +n, pelo traço da folha (peso 1,3). */
  function ladoDaPlanta(g: OpeningGeometry): number {
    const folha = openingSymbolPaths(g).find((s) => s.weight === 1.3);
    if (!folha) throw new Error('símbolo sem traço de folha');
    const s = (pt: { x: number; y: number }): number => (pt.x - g.center.x) * g.n.x + (pt.y - g.center.y) * g.n.y;
    const extremo = folha.pts.reduce((a, b) => (Math.abs(s(b)) > Math.abs(s(a)) ? b : a));
    return Math.sign(s(extremo));
  }

  /** Lado para onde a folha aberta vai no 3D: sinal de y depois do giro em torno do eixo z. */
  function ladoDoGiro(pc: OpeningPiece[]): number {
    const folha = pc.find((x) => x.hinge);
    if (!folha?.hinge) throw new Error('folha aberta sem dobradiça');
    return Math.sign((folha.x - folha.hinge.at) * Math.sin(folha.hinge.angle));
  }

  it('dimensões das peças iguais fechado × aberto nos tipos padrão', () => {
    expect(DEFAULT_OPENING_TYPES).toHaveLength(154);
    for (const t of DEFAULT_OPENING_TYPES) {
      const c = cena(t.id);
      expect(dimensoes(pecas(c, true)), t.id).toEqual(dimensoes(pecas(c, false)));
    }
  });

  it('vidro e moldura de folha ficam dentro do vão interno do caixilho (jamb…h−jamb)', () => {
    // Composições de várias células têm o vidro no rebaixo do perfil (placa = luz + 2 × (rebaixo − folga)): valem os testes do motor.
    for (const t of DEFAULT_OPENING_TYPES.filter((x) => x.kind === 'window' && x.leaves > 0 && x.composition?.layout.kind !== 'split')) {
      const c = cena(t.id);
      const jamb = jambDe(c);
      const h = alturaDe(c);
      const pc = pecas(c);
      const vidros = pc.filter((x) => x.material === 'glass');
      // A veneziana não tem vidro: as aletas substituem o pano (spec E §3.5).
      if (t.plan !== 'louver') expect(vidros.length, t.id).toBeGreaterThan(0);
      for (const v of vidros) {
        expect(v.z - v.h / 2, t.id).toBeGreaterThanOrEqual(jamb - 1e-9);
        expect(v.z + v.h / 2, t.id).toBeLessThanOrEqual(h - jamb + 1e-9);
      }
      const molduras = pc.filter((x) => x.material === 'leaf');
      // Janela fixa não tem moldura de folha (só o caixilho e o vidro).
      if (t.plan !== 'fixed') expect(molduras.length, t.id).toBeGreaterThan(0);
      for (const m of molduras) {
        expect(m.z - m.h / 2, t.id).toBeGreaterThanOrEqual(jamb - 1e-9);
        expect(m.z + m.h / 2, t.id).toBeLessThanOrEqual(h - jamb + 1e-9);
      }
    }
  });

  it('maxim-ar: eixo de giro na face inferior da verga (jamb + glassH)', () => {
    const c = cena('ot_j60');
    const jamb = jambDe(c);
    const h = alturaDe(c);
    const folha = pecas(c, true).find((x) => x.hinge)!;
    expect(folha.hinge!.axis).toBe('x');
    expect(folha.hinge!.at).toBeCloseTo(jamb + (h - 2 * jamb), 9);
    expect(folha.hinge!.at).toBeCloseTo(h - jamb, 9);
  });

  it('porta de giro: o lado aberto no 3D confere com o arco da planta nas 4 combinações', () => {
    for (const flipHand of [false, true]) {
      for (const flipFacing of [false, true]) {
        const c = cena('ot_p80', {}, { flipHand, flipFacing });
        const aberta = pecas(c, true);
        const caso = `hand=${flipHand} facing=${flipFacing}`;
        expect(ladoDoGiro(aberta), caso).toBe(ladoDaPlanta(c.g));
        expect(Math.abs(aberta.find((x) => x.hinge)!.hinge!.angle), caso).toBeCloseTo(Math.PI / 2, 9);
      }
    }
  });
});

describe('folhas de correr abertas dentro do vão', () => {
  const jambDe = (c: { p: Project; o: Opening }): number => {
    const f = frameOfWall(c.p, 'w')!;
    const core = coreSpan(f.type);
    return openingFrame(c.p.openingTypes[c.o.typeId]!, core.to - core.from).frameWidth;
  };
  const efetivoX = (x: OpeningPiece): number => x.x + (x.slide?.dx ?? 0);

  it('janela de correr 2 e 3 folhas: fechada lado a lado; aberta, as folhas móveis empilham dentro do caixilho', () => {
    for (const id of ['ot_j120', 'ot_j150', 'ot_j200', 'ot_j240']) {
      const c = cena(id);
      const t = c.p.openingTypes[c.o.typeId]!;
      const jamb = jambDe(c);
      const innerHalf = c.g.width / 2 - jamb;
      const n = t.leaves;
      const leafW = (2 * innerHalf + (n - 1) * 0.05) / n;
      const spacing = leafW - 0.05;
      const lw = Math.max(0.025, jamb * 0.6);
      const fechada = pecas(c, false).filter((x) => x.material === 'glass');
      const aberta = pecas(c, true).filter((x) => x.material === 'glass');
      expect(fechada, id).toHaveLength(n);
      expect(aberta, id).toHaveLength(n);
      // Fechado: as folhas cobrem o vão interno lado a lado, sobrepostas no centro.
      for (let k = 0; k < n; k++) {
        const center = (k - (n - 1) / 2) * spacing;
        expect(fechada[k]!.x, id).toBeCloseTo(center, 9);
        expect(fechada[k]!.w, id).toBeCloseTo(leafW - 2 * lw, 9);
      }
      // Aberto: as folhas ímpares correm uma largura de folga para a esquerda; todas ficam dentro do caixilho.
      for (let k = 0; k < n; k++) {
        const center = (k - (n - 1) / 2) * spacing;
        const esperado = k % 2 === 1 ? center - spacing : center;
        expect(efetivoX(aberta[k]!), id).toBeCloseTo(esperado, 9);
        expect(efetivoX(aberta[k]!) - aberta[k]!.w / 2, id).toBeGreaterThanOrEqual(-innerHalf - 1e-9);
        expect(efetivoX(aberta[k]!) + aberta[k]!.w / 2, id).toBeLessThanOrEqual(innerHalf + 1e-9);
      }
      // Trilhos: as folhas continuam em profundidades distintas.
      const ys = fechada.map((x) => x.y);
      expect(new Set(ys.map((y) => y.toFixed(6))).size, id).toBe(n);
    }
  });

  it('porta de correr: aberta, um painel corre sobre o outro dentro do vão livre', () => {
    const c = cena('ot_pc160');
    const jamb = jambDe(c);
    const innerHalf = c.g.width / 2 - jamb;
    const leafW = (2 * innerHalf + 0.06) / 2;
    const travel = leafW - 0.06;
    const painel = (open: boolean): OpeningPiece[] => pecas(c, open).filter((x) => x.material === 'leaf');
    const fechada = painel(false);
    const aberta = painel(true);
    expect(fechada).toHaveLength(2);
    expect(aberta).toHaveLength(2);
    // Fechado: dois painéis de `leafW`, centros em ±travel/2.
    expect(fechada.map((x) => x.x).sort((a, b) => a - b)[0]!).toBeCloseTo(-travel / 2, 9);
    expect(fechada.map((x) => x.x).sort((a, b) => a - b)[1]!).toBeCloseTo(travel / 2, 9);
    for (const p of fechada) expect(p.w).toBeCloseTo(leafW, 9);
    // Aberto: a folha móvel (k = 1, com flipHand falso) corre para a esquerda e empilha na outra.
    for (const p of aberta) {
      expect(efetivoX(p) - p.w / 2).toBeGreaterThanOrEqual(-innerHalf - 1e-9);
      expect(efetivoX(p) + p.w / 2).toBeLessThanOrEqual(innerHalf + 1e-9);
      expect(efetivoX(p)).toBeCloseTo(-travel / 2, 9);
    }
    // Trilhos distintos: os dois painéis continuam defasados na profundidade.
    expect(Math.abs(aberta[0]!.y - aberta[1]!.y)).toBeGreaterThan(0.01);
    // Nenhum painel entra no núcleo da parede (profundidade limitada ao núcleo).
    const f = frameOfWall(c.p, 'w')!;
    const core = coreSpan(f.type);
    const half = f.thickness / 2;
    for (const p of aberta) {
      expect(p.y - p.d / 2).toBeGreaterThanOrEqual(core.from - half - 1e-9);
      expect(p.y + p.d / 2).toBeLessThanOrEqual(core.to - half + 1e-9);
    }
    // Dois trilhos metálicos no head e no piso.
    expect(pecas(c).filter((x) => x.role === 'track')).toHaveLength(2);
  });
});

describe('portas novas no 3D (spec E §3.5)', () => {
  it('todas as peças presentes em cada família', () => {
    const vv = pecas(cena('ot_pvv90'));
    expect(vv.filter((x) => x.role === 'jamb')).toHaveLength(2);
    expect(vv.filter((x) => x.role === 'head')).toHaveLength(1);
    expect(vv.filter((x) => x.role === 'leaf')).toHaveLength(1);

    const pe = pecas(cena('ot_pe80'));
    expect(pe.filter((x) => x.role === 'jamb')).toHaveLength(1);
    expect(pe.filter((x) => x.role === 'head')).toHaveLength(1);
    expect(pe.filter((x) => x.role === 'leaf')).toHaveLength(1);
    expect(pe.filter((x) => x.role === 'pocket')).toHaveLength(1);

    expect(pecas(cena('ot_pd120')).filter((x) => x.role === 'leaf')).toHaveLength(2);
    expect(pecas(cena('ot_pd120', { leaves: 4 })).filter((x) => x.role === 'leaf')).toHaveLength(4);
    expect(pecas(cena('ot_ps90')).filter((x) => x.role === 'leaf')).toHaveLength(9);

    const pg = pecas(cena('ot_pg300'));
    expect(pg.filter((x) => x.role === 'leaf')).toHaveLength(5);
    expect(pg.filter((x) => x.role === 'leafPanel')).toHaveLength(5);
    expect(pg.filter((x) => x.role === 'track')).toHaveLength(2);
  });

  it('abrir muda a posição: giro no vai-e-vem e no dobrável, deslizamento no embutir e na seccionada', () => {
    const casos: Array<{ id: string; extra?: Partial<OpeningType>; esperado: 'z' | 'slide' }> = [
      { id: 'ot_pvv90', esperado: 'z' },
      { id: 'ot_pd120', esperado: 'z' },
      { id: 'ot_ps90', esperado: 'z' },
      { id: 'ot_pe80', esperado: 'slide' },
      { id: 'ot_pg300', esperado: 'slide' },
    ];
    for (const caso of casos) {
      const c = cena(caso.id, caso.extra ?? {});
      const aberta = pecas(c, true);
      if (caso.esperado === 'z') expect(aberta.some((x) => x.hinge?.axis === 'z'), caso.id).toBe(true);
      else expect(aberta.some((x) => x.slide && (Math.abs(x.slide.dx) > 1e-9 || Math.abs(x.slide.dz) > 1e-9)), caso.id).toBe(true);
    }
    const dobravel = pecas(cena('ot_pd120'), true).filter((x) => x.role === 'leaf');
    for (const p of dobravel) expect(Math.abs(p.hinge!.angle)).toBeCloseTo((70 * Math.PI) / 180, 9);
    const sanfonada = pecas(cena('ot_ps90'), true).filter((x) => x.role === 'leaf');
    for (const p of sanfonada) expect(Math.abs(p.hinge!.angle)).toBeCloseTo((75 * Math.PI) / 180, 9);
  });

  it('o pivô de cada painel dobrado devolve o mesmo centro de partTransformed', () => {
    for (const [id, graus, paineis] of [
      ['ot_pd120', 70, 2],
      ['ot_pd120', 70, 4],
      ['ot_ps90', 75, 9],
    ] as const) {
      const c = cena(id, paineis === 4 ? { leaves: 4 } : {});
      const f = frameOfWall(c.p, 'w')!;
      const model = buildOpeningModel(c.p, c.o, openingGeometry(c.p, c.o, f), f);
      const estado = { angle: (graus * Math.PI) / 180, slide: 1 };
      const folhasModelo = model.parts.filter((p) => p.role === 'leaf');
      const folhas3d = pecas(c, true).filter((p) => p.role === 'leaf');
      expect(folhas3d).toHaveLength(folhasModelo.length);
      for (let i = 0; i < folhasModelo.length; i++) {
        const ob = partTransformed(folhasModelo[i]!, estado);
        const p = folhas3d[i]!;
        const centro = transformar({ x: p.x, y: p.y, z: p.z }, p);
        expect(centro.x, `${id} painel ${i}`).toBeCloseTo(ob.center.t, 9);
        expect(centro.y, `${id} painel ${i}`).toBeCloseTo(ob.center.s, 9);
        expect(centro.z, `${id} painel ${i}`).toBeCloseTo(ob.center.z, 9);
      }
    }
  });

  it('fechadas, as peças ficam dentro do vão (exceto pocket, alizar, peitoril e vergas)', () => {
    const fora = new Set<OpeningPiece['role']>(['casing', 'sillBoard', 'lintel', 'sillBeam', 'pocket']);
    const familias: Array<{ base: string; extra?: Partial<OpeningType> }> = [
      { base: 'ot_pvv90' },
      { base: 'ot_pe80' },
      { base: 'ot_pd120' },
      { base: 'ot_pd120', extra: { leaves: 4 } },
      { base: 'ot_ps90' },
      { base: 'ot_pg300' },
    ];
    for (const familia of familias) {
      const c = cena(familia.base, familia.extra ?? {});
      const hw = c.g.width / 2;
      const H = Math.min(c.g.height, 2.8 - c.g.sill);
      for (const p of pecas(c, false)) {
        if (fora.has(p.role)) continue;
        const b = caixaDaPeca(p);
        const caso = `${familia.base} ${p.role}`;
        expect(b.x0, caso).toBeGreaterThanOrEqual(-hw - 1e-9);
        expect(b.x1, caso).toBeLessThanOrEqual(hw + 1e-9);
        expect(b.z0, caso).toBeGreaterThanOrEqual(-1e-9);
        expect(b.z1, caso).toBeLessThanOrEqual(H + 1e-9);
      }
    }
  });

  it('abertas, vai-e-vem e dobráveis continuam dentro do vão em x e z', () => {
    for (const id of ['ot_pvv90', 'ot_pd120', 'ot_ps90']) {
      const c = cena(id);
      const hw = c.g.width / 2;
      const H = Math.min(c.g.height, 2.8 - c.g.sill);
      for (const p of pecas(c, true)) {
        const b = caixaDaPeca(p);
        expect(b.x0, id).toBeGreaterThanOrEqual(-hw - 1e-9);
        expect(b.x1, id).toBeLessThanOrEqual(hw + 1e-9);
        expect(b.z0, id).toBeGreaterThanOrEqual(-1e-9);
        expect(b.z1, id).toBeLessThanOrEqual(H + 1e-9);
      }
    }
  });
});

describe('porta pivotante aberta', () => {
  const jambDe = (c: { p: Project; o: Opening }): number => {
    const f = frameOfWall(c.p, 'w')!;
    const core = coreSpan(f.type);
    return openingFrame(c.p.openingTypes[c.o.typeId]!, core.to - core.from).frameWidth;
  };
  const sOf = (g: OpeningGeometry, pt: { x: number; y: number }): number => (pt.x - g.center.x) * g.n.x + (pt.y - g.center.y) * g.n.y;

  it('eixo a W/4 da ombreira de flipHand e lado da banda curta igual ao da planta nas 4 combinações', () => {
    for (const flipHand of [false, true]) {
      for (const flipFacing of [false, true]) {
        const c = cena('ot_pp80', {}, { flipHand, flipFacing });
        const leafW = c.g.width - 2 * jambDe(c);
        const folha = pecas(c, true).find((x) => x.hinge)!;
        const caso = `hand=${flipHand} facing=${flipFacing}`;
        expect(folha.hinge!.axis, caso).toBe('z');
        expect(folha.hinge!.at, caso).toBeCloseTo((flipHand ? 1 : -1) * (c.g.width / 4), 9);
        expect(Math.abs(folha.hinge!.angle), caso).toBeCloseTo(Math.PI / 2, 9);
        // Planta: o primeiro arco suave é o da banda curta, que termina na ombreira da dobradiça.
        const curta = openingSymbolPaths(c.g).filter((s) => s.tone === 'soft')[0]!;
        const ladoPlanta = Math.sign(sOf(c.g, curta.pts[0]!));
        expect(ladoPlanta, caso).toBe(flipFacing ? -1 : 1);
        // 3D: lado da ponta da folha do lado da dobradiça, depois do giro em torno do eixo z.
        const pontaDobradica = (flipHand ? 1 : -1) * (leafW / 2);
        const lado3D = Math.sign((pontaDobradica - folha.hinge!.at) * Math.sin(folha.hinge!.angle));
        expect(lado3D, caso).toBe(ladoPlanta);
      }
    }
  });

  it('fechada: folha no centro de t, apoiada no batente (sem dobradiça)', () => {
    const c = cena('ot_pp80', { frameDepthMode: 'core' });
    const fechada = pecas(c, false);
    expect(fechada.some((x) => x.hinge)).toBe(false);
    const folha = fechada.find((x) => x.role === 'leaf')!;
    const f = frameOfWall(c.p, 'w')!;
    const core = coreSpan(f.type);
    const fr = openingFrame(c.p.openingTypes[c.o.typeId]!, core.to - core.from);
    // Batente no núcleo (modo core): a folha fica 4 mm da face do núcleo (y = início do núcleo + folga + meia espessura).
    // A folha ocupa quase todo o vão: metade da largura = eixo + braço sem varrer a ombreira, √((face − eixo − 0,5 mm)² − L²).
    const eixo = c.g.width / 4;
    const face = c.g.width / 2 - 0.05;
    expect(folha.w).toBeCloseTo(2 * (eixo + Math.sqrt((face - eixo - 0.0005) ** 2 - fr.leafThickness ** 2)), 9);
    expect(folha.x).toBeCloseTo(0, 9);
    expect(folha.y).toBeCloseTo(core.from + 0.004 + fr.leafThickness / 2, 9);
  });
});

interface Ponto3D {
  x: number;
  y: number;
  z: number;
}

/** Aplica ao ponto a mesma cadeia de transformações que a cena usa (deslocamento de correr e dobradiça). */
function transformar(p: Ponto3D, piece: OpeningPiece): Ponto3D {
  let { x, y, z } = p;
  const s = piece.slide;
  if (s) {
    x += s.dx;
    y += s.dy;
    z += s.dz;
  }
  const h = piece.hinge;
  if (!h) return { x, y, z };
  const atS = h.atS ?? 0;
  const cos = Math.cos(h.angle);
  const sin = Math.sin(h.angle);
  if (h.axis === 'z') {
    const dx = x - h.at;
    const dy = y - atS;
    return { x: h.at + dx * cos - dy * sin, y: atS + dx * sin + dy * cos, z };
  }
  const dy = y - atS;
  const dz = z - h.at;
  return { x, y: atS + dy * cos - dz * sin, z: h.at + dy * sin + dz * cos };
}

/** Caixa alinhada da peça depois do movimento, a partir dos 8 cantos. */
function caixaDaPeca(piece: OpeningPiece): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const p = transformar({ x: piece.x + (sx * piece.w) / 2, y: piece.y + (sy * piece.d) / 2, z: piece.z + (sz * piece.h) / 2 }, piece);
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
        z0 = Math.min(z0, p.z);
        z1 = Math.max(z1, p.z);
      }
    }
  }
  return { x0, x1, y0, y1, z0, z1 };
}

/** Assinatura da malha: nº de caixas e volume total por material (estado fechado). */
function assinatura(pc: OpeningPiece[]): { count: number; volumes: Record<string, number> } {
  const volumes: Record<string, number> = {};
  for (const x of pc) volumes[x.materialId] = (volumes[x.materialId] ?? 0) + x.w * x.d * x.h;
  return { count: pc.length, volumes };
}

describe('modelo único no 3D: todos os campos do tipo mudam a malha', () => {
  const campos: Array<{ nome: string; base: string; extra: Partial<OpeningType> }> = [
    { nome: 'leafStyle', base: 'ot_p90', extra: { leafStyle: 'panel' } },
    { nome: 'handle', base: 'ot_p90', extra: { handle: 'knob' } },
    { nome: 'grid', base: 'ot_jfixa60', extra: { grid: { cols: 2, rows: 2 } } },
    { nome: 'transom', base: 'ot_p90', extra: { transom: { height: 0.3 } } },
    { nome: 'sidelights', base: 'ot_p90', extra: { sidelights: { left: true, width: 0.2 } } },
    { nome: 'casing', base: 'ot_p90', extra: { casing: { width: 0.05, thickness: 0.015 } } },
    { nome: 'sillBoard', base: 'ot_j120', extra: { sillBoard: { projection: 0.03, thickness: 0.02 } } },
    { nome: 'lintel', base: 'ot_p90', extra: { lintel: {} } },
    { nome: 'sillBeam', base: 'ot_p90', extra: { sillBeam: {} } },
    { nome: 'frameStyle', base: 'ot_p90', extra: { frameStyle: 'simple' } },
    { nome: 'frameDepth', base: 'ot_p90', extra: { frameDepthMode: 'fixed', frameDepth: 0.09 } },
    { nome: 'frameWidth', base: 'ot_p90', extra: { frameWidth: 0.08 } },
    { nome: 'leafThickness', base: 'ot_p90', extra: { leafThickness: 0.06 } },
    { nome: 'glassThickness', base: 'ot_j120', extra: { glassThickness: 0.02 } },
  ];

  for (const campo of campos) {
    it(`${campo.nome}: a assinatura (caixas + volume por material) muda em relação ao tipo base`, () => {
      const base = assinatura(pecas(cena(campo.base)));
      const com = assinatura(pecas(cena(campo.base, campo.extra)));
      expect(com).not.toEqual(base);
    });
  }
});

describe('movimento do modelo único no 3D', () => {
  it('porta de giro ot_p90: a folha gira 90° na dobradiça do modelo, que fica fixa; angle3d = 45° gira 45°', () => {
    for (const flipHand of [false, true]) {
      for (const flipFacing of [false, true]) {
        const c = cena('ot_p90', {}, { flipHand, flipFacing });
        const aberta = pecas(c, true);
        const folha = aberta.find((x) => x.role === 'leaf')!;
        const h = folha.hinge;
        if (!h) throw new Error('folha aberta sem dobradiça');
        const caso = `hand=${flipHand} facing=${flipFacing}`;
        expect(h.axis, caso).toBe('z');
        expect(Math.abs(h.angle), caso).toBeCloseTo(Math.PI / 2, 9);
        const atS = h.atS ?? 0;
        const centro = transformar({ x: folha.x, y: folha.y, z: folha.z }, folha);
        // Gira em torno da dobradiça: o centro vai para o plano perpendicular, a meia largura do eixo. O eixo fica na face
        // da folha (não no centro da espessura), então o centro está a meia espessura (0,02 m) do eixo, do lado da folha.
        expect(centro.x, caso).toBeCloseTo(h.at + (flipHand ? -1 : 1) * folha.d / 2, 9);
        expect(Math.sign(centro.y - atS), caso).toBe(flipFacing ? -1 : 1);
        expect(Math.abs(centro.y - atS), caso).toBeCloseTo(folha.w / 2, 9);
        // A aresta da dobradiça continua no eixo.
        const dobradica = transformar({ x: h.at, y: atS, z: folha.z }, folha);
        expect(dobradica.x, caso).toBeCloseTo(h.at, 9);
        expect(dobradica.y, caso).toBeCloseTo(atS, 9);

        const c45 = cena('ot_p90', { angle3d: 45 }, { flipHand, flipFacing });
        const folha45 = pecas(c45, true).find((x) => x.role === 'leaf')!;
        expect(Math.abs(folha45.hinge!.angle), caso).toBeCloseTo(Math.PI / 4, 9);
      }
    }
  });

  it('maxim-ar: gira no eixo horizontal do topo da folha pelo angle3d (padrão 30°), para o lado de flipFacing', () => {
    const c = cena('ot_j60');
    const aberta = pecas(c, true);
    const movel = aberta.find((x) => x.hinge?.axis === 'x')!;
    const h = movel.hinge!;
    const atS = h.atS ?? 0;
    expect(Math.abs(h.angle)).toBeCloseTo(Math.PI / 6, 9);
    expect(h.at).toBeCloseTo(c.g.height - 0.05, 9);
    // O fundo da folha sai do plano da parede para o lado de `flipFacing`.
    const fundo = transformar({ x: movel.x, y: movel.y, z: movel.z - movel.h / 2 }, movel);
    expect(Math.sign(fundo.y - atS)).toBe(c.g.flipFacing ? -1 : 1);

    const c45 = cena('ot_j60', { angle3d: 45 });
    const movel45 = pecas(c45, true).find((x) => x.hinge?.axis === 'x')!;
    expect(Math.abs(movel45.hinge!.angle)).toBeCloseTo(Math.PI / 4, 9);
  });

  it('correr desliza dentro do vão (janela e porta)', () => {
    for (const [id, role] of [
      ['ot_j120', 'glass'],
      ['ot_pc160', 'leaf'],
    ] as const) {
      const c = cena(id);
      const aberta = pecas(c, true).filter((x) => x.material === role);
      const hw = c.g.width / 2;
      expect(aberta.some((x) => x.slide && Math.abs(x.slide.dx) > 1e-9), id).toBe(true);
      for (const p of aberta) {
        const b = caixaDaPeca(p);
        expect(b.x0, id).toBeGreaterThanOrEqual(-hw - 1e-9);
        expect(b.x1, id).toBeLessThanOrEqual(hw + 1e-9);
      }
    }
  });

  it('nenhuma peça sai do vão, fechada ou aberta (exceto alizar, peitoril saliente, verga e contraverga)', () => {
    const fora = new Set<OpeningPiece['role']>(['casing', 'sillBoard', 'lintel', 'sillBeam']);
    const familias: Array<{ base: string; extra?: Partial<OpeningType> }> = [
      { base: 'ot_p90' },
      { base: 'ot_p160' },
      { base: 'ot_pc160' },
      { base: 'ot_pp80' },
      { base: 'ot_vao90' },
      { base: 'ot_jfixa60' },
      { base: 'ot_j60' },
      { base: 'ot_j60', extra: { plan: 'tilt' } },
      { base: 'ot_j120' },
      { base: 'ot_j240' },
      { base: 'ot_jv120' },
    ];
    for (const familia of familias) {
      for (const open of [false, true]) {
        const c = cena(familia.base, familia.extra ?? {});
        const hw = c.g.width / 2;
        const H = Math.min(c.g.height, 2.8 - c.g.sill);
        for (const p of pecas(c, open)) {
          if (fora.has(p.role) || (open && p.role === 'handle')) continue; // aberta, a maçaneta sai da face da folha e passa o vão em t
          const b = caixaDaPeca(p);
          const caso = `${familia.base}${open ? ' aberta' : ' fechada'} ${p.role}`;
          expect(b.x0, caso).toBeGreaterThanOrEqual(-hw - 1e-9);
          expect(b.x1, caso).toBeLessThanOrEqual(hw + 1e-9);
          expect(b.z0, caso).toBeGreaterThanOrEqual(-1e-9);
          expect(b.z1, caso).toBeLessThanOrEqual(H + 1e-9);
        }
      }
    }
  });

  it('detail3d filtra o que a vista mostra: off só o vão; schematic e simple sem maçaneta/almofadas; full tudo', () => {
    const completo = pecas(cena('ot_p90', { leafStyle: 'panel' }));
    expect(completo.some((x) => x.role === 'handle')).toBe(true);
    expect(completo.some((x) => x.role === 'leafPanel')).toBe(true);
    const schematic = pecas(cena('ot_p90', { leafStyle: 'panel', detail3d: 'schematic' }));
    expect(schematic.length).toBeGreaterThan(0);
    expect(schematic.some((x) => x.role === 'handle' || x.role === 'leafPanel' || x.role === 'muntin')).toBe(false);
    const simple = pecas(cena('ot_p90', { leafStyle: 'panel', detail3d: 'simple' }));
    expect(simple.some((x) => x.role === 'handle' || x.role === 'leafPanel')).toBe(false);
    expect(pecas(cena('ot_p90', { detail3d: 'off' }))).toHaveLength(0);
    const full = pecas(cena('ot_p90', { leafStyle: 'panel', detail3d: 'full' }));
    expect(full).toEqual(completo);
  });
});

describe('vão bruto: o furo da parede no 3D e na planta coincide', () => {
  /** Intervalos de `t` dos polígonos do corte (a parede reta vira dois retângulos ladeando o vão). */
  function intervalosDeT(poly: MultiPolygon, f: WallFrame): Array<[number, number]> {
    return poly
      .map((rings) => {
        const ts = rings[0]!.map((p) => toLocal(f, p).t);
        return [Math.min(...ts), Math.max(...ts)] as [number, number];
      })
      .sort((a, b) => a[0] - b[0]);
  }

  /** Largura do vão (intervalo sem material) que contém `offset`, em `t`. */
  function vaoEm(poly: MultiPolygon, f: WallFrame, offset: number): number {
    const ints = intervalosDeT(poly, f);
    for (let i = 0; i < ints.length - 1; i++) {
      if (ints[i]![1] < offset && offset < ints[i + 1]![0]) return ints[i + 1]![0] - ints[i]![1];
    }
    return 0;
  }

  it('planta (cut) e 3D (bands) recortam o mesmo vão bruto, e as peças ficam no vão nominal', () => {
    const c = cena('ot_p90', { roughOversize: { w: 0.06, h: 0.04 } });
    const f = frameOfWall(c.p, 'w')!;
    const g = openingGeometry(c.p, c.o, f);
    expect(g.roughWidth).toBeCloseTo(c.g.width + 0.06, 9);
    expect(g.roughHeight).toBeCloseTo(c.g.height + 0.04, 9);
    const lv = resolveLevel(c.p, 'lv_0');
    const rw = lv.walls['w']!;
    // 3D: as faixas que atravessam o vão têm o mesmo furo do corte em planta (cut) da MESMA camada; as de fora não
    // têm furo nenhum. O maior furo é o do núcleo e vale o vão bruto.
    const z0 = g.sill;
    const z1 = g.sill + g.roughHeight;
    let larguraMax = 0;
    let faixasNoVao = 0;
    for (const layer of rw.layers) {
      const planta = vaoEm(layer.cut, f, c.g.offset);
      larguraMax = Math.max(larguraMax, planta);
      let noVaoDaCamada = 0;
      for (const band of layer.bands) {
        const noVao = band.z0 < z1 - 1e-9 && band.z1 > z0 + 1e-9;
        if (noVao) {
          faixasNoVao++;
          noVaoDaCamada++;
          expect(vaoEm(band.poly, f, c.g.offset), `${layer.materialId} ${band.z0}..${band.z1}`).toBeCloseTo(planta, 6);
        } else {
          expect(vaoEm(band.poly, f, c.g.offset), `${layer.materialId} ${band.z0}..${band.z1}`).toBe(0);
        }
      }
      if (noVaoDaCamada > 0) expect(planta, layer.materialId).toBeGreaterThan(0);
    }
    expect(faixasNoVao).toBeGreaterThan(0);
    expect(larguraMax).toBeCloseTo(g.roughWidth, 6);
    // As peças do modelo continuam no vão NOMINAL (o vão bruto só aumenta o furo da parede).
    for (const p of pecas(c)) {
      if (p.role === 'casing' || p.role === 'sillBoard' || p.role === 'lintel' || p.role === 'sillBeam') continue;
      expect(p.x - p.w / 2, p.role).toBeGreaterThanOrEqual(-c.g.width / 2 - 1e-9);
      expect(p.x + p.w / 2, p.role).toBeLessThanOrEqual(c.g.width / 2 + 1e-9);
    }
  });
});

describe('a cena monta a dobradiça e o deslocamento do modelo', () => {
  const desenhar = (parent: THREE.Object3D, geo: THREE.BufferGeometry): void => {
    parent.add(new THREE.Mesh(geo));
  };

  it('porta de giro: os pivôs ficam em (t, s) da dobradiça do modelo e giram 90°', () => {
    for (const flipHand of [false, true]) {
      for (const flipFacing of [false, true]) {
        const c = cena('ot_p90', {}, { flipHand, flipFacing });
        const f = frameOfWall(c.p, 'w')!;
        const view = { ...view3dOf(c.p), openOpenings: true };
        const m = montarAbertura(c.p, c.o, f, 0, 2.8, view, false, desenhar)!;
        const abertas = pecas(c, true).filter((x) => x.hinge?.axis === 'z');
        const pivos = m.grupo.children.filter((o): o is THREE.Group => o instanceof THREE.Group && Math.abs(o.rotation.z) > 1e-9);
        expect(pivos, `hand=${flipHand} facing=${flipFacing}`).toHaveLength(abertas.length);
        for (let i = 0; i < pivos.length; i++) {
          const h = abertas[i]!.hinge!;
          expect(pivos[i]!.position.x).toBeCloseTo(h.at, 9);
          expect(pivos[i]!.position.y).toBeCloseTo(h.atS ?? 0, 9);
          expect(Math.abs(pivos[i]!.rotation.z)).toBeCloseTo(Math.PI / 2, 9);
        }
      }
    }
  });

  it('maxim-ar: os pivôs ficam no eixo horizontal (s, z) do topo da folha e giram 30°', () => {
    const c = cena('ot_j60');
    const f = frameOfWall(c.p, 'w')!;
    const view = { ...view3dOf(c.p), openOpenings: true };
    const m = montarAbertura(c.p, c.o, f, 0, 2.8, view, false, desenhar)!;
    const abertas = pecas(c, true).filter((x) => x.hinge?.axis === 'x');
    const pivos = m.grupo.children.filter((o): o is THREE.Group => o instanceof THREE.Group && Math.abs(o.rotation.x) > 1e-9);
    expect(pivos).toHaveLength(abertas.length);
    for (let i = 0; i < pivos.length; i++) {
      const h = abertas[i]!.hinge!;
      expect(pivos[i]!.position.y).toBeCloseTo(h.atS ?? 0, 9);
      expect(pivos[i]!.position.z).toBeCloseTo(h.at, 9);
      expect(Math.abs(pivos[i]!.rotation.x)).toBeCloseTo(Math.PI / 6, 9);
    }
  });

  it('correr: a matriz de caixas aplica o mesmo deslocamento do modelo', () => {
    const c = cena('ot_j120');
    const f = frameOfWall(c.p, 'w')!;
    const view = { ...view3dOf(c.p), openOpenings: true };
    const caixas = caixasDaAbertura(c.p, c.o, f, 0, 2.8, view)!;
    const abertas = pecas(c, true);
    expect(caixas).toHaveLength(abertas.length);
    const vao = new THREE.Matrix4().makeRotationZ(Math.atan2(c.g.u.y, c.g.u.x)).setPosition(c.g.center.x, c.g.center.y, c.g.sill);
    let moveis = 0;
    for (let i = 0; i < abertas.length; i++) {
      const p = abertas[i]!;
      if (!p.slide) continue;
      moveis++;
      const esperado = new THREE.Vector3(p.x + p.slide.dx, p.y + p.slide.dy, p.z + p.slide.dz).applyMatrix4(vao);
      const pos = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(caixas[i]!.matriz));
      expect(pos.x).toBeCloseTo(esperado.x, 9);
      expect(pos.y).toBeCloseTo(esperado.y, 9);
      expect(pos.z).toBeCloseTo(esperado.z, 9);
    }
    expect(moveis).toBeGreaterThan(0);
  });
});
