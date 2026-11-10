import type { Element, Id, Project } from '@hestia/model';
import { adjacentLevelIds } from './junctionNet.ts';
import { resolveLevel } from './resolve.ts';
import type { ResolvedLevel } from './types.ts';

/**
 * Cache de resolução por nível, com recálculo só do que a edição afeta. Antes, qualquer edição trocava o objeto do
 * projeto e todos os níveis eram recalculados (3D: os 20). Agora cada nível guarda o projeto em que foi calculado e, na
 * consulta, só recalcula se o que mudou entre esse projeto e o atual alcança o nível.
 *
 * Dependências (provadas no código de `resolveLevel`, não por palpite):
 *  - o nível lê os próprios elementos (paredes, aberturas, pisos, lajes, telhados, ambientes, forros);
 *  - parede com `attachBottomToFloor` lê pisos e lajes do próprio nível; com `attachTopToFloor`, os do nível
 *    `topLevelId`. Ambos leem as lajes desses níveis, que leem os níveis acima e abaixo (`adjacentLevelIds`);
 *  - parede com `attachTopToRoof` lê os telhados de todos os níveis (`roofWallProfile`): depende de tudo;
 *  - tipos, níveis, configurações e demais chaves do projeto valem para todos os níveis: mudança nelas recalcula tudo.
 * Chaves que não entram na geometria de nível (`views`, `sheets`, `view3d`, `nextOrder`) não invalidam nada.
 *
 * O cache guarda um projeto por nível (e o valor), então a memória cresce com o número de níveis, não com o histórico.
 */

/** Chaves do projeto que não entram na resolução de nível (ver o cabeçalho). Todas as outras são globais. */
const FORA_DA_RESOLUCAO = new Set<string>(['elements', 'nextOrder', 'views', 'sheets', 'view3d', 'view3dPoints']);

/** Níveis a recalcular entre dois projetos: um conjunto, ou `'todos'` quando algo global mudou ou não se sabe o nível. */
export type NiveisAfetados = ReadonlySet<Id> | 'todos';

/** Nível de um elemento: o próprio `levelId`, ou o da parede hospedeira (abertura). `null` se não há como saber. */
export function nivelDe(p: Project, e: Element): Id | null {
  if ('levelId' in e) return e.levelId;
  if ('hostId' in e) {
    const host = p.elements[e.hostId];
    return host && 'levelId' in host ? host.levelId : null;
  }
  return null;
}

/** Níveis dependentes de um nível, pelos atributos de anexo das paredes (ver o cabeçalho). */
function dependenciasDoNivel(p: Project, nivel: Id): { deps: Set<Id>; tudo: boolean } {
  const deps = new Set<Id>();
  let tudo = false;
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'wall' || e.levelId !== nivel) continue;
    if (e.attachTopToRoof === true) tudo = true;
    if (e.attachBottomToFloor === true || e.attachTopToFloor === true) {
      deps.add(nivel);
      for (const a of adjacentLevelIds(p, nivel)) deps.add(a);
    }
    if (e.attachTopToFloor === true && e.topLevelId) {
      deps.add(e.topLevelId);
      for (const a of adjacentLevelIds(p, e.topLevelId)) deps.add(a);
    }
  }
  return { deps, tudo };
}

/**
 * Níveis a recalcular para ir de `antes` até `depois`. Compara elementos por referência (o motor é imutável: elemento
 * não editado mantém o objeto) e as demais chaves do projeto pela mesma regra. Quando não dá para dizer, devolve `'todos'`.
 */
/**
 * Mesma lista de níveis, com o mesmo conteúdo na mesma ordem. O store pode recriar o objeto de nível e acrescentar
 * `tags: []` vazio (padrão), sem mudar nada que a resolução leia: esse campo vazio não conta como mudança.
 */
function mesmosNiveis(a: readonly unknown[], b: readonly unknown[]): boolean {
  const norm = (x: unknown): string => {
    if (x && typeof x === 'object' && Array.isArray((x as { tags?: unknown }).tags) && (x as { tags: unknown[] }).tags.length === 0) {
      const { tags: _vazio, ...resto } = x as { tags: unknown[] } & Record<string, unknown>;
      return JSON.stringify(resto);
    }
    return JSON.stringify(x);
  };
  return a.length === b.length && a.every((x, i) => x === b[i] || norm(x) === norm(b[i]));
}

export function niveisAfetados(antes: Project, depois: Project): NiveisAfetados {
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  for (const k of chaves) {
    if (FORA_DA_RESOLUCAO.has(k)) continue;
    // A lista de níveis pode ser nova sem que nenhum nível mude: vale o conteúdo, não a identidade da lista.
    if (k === 'levels' && mesmosNiveis(antes.levels, depois.levels)) continue;
    if ((antes as unknown as Record<string, unknown>)[k] !== (depois as unknown as Record<string, unknown>)[k]) return 'todos';
  }
  const tocados = new Set<Id>();
  const ids = new Set([...Object.keys(antes.elements), ...Object.keys(depois.elements)]);
  for (const id of ids) {
    const a = antes.elements[id];
    const b = depois.elements[id];
    if (a === b) continue;
    // Guarda-corpo não entra na resolução do nível (paredes, aberturas, pisos, lajes...): ligar ou editar um não recalcula o nível.
    if ((a === undefined || a.kind === 'railing') && (b === undefined || b.kind === 'railing')) continue;
    for (const e of [a, b]) {
      if (!e) continue;
      const n = nivelDe(e === a ? antes : depois, e);
      if (n === null) return 'todos';
      tocados.add(n);
    }
  }
  if (tocados.size === 0) return new Set<Id>();
  const afetados = new Set<Id>(tocados);
  for (const l of depois.levels) {
    if (afetados.has(l.id)) continue;
    const { deps, tudo } = dependenciasDoNivel(depois, l.id);
    if (tudo || [...deps].some((d) => tocados.has(d))) afetados.add(l.id);
  }
  return afetados;
}

interface Entrada {
  project: Project;
  value: ResolvedLevel;
}

/**
 * Cache de níveis resolvidos. `get` devolve o mesmo objeto enquanto nada que o nível lê mudou; `release` libera um nível
 * (aba fechada); `clear` esvazia tudo (projeto novo ou carregado). `recalculated` conta os níveis calculados de fato.
 */
export class LevelResolveCache {
  private readonly entradas = new Map<Id, Entrada>();
  private memo: { de: Project; para: Project; niveis: NiveisAfetados } | null = null;
  /** Níveis recalculados desde a criação (medição e testes). */
  recalculated = 0;

  constructor(private readonly calcular: (p: Project, id: Id) => ResolvedLevel = (p, id) => resolveLevel(p, id)) {}

  get(p: Project, levelId: Id): ResolvedLevel {
    const hit = this.entradas.get(levelId);
    if (hit && hit.project === p) return hit.value;
    if (hit) {
      const niveis = this.diferenca(hit.project, p);
      if (niveis !== 'todos' && !niveis.has(levelId)) {
        hit.project = p;
        return hit.value;
      }
    }
    const value = this.calcular(p, levelId);
    this.recalculated++;
    this.entradas.set(levelId, { project: p, value });
    return value;
  }

  /** Libera o cache de um nível (ex.: fechar a aba de planta). O próximo `get` recalcula só esse nível. */
  release(levelId: Id): void {
    this.entradas.delete(levelId);
  }

  clear(): void {
    this.entradas.clear();
    this.memo = null;
  }

  /** Quantos níveis estão guardados (teto: o número de níveis do projeto). */
  get size(): number {
    return this.entradas.size;
  }

  private diferenca(de: Project, para: Project): NiveisAfetados {
    if (this.memo && this.memo.de === de && this.memo.para === para) return this.memo.niveis;
    const niveis = niveisAfetados(de, para);
    this.memo = { de, para, niveis };
    if (niveis === 'todos') this.entradas.clear();
    return niveis;
  }
}
