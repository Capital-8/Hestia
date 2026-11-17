import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { resolveLevel, type MalhaTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeTerrain } from '@hestia/model';
import { ModelScene } from './scene3d.ts';
import type { FonteTerreno } from './terreno3d.ts';

/** Terreno de 120 x 80 m (como o do levantamento do E2E): o enquadramento fica a centenas de metros da câmera. */
const malhaGrande = (): MalhaTerreno[] => [
  { terrenoId: 'tn1', partes: [{ regiaoId: null, papel: 'superficie', positions: [0, 0, 5, 120, 0, 5, 120, 80, 5, 0, 80, 5], indices: [0, 1, 2, 0, 2, 3] }] },
];
const fonte: FonteTerreno = { pronto: () => true, malha: () => malhaGrande() };

function cenaCom(terreno: boolean): ModelScene {
  const s = new ProjectStore(createEmptyProject());
  if (terreno) s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn1', levelId: 'lv_0' }) });
  const p = s.project;
  const ms = new ModelScene({ instanciar: false });
  ms.fonteTerreno = fonte;
  ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false });
  ms.fit();
  return ms;
}

describe('neblina do 3D com terreno grande', () => {
  it('o enquadramento de um terreno de 100 m não fica além da neblina (a cena sumia no fundo)', () => {
    const ms = cenaCom(true);
    // A faixa da névoa é refeita a cada quadro pela câmera e pela caixa da cena (`antesDeDesenhar`); aqui aplica-se o passo do quadro à mão.
    (ms as unknown as { atualizarNevoa(): void }).atualizarNevoa();
    const neblina = ms.scene.fog as THREE.Fog;
    expect(ms.orbit.distance).toBeGreaterThan(170);
    expect(neblina.far).toBeGreaterThan(ms.orbit.distance * 1.5);
    // A névoa da main (`faixaDaNevoa`) mantém a proporção 60/170: o começo do esmaecimento fica antes do alvo, mas o fim passa de toda a cena.
    expect(neblina.near).toBeGreaterThan(60);
    expect(neblina.near).toBeLessThan(neblina.far);
  });

  it('sem terreno a neblina continua em 60 a 170 m', () => {
    const neblina = cenaCom(false).scene.fog as THREE.Fog;
    expect([neblina.near, neblina.far]).toEqual([60, 170]);
  });
});
