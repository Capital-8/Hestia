import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESTILO_PLANTA_MASSA, servicoMassa, type LinhaPlantaMassaProjeto } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeLevel, makeMass, type Id, type Mass, type Project } from '@hestia/model';
import { contornoDaBase, linhasMassaPlanta, massaOps, massaSelectionOps, massasNaCaixa, pickMassaAt, pontosDaMassaEmPlanta, pontosDoPerfil } from './massa.ts';
import { STAIR_DASH } from './stairs.ts';
import { defaultPaint, espessuraDeCorte, espessuraDeProjecao } from './style.ts';
import { LIGHT } from './types.ts';

afterEach(() => vi.restoreAllMocks());

/** Raio do quadrado de lado 8 (M3, E3 item 2): vértices em +x, +y, −x, −y. */
const R = 4 * Math.SQRT2;

/** M3 torre torcida: polígono de 4 lados, 30 m, rotação de 0 a π/2, linear. */
const m3 = (): Omit<Mass, 'order'> =>
  makeMass({
    id: 'm3',
    levelId: 'lv_0',
    name: 'M3',
    secoes: [
      { z: 0, perfil: { forma: 'poligono', lados: 4, raio: R }, rotacao: 0, escala: 1, dx: 0, dy: 0 },
      { z: 30, perfil: { forma: 'poligono', lados: 4, raio: R }, rotacao: Math.PI / 2, escala: 1, dx: 0, dy: 0 },
    ],
  });

/** Projeto com dois pavimentos (0 e 3 m) e as massas dadas. */
function projeto(...massas: Array<Omit<Mass, 'order'>>): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }) });
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Superior', elevation: 3 }) });
  for (const m of massas) s.exec({ type: 'addMass', mass: m });
  return s.project;
}

/** Anel fechado (o kernel repete o primeiro ponto no fim). */
const anel = (pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> => [...pts, pts[0]!];

/** Serviço do kernel simulado: pronto e com as linhas dadas (a planta filtra por massa; o serviço real também). */
function kernelSimulado(linhas: LinhaPlantaMassaProjeto[]): void {
  vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(true);
  vi.spyOn(servicoMassa(), 'planta').mockReturnValue(linhas);
}

const ANEL_CORTADO = anel([{ x: R, y: 0 }, { x: 0, y: R }, { x: -R, y: 0 }, { x: 0, y: -R }]);

describe('massa na planta: três estilos (A.4 regra 10)', () => {
  it('M3 com corte a 1,20 m: anel cortado forte, base projetada fina e seções de cima tracejadas', () => {
    const p = projeto(m3());
    kernelSimulado([
      { massaId: 'm3', copia: 0, estilo: ESTILO_PLANTA_MASSA.cortado, pontos: ANEL_CORTADO },
      { massaId: 'm3', copia: 0, estilo: ESTILO_PLANTA_MASSA.projetado, pontos: anel([{ x: 3, y: 0 }, { x: 0, y: 3 }, { x: -3, y: 0 }]) },
      { massaId: 'm3', copia: 0, estilo: ESTILO_PLANTA_MASSA.acima, pontos: anel([{ x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 }]) },
    ]);
    const paint = defaultPaint('mass', 50);
    const out = massaOps(p, 'lv_0', undefined, LIGHT, false, paint, 1.2);
    expect(out.strokes).toHaveLength(3);
    const [cortado, projetado, acima] = out.strokes;
    expect(cortado).toMatchObject({ closed: true, ...espessuraDeCorte(paint) });
    expect(cortado!.dash).toBeUndefined();
    expect(cortado!.pts).toHaveLength(4);
    expect(projetado).toMatchObject({ closed: true, ...espessuraDeProjecao(paint) });
    expect(projetado!.dash).toBeUndefined();
    expect(acima).toMatchObject({ closed: true, ...espessuraDeProjecao(paint), dash: STAIR_DASH });
  });

  it('o kernel é chamado com a cota de corte e a faixa de vista do nível, e a massa vem filtrada', () => {
    const p = projeto(m3());
    kernelSimulado([{ massaId: 'm3', copia: 0, estilo: ESTILO_PLANTA_MASSA.cortado, pontos: ANEL_CORTADO }]);
    const linhas = linhasMassaPlanta(p, 'lv_0', 1.2);
    expect(linhas?.map((l) => l.massaId)).toEqual(['m3']);
    expect(servicoMassa().planta).toHaveBeenCalledWith(p, null, 1.2, 0, 2.3);
  });
});

describe('massa de outro pavimento que atravessa o nível', () => {
  it('uma massa do pavimento de cima que desce até a cota de corte aparece no térreo; a que começa acima do corte não', () => {
    // Base a 0 m (3 m do nível de cima menos 3 m de deslocamento): atravessa o corte de 1,20 m do térreo.
    const atravessa = makeMass({ id: 'up', levelId: 'lv_1', name: 'Atravessa', baseOffset: -3, secoes: [{ z: 0, perfil: { forma: 'circulo', raio: 2 }, rotacao: 0, escala: 1, dx: 0, dy: 0 }, { z: 9, perfil: { forma: 'circulo', raio: 2 }, rotacao: 0, escala: 1, dx: 0, dy: 0 }] });
    const acima = makeMass({ id: 'alto', levelId: 'lv_1', name: 'Alto', secoes: [{ z: 0, perfil: { forma: 'circulo', raio: 2 }, rotacao: 0, escala: 1, dx: 0, dy: 0 }, { z: 9, perfil: { forma: 'circulo', raio: 2 }, rotacao: 0, escala: 1, dx: 0, dy: 0 }] });
    const p = projeto(atravessa, acima);
    const anelUp = anel([{ x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 }]);
    kernelSimulado([
      { massaId: 'up', copia: 0, estilo: ESTILO_PLANTA_MASSA.cortado, pontos: anelUp },
      { massaId: 'alto', copia: 0, estilo: ESTILO_PLANTA_MASSA.acima, pontos: anelUp },
    ]);
    expect(linhasMassaPlanta(p, 'lv_0', 1.2)?.map((l) => l.massaId)).toEqual(['up']);
    // No pavimento de cima as duas são do nível: as duas aparecem.
    expect(linhasMassaPlanta(p, 'lv_1', 4.2)?.map((l) => l.massaId).sort()).toEqual(['alto', 'up']);
  });
});

describe('sem kernel: reserva com o contorno da base', () => {
  it('não lança, não consulta o kernel e desenha só o contorno da base tracejado', () => {
    const p = projeto(m3());
    vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(false);
    const planta = vi.spyOn(servicoMassa(), 'planta');
    const out = massaOps(p, 'lv_0', undefined, LIGHT, false, defaultPaint('mass', 50), 1.2);
    expect(planta).not.toHaveBeenCalled();
    expect(out.strokes).toHaveLength(1);
    expect(out.strokes[0]).toMatchObject({ closed: true, dash: STAIR_DASH });
    expect(out.strokes[0]!.pts).toHaveLength(4);
  });

  it('o contorno da base é o perfil da primeira seção, com vértice em +x (polígono regular)', () => {
    const base = contornoDaBase(projeto(m3()).elements['m3'] as Mass);
    expect(base).toHaveLength(1);
    expect(base[0]![0]!.x).toBeCloseTo(R, 9);
    expect(base[0]![0]!.y).toBeCloseTo(0, 9);
  });
});

describe('clique e caixa na planta', () => {
  it('sem kernel, o clique dentro do contorno da base acha a massa; fora ou oculta não', () => {
    const p = projeto(m3());
    vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(false);
    expect(pickMassaAt(p, 'lv_0', { x: 0, y: 0 }, 0.02)).toBe('m3');
    expect(pickMassaAt(p, 'lv_0', { x: 50, y: 0 }, 0.02)).toBeNull();
    expect(pickMassaAt(p, 'lv_0', { x: 0, y: 0 }, 0.02, new Set<Id>(['m3']))).toBeNull();
  });

  it('com kernel, a região clicável é o anel cortado: um ponto entre o corte e a base não acha a massa', () => {
    const p = projeto(m3());
    kernelSimulado([{ massaId: 'm3', copia: 0, estilo: ESTILO_PLANTA_MASSA.cortado, pontos: anel([{ x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 }]) }]);
    expect(pickMassaAt(p, 'lv_0', { x: 0, y: 0 }, 0.02)).toBe('m3');
    expect(pickMassaAt(p, 'lv_0', { x: 4, y: 0 }, 0.02)).toBeNull();
  });

  it('caixa: a massa entra quando o anel cortado cabe inteiro; caixa pequena não pega', () => {
    const p = projeto(m3());
    vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(false);
    expect(massasNaCaixa(p, 'lv_0', { minX: -10, minY: -10, maxX: 10, maxY: 10 })).toEqual(['m3']);
    expect(massasNaCaixa(p, 'lv_0', { minX: -3, minY: -3, maxX: 3, maxY: 3 })).toEqual([]);
  });

  it('realce de seleção usa a cor de seleção do tema', () => {
    const p = projeto(m3());
    vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(false);
    const realce = massaSelectionOps(p, 'lv_0', ['m3'], LIGHT);
    expect(realce.length).toBeGreaterThan(0);
    expect(realce[0]).toMatchObject({ closed: true, color: LIGHT.select });
    expect(massaSelectionOps(p, 'lv_0', [], LIGHT)).toEqual([]);
  });
});

describe('pontos da massa em planta (extensão do modelo)', () => {
  it('perfil livre devolve os próprios pontos; círculo é amostrado no raio', () => {
    expect(pontosDoPerfil({ forma: 'livre', pontos: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }] })).toHaveLength(3);
    const c = pontosDoPerfil({ forma: 'circulo', raio: 3 });
    expect(Math.max(...c.map((q) => Math.hypot(q.x, q.y)))).toBeCloseTo(3, 9);
  });

  it('as seções de todas as cópias entram: uma torre de arranjo de 4 cópias cobre o raio girado', () => {
    const arranjo = { ...makeMass({ id: 'ar', levelId: 'lv_0', name: 'Arranjo', origem: { x: 10, y: 0 }, secoes: [{ z: 0, perfil: { forma: 'circulo', raio: 1 }, rotacao: 0, escala: 1, dx: 0, dy: 0 }, { z: 5, perfil: { forma: 'circulo', raio: 1 }, rotacao: 0, escala: 1, dx: 0, dy: 0 }], arranjo: { n: 4, cx: 0, cy: 0, anguloTotal: 2 * Math.PI } }), order: 0 };
    const pts = pontosDaMassaEmPlanta(arranjo);
    expect(Math.min(...pts.map((q) => q.x))).toBeCloseTo(-11, 1);
    expect(Math.max(...pts.map((q) => q.x))).toBeCloseTo(11, 1);
  });
});
