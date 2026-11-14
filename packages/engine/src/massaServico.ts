/**
 * Serviço da massa sobre o kernel Rust (plano de massa, A.5 e A.8 item 4): mantém UMA cena do Rust com as seções 140 a 142 e `niveis` do projeto
 * (envio inicial e depois só a diferença) e responde às consultas 140 (malha), 141 (planta), 142 (fatias), 143 (corte), 144 (quantidades) e 145
 * (avisos), já traduzidas para ids do projeto. Mesmo molde de `kernelCortinaServico.ts`.
 *
 * NÃO calcula geometria, e não há TypeScript no lugar do kernel (A.5, "Kernel desligado ou com erro"): sem kernel, ou com erro dele, cada consulta
 * devolve `null` e nunca lança. O código do último erro fica em `ultimoErro()` para o painel de avisos distinguir `massa-sem-kernel` de `massa-invalida`.
 *
 * Cache por ASSINATURA: a cena e as respostas só são refeitas quando o hash das massas muda (`massaProjeto.ts`). Editar uma massa só reenvia as
 * linhas dela; mudar só a cor não toca no Rust nem nas respostas memorizadas.
 */
import { CenaV2, ErroKernelGrave, ErroKernelLeve, type GerenciadorKernelV2 } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { CODIGOS, NIVEL_TODOS } from '../../geom/src/kernel/v2/esquema.gerado.ts';
import { gerenciadorDoKernel } from './kernelDespacho.ts';
import { aoMudarKernelPendente } from './kernelPendente.ts';
import { montarCenaMassa, sincronizarCenaMassa, enviarCenaMassa, type CenaMassa } from './kernelMassa.ts';
import { entradaMassaDoProjeto, type EntradaMassaProjeto } from './massaProjeto.ts';

/** Resultados já com ids do projeto. Os vértices são do mundo; `indices` são absolutos (três por triângulo). */
export interface GrupoMalhaMassa {
  massaId: Id;
  copia: number;
  /** `PAPEL_MALHA_MASSA`. */
  papel: number;
  /** Primeiro índice do grupo em `indices` e quantos índices ele tem. */
  primeiro: number;
  n: number;
}

export interface MalhaMassaProjeto {
  grupos: GrupoMalhaMassa[];
  vertices: Float64Array;
  indices: Uint32Array;
}

export interface LinhaPlantaMassaProjeto {
  massaId: Id;
  copia: number;
  /** `ESTILO_PLANTA_MASSA`. */
  estilo: number;
  pontos: Array<{ x: number; y: number }>;
}

export interface FatiaMassaProjeto {
  massaId: Id;
  copia: number;
  /** Nível do projeto em que a fatia cai; `null` se o índice não existe no projeto. */
  nivelId: Id | null;
  area: number;
  perimetro: number;
  /** Cota absoluta do nível. */
  z: number;
  pontos: Array<{ x: number; y: number }>;
}

export interface LinhaCorteMassaProjeto {
  massaId: Id;
  copia: number;
  /** `ESTILO_CORTE_MASSA`. */
  estilo: number;
  /** Coordenadas do plano de corte: `s` ao longo da direção, `z` absoluto. */
  pontos: Array<{ s: number; z: number }>;
}

export interface QuantMassaProjeto {
  massaId: Id;
  volume: number;
  areaLateral: number;
  areaBase: number;
  areaTopo: number;
  altura: number;
}

export interface AvisoMassaProjeto {
  massaId: Id;
  /** `AVISO_MASSA`. */
  codigo: number;
  copia: number;
  indice: number;
  medido: number;
  limite: number;
  x: number;
  y: number;
  z: number;
}

type Saidas = Record<string, ArrayLike<number>>;

const saida = (s: Saidas, nome: string): ArrayLike<number> => {
  const v = s[nome];
  if (!v) throw new Error(`massa: a saída "${nome}" não veio na consulta`);
  return v;
};

/** `n` pares (x, y) em sequência a partir do par `ini` de `pts`. */
const pares = (pts: ArrayLike<number>, ini: number, n: number): Array<[number, number]> => Array.from({ length: n }, (_, q) => [pts[2 * (ini + q)]!, pts[2 * (ini + q) + 1]!]);

const inverso = <T>(m: ReadonlyMap<T, number>): Map<number, T> => new Map([...m].map(([k, v]) => [v, k] as const));

/** Malha (consulta 140): grupos de 5 valores, vértices de 3 e índices. */
export function decodificarMalhaMassa(s: Saidas, massaIdDe: (n: number) => Id | undefined): MalhaMassaProjeto {
  const g = saida(s, 'grupos');
  const grupos: GrupoMalhaMassa[] = [];
  for (let k = 0; k < g.length / 5; k++) {
    const massaId = massaIdDe(g[5 * k]!);
    if (massaId !== undefined) grupos.push({ massaId, copia: g[5 * k + 1]!, papel: g[5 * k + 2]!, primeiro: g[5 * k + 3]!, n: g[5 * k + 4]! });
  }
  return { grupos, vertices: Float64Array.from(saida(s, 'vertices')), indices: Uint32Array.from(saida(s, 'indices')) };
}

/** Planta (consulta 141): `linhas` de 4 valores e `pontos` em sequência. */
export function decodificarPlantaMassa(s: Saidas, massaIdDe: (n: number) => Id | undefined): LinhaPlantaMassaProjeto[] {
  const l = saida(s, 'linhas');
  const p = saida(s, 'pontos');
  const out: LinhaPlantaMassaProjeto[] = [];
  let ini = 0;
  for (let k = 0; k < l.length / 4; k++) {
    const n = l[4 * k + 3]!;
    const massaId = massaIdDe(l[4 * k]!);
    if (massaId !== undefined) out.push({ massaId, copia: l[4 * k + 1]!, estilo: l[4 * k + 2]!, pontos: pares(p, ini, n).map(([x, y]) => ({ x, y })) });
    ini += n;
  }
  return out;
}

/** Fatias (consulta 142): `fatias` de 4 valores, `pontos` em sequência e `valores` de 3 (área, perímetro, cota). */
export function decodificarFatiasMassa(s: Saidas, massaIdDe: (n: number) => Id | undefined, nivelIdDe: (n: number) => Id | null): FatiaMassaProjeto[] {
  const f = saida(s, 'fatias');
  const p = saida(s, 'pontos');
  const v = saida(s, 'valores');
  const out: FatiaMassaProjeto[] = [];
  let ini = 0;
  for (let k = 0; k < f.length / 4; k++) {
    const n = f[4 * k + 3]!;
    const massaId = massaIdDe(f[4 * k]!);
    if (massaId !== undefined)
      out.push({
        massaId,
        copia: f[4 * k + 1]!,
        nivelId: nivelIdDe(f[4 * k + 2]!),
        area: v[3 * k]!,
        perimetro: v[3 * k + 1]!,
        z: v[3 * k + 2]!,
        pontos: pares(p, ini, n).map(([x, y]) => ({ x, y })),
      });
    ini += n;
  }
  return out;
}

/** Corte (consulta 143): mesmo formato de linhas da planta, com `(s, z)` nos pontos. */
export function decodificarCorteMassa(s: Saidas, massaIdDe: (n: number) => Id | undefined): LinhaCorteMassaProjeto[] {
  return decodificarPlantaMassa(s, massaIdDe).map((l) => ({ massaId: l.massaId, copia: l.copia, estilo: l.estilo, pontos: l.pontos.map((q) => ({ s: q.x, z: q.y })) }));
}

/** Quantidades (consulta 144): `linhas` de 1 valor (massa) e `valores` de 5. */
export function decodificarQuantMassa(s: Saidas, massaIdDe: (n: number) => Id | undefined): QuantMassaProjeto[] {
  const l = saida(s, 'linhas');
  const v = saida(s, 'valores');
  const out: QuantMassaProjeto[] = [];
  for (let k = 0; k < l.length; k++) {
    const massaId = massaIdDe(l[k]!);
    if (massaId !== undefined) out.push({ massaId, volume: v[5 * k]!, areaLateral: v[5 * k + 1]!, areaBase: v[5 * k + 2]!, areaTopo: v[5 * k + 3]!, altura: v[5 * k + 4]! });
  }
  return out;
}

/** Avisos (consulta 145): `avisos` de 4 valores e `valores` de 5. */
export function decodificarAvisosMassa(s: Saidas, massaIdDe: (n: number) => Id | undefined): AvisoMassaProjeto[] {
  const a = saida(s, 'avisos');
  const v = saida(s, 'valores');
  const out: AvisoMassaProjeto[] = [];
  for (let k = 0; k < a.length / 4; k++) {
    const massaId = massaIdDe(a[4 * k]!);
    if (massaId !== undefined)
      out.push({ massaId, codigo: a[4 * k + 1]!, copia: a[4 * k + 2]!, indice: a[4 * k + 3]!, medido: v[5 * k]!, limite: v[5 * k + 1]!, x: v[5 * k + 2]!, y: v[5 * k + 3]!, z: v[5 * k + 4]! });
  }
  return out;
}

const VAZIA_MALHA = (): MalhaMassaProjeto => ({ grupos: [], vertices: new Float64Array(0), indices: new Uint32Array(0) });

export class ServicoMassa {
  private cena: CenaV2 | null = null;
  private atual: CenaMassa | null = null;
  private entrada: EntradaMassaProjeto | null = null;
  private projeto: Project | null = null;
  private assinatura: string | null = null;
  private readonly memo = new Map<string, unknown>();
  private gerDaCena: GerenciadorKernelV2 | null = null;
  private prontoVisto = false;
  private readonly ouvintesPronto = new Set<() => void>();
  private soltarKernel: (() => void) | null = null;
  private erro: number | null = null;

  constructor(private readonly gerenciador: () => GerenciadorKernelV2 | null) {}

  /** O kernel está carregado e ligado? Sem ele nada é calculado. */
  pronto(): boolean {
    const g = this.gerenciador();
    return !!g && g.ligado;
  }

  /** Código do último erro do kernel nas consultas (`CODIGOS`), ou `null` se a última chamada foi boa. */
  ultimoErro(): number | null {
    return this.erro;
  }

  /** Avisa quando o kernel passa a estar pronto (ou deixa de estar): quem desenhou sem kernel invalida o cache. */
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

  /** Cena e entrada prontas para `p`; falso se o kernel está desligado. Lança só o que o kernel lança (quem chama trata). */
  private preparar(p: Project): boolean {
    const ger = this.gerenciador();
    if (!ger || !ger.ligado) return false;
    if (this.cena && this.gerDaCena !== ger) this.encerrar();
    if (this.projeto === p && this.cena) return true;
    const entrada = entradaMassaDoProjeto(p);
    // Mesmas massas, mesma ordem e mesmas cotas: a cena do kernel e as respostas memorizadas continuam valendo.
    if (this.cena && entrada.assinatura === this.assinatura) {
      this.projeto = p;
      return true;
    }
    const nova = montarCenaMassa(entrada.entrada, this.atual ?? undefined);
    if (!this.cena) {
      this.cena = CenaV2.criar(ger, null);
      this.gerDaCena = ger;
      enviarCenaMassa(this.cena, nova);
    } else sincronizarCenaMassa(this.cena, this.atual, nova);
    this.cena.definirFonte((c) => enviarCenaMassa(c, nova));
    this.atual = nova;
    this.entrada = entrada;
    this.assinatura = entrada.assinatura;
    this.projeto = p;
    this.memo.clear();
    return true;
  }

  /** Resposta memorizada por chave. Erro do kernel vira `null` e fica em `ultimoErro()`; erro de código do próprio TS é relançado. */
  private memoizar<T>(p: Project, chave: string, f: () => T): T | null {
    try {
      if (!this.preparar(p)) return null;
      if (this.memo.has(chave)) return this.memo.get(chave) as T;
      const v = f();
      this.memo.set(chave, v);
      this.erro = null;
      return v;
    } catch (e) {
      if (e instanceof ErroKernelLeve) this.erro = e.codigo;
      else if (e instanceof ErroKernelGrave) this.erro = e.codigo ?? CODIGOS.INTERNO;
      else throw e;
      return null;
    }
  }

  /** `nivel_num` do nível do projeto; `null` (todos) vira `NIVEL_TODOS`; nível que não existe devolve `undefined`. */
  private nivelNum(nivel: Id | null): number | undefined {
    return nivel === null ? NIVEL_TODOS : this.entrada!.nivelDe.get(nivel);
  }

  private massaIdDe(): (n: number) => Id | undefined {
    const m = inverso(this.atual!.massaDe);
    return (n) => m.get(n);
  }

  /** Malha de um nível (ou de todos, `null`) em `lod` 0 grosso, 1 médio ou 2 fino. `null` = kernel indisponível. */
  malha(p: Project, nivel: Id | null = null, lod = 1): MalhaMassaProjeto | null {
    return this.memoizar(p, `malha|${nivel}|${lod}`, () => {
      const n = this.nivelNum(nivel);
      if (n === undefined) return VAZIA_MALHA();
      return decodificarMalhaMassa(this.cena!.consultar('massa_malha', [n, lod]), this.massaIdDe());
    });
  }

  /** Linhas de planta na cota de corte e na faixa de vista (cotas absolutas). */
  planta(p: Project, nivel: Id | null, corteZ: number, zMin: number, zMax: number): LinhaPlantaMassaProjeto[] | null {
    return this.memoizar(p, `planta|${nivel}|${corteZ}|${zMin}|${zMax}`, () => {
      const n = this.nivelNum(nivel);
      if (n === undefined) return [];
      return decodificarPlantaMassa(this.cena!.consultar('massa_planta', [n, corteZ, zMin, zMax]), this.massaIdDe());
    });
  }

  /** Fatia de cada massa em cada nível do projeto que cai dentro dela (um anel por cópia). */
  fatias(p: Project, nivel: Id | null = null): FatiaMassaProjeto[] | null {
    return this.memoizar(p, `fatias|${nivel}`, () => {
      const n = this.nivelNum(nivel);
      if (n === undefined) return [];
      const ids = this.entrada!.idsDosNiveis;
      return decodificarFatiasMassa(this.cena!.consultar('massa_fatias', [n]), this.massaIdDe(), (k) => ids[k] ?? null);
    });
  }

  /** Corte vertical: origem (ox, oy), direção (dx, dy) e profundidade do lado visível. */
  corte(p: Project, nivel: Id | null, ox: number, oy: number, dx: number, dy: number, profundidade: number): LinhaCorteMassaProjeto[] | null {
    return this.memoizar(p, `corte|${nivel}|${ox}|${oy}|${dx}|${dy}|${profundidade}`, () => {
      const n = this.nivelNum(nivel);
      if (n === undefined) return [];
      return decodificarCorteMassa(this.cena!.consultar('massa_corte', [n, ox, oy, dx, dy, profundidade]), this.massaIdDe());
    });
  }

  /** Volume, áreas e altura por massa (somadas sobre as cópias). */
  quantidades(p: Project, nivel: Id | null = null): QuantMassaProjeto[] | null {
    return this.memoizar(p, `quant|${nivel}`, () => {
      const n = this.nivelNum(nivel);
      if (n === undefined) return [];
      return decodificarQuantMassa(this.cena!.consultar('quant_massa', [n]), this.massaIdDe());
    });
  }

  /** Avisos de geometria medidos pelo kernel (consulta 145). Não bloqueiam. */
  avisos(p: Project, nivel: Id | null = null): AvisoMassaProjeto[] | null {
    return this.memoizar(p, `avisos|${nivel}`, () => {
      const n = this.nivelNum(nivel);
      if (n === undefined) return [];
      return decodificarAvisosMassa(this.cena!.consultar('massa_avisos', [n]), this.massaIdDe());
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
    this.erro = null;
    this.memo.clear();
  }
}

let servicoAtual: ServicoMassa | null = null;
let fonteGerenciador: () => GerenciadorKernelV2 | null = gerenciadorDoKernel;

/** O app liga o serviço ao gerenciador do kernel; testes injetam o deles. Os ouvintes migram para o serviço novo. */
export function definirGerenciadorDaMassa(f: () => GerenciadorKernelV2 | null): void {
  fonteGerenciador = f;
  const velho = servicoAtual;
  servicoAtual = null;
  velho?.encerrar();
  if (velho) {
    const ouvintes = [...velho['ouvintesPronto']];
    velho['soltarKernel']?.();
    const novo = servicoMassa();
    for (const o of ouvintes) novo.aoMudarPronto(o);
    ouvintes.forEach((o) => o());
  }
}

/** O serviço único do processo. */
export function servicoMassa(): ServicoMassa {
  return (servicoAtual ??= new ServicoMassa(() => fonteGerenciador()));
}
