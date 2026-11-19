import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { openingGeometry, frameOfWall, resolveLevel } from './resolve.ts';
import { openingShapeIssues } from './openingShapeIssues.ts';
import { openingNormProjectIssues, portasParaNorma } from './openingNormProject.ts';
import { definirClienteFuroContorno, furarParedePorContorno, pedidoFuroDaParede, rotaDoVao, vaosPorRota, type ClienteFuroContorno } from './furoContornoDespacho.ts';

function projeto(shape: OpeningShape | undefined, wall: { sag?: number; tilt?: number } = {}, typeExtra: Record<string, unknown> = {}): Project {
  const base = createEmptyProject();
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', ...(shape ? { shape } : {}), ...typeExtra };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, ...wall }) });
  const o: Opening = { id: 'o1', kind: 'door', typeId: 'ot_arco', hostId: 'w1', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: o });
  return s.project;
}
const geom = (p: Project) => openingGeometry(p, p.elements.o1 as Opening, frameOfWall(p, 'w1')!);

afterEach(() => definirClienteFuroContorno(null));

describe('openingShapeIssues', () => {
  it('sem forma, rect e forma válida: nenhum aviso', () => {
    expect(openingShapeIssues(projeto(undefined))).toEqual([]);
    expect(openingShapeIssues(projeto({ kind: 'rect', width: 1, height: 1 }))).toEqual([]);
    expect(openingShapeIssues(projeto({ kind: 'round', width: 1, height: 1 }))).toEqual([]);
  });

  it('forma inválida (altura do vão menor que w/2): aviso com código estável e tradução', () => {
    const p = projeto({ kind: 'round', width: 1, height: 1 }, {}, { width: 1.2, height: 0.5 });
    const pt = openingShapeIssues(p, 'pt');
    expect(pt).toHaveLength(1);
    expect(pt[0]).toMatchObject({ severity: 'warning', code: 'forma-vao-invalida', elementId: 'o1' });
    expect(pt[0]!.message).toContain('round-height-below-half');
    expect(openingShapeIssues(p, 'en')[0]!.message).toContain('invalid opening shape');
  });

  it('forma válida em parede curva ou inclinada: aviso de forma ignorada', () => {
    const curva = openingShapeIssues(projeto({ kind: 'round', width: 1, height: 1 }, { sag: 1 }));
    expect(curva.map((i) => i.code)).toEqual(['forma-vao-ignorada-na-parede']);
    const incl = openingShapeIssues(projeto({ kind: 'round', width: 1, height: 1 }, { tilt: 5 }));
    expect(incl.map((i) => i.code)).toEqual(['forma-vao-ignorada-na-parede']);
  });
});

describe('forma-incompatível-com-operação (matriz shapeCompat, docs/estudo-esquadrias/39)', () => {
  const correr = { plan: 'sliding', leaves: 2, width: 1.6, height: 2.1 };
  it('porta de correr em círculo: aviso com o nome da operação e da forma; em arco pleno (adaptado) e porta de giro em arco (ok), nenhum', () => {
    const p = projeto({ kind: 'circle', width: 1.6, height: 2.1 }, {}, correr);
    const av = openingShapeIssues(p, 'pt').filter((i) => i.code === 'forma-incompatível-com-operação');
    expect(av).toHaveLength(1);
    expect(av[0]).toMatchObject({ severity: 'warning', elementId: 'o1' });
    expect(av[0]!.message).toContain('o1');
    expect(av[0]!.message).toContain('círculo');
    expect(av[0]!.message).toContain('FIXA');
    const codes = (q: Project): string[] => openingShapeIssues(q).map((i) => i.code);
    expect(codes(projeto({ kind: 'round', width: 1.6, height: 2.1 }, {}, correr))).not.toContain('forma-incompatível-com-operação');
    expect(codes(projeto({ kind: 'round', width: 1, height: 1 }))).not.toContain('forma-incompatível-com-operação');
    expect(codes(projeto(undefined, {}, correr))).toEqual([]);
  });

  it('a mensagem existe nos 7 idiomas, com o id e sem chave crua', () => {
    const p = projeto({ kind: 'circle', width: 1.6, height: 2.1 }, {}, correr);
    const vistas = new Set<string>();
    for (const lang of ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const) {
      const m = openingShapeIssues(p, lang).find((i) => i.code === 'forma-incompatível-com-operação')!.message;
      expect(m, lang).toContain('o1');
      expect(m, lang).not.toContain('egb_issue');
      expect(m, lang).not.toContain('{');
      vistas.add(m);
    }
    expect(vistas.size).toBeGreaterThanOrEqual(2); // pt e en distintos (os demais idiomas vêm do dicionário do aplicativo)
  });
});

describe('forma na geometria do vão e no despacho', () => {
  it('vão retangular: OpeningGeometry sem `forma` (números de hoje)', () => {
    expect('forma' in geom(projeto(undefined))).toBe(false);
    expect('forma' in geom(projeto({ kind: 'rect', width: 1, height: 1 }))).toBe(false);
  });

  it('forma inválida não entra na geometria (cai em retângulo)', () => {
    expect(geom(projeto({ kind: 'round', width: 1, height: 1 }, {}, { width: 1.2, height: 0.5 })).forma).toBeUndefined();
  });

  it('forma válida entra dimensionada pelo vão; o furo em planta e em faixas continua o retangular', () => {
    const p = projeto({ kind: 'round', width: 9, height: 9 });
    const g = geom(p);
    expect(g.forma).toMatchObject({ kind: 'round', width: 0.9, height: 2.1 });
    const rw = resolveLevel(p, 'lv_0').walls.w1!;
    const semForma = resolveLevel(projeto(undefined), 'lv_0').walls.w1!;
    expect(rw.layers.length).toBe(semForma.layers.length);
  });

  it('sem cliente instalado a rota é sempre retangular; com cliente, só vão com forma em parede reta e vertical', () => {
    const g = geom(projeto({ kind: 'round', width: 1, height: 1 }));
    expect(rotaDoVao(g)).toEqual({ via: 'retangular', motivo: 'sem-cliente' });
    expect(rotaDoVao(geom(projeto(undefined)))).toEqual({ via: 'retangular', motivo: 'sem-forma' });
    const cliente: ClienteFuroContorno = { furarParede: () => ({ camadas: [], volume: 0, volumeRemovido: 0 }) };
    definirClienteFuroContorno(cliente);
    expect(rotaDoVao(g)).toEqual({ via: 'contorno' });
    expect(rotaDoVao(g, { tilt: 5 })).toEqual({ via: 'retangular', motivo: 'parede-inclinada' });
    expect(rotaDoVao({ forma: g.forma, curve: { arc: {} as never, sMid: 0 } })).toEqual({ via: 'retangular', motivo: 'parede-curva' });
    expect(vaosPorRota([g], 'w1').comContorno).toHaveLength(1);
    expect(vaosPorRota([g], 'outra').comContorno).toHaveLength(0);
  });

  it('pedido do furo: contorno do vão na posição e na cota; o cliente injetado recebe o pedido', () => {
    const g = geom(projeto({ kind: 'round', width: 1, height: 1 }));
    const pedido = pedidoFuroDaParede('w1', { comprimento: 6, altura: 3, espessuras: [0.14] }, [g]);
    expect(pedido.vaos).toHaveLength(1);
    expect(pedido.vaos[0]).toMatchObject({ openingId: 'o1', x: 3, soleira: 0 });
    expect(pedido.vaos[0]!.contorno.length).toBeGreaterThan(8);
    expect(furarParedePorContorno(pedido)).toBeNull(); // sem cliente
    let recebido = 0;
    definirClienteFuroContorno({ furarParede: (r) => { recebido = r.vaos.length; return null; } });
    expect(furarParedePorContorno(pedido)).toBeNull();
    expect(recebido).toBe(1);
  });
});

describe('avisos normativos de porta ligados ao projeto', () => {
  it('porta de 70 cm: vão menor que 0,80 m', () => {
    const p = projeto(undefined, {}, { width: 0.7 });
    expect(portasParaNorma(p)).toHaveLength(1);
    expect(openingNormProjectIssues(p).map((i) => i.code)).toEqual(['porta-vao-livre-menor']);
  });

  it('porta de 90 cm sem dados de vidro e soleira: sem aviso; vidro não seguro avisa', () => {
    expect(openingNormProjectIssues(projeto(undefined))).toEqual([]);
    const p = projeto(undefined, {}, { leafStyle: 'glass', glassKind: 'smoke' });
    expect(openingNormProjectIssues(p).map((i) => i.code)).toEqual(['porta-vidro-nao-seguro']);
    expect(openingNormProjectIssues(projeto(undefined, {}, { leafStyle: 'glass', glassKind: 'tempered' }))).toEqual([]);
  });
});
