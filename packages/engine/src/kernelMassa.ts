/**
 * Adaptador da massa conceitual para o kernel Rust (plano de massa, A.5; esquema v19: seções 140 a 142 e a `niveis` que a consulta 142 lê). NÃO
 * calcula geometria: monta as colunas das seções a partir de uma entrada neutra (`EntradaMassaKernel`, já em números do kernel) e envia só a
 * diferença quando a cena já existe. Os nomes e as colunas vêm do esquema gerado do JSON (`esquema.gerado.ts`), não são escritos à mão.
 *
 * Numeração estável: cada massa, cada seção e cada ponto de perfil livre tem um `id_num` internado por chave textual. Passando a montagem anterior,
 * as chaves que já existiam mantêm o número; assim editar uma massa só muda as linhas dela (A.8 item 4). A leitura das saídas das consultas
 * fica em `massaServico.ts`.
 */
import type { CenaV2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import { SECOES } from '../../geom/src/kernel/v2/esquema.gerado.ts';

/** Forma do perfil no kernel (`forma` da seção 141). */
export const FORMA_MASSA = { circulo: 0, elipse: 1, poligono: 2, livre: 3 } as const;

/** Interpolação entre seções (`interp` da seção 140). */
export const INTERP_MASSA = { linear: 0, suave: 1 } as const;

/** Códigos dos avisos de `massa_avisos` (consulta 145), como o kernel os numera. */
export const AVISO_MASSA = { anelAutointersecta: 1, copiasSobrepostas: 2, limite: 3, faceInclinada: 4 } as const;

/** Papel de cada faixa da malha (consulta 140, `grupos[2]`). */
export const PAPEL_MALHA_MASSA = { lateral: 0, base: 1, topo: 2 } as const;

/** Estilo de cada linha de planta (consulta 141, `linhas[2]`). */
export const ESTILO_PLANTA_MASSA = { cortado: 0, projetado: 1, acima: 2 } as const;

/** Estilo de cada linha de corte (consulta 143, `linhas[2]`). */
export const ESTILO_CORTE_MASSA = { cortado: 0, projetado: 1, feicao: 3 } as const;

/** Seções de entrada da massa, com as colunas do esquema gerado. */
export const NOMES_SECOES_MASSA = ['massas', 'massa_secoes', 'massa_pontos', 'niveis'] as const;
export type NomeSecaoMassa = (typeof NOMES_SECOES_MASSA)[number];

type Colunas = Record<string, number[]>;

const colunasDe = (nome: NomeSecaoMassa): string[] => SECOES[nome].colunas.map((c) => c.nome);
const COLUNAS: Record<NomeSecaoMassa, string[]> = {
  massas: colunasDe('massas'),
  massa_secoes: colunasDe('massa_secoes'),
  massa_pontos: colunasDe('massa_pontos'),
  niveis: colunasDe('niveis'),
};

export interface PontoKernelMassa {
  x: number;
  y: number;
}

/** Uma seção como o kernel a lê: `forma` é `FORMA_MASSA`; `pontos` só no perfil livre (seção 142). */
export interface SecaoKernelMassa {
  z: number;
  forma: number;
  p1: number;
  p2: number;
  lados: number;
  rot: number;
  escala: number;
  dx: number;
  dy: number;
  pontos: PontoKernelMassa[];
}

/** Uma massa já em números do kernel. `nivelNum` é o `nivel_num` da seção `niveis`; `zBase` é a cota absoluta da base. */
export interface MassaKernel {
  id: Id;
  nivelNum: number;
  ox: number;
  oy: number;
  zBase: number;
  interp: number;
  resolucao: number;
  arranjo: { n: number; cx: number; cy: number; ang: number } | null;
  secoes: SecaoKernelMassa[];
}

export interface EntradaMassaKernel {
  massas: MassaKernel[];
  /** Cota de cada nível, na ordem do projeto (índice = `nivel_num`). */
  cotas: number[];
}

interface Internador {
  mapa: Map<string, number>;
  proximo: number;
}

/** Números internados: massa, seção e ponto de perfil. */
export interface NumerosMassa {
  massa: Internador;
  secao: Internador;
  ponto: Internador;
}

export interface CenaMassa {
  secoes: Record<NomeSecaoMassa, Colunas>;
  nLinhas: Record<NomeSecaoMassa, number>;
  /** Id da massa no projeto -> `massa_num` (o `id_num` da seção 140). */
  massaDe: Map<Id, number>;
  numeros: NumerosMassa;
}

const novoInternador = (): Internador => ({ mapa: new Map(), proximo: 1 });
const copiaInternador = (i: Internador | undefined): Internador => (i ? { mapa: new Map(i.mapa), proximo: i.proximo } : novoInternador());

function numero(it: Internador, chave: string): number {
  let n = it.mapa.get(chave);
  if (n === undefined) {
    n = it.proximo++;
    it.mapa.set(chave, n);
  }
  return n;
}

const colunasVazias = (): Record<NomeSecaoMassa, Colunas> =>
  Object.fromEntries(NOMES_SECOES_MASSA.map((n) => [n, Object.fromEntries(COLUNAS[n].map((c) => [c, [] as number[]]))])) as Record<NomeSecaoMassa, Colunas>;

/** Seções 140 a 142 e `niveis` a partir da entrada. `anterior` mantém os números das chaves que já existiam. */
export function montarCenaMassa(e: EntradaMassaKernel, anterior?: CenaMassa): CenaMassa {
  const secoes = colunasVazias();
  const nLinhas = Object.fromEntries(NOMES_SECOES_MASSA.map((n) => [n, 0])) as Record<NomeSecaoMassa, number>;
  const numeros: NumerosMassa = {
    massa: copiaInternador(anterior?.numeros.massa),
    secao: copiaInternador(anterior?.numeros.secao),
    ponto: copiaInternador(anterior?.numeros.ponto),
  };
  const push = (nome: NomeSecaoMassa, valores: Record<string, number>): void => {
    for (const c of COLUNAS[nome]) {
      const v = valores[c];
      if (v === undefined) throw new Error(`kernelMassa: falta a coluna ${nome}.${c}`);
      secoes[nome][c]!.push(v);
    }
    nLinhas[nome]++;
  };
  const massaDe = new Map<Id, number>();
  for (const m of e.massas) {
    const num = numero(numeros.massa, m.id);
    massaDe.set(m.id, num);
    push('massas', {
      id_num: num,
      nivel_num: m.nivelNum,
      ox: m.ox,
      oy: m.oy,
      z_base: m.zBase,
      interp: m.interp,
      resolucao: m.resolucao,
      arr_n: m.arranjo?.n ?? 1,
      arr_cx: m.arranjo?.cx ?? 0,
      arr_cy: m.arranjo?.cy ?? 0,
      arr_ang: m.arranjo?.ang ?? 0,
    });
    m.secoes.forEach((s, ordem) => {
      const chave = `${m.id}#${ordem}`;
      const secao = numero(numeros.secao, chave);
      push('massa_secoes', {
        id_num: secao,
        massa_num: num,
        ordem,
        z: s.z,
        forma: s.forma,
        p1: s.p1,
        p2: s.p2,
        lados: s.lados,
        rot: s.rot,
        escala: s.escala,
        dx: s.dx,
        dy: s.dy,
      });
      s.pontos.forEach((q, k) => push('massa_pontos', { id_num: numero(numeros.ponto, `${chave}#${k}`), secao_num: secao, ordem: k, x: q.x, y: q.y }));
    });
  }
  e.cotas.forEach((cota, i) => push('niveis', { id_num: i + 1, nivel_num: i, cota }));
  return { secoes, nLinhas, massaDe, numeros };
}

/** Uma seção que muda de conteúdo (ou entra) é um upsert; as que saem vão em `remover` (`id_num`). */
export interface DiferencaSecaoMassa {
  secao: NomeSecaoMassa;
  upsert: Colunas;
  nUpsert: number;
  remover: number[];
}

const linhaDe = (cols: Colunas, nomes: readonly string[], i: number): string => nomes.map((c) => String(cols[c]![i]!)).join('|');

/** O que mudou de `antes` para `depois`, por seção. `antes` nulo = tudo é novo. Só seções com mudança aparecem. */
export function diferencaMassa(antes: CenaMassa | null, depois: CenaMassa): DiferencaSecaoMassa[] {
  const saida: DiferencaSecaoMassa[] = [];
  for (const nome of NOMES_SECOES_MASSA) {
    const nomes = COLUNAS[nome];
    const velhas = new Map<number, string>();
    if (antes) for (let i = 0; i < antes.nLinhas[nome]; i++) velhas.set(antes.secoes[nome]['id_num']![i]!, linhaDe(antes.secoes[nome], nomes, i));
    const upsert: Colunas = Object.fromEntries(nomes.map((c) => [c, [] as number[]]));
    let nUpsert = 0;
    const vistas = new Set<number>();
    for (let i = 0; i < depois.nLinhas[nome]; i++) {
      const id = depois.secoes[nome]['id_num']![i]!;
      vistas.add(id);
      if (velhas.get(id) === linhaDe(depois.secoes[nome], nomes, i)) continue;
      for (const c of nomes) upsert[c]!.push(depois.secoes[nome][c]![i]!);
      nUpsert++;
    }
    const remover = [...velhas.keys()].filter((id) => !vistas.has(id));
    if (nUpsert > 0 || remover.length > 0) saida.push({ secao: nome, upsert, nUpsert, remover });
  }
  return saida;
}

/** Envia todas as seções à cena (substitui o que o Rust tinha). */
export function enviarCenaMassa(cena: CenaV2, c: CenaMassa): void {
  for (const nome of NOMES_SECOES_MASSA) cena.definirSecao(nome, c.secoes[nome], c.nLinhas[nome]);
}

/** Aplica a diferença: remove o que sumiu e depois insere o novo ou alterado. Só as seções que mudaram são tocadas. */
export function aplicarDiferencaMassa(cena: CenaV2, d: readonly DiferencaSecaoMassa[]): void {
  for (const s of d) if (s.remover.length > 0) cena.remover(s.secao, s.remover);
  for (const s of d) if (s.nUpsert > 0) cena.upsert(s.secao, s.upsert, s.nUpsert);
}

/** Sem `antes`, envia tudo; com `antes`, só a diferença. */
export function sincronizarCenaMassa(cena: CenaV2, antes: CenaMassa | null, depois: CenaMassa): void {
  if (!antes) enviarCenaMassa(cena, depois);
  else aplicarDiferencaMassa(cena, diferencaMassa(antes, depois));
}
