import * as THREE from 'three';
import type { Id } from '@hestia/model';
import { arestasDaCortina, subconjuntoDeLotes, type LoteAvulsoCortina3d, type LoteCortina3d } from './cortina3d.ts';
import type { HighlightStyle } from './highlight3d.ts';
import { aplicarEstiloAoMaterial, criarMaterialDoRealce, MascaraDoRealce, TabelaDeCodigos, texturaDaMascara, type MaterialDoRealce } from './realceGpu3d.ts';

/**
 * Realce das paredes cortina (seleção, cursor e aviso). A caixa de picking da cortina nunca é realçada: o realce segue a geometria real,
 * montante a montante e painel a painel, como as paredes comuns.
 *
 * - **Preenchimento**: cada desenho da cortina (um `InstancedMesh` por lote, ou um `Mesh` por peça avulsa) ganha uma sobreposição que reusa o
 *   `position`, o `index` e a matriz de instância da malha de origem (mesmo buffer na GPU). Um atributo `aElem` (por instância, ou por vértice nas
 *   peças avulsas) diz a qual cortina cada instância pertence, e o shader de realce (`realceGpu3d.ts`) só desenha as que estão na máscara. Trocar a
 *   seleção escreve 1 byte por cortina; nenhuma malha nova é criada por peça.
 * - **Arestas**: as arestas vivas do protótipo, levadas ao mundo pela matriz de cada instância da cortina (`arestasDaCortina`). Calculadas uma vez
 *   por cortina e guardadas enquanto o grupo do nível for o mesmo.
 */

/** Um desenho da cortina na cena: o lote instanciado (com as instâncias) ou a peça avulsa (malha no mundo). */
export type DesenhoDeCortina = { malha: THREE.InstancedMesh; lote: LoteCortina3d } | { malha: THREE.Mesh; avulso: LoteAvulsoCortina3d };

/** O que o realce precisa de um nível com cortina: os desenhos e o ângulo das arestas vivas (rad). */
export interface GrupoDeRealceCortina {
  readonly desenhos: readonly DesenhoDeCortina[];
  readonly anguloRad: number;
}

/** Nível sem cortina (ou sem o kernel): nada a realçar. */
export const GRUPO_DE_REALCE_VAZIO: GrupoDeRealceCortina = { desenhos: [], anguloRad: 0 };

type Ranhura = 'sel' | 'hov' | 'aviso';
const RANHURAS: readonly Ranhura[] = ['sel', 'hov', 'aviso'];

interface CacheDoGrupo {
  lotes: LoteCortina3d[];
  avulsos: LoteAvulsoCortina3d[];
  /** Arestas (mundo) de cada cortina, calculadas na primeira vez que ela é realçada. */
  porCortina: Map<Id, Float32Array>;
}

/** Estado de uma ranhura: material e máscara da GPU, as sobreposições montadas e as arestas. */
class RanhuraDaCortina {
  readonly material: MaterialDoRealce = criarMaterialDoRealce();
  readonly mascara = new MascaraDoRealce();
  textura: THREE.DataTexture | null = null;
  readonly linhasMaterial = new THREE.LineBasicMaterial({ transparent: true, depthTest: true, depthWrite: false });
  /** Sobreposição de cada desenho (chave: a malha de origem), criada na primeira vez que a cortina é realçada. */
  readonly sobreposicoes = new Map<THREE.Object3D, THREE.Object3D>();
  /** As que estão na camada agora. */
  noAr = new Set<THREE.Object3D>();
  linhas: THREE.LineSegments | null = null;
  ids: readonly Id[] | null = null;
  cor: THREE.ColorRepresentation = 0;
  fill = 0;
  edges = 0;
}

/** Libera a geometria própria da sobreposição, sem tocar nos buffers do desenho de origem (são compartilhados). */
function liberarSobreposicao(s: THREE.Object3D): void {
  const g = (s as THREE.Mesh).geometry;
  if (!g) return;
  g.deleteAttribute('aElem');
  g.deleteAttribute('position');
  g.setIndex(null);
  g.dispose();
}

/** Sobreposição de um desenho: a mesma posição, o mesmo índice e (no lote) a mesma matriz de instância, com o código de cada instância. */
function sobreposicaoDe(d: DesenhoDeCortina, material: MaterialDoRealce, tabela: TabelaDeCodigos): THREE.Object3D {
  const geo = new THREE.BufferGeometry();
  const origem = d.malha.geometry;
  geo.setAttribute('position', origem.getAttribute('position'));
  geo.setIndex(origem.index);
  let s: THREE.Object3D;
  if ('lote' in d) {
    geo.setAttribute('aElem', new THREE.InstancedBufferAttribute(Float32Array.from(d.lote.donos, (id) => tabela.codigo(id)), 1));
    const inst = new THREE.InstancedMesh(geo, material, d.lote.n);
    // Mesma matriz de instância (mesmo buffer na GPU): a sobreposição desenha as instâncias da malha de origem.
    inst.instanceMatrix = d.malha.instanceMatrix;
    s = inst;
  } else {
    geo.setAttribute('aElem', new THREE.BufferAttribute(new Float32Array(origem.getAttribute('position').count).fill(tabela.codigo(d.avulso.cortina)), 1));
    s = new THREE.Mesh(geo, material);
  }
  s.renderOrder = 5;
  s.matrixAutoUpdate = false;
  // O recorte cobre a cortina no mundo: sem esfera própria para o teste de frustum.
  s.frustumCulled = false;
  return s;
}

/** Os donos (cortinas) de um desenho, em conjunto (cache por objeto do desenho). */
const donosDoDesenho = new WeakMap<DesenhoDeCortina, Set<Id>>();
function donosDe(d: DesenhoDeCortina): Set<Id> {
  let s = donosDoDesenho.get(d);
  if (!s) {
    s = new Set('lote' in d ? d.lote.donos : [d.avulso.cortina]);
    donosDoDesenho.set(d, s);
  }
  return s;
}

function mesmoEstilo(r: RanhuraDaCortina, ids: readonly Id[], style: HighlightStyle): boolean {
  if (!r.ids || r.cor !== style.color || r.fill !== style.fill || r.edges !== style.edges) return false;
  if (r.ids === ids) return true;
  if (r.ids.length !== ids.length) return false;
  for (let i = 0; i < ids.length; i++) if (r.ids[i] !== ids[i]) return false;
  return true;
}

/** Realces das cortinas da cena: um por ranhura, num objeto à parte (`camada`), fora do modelo. */
export class RealceDaCortina {
  /** Onde as sobreposições e as arestas ficam; a cena a põe como filha. */
  readonly camada = new THREE.Object3D();
  private ranhuras: Record<Ranhura, RanhuraDaCortina> = { sel: new RanhuraDaCortina(), hov: new RanhuraDaCortina(), aviso: new RanhuraDaCortina() };
  private tabela = new TabelaDeCodigos();
  private grupos: readonly GrupoDeRealceCortina[] = [];
  private caches = new WeakMap<GrupoDeRealceCortina, CacheDoGrupo>();

  /** Troca os grupos da cena (o modelo foi refeito): tira todos os realces, que são refeitos na próxima chamada de `definir`. */
  trocarGrupos(grupos: readonly GrupoDeRealceCortina[]): void {
    this.soltarTodos();
    for (const r of Object.values(this.ranhuras)) {
      for (const s of r.sobreposicoes.values()) liberarSobreposicao(s);
      r.sobreposicoes.clear();
    }
    this.grupos = grupos;
  }

  /** Realça as cortinas `ids` na ranhura (ou tira, com `ids` vazio). Só refaz o que mudou. */
  definir(slot: Ranhura, ids: readonly Id[], style: HighlightStyle): void {
    const r = this.ranhuras[slot];
    if (mesmoEstilo(r, ids, style)) return;
    this.limpar(r);
    if (!ids.length) return;
    r.ids = ids;
    r.cor = style.color;
    r.fill = style.fill;
    r.edges = style.edges;
    this.preencher(r, ids, style);
    this.arestas(r, ids, style);
  }

  soltar(slot: Ranhura): void {
    this.limpar(this.ranhuras[slot]);
  }

  soltarTodos(): void {
    for (const s of RANHURAS) this.limpar(this.ranhuras[s]);
  }

  /** Sobreposições de preenchimento na camada agora (diagnóstico e teste). */
  sobreposicoesNoAr(slot: Ranhura): THREE.Object3D[] {
    return [...this.ranhuras[slot].noAr];
  }

  /** Arestas na camada agora (diagnóstico e teste): `null` quando a ranhura não tem arestas. */
  arestasNoAr(slot: Ranhura): THREE.LineSegments | null {
    return this.ranhuras[slot].linhas;
  }

  /** Solta toda a GPU deste realce (a cena foi descartada). */
  dispose(): void {
    this.trocarGrupos([]);
    for (const r of Object.values(this.ranhuras)) {
      r.material.dispose();
      r.linhasMaterial.dispose();
      r.textura?.dispose();
      r.textura = null;
    }
  }

  private limpar(r: RanhuraDaCortina): void {
    for (const s of r.noAr) this.camada.remove(s);
    r.noAr = new Set();
    if (r.linhas) {
      this.camada.remove(r.linhas);
      r.linhas.geometry.dispose();
      r.linhas = null;
    }
    if (r.mascara.quantidade) {
      r.mascara.definir([]);
      if (r.textura) r.textura.needsUpdate = true;
    }
    r.ids = null;
  }

  private preencher(r: RanhuraDaCortina, ids: readonly Id[], style: HighlightStyle): void {
    const novo = new Set<THREE.Object3D>();
    for (const g of this.grupos) {
      for (const d of g.desenhos) {
        const donos = donosDe(d);
        if (!ids.some((id) => donos.has(id))) continue;
        let s = r.sobreposicoes.get(d.malha);
        if (!s) {
          s = sobreposicaoDe(d, r.material, this.tabela);
          r.sobreposicoes.set(d.malha, s);
        }
        d.malha.updateWorldMatrix(true, false);
        s.matrix.copy(d.malha.matrixWorld);
        s.matrixWorld.copy(d.malha.matrixWorld);
        novo.add(s);
        if (!r.noAr.has(s)) this.camada.add(s);
      }
    }
    for (const s of r.noAr) if (!novo.has(s)) this.camada.remove(s);
    r.noAr = novo;

    // Máscara: um byte por cortina realçada (o código é o da tabela, estável).
    const codigos = ids.map((id) => this.tabela.codigo(id));
    if (r.mascara.garantir(this.tabela.tamanho) || !r.textura) {
      r.textura?.dispose();
      r.mascara.definir(codigos);
      r.textura = texturaDaMascara(r.mascara);
      (r.material.uniforms.uMascara as { value: THREE.Texture | null }).value = r.textura;
    } else {
      r.mascara.definir(codigos);
      r.textura.needsUpdate = true;
    }
    aplicarEstiloAoMaterial(r.material, style.color, style.fill);
  }

  private arestas(r: RanhuraDaCortina, ids: readonly Id[], style: HighlightStyle): void {
    const partes: Float32Array[] = [];
    for (const id of ids) for (const g of this.grupos) partes.push(this.arestasDaCortina(g, id));
    const total = partes.reduce((n, a) => n + a.length, 0);
    if (!total) return;
    const todas = new Float32Array(total);
    let k = 0;
    for (const a of partes) {
      todas.set(a, k);
      k += a.length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(todas, 3));
    r.linhasMaterial.color.set(style.color);
    r.linhasMaterial.opacity = style.edges;
    const linhas = new THREE.LineSegments(geo, r.linhasMaterial);
    linhas.frustumCulled = false;
    linhas.renderOrder = 6;
    r.linhas = linhas;
    this.camada.add(linhas);
  }

  /** Arestas vivas da cortina `id` neste grupo, no mundo (cache por cortina enquanto o grupo for o mesmo). */
  private arestasDaCortina(g: GrupoDeRealceCortina, id: Id): Float32Array {
    let c = this.caches.get(g);
    if (!c) {
      c = {
        lotes: g.desenhos.flatMap((d) => ('lote' in d ? [d.lote] : [])),
        avulsos: g.desenhos.flatMap((d) => ('avulso' in d ? [d.avulso] : [])),
        porCortina: new Map(),
      };
      this.caches.set(g, c);
    }
    let a = c.porCortina.get(id);
    if (!a) {
      a = arestasDaCortina(
        subconjuntoDeLotes(c.lotes, (dono) => dono === id),
        g.anguloRad,
        c.avulsos.filter((x) => x.cortina === id),
      );
      c.porCortina.set(id, a);
    }
    return a;
  }
}
