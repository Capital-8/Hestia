import * as THREE from 'three';
import type { Id } from '@hestia/model';
import type { ElementRange } from './solids.ts';

/**
 * Realce por GPU (seleção, cursor e aviso): em vez de montar objetos three.js por intervalo do índice, cada malha do modelo
 * com `userData.ranges` ganha uma **sobreposição** que reusa o mesmo `position` e `index` (nada é copiado) e acrescenta um
 * atributo por vértice, `aElem`, com o código do elemento dono do vértice. Quais elementos estão realçados vai numa textura
 * de 1 byte por código (`MascaraDoRealce`); o vertex shader lê a máscara e some com os vértices dos elementos que não estão
 * nela. Trocar a seleção custa, portanto, escrever 1 byte por elemento selecionado e reenviar uma textura de poucos KB —
 * O(selecionados) em memória plana, sem alocar objeto three.js por elemento nem varrer triângulos.
 */

/** Código de elemento em uma geometria: índice (base 0) na tabela. */
export class TabelaDeCodigos {
  private porId = new Map<Id, number>();

  /** Código do id, registrando-o se for novo. Os códigos são estáveis: nunca se reaproveita um. */
  codigo(id: Id): number {
    const c = this.porId.get(id);
    if (c !== undefined) return c;
    const n = this.porId.size;
    this.porId.set(id, n);
    return n;
  }

  /** Código já registrado, sem registrar. */
  codigoDe(id: Id): number | undefined {
    return this.porId.get(id);
  }

  get tamanho(): number {
    return this.porId.size;
  }
}

/** Valor de `aElem` nos vértices que nenhuma faixa reivindica. */
export const SEM_ELEMENTO = -1;

/**
 * Código do elemento por vértice: para cada faixa de `faixas`, os vértices que o `indice` aponta no intervalo da faixa
 * recebem o código do id. Vértices fora de qualquer faixa ficam com `SEM_ELEMENTO`. Se um vértice é compartilhado por
 * elementos, vale o da última faixa (as malhas do modelo não compartilham vértices entre elementos).
 */
export function codigosPorVertice(
  indice: ArrayLike<number>,
  vertices: number,
  faixas: readonly ElementRange[],
  codigoDe: (id: Id) => number,
): Float32Array {
  const out = new Float32Array(vertices).fill(SEM_ELEMENTO);
  for (const r of faixas) {
    const c = codigoDe(r.id);
    const fim = Math.min(r.start + r.count, indice.length);
    for (let k = r.start; k < fim; k++) out[indice[k]!] = c;
  }
  return out;
}

/** Largura (texels) da textura da máscara: o código `c` fica na coluna `c % LARGURA`, linha `c / LARGURA`. */
export const LARGURA_DA_MASCARA = 1024;

/**
 * Máscara de realce: 1 byte por código de elemento (1 = realçado). Estrutura pura (sem three.js), para o teste e para a
 * textura da GPU lerem os mesmos bytes. `definir` troca o conjunto inteiro apagando só o que estava marcado.
 */
export class MascaraDoRealce {
  dados = new Uint8Array(LARGURA_DA_MASCARA * 4);
  private marcados: number[] = [];

  get altura(): number {
    return this.dados.length / LARGURA_DA_MASCARA;
  }

  /** Cabe `codigos` códigos? Cresce (dobrando as linhas) quando não cabe; devolve true se a textura precisa ser refeita. */
  garantir(codigos: number): boolean {
    if (codigos <= this.dados.length) return false;
    let linhas = this.altura;
    while (linhas * LARGURA_DA_MASCARA < codigos) linhas *= 2;
    const novo = new Uint8Array(linhas * LARGURA_DA_MASCARA);
    novo.set(this.dados);
    this.dados = novo;
    return true;
  }

  /** Marca exatamente `codigos` (desmarca os anteriores). Códigos fora da capacidade são ignorados. */
  definir(codigos: readonly number[]): void {
    for (const c of this.marcados) this.dados[c] = 0;
    this.marcados = [];
    for (const c of codigos) {
      if (c < 0 || c >= this.dados.length) continue;
      this.dados[c] = 1;
      this.marcados.push(c);
    }
  }

  estaMarcado(codigo: number): boolean {
    return this.dados[codigo] === 1;
  }

  get quantidade(): number {
    return this.marcados.length;
  }
}

// ---- geometria da sobreposição: a da malha + `aElem`, em cache por versão ----

interface GeometriaDoRealce {
  versao: number;
  tabela: TabelaDeCodigos;
  faixas: ElementRange[];
  geometria: THREE.BufferGeometry;
  aoLiberar: () => void;
}

const cacheDasGeometrias = new WeakMap<THREE.BufferGeometry, GeometriaDoRealce>();

/** Solta a geometria da sobreposição sem tocar nos buffers da malha (position/index são do modelo). */
function liberar(g: THREE.BufferGeometry): void {
  g.deleteAttribute('position');
  g.setIndex(null);
  g.dispose();
}

/**
 * Geometria da sobreposição de `mesh`: o mesmo `position` e `index` (mesmas instâncias de atributo, portanto o mesmo buffer
 * na GPU) e o `aElem`, montado uma vez por versão da geometria (`userData.versao`) e por lista de faixas. `null` quando a
 * malha não tem índice, posição ou faixas.
 */
export function geometriaDoRealce(mesh: THREE.Mesh, tabela: TabelaDeCodigos): THREE.BufferGeometry | null {
  const origem = mesh.geometry as THREE.BufferGeometry;
  const index = origem.index;
  const pos = origem.getAttribute('position');
  const faixas = mesh.userData.ranges as ElementRange[] | undefined;
  if (!index || !pos || !faixas) return null;
  const versao = Number(origem.userData.versao ?? 0);
  const guardada = cacheDasGeometrias.get(origem);
  if (guardada && guardada.versao === versao && guardada.tabela === tabela && guardada.faixas === faixas) return guardada.geometria;
  if (guardada) {
    origem.removeEventListener('dispose', guardada.aoLiberar);
    liberar(guardada.geometria);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos);
  g.setIndex(index);
  g.setAttribute('aElem', new THREE.BufferAttribute(codigosPorVertice(index.array as ArrayLike<number>, pos.count, faixas, (id) => tabela.codigo(id)), 1));
  const limite = Number.isFinite(origem.drawRange.count) ? origem.drawRange.count : index.count;
  g.setDrawRange(origem.drawRange.start, limite);
  const aoLiberar = (): void => {
    liberar(g);
    cacheDasGeometrias.delete(origem);
  };
  origem.addEventListener('dispose', aoLiberar);
  cacheDasGeometrias.set(origem, { versao, tabela, faixas, geometria: g, aoLiberar });
  return g;
}

// ---- material: descarta o que não está na máscara ----

/**
 * Viés de profundidade da sobreposição, em coordenada de dispositivo normalizada (NDC, de −1 a 1): ~5 passos de um buffer
 * de 24 bits. A sobreposição tem a mesma geometria da face que cobre, mas sai de OUTRO shader (o do material do elemento
 * faz a conta da posição em outra ordem), e as duas profundidades diferem por 1 ou 2 passos do buffer: sem viés, a
 * sobreposição ora passa e ora perde o teste de profundidade conforme a câmera se mexe (z-fighting: a seleção alterna
 * entre o azul e a textura). Com o viés ela vence sempre as faces coplanares, e só adianta o equivalente a ~5 passos
 * (≈6 mm a 100 m; ≈0,07 mm a 10 m), menos que a espessura de uma camada de parede, então o que está de fato atrás não vaza.
 * Não usa `polygonOffset`: ele escala com a inclinação da face e fazia as camadas de baixo vazarem pelo topo.
 */
export const VIES_DE_PROFUNDIDADE = 6e-7;

const VERTEX = /* glsl */ `
attribute float aElem;
uniform sampler2D uMascara;
uniform int uLargura;
flat varying float vMarcado;
void main() {
  float m = 0.0;
  if (aElem >= 0.0) {
    int c = int(aElem + 0.5);
    m = texelFetch(uMascara, ivec2(c % uLargura, c / uLargura), 0).r;
  }
  vMarcado = m;
  if (m < 0.001) {
    // Fora da máscara: todos os vértices no mesmo ponto atrás do plano de corte, o triângulo nem é rasterizado.
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  // Malha instanciada (cortina): a matriz da instância entra aqui; nas malhas comuns o bloco não existe.
  vec4 posicao = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  posicao = instanceMatrix * posicao;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * posicao;
  // Viés de profundidade (ver VIES_DE_PROFUNDIDADE): a sobreposição vence as faces coplanares que ela cobre.
  gl_Position.z -= gl_Position.w * ${VIES_DE_PROFUNDIDADE.toExponential()};
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 diffuse;
uniform float uOpacidade;
flat varying float vMarcado;
void main() {
  if (vMarcado < 0.001) discard;
  gl_FragColor = vec4(diffuse, uOpacidade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Material de uma ranhura do realce: `color` e `opacity` são as do estilo (o shader lê os uniformes que as espelham). */
export type MaterialDoRealce = THREE.ShaderMaterial & { color: THREE.Color };

export function criarMaterialDoRealce(): MaterialDoRealce {
  const diffuse = new THREE.Color();
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uMascara: { value: null },
      uLargura: { value: LARGURA_DA_MASCARA },
      diffuse: { value: diffuse },
      uOpacidade: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  }) as MaterialDoRealce;
  m.color = diffuse;
  return m;
}

/** Aplica cor e opacidade do estilo ao material (a cor entra pelo `THREE.Color`, que já converte o hexadecimal). */
export function aplicarEstiloAoMaterial(m: MaterialDoRealce, cor: THREE.ColorRepresentation, opacidade: number): void {
  m.color.set(cor);
  m.opacity = opacidade;
  (m.uniforms.uOpacidade as { value: number }).value = opacidade;
}

/** Textura de 1 byte por texel (R8) com os bytes da máscara. */
export function texturaDaMascara(mascara: MascaraDoRealce): THREE.DataTexture {
  const t = new THREE.DataTexture(mascara.dados, LARGURA_DA_MASCARA, mascara.altura, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
