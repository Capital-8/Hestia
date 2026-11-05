/**
 * F2 ponta a ponta: o material de camada do modelo chega ao HSTR v2 (tipo, escala e as propriedades PBR), lido de volta com
 * DataView nos offsets do layout congelado (material de 52 bytes: 11 f32, tipo u32, escala f32).
 */
import { describe, expect, it } from 'vitest';
import { buildTemplate, view3dOf, type Project } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, type RenderSceneSnapshot } from '@hestia/render';
import { codificarCena } from './wasmClient.ts';

const TAMANHO_MATERIAL = 52;

/**
 * Este teste mede o layout v2 (sem texturas). O template tem presets, então o snapshot traz texturas pendentes, que
 * precisam de pixels (ver `carregarTexturasDoSnapshot`); aqui elas saem, e a cadeia de texturas tem teste próprio.
 */
const semTexturas = (cena: RenderSceneSnapshot): RenderSceneSnapshot => ({
  ...cena,
  texturas: undefined,
  materials: cena.materials.map(({ mapas: _mapas, ...material }) => material),
});

/** Exporta o template de alto padrão com os rebocos (acabamento e substrato externos, reboco interno) com rugosidade 0,37 (diferente do padrão do modelo: 0,85 e 0,90). */
function templateComRebocoPersonalizado(): Project {
  const base = buildTemplate('house-premium');
  const materials = { ...base.materials };
  for (const id of ['mat_ceramica', 'mat_argamassa', 'mat_reboco']) {
    materials[id] = { ...materials[id]!, roughness: 0.37 };
  }
  return { ...base, materials, view3d: { ...view3dOf(base), style: 'realistic', shadows: true, edges: true } };
}

describe('F2: material de camada no HSTR v2', () => {
  it('o primeiro material tipo 1 (reboco) sai com a rugosidade e a escala do modelo', () => {
    const p = templateComRebocoPersonalizado();
    const cena = new ModelScene();
    try {
      cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { dark: false, edges: true, shadows: true });
      const bytes = codificarCena(semTexturas(cena.exportarCenaDeRender({ aspect: 16 / 9 })));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('HSTR');
      expect(view.getUint32(4, true)).toBe(2);
      const nVertices = view.getUint32(8, true);
      const nIndices = view.getUint32(12, true);
      const nNormais = view.getUint32(16, true);
      const nMateriais = view.getUint32(20, true);
      const inicioMateriais = 32 + nVertices * 12 + nIndices * 4 + nNormais * 12;

      let primeiro = -1;
      for (let i = 0; i < nMateriais; i++) {
        if (view.getUint32(inicioMateriais + i * TAMANHO_MATERIAL + 44, true) === 1) {
          primeiro = i;
          break;
        }
      }
      expect(primeiro).toBeGreaterThanOrEqual(0);
      const m = inicioMateriais + primeiro * TAMANHO_MATERIAL;
      expect(view.getFloat32(m + 12, true)).toBeCloseTo(0.37, 6); // rugosidade do modelo
      expect(view.getFloat32(m + 48, true)).toBeCloseTo(2, 6); // escala de 2,0 m do reboco externo/interno
    } finally {
      cena.dispose();
    }
  });

  it('o vidro (tipo 6) sai com a transmissão e a opacidade do modelo', () => {
    const p = templateComRebocoPersonalizado();
    const cena = new ModelScene();
    try {
      cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { dark: false, edges: true, shadows: true });
      const bytes = codificarCena(semTexturas(cena.exportarCenaDeRender({ aspect: 16 / 9 })));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const nVertices = view.getUint32(8, true);
      const nIndices = view.getUint32(12, true);
      const nNormais = view.getUint32(16, true);
      const nMateriais = view.getUint32(20, true);
      const inicioMateriais = 32 + nVertices * 12 + nIndices * 4 + nNormais * 12;
      const vidros: number[] = [];
      for (let i = 0; i < nMateriais; i++) {
        if (view.getUint32(inicioMateriais + i * TAMANHO_MATERIAL + 44, true) === 6) vidros.push(inicioMateriais + i * TAMANHO_MATERIAL);
      }
      expect(vidros.length).toBeGreaterThan(0);
      for (const m of vidros) {
        expect(view.getFloat32(m + 24, true)).toBeCloseTo(0.85, 6); // transmissão do mat_vidro
        expect(view.getFloat32(m + 20, true)).toBeCloseTo(0.3, 6); // opacidade do mat_vidro
      }
    } finally {
      cena.dispose();
    }
  });
});
