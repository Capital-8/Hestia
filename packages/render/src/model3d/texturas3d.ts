import * as THREE from 'three';
import type { Material, MaterialTextura } from '@hestia/model';

/**
 * Texturas por imagem no 3D (decisão 0056, parte "textura"). O render não baixa nada: quem hospeda a cena entrega os
 * mapas já carregados por um `TexturasProvedor3D`. A projeção é triplanar em coordenadas de mundo, com escala real em
 * metros: não depende de UV nas malhas (que o modelo não tem) e vale para malhas comuns e instanciadas.
 */

/** Mapas já carregados de uma textura (cada um opcional). `cor` em sRGB; `normal` no padrão DirectX (Y para baixo). */
export interface MapasTextura3D {
  cor?: THREE.Texture;
  normal?: THREE.Texture;
  rugosidade?: THREE.Texture;
}

export interface TexturasProvedor3D {
  /** Mapas da textura, ou `undefined` enquanto carregam (a chamada pode iniciar o download). */
  obter(imagemId: string): MapasTextura3D | undefined;
  /** Sobe quando chega textura nova: entra na chave da cena para os materiais serem refeitos. */
  readonly versao: number;
}

/** Parâmetros de mapeamento resolvidos (o que o shader recebe). */
export interface MapeamentoTextura {
  /** 1 / lado do ladrilho, em 1/m. */
  frequencia: number;
  /** cos e sen da rotação. */
  cos: number;
  sen: number;
  /** Deslocamento em unidades de textura (ladrilhos). */
  deslocamento: [number, number];
}

/** `MaterialTextura` → parâmetros do shader. Escala não positiva ou inválida cai em 1 m. */
export function mapeamentoDaTextura(t: Pick<MaterialTextura, 'escalaMetros' | 'rotacao' | 'deslocamento'>): MapeamentoTextura {
  const escala = Number.isFinite(t.escalaMetros) && t.escalaMetros > 0 ? t.escalaMetros : 1;
  const rad = ((Number.isFinite(t.rotacao) ? t.rotacao : 0) * Math.PI) / 180;
  const d = t.deslocamento;
  return {
    frequencia: 1 / escala,
    cos: Math.cos(rad),
    sen: Math.sin(rad),
    deslocamento: [Number.isFinite(d[0]) ? d[0] / escala : 0, Number.isFinite(d[1]) ? d[1] / escala : 0],
  };
}

/** Parte da chave do material que identifica a textura aplicada (vazia sem textura carregada). */
export function chaveDaTextura(m: Material | undefined, provedor: TexturasProvedor3D | null): string {
  const t = m?.aparencia?.textura;
  if (!t || !provedor) return '';
  const mapas = provedor.obter(t.imagemId);
  if (!mapas) return '';
  return `tx:${t.imagemId}:${mapas.cor ? 'c' : ''}${mapas.normal ? 'n' : ''}${mapas.rugosidade ? 'r' : ''}:${t.escalaMetros}:${t.rotacao}:${t.deslocamento[0]},${t.deslocamento[1]}:${t.repetir ? 1 : 0}`;
}

const GLSL_VERTEX_DECL = `
varying vec3 vTpPos;
`;
const GLSL_VERTEX_BODY = `
vec4 tpWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  tpWorld = instanceMatrix * tpWorld;
#endif
vTpPos = (modelMatrix * tpWorld).xyz;
`;
const GLSL_FRAG_DECL = `
varying vec3 vTpPos;
uniform vec4 tpMap; // frequência, cos, sen, (não usado)
uniform vec2 tpOff;
#ifdef USE_TP_COLOR
  uniform sampler2D tpColor;
#endif
#ifdef USE_TP_NORMAL
  uniform sampler2D tpNormal;
#endif
#ifdef USE_TP_ROUGH
  uniform sampler2D tpRough;
#endif
vec2 tpUv(vec2 p) {
  vec2 q = p * tpMap.x;
  q = vec2(tpMap.y * q.x - tpMap.z * q.y, tpMap.z * q.x + tpMap.y * q.y);
  return q + tpOff;
}
vec3 tpBlend(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / max(w.x + w.y + w.z, 1e-5);
}
`;
const GLSL_COLOR = `
#ifdef USE_TP_COLOR
{
  vec3 tpN = normalize(cross(dFdx(vTpPos), dFdy(vTpPos)));
  vec3 tpW = tpBlend(tpN);
  vec3 tpC = texture2D(tpColor, tpUv(vTpPos.zy)).rgb * tpW.x
           + texture2D(tpColor, tpUv(vTpPos.xz)).rgb * tpW.y
           + texture2D(tpColor, tpUv(vTpPos.xy)).rgb * tpW.z;
  diffuseColor.rgb *= tpC;
}
#endif
`;
const GLSL_ROUGH = `
float roughnessFactor = roughness;
#ifdef USE_TP_ROUGH
{
  vec3 tpN = normalize(cross(dFdx(vTpPos), dFdy(vTpPos)));
  vec3 tpW = tpBlend(tpN);
  float tpR = texture2D(tpRough, tpUv(vTpPos.zy)).g * tpW.x
            + texture2D(tpRough, tpUv(vTpPos.xz)).g * tpW.y
            + texture2D(tpRough, tpUv(vTpPos.xy)).g * tpW.z;
  roughnessFactor *= tpR;
}
#endif
`;
const GLSL_NORMAL = `
#ifdef USE_TP_NORMAL
{
  vec3 tpN = normalize(cross(dFdx(vTpPos), dFdy(vTpPos)));
  vec3 tpW = tpBlend(tpN);
  // Mapa DirectX: o verde aponta para baixo; troca o sinal para o padrão OpenGL.
  vec3 tx = texture2D(tpNormal, tpUv(vTpPos.zy)).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(tpNormal, tpUv(vTpPos.xz)).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(tpNormal, tpUv(vTpPos.xy)).xyz * 2.0 - 1.0;
  tx.y = -tx.y; ty.y = -ty.y; tz.y = -tz.y;
  // Mistura UDN: soma a inclinação do mapa à normal geométrica e leva cada projeção para o mundo.
  tx = vec3(tx.xy + tpN.zy, tpN.x);
  ty = vec3(ty.xy + tpN.xz, tpN.y);
  tz = vec3(tz.xy + tpN.xy, tpN.z);
  vec3 tpWorldN = normalize(tx.zyx * tpW.x + ty.xzy * tpW.y + tz.xyz * tpW.z);
  normal = normalize((viewMatrix * vec4(tpWorldN, 0.0)).xyz);
}
#endif
`;

/** Resultado da injeção: quais trechos do shader foram de fato substituídos (para teste e diagnóstico). */
export interface InjecaoTriplanar {
  vertex: boolean;
  cor: boolean;
  rugosidade: boolean;
  normal: boolean;
}

interface ShaderLike { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }

function trocar(src: string, de: string, por: string): { src: string; ok: boolean } {
  return src.includes(de) ? { src: src.replace(de, por), ok: true } : { src, ok: false };
}

/** Injeta a projeção triplanar nos trechos do shader padrão do three. Puro sobre o texto; devolve o que foi trocado. */
export function injetarTriplanar(shader: ShaderLike, mapas: MapasTextura3D, map: MapeamentoTextura): InjecaoTriplanar {
  shader.uniforms.tpMap = { value: new THREE.Vector4(map.frequencia, map.cos, map.sen, 0) };
  shader.uniforms.tpOff = { value: new THREE.Vector2(map.deslocamento[0], map.deslocamento[1]) };
  if (mapas.cor) shader.uniforms.tpColor = { value: mapas.cor };
  if (mapas.normal) shader.uniforms.tpNormal = { value: mapas.normal };
  if (mapas.rugosidade) shader.uniforms.tpRough = { value: mapas.rugosidade };

  let v = trocar(shader.vertexShader, '#include <common>', `#include <common>\n${GLSL_VERTEX_DECL}`);
  const vA = v.ok;
  v = trocar(v.src, '#include <begin_vertex>', `#include <begin_vertex>\n${GLSL_VERTEX_BODY}`);
  shader.vertexShader = v.src;

  let f = trocar(shader.fragmentShader, '#include <common>', `#include <common>\n${GLSL_FRAG_DECL}`);
  const fA = f.ok;
  f = trocar(f.src, '#include <map_fragment>', `#include <map_fragment>\n${GLSL_COLOR}`);
  const cor = f.ok;
  f = trocar(f.src, '#include <roughnessmap_fragment>', GLSL_ROUGH);
  const rugosidade = f.ok;
  f = trocar(f.src, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${GLSL_NORMAL}`);
  const normal = f.ok;
  const defs = `${mapas.cor ? '#define USE_TP_COLOR\n' : ''}${mapas.normal ? '#define USE_TP_NORMAL\n' : ''}${mapas.rugosidade ? '#define USE_TP_ROUGH\n' : ''}`;
  shader.fragmentShader = defs + f.src;
  return { vertex: vA && v.ok && fA, cor, rugosidade, normal };
}

/** Prepara o mapa para repetição e filtragem de qualidade (a cor em sRGB). Idempotente. */
export function prepararMapa(t: THREE.Texture, cor: boolean, repetir = true, anisotropia = 8): THREE.Texture {
  t.wrapS = t.wrapT = repetir ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropia;
  t.needsUpdate = true;
  return t;
}

/**
 * Aplica a textura ao material: projeção triplanar (cor, rugosidade e normal). A cor do material vira branca quando há
 * mapa de cor (a imagem é quem dá a cor). Devolve o próprio material.
 */
export function aplicarTexturaTriplanar<T extends THREE.MeshStandardMaterial>(mat: T, mapas: MapasTextura3D, textura: MaterialTextura): T {
  const map = mapeamentoDaTextura(textura);
  if (mapas.cor) mat.color.set(0xffffff);
  mat.onBeforeCompile = (shader) => { injetarTriplanar(shader, mapas, map); };
  mat.customProgramCacheKey = () => `tp:${mapas.cor ? 'c' : ''}${mapas.normal ? 'n' : ''}${mapas.rugosidade ? 'r' : ''}`;
  mat.needsUpdate = true;
  return mat;
}
