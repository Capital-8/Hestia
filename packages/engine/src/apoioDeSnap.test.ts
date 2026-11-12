import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STAIR_TYPES,
  ProjectStore,
  createEmptyProject,
  defaultStairTypeId,
  makeGuardaCorpo,
  makeStair,
  type HospedeiroManual,
  type Project,
  type StairType,
} from '@hestia/model';
import { apoioDoElemento, pontoDeApoio, type ApoioDoElemento } from './apoioDeSnap.ts';
import { projetoGuardaCorpo, straight } from './fixtureGuardaCorpo.ts';
import type { LinhaVistaGC } from './guardaCorpoVista.ts';
import { servicoGuardaCorpo } from './kernelGuardaCorpoServico.ts';

afterEach(() => vi.restoreAllMocks());

/** Escada reta de `n` espelhos (passo 0,28 m, largura 1,2 m) com ou sem acabamento (piso, espelho e bocel de 2 cm). */
function escada(opts: { n?: number; acabamento?: boolean } = {}): { p: Project; id: string } {
  const s = new ProjectStore(createEmptyProject());
  let typeId = defaultStairTypeId;
  if (opts.acabamento) {
    typeId = 'stt_acab';
    const base = DEFAULT_STAIR_TYPES.find((t) => t.id === defaultStairTypeId)!;
    s.exec({ type: 'upsertStairType', stairType: { ...base, id: typeId, treadFinishEnabled: true, riserFinishEnabled: true, bocelEnabled: true, bocelProjection: 0.02 } as StairType });
  }
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [straight(opts.n ?? 5, 0.28)] }) });
  return { p: s.project, id: 'st1' };
}

const chaves = (a: ApoioDoElemento, prefixo: string): string[] => a.pontos.filter((q) => q.chave.startsWith(prefixo)).map((q) => q.chave);
const apoio = (p: Project, id: string): ApoioDoElemento => {
  const a = apoioDoElemento(p, p.elements[id]);
  if (!a) throw new Error(`sem apoio para ${id}`);
  return a;
};
const near = (q: { x: number; y: number } | null | undefined, x: number, y: number): void => {
  expect(q).toBeTruthy();
  expect(q!.x).toBeCloseTo(x, 9);
  expect(q!.y).toBeCloseTo(y, 9);
};

describe('apoio da escada', () => {
  it('degraus: vértices, meio de cada aresta e centro, com chaves nomeadas; sem repetição', () => {
    const { p, id } = escada();
    const a = apoio(p, id);
    // Degrau 1 do lance 0: 4 cantos, 4 meios, 1 centro.
    expect(chaves(a, 'd0.t1.v')).toHaveLength(4);
    expect(chaves(a, 'd0.t1.m')).toHaveLength(4);
    near(a.porChave.get('d0.t1.c'), 0.14, 0);
    near(a.porChave.get('d0.t1.m1'), 0.14, -0.6);
    // Eixo da subida e chegada.
    expect(chaves(a, 'eixo0.v').length).toBeGreaterThanOrEqual(2);
    expect(chaves(a, 'chegada.').length).toBeGreaterThan(0);
    // Sem acabamento nada de piso acabado, bocel ou faixa de espelho.
    expect(a.pontos.some((q) => /^(pf|bo|ef)/.test(q.chave))).toBe(false);
    // Nem tipo+posição nem chave se repetem.
    const pos = a.pontos.map((q) => `${q.tipo}|${q.x.toFixed(6)},${q.y.toFixed(6)}`);
    expect(new Set(pos).size).toBe(pos.length);
    expect(new Set(a.pontos.map((q) => q.chave)).size).toBe(a.pontos.length);
    const seg = a.segmentos.map((e) => [e.a, e.b].map((q) => `${q.x.toFixed(6)},${q.y.toFixed(6)}`).sort().join('|'));
    expect(new Set(seg).size).toBe(seg.length);
  });

  it('com acabamento: faixa do espelho, piso acabado e bocel são geometrias próprias', () => {
    const { p, id } = escada({ acabamento: true });
    const a = apoio(p, id);
    // Faixa do espelho acabado 1: 1 cm atrás da face do espelho (a face acabada fica em x = 0).
    const faixa = a.pontos.filter((q) => q.chave.startsWith('ef1.') && q.tipo === 'endpoint');
    expect(faixa.some((q) => Math.abs(q.x - 0.01) < 1e-9 && Math.abs(q.y + 0.6) < 1e-9)).toBe(true);
    expect(faixa.some((q) => Math.abs(q.x - 0.01) < 1e-9 && Math.abs(q.y - 0.6) < 1e-9)).toBe(true);
    // Bocel do degrau 1: faixa de 2 cm à frente da face do espelho (x de -0,02 a 0); o meio da aresta lateral está em x = -0,01.
    const meios = a.pontos.filter((q) => q.chave.startsWith('bo0.t1.') && q.tipo === 'midpoint');
    expect(meios.some((q) => Math.abs(q.x + 0.01) < 1e-9 && Math.abs(Math.abs(q.y) - 0.6) < 1e-9)).toBe(true);
    // Piso acabado: leva o bocel (frente em x = -0,02) e corre sob o espelho acabado de trás (até x = 0,29); só os cantos que o degrau
    // não tem entram com a chave do piso (pf) ou do bocel (bo), porque o mesmo ponto não se repete.
    const novos = a.pontos.filter((q) => /^(pf|bo)/.test(q.chave) && q.tipo === 'endpoint');
    const em = (x: number, y: number): boolean => novos.some((q) => Math.abs(q.x - x) < 1e-6 && Math.abs(q.y - y) < 1e-6);
    expect(em(-0.02, -0.6) && em(-0.02, 0.6)).toBe(true);
    expect(chaves(a, 'bo').length).toBeGreaterThan(0);
  });

  it('as chaves seguem o elemento: mover a escada leva todos os pontos junto', () => {
    const { p, id } = escada({ acabamento: true });
    const s = new ProjectStore(p);
    const antes = apoio(s.project, id);
    s.exec({ type: 'transform', ids: [id], transform: { kind: 'translate', d: { x: 3, y: -2 } } });
    const depois = apoio(s.project, id);
    expect(depois.pontos).toHaveLength(antes.pontos.length);
    for (const q of antes.pontos) near(pontoDeApoio(s.project, id, q.chave), q.x + 3, q.y - 2);
  });

  it('chave que sumiu (menos degraus) resolve para null', () => {
    const { p, id } = escada({ n: 5 });
    expect(pontoDeApoio(p, id, 'd0.t4.c')).not.toBeNull();
    const curta = escada({ n: 3 });
    expect(pontoDeApoio(curta.p, curta.id, 'd0.t4.c')).toBeNull();
    expect(pontoDeApoio(p, id, 'inexistente')).toBeNull();
    expect(pontoDeApoio(p, 'nao-existe', 'd0.t1.c')).toBeNull();
  });
});

describe('apoio da rampa', () => {
  it('lances, bordas de início e fim, eixo e contorno', () => {
    const { p } = projetoGuardaCorpo();
    const a = apoio(p, 'rp1');
    expect(chaves(a, 'l0.v').length).toBeGreaterThanOrEqual(4);
    expect(chaves(a, 'l0.c')).toHaveLength(1);
    expect(chaves(a, 'eixo0.v')).toHaveLength(2);
  });
});

/** Linhas de planta do kernel (substituídas): dois postes, um corrimão, um balaústre e o eixo, no formato de `decodificarLinhasGC`. */
const linhas = (gid: string): LinhaVistaGC[] => [
  { guardaId: gid, papel: 0, estilo: 0, pontos: [{ x: 0, y: -0.05 }, { x: 0.1, y: -0.05 }, { x: 0.1, y: 0.05 }, { x: 0, y: 0.05 }] },
  { guardaId: gid, papel: 0, estilo: 0, pontos: [{ x: 3.9, y: -0.05 }, { x: 4, y: -0.05 }, { x: 4, y: 0.05 }, { x: 3.9, y: 0.05 }] },
  { guardaId: gid, papel: 3, estilo: 1, pontos: [{ x: 0, y: -0.03 }, { x: 4, y: -0.03 }, { x: 4, y: 0.03 }, { x: 0, y: 0.03 }] },
  { guardaId: gid, papel: 1, estilo: 0, pontos: [{ x: 1, y: -0.01 }, { x: 1.02, y: -0.01 }, { x: 1.02, y: 0.01 }, { x: 1, y: 0.01 }] },
  { guardaId: gid, papel: 255, estilo: 1, pontos: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },
];

const manual: HospedeiroManual = { tipo: 'manual', uso: 'varanda', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 4, y: 0, dz: 0 }, { x: 4, y: 3, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' };

function comGuardaManual(): { p: Project; id: string } {
  const s = new ProjectStore(createEmptyProject());
  const typeId = Object.keys(s.project.tiposGuardaCorpo)[0]!;
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId, hospedeiro: manual }) });
  return { p: s.project, id: 'gc1' };
}

describe('apoio do guarda-corpo', () => {
  it('sem kernel pronto o manual só tem o eixo: vértices do caminho e meio de cada trecho', () => {
    const { p, id } = comGuardaManual();
    const a = apoio(p, id);
    near(a.porChave.get('eixo0.v0'), 0, 0);
    near(a.porChave.get('eixo0.v1'), 4, 0);
    near(a.porChave.get('eixo0.v2'), 4, 3);
    near(a.porChave.get('eixo0.m0'), 2, 0);
    near(a.porChave.get('eixo0.m1'), 4, 1.5);
    expect(a.pontos).toHaveLength(5);
    expect(a.segmentos).toHaveLength(2);
  });

  it('com o kernel: postes (cantos e centro), corrimão e eixo; balaústre fica de fora', () => {
    const { p, id } = comGuardaManual();
    vi.spyOn(servicoGuardaCorpo(), 'planta').mockImplementation(() => linhas(id));
    const a = apoio(p, id);
    // Postes de início e de fim: cantos, meios das arestas e o centro de cada um.
    near(a.porChave.get('p0.0.c'), 0.05, 0);
    near(a.porChave.get('p0.1.c'), 3.95, 0);
    near(a.porChave.get('p0.1.v1'), 4, -0.05);
    // Corrimão (papel 3): contorno com as quatro arestas e os meios; sem centro.
    near(a.porChave.get('p3.0.m0'), 2, -0.03);
    expect(a.porChave.has('p3.0.c')).toBe(false);
    // Balaústre (papel 1) não entra.
    expect(chaves(a, 'p1.')).toHaveLength(0);
    // O eixo do manual continua sendo o caminho do modelo (3 vértices), não a linha 255 do kernel.
    expect(chaves(a, 'eixo').filter((k) => k.includes('.v'))).toHaveLength(3);
    const pos = a.pontos.map((q) => `${q.tipo}|${q.x.toFixed(6)},${q.y.toFixed(6)}`);
    expect(new Set(pos).size).toBe(pos.length);
  });

  it('poste redondo (16 vértices do kernel): centro e quatro quadrantes, sem os meios das cordas; a borda segue como aresta', () => {
    const { p, id } = comGuardaManual();
    const redondo = Array.from({ length: 16 }, (_, k) => ({ x: 1 + 0.05 * Math.cos((k * Math.PI) / 8), y: 2 + 0.05 * Math.sin((k * Math.PI) / 8) }));
    vi.spyOn(servicoGuardaCorpo(), 'planta').mockImplementation(() => [{ guardaId: id, papel: 0, estilo: 0, pontos: [...redondo, redondo[0]!] }]);
    const a = apoio(p, id);
    const poste = a.pontos.filter((q) => q.chave.startsWith('p0.0.'));
    expect(poste.filter((q) => q.tipo === 'center')).toHaveLength(1);
    expect(poste.filter((q) => q.tipo === 'endpoint')).toHaveLength(4);
    expect(poste.filter((q) => q.tipo === 'midpoint')).toHaveLength(0);
    near(a.porChave.get('p0.0.c'), 1, 2);
    near(a.porChave.get('p0.0.q0'), 1.05, 2);
    near(a.porChave.get('p0.0.q2'), 0.95, 2);
    expect(a.segmentos.filter((e) => e.chave.startsWith('p0.0.'))).toHaveLength(16);
  });

  it('hospedado: o eixo vem da linha 255 do kernel; sem kernel não há geometria', () => {
    const { p } = projetoGuardaCorpo();
    expect(apoio(p, 'gc_e').pontos).toHaveLength(0);
    vi.spyOn(servicoGuardaCorpo(), 'planta').mockImplementation(() => linhas('gc_e'));
    const a = apoio(p, 'gc_e');
    near(a.porChave.get('eixo0.v0'), 0, 0);
    near(a.porChave.get('eixo0.m0'), 2, 0);
    expect(a.porChave.get('p0.0.c')).toBeDefined();
  });

  it('o que não é escada, rampa ou guarda-corpo devolve null', () => {
    const { p } = projetoGuardaCorpo();
    expect(apoioDoElemento(p, undefined)).toBeNull();
    expect(apoioDoElemento(p, { ...p.elements['gc_m']!, kind: 'wall' } as never)).toBeNull();
  });
});
