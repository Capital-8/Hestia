import type { Id } from '@hestia/model';

/**
 * Saídas das consultas do terreno (A.5, consultas 160 a 164 e 167) decodificadas para ids do projeto. Nada aqui calcula geometria: só lê as colunas
 * planas que o Rust devolve. Em planta as coordenadas são `(x, y)`; no corte e na elevação, `(s, z)`. Número que o projeto não conhece (terreno ou
 * região apagados entre a consulta e a decodificação) é ignorado.
 */
const AUSENTE = 0xffffffff;

export type PapelMalhaTN = 'superficie' | 'saia' | 'base';
const PAPEL_MALHA: readonly PapelMalhaTN[] = ['superficie', 'saia', 'base'];

/** Triângulos de um terreno com o mesmo papel (superfície, saia ou base) e a mesma região. Posições em metros, cota absoluta. */
export interface ParteMalhaTN {
  /** `null` = sem região. */
  regiaoId: Id | null;
  papel: PapelMalhaTN;
  positions: number[];
  indices: number[];
}

export interface MalhaTerreno {
  terrenoId: Id;
  partes: ParteMalhaTN[];
}

/**
 * `grupos` `[terreno_num, regiao_num, papel, primeiro_indice, n_indices]`, `vertices` `[x, y, z]` e `indices` -> uma parte por (terreno, região, papel).
 * Os vértices são compactados por parte (cada parte leva só os que usa).
 */
export function decodificarMalhaTN(
  grupos: ArrayLike<number>,
  vertices: ArrayLike<number>,
  indices: ArrayLike<number>,
  terrenoIdDe: (terrenoNum: number) => Id | undefined,
  regiaoIdDe: (regiaoNum: number) => Id | undefined,
): MalhaTerreno[] {
  const porTerreno = new Map<Id, Map<string, { parte: ParteMalhaTN; mapa: Map<number, number> }>>();
  for (let i = 0; i + 4 < grupos.length; i += 5) {
    const id = terrenoIdDe(grupos[i]!);
    if (id === undefined) continue;
    const regiaoNum = grupos[i + 1]!;
    const regiaoId = regiaoNum === AUSENTE ? null : (regiaoIdDe(regiaoNum) ?? null);
    const papel = PAPEL_MALHA[grupos[i + 2]!] ?? 'superficie';
    const chave = `${regiaoId ?? ''}|${papel}`;
    let mapaTerreno = porTerreno.get(id);
    if (!mapaTerreno) porTerreno.set(id, (mapaTerreno = new Map()));
    let alvo = mapaTerreno.get(chave);
    if (!alvo) mapaTerreno.set(chave, (alvo = { parte: { regiaoId, papel, positions: [], indices: [] }, mapa: new Map() }));
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
  return [...porTerreno.entries()].map(([terrenoId, m]) => ({ terrenoId, partes: [...m.values()].map((x) => x.parte) }));
}

/** Curva de nível de um terreno. `fechada` = o último ponto liga ao primeiro (o Rust não repete o primeiro). */
export interface CurvaNivelTN {
  terrenoId: Id;
  /** Cota da curva (m, absoluta no projeto). */
  z: number;
  mestra: boolean;
  fechada: boolean;
  pontos: Array<{ x: number; y: number }>;
}

/** `linhas` `[terreno_num, mestra, fechada, n_pontos]`, `pontos` `[x, y]` e `cotas` `[z]` (uma por linha) de `terreno_curvas`. */
export function decodificarCurvasTN(linhas: ArrayLike<number>, pontos: ArrayLike<number>, cotas: ArrayLike<number>, terrenoIdDe: (n: number) => Id | undefined): CurvaNivelTN[] {
  const out: CurvaNivelTN[] = [];
  let k = 0;
  for (let i = 0; i + 3 < linhas.length; i += 4) {
    const n = linhas[i + 3]!;
    const id = terrenoIdDe(linhas[i]!);
    if (id !== undefined) {
      const pts: CurvaNivelTN['pontos'] = [];
      for (let j = 0; j < n; j++) pts.push({ x: pontos[2 * (k + j)]!, y: pontos[2 * (k + j) + 1]! });
      out.push({ terrenoId: id, z: cotas[i / 4]!, mestra: linhas[i + 1] === 1, fechada: linhas[i + 2] === 1, pontos: pts });
    }
    k += n;
  }
  return out;
}

/** Borda do terreno em planta (`terreno_planta`; só o papel 0, borda, existe na v1). */
export interface LinhaPlantaTN {
  terrenoId: Id;
  fechada: boolean;
  pontos: Array<{ x: number; y: number }>;
}

/** `linhas` `[terreno_num, papel, fechada, n_pontos]` e `pontos` `[x, y]` de `terreno_planta`. */
export function decodificarPlantaTN(linhas: ArrayLike<number>, pontos: ArrayLike<number>, terrenoIdDe: (n: number) => Id | undefined): LinhaPlantaTN[] {
  const out: LinhaPlantaTN[] = [];
  let k = 0;
  for (let i = 0; i + 3 < linhas.length; i += 4) {
    const n = linhas[i + 3]!;
    const id = terrenoIdDe(linhas[i]!);
    if (id !== undefined) {
      const pts: LinhaPlantaTN['pontos'] = [];
      for (let j = 0; j < n; j++) pts.push({ x: pontos[2 * (k + j)]!, y: pontos[2 * (k + j) + 1]! });
      out.push({ terrenoId: id, fechada: linhas[i + 2] === 1, pontos: pts });
    }
    k += n;
  }
  return out;
}

export type PapelCorteTN = 'cortado' | 'perfilExistente' | 'silhueta';
const PAPEL_CORTE: readonly PapelCorteTN[] = ['cortado', 'perfilExistente', 'silhueta'];

/** Linha do terreno num corte ou elevação, em `(s, z)`. `cortado` e `perfilExistente` vêm do plano; `silhueta` é o que se vê além dele. */
export interface LinhaCorteTN {
  terrenoId: Id;
  papel: PapelCorteTN;
  fechada: boolean;
  pontos: Array<{ s: number; z: number }>;
}

/** `linhas` `[terreno_num, papel, fechada, n_pontos]` e `pontos` `[s, z]` de `terreno_corte`. */
export function decodificarCorteTN(linhas: ArrayLike<number>, pontos: ArrayLike<number>, terrenoIdDe: (n: number) => Id | undefined): LinhaCorteTN[] {
  const out: LinhaCorteTN[] = [];
  let k = 0;
  for (let i = 0; i + 3 < linhas.length; i += 4) {
    const n = linhas[i + 3]!;
    const id = terrenoIdDe(linhas[i]!);
    if (id !== undefined) {
      const pts: LinhaCorteTN['pontos'] = [];
      for (let j = 0; j < n; j++) pts.push({ s: pontos[2 * (k + j)]!, z: pontos[2 * (k + j) + 1]! });
      out.push({ terrenoId: id, papel: PAPEL_CORTE[linhas[i + 1]!] ?? 'cortado', fechada: linhas[i + 2] === 1, pontos: pts });
    }
    k += n;
  }
  return out;
}

/** Triângulos do mapa de corte e aterro de um terreno: `pontos` = `x0, y0, x1, y1, x2, y2` por triângulo. */
export interface MapaCorteAterroTN {
  terrenoId: Id;
  tipo: 'corte' | 'aterro';
  pontos: number[];
}

/** `grupos` `[terreno_num, tipo, primeiro_ponto, n_pontos]` e `pontos` `[x, y]` de `terreno_corte_aterro`. */
export function decodificarCorteAterroTN(grupos: ArrayLike<number>, pontos: ArrayLike<number>, terrenoIdDe: (n: number) => Id | undefined): MapaCorteAterroTN[] {
  const out: MapaCorteAterroTN[] = [];
  for (let i = 0; i + 3 < grupos.length; i += 4) {
    const id = terrenoIdDe(grupos[i]!);
    if (id === undefined) continue;
    const ini = grupos[i + 2]!;
    const n = grupos[i + 3]!;
    const pts: number[] = [];
    for (let k = ini; k < ini + n; k++) pts.push(pontos[2 * k]!, pontos[2 * k + 1]!);
    out.push({ terrenoId: id, tipo: grupos[i + 1] === 1 ? 'aterro' : 'corte', pontos: pts });
  }
  return out;
}

/** Resposta de `terreno_cotas` para um ponto: cota e declividade (módulo do gradiente, fração) do terreno de menor número que o cobre. */
export interface CotaDoTerreno {
  z: number;
  declividade: number;
  terrenoId: Id;
}

/** `linhas` `[sonda_num, terreno_num]` (`ID_AUSENTE` = fora de todo terreno) e `valores` `[z, declividade]`, na ordem das sondas enviadas. */
export function decodificarCotasTN(linhas: ArrayLike<number>, valores: ArrayLike<number>, terrenoIdDe: (n: number) => Id | undefined): Array<CotaDoTerreno | null> {
  const out: Array<CotaDoTerreno | null> = [];
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const id = linhas[i + 1] === AUSENTE ? undefined : terrenoIdDe(linhas[i + 1]!);
    out[linhas[i]!] = id === undefined ? null : { z: valores[i]!, declividade: valores[i + 1]!, terrenoId: id };
  }
  return out;
}
