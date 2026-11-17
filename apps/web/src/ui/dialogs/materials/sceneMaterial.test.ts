import { describe, expect, it } from 'vitest';
import type { Material } from '@hestia/model';
import { gerarLadrilhos, gradeLadrilhos, parametrosMaterial } from './sceneMaterial.ts';

const base = { color: '#aa5533', opacity: 1, gloss: 0.4, hatch: 'solid' } as unknown as Material;

describe('gerarLadrilhos', () => {
  it('gera colunas x linhas centradas e determinísticas', () => {
    const a = gerarLadrilhos(5, 3, 1);
    expect(a).toHaveLength(15);
    expect(a[7]).toMatchObject({ u: 0, v: 0 });
    expect(gerarLadrilhos(5, 3, 1)).toEqual(a);
  });
  it('vizinhos diretos não repetem o tom e os três tons aparecem', () => {
    const l = gerarLadrilhos(9, 5, 1);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 8; i++) expect(l[j * 9 + i]!.tom).not.toBe(l[j * 9 + i + 1]!.tom);
    expect(new Set(l.map((t) => t.tom)).size).toBe(3);
  });
  it('modo low usa menos ladrilhos', () => {
    const lo = gradeLadrilhos(true);
    const hi = gradeLadrilhos(false);
    expect(lo.colunas * lo.linhas).toBeLessThan(hi.colunas * hi.linhas);
  });
});

describe('parametrosMaterial', () => {
  it('usa a aparência efetiva (reserva: color/opacity/gloss)', () => {
    const p = parametrosMaterial(base);
    expect(p.color).toBe('#aa5533');
    expect(p.roughness).toBeCloseTo(0.7);
    expect(p.metalness).toBe(0);
    expect(p.transparent).toBe(false);
  });
  it('aparência explícita ganha; opacidade < 1 liga transparência', () => {
    const p = parametrosMaterial({ ...base, aparencia: { cor: '#112233', rugosidade: 0.1, metal: 1, opacidade: 0.5 } });
    expect(p).toMatchObject({ color: '#112233', roughness: 0.1, metalness: 1, opacity: 0.5, transparent: true, depthWrite: false, clearcoat: 0 });
  });
});
