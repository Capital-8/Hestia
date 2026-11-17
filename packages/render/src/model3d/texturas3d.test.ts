import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Material } from '@hestia/model';
import { aplicarTexturaTriplanar, chaveDaTextura, injetarTriplanar, mapeamentoDaTextura, removerTexturaTriplanar, type MapasTextura3D, type TexturasProvedor3D } from './texturas3d.ts';

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
    expect(m.customProgramCacheKey()).toBe('tp:cn:0');
    const so = new THREE.MeshStandardMaterial({ color: '#336699' });
    aplicarTexturaTriplanar(so, { normal: tex() }, textura);
    expect(so.color.getHexString()).toBe('336699');
  });

  const rodarCompilacao = (m: THREE.Material): Record<string, { value: unknown }> => {
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(shader as never, undefined as never);
    return shader.uniforms;
  };

  it('com os mesmos mapas, só os uniforms mudam: a chave do programa não muda (sem recompilar)', () => {
    const m = new THREE.MeshStandardMaterial();
    const mapas = { cor: tex(), rugosidade: tex() };
    aplicarTexturaTriplanar(m, mapas, textura);
    const chave = m.customProgramCacheKey();
    const uniformes = rodarCompilacao(m);
    aplicarTexturaTriplanar(m, mapas, { ...textura, escalaMetros: 2 });
    expect(m.customProgramCacheKey()).toBe(chave);
    expect((uniformes.tpMap!.value as THREE.Vector4).x).toBeCloseTo(0.5, 10);
  });

  it('textura -> sem textura -> textura de novo: a chave muda a cada troca (o three só refaz os uniforms com chave nova)', () => {
    const m = new THREE.MeshStandardMaterial();
    const mapas = { cor: tex(), normal: tex() };
    aplicarTexturaTriplanar(m, mapas, textura);
    const k1 = m.customProgramCacheKey();
    removerTexturaTriplanar(m);
    const k2 = m.customProgramCacheKey();
    aplicarTexturaTriplanar(m, mapas, textura);
    const k3 = m.customProgramCacheKey();
    expect(new Set([k1, k2, k3]).size).toBe(3);
    // A nova compilação traz uniforms completos (os mapas voltam a existir).
    expect(Object.keys(rodarCompilacao(m)).sort()).toEqual(['tpColor', 'tpMap', 'tpNormal', 'tpOff']);
  });

  it('outros mapas no mesmo material também trocam a chave; materiais novos com os mesmos mapas compartilham o programa', () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    aplicarTexturaTriplanar(a, { cor: tex() }, textura);
    aplicarTexturaTriplanar(b, { cor: tex() }, textura);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    const k = a.customProgramCacheKey();
    aplicarTexturaTriplanar(a, { cor: tex(), normal: tex() }, textura);
    expect(a.customProgramCacheKey()).not.toBe(k);
  });

  it('remover sem textura aplicada não faz nada', () => {
    const m = new THREE.MeshStandardMaterial();
    const v = m.version;
    expect(removerTexturaTriplanar(m)).toBe(m);
    expect(m.version).toBe(v);
  });

  it('espaço do objeto: define USE_TP_LOCAL nos dois shaders e muda a chave; o padrão segue no espaço do mundo', () => {
    const base = THREE.ShaderLib.standard;
    const mk = () => ({ uniforms: {} as Record<string, { value: unknown }>, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader });
    const mapas = { cor: tex(), normal: tex() };
    const mundo = mk();
    injetarTriplanar(mundo, mapas, mapeamentoDaTextura(textura));
    expect(mundo.vertexShader).not.toContain('#define USE_TP_LOCAL');
    expect(mundo.fragmentShader).not.toContain('#define USE_TP_LOCAL');
    const obj = mk();
    injetarTriplanar(obj, mapas, mapeamentoDaTextura(textura), undefined, 'objeto');
    expect(obj.vertexShader.startsWith('#define USE_TP_LOCAL\n')).toBe(true);
    expect(obj.fragmentShader.startsWith('#define USE_TP_LOCAL\n')).toBe(true);
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    aplicarTexturaTriplanar(a, mapas, textura);
    aplicarTexturaTriplanar(b, mapas, textura, 'objeto');
    expect(a.customProgramCacheKey()).toBe('tp:cn:0');
    expect(b.customProgramCacheKey()).toBe('tp:cno:0');
  });
});
