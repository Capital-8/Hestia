import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Material } from '@hestia/model';
import { aplicarTexturaTriplanar, chaveDaTextura, injetarTriplanar, mapeamentoDaTextura, type MapasTextura3D, type TexturasProvedor3D } from './texturas3d.ts';

const tex = (): THREE.Texture => new THREE.Texture();
const textura = { imagemId: 'catalogo:A1', escalaMetros: 0.5, rotacao: 90, deslocamento: [0.25, 0] as [number, number], repetir: true };
const mat = (aparencia?: Material['aparencia']): Material => ({ id: 'm', name: 'M', color: '#808080', hatch: 'none', gloss: 0.2, opacity: 1, cost: 0, unit: 'm2', ...(aparencia ? { aparencia } : {}) });

describe('texturas 3D (triplanar, escala real)', () => {
  it('mapeamento: frequência = 1/escala, rotação em graus e deslocamento em ladrilhos', () => {
    const m = mapeamentoDaTextura(textura);
    expect(m.frequencia).toBeCloseTo(2, 10);
    expect(m.cos).toBeCloseTo(0, 10);
    expect(m.sen).toBeCloseTo(1, 10);
    expect(m.deslocamento[0]).toBeCloseTo(0.5, 10);
    expect(m.deslocamento[1]).toBe(0);
  });
  it('escala inválida cai em 1 m e rotação inválida em 0', () => {
    for (const e of [0, -2, NaN, Infinity]) expect(mapeamentoDaTextura({ ...textura, escalaMetros: e }).frequencia).toBe(1);
    expect(mapeamentoDaTextura({ ...textura, rotacao: NaN }).cos).toBe(1);
  });
  it('chave da textura só existe com provedor e mapas carregados', () => {
    const m = mat({ textura });
    const pronto: TexturasProvedor3D = { versao: 1, obter: () => ({ cor: tex(), normal: tex() }) };
    const carregando: TexturasProvedor3D = { versao: 0, obter: () => undefined };
    expect(chaveDaTextura(m, null)).toBe('');
    expect(chaveDaTextura(m, carregando)).toBe('');
    expect(chaveDaTextura(mat(), pronto)).toBe('');
    expect(chaveDaTextura(m, pronto)).toBe('tx:catalogo:A1:cn:0.5:90:0.25,0:1');
    expect(chaveDaTextura({ ...m, aparencia: { textura: { ...textura, escalaMetros: 2 } } }, pronto)).not.toBe(chaveDaTextura(m, pronto));
  });
  it('injeta no shader padrão do three: vértice, cor, rugosidade e normal; uniforms e defines só dos mapas existentes', () => {
    const base = THREE.ShaderLib.standard;
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader };
    const mapas: MapasTextura3D = { cor: tex(), rugosidade: tex() };
    const r = injetarTriplanar(shader, mapas, mapeamentoDaTextura(textura));
    expect(r).toEqual({ vertex: true, cor: true, rugosidade: true, normal: true });
    expect(shader.vertexShader).toContain('vTpPos = (modelMatrix * tpWorld).xyz;');
    expect(shader.fragmentShader).toContain('tpColor');
    expect(shader.fragmentShader.startsWith('#define USE_TP_COLOR\n#define USE_TP_ROUGH\n')).toBe(true);
    expect(shader.fragmentShader).not.toContain('#define USE_TP_NORMAL');
    expect(Object.keys(shader.uniforms).sort()).toEqual(['tpColor', 'tpMap', 'tpOff', 'tpRough']);
    expect((shader.uniforms.tpMap!.value as THREE.Vector4).x).toBeCloseTo(2, 10);
  });
  it('aplicarTexturaTriplanar deixa a cor branca (a imagem dá a cor) e troca a chave do programa', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#336699' });
    aplicarTexturaTriplanar(m, { cor: tex(), normal: tex() }, textura);
    expect(m.color.getHexString()).toBe('ffffff');
    expect(m.customProgramCacheKey()).toBe('tp:cn');
    const so = new THREE.MeshStandardMaterial({ color: '#336699' });
    aplicarTexturaTriplanar(so, { normal: tex() }, textura);
    expect(so.color.getHexString()).toBe('336699');
  });
});
