import * as THREE from 'three';
import type { GraphicsCategory, Id, Material } from '@hestia/model';
import type { EntradaNivel } from '../model3d/cacheMalhas3d.ts';
import type { SolidBatch } from '../model3d/solids.ts';
import { InstanciasGpu } from './instanciasGpu.ts';
import { LoteGeometriaGpu, mesclarLotes } from './loteGeometria.ts';
import { LoteLinhasGpu } from './loteLinhas.ts';
import { OrcamentoVram } from './orcamento.ts';

/**
 * Gestor de recursos da cena 3D (Fase 2.1/2.2). Junta os lotes de todos os níveis numa malha por categoria e material,
 * instancia as caixas por categoria e material e mantém uma linha só para as arestas. Os dados de cada nível ficam em
 * segmentos no mesmo buffer: incluir um nível só acrescenta; mudar um nível com a mesma contagem reenvia só a faixa
 * dele; mudar a contagem/remover compacta o grupo afetado. Nenhuma geometria é criada por quadro.
 *
 * O `CacheMalhas` continua sendo a residência por nível (LRU em bytes); aqui só se contabiliza o que está na GPU.
 */

/** O que a cena recebe para anexar ao modelo ou à camada de picking. */
export interface ResultadoGestor {
  solidas: THREE.Mesh[];
  instanciadas: THREE.InstancedMesh[];
  arestas: THREE.LineSegments | null;
  bytes: number;
}

export interface OpcoesGestor {
  caixaUnitaria: THREE.BufferGeometry;
  material: (categoria: GraphicsCategory, materialId: Id, extras?: Material) => THREE.Material;
  materialArestas: () => THREE.Material;
  orcamento?: OrcamentoVram;
  tetoBytes?: number;
}

export interface OpcoesAtualizacao {
  /** Caixas instanciadas (falso no wireframe: só as arestas e o picking). */
  instanciar: boolean;
  /** Arestas visíveis/calculadas nesta atualização. */
  arestas: boolean;
  sombras: boolean;
}

interface GrupoLote {
  lote: LoteGeometriaGpu;
  materialId: Id;
  extras?: Material;
}

interface GrupoInstancias {
  instancias: InstanciasGpu;
  materialId: Id;
}

const vazio = new Set<string>();

export class GestorRecursosGpu {
  readonly orcamento: OrcamentoVram;
  private lotes = new Map<string, GrupoLote>();
  private instancias = new Map<string, GrupoInstancias>();
  private linhas: LoteLinhasGpu | null = null;
  /** Entrada já aplicada por nível (identidade): a atualização repetida não reenvia nada. */
  private aplicados = new Map<Id, EntradaNivel>();
  /** Chaves de lote e de instância que cada nível ocupa hoje. */
  private chavesLote = new Map<Id, Set<string>>();
  private chavesInstancia = new Map<Id, Set<string>>();
  /** Identidade estável de um material externo ao projeto (beirais), para não juntar materiais diferentes com o mesmo id. */
  private idsExtras = new WeakMap<object, number>();
  private seqExtras = 0;
  /** A montagem já foi fechada (ordem canônica e capacidade exata); edições depois disso não reconsolidam. */
  private consolidado = false;

  constructor(private readonly op: OpcoesGestor) {
    this.orcamento = op.orcamento ?? new OrcamentoVram(op.tetoBytes);
  }

  /** Bytes de GPU contabilizados (arrays de capacidade dos lotes, instâncias e arestas). */
  get bytes(): number {
    return this.orcamento.usado;
  }

  get gruposGeometria(): number {
    return this.lotes.size;
  }

  get gruposInstanciados(): number {
    return this.instancias.size;
  }

  /**
   * Sincroniza os grupos com os níveis dados. Devolve as malhas para a cena anexar (o gestor é o dono delas).
   * Níveis ausentes são removidos do buffer; níveis com a mesma entrada já aplicada não são reenviados.
   */
  atualizar(niveis: readonly EntradaNivel[], op: OpcoesAtualizacao, fecharMontagem = false): ResultadoGestor {
    const presentes = new Set(niveis.map((n) => n.levelId));
    for (const id of [...this.aplicados.keys()]) if (!presentes.has(id)) this.removerNivel(id);

    for (const nivel of niveis) {
      if (this.aplicados.get(nivel.levelId) === nivel) continue;
      this.aplicarNivel(nivel, op);
      this.aplicados.set(nivel.levelId, nivel);
    }

    // Fecho da montagem progressiva: a ordem de chegada dos níveis não pode mudar o layout final dos buffers.
    if (fecharMontagem && !this.consolidado) {
      const ordem = niveis.map((n) => n.levelId);
      for (const [, g] of this.lotes) g.lote.consolidar(ordem);
      for (const [, g] of this.instancias) g.instancias.consolidar(ordem);
      this.linhas?.consolidar(ordem);
      this.consolidado = true;
    }

    // Material, sombras e fechamento dos grupos. Materiais são remarcados mesmo quando o nível foi reaproveitado.
    for (const [, g] of this.lotes) {
      g.lote.aplicarMaterial(this.op.material(g.lote.categoria, g.materialId, g.extras));
      g.lote.aplicarSombras(op.sombras);
      g.lote.finalizar();
    }
    for (const [, g] of this.instancias) {
      g.instancias.aplicarMaterial(this.op.material(g.instancias.categoria, g.materialId));
      g.instancias.finalizar(op.sombras);
    }
    if (this.linhas) {
      this.linhas.aplicarMaterial(this.op.materialArestas());
      this.linhas.finalizar();
      this.linhas.definirVisivel(op.arestas);
    }
    this.soltarVazios();
    return this.resultado();
  }

  /** Remove um nível de todos os grupos (ele saiu da cena). */
  removerNivel(levelId: Id): void {
    for (const [, g] of this.lotes) g.lote.remover(levelId);
    for (const [, g] of this.instancias) g.instancias.remover(levelId);
    this.linhas?.remover(levelId);
    this.chavesLote.delete(levelId);
    this.chavesInstancia.delete(levelId);
    this.aplicados.delete(levelId);
    this.consolidado = false;
    this.soltarVazios();
  }

  dispose(): void {
    for (const [, g] of this.lotes) g.lote.dispose();
    for (const [, g] of this.instancias) g.instancias.dispose();
    this.linhas?.dispose();
    this.lotes.clear();
    this.instancias.clear();
    this.linhas = null;
    this.aplicados.clear();
    this.chavesLote.clear();
    this.chavesInstancia.clear();
    this.orcamento.limpar();
  }

  private aplicarNivel(nivel: EntradaNivel, op: OpcoesAtualizacao): void {
    const lotesAtuais = new Set<string>();
    const porChave = new Map<string, { categoria: GraphicsCategory; materialId: Id; extras?: Material; lotes: SolidBatch[] }>();
    for (const b of nivel.lotes ?? []) {
      if (!b.indices.length) continue;
      const extras = nivel.materiais?.[b.materialId];
      const chave = this.chaveDoGrupo(b.category, b.materialId, extras);
      let g = porChave.get(chave);
      if (!g) {
        g = { categoria: b.category, materialId: b.materialId, extras, lotes: [] };
        porChave.set(chave, g);
      }
      g.lotes.push(b);
    }
    for (const [chave, dados] of porChave) {
      lotesAtuais.add(chave);
      let grupo = this.lotes.get(chave);
      if (!grupo) {
        const lote = new LoteGeometriaGpu(
          chave,
          dados.categoria,
          dados.materialId,
          this.op.material(dados.categoria, dados.materialId, dados.extras),
          this.orcamento,
          dados.extras,
        );
        grupo = { lote, materialId: dados.materialId, ...(dados.extras ? { extras: dados.extras } : {}) };
        this.lotes.set(chave, grupo);
      }
      grupo.lote.definir(nivel.levelId, mesclarLotes(dados.lotes));
    }
    for (const chave of this.chavesLote.get(nivel.levelId) ?? vazio) {
      if (!lotesAtuais.has(chave)) this.lotes.get(chave)?.lote.remover(nivel.levelId);
    }
    this.chavesLote.set(nivel.levelId, lotesAtuais);

    const instAtuais = new Set<string>();
    if (op.instanciar) {
      for (const c of nivel.instancias ?? []) {
        if (!c.matrizes.length) continue;
        const chave = this.chaveDoGrupo(c.categoria, c.materialId, undefined);
        instAtuais.add(chave);
        let grupo = this.instancias.get(chave);
        if (!grupo) {
          const instancias = new InstanciasGpu(
            chave,
            c.categoria,
            c.materialId,
            this.op.caixaUnitaria,
            this.op.material(c.categoria, c.materialId),
            this.orcamento,
          );
          grupo = { instancias, materialId: c.materialId };
          this.instancias.set(chave, grupo);
        }
        grupo.instancias.definir(nivel.levelId, c.matrizes);
      }
    }
    for (const chave of this.chavesInstancia.get(nivel.levelId) ?? vazio) {
      if (!instAtuais.has(chave)) this.instancias.get(chave)?.instancias.remover(nivel.levelId);
    }
    this.chavesInstancia.set(nivel.levelId, instAtuais);

    if (op.arestas && nivel.arestas && nivel.arestas.length) {
      this.linhas ??= new LoteLinhasGpu(this.op.materialArestas(), this.orcamento);
      this.linhas.definir(nivel.levelId, nivel.arestas);
    } else {
      this.linhas?.remover(nivel.levelId);
    }
  }

  /** Chave do grupo: categoria + material; material externo (beiral) entra pela identidade do objeto. */
  private chaveDoGrupo(categoria: GraphicsCategory, materialId: Id, extras: Material | undefined): string {
    if (!extras) return `${categoria}|${materialId}`;
    let id = this.idsExtras.get(extras);
    if (id === undefined) {
      id = ++this.seqExtras;
      this.idsExtras.set(extras, id);
    }
    return `${categoria}|${materialId}#${id}`;
  }

  /** Descarta grupos sem nível e devolve as malhas na ordem de criação (estável entre atualizações). */
  private soltarVazios(): void {
    for (const [chave, g] of this.lotes) {
      if (!g.lote.vazio) continue;
      g.lote.dispose();
      this.lotes.delete(chave);
    }
    for (const [chave, g] of this.instancias) {
      if (!g.instancias.vazio) continue;
      g.instancias.dispose();
      this.instancias.delete(chave);
    }
    if (this.linhas?.vazio) {
      this.linhas.dispose();
      this.linhas = null;
    }
  }

  private resultado(): ResultadoGestor {
    const solidas: THREE.Mesh[] = [];
    for (const [, g] of this.lotes) solidas.push(g.lote.malha);
    const instanciadas: THREE.InstancedMesh[] = [];
    for (const [, g] of this.instancias) if (g.instancias.malha) instanciadas.push(g.instancias.malha!);
    return { solidas, instanciadas, arestas: this.linhas?.linhas ?? null, bytes: this.bytes };
  }
}
