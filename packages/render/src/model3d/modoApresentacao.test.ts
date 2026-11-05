import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, view3dOf, type Project } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene } from './scene3d.ts';

/** Uma parede no projeto, montada na cena com o estilo pedido (sem WebGL: a cena só monta objetos three.js). */
function cenaCom(style: 'realistic' | 'wireframe'): { cena: ModelScene; dispose: () => void } {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 };
  const comEstilo: Project = { ...p, view3d: { ...view3dOf(p), style, shadows: true, edges: true } };
  const cena = new ModelScene();
  cena.update(comEstilo, p.levels.map((l) => resolveLevel(comEstilo, l.id)), { dark: false, edges: true, shadows: true });
  return { cena, dispose: () => cena.dispose() };
}

const visibilidades = (cena: ModelScene): boolean[] => cena.scene.children.map((o) => o.visible);

describe('modo apresentação da cena 3D', () => {
  it('esconde grade e datum dos níveis e volta exatamente ao estado anterior', () => {
    const { cena, dispose } = cenaCom('realistic');
    try {
      const antes = visibilidades(cena);
      cena.modoApresentacao(true);
      expect(cena.scene.children.find((o) => o.type === 'GridHelper')?.visible).toBe(false);
      expect(cena.scene.children.find((o) => o.userData.levels === true)?.visible).toBe(false);
      cena.modoApresentacao(false);
      expect(visibilidades(cena)).toEqual(antes);
    } finally {
      dispose();
    }
  });

  it('no estilo wireframe o chão segue escondido ao sair do modo (não reaparece)', () => {
    const { cena, dispose } = cenaCom('wireframe');
    try {
      const antes = visibilidades(cena);
      // Há um objeto escondido de origem (o chão do wireframe); sem isso o teste não prova nada.
      expect(antes.includes(false)).toBe(true);
      cena.modoApresentacao(true);
      cena.modoApresentacao(false);
      expect(visibilidades(cena)).toEqual(antes);
    } finally {
      dispose();
    }
  });

  it('ligar duas vezes e desligar uma vez já devolve o estado de antes de ligar', () => {
    const { cena, dispose } = cenaCom('realistic');
    try {
      const antes = visibilidades(cena);
      cena.modoApresentacao(true);
      cena.modoApresentacao(true);
      cena.modoApresentacao(false);
      expect(visibilidades(cena)).toEqual(antes);
    } finally {
      dispose();
    }
  });

  it('desligar sem ter ligado não mexe em nada', () => {
    const { cena, dispose } = cenaCom('realistic');
    try {
      const antes = visibilidades(cena);
      cena.modoApresentacao(false);
      expect(visibilidades(cena)).toEqual(antes);
    } finally {
      dispose();
    }
  });
});
