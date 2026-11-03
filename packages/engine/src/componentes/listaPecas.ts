import type { Catalogo } from '@hestia/model';
import { areaFace } from './medidas.ts';
import type { FerragemResolvida, PecaResolvida, UsinagemResolvida } from './pecas.ts';
import { numeroComCasas, numeroSemZeros, paraMilimetros } from './listaPecasNumero.ts';

/*
 * Lista de peças de fábrica (ADR 0049 §3.3; método do Promob: lista por módulo com chapa, medidas, veio, fita e usinagem).
 * Testes em `listaPecas.test.ts`. Puras e numéricas. Medidas da lista em MILÍMETROS (como o marceneiro lê), arredondadas a
 * 3 casas; áreas em m2. O texto da família é em mm e as peças resolvidas em metros: converta aqui.
 */

export type VeioNaLista = 'comprimento' | 'largura' | 'livre' | null;
export type LadoFita = 'c1' | 'c2' | 'l1' | 'l2';

export interface LinhaLista {
  /** Nome da primeira peça do grupo e todos os nomes distintos, na ordem em que aparecem. */
  nome: string;
  nomes: string[];
  papel: string;
  /** Quantas peças idênticas o grupo reúne. */
  quantidade: number;
  /** Maior e menor dimensão da chapa (mm); espessura (mm). */
  comprimento: number;
  largura: number;
  espessura: number;
  chapa: string | null;
  material: string | null;
  veio: VeioNaLista;
  /** Fita por lado: c1 e c2 são os lados de COMPRIMENTO, l1 e l2 os de LARGURA (id da fita ou `null`). */
  fita: Record<LadoFita, string | null>;
  /** Usinagens por peça. */
  furos: number;
  rasgos: number;
  recortes: number;
  /** Área de UMA peça (m2), com contorno quando há. */
  area: number;
  /** Ids das peças originais agrupadas (com repetição quando o id repete). */
  ids: string[];
}

interface PecaOrientada {
  comprimento: number;
  largura: number;
  espessura: number;
  fita: Record<LadoFita, string | null>;
  veio: VeioNaLista;
}

interface UsinagemChave {
  tipo: string;
  face: string;
  u: number;
  v: number;
  diametro: number;
  largura: number;
  comprimento: number;
  profundidade: number;
}

function ladoDaFita(p: PecaResolvida, lado: 'n' | 's' | 'l' | 'o'): string | null {
  return p.fita?.[lado] ?? null;
}

/** Reposiciona a peça na orientação da lista: comprimento = maior dimensão, largura = menor. */
function orientar(p: PecaResolvida): PecaOrientada {
  const [a, b] = p.tamanho;
  const maiorNoComprimento = a >= b;
  const fita: Record<LadoFita, string | null> = maiorNoComprimento
    ? { c1: ladoDaFita(p, 's'), c2: ladoDaFita(p, 'n'), l1: ladoDaFita(p, 'o'), l2: ladoDaFita(p, 'l') }
    : { c1: ladoDaFita(p, 'o'), c2: ladoDaFita(p, 'l'), l1: ladoDaFita(p, 's'), l2: ladoDaFita(p, 'n') };
  return {
    comprimento: paraMilimetros(maiorNoComprimento ? a : b),
    largura: paraMilimetros(maiorNoComprimento ? b : a),
    espessura: paraMilimetros(p.espessura),
    fita,
    veio: orientarVeio(p.veio, maiorNoComprimento),
  };
}

function orientarVeio(veio: PecaResolvida['veio'], maiorNoComprimento: boolean): VeioNaLista {
  if (veio === null) return null;
  if (veio === 'livre') return 'livre';
  if (veio === 'a') return maiorNoComprimento ? 'comprimento' : 'largura';
  return maiorNoComprimento ? 'largura' : 'comprimento';
}

function usinagensParaChave(usinagens: readonly UsinagemResolvida[]): UsinagemChave[] {
  return usinagens.map((u) => ({
    tipo: u.tipo,
    face: u.face,
    u: paraMilimetros(u.u),
    v: paraMilimetros(u.v),
    diametro: paraMilimetros(u.diametro),
    largura: paraMilimetros(u.largura),
    comprimento: paraMilimetros(u.comprimento),
    profundidade: paraMilimetros(u.profundidade),
  }));
}

function contarUsinagens(usinagens: readonly UsinagemResolvida[]): { furos: number; rasgos: number; recortes: number } {
  const contagem = { furos: 0, rasgos: 0, recortes: 0 };
  for (const u of usinagens) {
    if (u.tipo === 'furo') contagem.furos++;
    else if (u.tipo === 'rasgo') contagem.rasgos++;
    else contagem.recortes++;
  }
  return contagem;
}

function chaveDoGrupo(p: PecaResolvida, o: PecaOrientada, usinagens: readonly UsinagemChave[]): string {
  return JSON.stringify([
    p.chapa ?? p.material,
    o.espessura,
    o.comprimento,
    o.largura,
    o.veio,
    o.fita.c1,
    o.fita.c2,
    o.fita.l1,
    o.fita.l2,
    usinagens,
  ]);
}

function compararLinhas(a: LinhaLista, b: LinhaLista): number {
  const chaveA = a.chapa ?? a.material ?? '';
  const chaveB = b.chapa ?? b.material ?? '';
  if (chaveA !== chaveB) return chaveA < chaveB ? -1 : 1;
  if (a.espessura !== b.espessura) return b.espessura - a.espessura;
  if (a.comprimento !== b.comprimento) return b.comprimento - a.comprimento;
  if (a.largura !== b.largura) return b.largura - a.largura;
  return a.nome.localeCompare(b.nome);
}

/**
 * Agrupa as peças NÃO vazias em linhas. Orientação: seja `[a, b] = tamanho`. Se `a >= b`: comprimento = a (ao longo de u), largura = b; os lados de comprimento
 * são `s` (c1) e `n` (c2) e os de largura `o` (l1) e `l` (l2). Se `a < b`: comprimento = b (ao longo de v), largura = a; c1 = `o`, c2 = `l`, l1 = `s`, l2 = `n`.
 * `fita` vem de `PecaResolvida.fita` (chaves n, s, l, o) reposicionada nesses 4 lados. `veio`: `PecaResolvida.veio` 'a' (ao longo de u) ou 'b' (ao longo
 * de v) vira 'comprimento' ou 'largura' conforme a orientação; 'livre' → 'livre'; `null` → `null`.
 * Grupo = mesma chave de: chapa (ou material), espessura, comprimento, largura, veio, os 4 lados de fita, e a lista de usinagens (tipo, face, u, v, diametro, largura,
 * comprimento, profundidade, na ordem). Peças idênticas viram uma linha com `quantidade` somada. Ordem das linhas: por `chapa ?? material ?? ''`, depois
 * `espessura` decrescente, `comprimento` decrescente, `largura` decrescente e `nome`. Não altera a entrada.
 */
export function listaDePecas(pecas: readonly PecaResolvida[]): LinhaLista[] {
  const grupos = new Map<string, LinhaLista>();
  for (const p of pecas) {
    if (p.vazio) continue;
    const o = orientar(p);
    const usinagens = usinagensParaChave(p.usinagens);
    const chave = chaveDoGrupo(p, o, usinagens);
    const existente = grupos.get(chave);
    if (existente !== undefined) {
      existente.quantidade++;
      if (!existente.nomes.includes(p.nome)) existente.nomes.push(p.nome);
      existente.ids.push(p.id);
      continue;
    }
    const contagem = contarUsinagens(p.usinagens);
    grupos.set(chave, {
      nome: p.nome,
      nomes: [p.nome],
      papel: p.papel,
      quantidade: 1,
      comprimento: o.comprimento,
      largura: o.largura,
      espessura: o.espessura,
      chapa: p.chapa,
      material: p.material,
      veio: o.veio,
      fita: o.fita,
      furos: contagem.furos,
      rasgos: contagem.rasgos,
      recortes: contagem.recortes,
      area: areaFace(p),
      ids: [p.id],
    });
  }
  return [...grupos.values()].sort(compararLinhas);
}

export interface ResumoLista {
  totalPecas: number;
  /** m2 somados (quantidade × área). */
  areaM2: number;
  /** Por chapa (id ou `null`) e espessura (mm), ordenado por id (nulo por último) e espessura. */
  porChapa: Array<{ chapa: string | null; espessura: number; area: number; pecas: number }>;
  /** Metros de cada fita, ordenado por id: soma de quantidade × comprimento (ou largura) dos lados com fita. */
  fitaMetros: Array<{ fita: string; metros: number }>;
  usinagens: { furos: number; rasgos: number; recortes: number };
}

function compararChapa(
  a: { chapa: string | null; espessura: number },
  b: { chapa: string | null; espessura: number },
): number {
  if (a.chapa !== null && b.chapa !== null && a.chapa !== b.chapa) return a.chapa < b.chapa ? -1 : 1;
  if (a.chapa === null && b.chapa !== null) return 1;
  if (a.chapa !== null && b.chapa === null) return -1;
  return a.espessura - b.espessura;
}

const LADOS: readonly LadoFita[] = ['c1', 'c2', 'l1', 'l2'];

export function resumirLista(linhas: readonly LinhaLista[]): ResumoLista {
  let totalPecas = 0;
  let areaM2 = 0;
  const porChapa = new Map<string, { chapa: string | null; espessura: number; area: number; pecas: number }>();
  const fitas = new Map<string, number>();
  const usinagens = { furos: 0, rasgos: 0, recortes: 0 };
  for (const l of linhas) {
    const area = l.quantidade * l.area;
    totalPecas += l.quantidade;
    areaM2 += area;
    const chave = JSON.stringify([l.chapa, l.espessura]);
    const item = porChapa.get(chave);
    if (item !== undefined) {
      item.area += area;
      item.pecas += l.quantidade;
    } else {
      porChapa.set(chave, { chapa: l.chapa, espessura: l.espessura, area, pecas: l.quantidade });
    }
    for (const lado of LADOS) {
      const fita = l.fita[lado];
      if (fita === null) continue;
      const medida = lado === 'c1' || lado === 'c2' ? l.comprimento : l.largura;
      fitas.set(fita, (fitas.get(fita) ?? 0) + (l.quantidade * medida) / 1000);
    }
    usinagens.furos += l.furos * l.quantidade;
    usinagens.rasgos += l.rasgos * l.quantidade;
    usinagens.recortes += l.recortes * l.quantidade;
  }
  return {
    totalPecas,
    areaM2,
    porChapa: [...porChapa.values()].sort(compararChapa),
    fitaMetros: [...fitas.entries()]
      .map(([fita, metros]) => ({ fita, metros }))
      .sort((a, b) => a.fita.localeCompare(b.fita)),
    usinagens,
  };
}

export interface CustoEstimado {
  chapas: number;
  fitas: number;
  ferragens: number;
  total: number;
}

function arredondar2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Custo estimado em reais. Chapas: área por chapa × (1 + `perdaChapa`) × `custoM2` do catálogo (chapa sem custo ou fora do catálogo não custa). Fitas: metros × (1 + `perdaFita`) × `custoM`.
 * Ferragens: quantidade × (`custo` da própria ferragem, senão `custo` do catálogo com o mesmo id, senão 0). Padrões: perdaChapa 0.15, perdaFita 0.10.
 * Arredonde cada parcela a 2 casas e some as parcelas arredondadas em `total`.
 */
export function custoEstimado(resumo: ResumoLista, catalogo: Catalogo, ferragens: readonly FerragemResolvida[], perdas: { perdaChapa?: number; perdaFita?: number } = {}): CustoEstimado {
  const perdaChapa = perdas.perdaChapa ?? 0.15;
  const perdaFita = perdas.perdaFita ?? 0.1;
  let chapas = 0;
  for (const item of resumo.porChapa) {
    if (item.chapa === null) continue;
    const chapa = catalogo.chapas.find((ch) => ch.id === item.chapa);
    if (chapa?.custoM2 === undefined) continue;
    chapas += item.area * (1 + perdaChapa) * chapa.custoM2;
  }
  let fitas = 0;
  for (const item of resumo.fitaMetros) {
    const fita = catalogo.fitas.find((f) => f.id === item.fita);
    if (fita?.custoM === undefined) continue;
    fitas += item.metros * (1 + perdaFita) * fita.custoM;
  }
  let custoFerragens = 0;
  for (const ferragem of ferragens) {
    const doCatalogo = catalogo.ferragens.find((f) => f.id === ferragem.id)?.custo ?? 0;
    custoFerragens += ferragem.quantidade * (ferragem.custo ?? doCatalogo);
  }
  const parcelas = { chapas: arredondar2(chapas), fitas: arredondar2(fitas), ferragens: arredondar2(custoFerragens) };
  return { ...parcelas, total: arredondar2(parcelas.chapas + parcelas.fitas + parcelas.ferragens) };
}

const CABECALHO_CSV = 'Qtd;Peça;Papel;Chapa;Material;Comprimento;Largura;Espessura;Veio;Fita C1;Fita C2;Fita L1;Fita L2;Furos;Rasgos;Recortes;Área';

function campoCsv(valor: string): string {
  if (!/[;"\n\r]/.test(valor)) return valor;
  return `"${valor.replace(/"/g, '""')}"`;
}

/**
 * CSV da lista para o otimizador de corte e a planilha: separador `;`, decimal com vírgula, quebra de linha `\n`, texto entre aspas duplas quando contém `;`, `"` ou
 * quebra (aspas duplicadas). Cabeçalho (nesta ordem): Qtd;Peça;Papel;Chapa;Material;Comprimento;Largura;Espessura;Veio;Fita C1;Fita C2;Fita L1;Fita L2;Furos;Rasgos;Recortes;Área.
 * Números: medidas em mm com até 3 casas sem zeros à toa ("764", "12,5"), área em m2 com 4 casas ("0,3920"). `null` vira vazio. Uma linha por `LinhaLista`.
 */
export function listaPecasCsv(linhas: readonly LinhaLista[]): string {
  const corpo = linhas.map((l) => {
    const campos = [
      String(l.quantidade),
      l.nomes.join(' / '),
      l.papel,
      l.chapa ?? '',
      l.material ?? '',
      numeroSemZeros(l.comprimento, 3),
      numeroSemZeros(l.largura, 3),
      numeroSemZeros(l.espessura, 3),
      l.veio ?? '',
      l.fita.c1 ?? '',
      l.fita.c2 ?? '',
      l.fita.l1 ?? '',
      l.fita.l2 ?? '',
      String(l.furos),
      String(l.rasgos),
      String(l.recortes),
      numeroComCasas(l.area, 4),
    ];
    return campos.map(campoCsv).join(';');
  });
  return [CABECALHO_CSV, ...corpo].join('\n');
}

/** Etiqueta de uma linha para impressão: texto de 3 linhas — `"<nome>"`, `"<comprimento> x <largura> x <espessura> mm  |  <chapa ou material>"` e `"Fita: C1 <x> C2 <x> L1 <x> L2 <x>  |  Veio: <x>"` (vazio = "-"); medidas sem zeros à toa. */
export function etiquetaDaLinha(l: LinhaLista): string[] {
  const identificacao = l.chapa ?? l.material ?? '-';
  const dimensoes = `${numeroSemZeros(l.comprimento, 3)} x ${numeroSemZeros(l.largura, 3)} x ${numeroSemZeros(l.espessura, 3)} mm  |  ${identificacao}`;
  const fita = `Fita: C1 ${l.fita.c1 ?? '-'} C2 ${l.fita.c2 ?? '-'} L1 ${l.fita.l1 ?? '-'} L2 ${l.fita.l2 ?? '-'}`;
  const veio = `Veio: ${l.veio ?? '-'}`;
  return [l.nome, dimensoes, `${fita}  |  ${veio}`];
}
