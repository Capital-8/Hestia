import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import type { ClipBuffer } from '@hestia/tools';
import { caixaDaPrevia, guardarCamera, montarPrevia, montarPreviaProvisoria, restaurarCamera, type CameraOrbital, type MontadorDePrevia } from './pastePreview.ts';

/** Parede de 4 m no térreo, pronta para copiar. */
function parede(): Project['elements'][string] {
  return { ...makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, height: 3 }), order: 0 };
}

function buffer(): ClipBuffer {
  const w = parede();
  return { walls: w.kind === 'wall' ? [w] : [], openings: [], floors: [], slabs: [], roofs: [] };
}

function projeto(): Project {
  const store = new ProjectStore(createEmptyProject());
  const w = parede();
  if (w.kind === 'wall') store.exec({ type: 'addWall', wall: w });
  return store.project;
}

/** Órbita mínima mutável, no contrato de `CameraOrbital`. */
function orbita(): CameraOrbital & { aplicou: number } {
  const alvo = {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number): unknown {
      alvo.x = x;
      alvo.y = y;
      alvo.z = z;
      return alvo;
    },
  };
  return {
    azimuth: 0.4,
    elevation: 0.5,
    distance: 12,
    ortho: false,
    target: alvo,
    aplicou: 0,
    apply(): void {
      this.aplicou += 1;
    },
  };
}

describe('prévia do Colar alinhado', () => {
  it('a caixa cobre a origem e cada destino (mesmo X/Y, Z deslocado pelo nível)', () => {
    const p = projeto();
    const caixa = caixaDaPrevia(p, buffer(), ['lv_1']);
    expect(caixa).not.toBeNull();
    expect(caixa!.min.z).toBeCloseTo(0, 6);
    expect(caixa!.max.z).toBeCloseTo(6, 6);
    expect(caixa!.min.x).toBeLessThan(0);
    expect(caixa!.max.x).toBeGreaterThan(4);
  });

  it('guarda e restaura posição, alvo e zoom da câmera', () => {
    const c = orbita();
    const salva = guardarCamera(c);
    c.azimuth = 9;
    c.elevation = -1;
    c.distance = 99;
    c.ortho = true;
    c.target.set(10, 20, 30);

    expect(restaurarCamera(c, salva)).toBe(true);
    expect(c.azimuth).toBe(0.4);
    expect(c.elevation).toBe(0.5);
    expect(c.distance).toBe(12);
    expect(c.ortho).toBe(false);
    expect(c.target).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(c.aplicou).toBe(1);
  });

  it('delega ao montador definitivo com os níveis únicos e válidos', () => {
    const p = projeto();
    let recebido: { ids: string[]; link: boolean } | null = null;
    const montar: MontadorDePrevia = (_projeto, _clip, ids, o) => {
      recebido = { ids, link: o?.link ?? false };
      return _projeto;
    };
    const r = montarPrevia(p, buffer(), ['lv_1', 'lv_1', 'nao-existe'], true, montar);
    expect(r).toBe(p);
    expect(recebido).toEqual({ ids: ['lv_1'], link: true });
  });

  it('o montador provisório cola a parede no nível de destino sem tocar no original', () => {
    const p = projeto();
    const rascunho = montarPreviaProvisoria(p, buffer(), ['lv_1']);
    const paredes = Object.values(rascunho.elements).filter((e) => e.kind === 'wall');
    expect(paredes).toHaveLength(2);
    const copia = paredes.find((e) => e.id !== 'w1')!;
    expect(copia.levelId).toBe('lv_1');
    expect(copia.a).toEqual({ x: 0, y: 0 });
    expect(copia.b).toEqual({ x: 4, y: 0 });
    expect(paredes.filter((e) => e.id === 'w1')).toHaveLength(1);
    expect(Object.values(p.elements).filter((e) => e.kind === 'wall')).toHaveLength(1);
  });

  it('sem nível válido não há prévia', () => {
    expect(montarPrevia(projeto(), buffer(), ['nao-existe'], false)).toBeNull();
  });
});
