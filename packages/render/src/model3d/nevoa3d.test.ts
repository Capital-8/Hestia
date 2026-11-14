import { describe, expect, it } from 'vitest';
import { NEVOA, faixaDaNevoa, type CaixaNevoa, type PontoNevoa } from './nevoa3d.ts';

/** Caixa de `min` a `max` (m), no formato do `Box3`. */
const caixa = (min: PontoNevoa, max: PontoNevoa): CaixaNevoa => ({ min, max });

/** Fator de esmaecimento (0 = nítido, 1 = some) de um ponto a `d` m da câmera, pela regra linear do three. */
const fator = (d: number, f: { near: number; far: number }): number => Math.min(1, Math.max(0, (d - f.near) / (f.far - f.near)));

/** Os oito cantos da caixa, para medir a distância real da câmera a cada um. */
function cantos(c: CaixaNevoa): PontoNevoa[] {
  const out: PontoNevoa[] = [];
  for (const x of [c.min.x, c.max.x]) for (const y of [c.min.y, c.max.y]) for (const z of [c.min.z, c.max.z]) out.push({ x, y, z });
  return out;
}

const dist = (a: PontoNevoa, b: PontoNevoa): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Casa pequena: ~30 m por 20 m, 12 m de altura, câmera de partida a ~55 m. */
const casa = caixa({ x: -15, y: -10, z: 0 }, { x: 15, y: 10, z: 12 });
const cameraCasa: PontoNevoa = { x: 0, y: -55, z: 6 };

/** Obra grande: 240 m por 200 m, 40 m de altura; "Enquadrar tudo" põe a câmera a ~230 m do centro. */
const obra = caixa({ x: -120, y: -100, z: 0 }, { x: 120, y: 100, z: 40 });
const cameraObra: PontoNevoa = { x: 0, y: -230, z: 20 };

describe('faixaDaNevoa: cena pequena fica exatamente na faixa de partida', () => {
  it('casa com a câmera a ~55 m: névoa de 60 a 170 m, valores exatos', () => {
    const f = faixaDaNevoa(cameraCasa, casa);
    expect(f.near).toBe(60);
    expect(f.far).toBe(170);
  });

  it('a faixa de partida é a mesma constante usada pelo app', () => {
    expect(NEVOA).toEqual({ near: 60, far: 170 });
  });
});

describe('faixaDaNevoa: cena grande não esmaece com "Enquadrar tudo"', () => {
  it('obra a ~230 m: a faixa passa de 170 m (antes a névoa fixa apagava tudo)', () => {
    const f = faixaDaNevoa(cameraObra, obra);
    expect(f.far).toBeGreaterThan(NEVOA.far);
    expect(f.near).toBeLessThan(f.far);
  });

  it('nenhum canto da caixa cai no esmaecimento total (fator < 1 em todos os oito)', () => {
    const f = faixaDaNevoa(cameraObra, obra);
    for (const p of cantos(obra)) expect(fator(dist(cameraObra, p), f)).toBeLessThan(1);
  });

  it('o canto mais longe fica antes de "far": a distância à câmera é menor que o plano distante', () => {
    const f = faixaDaNevoa(cameraObra, obra);
    const maisLonge = Math.max(...cantos(obra).map((p) => dist(cameraObra, p)));
    expect(maisLonge).toBeLessThan(f.far);
  });

  it('o que está perto da câmera (alvo do enquadramento) fica nítido: abaixo de "near"', () => {
    const f = faixaDaNevoa(cameraObra, obra);
    expect(fator(230, f)).toBe(0);
  });

  it('a proporção near/far é a de partida (60/170) quando a faixa cresce', () => {
    const f = faixaDaNevoa(cameraObra, obra);
    expect(f.near / f.far).toBeCloseTo(NEVOA.near / NEVOA.far, 12);
  });
});

describe('faixaDaNevoa: a faixa cresce com a distância e nunca fica abaixo da de partida', () => {
  it('afastar a câmera da mesma obra nunca encolhe a faixa', () => {
    const dists = [10, 60, 120, 230, 400];
    const fars = dists.map((d) => faixaDaNevoa({ x: 0, y: -d, z: 20 }, obra).far);
    for (let i = 1; i < fars.length; i++) expect(fars[i]).toBeGreaterThanOrEqual(fars[i - 1]!);
    for (const far of fars) expect(far).toBeGreaterThanOrEqual(NEVOA.far);
  });

  it('near nunca fica abaixo de 60 m, mesmo com cena pequena e câmera perto', () => {
    const f = faixaDaNevoa({ x: 0, y: -2, z: 1 }, casa);
    expect(f.near).toBeGreaterThanOrEqual(NEVOA.near);
    expect(f.far).toBe(NEVOA.far);
  });
});

describe('faixaDaNevoa: entradas sem cena ou inválidas caem na faixa de partida', () => {
  it('sem caixa (null) ou com caixa vazia: 60 a 170 m', () => {
    expect(faixaDaNevoa(cameraObra, null)).toEqual({ near: 60, far: 170 });
    const vazia = caixa({ x: Infinity, y: Infinity, z: Infinity }, { x: -Infinity, y: -Infinity, z: -Infinity });
    expect(faixaDaNevoa(cameraObra, vazia)).toEqual({ near: 60, far: 170 });
  });

  it('câmera com coordenada NaN: devolve a faixa de partida, sem NaN', () => {
    const f = faixaDaNevoa({ x: Number.NaN, y: 0, z: 0 }, obra);
    expect(f).toEqual({ near: 60, far: 170 });
  });

  it('caixa de um único ponto longe da câmera: o plano distante passa da distância (sem fator 1)', () => {
    const ponto = caixa({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    const cam: PontoNevoa = { x: 0, y: -200, z: 0 };
    const f = faixaDaNevoa(cam, ponto);
    expect(f.far).toBeGreaterThan(200);
    expect(fator(200, f)).toBeLessThan(1);
  });
});
