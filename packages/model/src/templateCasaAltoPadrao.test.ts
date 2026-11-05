import { describe, expect, it } from 'vitest';
import { buildTemplate, isRoof, isWall, materialRoughness, materialTransmission, validarMaterialPbr, type Project } from './index.ts';

const projeto = (): Project => buildTemplate('house-premium');

describe('casa de alto padrão: materiais físicos (T3)', () => {
  it('paredes externas: as camadas do lado externo (antes da estrutura) são reboco externo (preset reboco, escala 2,0 m, rugosidade 0,85)', () => {
    const p = projeto();
    const externas = Object.values(p.elements).filter(isWall).filter((w) => w.typeId === 'wt_ext19');
    expect(externas.length).toBeGreaterThan(0);
    const camadas = p.wallTypes['wt_ext19']!.layers;
    const fora = camadas.slice(0, camadas.findIndex((l) => l.function === 'structure'));
    expect(fora.map((l) => l.function)).toEqual(['finish1', 'substrate']);
    for (const l of fora) {
      const m = p.materials[l.materialId]!;
      expect(l.materialId).toBe('mat-reboco-externo');
      expect(m.texture?.preset).toBe('reboco');
      expect(m.mapping?.scale).toBe(2);
      expect(materialRoughness(m)).toBeCloseTo(0.85, 9);
    }
  });

  it('a estrutura da parede externa continua bloco 19 e a pintura interna continua tinta (não são reboco)', () => {
    const camadas = projeto().wallTypes['wt_ext19']!.layers;
    expect(camadas.find((l) => l.function === 'structure')!.materialId).toBe('mat_bloco19');
    expect(camadas.find((l) => l.function === 'finish2')!.materialId).toBe('mat_tinta');
  });

  it('paredes internas: o reboco das duas faces é o reboco interno (preset reboco, rugosidade 0,9, escala 2,0 m)', () => {
    const p = projeto();
    for (const tipo of ['wt_alv14', 'wt_alv9']) {
      const reboco = p.wallTypes[tipo]!.layers.filter((l) => l.function === 'substrate');
      expect(reboco).toHaveLength(2);
      for (const l of reboco) {
        const m = p.materials[l.materialId]!;
        expect(l.materialId).toBe('mat-reboco-interno');
        expect(m.texture?.preset).toBe('reboco');
        expect(m.mapping?.scale).toBe(2);
        expect(materialRoughness(m)).toBeCloseTo(0.9, 9);
      }
    }
  });

  it('vidro: transmissão 0,85, opacidade 0,3, rugosidade 0,05 e IOR 1,52; há pelo menos um material com transmissão > 0', () => {
    const p = projeto();
    const vidro = p.materials['mat_vidro']!;
    expect(vidro.transmission).toBe(0.85);
    expect(vidro.opacity).toBe(0.3);
    expect(materialRoughness(vidro)).toBeCloseTo(0.05, 9);
    expect(vidro.ior).toBe(1.52);
    expect(Object.values(p.materials).some((m) => materialTransmission(m) > 0)).toBe(true);
  });

  it('telhado: a telha cerâmica (camada de acabamento) tem preset telha, rugosidade 0,7 e escala 1,0 m', () => {
    const p = projeto();
    const telhado = Object.values(p.elements).find(isRoof);
    expect(telhado).toBeDefined();
    const acabamento = p.roofTypes[telhado!.typeId]!.layers.find((l) => l.function === 'finish1')!;
    const m = p.materials[acabamento.materialId]!;
    expect(m.texture?.preset).toBe('telha');
    expect(materialRoughness(m)).toBeCloseTo(0.7, 9);
    expect(m.mapping?.scale).toBe(1);
  });

  it('esquadrias, portas e piso: alumínio metálico, madeira nas portas e portão, piso cerâmico e laje de concreto', () => {
    const p = projeto();
    const caixilho = p.materials['mat_aluminio']!;
    expect(caixilho.metallic).toBe(1);
    expect(caixilho.texture?.preset).toBe('metal');
    expect(materialRoughness(caixilho)).toBeCloseTo(0.35, 9);
    for (const id of ['ot_pv120', 'ot_portao450']) {
      const m = p.materials[p.openingTypes[id]!.frameMaterialId]!;
      expect(m.texture?.preset).toBe('madeira');
      expect(materialRoughness(m)).toBeCloseTo(0.6, 9);
      expect(m.mapping?.scale).toBe(1);
    }
    const piso = p.materials[p.floorTypes['ft_ceram']!.layers.find((l) => l.function === 'finish1')!.materialId]!;
    expect(piso.texture?.preset).toBe('piso');
    expect(materialRoughness(piso)).toBeCloseTo(0.4, 9);
    expect(piso.mapping?.scale).toBe(0.6);
    const laje = p.materials[p.slabTypes['ls_mac15']!.layers.find((l) => l.function === 'structure')!.materialId]!;
    expect(laje.texture?.preset).toBe('concreto');
    expect(laje.mapping?.scale).toBe(2);
  });

  it('todos os materiais do projeto têm propriedades PBR válidas (validarMaterialPbr retorna null)', () => {
    for (const m of Object.values(projeto().materials)) expect(validarMaterialPbr(m)).toBeNull();
  });
});
