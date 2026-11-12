/**
 * Serviço da parede cortina sobre o kernel Rust (decisão 0056, fase 1): mantém UMA cena do Rust com as seções 100 a 105 do projeto atual (envio
 * inicial e depois só a diferença por linhas) e responde às consultas 101 (malha por instâncias), 102 (planta), 104 (quantidades) e 105 (avisos) já
 * traduzidas para ids do projeto. Mesmo molde de `kernelGuardaCorpoServico.ts`. Não calcula geometria: tudo vem do Rust, e sem kernel pronto as
 * consultas devolvem `null` (a 3D e a planta desenham só o eixo e o aviso `cortina-sem-kernel`; nunca TypeScript no lugar).
 *
 * Cache por ASSINATURA: o projeto muda a cada edição, mas a cena e as respostas só são refeitas quando o hash das cortinas muda (`assinatura` de
 * `cortinaProjeto.ts`). Editar uma parede comum, uma laje ou uma cota não toca no Rust nem nas malhas, e os objetos devolvidos continuam os mesmos.
 */
import { CenaV2, type GerenciadorKernelV2 } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { entradaCortinaDoProjeto, temCortina, type EntradaCortinaProjeto } from './cortinaProjeto.ts';
import { gerenciadorDoKernel } from './kernelDespacho.ts';
import { aoMudarKernelPendente } from './kernelPendente.ts';
import {
  lerAvisosCortina,
  lerGradeCortina,
  lerMalhaCortina,
  lerPlantaCortina,
  lerQuantCortina,
  montarCenaCortina,
  sincronizarCenaCortina,
  type AvisoCortina,
  type CenaCortina,
  type GradeCortina,
  type LinhaQuantCortina,
} from './kernelCortina.ts';

const NIVEL_TODOS = 4294967295;

/** Protótipo de uma peça (montante ou painel), de comprimento unitário, em coordenadas locais; compartilhado por todas as instâncias dele. */
export interface PrototipoCortina {
  proto: number;
  /** 0 montante, 1 painel de vidro, 2 painel sólido (`PAPEL_MALHA_CORTINA`). */
  papel: number;
  /** Tipo de montante (papel 0) ou de painel (papéis 1 e 2) do modelo; `null` sem a resolução de tipos. */
  tipoId: Id | null;
  vertices: Float32Array;
  indices: Uint32Array;
}

/** Instâncias de UM protótipo numa cortina: mesmas faces, mesmo material, só as matrizes mudam. */
export interface InstanciasDeProtoCortina {
  wallId: Id;
  proto: number;
  papel: number;
  materialId: Id | null;
  /** Vidro: vai no grupo transparente, desenhado depois dos opacos. */
  transparente: boolean;
  /** 12 números por instância: três linhas `[r0 r1 r2 t]` (linha-maior); mundo = M · (x, y, z, 1). */
  matrizes: Float32Array;
  n: number;
}

export interface MalhaCortinaProjeto {
  protos: Map<number, PrototipoCortina>;
  /** Uma entrada por (cortina, protótipo, material); ordenadas por cortina e protótipo. */
  instancias: InstanciasDeProtoCortina[];
}

export interface LinhaPlantaCortinaProjeto {
  wallId: Id;
  /** 0 contorno, 1 vidro, 2 montante, 3 painel sólido (`PAPEL_PLANTA_CORTINA`). */
  papel: number;
  /** 0 cortado, 1 projetado, 2 oculto. */
  estilo: number;
  pontos: Array<{ x: number; y: number }>;
}

export interface AvisoCortinaProjeto extends Omit<AvisoCortina, 'cortina'> {
  wallId: Id;
}

export interface QuantCortinaProjeto extends Omit<LinhaQuantCortina, 'cortina' | 'material'> {
  wallId: Id;
  materialId: Id | null;
}

const inverso = <T>(m: ReadonlyMap<Id, T>): Map<T, Id> => new Map([...m].map(([k, v]) => [v, k] as const));

/** Decodifica `cortina_malha` agrupando as instâncias por (cortina, protótipo, material). */
export function decodificarMalhaCortina(
  s: Record<string, ArrayLike<number>>,
  wallIdDe: (n: number) => Id | undefined,
  materialIdDe: (n: number) => Id | null,
  tipoIdDe: (papel: number, tipo: number) => Id | null = () => null,
): MalhaCortinaProjeto {
  const m = lerMalhaCortina(s);
  const protos = new Map<number, PrototipoCortina>();
  const material = new Map<number, number | null>();
  for (const p of m.protos) {
    protos.set(p.proto, { proto: p.proto, papel: p.papel, tipoId: tipoIdDe(p.papel, p.tipo), vertices: Float32Array.from(p.vertices), indices: p.indices });
    material.set(p.proto, p.material);
  }
  const grupos = new Map<string, { wallId: Id; proto: number; papel: number; transparente: boolean; ms: number[] }>();
  for (const i of m.instancias) {
    const wallId = wallIdDe(i.cortina);
    if (wallId === undefined) continue;
    const chave = `${wallId}|${i.proto}|${i.transparente ? 1 : 0}`;
    let g = grupos.get(chave);
    if (!g) grupos.set(chave, (g = { wallId, proto: i.proto, papel: i.papel, transparente: i.transparente, ms: [] }));
    for (const x of i.matriz) g.ms.push(x);
  }
  const instancias: InstanciasDeProtoCortina[] = [...grupos.values()]
    .sort((a, b) => (a.wallId < b.wallId ? -1 : a.wallId > b.wallId ? 1 : a.proto - b.proto))
    .map((g) => {
      const mat = material.get(g.proto);
      return { wallId: g.wallId, proto: g.proto, papel: g.papel, materialId: mat === null || mat === undefined ? null : materialIdDe(mat), transparente: g.transparente, matrizes: Float32Array.from(g.ms), n: g.ms.length / 12 };
    });
  return { protos, instancias };
}

export class ServicoCortina {
  private cena: CenaV2 | null = null;
  private atual: CenaCortina | null = null;
  private entrada: EntradaCortinaProjeto | null = null;
  private projeto: Project | null = null;
  private assinatura: string | null = null;
  private readonly memo = new Map<string, unknown>();
  private gerDaCena: GerenciadorKernelV2 | null = null;
  private prontoVisto = false;
  private readonly ouvintesPronto = new Set<() => void>();
  private soltarKernel: (() => void) | null = null;

  constructor(private readonly gerenciador: () => GerenciadorKernelV2 | null) {}

  /** O kernel está carregado e ligado? Sem ele nada é calculado. */
  pronto(): boolean {
    const g = this.gerenciador();
    return !!g && g.ligado;
  }

  /** Avisa quando o kernel passa a estar pronto (ou deixa de estar): quem desenhou sem cortina (kernel ausente) invalida o cache. */
  aoMudarPronto(f: () => void): () => void {
    this.ouvintesPronto.add(f);
    this.prontoVisto = this.pronto();
    this.soltarKernel ??= aoMudarKernelPendente(() => this.verificarPronto());
    return () => {
      this.ouvintesPronto.delete(f);
      if (this.ouvintesPronto.size === 0) {
        this.soltarKernel?.();
        this.soltarKernel = null;
      }
    };
  }

  verificarPronto(): void {
    const agora = this.pronto();
    if (agora === this.prontoVisto) return;
    this.prontoVisto = agora;
    this.projeto = null;
    this.assinatura = null;
    this.memo.clear();
    [...this.ouvintesPronto].forEach((f) => f());
  }

  /** Há alguma parede cortina no projeto? (evita criar a cena à toa) */
  static temCortina(p: Project): boolean {
    return temCortina(p);
  }

  private preparar(p: Project): boolean {
    const ger = this.gerenciador();
    if (!ger || !ger.ligado) return false;
    if (this.cena && this.gerDaCena !== ger) this.encerrar();
    if (this.projeto === p && this.cena) return true;
    const entrada = entradaCortinaDoProjeto(p, this.entrada?.materialDe);
    // Mesmas cortinas, mesmos tipos, mesmos níveis: a cena do Rust e as respostas memorizadas continuam valendo.
    if (this.cena && entrada.assinatura === this.assinatura) {
      this.projeto = p;
      return true;
    }
    const nova = montarCenaCortina(entrada.entrada, this.atual ?? undefined);
    if (!this.cena) {
      this.cena = CenaV2.criar(ger, null);
      this.gerDaCena = ger;
      sincronizarCenaCortina(this.cena, null, nova);
    } else sincronizarCenaCortina(this.cena, this.atual, nova);
    this.cena.definirFonte((c) => sincronizarCenaCortina(c, null, nova));
    this.atual = nova;
    this.entrada = entrada;
    this.assinatura = entrada.assinatura;
    this.projeto = p;
    this.memo.clear();
    return true;
  }

  private memoizar<T>(p: Project, chave: string, f: () => T): T | null {
    if (!this.preparar(p)) return null;
    if (this.memo.has(chave)) return this.memo.get(chave) as T;
    const v = f();
    this.memo.set(chave, v);
    return v;
  }

  private nivel(nivelId: Id | null): number {
    return nivelId === null ? NIVEL_TODOS : (this.entrada!.nivelDe.get(nivelId) ?? NIVEL_TODOS);
  }

  private wallIdDe(): (n: number) => Id | undefined {
    const m = inverso(this.atual!.cortinaDe);
    return (n) => m.get(n);
  }

  /** Malha 3D por instâncias de todas as cortinas (`lod` 0 grosso, 1 médio, 2 fino). `null` = kernel indisponível. */
  malha(p: Project, lod = 1): MalhaCortinaProjeto | null {
    return this.memoizar(p, `malha${lod}`, () => {
      const s = this.cena!.consultar('cortina_malha', [NIVEL_TODOS, lod]);
      const mats = inverso(this.entrada!.materialDe);
      const montantes = inverso(this.atual!.montanteDe);
      const paineis = inverso(this.atual!.painelDe);
      return decodificarMalhaCortina(s, this.wallIdDe(), (n) => mats.get(n) ?? null, (papel, tipo) => (papel === 0 ? montantes : paineis).get(tipo) ?? null);
    });
  }

  /** Linhas de planta de um nível (ou de todos, `null`) no corte `corteZ` e no detalhe 0 grosso, 1 médio ou 2 fino. */
  planta(p: Project, nivelId: Id | null, corteZ: number, detalhe = 1): LinhaPlantaCortinaProjeto[] | null {
    return this.memoizar(p, `planta|${nivelId}|${corteZ}|${detalhe}`, () => {
      const s = this.cena!.consultar('cortina_planta', [this.nivel(nivelId), corteZ, detalhe]);
      const idDe = this.wallIdDe();
      const out: LinhaPlantaCortinaProjeto[] = [];
      for (const l of lerPlantaCortina(s)) {
        const wallId = idDe(l.cortina);
        if (wallId !== undefined) out.push({ wallId, papel: l.papel, estilo: l.estilo, pontos: l.pontos });
      }
      return out;
    });
  }

  /** Quantidades por cortina e papel (consulta 104). O TS de tabelas agrega daqui. */
  quantidades(p: Project): QuantCortinaProjeto[] | null {
    return this.memoizar(p, 'quant', () => {
      const s = this.cena!.consultar('quant_cortina', [NIVEL_TODOS]);
      const idDe = this.wallIdDe();
      const mats = inverso(this.entrada!.materialDe);
      const out: QuantCortinaProjeto[] = [];
      for (const q of lerQuantCortina(s)) {
        const wallId = idDe(q.cortina);
        if (wallId === undefined) continue;
        const { cortina: _c, material, ...resto } = q;
        out.push({ ...resto, wallId, materialId: material === null ? null : (mats.get(material) ?? null) });
      }
      return out;
    });
  }

  /**
   * Grade de cada cortina de um nível (consulta 100): linhas internas, células e segmentos, separados por id da parede (fase 2, seleção de
   * subelemento). `null` = kernel indisponível.
   */
  grade(p: Project, nivelId: Id): Map<Id, GradeCortina> | null {
    return this.memoizar(p, `grade|${nivelId}`, () => {
      const g = lerGradeCortina(this.cena!.consultar('cortina_grade', [this.nivel(nivelId)]));
      const idDe = this.wallIdDe();
      const out = new Map<Id, GradeCortina>();
      const de = (n: number): GradeCortina | undefined => {
        const id = idDe(n);
        if (id === undefined) return undefined;
        let x = out.get(id);
        if (!x) out.set(id, (x = { linhas: [], celulas: [], segmentos: [] }));
        return x;
      };
      for (const l of g.linhas) de(l.cortina)?.linhas.push(l);
      for (const c of g.celulas) de(c.cortina)?.celulas.push(c);
      for (const s of g.segmentos) de(s.cortina)?.segmentos.push(s);
      return out;
    });
  }

  /** Avisos de geometria medidos pelo Rust (consulta 105). */
  avisos(p: Project): AvisoCortinaProjeto[] | null {
    return this.memoizar(p, 'avisos', () => {
      const s = this.cena!.consultar('cortina_avisos', [NIVEL_TODOS]);
      const idDe = this.wallIdDe();
      const out: AvisoCortinaProjeto[] = [];
      for (const a of lerAvisosCortina(s)) {
        const wallId = idDe(a.cortina);
        if (wallId === undefined) continue;
        const { cortina: _c, ...resto } = a;
        out.push({ ...resto, wallId });
      }
      return out;
    });
  }

  encerrar(): void {
    this.cena?.destruir();
    this.cena = null;
    this.gerDaCena = null;
    this.atual = null;
    this.entrada = null;
    this.projeto = null;
    this.assinatura = null;
    this.memo.clear();
  }
}

let servicoAtual: ServicoCortina | null = null;
let fonteGerenciador: () => GerenciadorKernelV2 | null = gerenciadorDoKernel;

/** O app liga o serviço ao gerenciador do kernel; testes injetam o deles. Os ouvintes migram para o serviço novo. */
export function definirGerenciadorDaCortina(f: () => GerenciadorKernelV2 | null): void {
  fonteGerenciador = f;
  const velho = servicoAtual;
  servicoAtual = null;
  velho?.encerrar();
  if (velho) {
    const ouvintes = [...velho['ouvintesPronto']];
    velho['soltarKernel']?.();
    const novo = servicoCortina();
    for (const o of ouvintes) novo.aoMudarPronto(o);
    ouvintes.forEach((o) => o());
  }
}

/** O serviço único do processo. */
export function servicoCortina(): ServicoCortina {
  return (servicoAtual ??= new ServicoCortina(() => fonteGerenciador()));
}
