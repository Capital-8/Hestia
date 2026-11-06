import { describe, expect, it } from 'vitest';
import { DEFAULT_MATERIALS, createEmptyProject } from './defaults.ts';
import {
  materialIor,
  materialMapping,
  materialRoughness,
  materialTexture,
  materialTransmission,
  preencherPbrPadrao,
  temPbr,
  validarMaterialPbr,
} from './materialPbr.ts';
import { migrateProject } from './migrate.ts';
import { SCHEMA_VERSION, type Material } from './types.ts';

const CAMPOS_PBR = ['roughness', 'metallic', 'transmission', 'ior', 'emissive', 'texture', 'mapping'] as const;
const PRESETS = ['reboco', 'tijolo', 'madeira', 'telha', 'pedra', 'metal', 'concreto', 'piso', 'nenhum'];

type Cru = { schemaVersion: number; materials: Record<string, Record<string, unknown>>; settings: Record<string, unknown>; [k: string]: unknown };

/** Arquivo como era salvo antes do render PBR: materiais sem campos PBR e sem a marca de migração. */
function arquivoAntigo(): Cru {
  const raw = JSON.parse(JSON.stringify(createEmptyProject('Antigo'))) as Cru;
  for (const m of Object.values(raw.materials)) for (const c of CAMPOS_PBR) delete m[c];
  delete raw.settings.materialPbrPadrao;
  raw.schemaVersion = SCHEMA_VERSION;
  return raw;
}

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('catálogo padrão: render físico (PBR)', () => {
  it('todo material do catálogo tem todos os campos PBR definidos e válidos', () => {
    for (const m of DEFAULT_MATERIALS) {
      expect(validarMaterialPbr(m), m.id).toBeNull();
      expect(m.roughness, m.id).toBeGreaterThanOrEqual(0);
      expect(m.roughness, m.id).toBeLessThanOrEqual(1);
      expect([0, 1], m.id).toContain(m.metallic);
      expect(m.transmission, m.id).toBeDefined();
      expect(m.ior, m.id).toBeDefined();
      expect(m.emissive, m.id).toBeUndefined();
      expect(PRESETS, m.id).toContain(m.texture?.preset);
      expect(m.mapping?.scale, m.id).toBeGreaterThan(0);
      // Só o vidro é transparente.
      expect(m.transmission === 0 || m.id === 'mat_vidro', m.id).toBe(true);
    }
  });

  it('valores de referência: reboco fosco 2 m, tijolo 0,5 m, metal metálico, vidro transparente', () => {
    const por = (id: string): Material => DEFAULT_MATERIALS.find((m) => m.id === id)!;
    expect(por('mat_reboco')).toMatchObject({ roughness: 0.9, metallic: 0, texture: { preset: 'reboco' }, mapping: { scale: 2 } });
    expect(por('mat_bloco14')).toMatchObject({ roughness: 0.8, texture: { preset: 'tijolo' }, mapping: { scale: 0.5 } });
    expect(por('mat_aluminio')).toMatchObject({ roughness: 0.35, metallic: 1, texture: { preset: 'metal' } });
    expect(por('mat_madeira')).toMatchObject({ roughness: 0.6, texture: { preset: 'madeira' }, mapping: { scale: 1 } });
    expect(por('mat_vidro')).toMatchObject({ roughness: 0.05, transmission: 0.85, ior: 1.52, texture: { preset: 'nenhum' } });
    expect(por('mat_concreto')).toMatchObject({ roughness: 0.85, texture: { preset: 'concreto' }, mapping: { scale: 2 } });
  });

  it('projeto novo já nasce com o render do catálogo e com a marca de migração', () => {
    const p = createEmptyProject();
    expect(p.settings.materialPbrPadrao).toBe(true);
    for (const m of Object.values(p.materials)) expect(temPbr(m), m.id).toBe(true);
  });
});

describe('migração de projeto antigo: render padrão', () => {
  it('materiais padrão recebem o render; materiais de usuário não', () => {
    const raw = arquivoAntigo();
    raw.materials['mat_usuario'] = { id: 'mat_usuario', name: 'Madeira de demolição', color: '#6b4a2b', hatch: 'diagonal', gloss: 0.2, opacity: 1, cost: 0, unit: 'm2' };
    const m = migrateProject(raw);
    expect(m.materials['mat_reboco']!.roughness).toBe(0.9);
    expect(materialTexture(m.materials['mat_reboco']!)).toEqual({ preset: 'reboco' });
    expect(materialMapping(m.materials['mat_reboco']!).scale).toBe(2);
    expect(temPbr(m.materials['mat_usuario']!)).toBe(false);
    expect(materialRoughness(m.materials['mat_usuario']!)).toBeCloseTo(0.8);
    expect(materialTransmission(m.materials['mat_usuario']!)).toBe(0);
    expect(materialIor(m.materials['mat_usuario']!)).toBe(1.5);
  });

  it('material de catálogo com cor editada recebe o render e mantém a cor, a hachura e o gloss do usuário', () => {
    const raw = arquivoAntigo();
    raw.materials['mat_ceramica']!.color = '#ff0000';
    const m = migrateProject(raw).materials['mat_ceramica']!;
    expect(m.color).toBe('#ff0000');
    expect(m.hatch).toBe('none');
    expect(m.gloss).toBe(0.6);
    expect(m.roughness).toBe(0.35);
    expect(materialTexture(m)).toEqual({ preset: 'piso' });
  });

  it('material padrão que já tem campo PBR não é sobrescrito; os que não têm são preenchidos', () => {
    const raw = arquivoAntigo();
    raw.materials['mat_reboco']!.roughness = 0.3;
    const m = migrateProject(raw);
    expect(m.materials['mat_reboco']!.roughness).toBe(0.3);
    expect(m.materials['mat_reboco']!.metallic).toBeUndefined();
    expect(m.materials['mat_reboco']!.texture).toBeUndefined();
    expect(m.materials['mat_tinta']!.roughness).toBe(0.5);
  });

  it('a marca impede que a migração preencha de novo um material que o usuário limpou ("volta ao padrão")', () => {
    const primeira = migrateProject(arquivoAntigo());
    expect(primeira.settings.materialPbrPadrao).toBe(true);
    const limpo = copia(primeira);
    const reboco = limpo.materials['mat_reboco'] as unknown as Record<string, unknown>;
    for (const c of CAMPOS_PBR) delete reboco[c];
    const reaberto = migrateProject(copia(limpo));
    expect(temPbr(reaberto.materials['mat_reboco']!)).toBe(false);
  });

  it('a migração é idempotente', () => {
    const a = migrateProject(arquivoAntigo());
    const b = migrateProject(copia(a));
    expect(b.materials).toEqual(a.materials);
    expect(b.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('planta não muda: cor, hachura, gloss, opacidade, custo e unidade do catálogo ficam como estavam', () => {
    const m = migrateProject(arquivoAntigo()).materials;
    for (const padrao of DEFAULT_MATERIALS) {
      const atual = m[padrao.id]!;
      expect({ id: atual.id, color: atual.color, hatch: atual.hatch, gloss: atual.gloss, opacity: atual.opacity, cost: atual.cost, unit: atual.unit }).toEqual({
        id: padrao.id,
        color: padrao.color,
        hatch: padrao.hatch,
        gloss: padrao.gloss,
        opacity: padrao.opacity,
        cost: padrao.cost,
        unit: padrao.unit,
      });
    }
  });
});

describe('preencherPbrPadrao', () => {
  it('é pura: não altera o registro de entrada nem o catálogo, e não compartilha objetos com ele', () => {
    const entrada: Record<string, Material> = { mat_reboco: { ...DEFAULT_MATERIALS[1]!, roughness: undefined, texture: undefined, mapping: undefined, metallic: undefined, transmission: undefined, ior: undefined } };
    const antes = copia(entrada);
    const out = preencherPbrPadrao(entrada, DEFAULT_MATERIALS);
    expect(entrada).toEqual(antes);
    expect(out.mat_reboco!.roughness).toBe(0.9);
    expect(out.mat_reboco!.texture).not.toBe(DEFAULT_MATERIALS[1]!.texture);
    expect(DEFAULT_MATERIALS[1]!.roughness).toBe(0.9);
  });
});
