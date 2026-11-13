/**
 * Serviço da estrutura (pilar, viga e fundação) sobre o kernel Rust (docs/estrutura/PLANO.md, A.5; ficha R1a): mantém UMA cena do Rust com as seções 19 e
 * 200 a 206 do projeto atual (envio inicial e depois só a diferença por linhas, com cache por assinatura de elemento+tipo+nível) e responde às consultas
 * 200 `estr_malha`, 203 `estr_quant` (quando existir) e 205 `estr_perfil` já decodificadas e traduzidas para ids do projeto. Molde:
 * `kernelGuardaCorpoServico.ts`. Não calcula geometria: sem kernel pronto as consultas devolvem `null` (nada é desenhado; o aviso `estr-sem-kernel`
 * sai pelos avisos do projeto; nunca TypeScript no lugar). As respostas são memorizadas por cena, então 3D, planta e painéis não repetem a consulta.
 *
 * Planta (consulta 201), corte e elevação (202), junções (206) e apoio de snap (207) são da ficha R1b/K4: ainda não são chamadas aqui.
 */
import { CenaV2, ErroKernelLeve, type GerenciadorKernelV2 } from '@hestia/geom';
import type { Id, PerfilForma, Project } from '@hestia/model';
import { gerenciadorDoKernel } from './kernelDespacho.ts';
import { aoMudarKernelPendente } from './kernelPendente.ts';
import { montarCenaEstr, sincronizarCenaEstr, type CenaEstr } from './kernelEstr.ts';
import { argumentosDoPerfil } from './kernelEstrPerfil.ts';
import { COD_ENTRADA, NIVEL_TODOS_ESTR, PARTE_ESTR, type CategoriaEstr, type ParteEstr } from './kernelEstrTabelas.ts';
import { temEstrutura } from './kernelEstrValidade.ts';

/** Um grupo de triângulos de um elemento (uma parte: corpo, base, pescoço ou camadas), com material; posições em metros, cota absoluta. */
export interface ParteMalhaEstr {
  parte: ParteEstr;
  materialId: Id;
  positions: number[];
  indices: number[];
}

export interface MalhaEstrElemento {
  elementId: Id;
  categoria: CategoriaEstr;
  partes: ParteMalhaEstr[];
}

const NOME_CATEGORIA: Record<number, CategoriaEstr> = { 0: 'pilar', 1: 'viga', 2: 'fundacao' };

/**
 * `grupos` `[elemento_num, categoria, parte, material_num, primeiro_indice, n_indices]`, `vertices` `[x, y, z]` e `indices` (absolutos) -> uma
 * entrada por elemento, com uma parte por grupo. Os vértices são compactados por parte. Grupo de elemento desconhecido é ignorado.
 */
export function decodificarMalhaEstr(
  grupos: ArrayLike<number>,
  vertices: ArrayLike<number>,
  indices: ArrayLike<number>,
  elementoIdDe: (categoria: CategoriaEstr, num: number) => Id | undefined,
  materialIdDe: (materialNum: number) => Id,
): MalhaEstrElemento[] {
  const porId = new Map<Id, MalhaEstrElemento>();
  for (let i = 0; i + 5 < grupos.length; i += 6) {
    const categoria = NOME_CATEGORIA[grupos[i + 1]!];
    if (!categoria) continue;
    const id = elementoIdDe(categoria, grupos[i]!);
    if (id === undefined) continue;
    const parte: ParteMalhaEstr = { parte: PARTE_ESTR[grupos[i + 2]!] ?? 'corpo', materialId: materialIdDe(grupos[i + 3]!), positions: [], indices: [] };
    const mapa = new Map<number, number>();
    const ini = grupos[i + 4]!;
    for (let k = ini; k < ini + grupos[i + 5]!; k++) {
      const v = indices[k]!;
      let novo = mapa.get(v);
      if (novo === undefined) {
        novo = parte.positions.length / 3;
        mapa.set(v, novo);
        parte.positions.push(vertices[3 * v]!, vertices[3 * v + 1]!, vertices[3 * v + 2]!);
      }
      parte.indices.push(novo);
    }
    let el = porId.get(id);
    if (!el) porId.set(id, (el = { elementId: id, categoria, partes: [] }));
    el.partes.push(parte);
  }
  return [...porId.values()];
}

/** Quantidades de um elemento (consulta 203): volume (m3), área de forma (m2), comprimento (m) e área da seção (m2). Peso: o modelo não tem densidade ainda. */
export interface LeituraEstrutura {
  volume: number;
  areaForma: number;
  comprimento: number;
  areaSecao: number;
  peso?: number;
}

/** `linhas` `[elemento_num, categoria, tipo_num, material_num]` e `valores` `[volume, area_forma, comprimento, area_secao]` -> por id de elemento. */
export function decodificarQuantEstr(
  linhas: ArrayLike<number>,
  valores: ArrayLike<number>,
  elementoIdDe: (categoria: CategoriaEstr, num: number) => Id | undefined,
): Map<Id, LeituraEstrutura> {
  const out = new Map<Id, LeituraEstrutura>();
  for (let i = 0; i < linhas.length / 4; i++) {
    const categoria = NOME_CATEGORIA[linhas[4 * i + 1]!];
    const id = categoria ? elementoIdDe(categoria, linhas[4 * i]!) : undefined;
    if (id === undefined) continue;
    out.set(id, { volume: valores[4 * i]!, areaForma: valores[4 * i + 1]!, comprimento: valores[4 * i + 2]!, areaSecao: valores[4 * i + 3]! });
  }
  return out;
}

/** Contorno de um perfil (consulta 205): o primeiro anel é o externo, os demais, furos; vértices em metros, no sistema local do perfil. */
export interface ContornoEstr {
  anel: Array<[number, number]>;
  furos: Array<Array<[number, number]>>;
  /** Área líquida dos furos (m2) e perímetro (m), como o kernel mede. */
  area: number;
  perimetro: number;
}

/** `aneis` `[papel, n_pontos]` (0 contorno, 1 furo) e `pontos` `[x, y]` -> contorno. */
export function decodificarContornoEstr(aneis: ArrayLike<number>, pontos: ArrayLike<number>, medidas: ArrayLike<number>): ContornoEstr | null {
  let anel: Array<[number, number]> | null = null;
  const furos: Array<Array<[number, number]>> = [];
  let k = 0;
  for (let i = 0; i + 1 < aneis.length; i += 2) {
    const ring: Array<[number, number]> = [];
    for (let j = 0; j < aneis[i + 1]!; j++, k++) ring.push([pontos[2 * k]!, pontos[2 * k + 1]!]);
    if (aneis[i] === 0 && anel === null) anel = ring;
    else furos.push(ring);
  }
  return anel ? { anel, furos, area: medidas[0] ?? Number.NaN, perimetro: medidas[1] ?? Number.NaN } : null;
}

const LIMITE_CONTORNOS = 256;

export class ServicoEstr {
  private cena: CenaV2 | null = null;
  private atual: CenaEstr | null = null;
  private projeto: Project | null = null;
  private readonly memo = new Map<string, unknown>();
  /** Níveis (`nivel_num`) em que o kernel recusou a consulta com `ENTRADA`: os elementos deles viram `estr-invalida`. */
  private readonly recusadosNivel = new Set<number>();
  /** Gerenciador com o qual a cena atual foi criada (se mudou, a cena é refeita). */
  private gerDaCena: GerenciadorKernelV2 | null = null;
  /** Cena vazia só para a consulta 205 (que não lê a cena) e o gerenciador dela. */
  private cenaPerfil: CenaV2 | null = null;
  private gerDaCenaPerfil: GerenciadorKernelV2 | null = null;
  private readonly contornos = new Map<string, ContornoEstr | null>();
  private prontoVisto = false;
  private readonly ouvintesPronto = new Set<() => void>();
  private soltarKernel: (() => void) | null = null;
  /** A consulta 203 respondeu `NAO_IMPLEMENTADO` (kernel sem K4): não insiste. */
  private quantIndisponivel = false;
  /** Quantas vezes a cena precisou enviar linhas ao Rust (teste de envio por diferença). */
  enviosAoKernel = 0;

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
    this.memo.clear();
    [...this.ouvintesPronto].forEach((f) => f());
  }

  /** O projeto atual está na cena? Reenvia só a diferença quando mudou. Devolve `false` sem kernel pronto ou sem estrutura. */
  private preparar(p: Project): boolean {
    const ger = this.gerenciador();
    if (!ger || !ger.ligado) return false;
    if (this.cena && this.gerDaCena !== ger) this.encerrar();
    if (this.projeto === p && this.cena) return true;
    if (!this.cena && !temEstrutura(p)) return false;
    const nova = montarCenaEstr(p, { anterior: this.atual });
    let mudou: boolean;
    if (!this.cena) {
      this.cena = CenaV2.criar(ger, null);
      this.gerDaCena = ger;
      sincronizarCenaEstr(this.cena, null, nova);
      mudou = true;
    } else {
      mudou = sincronizarCenaEstr(this.cena, this.atual, nova).length > 0;
    }
    if (mudou) this.enviosAoKernel++;
    this.cena.definirFonte((c) => sincronizarCenaEstr(c, null, nova));
    this.atual = nova;
    this.projeto = p;
    // Edição que não mexeu em nenhuma linha (uma parede, uma laje...): as malhas e leituras continuam valendo e nada é recalculado no Rust.
    if (mudou) {
      this.memo.clear();
      this.recusadosNivel.clear();
    }
    return true;
  }

  private memoizar<T>(p: Project, chave: string, f: () => T): T | null {
    if (!this.preparar(p)) return null;
    if (this.memo.has(chave)) return this.memo.get(chave) as T;
    const v = f();
    this.memo.set(chave, v);
    return v;
  }

  /** `nivel_num` de um nível do projeto, ou `NIVEL_TODOS` com `null` (ou nível desconhecido: nada a desenhar). */
  private numDoNivel(nivelId: Id | null): number | null {
    if (nivelId === null) return NIVEL_TODOS_ESTR;
    return this.atual!.nivelDe.get(nivelId) ?? null;
  }

  /**
   * Malha 3D dos pilares, vigas e fundações de um nível (`nivelId`) ou de todos (`null`); `lod` 0 grosso, 1 médio, 2 fino. `null` = kernel indisponível ou
   * consulta recusada (`ENTRADA`: ver `recusados`); `[]` = nada a desenhar (sem estrutura, nível sem elementos). Fundações vêm quando o kernel as entrega.
   */
  malha(p: Project, nivelId: Id | null, lod = 1): MalhaEstrElemento[] | null {
    if (!temEstrutura(p)) return this.pronto() ? [] : null;
    return this.memoizar(p, `malha|${nivelId}|${lod}`, () => {
      const nivel = this.numDoNivel(nivelId);
      if (nivel === null) return [];
      try {
        const s = this.cena!.consultar('estr_malha', [nivel, lod]);
        const c = this.atual!;
        const materiais = new Map<number, Id>([...c.materialDe.entries()].map(([id, n]) => [n, id]));
        return decodificarMalhaEstr(s['grupos']!, s['vertices']!, s['indices']!, (cat, num) => c.idDe[cat].get(num), (n) => materiais.get(n) ?? '');
      } catch (e) {
        if (!(e instanceof ErroKernelLeve)) throw e;
        if (e.codigo === COD_ENTRADA) this.recusadosNivel.add(nivel);
        return null;
      }
    });
  }

  /** Quantidades dos elementos (consulta 203, da K4). `null` enquanto o kernel não as entrega (`NAO_IMPLEMENTADO`) ou está indisponível. */
  leituras(p: Project): Map<Id, LeituraEstrutura> | null {
    if (this.quantIndisponivel || !temEstrutura(p)) return null;
    return this.memoizar(p, 'quant', () => {
      try {
        const s = this.cena!.consultar('estr_quant', [NIVEL_TODOS_ESTR]);
        const c = this.atual!;
        return decodificarQuantEstr(s['linhas']!, s['valores']!, (cat, num) => c.idDe[cat].get(num));
      } catch (e) {
        if (!(e instanceof ErroKernelLeve)) throw e;
        this.quantIndisponivel = e.codigo !== COD_ENTRADA;
        return null;
      }
    });
  }

  /** Ids dos elementos que o kernel recusou (`ENTRADA`) nas consultas feitas até agora, além dos que o TS já deixou de fora. */
  recusados(p: Project): Id[] {
    if (this.projeto !== p || !this.atual || this.recusadosNivel.size === 0) return [];
    const c = this.atual;
    const todos = this.recusadosNivel.has(NIVEL_TODOS_ESTR);
    return [...c.elementos.entries()].filter(([, e]) => e.linha !== null && (todos || this.recusadosNivel.has(c.nivelDe.get(e.nivelId) ?? -1))).map(([id]) => id);
  }

  /** Ids dos elementos que o TS deixou de enviar por inválidos (veja `kernelEstr.ts`); vazio sem cena montada para este projeto. */
  invalidos(p: Project): Id[] {
    return this.projeto === p && this.atual ? this.atual.invalidos : [];
  }

  /** Contorno do perfil pela consulta 205 (prévia 2D dos diálogos). `null` sem kernel ou com perfil inválido (`ENTRADA`). Memorizado por conteúdo. */
  contorno(perfil: PerfilForma): ContornoEstr | null {
    const ger = this.gerenciador();
    if (!ger || !ger.ligado) return null;
    const chave = JSON.stringify(perfil);
    if (this.contornos.has(chave)) return this.contornos.get(chave) ?? null;
    if (this.cenaPerfil && this.gerDaCenaPerfil !== ger) this.soltarCenaPerfil();
    this.cenaPerfil ??= CenaV2.criar(ger, null);
    this.gerDaCenaPerfil = ger;
    let r: ContornoEstr | null = null;
    try {
      const s = this.cenaPerfil.consultar('estr_perfil', argumentosDoPerfil(perfil, NIVEL_TODOS_ESTR));
      r = decodificarContornoEstr(s['aneis']!, s['pontos']!, s['medidas']!);
    } catch (e) {
      if (!(e instanceof ErroKernelLeve)) throw e;
    }
    if (this.contornos.size >= LIMITE_CONTORNOS) this.contornos.clear();
    this.contornos.set(chave, r);
    return r;
  }

  private soltarCenaPerfil(): void {
    try {
      this.cenaPerfil?.destruir();
    } catch {
      // A instância já foi trocada: o handle antigo não existe mais.
    }
    this.cenaPerfil = null;
    this.gerDaCenaPerfil = null;
    this.contornos.clear();
  }

  encerrar(): void {
    this.cena?.destruir();
    this.cena = null;
    this.gerDaCena = null;
    this.atual = null;
    this.projeto = null;
    this.memo.clear();
    this.recusadosNivel.clear();
    this.soltarCenaPerfil();
  }

  /** Ouvintes e assinatura do kernel, para o serviço novo herdar quando o gerenciador é trocado. */
  herdeiroDe(velho: ServicoEstr): void {
    const ouvintes = [...velho.ouvintesPronto];
    velho.soltarKernel?.();
    for (const o of ouvintes) this.aoMudarPronto(o);
    ouvintes.forEach((o) => o());
  }
}

let servicoAtual: ServicoEstr | null = null;
let fonteGerenciador: () => GerenciadorKernelV2 | null = gerenciadorDoKernel;

/** O app liga o serviço ao gerenciador do kernel (`iniciarDespachoKernel`); testes injetam o deles. */
export function definirGerenciadorDaEstrutura(f: () => GerenciadorKernelV2 | null): void {
  fonteGerenciador = f;
  const velho = servicoAtual;
  servicoAtual = null;
  velho?.encerrar();
  if (velho) servicoEstr().herdeiroDe(velho);
}

/** O serviço único do processo. */
export function servicoEstr(): ServicoEstr {
  return (servicoAtual ??= new ServicoEstr(() => fonteGerenciador()));
}

/** Malha 3D de pilares, vigas e fundações de um nível (`null` = todos) pelo kernel (consulta 200); `null` sem kernel. */
export const malhaEstr = (p: Project, nivelId: Id | null, lod = 1): MalhaEstrElemento[] | null => servicoEstr().malha(p, nivelId, lod);

/** Contorno de um perfil pelo kernel (consulta 205); `null` sem kernel ou com perfil inválido. */
export const perfilContornoEstr = (perfil: PerfilForma): ContornoEstr | null => servicoEstr().contorno(perfil);

/** Quantidades de um elemento pelo kernel (consulta 203); `null` enquanto ela não existe ou sem kernel. */
export const leituraEstr = (p: Project, elementId: Id): LeituraEstrutura | null => servicoEstr().leituras(p)?.get(elementId) ?? null;
