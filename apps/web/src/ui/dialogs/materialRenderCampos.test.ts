import { describe, expect, it } from 'vitest';
import type { Material } from '@hestia/model';
import { campoDefinido, patchDoCampo, valorEfetivo } from './materialRenderCampos.ts';

const antigo: Material = { id: 'mat_antigo', name: 'Reboco antigo', color: '#b9a98f', hatch: 'none', gloss: 0.3, opacity: 1, cost: 0, unit: 'm2' };

describe('valorEfetivo', () => {
  it('material antigo sem campos PBR usa os padrões', () => {
    expect(valorEfetivo(antigo)).toEqual({
      textura: 'nenhum',
      escala: 1,
      rugosidade: 0.7,
      metalicidade: 0,
      transmissao: 0,
      ior: 1.5,
      emissao: { color: '#ffffff', intensity: 0 },
    });
  });

  it('transmissão padrão acompanha a opacidade do vidro', () => {
    expect(valorEfetivo({ ...antigo, opacity: 0.15 }).transmissao).toBeCloseTo(0.85);
  });

  it('campo definido prevalece sobre o padrão', () => {
    const m: Material = { ...antigo, roughness: 0.2, texture: { preset: 'tijolo' }, mapping: { scale: 2.5, rotationDeg: 30 } };
    const v = valorEfetivo(m);
    expect(v.rugosidade).toBe(0.2);
    expect(v.textura).toBe('tijolo');
    expect(v.escala).toBe(2.5);
  });
});

describe('patchDoCampo', () => {
  it("preset 'nenhum' gera patch que remove a textura", () => {
    const m: Material = { ...antigo, texture: { preset: 'reboco' } };
    expect(patchDoCampo(m, 'textura', 'nenhum')).toEqual({ ok: true, patch: { texture: undefined } });
  });

  it('preset ausente também remove a textura', () => {
    const m: Material = { ...antigo, texture: { preset: 'reboco' } };
    expect(patchDoCampo(m, 'textura', undefined)).toEqual({ ok: true, patch: { texture: undefined } });
  });

  it('trocar o preset mantém os mapas de arquivo', () => {
    const m: Material = { ...antigo, texture: { preset: 'reboco', albedo: 'texturas/reboco.png' } };
    expect(patchDoCampo(m, 'textura', 'piso')).toEqual({ ok: true, patch: { texture: { preset: 'piso', albedo: 'texturas/reboco.png' } } });
  });

  it('preset desconhecido é recusado', () => {
    expect(patchDoCampo(antigo, 'textura', 'areia' as never).ok).toBe(false);
  });

  it('escala 0 é recusada', () => {
    const r = patchDoCampo(antigo, 'escala', 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('pelo menos 0,1 m');
  });

  it('escala abaixo do mínimo de 0,1 é recusada', () => {
    expect(patchDoCampo(antigo, 'escala', 0.05).ok).toBe(false);
  });

  it('escala válida envia só o mapeamento e preserva a rotação', () => {
    const m: Material = { ...antigo, mapping: { scale: 1, rotationDeg: 30 } };
    expect(patchDoCampo(m, 'escala', 2)).toEqual({ ok: true, patch: { mapping: { scale: 2, rotationDeg: 30 } } });
  });

  it('rugosidade fora de 0..1 é recusada com a mensagem do modelo', () => {
    expect(patchDoCampo(antigo, 'rugosidade', 1.5)).toEqual({ ok: false, erro: 'Rugosidade deve estar entre 0 e 1.' });
    expect(patchDoCampo(antigo, 'rugosidade', -0.1).ok).toBe(false);
  });

  it('rugosidade válida envia só o campo rugosidade', () => {
    expect(patchDoCampo(antigo, 'rugosidade', 0.4)).toEqual({ ok: true, patch: { roughness: 0.4 } });
  });

  it('IOR fora de 1..3 é recusado', () => {
    expect(patchDoCampo(antigo, 'ior', 3.5).ok).toBe(false);
    expect(patchDoCampo(antigo, 'ior', 0.9).ok).toBe(false);
  });

  it('emissão preserva a cor ao mudar a intensidade e recusa intensidade negativa', () => {
    const m: Material = { ...antigo, emissive: { color: '#ffcc00', intensity: 1 } };
    expect(patchDoCampo(m, 'emissao', { intensity: 3 })).toEqual({ ok: true, patch: { emissive: { color: '#ffcc00', intensity: 3 } } });
    expect(patchDoCampo(m, 'emissao', { intensity: -1 }).ok).toBe(false);
  });

  it('undefined em um deslizante volta ao padrão (remove o campo)', () => {
    expect(patchDoCampo(antigo, 'metalicidade', undefined)).toEqual({ ok: true, patch: { metallic: undefined } });
  });
});

describe('campoDefinido', () => {
  it('é falso para material antigo e verdadeiro depois de definir', () => {
    expect(campoDefinido(antigo, 'rugosidade')).toBe(false);
    expect(campoDefinido({ ...antigo, roughness: 0.5 }, 'rugosidade')).toBe(true);
  });
});
