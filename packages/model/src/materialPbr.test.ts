import { describe, expect, it } from 'vitest';
import { DEFAULT_MATERIALS } from './defaults.ts';
import {
  ProjectStore,
  buildTemplate,
  createEmptyProject,
  materialEmissive,
  materialIor,
  materialMapping,
  materialMetallic,
  materialRoughness,
  materialTexture,
  materialTransmission,
  migrateProject,
  validarMaterialPbr,
  type Material,
} from './index.ts';

/** Material como estava no arquivo antes das propriedades PBR (só os campos de sempre). */
const antigo = (over: Partial<Material> = {}): Material => ({
  id: 'mat_antigo',
  name: 'Antigo',
  color: '#abcdef',
  hatch: 'none',
  gloss: 0.3,
  opacity: 1,
  cost: 0,
  unit: 'm2',
  ...over,
});

describe('propriedades PBR: valores padrão', () => {
  it('material antigo, opaco: rugosidade = 1 - gloss, metalicidade 0, sem transmissão, IOR 1.5, sem emissão', () => {
    const m = antigo();
    expect(materialRoughness(m)).toBeCloseTo(0.7);
    expect(materialMetallic(m)).toBe(0);
    expect(materialTransmission(m)).toBe(0);
    expect(materialIor(m)).toBe(1.5);
    expect(materialEmissive(m)).toBeUndefined();
    expect(materialTexture(m)).toBeUndefined();
  });

  it('transmissão padrão = 1 - opacity quando opacity < 1 (vidro)', () => {
    const vidro = antigo({ opacity: 0.35, gloss: 0.9 });
    expect(materialTransmission(vidro)).toBeCloseTo(0.65);
  });

  it('mapeamento padrão: escala 1.0 m e rotação 0', () => {
    expect(materialMapping(antigo())).toEqual({ scale: 1, rotationDeg: 0 });
  });

  it('o campo explícito vence o padrão', () => {
    const m = antigo({ roughness: 0.2, metallic: 1, transmission: 0.9, ior: 2.4, mapping: { scale: 0.5, rotationDeg: 90 } });
    expect(materialRoughness(m)).toBe(0.2);
    expect(materialMetallic(m)).toBe(1);
    expect(materialTransmission(m)).toBe(0.9);
    expect(materialIor(m)).toBe(2.4);
    expect(materialMapping(m)).toEqual({ scale: 0.5, rotationDeg: 90 });
  });
});

describe('validarMaterialPbr', () => {
  it.each([
    ['roughness 1.5', { roughness: 1.5 }, 'Rugosidade'],
    ['metallic -0.1', { metallic: -0.1 }, 'Metalicidade'],
    ['transmission 2', { transmission: 2 }, 'Transmissão'],
    ['ior 0.5', { ior: 0.5 }, 'IOR'],
    ['ior 3.5', { ior: 3.5 }, 'IOR'],
    ['escala 0', { mapping: { scale: 0 } }, 'Escala'],
    ['escala negativa', { mapping: { scale: -2 } }, 'Escala'],
    ['intensidade negativa', { emissive: { color: '#ffffff', intensity: -1 } }, 'Intensidade'],
    ['cor de emissão inválida', { emissive: { color: 'branco', intensity: 1 } }, 'Cor de emissão'],
    ['cor do material vermelho', { color: 'vermelho' }, 'Cor do material'],
  ])('recusa %s', (_nome, over, trecho) => {
    const msg = validarMaterialPbr(antigo(over as Partial<Material>));
    expect(msg).not.toBeNull();
    expect(msg).toContain(trecho);
  });

  it('aceita material antigo e material com todas as propriedades válidas', () => {
    expect(validarMaterialPbr(antigo())).toBeNull();
    const completo = antigo({
      roughness: 0.4,
      metallic: 0,
      transmission: 0,
      ior: 1,
      emissive: { color: '#ff8800', intensity: 3 },
      texture: { preset: 'tijolo', albedo: 'tijolo/albedo.png' },
      mapping: { scale: 0.6, rotationDeg: 45 },
    });
    expect(validarMaterialPbr(completo)).toBeNull();
  });
});

describe('updateMaterialPbr', () => {
  it('aplica o patch e desfazer/refazer restauram o valor anterior', () => {
    const s = new ProjectStore(createEmptyProject());
    // mat_vidro é do catálogo: já vem com rugosidade 0,05 e IOR 1,52. O patch usa valores diferentes para o teste ser útil.
    s.exec({ type: 'updateMaterialPbr', id: 'mat_vidro', patch: { roughness: 0.2, ior: 1.6 } });
    expect(s.project.materials['mat_vidro']!.roughness).toBe(0.2);
    expect(s.project.materials['mat_vidro']!.ior).toBe(1.6);

    s.undo();
    expect(s.project.materials['mat_vidro']!.roughness).toBe(0.05);
    expect(s.project.materials['mat_vidro']!.ior).toBe(1.52);

    s.redo();
    expect(s.project.materials['mat_vidro']!.roughness).toBe(0.2);
    expect(s.project.materials['mat_vidro']!.ior).toBe(1.6);
  });

  it('patch com undefined remove o campo e volta ao padrão', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'updateMaterialPbr', id: 'mat_vidro', patch: { roughness: 0.2 } });
    s.exec({ type: 'updateMaterialPbr', id: 'mat_vidro', patch: { roughness: undefined } });
    const m = s.project.materials['mat_vidro']!;
    expect('roughness' in m).toBe(false);
    expect(materialRoughness(m)).toBeCloseTo(1 - m.gloss);
  });

  it('valor inválido é recusado e o material não muda', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'updateMaterialPbr', id: 'mat_vidro', patch: { roughness: 1.5 } })).toThrow('Rugosidade');
    expect(s.project.materials['mat_vidro']!.roughness).toBe(0.05);
    expect(s.canUndo).toBe(false);
  });

  it('material inexistente é recusado', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'updateMaterialPbr', id: 'mat_nao_existe', patch: { metallic: 1 } })).toThrow('Material não encontrado');
  });
});

describe('compatibilidade com projetos antigos', () => {
  it('projeto sem os campos PBR carrega: catálogo recebe o render padrão, material de usuário fica no padrão antigo', () => {
    const p = buildTemplate('house2');
    // Simula o arquivo antigo: nenhum material tem campo PBR e a marca de migração não existe.
    const semPbr = JSON.parse(JSON.stringify(p));
    for (const m of Object.values(semPbr.materials as Record<string, Record<string, unknown>>)) {
      for (const k of ['roughness', 'metallic', 'transmission', 'ior', 'emissive', 'texture', 'mapping']) delete m[k];
    }
    delete semPbr.settings.materialPbrPadrao;
    const carregado = migrateProject(semPbr);
    expect(Object.keys(carregado.materials)).toEqual(Object.keys(p.materials));
    const catalogo = new Map(DEFAULT_MATERIALS.map((m) => [m.id, m]));
    for (const m of Object.values(carregado.materials)) {
      expect(validarMaterialPbr(m)).toBeNull();
      const padrao = catalogo.get(m.id);
      if (padrao) {
        expect(materialRoughness(m)).toBe(materialRoughness(padrao));
        expect(materialIor(m)).toBe(materialIor(padrao));
      } else {
        expect(materialRoughness(m)).toBeCloseTo(1 - m.gloss);
        expect(materialIor(m)).toBe(1.5);
      }
    }
  });
});
