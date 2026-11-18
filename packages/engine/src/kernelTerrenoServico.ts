/**
 * Serviço do terreno sobre o kernel Rust (A.5): mantém UMA cena do Rust com as seções 160 a 164 do projeto atual (envio inicial e depois só a diferença
 * por linhas) e responde às consultas 160 a 168 já decodificadas e traduzidas para ids do projeto. Não calcula geometria: tudo vem do Rust. Sem kernel
 * pronto, ou com o kernel recusando os dados, as funções devolvem `null` (nenhum caminho TS gera malha, curva ou perfil) e `avisosDoPainel` traz
 * `terreno-sem-kernel` ou `terreno-invalido`. Os resultados são memorizados por projeto (identidade do objeto); se o projeto novo gera as mesmas
 * seções (mudou cor, nome, rótulos, uma parede...), a memória fica.
 */
import { CenaV2, type GerenciadorKernelV2 } from '@hestia/geom';
import { isTerrain, toleranciaCurvasDoTerreno, type Id, type Project, type ValidationIssue } from '@hestia/model';
import type { Lang } from './i18nMessages.ts';
import { gerenciadorDoKernel } from './kernelDespacho.ts';
import { aoMudarKernelPendente } from './kernelPendente.ts';
import { montarCenaTerreno, sincronizarCenaTN, type CenaTN } from './kernelTerreno.ts';
import { decodificarAvisosTN, terrenoAvisosDeGeometria, terrenoAvisosInvalido, terrenoAvisosSemKernel, type MedidaAvisoTN } from './terrenoIssues.ts';
import { decodificarQuantidadesRegioesTN, decodificarQuantidadesTN, type QuantidadesRegiaoTN, type QuantidadesTerreno } from './terrenoQuantities.ts';
import {
  decodificarCorteAterroTN,
  decodificarCorteTN,
  decodificarCotasTN,
  decodificarCurvasTN,
  decodificarMalhaTN,
  decodificarPlantaTN,
  type CotaDoTerreno,
  type CurvaNivelTN,
  type LinhaCorteTN,
  type LinhaPlantaTN,
  type MalhaTerreno,
  type MapaCorteAterroTN,
} from './terrenoVista.ts';

const NIVEL_TODOS = 4294967295;

/** Superfície das consultas: 0 existente, 1 proposta (existente modificada pelas regiões). */
export type SuperficieTN = 0 | 1;

export class ServicoTerreno {
  private cena: CenaV2 | null = null;
  private atual: CenaTN | null = null;
  private projeto: Project | null = null;
  private readonly memo = new Map<string, unknown>();
  /** Gerenciador com o qual a cena atual foi criada (se mudou, a cena é refeita). */
  private gerDaCena: GerenciadorKernelV2 | null = null;
  /** Projeto cujo envio ou consulta falhou, e a mensagem: não se tenta de novo enquanto o projeto for o mesmo objeto. */
  private projetoFalho: Project | null = null;
  private falha: string | null = null;
  private prontoVisto = false;
  private readonly ouvintesPronto = new Set<() => void>();
  private soltarKernel: (() => void) | null = null;

  constructor(private readonly gerenciador: () => GerenciadorKernelV2 | null) {}

  /** O kernel está carregado e ligado? Sem ele nada é calculado (nem desenhado): quem guarda resultado deve invalidar quando isto mudar. */
  pronto(): boolean {
    const g = this.gerenciador();
    return !!g && g.ligado;
  }

  /** Avisa quando o kernel passa a estar pronto (ou deixa de estar). Devolve a função que cancela a assinatura. */
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

  /** Compara a prontidão com a última vista; ao mudar, descarta a memória e avisa os ouvintes. */
  verificarPronto(): void {
    const agora = this.pronto();
    if (agora === this.prontoVisto) return;
    this.prontoVisto = agora;
    this.projeto = null;
    this.projetoFalho = null;
    this.memo.clear();
    [...this.ouvintesPronto].forEach((f) => f());
  }

  /** Há algum terreno no projeto? (evita criar a cena à toa) */
  static temTerreno(p: Project): boolean {
    return Object.values(p.elements).some(isTerrain);
  }

  /** Mensagem da última falha do kernel para o projeto `p` (envio ou consulta recusados), ou `null`. */
  falhou(p: Project): string | null {
    return this.projetoFalho === p ? this.falha : null;
  }

  private registrarFalha(p: Project, e: unknown): void {
    this.projetoFalho = p;
    this.falha = e instanceof Error ? e.message : String(e);
    this.encerrar();
  }

  /** O projeto atual está na cena? Reenvia só a diferença quando mudou. Devolve `false` sem kernel pronto ou com falha. */
  private preparar(p: Project): boolean {
    const ger = this.gerenciador();
    if (!ger || !ger.ligado) return false;
    if (this.projetoFalho === p) return false;
    if (this.cena && this.gerDaCena !== ger) this.encerrar();
    if (this.projeto === p && this.cena) return true;
    try {
      const nova = montarCenaTerreno(p, { anterior: this.atual });
      let mudou: boolean;
      if (!this.cena) {
        this.cena = CenaV2.criar(ger, null);
        this.gerDaCena = ger;
        sincronizarCenaTN(this.cena, null, nova);
        mudou = true;
      } else {
        mudou = sincronizarCenaTN(this.cena, this.atual, nova).length > 0;
      }
      this.cena.definirFonte((c) => sincronizarCenaTN(c, null, nova));
      this.atual = nova;
      this.projeto = p;
      if (mudou) this.memo.clear();
      this.projetoFalho = null;
      return true;
    } catch (e) {
      this.registrarFalha(p, e);
      return false;
    }
  }

  private memoizar<T>(p: Project, chave: string, f: (cena: CenaV2, c: CenaTN) => T): T | null {
    if (!this.preparar(p)) return null;
    if (this.memo.has(chave)) return this.memo.get(chave) as T;
    try {
      const v = f(this.cena!, this.atual!);
      this.memo.set(chave, v);
      return v;
    } catch (e) {
      this.registrarFalha(p, e);
      return null;
    }
  }

  private nivel(c: CenaTN, nivelId: Id | null): number {
    return nivelId === null ? NIVEL_TODOS : (c.nivelDe.get(nivelId) ?? NIVEL_TODOS);
  }

  private static ids(c: CenaTN): { terreno: (n: number) => Id | undefined; regiao: (n: number) => Id | undefined } {
    const t = new Map<number, Id>([...c.terrenoDe.entries()].map(([id, n]) => [n, id]));
    const r = new Map<number, Id>([...c.regiaoDe.entries()].map(([id, n]) => [n, id]));
    return { terreno: (n) => t.get(n), regiao: (n) => r.get(n) };
  }

  /** Malha 3D (superfície, saia e base) de cada terreno. `null` = kernel indisponível. */
  malha(p: Project, superficie: SuperficieTN = 1, nivelId: Id | null = null): MalhaTerreno[] | null {
    return this.memoizar(p, `malha|${superficie}|${nivelId}`, (cena, c) => {
      const s = cena.consultar('terreno_malha', [this.nivel(c, nivelId), superficie]);
      const ids = ServicoTerreno.ids(c);
      return decodificarMalhaTN(s['grupos']!, s['vertices']!, s['indices']!, ids.terreno, ids.regiao);
    });
  }

  /**
   * Curvas de nível (com a marca de mestra) de cada terreno. Cada terreno sai com a tolerância de suavização do seu TIPO (0 = exatas, o padrão): o kernel
   * recebe uma tolerância por consulta, então há uma consulta por tolerância distinta e cada uma fica com os seus terrenos. A tolerância de cada terreno
   * entra na chave de memória: trocar a opção do tipo redesenha.
   */
  curvas(p: Project, superficie: SuperficieTN = 1, nivelId: Id | null = null): CurvaNivelTN[] | null {
    const tols = new Map<Id, number>();
    for (const e of Object.values(p.elements)) if (isTerrain(e)) tols.set(e.id, toleranciaCurvasDoTerreno(p.settings, e));
    const chaveTol = [...tols].filter(([, v]) => v !== 0).map(([id, v]) => `${id}=${v}`).join(',');
    return this.memoizar(p, `curvas|${superficie}|${nivelId}|${chaveTol}`, (cena, c) => {
      const ids = ServicoTerreno.ids(c);
      const distintas = [...new Set([...c.terrenoDe.keys()].map((id) => tols.get(id) ?? 0))].sort((x, y) => x - y);
      const out: CurvaNivelTN[] = [];
      for (const tol of distintas) {
        const s = cena.consultar('terreno_curvas', [this.nivel(c, nivelId), superficie, tol]);
        for (const cv of decodificarCurvasTN(s['linhas']!, s['pontos']!, s['cotas']!, ids.terreno)) if ((tols.get(cv.terrenoId) ?? 0) === tol) out.push(cv);
      }
      if (distintas.length > 1) {
        const ordem = new Map([...c.terrenoDe].map(([id, n]) => [id, n]));
        out.sort((x, y) => (ordem.get(x.terrenoId) ?? 0) - (ordem.get(y.terrenoId) ?? 0));
      }
      return out;
    });
  }

  /** Borda do terreno em planta. */
  planta(p: Project, superficie: SuperficieTN = 1, nivelId: Id | null = null): LinhaPlantaTN[] | null {
    return this.memoizar(p, `planta|${superficie}|${nivelId}`, (cena, c) => {
      const s = cena.consultar('terreno_planta', [this.nivel(c, nivelId), superficie]);
      return decodificarPlantaTN(s['linhas']!, s['pontos']!, ServicoTerreno.ids(c).terreno);
    });
  }

  /** Corte ou elevação: plano que passa por `origem` com a direção `direcao`, olhando até `profundidade`. Coordenadas `(s, z)`. */
  corte(p: Project, origem: { x: number; y: number }, direcao: { x: number; y: number }, profundidade: number, nivelId: Id | null = null): LinhaCorteTN[] | null {
    return this.memoizar(p, `corte|${nivelId}|${origem.x}|${origem.y}|${direcao.x}|${direcao.y}|${profundidade}`, (cena, c) => {
      const s = cena.consultar('terreno_corte', [this.nivel(c, nivelId), origem.x, origem.y, direcao.x, direcao.y, profundidade]);
      return decodificarCorteTN(s['linhas']!, s['pontos']!, ServicoTerreno.ids(c).terreno);
    });
  }

  quantidades(p: Project, nivelId: Id | null = null): QuantidadesTerreno[] | null {
    return this.memoizar(p, `quant|${nivelId}`, (cena, c) => {
      const s = cena.consultar('quant_terreno', [this.nivel(c, nivelId)]);
      return decodificarQuantidadesTN(s['linhas']!, s['valores']!, ServicoTerreno.ids(c).terreno);
    });
  }

  quantidadesRegioes(p: Project, nivelId: Id | null = null): QuantidadesRegiaoTN[] | null {
    return this.memoizar(p, `quantRegioes|${nivelId}`, (cena, c) => {
      const s = cena.consultar('quant_terreno_regioes', [this.nivel(c, nivelId)]);
      const ids = ServicoTerreno.ids(c);
      return decodificarQuantidadesRegioesTN(s['linhas']!, s['valores']!, ids.terreno, ids.regiao);
    });
  }

  mapaCorteAterro(p: Project, nivelId: Id | null = null): MapaCorteAterroTN[] | null {
    return this.memoizar(p, `corteAterro|${nivelId}`, (cena, c) => {
      const s = cena.consultar('terreno_corte_aterro', [this.nivel(c, nivelId)]);
      return decodificarCorteAterroTN(s['grupos']!, s['pontos']!, ServicoTerreno.ids(c).terreno);
    });
  }

  /** Medidas dos avisos do kernel (1 a 6). */
  avisos(p: Project, nivelId: Id | null = null): MedidaAvisoTN[] | null {
    return this.memoizar(p, `avisos|${nivelId}`, (cena, c) => {
      const s = cena.consultar('terreno_avisos', [this.nivel(c, nivelId)]);
      const ids = ServicoTerreno.ids(c);
      return decodificarAvisosTN(s['avisos']!, s['valores']!, ids.terreno, ids.regiao);
    });
  }

  /**
   * Cota e declividade do terreno em cada ponto (A.5, consultas 163 e seção 165). `null` no resultado = kernel indisponível; `null` num ponto = fora de
   * todo terreno. Com terrenos sobrepostos responde o de menor número. A seção das sondas nunca invalida a malha.
   */
  cotaDoTerreno(p: Project, pontos: ReadonlyArray<{ x: number; y: number }>, superficie: SuperficieTN = 1): Array<CotaDoTerreno | null> | null {
    if (!this.preparar(p)) return null;
    try {
      const n = pontos.length;
      this.cena!.definirSecao('terreno_sondas', { id_num: pontos.map((_, i) => i), x: pontos.map((q) => q.x), y: pontos.map((q) => q.y) }, n);
      const s = this.cena!.consultar('terreno_cotas', [superficie]);
      const r = decodificarCotasTN(s['linhas']!, s['valores']!, ServicoTerreno.ids(this.atual!).terreno);
      return Array.from({ length: n }, (_, i) => r[i] ?? null);
    } catch (e) {
      this.registrarFalha(p, e);
      return null;
    }
  }

  /**
   * Avisos para o painel de avisos: `terreno-sem-kernel` (kernel desligado), `terreno-invalido` (o kernel recusou os dados) ou os avisos 1 a 6 do
   * kernel. Vazio quando o projeto não tem terreno.
   */
  avisosDoPainel(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
    if (!ServicoTerreno.temTerreno(p)) return [];
    if (!this.pronto()) return terrenoAvisosSemKernel(p, lang);
    const medidas = this.avisos(p);
    if (medidas === null) return terrenoAvisosInvalido(p, this.falhou(p) ?? 'erro', lang);
    return terrenoAvisosDeGeometria(p, medidas, lang);
  }

  encerrar(): void {
    this.cena?.destruir();
    this.cena = null;
    this.gerDaCena = null;
    this.atual = null;
    this.projeto = null;
    this.memo.clear();
  }
}

/** O projeto tem terreno? (atalho para quem não quer importar a classe) */
export const temTerreno = (p: Project): boolean => ServicoTerreno.temTerreno(p);

let servicoAtual: ServicoTerreno | null = null;
let fonteGerenciador: () => GerenciadorKernelV2 | null = gerenciadorDoKernel;

/** O app liga o serviço ao gerenciador do kernel; testes injetam o deles. Os ouvintes migram para o serviço novo. */
export function definirGerenciadorDoTerreno(f: () => GerenciadorKernelV2 | null): void {
  fonteGerenciador = f;
  const velho = servicoAtual;
  servicoAtual = null;
  velho?.encerrar();
  if (velho) {
    const ouvintes = [...velho['ouvintesPronto']];
    velho['soltarKernel']?.();
    const novo = servicoTerreno();
    for (const o of ouvintes) novo.aoMudarPronto(o);
    ouvintes.forEach((o) => o());
  }
}

/** O serviço único do processo. */
export function servicoTerreno(): ServicoTerreno {
  return (servicoAtual ??= new ServicoTerreno(() => fonteGerenciador()));
}
