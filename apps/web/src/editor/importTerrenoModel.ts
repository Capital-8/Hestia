import { simplificarPolilinha, type CamadaLevantamento, type LevantamentoDxf, type ResultadoCsv } from '@hestia/io';
import {
  cotaExibida,
  makeTerrain,
  terrainIssue,
  TERRENO_LIMITES,
  type CurvaTerreno,
  type Localizacao,
  type Project,
  type QuebraTerreno,
  type Terrain,
} from '@hestia/model';
import type { PT_TERRENO } from './i18n/areas/terreno.ts';

/**
 * Modelo do diálogo "Importar levantamento" (A.6 e ficha I1): decide o que cada camada vira, simplifica, propõe a
 * localização para coordenadas grandes, leva as fontes para coordenadas locais e confere os limites. Sem React, sem store:
 * só devolve as FONTES do terreno (pontos, curvas e quebras). Nenhuma malha, curva de nível ou perfil é gerado aqui.
 */

/** O que fazer com uma camada do DXF. */
export type DestinoCamada = 'ignorar' | 'pontos' | 'curvas' | 'quebras';

/** Fontes de um terreno, no formato do modelo (`substituirFontes`). */
export interface FontesImportadas {
  pontos: number[];
  curvas: CurvaTerreno[];
  quebras: QuebraTerreno[];
}

/** Tolerância padrão da simplificação das polilinhas (m). */
export const TOLERANCIA_PADRAO = 0.05;

/** Arredondamento da origem proposta (m). */
export const PASSO_ORIGEM = 100;

/** Mensagem de bloqueio: chave do dicionário do terreno e argumentos. */
export interface Bloqueio {
  chave: keyof typeof PT_TERRENO;
  args: Record<string, string | number>;
}

/** Proposta de localização para coordenadas grandes (origem real e altitude da cota zero). */
export interface PropostaLocalizacao {
  origemE: number;
  origemN: number;
  cotaZero: number;
}

export const fontesVazias = (): FontesImportadas => ({ pontos: [], curvas: [], quebras: [] });

/**
 * Destino inicial de cada camada: a que tem polilinhas de cota constante vira curvas; senão a de cota variável vira linhas
 * de quebra; senão a que só tem pontos vira pontos; camada sem nada com cota é ignorada.
 */
export function destinosPadrao(camadas: readonly CamadaLevantamento[]): Record<string, DestinoCamada> {
  const out: Record<string, DestinoCamada> = {};
  for (const c of camadas) {
    if (c.contagem.constantes > 0) out[c.nome] = 'curvas';
    else if (c.contagem.variaveis > 0) out[c.nome] = 'quebras';
    else if (c.contagem.pontos > 0) out[c.nome] = 'pontos';
    else out[c.nome] = 'ignorar';
  }
  return out;
}

/** Acrescenta `origem` ao fim de `destino` (sem `push(...)`, que estoura a pilha com centenas de milhares de números). */
function anexar(destino: number[], origem: readonly number[]): void {
  for (const n of origem) destino.push(n);
}

/** Vértices de uma polilinha de cota variável como pontos (sem repetir o vértice de fecho). */
function verticesComoPontos(v: readonly number[]): number[] {
  const n = v.length;
  const fechada = n >= 9 && v[0] === v[n - 3] && v[1] === v[n - 2] && v[2] === v[n - 1];
  return fechada ? v.slice(0, n - 3) : v.slice();
}

/**
 * Fontes do DXF segundo os destinos. Os pontos (POINT e 3DFACE) da camada sempre entram como pontos, exceto em `ignorar`.
 * Polilinhas: `pontos` = vértices como pontos; `curvas` = as de cota constante viram curvas e as de cota variável viram
 * pontos (uma curva tem uma cota só); `quebras` = todas viram linhas de quebra. `tolerancia` > 0 simplifica curvas e
 * quebras em planta (pontos nunca).
 */
export function fontesDoDxf(lev: LevantamentoDxf, destinos: Readonly<Record<string, DestinoCamada>>, tolerancia: number): FontesImportadas {
  const f = fontesVazias();
  const tol = Number.isFinite(tolerancia) && tolerancia > 0 ? tolerancia : 0;
  for (const c of lev.camadas) {
    const destino = destinos[c.nome] ?? 'ignorar';
    if (destino === 'ignorar') continue;
    anexar(f.pontos, c.pontos);
    for (const p of c.constantes) {
      if (destino === 'curvas') {
        f.curvas.push({ z: p.z, xy: simplificarPolilinha(p.xy, tol, 2, p.fechada), fechada: p.fechada });
        continue;
      }
      const xyz: number[] = [];
      for (let k = 0; k < p.xy.length; k += 2) xyz.push(p.xy[k]!, p.xy[k + 1]!, p.z);
      if (destino === 'pontos') {
        anexar(f.pontos, xyz);
        continue;
      }
      if (p.fechada) xyz.push(p.xy[0]!, p.xy[1]!, p.z);
      f.quebras.push({ xyz: simplificarPolilinha(xyz, tol, 3) });
    }
    for (const v of c.variaveis) {
      if (destino === 'quebras') f.quebras.push({ xyz: simplificarPolilinha(v, tol, 3) });
      else anexar(f.pontos, verticesComoPontos(v));
    }
  }
  return f;
}

/** Fontes de um CSV: só pontos. */
export const fontesDoCsv = (csv: ResultadoCsv): FontesImportadas => ({ pontos: csv.pontos.slice(), curvas: [], quebras: [] });

/** Soma de pontos soltos, vértices de curvas e de quebras (o que o limite do terreno conta, sem borda). */
export function contarVertices(f: FontesImportadas): number {
  return f.pontos.length / 3 + f.curvas.reduce((s, c) => s + c.xy.length / 2, 0) + f.quebras.reduce((s, q) => s + q.xyz.length / 3, 0);
}

export interface CaixaFontes {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Caixa (x, y, z) de todas as fontes; null se não há vértice. */
export function caixaDasFontes(f: FontesImportadas): CaixaFontes | null {
  let cx: CaixaFontes | null = null;
  const add = (x: number, y: number, z: number): void => {
    cx = cx === null ? { minX: x, maxX: x, minY: y, maxY: y, minZ: z, maxZ: z } : { minX: Math.min(cx.minX, x), maxX: Math.max(cx.maxX, x), minY: Math.min(cx.minY, y), maxY: Math.max(cx.maxY, y), minZ: Math.min(cx.minZ, z), maxZ: Math.max(cx.maxZ, z) };
  };
  for (let k = 0; k + 2 < f.pontos.length; k += 3) add(f.pontos[k]!, f.pontos[k + 1]!, f.pontos[k + 2]!);
  for (const c of f.curvas) for (let k = 0; k + 1 < c.xy.length; k += 2) add(c.xy[k]!, c.xy[k + 1]!, c.z);
  for (const q of f.quebras) for (let k = 0; k + 2 < q.xyz.length; k += 3) add(q.xyz[k]!, q.xyz[k + 1]!, q.xyz[k + 2]!);
  return cx;
}

/**
 * Proposta de localização (A.6): só quando alguma coordenada passa de 100 000 m em módulo e o projeto não tem
 * `localizacao`. Origem = centro da caixa arredondado para 100 m; altitude da cota zero = menor z arredondado para baixo.
 */
export function propostaLocalizacao(f: FontesImportadas, p: Pick<Project, 'localizacao'>): PropostaLocalizacao | null {
  if (p.localizacao !== undefined) return null;
  const c = caixaDasFontes(f);
  if (c === null) return null;
  const maior = Math.max(Math.abs(c.minX), Math.abs(c.maxX), Math.abs(c.minY), Math.abs(c.maxY));
  if (!(maior > TERRENO_LIMITES.coordMax)) return null;
  const centro = (a: number, b: number): number => Math.round((a + b) / 2 / PASSO_ORIGEM) * PASSO_ORIGEM;
  return { origemE: centro(c.minX, c.maxX), origemN: centro(c.minY, c.maxY), cotaZero: Math.floor(c.minZ) };
}

/** Leva as fontes para coordenadas locais: subtrai a origem de x e y e a cota zero de z. Não altera a entrada. */
export function levarParaLocais(f: FontesImportadas, prop: PropostaLocalizacao): FontesImportadas {
  const { origemE, origemN, cotaZero } = prop;
  const pontos = f.pontos.slice();
  for (let k = 0; k + 2 < pontos.length; k += 3) {
    pontos[k]! -= origemE;
    pontos[k + 1]! -= origemN;
    pontos[k + 2]! -= cotaZero;
  }
  const curvas = f.curvas.map((c) => {
    const xy = c.xy.slice();
    for (let k = 0; k + 1 < xy.length; k += 2) {
      xy[k]! -= origemE;
      xy[k + 1]! -= origemN;
    }
    return { z: c.z - cotaZero, xy, fechada: c.fechada };
  });
  const quebras = f.quebras.map((q) => {
    const xyz = q.xyz.slice();
    for (let k = 0; k + 2 < xyz.length; k += 3) {
      xyz[k]! -= origemE;
      xyz[k + 1]! -= origemN;
      xyz[k + 2]! -= cotaZero;
    }
    return { xyz };
  });
  return { pontos, curvas, quebras };
}

/** Localização completa gravada pela proposta (norte verdadeiro 0). */
export const localizacaoDaProposta = (prop: PropostaLocalizacao): Localizacao => ({ ...prop, norteVerdadeiro: 0 });

/** Fontes finais (locais, se a proposta foi aceita). */
export function fontesFinais(f: FontesImportadas, prop: PropostaLocalizacao | null, aceita: boolean): FontesImportadas {
  return prop !== null && aceita ? levarParaLocais(f, prop) : f;
}

/**
 * Cota que o usuário verá depois da importação para um z do arquivo: com proposta aceita, é o próprio z do arquivo;
 * senão, z + cota zero do projeto (`cotaExibida`). Use com `formatQuantity`.
 */
export function cotaDoArquivoExibida(p: Pick<Project, 'localizacao'>, prop: PropostaLocalizacao | null, aceita: boolean, z: number): number {
  if (prop !== null && aceita) return cotaExibida({ localizacao: localizacaoDaProposta(prop) }, z - prop.cotaZero);
  return cotaExibida(p, z);
}

/** Terreno novo com as fontes (já locais). `id` e `levelId` vêm de quem chama. */
export function terrenoDasFontes(id: string, levelId: string, nome: string, f: FontesImportadas): Omit<Terrain, 'order'> {
  return makeTerrain({ id, levelId, name: nome, pontos: f.pontos.slice(), curvas: f.curvas, quebras: f.quebras });
}

/**
 * Motivo que impede aplicar, ou null: nada a importar; vértices acima do limite (`TERRENO_LIMITES.vertices`); ou o
 * terreno final inválido pelo modelo (curvas e quebras demais, coordenada ou cota fora da faixa...). `finais` = fontes
 * já locais. A contagem de vértices é a das fontes finais.
 */
export function bloqueioDaImportacao(finais: FontesImportadas, levelId: string, lang: Parameters<typeof terrainIssue>[1] = 'pt'): Bloqueio | null {
  const n = contarVertices(finais);
  if (n === 0) return { chave: 'ui_tn_imp_vazio', args: {} };
  if (n > TERRENO_LIMITES.vertices) return { chave: 'ui_tn_imp_limite_vertices', args: { n, max: TERRENO_LIMITES.vertices } };
  const issue = terrainIssue({ ...terrenoDasFontes('prev', levelId, 'prev', finais), order: 0 }, lang);
  return issue === null ? null : { chave: 'ui_tn_imp_invalido', args: { motivo: issue } };
}
