import { describe, expect, it } from 'vitest';
import { CURTAIN_PRESET_ID, createEmptyProject, curtainPresetType, curtainTypeIssue, curtainWallTypes, isCurtainType, wallThicknessOf, wallTypes, type Project } from './index.ts';
import { LANGS } from './i18n.ts';

/** Projeto de partida com os montantes e painéis de fábrica (o que `curtainTypeIssue` consulta). */
const projeto = (): Project => createEmptyProject();

describe('predefinições de parede cortina (decisão 0056, §4.5)', () => {
  it('os três presets são tipos cortina válidos no projeto de fábrica', () => {
    const p = projeto();
    for (const tipo of curtainWallTypes('pt')) {
      expect(isCurtainType(tipo)).toBe(true);
      expect(curtainTypeIssue(tipo, p, 'pt')).toBeNull();
    }
  });

  it('a espessura de cada preset é a profundidade do sistema, nunca a camada-sombra por acidente', () => {
    for (const tipo of curtainWallTypes('pt')) {
      expect(wallThicknessOf(tipo)).toBe(tipo.curtain!.depth);
      expect(tipo.layers).toHaveLength(1);
      expect(tipo.layers[0]!.thickness).toBe(tipo.curtain!.depth);
    }
  });

  it('vidraça de fachada: profundidade 0,10, grade máxima 1,20 m e posições manuais 2 e 10 m', () => {
    const v = curtainPresetType(CURTAIN_PRESET_ID.vitrine, 'pt')!;
    expect(v.curtain!.depth).toBe(0.1);
    expect(v.curtain!.u).toEqual({ mode: 'maxDistance', distance: 1.2 });
    expect(v.curtain!.v).toEqual({ mode: 'manual', positions: [2, 10], anchor: 'start' });
    expect(v.curtain!.mullions.joinPriority).toBe('vertical');
    expect(v.curtain!.defaultPanelTypeId).toBe('pnl_vidro_10');
  });

  it('o preset fica registrado em wallTypes(), junto dos tipos de parede padrão', () => {
    const ids = wallTypes('pt').map((w) => w.id);
    expect(ids).toContain(CURTAIN_PRESET_ID.vitrine);
    expect(ids).toContain(CURTAIN_PRESET_ID.fachada);
    expect(ids).toContain(CURTAIN_PRESET_ID.vidroColado);
    expect(wallTypes('pt').find((w) => w.id === CURTAIN_PRESET_ID.fachada)?.family).toBe('curtain');
  });

  it('os nomes dos presets mudam com o idioma e os ids não', () => {
    const pt = curtainPresetType(CURTAIN_PRESET_ID.vitrine, 'pt')!;
    const en = curtainPresetType(CURTAIN_PRESET_ID.vitrine, 'en')!;
    expect(pt.id).toBe(en.id);
    expect(pt.name).not.toBe(en.name);
    for (const lang of LANGS) {
      const tipo = curtainPresetType(CURTAIN_PRESET_ID.fachada, lang)!;
      expect(tipo.name.length).toBeGreaterThan(0);
      expect(tipo.description.length).toBeGreaterThan(0);
    }
  });

  it('curtainPresetType devolve null para id que não é predefinição', () => {
    expect(curtainPresetType('wt_alv14', 'pt')).toBeNull();
  });
});
