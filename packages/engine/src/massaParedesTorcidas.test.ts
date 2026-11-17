import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { createEmptyProject, makeLevel, makeMass, ProjectStore, secaoCirculo, type Project } from '@hestia/model';
import type { FatiaMassaProjeto } from './massaServico.ts';
import { derivarContornosParedesDaMassa } from './massaDerivaParedes.ts';
import { derivarParedesInclinadasDaMassa } from './massaParedesTorcidas.ts';

/**
 * Fonte simulada do kernel: fatia a massa `m1` em TODO nível do projeto dentro de [0, altura]. O contorno vem de `contorno(z)` (anel anti-horário).
 * Os valores esperados dos testes são calculados à mão (fórmulas nos comentários), não pelo código testado.
 */
const fonteDe = (altura: number, contorno: (z: number) => Vec2[]) => ({
  fatias: (p: Project): FatiaMassaProjeto[] =>
    p.levels
      .filter((l) => l.elevation >= -1e-9 && l.elevation <= altura + 1e-9)
      .map((l) => ({ massaId: 'm1', copia: 0, nivelId: l.id, area: 0, perimetro: 0, z: l.elevation, pontos: contorno(l.elevation) })),
});

/** Quadrado de apótema 4 (lado 8) girado `ang` rad em torno da origem, anti-horário. */
const quadrado = (ang: number): Vec2[] =>
  [0, 1, 2, 3].map((k) => ({ x: 4 * Math.SQRT2 * Math.cos(ang + Math.PI / 4 + (k * Math.PI) / 2), y: 4 * Math.SQRT2 * Math.sin(ang + Math.PI / 4 + (k * Math.PI) / 2) }));

/** Projeto com a massa m1 de 0 a 6 m (térreo + níveis em 3 e 6). */
function projeto(): { p: Project; terreo: string } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_a', name: 'A', elevation: 3 }) });
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_b', name: 'B', elevation: 6 }) });
  const terreo = s.project.levels.find((l) => l.elevation === 0)!.id;
  s.exec({ type: 'addMass', mass: makeMass({ id: 'm1', levelId: terreo, name: 'Torre', secoes: [secaoCirculo(0, 5), secaoCirculo(6, 5)] }) });
  return { p: s.project, terreo };
}

/** Id do nível na cota dada. */
const niv = (p: Project, z: number): string => p.levels.find((l) => l.elevation === z)!.id;

describe('paredes inclinadas da massa (frente massa-paredes-torcidas)', () => {
  it('extrusão reta: nenhum passo extra, tilt 0 e as mesmas cadeias de hoje', () => {
    const { p, terreo } = projeto();
    const f = fonteDe(6, () => quadrado(0));
    const hoje = derivarContornosParedesDaMassa(p, 'm1', [terreo, 'lv_a'], {}, f)!;
    const novo = derivarParedesInclinadasDaMassa(p, 'm1', [terreo, 'lv_a'], {}, f, f)!;
    expect(novo.porNivel).toHaveLength(2);
    expect(novo.nPassos).toBe(2);
    expect(novo.nParedes).toBe(8);
    expect(novo.nInclinadas).toBe(0);
    expect(novo.desvioMax).toBeCloseTo(0, 9);
    novo.porNivel.forEach((n, i) => {
      expect(n.passos).toHaveLength(1);
      expect(n.passos[0]!.cadeias[0]!.pontos).toEqual(hoje.porNivel[i]!.cadeias[0]);
      expect(n.passos[0]!.cadeias[0]!.tilts).toEqual([0, 0, 0, 0]);
      expect(n.passos[0]!.altura).toBe(3);
      expect(n.passos[0]!.baseOffset).toBe(0);
    });
    expect(novo.porNivel[0]!.passos[0]!.topoNivelId).toBe(niv(p, 3));
    expect(novo.porNivel[1]!.passos[0]!.topoNivelId).toBe(niv(p, 6));
  });

  it('torção de 9° por andar com 1 passo por nível: tilt de 0,95224° (atan(4(1/cos9° − 1)/3)) e desvio de ~0,633 m', () => {
    const { p, terreo } = projeto();
    // 18° em 6 m: 3° por metro, 9° por nível.
    const f = fonteDe(6, (z) => quadrado((z * 3 * Math.PI) / 180));
    const r = derivarParedesInclinadasDaMassa(p, 'm1', [terreo], { modo: 'porNivel' }, f, f)!;
    expect(r.nPassos).toBe(1);
    expect(r.nParedes).toBe(4);
    // Apótema 4, giro φ = 9°: o raio do meio da face bate na face de cima em 4/cosφ; d = 4(1/cos 9° − 1) = 0,04986 e tilt = atan(d/3).
    for (const t of r.porNivel[0]!.passos[0]!.cadeias[0]!.tilts) expect(t).toBeCloseTo(0.95224, 3);
    // Desvio (Hausdorff) no topo: quadrado de apótema 4,0499 sem girar contra o quadrado real girado 9°: o canto de um chega a ~0,633 m do outro.
    expect(r.desvioMax).toBeGreaterThan(0.6);
    expect(r.desvioMax).toBeLessThan(0.66);
  });

  it('por tolerância: parte os passos (potências de 2), o desvio cai e o limite de passos é avisado', () => {
    const { p, terreo } = projeto();
    const f = fonteDe(6, (z) => quadrado((z * 3 * Math.PI) / 180));
    const um = derivarParedesInclinadasDaMassa(p, 'm1', [terreo], { modo: 'porNivel' }, f, f)!;
    const tol = derivarParedesInclinadasDaMassa(p, 'm1', [terreo], { desvioMax: 0.1 }, f, f)!;
    expect(tol.nPassos).toBeGreaterThan(1);
    expect([2, 4, 8, 16]).toContain(tol.nPassos);
    expect(tol.desvioMax).toBeLessThan(um.desvioMax / 2);
    // Passos contíguos: somam a altura do nível, cada um com baseOffset = soma dos anteriores.
    let z = 0;
    for (const s of tol.porNivel[0]!.passos) {
      expect(s.baseOffset).toBeCloseTo(z, 9);
      z += s.altura;
    }
    expect(z).toBeCloseTo(3, 9);
    const justo = derivarParedesInclinadasDaMassa(p, 'm1', [terreo], { desvioMax: 0.0001, maxPassosPorNivel: 4 }, f, f)!;
    expect(justo.nPassos).toBe(4);
    expect(justo.avisos.limiteDePassos).toBe(4);
  });

  it('só o último passo do nível aponta o nível de topo', () => {
    const { p, terreo } = projeto();
    const f = fonteDe(6, (z) => quadrado((z * 3 * Math.PI) / 180));
    const r = derivarParedesInclinadasDaMassa(p, 'm1', [terreo], { desvioMax: 0.1 }, f, f)!;
    const ps = r.porNivel[0]!.passos;
    ps.slice(0, -1).forEach((s) => expect(s.topoNivelId).toBeNull());
    expect(ps[ps.length - 1]!.topoNivelId).toBe(niv(p, 3));
  });

  it('bulbo (círculo que cresce de raio 5 para 6 em 3 m): paredes inclinadas para fora (tilt > 0) e nada some', () => {
    const { p, terreo } = projeto();
    const circ = (r: number): Vec2[] => Array.from({ length: 64 }, (_, i) => ({ x: r * Math.cos((2 * Math.PI * i) / 64), y: r * Math.sin((2 * Math.PI * i) / 64) }));
    const f = fonteDe(6, (z) => circ(5 + z / 3));
    const r = derivarParedesInclinadasDaMassa(p, 'm1', [terreo], { modo: 'porNivel' }, f, f)!;
    // Raio cresce 1 m em 3 m: o ponto médio da aresta (apótema 5cos(π/64)...) sobe ~0,98 m para fora; tilt ≈ atan(1/3) = 18,43°.
    const ts = r.porNivel[0]!.passos[0]!.cadeias[0]!.tilts;
    expect(ts.length).toBeGreaterThanOrEqual(8);
    for (const t of ts) expect(t).toBeGreaterThan(17);
    for (const t of ts) expect(t).toBeLessThan(19.5);
  });

  it('cilindro de 64 lados (extrusão curva): nenhuma parede inclina, apesar da simplificação em cordas', () => {
    const { p, terreo } = projeto();
    const circ: Vec2[] = Array.from({ length: 64 }, (_, i) => ({ x: 5 * Math.cos((2 * Math.PI * i) / 64), y: 5 * Math.sin((2 * Math.PI * i) / 64) }));
    const f = fonteDe(6, () => circ);
    const r = derivarParedesInclinadasDaMassa(p, 'm1', [terreo], {}, f, f)!;
    expect(r.nInclinadas).toBe(0);
    expect(r.nPassos).toBe(1);
    expect(r.nParedes).toBeGreaterThan(8);
  });

  it('sem kernel (fonte nula) devolve null', () => {
    const { p, terreo } = projeto();
    const nula = { fatias: (): null => null };
    expect(derivarParedesInclinadasDaMassa(p, 'm1', [terreo], {}, nula, nula)).toBeNull();
  });
});
