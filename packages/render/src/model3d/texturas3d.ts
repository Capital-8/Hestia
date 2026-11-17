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
#ifdef USE_TP_LOCAL
varying vec3 vTpR0;
varying vec3 vTpR1;
varying vec3 vTpR2;
#endif
`;
const GLSL_VERTEX_BODY = `
vec4 tpWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  tpWorld = instanceMatrix * tpWorld;
#endif
#ifdef USE_TP_LOCAL
  // Espaço do objeto: a textura acompanha o objeto quando ele gira. Os três vetores levam o espaço do objeto ao da câmera.
  vTpPos = tpWorld.xyz;
  mat3 tpRot = mat3(modelViewMatrix);
  #ifdef USE_INSTANCING
    tpRot = tpRot * mat3(instanceMatrix);
  #endif
  vTpR0 = normalize(tpRot[0]);
  vTpR1 = normalize(tpRot[1]);
  vTpR2 = normalize(tpRot[2]);
#else
  vTpPos = (modelMatrix * tpWorld).xyz;
#endif
`;
const GLSL_FRAG_DECL = `
varying vec3 vTpPos;
#ifdef USE_TP_LOCAL
varying vec3 vTpR0;
varying vec3 vTpR1;
varying vec3 vTpR2;
#endif
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
  #ifdef USE_TP_LOCAL
    normal = normalize(mat3(vTpR0, vTpR1, vTpR2) * tpWorldN);
  #else
    normal = normalize((viewMatrix * vec4(tpWorldN, 0.0)).xyz);
  #endif
}
#endif
`;

/**
 * Onde a textura é fixada: `mundo` (a textura fica parada no espaço; certo para o modelo, que não gira) ou `objeto` (a textura
 * acompanha o objeto quando ele gira; certo para a prévia do material).
 */
export type EspacoTextura = 'mundo' | 'objeto';

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

export interface UniformesTriplanar {
  tpMap: { value: THREE.Vector4 };
  tpOff: { value: THREE.Vector2 };
  tpColor?: { value: THREE.Texture };
  tpNormal?: { value: THREE.Texture };
  tpRough?: { value: THREE.Texture };
}

/** Uniforms do mapeamento e dos mapas; mudar o `value` vale na próxima imagem, sem recompilar o programa. */
function criarUniformes(mapas: MapasTextura3D, map: MapeamentoTextura): UniformesTriplanar {
  const u: UniformesTriplanar = { tpMap: { value: new THREE.Vector4() }, tpOff: { value: new THREE.Vector2() } };
  if (mapas.cor) u.tpColor = { value: mapas.cor };
  if (mapas.normal) u.tpNormal = { value: mapas.normal };
  if (mapas.rugosidade) u.tpRough = { value: mapas.rugosidade };
  atualizarUniformes(u, mapas, map);
  return u;
}

function atualizarUniformes(u: UniformesTriplanar, mapas: MapasTextura3D, map: MapeamentoTextura): void {
  u.tpMap.value.set(map.frequencia, map.cos, map.sen, 0);
  u.tpOff.value.set(map.deslocamento[0], map.deslocamento[1]);
  if (u.tpColor && mapas.cor) u.tpColor.value = mapas.cor;
  if (u.tpNormal && mapas.normal) u.tpNormal.value = mapas.normal;
  if (u.tpRough && mapas.rugosidade) u.tpRough.value = mapas.rugosidade;
}

/** Injeta a projeção triplanar nos trechos do shader padrão do three. Puro sobre o texto; devolve o que foi trocado. */
export function injetarTriplanar(shader: ShaderLike, mapas: MapasTextura3D, map: MapeamentoTextura, uniformes: UniformesTriplanar = criarUniformes(mapas, map), espaco: EspacoTextura = 'mundo'): InjecaoTriplanar {
  Object.assign(shader.uniforms, uniformes);

  let v = trocar(shader.vertexShader, '#include <common>', `#include <common>\n${GLSL_VERTEX_DECL}`);
  const vA = v.ok;
  v = trocar(v.src, '#include <begin_vertex>', `#include <begin_vertex>\n${GLSL_VERTEX_BODY}`);
  const local = espaco === 'objeto' ? '#define USE_TP_LOCAL\n' : '';
  shader.vertexShader = local + v.src;

  let f = trocar(shader.fragmentShader, '#include <common>', `#include <common>\n${GLSL_FRAG_DECL}`);
  const fA = f.ok;
  f = trocar(f.src, '#include <map_fragment>', `#include <map_fragment>\n${GLSL_COLOR}`);
  const cor = f.ok;
  f = trocar(f.src, '#include <roughnessmap_fragment>', GLSL_ROUGH);
  const rugosidade = f.ok;
  f = trocar(f.src, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${GLSL_NORMAL}`);
  const normal = f.ok;
  const defs = `${mapas.cor ? '#define USE_TP_COLOR\n' : ''}${mapas.normal ? '#define USE_TP_NORMAL\n' : ''}${mapas.rugosidade ? '#define USE_TP_ROUGH\n' : ''}`;
  shader.fragmentShader = local + defs + f.src;
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

interface EstadoTriplanar {
  /** Quais mapas o programa usa (cor, normal, rugosidade). */
  assinatura: string;
  /** Sobe a cada vez que o material troca de programa (com textura, sem ela, outros mapas). */
  geracao: number;
  uniformes: UniformesTriplanar;
}

const estadoDe = (mat: THREE.Material): EstadoTriplanar | undefined => mat.userData.triplanar as EstadoTriplanar | undefined;
const geracaoDe = (mat: THREE.Material): number => (mat.userData.triplanarGeracao as number | undefined) ?? 0;

/**
 * Aplica a textura ao material: projeção triplanar (cor, rugosidade e normal). A cor do material vira branca quando há
 * mapa de cor (a imagem é quem dá a cor). Devolve o próprio material.
 *
 * O three guarda o programa compilado POR MATERIAL pela chave `customProgramCacheKey` e só chama `onBeforeCompile` quando
 * a chave é nova para ele. Por isso: com os mesmos mapas, só os uniforms mudam (sem recompilar); quando o material troca
 * de programa e volta (com textura, sem ela, outros mapas), a chave leva a geração, para os uniforms serem refeitos.
 */
export function aplicarTexturaTriplanar<T extends THREE.MeshStandardMaterial>(mat: T, mapas: MapasTextura3D, textura: MaterialTextura, espaco: EspacoTextura = 'mundo'): T {
  const map = mapeamentoDaTextura(textura);
  if (mapas.cor) mat.color.set(0xffffff);
  const assinatura = `${mapas.cor ? 'c' : ''}${mapas.normal ? 'n' : ''}${mapas.rugosidade ? 'r' : ''}${espaco === 'objeto' ? 'o' : ''}`;
  const atual = estadoDe(mat);
  if (atual && atual.assinatura === assinatura) {
    atualizarUniformes(atual.uniformes, mapas, map);
    return mat;
  }
  if (atual) mat.userData.triplanarGeracao = geracaoDe(mat) + 1;
  const geracao = geracaoDe(mat);
  const uniformes = criarUniformes(mapas, map);
  mat.userData.triplanar = { assinatura, geracao, uniformes } satisfies EstadoTriplanar;
  mat.onBeforeCompile = (shader) => { injetarTriplanar(shader, mapas, map, uniformes, espaco); };
  mat.customProgramCacheKey = () => `tp:${assinatura}:${geracao}`;
  mat.needsUpdate = true;
  return mat;
}

/** Tira a textura do material (volta ao programa padrão). Seguro de chamar sem textura aplicada. */
export function removerTexturaTriplanar<T extends THREE.MeshStandardMaterial>(mat: T): T {
  if (!estadoDe(mat)) return mat;
  mat.userData.triplanar = undefined;
  mat.userData.triplanarGeracao = geracaoDe(mat) + 1;
  mat.onBeforeCompile = () => undefined;
  const geracao = geracaoDe(mat);
  mat.customProgramCacheKey = () => `plano:${geracao}`;
  mat.needsUpdate = true;
  return mat;
}
