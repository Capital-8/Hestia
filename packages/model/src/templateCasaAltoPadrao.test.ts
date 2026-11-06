import { describe, expect, it } from 'vitest';
import {
  buildTemplate,
  DEFAULT_FLOOR_TYPES,
  DEFAULT_MATERIALS,
  DEFAULT_WALL_TYPES,
  isRoof,
  isWall,
  materialRoughness,
  materialTransmission,
  validarMaterialPbr,
  type Project,
} from './index.ts';

const projeto = (): Project => buildTemplate('house-premium');

/** Material original do padrão (cor, hachura): a planta sai igual se a camada usar o mesmo id e a mesma aparência. */
const original = (id: string) => DEFAULT_MATERIALS.find((m) => m.id === id)!;

describe('casa de alto padrão: materiais físicos (T3)', () => {
  it('a planta: as camadas das paredes do template são as do padrão (mesmo material, espessura e função)', () => {
    const p = projeto();
    for (const id of ['wt_ext19', 'wt_alv14', 'wt_alv9']) {
      expect(p.wallTypes[id]!.layers).toEqual(DEFAULT_WALL_TYPES.find((t) => t.id === id)!.layers);
    }
    expect(p.materials['mat-reboco-externo']).toBeUndefined();
    expect(p.materials['mat-reboco-interno']).toBeUndefined();
  });

  it('paredes externas: o acabamento externo (mat_ceramica) e o substrato (mat_argamassa) são originais, com preset reboco, escala 2,0 m e rugosidade 0,85', () => {
    const p = projeto();
    const externas = Object.values(p.elements).filter(isWall).filter((w) => w.typeId === 'wt_ext19');
    expect(externas.length).toBeGreaterThan(0);
    const camadas = p.wallTypes['wt_ext19']!.layers;
    const fora = camadas.slice(0, camadas.findIndex((l) => l.function === 'structure'));
    expect(fora.map((l) => [l.function, l.materialId])).toEqual([
      ['finish1', 'mat_ceramica'],
      ['substrate', 'mat_argamassa'],
    ]);
    for (const l of fora) {
      const m = p.materials[l.materialId]!;
      expect(m.color).toBe(original(l.materialId).color);
      expect(m.hatch).toBe(original(l.materialId).hatch);
      expect(m.texture?.preset).toBe('reboco');
      // Escala do reboco: 4 m (antes 2 m; ver defaults.ts).
      expect(m.mapping?.scale).toBe(4);
      expect(materialRoughness(m)).toBeCloseTo(0.85, 9);
    }
  });

  it('a estrutura da parede externa continua bloco 19 e a pintura interna continua tinta (não são reboco)', () => {
    const camadas = projeto().wallTypes['wt_ext19']!.layers;
    expect(camadas.find((l) => l.function === 'structure')!.materialId).toBe('mat_bloco19');
    expect(camadas.find((l) => l.function === 'finish2')!.materialId).toBe('mat_tinta');
  });

  it('a camada interna do reboco de wt_ext19 é mat_reboco original (preset reboco, rugosidade 0,9)', () => {
    const camadas = projeto().wallTypes['wt_ext19']!.layers;
    const interna = camadas[3]!;
    expect(interna.materialId).toBe('mat_reboco');
    expect(projeto().materials['mat_reboco']!.texture?.preset).toBe('reboco');
    expect(materialRoughness(projeto().materials['mat_reboco']!)).toBeCloseTo(0.9, 9);
  });

  it('paredes internas: o reboco das duas faces é mat_reboco original (preset reboco, rugosidade 0,9, escala 2,0 m)', () => {
    const p = projeto();
    for (const tipo of ['wt_alv14', 'wt_alv9']) {
      const reboco = p.wallTypes[tipo]!.layers.filter((l) => l.function === 'substrate');
      expect(reboco).toHaveLength(2);
      for (const l of reboco) {
        const m = p.materials[l.materialId]!;
        expect(l.materialId).toBe('mat_reboco');
        expect(m.color).toBe(original('mat_reboco').color);
        expect(m.hatch).toBe(original('mat_reboco').hatch);
        expect(m.texture?.preset).toBe('reboco');
        // Escala do reboco: 4 m (antes 2 m; ver defaults.ts).
        expect(m.mapping?.scale).toBe(4);
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

  it('telhado: a telha cerâmica (camada de acabamento) tem preset telha, rugosidade 0,7 e escala 6,4 m', () => {
    const p = projeto();
    const telhado = Object.values(p.elements).find(isRoof);
    expect(telhado).toBeDefined();
    const acabamento = p.roofTypes[telhado!.typeId]!.layers.find((l) => l.function === 'finish1')!;
    const m = p.materials[acabamento.materialId]!;
    expect(m.texture?.preset).toBe('telha');
    expect(materialRoughness(m)).toBeCloseTo(0.7, 9);
    // Escala 6,4 m: uma telha de 0,40 m ocupa 64 px da imagem de 1024 px (16 por imagem); antes 1 m (telha 5x menor que a real).
    expect(m.mapping?.scale).toBe(6.4);
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
      // Escala da madeira: 1,4 m (9,3 tábuas por imagem x 0,15 m); antes 1 m.
      expect(m.mapping?.scale).toBe(1.4);
    }
    const acabamentoPiso = p.floorTypes['ft_ceram']!.layers.find((l) => l.function === 'finish1')!;
    // Piso próprio (mat_ceramica é o reboco externo): mesma cor e hachura do original, sem preset reboco.
    expect(acabamentoPiso.materialId).toBe('mat-piso-ceramico');
    expect(p.floorTypes['ft_ceram']!.layers.filter((l) => l.function !== 'finish1')).toEqual(DEFAULT_FLOOR_TYPES.find((t) => t.id === 'ft_ceram')!.layers.filter((l) => l.function !== 'finish1'));
    const piso = p.materials[acabamentoPiso.materialId]!;
    expect(piso.color).toBe(original('mat_ceramica').color);
    expect(piso.hatch).toBe(original('mat_ceramica').hatch);
    expect(piso.texture?.preset).toBe('piso');
    expect(materialRoughness(piso)).toBeCloseTo(0.4, 9);
    // Escala do piso: 1,5 m (2,5 placas de 0,60 m por imagem); antes 0,6 m.
    expect(piso.mapping?.scale).toBe(1.5);
    const laje = p.materials[p.slabTypes['ls_mac15']!.layers.find((l) => l.function === 'structure')!.materialId]!;
    expect(laje.texture?.preset).toBe('concreto');
    expect(laje.mapping?.scale).toBe(2);
  });

  it('todos os materiais do projeto têm propriedades PBR válidas (validarMaterialPbr retorna null)', () => {
    for (const m of Object.values(projeto().materials)) expect(validarMaterialPbr(m)).toBeNull();
  });
});
