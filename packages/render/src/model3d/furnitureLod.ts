import { assetParts, furnitureDefArrays, type FurnitureAsset, type FurnitureMeshDef, type FurnitureMeshGroup } from '@hestia/model';
import { simplifyMesh } from '@hestia/io/src/furniture/simplify.ts';

/**
 * Versão leve (simplificada) dos móveis importados, só da vista 3D. A malha completa fica no asset (render final); aqui a
 * versão leve de cada definição é gerada sob demanda, em fatias (uma definição por tarefa do navegador, para a interface
 * não travar) e guardada por objeto de definição e meta. Enquanto não fica pronta, a vista desenha a caixa da definição.
 */

/** Meta de triângulos DESENHADOS por bloco na versão leve (somando as peças do bloco). */
export const META_TRIANGULOS_LEVE = 30_000;

/** Malha pronta para a GPU: arrays tipados (compartilhados entre todas as instâncias) e grupos de material. */
export interface MalhaDeDefinicao {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  groups: FurnitureMeshGroup[];
  triangles: number;
}

/** Quantos triângulos tem a definição completa. */
export const triangulosDaDefinicao = (d: FurnitureMeshDef): number => Math.floor(d.indexCount / 3);

/**
 * Meta de triângulos de cada definição na versão leve. O bloco desenha cada definição uma vez por peça que a usa; a meta do
 * bloco vale para o total desenhado, então a parte de cada definição é proporcional ao tamanho dela (a razão é a mesma para
 * todas). Bloco que já cabe na meta fica completo (meta = triângulos da definição).
 */
export function metasLeves(asset: FurnitureAsset, meta: number = META_TRIANGULOS_LEVE): Map<string, number> {
  const uso = new Map<string, number>();
  for (const p of assetParts(asset)) uso.set(p.defId, (uso.get(p.defId) ?? 0) + 1);
  let desenhado = 0;
  for (const d of asset.defs) desenhado += triangulosDaDefinicao(d) * (uso.get(d.id) ?? 0);
  const razao = desenhado > meta ? meta / desenhado : 1;
  const out = new Map<string, number>();
  for (const d of asset.defs) {
    const t = triangulosDaDefinicao(d);
    out.set(d.id, razao >= 1 ? t : Math.min(t, Math.max(4, Math.floor(t * razao))));
  }
  return out;
}

const completas = new WeakMap<FurnitureMeshDef, MalhaDeDefinicao>();
const leves = new WeakMap<FurnitureMeshDef, Map<number, MalhaDeDefinicao>>();

function agrupar(d: FurnitureMeshDef, n: number): FurnitureMeshGroup[] {
  return d.groups.length ? d.groups : [{ start: 0, count: n, materialIndex: 0 }];
}

/** Malha completa da definição (arrays decodificados uma vez, em cache no modelo). */
export function malhaCompleta(d: FurnitureMeshDef): MalhaDeDefinicao {
  let m = completas.get(d);
  if (!m) {
    const a = furnitureDefArrays(d);
    m = { positions: a.positions, normals: a.normals, uvs: a.uvs, indices: a.indices, groups: agrupar(d, a.indices.length), triangles: a.indices.length / 3 };
    completas.set(d, m);
  }
  return m;
}

/** Versão leve já pronta (ou a própria completa quando a meta não reduz nada); undefined se ainda não foi gerada. */
export function malhaLevePronta(d: FurnitureMeshDef, meta: number): MalhaDeDefinicao | undefined {
  const alvo = Math.floor(meta);
  if (alvo >= triangulosDaDefinicao(d)) return malhaCompleta(d);
  return leves.get(d)?.get(alvo);
}

/** Gera a versão leve agora (síncrono, custa tempo). Guarda no cache. */
export function gerarMalhaLeve(d: FurnitureMeshDef, meta: number): MalhaDeDefinicao {
  const pronta = malhaLevePronta(d, meta);
  if (pronta) return pronta;
  const alvo = Math.floor(meta);
  const c = malhaCompleta(d);
  const s = simplifyMesh({ id: d.id, name: d.name, positions: c.positions, normals: c.normals, uvs: c.uvs, indices: c.indices, groups: c.groups }, alvo);
  const m: MalhaDeDefinicao = { positions: s.positions, normals: s.normals, uvs: s.uvs, indices: s.indices, groups: s.groups.length ? s.groups : agrupar(d, s.indices.length), triangles: s.indices.length / 3 };
  let porMeta = leves.get(d);
  if (!porMeta) {
    porMeta = new Map();
    leves.set(d, porMeta);
  }
  porMeta.set(alvo, m);
  return m;
}

/** A versão leve de todas as definições do asset está pronta? */
export function leveProntaDoAsset(asset: FurnitureAsset, meta: number = META_TRIANGULOS_LEVE): boolean {
  for (const [id, alvo] of metasLeves(asset, meta)) {
    const d = asset.defs.find((x) => x.id === id);
    if (d && !malhaLevePronta(d, alvo)) return false;
  }
  return true;
}

interface Tarefa {
  def: FurnitureMeshDef;
  alvo: number;
}

/**
 * Fila das versões leves: uma definição por tarefa (setTimeout 0), para a página respirar entre elas. `aoConcluir` é chamado
 * quando a fila esvazia (ou a cada ~400 ms de trabalho, para o primeiro bloco aparecer sem esperar o último).
 */
export class FilaDeVersoesLeves {
  private fila: Tarefa[] = [];
  private pedidas = new WeakMap<FurnitureMeshDef, Set<number>>();
  private agendada = false;
  private ouvintes = new Set<() => void>();
  private esperando: Array<() => void> = [];
  private desdeAviso = 0;
  /** Quantas definições esta fila já simplificou (diagnóstico e testes). */
  gerados = 0;
  /** Tempo total (ms) gasto simplificando. */
  msTotal = 0;

  /** Pede as versões leves do asset que faltam. Devolve true se já está tudo pronto. */
  pedir(asset: FurnitureAsset, meta: number = META_TRIANGULOS_LEVE): boolean {
    let tudo = true;
    for (const [id, alvo] of metasLeves(asset, meta)) {
      const def = asset.defs.find((x) => x.id === id);
      if (!def || malhaLevePronta(def, alvo)) continue;
      tudo = false;
      let set = this.pedidas.get(def);
      if (!set) {
        set = new Set();
        this.pedidas.set(def, set);
      }
      if (set.has(alvo)) continue;
      set.add(alvo);
      this.fila.push({ def, alvo });
    }
    if (!tudo) this.agendar();
    return tudo;
  }

  /** Chamado quando há versões novas prontas. Devolve a função que cancela. */
  aoConcluir(f: () => void): () => void {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  }

  /** Resolve quando a fila esvazia (testes e medições). */
  esvaziar(): Promise<void> {
    if (!this.fila.length && !this.agendada) return Promise.resolve();
    return new Promise((r) => this.esperando.push(r));
  }

  /** Tarefas ainda na fila. */
  get pendentes(): number {
    return this.fila.length;
  }

  private agendar(): void {
    if (this.agendada) return;
    this.agendada = true;
    setTimeout(() => this.passo(), 0);
  }

  private passo(): void {
    this.agendada = false;
    const t = this.fila.shift();
    if (t) {
      const ini = performance.now();
      try {
        gerarMalhaLeve(t.def, t.alvo);
      } catch {
        // Definição que a simplificação não aceita: fica a caixa; não trava a fila.
      }
      const gasto = performance.now() - ini;
      this.msTotal += gasto;
      this.gerados++;
      this.desdeAviso += gasto;
    }
    if (this.fila.length) {
      if (this.desdeAviso >= 400) this.avisar();
      this.agendar();
      return;
    }
    this.avisar();
    const r = this.esperando;
    this.esperando = [];
    for (const f of r) f();
  }

  private avisar(): void {
    this.desdeAviso = 0;
    for (const f of [...this.ouvintes]) f();
  }
}

/** Fila única da vista 3D. */
export const filaDeVersoesLeves = new FilaDeVersoesLeves();
