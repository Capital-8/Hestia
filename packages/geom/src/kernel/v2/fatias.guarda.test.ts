import { describe, expect, it } from 'vitest';
import { fatiaEfetiva, kernelFatiaLigada, type AmbienteFatias } from './fatias.ts';

const amb = (busca: string | null): AmbienteFatias => ({ busca, ler: () => null });

/** Guarda F2.4 (E5): projeto com parede inclinada nunca vai ao Rust, mesmo com a fatia ligada. */
describe('guarda da parede inclinada', () => {
  it('fatia ligada + parede inclinada = desligada; sem parede inclinada = como a chave', () => {
    const ligada = kernelFatiaLigada('A', amb('?kernel=rust'));
    expect(ligada).toBe(true);
    expect(fatiaEfetiva(ligada, true)).toBe(false);
    expect(fatiaEfetiva(ligada, false)).toBe(true);
  });
  it('fatia desligada continua desligada com ou sem parede inclinada', () => {
    const desligada = kernelFatiaLigada('B', amb('?kernel=ts'));
    expect(fatiaEfetiva(desligada, false)).toBe(false);
    expect(fatiaEfetiva(desligada, true)).toBe(false);
  });
});
