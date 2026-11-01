// Abertura de um projeto com o cache de geometria (ver geometryCache.ts). Na abertura, restaura do cache os níveis já
// calculados e os põe como prontos da resolução; sem cache, grava os níveis quando ficam prontos em segundo plano. Só a
// abertura grava: uma edição não escreve no cache. O caminho síncrono do editor segue como fallback, então um cache
// vazio ou ilegível só deixa a abertura como era.

import type { ResolvedLevel } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { chavesDeNivel } from '@hestia/render';
import { CacheGeometria, chaveDaLista, hashDoConteudo } from './geometryCache.ts';

/** Teto do cache de geometria (bytes de texto serializado). */
export const TETO_GEOMETRIA_BYTES = 32 * 1024 * 1024;
/** Intervalo (ms) entre as conferências de "níveis prontos" antes de gravar. */
export const INTERVALO_GRAVACAO_MS = 100;
/** Conferências antes de desistir da gravação (cerca de um minuto). */
const TENTATIVAS_GRAVACAO = 600;
/**
 * Versão do esquema gravado no cache (formato do JSON de `ResolvedLevel`). Subir ao mudar a forma do que se grava.
 */
export const VERSAO_ESQUEMA_CACHE = 1;
/**
 * Versão do motor geométrico. O cache é por CONTEÚDO do nível, não por versão do código: se `resolveLevel` (ou algo que
 * ele lê: junções, lajes, pisos, kernel) mudar de resultado, SUBA este número, senão o cache devolveria a geometria
 * antiga para o mesmo conteúdo. Teste de regressão: `geometriaAbertura.test.ts` compara o cache com o cálculo fresco.
 */
export const VERSAO_MOTOR_GEOMETRIA = 1;
/** Nome da lista de um nível no cache (ver `chaveDaLista`). */
const LISTA_NIVEL = 'nivel';

/** O que a abertura precisa do editor. Funções, para o módulo não depender do controller. */
export interface PortasAbertura {
  cache: CacheGeometria;
  /** Projeto atual do editor: a abertura só age enquanto for o mesmo objeto que abriu. */
  atual(): Project;
  /** Resultado de um nível já calculado (pronto ou calculado na hora), ou `null`. */
  lerNivel(id: Id): ResolvedLevel | null;
  /** Verdadeiro enquanto o nível ainda vai ser calculado em segundo plano. */
  pendente(id: Id): boolean;
  /** Põe um nível restaurado do cache como pronto (ver `ResolucaoProgressiva.semear`). */
  semear(id: Id, valor: ResolvedLevel): void;
  /** Agenda uma tarefa daqui a `ms`. Padrão: `setTimeout`. */
  agendar?(tarefa: () => void, ms: number): void;
}

/** Prefixo de versão de toda chave: esquema e motor (mudou um, as entradas antigas deixam de ser achadas e saem por LRU). */
const PREFIXO_VERSAO = `v${VERSAO_ESQUEMA_CACHE}.${VERSAO_MOTOR_GEOMETRIA}`;

/**
 * Chave de conteúdo de cada nível: a do 3D (`chavesDeNivel`: o nível, os vizinhos por cota, os telhados e o bloco global,
 * sem cortes, áreas nem nome) mais as versões. Não depende do nome do arquivo; editar um pavimento só muda as chaves dele
 * e dos vizinhos, os outros seguem no cache.
 */
export function chavesDosNiveis(p: Project): Map<Id, string> {
  const out = new Map<Id, string>();
  for (const [id, c] of chavesDeNivel(p, 'resolucao')) out.set(id, `${PREFIXO_VERSAO}|${c}`);
  return out;
}

/** Chave do projeto inteiro: resumo das chaves dos níveis (muda quando o conteúdo de algum nível muda). */
export function chaveDoProjeto(p: Project): string {
  return hashDoConteudo([...chavesDosNiveis(p)].map(([id, c]) => `${id}=${c}`).join('|'));
}

/** Chave de um nível no cache (já com as versões; ver `chavesDosNiveis`). */
export function chaveDoNivel(chaveNivel: string, id: Id): string {
  return chaveDaLista(chaveNivel, id, LISTA_NIVEL);
}

export interface RestauradoDoCache {
  semeados: Map<Id, ResolvedLevel>;
  faltam: Id[];
  chaves: Map<Id, string>;
}

/** Lê do cache os níveis achados de `p`. Não lança: falha de armazenamento é "não achei". */
export async function restaurarDoCache(portas: PortasAbertura, p: Project): Promise<RestauradoDoCache> {
  const chaves = chavesDosNiveis(p);
  const semeados = new Map<Id, ResolvedLevel>();
  const faltam: Id[] = [];
  try {
    const achados = await Promise.all(p.levels.map((l) => portas.cache.obter(chaveDoNivel(chaves.get(l.id)!, l.id)).then((r) => ({ id: l.id, r }), () => ({ id: l.id, r: { achou: false as const } }))));
    for (const { id, r } of achados) {
      if (r.achou) semeados.set(id, r.valor as ResolvedLevel);
      else faltam.push(id);
    }
  } catch {
    return { semeados: new Map(), faltam: p.levels.map((l) => l.id), chaves };
  }
  return { semeados, faltam, chaves };
}

/**
 * Abre `p` com o cache: restaura os níveis achados (semeando-os) e agenda a gravação dos que faltam. Não lança; a promessa
 * resolve quando a restauração termina (a gravação segue em segundo plano). O controller usa `restaurarDoCache` antes de
 * carregar o projeto, para o nível ativo já nascer pronto; esta função é o caminho de uma só chamada.
 */
export async function abrirComCache(portas: PortasAbertura, p: Project): Promise<void> {
  const r = await restaurarDoCache(portas, p);
  if (portas.atual() !== p) return;
  for (const [id, valor] of r.semeados) portas.semear(id, valor);
  agendarGravacao(portas, p, r);
}

/** Agenda a gravação dos níveis que não estavam no cache, quando ficarem prontos. */
export function agendarGravacao(portas: PortasAbertura, p: Project, r: RestauradoDoCache): void {
  if (r.faltam.length > 0) gravarQuandoProntos(portas, p, r.chaves, r.faltam, TENTATIVAS_GRAVACAO);
}

/** Apaga todo o cache de geometria (níveis resolvidos). Não lança. */
export async function limparCacheDeGeometria(portas: Pick<PortasAbertura, 'cache'>): Promise<void> {
  await portas.cache.limpar().catch(() => undefined);
}

/** Espera os níveis em falta ficarem prontos (sem pendência) e grava cada um. Para se o projeto mudar. */
function gravarQuandoProntos(portas: PortasAbertura, p: Project, chaves: Map<Id, string>, faltam: Id[], restantes: number): void {
  const agendar = portas.agendar ?? ((tarefa: () => void, ms: number) => setTimeout(tarefa, ms));
  if (portas.atual() !== p) return;
  if (faltam.some((id) => portas.pendente(id))) {
    if (restantes > 0) agendar(() => gravarQuandoProntos(portas, p, chaves, faltam, restantes - 1), INTERVALO_GRAVACAO_MS);
    return;
  }
  for (const id of faltam) {
    const valor = portas.lerNivel(id);
    if (valor) void portas.cache.gravar(chaveDoNivel(chaves.get(id)!, id), valor).catch(() => false);
  }
}
