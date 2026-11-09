/**
 * Serviço do guarda-corpo sobre o kernel Rust (decisão 0055, integração): mantém UMA cena do Rust com as seções 60 a 81 do projeto atual
 * (envio inicial e depois só a diferença por linhas) e responde às consultas 61 a 65 já decodificadas e traduzidas para ids do projeto.
 * Não calcula geometria: tudo vem do Rust. Os resultados são memorizados por projeto (identidade do objeto) para a 3D, a planta e o IFC
 * não repetirem a mesma consulta a cada quadro.
 */
import { CenaV2, type GerenciadorKernelV2 } from '@hestia/geom';
import { isGuardaCorpo, type Id, type Project } from '@hestia/model';
import { decodificarLinhasGC, type LinhaVistaGC } from './guardaCorpoVista.ts';
import { decodificarQuantidadesGC, guardaCorpoQuantities, PAPEL_GC, type EixoGC, type GuardaCorpoQuantities, type PapelGC } from './guardaCorpoQuantities.ts';
import { CODIGO_AVISO_GC, type MedidaAvisoGC } from './guardaCorpoIssues.ts';
import { gerenciadorDoKernel } from './kernelDespacho.ts';
import { montarCenaGC, sincronizarCenaGC, type CenaGC } from './kernelGuardaCorpo.ts';

const NIVEL_TODOS = 4294967295;

/** Um grupo de peças do mesmo papel e material de um guarda-corpo (posições em metros, cota absoluta). */
export interface ParteMalhaGC {
  papel: PapelGC;
  materialId: Id;
  positions: number[];
  indices: number[];
  /** Quantas peças (grupos do Rust) foram juntadas. */
  pecas: number;
}

export interface MalhaGuardaCorpo {
  guardaId: Id;
  partes: ParteMalhaGC[];
}

const NOME_PAPEL: Record<number, PapelGC> = Object.fromEntries(Object.entries(PAPEL_GC).map(([k, v]) => [v, k as PapelGC]));

/**
 * `grupos` `[guarda_num, papel, material_num, primeiro_indice, n_indices]`, `vertices` `[x, y, z]` e `indices` -> uma parte por (guarda, papel, material).
 * Os vértices são compactados por parte (cada parte leva só os que usa).
 */
export function decodificarMalhaGC(
  grupos: ArrayLike<number>,
  vertices: ArrayLike<number>,
  indices: ArrayLike<number>,
  guardaIdDe: (guardaNum: number) => Id | undefined,
  materialIdDe: (materialNum: number) => Id,
): MalhaGuardaCorpo[] {
  const porGuarda = new Map<Id, Map<string, { parte: ParteMalhaGC; mapa: Map<number, number> }>>();
  for (let i = 0; i + 4 < grupos.length; i += 5) {
    const id = guardaIdDe(grupos[i]!);
    if (id === undefined) continue;
    const papel = NOME_PAPEL[grupos[i + 1]!] ?? 'poste';
    const matNum = grupos[i + 2]!;
    const chave = `${papel}|${matNum}`;
    let mapaGuarda = porGuarda.get(id);
    if (!mapaGuarda) porGuarda.set(id, (mapaGuarda = new Map()));
    let alvo = mapaGuarda.get(chave);
    if (!alvo) mapaGuarda.set(chave, (alvo = { parte: { papel, materialId: materialIdDe(matNum), positions: [], indices: [], pecas: 0 }, mapa: new Map() }));
    alvo.parte.pecas++;
    const ini = grupos[i + 3]!;
    const n = grupos[i + 4]!;
    for (let k = ini; k < ini + n; k++) {
      const v = indices[k]!;
      let novo = alvo.mapa.get(v);
      if (novo === undefined) {
        novo = alvo.parte.positions.length / 3;
        alvo.mapa.set(v, novo);
        alvo.parte.positions.push(vertices[3 * v]!, vertices[3 * v + 1]!, vertices[3 * v + 2]!);
      }
      alvo.parte.indices.push(novo);
    }
  }
  return [...porGuarda.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([guardaId, m]) => ({ guardaId, partes: [...m.values()].map((x) => x.parte) }));
}

export function decodificarAvisosGC(avisos: ArrayLike<number>, valores: ArrayLike<number>, guardaIdDe: (n: number) => Id | undefined): MedidaAvisoGC[] {
  const out: MedidaAvisoGC[] = [];
  for (let i = 0; i < avisos.length / 4; i++) {
    const guardaId = guardaIdDe(avisos[4 * i]!);
    if (guardaId === undefined || !CODIGO_AVISO_GC[avisos[4 * i + 1]!]) continue;
    out.push({
      guardaId,
      codigo: avisos[4 * i + 1]!,
      trecho: avisos[4 * i + 2]!,
      indice: avisos[4 * i + 3]!,
      medido: valores[5 * i]!,
      limite: valores[5 * i + 1]!,
      x: valores[5 * i + 2]!,
      y: valores[5 * i + 3]!,
      z: valores[5 * i + 4]!,
    });
  }
  return out;
}

/** Eixos (`guarda_caminhos`) para o comprimento desenvolvido das quantidades. */
export function decodificarEixosGC(trechos: ArrayLike<number>, nos: ArrayLike<number>, guardaIdDe: (n: number) => Id | undefined): EixoGC[] {
  const porId = new Map<Id, EixoGC>();
  let ini = 0;
  for (let i = 0; i < trechos.length / 5; i++) {
    const n = trechos[5 * i + 3]!;
    const id = guardaIdDe(trechos[5 * i]!);
    if (id !== undefined) {
      const e = porId.get(id) ?? { guardaId: id, trechos: [] };
      e.trechos.push(Array.from({ length: n }, (_, j) => ({ x: nos[3 * (ini + j)]!, y: nos[3 * (ini + j) + 1]!, z: nos[3 * (ini + j) + 2]! })));
      porId.set(id, e);
    }
    ini += n;
  }
  return [...porId.values()];
}

export class ServicoGuardaCorpo {
  private cena: CenaV2 | null = null;
  private atual: CenaGC | null = null;
  private projeto: Project | null = null;
  private readonly memo = new Map<string, unknown>();

  constructor(private readonly gerenciador: () => GerenciadorKernelV2 | null) {}

  /** Há algum guarda-corpo no projeto? (evita criar a cena à toa) */
  static temGuardaCorpo(p: Project): boolean {
    return Object.values(p.elements).some(isGuardaCorpo);
  }

  /** O projeto atual está na cena? Reenvia só a diferença quando mudou. Devolve `false` sem kernel pronto. */
  private preparar(p: Project): boolean {
    if (this.projeto === p && this.cena) return true;
    const ger = this.gerenciador();
    if (!ger || !ger.ligado) return false;
    const nova = montarCenaGC(p, { anterior: this.atual });
    if (!this.cena) {
      this.cena = CenaV2.criar(ger, null);
      sincronizarCenaGC(this.cena, null, nova);
    } else {
      sincronizarCenaGC(this.cena, this.atual, nova);
    }
    this.cena.definirFonte((c) => sincronizarCenaGC(c, null, nova));
    this.atual = nova;
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

  private ids(): { guardaIdDe: (n: number) => Id | undefined; materialIdDe: (n: number, p: Project) => Id } {
    const c = this.atual!;
    const guardas = new Map<number, Id>([...c.guardaDe.entries()].map(([id, n]) => [n, id]));
    const materiais = new Map<number, Id>([...c.materialDe.entries()].map(([id, n]) => [n, id]));
    return {
      guardaIdDe: (n) => guardas.get(n),
      materialIdDe: (n, p) => materiais.get(n) ?? (p.materials['mat_aco'] ? 'mat_aco' : (Object.keys(p.materials)[0] ?? 'mat_aco')),
    };
  }

  /** Malha 3D de todos os guarda-corpos (`lod` 0 grosso, 1 médio, 2 fino). `null` = kernel indisponível. */
  malhas(p: Project, lod = 1): MalhaGuardaCorpo[] | null {
    return this.memoizar(p, `malha${lod}`, () => {
      const s = this.cena!.consultar('guarda_malha', [NIVEL_TODOS, lod]);
      const { guardaIdDe, materialIdDe } = this.ids();
      return decodificarMalhaGC(s['grupos']!, s['vertices']!, s['indices']!, guardaIdDe, (n) => materialIdDe(n, p));
    });
  }

  /** Linhas de planta de um nível (`nivelId`) ou de todos (`null`). */
  planta(p: Project, nivelId: Id | null, corteZ: number, detalhe = 1): LinhaVistaGC[] | null {
    return this.memoizar(p, `planta|${nivelId}|${corteZ}|${detalhe}`, () => {
      const nivel = nivelId === null ? NIVEL_TODOS : (this.atual!.nivelDe.get(nivelId) ?? NIVEL_TODOS);
      const s = this.cena!.consultar('guarda_planta', [nivel, corteZ, detalhe]);
      return decodificarLinhasGC(s['linhas']!, s['pontos']!, this.ids().guardaIdDe);
    });
  }

  /** Linhas de corte ou elevação: coordenadas `(s, z)`; `poligonos` traz os perfis cortados. */
  corte(p: Project, nivelId: Id | null, ox: number, oy: number, dx: number, dy: number, profundidade: number): { linhas: LinhaVistaGC[]; poligonos: number[] } | null {
    return this.memoizar(p, `corte|${nivelId}|${ox}|${oy}|${dx}|${dy}|${profundidade}`, () => {
      const nivel = nivelId === null ? NIVEL_TODOS : (this.atual!.nivelDe.get(nivelId) ?? NIVEL_TODOS);
      const s = this.cena!.consultar('guarda_corte', [nivel, ox, oy, dx, dy, profundidade]);
      return { linhas: decodificarLinhasGC(s['linhas']!, s['pontos']!, this.ids().guardaIdDe), poligonos: Array.from(s['poligonos']!) };
    });
  }

  /** Eixo (polilinhas 3D dos trechos) de cada guarda-corpo, de `guarda_caminhos`. */
  eixos(p: Project): EixoGC[] | null {
    return this.memoizar(p, 'eixos', () => {
      const e = this.cena!.consultar('guarda_caminhos', [NIVEL_TODOS, 1e-3]);
      return decodificarEixosGC(e['trechos']!, e['nos']!, this.ids().guardaIdDe);
    });
  }

  quantidades(p: Project): GuardaCorpoQuantities[] | null {
    return this.memoizar(p, 'quant', () => {
      const { guardaIdDe } = this.ids();
      const q = this.cena!.consultar('quant_guarda', [NIVEL_TODOS]);
      const e = this.cena!.consultar('guarda_caminhos', [NIVEL_TODOS, 1e-3]);
      return guardaCorpoQuantities(p, decodificarQuantidadesGC(q, this.atual!), decodificarEixosGC(e['trechos']!, e['nos']!, guardaIdDe));
    });
  }

  avisos(p: Project): MedidaAvisoGC[] | null {
    return this.memoizar(p, 'avisos', () => {
      const s = this.cena!.consultar('guarda_avisos', [NIVEL_TODOS, this.atual!.normaProjetoNum]);
      return decodificarAvisosGC(s['avisos']!, s['valores']!, this.ids().guardaIdDe);
    });
  }

  encerrar(): void {
    this.cena?.destruir();
    this.cena = null;
    this.atual = null;
    this.projeto = null;
    this.memo.clear();
  }
}

let servicoAtual: ServicoGuardaCorpo | null = null;
let fonteGerenciador: () => GerenciadorKernelV2 | null = gerenciadorDoKernel;

/** O app liga o serviço ao gerenciador do kernel (`iniciarDespachoKernel`); testes injetam o deles. */
export function definirGerenciadorDoGuardaCorpo(f: () => GerenciadorKernelV2 | null): void {
  fonteGerenciador = f;
  servicoAtual?.encerrar();
  servicoAtual = null;
}

/** O serviço único do processo. */
export function servicoGuardaCorpo(): ServicoGuardaCorpo {
  return (servicoAtual ??= new ServicoGuardaCorpo(() => fonteGerenciador()));
}
