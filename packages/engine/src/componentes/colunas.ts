import type { PapelPeca } from '@hestia/model';
import type { PecaResolvida, UsinagemResolvida } from './pecas.ts';

/*
 * Peças resolvidas EM COLUNAS: a forma em que o núcleo Rust as recebe (ADR 0049 §5.1; mesmo princípio da 0046 §2.1: um
 * array tipado por campo, ids internados em u32, só números). FICHA E2-colunas: implementar as quatro funções abaixo.
 * Testes em `colunas.test.ts`. O texto (nomes, material, fita…) NÃO entra nas colunas: vai à parte em `MetaPeca`.
 */

/** Tabela fixa de papéis: o código u8 de um papel é a sua posição aqui. NÃO reordenar (o Rust usa o mesmo código). */
export const PAPEIS: readonly PapelPeca[] = [
  'lateral', 'base', 'topo', 'travessa', 'prateleira', 'divisoria', 'fundo', 'porta', 'frente_gaveta',
  'tampo', 'rodape', 'painel', 'bloco', 'generica',
];
/** Código do eixo: x = 0, y = 1, z = 2. */
export const EIXOS = ['x', 'y', 'z'] as const;

export interface ColunasPecas {
  /** Número de peças. Todos os arrays abaixo têm o tamanho indicado em função de `n`. */
  n: number;
  /** Tabela de ids únicos, na ordem da primeira aparição; `idNum[i]` indexa esta tabela. */
  ids: string[];
  idNum: Uint32Array; // n
  indice: Uint32Array; // n
  papel: Uint8Array; // n  (posição em PAPEIS)
  eixo: Uint8Array; // n  (0 x, 1 y, 2 z)
  vazio: Uint8Array; // n  (0 ou 1)
  origem: Float64Array; // 3n  (x, y, z por peça)
  tamanho: Float64Array; // 2n
  espessura: Float64Array; // n
  extensao: Float64Array; // 3n
  /** Início, em NÚMEROS (não pares), do contorno da peça dentro de `contornoDados`. Peça sem contorno: 0. */
  contornoIni: Uint32Array; // n
  /** Quantidade de PONTOS do contorno da peça; 0 = retângulo `tamanho`. */
  contornoN: Uint32Array; // n
  /** Todos os contornos concatenados, pares (u, v) em m. */
  contornoDados: Float64Array;
  /** Usinagens (FICHA E5-colunas): início, em USINAGENS (não números), das usinagens de cada peça em `usinagemTipo`/`usinagemFace`/`usinagemDados`. */
  usinagemIni: Uint32Array; // n
  /** Quantidade de usinagens da peça. */
  usinagemN: Uint32Array; // n
  /** Código do tipo, 1 por usinagem: 0 furo, 1 rasgo, 2 recorte. */
  usinagemTipo: Uint8Array; // m
  /** Código da face, 1 por usinagem: 0 a, 1 b, 2 n, 3 s, 4 l, 5 o (ver `FACES`). */
  usinagemFace: Uint8Array; // m
  /** 6 números por usinagem, nesta ordem: u, v, diametro, largura, comprimento, profundidade (m; profundidade -1 = passante). */
  usinagemDados: Float64Array; // 6m
}

/** Tabela fixa de faces de usinagem: o código u8 é a posição aqui. */
export const FACES = ['a', 'b', 'n', 's', 'l', 'o'] as const;
/** Tabela fixa de tipos de usinagem: o código u8 é a posição aqui. */
export const TIPOS_USINAGEM = ['furo', 'rasgo', 'recorte'] as const;

/** Texto e metadados de cada peça, na mesma ordem das colunas. Fica no TypeScript; o Rust não vê. */
export interface MetaPeca {
  nome: string;
  material: string | null;
  fita: PecaResolvida['fita'];
  veio: PecaResolvida['veio'];
  grupo: string | null;
  deAninhado: string | null;
  chapa: string | null;
  /** Ids das usinagens da peça, na ordem das colunas. */
  usinagens: string[];
}

/** Converte as peças em colunas. Peça com papel desconhecido: lança `Error('papel desconhecido: …')`. Entrada vazia: `n = 0`. */
export function paraColunas(pecas: readonly PecaResolvida[]): ColunasPecas {
  const n = pecas.length;
  const ids: string[] = [];
  const posicaoDoId = new Map<string, number>();
  const idNum = new Uint32Array(n);
  const indice = new Uint32Array(n);
  const papel = new Uint8Array(n);
  const eixo = new Uint8Array(n);
  const vazio = new Uint8Array(n);
  const origem = new Float64Array(3 * n);
  const tamanho = new Float64Array(2 * n);
  const espessura = new Float64Array(n);
  const extensao = new Float64Array(3 * n);
  const contornoIni = new Uint32Array(n);
  const contornoN = new Uint32Array(n);
  let totalContorno = 0;
  const usinagemIni = new Uint32Array(n);
  const usinagemN = new Uint32Array(n);
  let totalUsinagem = 0;

  for (let i = 0; i < n; i++) {
    const p = pecas[i]!;
    let numeroDoId = posicaoDoId.get(p.id);
    if (numeroDoId === undefined) {
      numeroDoId = ids.length;
      ids.push(p.id);
      posicaoDoId.set(p.id, numeroDoId);
    }
    idNum[i] = numeroDoId;
    indice[i] = p.indice;
    const codigoPapel = PAPEIS.indexOf(p.papel);
    if (codigoPapel < 0) throw new Error(`papel desconhecido: ${p.papel}`);
    papel[i] = codigoPapel;
    const codigoEixo = EIXOS.indexOf(p.eixo);
    if (codigoEixo < 0) throw new Error(`eixo desconhecido: ${p.eixo}`);
    eixo[i] = codigoEixo;
    vazio[i] = p.vazio ? 1 : 0;
    origem.set(p.origem, 3 * i);
    tamanho.set(p.tamanho, 2 * i);
    espessura[i] = p.espessura;
    extensao.set(p.extensao, 3 * i);

    const contorno = p.contorno;
    if (contorno !== null && contorno.length > 0) {
      contornoIni[i] = totalContorno;
      contornoN[i] = contorno.length / 2;
      totalContorno += contorno.length;
    }

    if (p.usinagens.length > 0) {
      usinagemIni[i] = totalUsinagem;
      usinagemN[i] = p.usinagens.length;
      totalUsinagem += p.usinagens.length;
    }
  }

  const contornoDados = new Float64Array(totalContorno);
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const contorno = pecas[i]!.contorno;
    if (contorno === null || contorno.length === 0) continue;
    contornoDados.set(contorno, cursor);
    cursor += contorno.length;
  }

  const usinagemTipo = new Uint8Array(totalUsinagem);
  const usinagemFace = new Uint8Array(totalUsinagem);
  const usinagemDados = new Float64Array(6 * totalUsinagem);
  let cursorUsinagem = 0;
  for (let i = 0; i < n; i++) {
    for (const u of pecas[i]!.usinagens) {
      const codigoTipo = TIPOS_USINAGEM.indexOf(u.tipo);
      if (codigoTipo < 0) throw new Error(`tipo de usinagem desconhecido: ${u.tipo}`);
      const codigoFace = FACES.indexOf(u.face);
      if (codigoFace < 0) throw new Error(`face de usinagem desconhecida: ${u.face}`);
      usinagemTipo[cursorUsinagem] = codigoTipo;
      usinagemFace[cursorUsinagem] = codigoFace;
      const base = 6 * cursorUsinagem;
      usinagemDados[base] = u.u;
      usinagemDados[base + 1] = u.v;
      usinagemDados[base + 2] = u.diametro;
      usinagemDados[base + 3] = u.largura;
      usinagemDados[base + 4] = u.comprimento;
      usinagemDados[base + 5] = u.profundidade;
      cursorUsinagem++;
    }
  }

  return {
    n, ids, idNum, indice, papel, eixo, vazio, origem, tamanho, espessura, extensao, contornoIni, contornoN, contornoDados,
    usinagemIni, usinagemN, usinagemTipo, usinagemFace, usinagemDados,
  };
}

/** Reconstrói as usinagens de uma peça a partir das colunas e dos ids guardados no meta. */
function usinagensDaPeca(c: ColunasPecas, meta: MetaPeca, i: number): UsinagemResolvida[] {
  const inicio = c.usinagemIni[i]!;
  const quantidade = c.usinagemN[i]!;
  const usinagens: UsinagemResolvida[] = [];
  for (let j = 0; j < quantidade; j++) {
    const k = inicio + j;
    const d = 6 * k;
    usinagens.push({
      id: meta.usinagens[j]!,
      tipo: TIPOS_USINAGEM[c.usinagemTipo[k]!]!,
      face: FACES[c.usinagemFace[k]!]!,
      u: c.usinagemDados[d]!,
      v: c.usinagemDados[d + 1]!,
      diametro: c.usinagemDados[d + 2]!,
      largura: c.usinagemDados[d + 3]!,
      comprimento: c.usinagemDados[d + 4]!,
      profundidade: c.usinagemDados[d + 5]!,
    });
  }
  return usinagens;
}

export function metaDasPecas(pecas: readonly PecaResolvida[]): MetaPeca[] {
  return pecas.map((p) => ({
    nome: p.nome,
    material: p.material,
    fita: p.fita === null ? null : { ...p.fita },
    veio: p.veio,
    grupo: p.grupo,
    deAninhado: p.deAninhado,
    chapa: p.chapa,
    usinagens: p.usinagens.map((u) => u.id),
  }));
}

/** Inverso exato de `paraColunas` + `metaDasPecas`: `deColunas(paraColunas(p), metaDasPecas(p))` é igual a `p` (`toEqual`). */
export function deColunas(c: ColunasPecas, meta: readonly MetaPeca[]): PecaResolvida[] {
  const pecas: PecaResolvida[] = [];
  for (let i = 0; i < c.n; i++) {
    const m = meta[i]!;
    const inicio = c.contornoIni[i]!;
    const pontos = c.contornoN[i]!;
    pecas.push({
      id: c.ids[c.idNum[i]!]!,
      nome: m.nome,
      indice: c.indice[i]!,
      papel: PAPEIS[c.papel[i]!]!,
      eixo: EIXOS[c.eixo[i]!]!,
      vazio: c.vazio[i] === 1,
      origem: [c.origem[3 * i]!, c.origem[3 * i + 1]!, c.origem[3 * i + 2]!],
      tamanho: [c.tamanho[2 * i]!, c.tamanho[2 * i + 1]!],
      espessura: c.espessura[i]!,
      extensao: [c.extensao[3 * i]!, c.extensao[3 * i + 1]!, c.extensao[3 * i + 2]!],
      contorno: pontos === 0 ? null : Array.from(c.contornoDados.slice(inicio, inicio + 2 * pontos)),
      material: m.material,
      fita: m.fita === null ? null : { ...m.fita },
      veio: m.veio,
      grupo: m.grupo,
      deAninhado: m.deAninhado,
      chapa: m.chapa,
      usinagens: usinagensDaPeca(c, m, i),
    });
  }
  return pecas;
}

/**
 * Confere a integridade das colunas (o que o lado Rust também confere): `null` se íntegras, senão o motivo em português.
 * Verifica: tamanhos dos arrays coerentes com `n` (3n, 2n…); `idNum[i]` < `ids.length`; `papel[i]` < PAPEIS.length; `eixo[i]` <= 2;
 * `vazio[i]` 0 ou 1; para cada peça `contornoIni + 2 * contornoN` <= `contornoDados.length`; nenhum valor `Float64` não finito.
 */
export function validarColunas(c: ColunasPecas): string | null {
  if (!Number.isInteger(c.n) || c.n < 0) return `n inválido: ${c.n}`;
  const n = c.n;

  const tamanhos: Array<[string, number, number]> = [
    ['idNum', c.idNum.length, n],
    ['indice', c.indice.length, n],
    ['papel', c.papel.length, n],
    ['eixo', c.eixo.length, n],
    ['vazio', c.vazio.length, n],
    ['origem', c.origem.length, 3 * n],
    ['tamanho', c.tamanho.length, 2 * n],
    ['espessura', c.espessura.length, n],
    ['extensao', c.extensao.length, 3 * n],
    ['contornoIni', c.contornoIni.length, n],
    ['contornoN', c.contornoN.length, n],
  ];
  for (const [nome, obtido, esperado] of tamanhos) {
    if (obtido !== esperado) return `${nome} com tamanho ${obtido}; esperado ${esperado}`;
  }

  for (let i = 0; i < n; i++) {
    if (c.idNum[i]! >= c.ids.length) return `idNum[${i}] fora da tabela de ids`;
    if (c.papel[i]! >= PAPEIS.length) return `papel[${i}] com código fora da tabela`;
    if (c.eixo[i]! > 2) return `eixo[${i}] com código fora de x, y, z`;
    if (c.vazio[i]! > 1) return `vazio[${i}] com valor fora de 0 ou 1`;
    if (c.contornoIni[i]! + 2 * c.contornoN[i]! > c.contornoDados.length) return `contorno[${i}] fora do bloco de dados`;
  }

  const tamanhosPorPecaUsinagem: Array<[string, number, number]> = [
    ['usinagemIni', c.usinagemIni.length, n],
    ['usinagemN', c.usinagemN.length, n],
  ];
  for (const [nome, obtido, esperado] of tamanhosPorPecaUsinagem) {
    if (obtido !== esperado) return `${nome} com tamanho ${obtido}; esperado ${esperado}`;
  }

  let totalUsinagem = 0;
  for (let i = 0; i < n; i++) totalUsinagem += c.usinagemN[i]!;

  const tamanhosPorUsinagem: Array<[string, number, number]> = [
    ['usinagemTipo', c.usinagemTipo.length, totalUsinagem],
    ['usinagemFace', c.usinagemFace.length, totalUsinagem],
    ['usinagemDados', c.usinagemDados.length, 6 * totalUsinagem],
  ];
  for (const [nome, obtido, esperado] of tamanhosPorUsinagem) {
    if (obtido !== esperado) return `${nome} com tamanho ${obtido}; esperado ${esperado}`;
  }

  for (let i = 0; i < n; i++) {
    if (c.usinagemIni[i]! + c.usinagemN[i]! > totalUsinagem) return `usinagem[${i}] fora do bloco de usinagens`;
  }
  for (let k = 0; k < totalUsinagem; k++) {
    if (c.usinagemTipo[k]! >= TIPOS_USINAGEM.length) return `usinagemTipo[${k}] com código fora da tabela`;
    if (c.usinagemFace[k]! >= FACES.length) return `usinagemFace[${k}] com código fora da tabela`;
  }

  const blocos: Array<[string, Float64Array]> = [
    ['origem', c.origem],
    ['tamanho', c.tamanho],
    ['espessura', c.espessura],
    ['extensao', c.extensao],
    ['contornoDados', c.contornoDados],
    ['usinagemDados', c.usinagemDados],
  ];
  for (const [nome, bloco] of blocos) {
    if (temValorNaoFinito(bloco)) return `${nome} com valor não finito`;
  }

  return null;
}

function temValorNaoFinito(valores: Float64Array): boolean {
  for (let i = 0; i < valores.length; i++) {
    if (!Number.isFinite(valores[i]!)) return true;
  }
  return false;
}
