/**
 * Lógica pura do gerenciador unificado de suplementos (ADR 0057, fase J): lista única de suplementos de pacote e de
 * processo externo, busca e filtro, filtro e texto do log, e leitura do espaço de dados (somente leitura).
 * Sem React e sem acesso global: o que muda de lugar entra por parâmetro, por isso é testável sem navegador.
 */
import { PLUGIN_DATA_LIMITS } from '@hestia/model';
import type { PluginDataPort, PluginView } from '@hestia/plugin-api';
import type { PluginLogEntry, PluginLogLevel } from './pluginLog.ts';
import type { SupplementRow } from './supRuntime.ts';
import type { SupState } from './loader.ts';

/** Estado mostrado na lista (o de pacote do carregador, mais os do processo externo mapeados para os mesmos nomes). */
export type ManagerState = SupState;

/** Um item da lista unificada: a linha de pacote ou a entrada do processo externo. */
export type ManagerItem =
  | { kind: 'package'; key: string; name: string; state: ManagerState; row: SupplementRow }
  | { kind: 'external'; key: string; name: string; state: ManagerState; view: PluginView };

/** Estado de um suplemento de processo externo em termos do gerenciador: desativado, sem permissão, falhou ou ativo. */
export function externalState(p: Pick<PluginView, 'enabled' | 'state' | 'grants' | 'suggested' | 'manifest'>): ManagerState {
  if (!p.enabled) return 'disabled';
  if (p.state === 'incompatible') return 'failed';
  const asked = p.manifest ? p.manifest.capabilities : p.suggested;
  if (asked.length > 0 && p.grants.length === 0) return 'needs-grant';
  return 'active';
}

/** Junta pacotes e processos externos numa lista só, em ordem alfabética do nome. */
export function buildItems(rows: readonly SupplementRow[], externals: readonly PluginView[]): ManagerItem[] {
  const items: ManagerItem[] = [
    ...rows.map((row): ManagerItem => ({ kind: 'package', key: `pkg:${row.id}`, name: row.name, state: row.state, row })),
    ...externals.map((view): ManagerItem => ({ kind: 'external', key: `ext:${view.key}`, name: view.manifest?.name ?? view.label, state: externalState(view), view })),
  ];
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

/** Minúsculas e sem acento: a busca ignora ambos. */
export const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface ManagerFilter {
  /** Texto buscado no nome, id, descrição e autor. Vazio = tudo. */
  query: string;
  /** Um estado, ou `all`. */
  state: ManagerState | 'all';
}

function haystack(it: ManagerItem): string {
  if (it.kind === 'package') return [it.row.name, it.row.id, it.row.description ?? '', it.row.author ?? ''].join(' ');
  return [it.name, it.view.key, it.view.manifest?.id ?? '', it.view.manifest?.description ?? ''].join(' ');
}

/** Aplica busca e filtro de estado. */
export function filterItems(items: readonly ManagerItem[], f: ManagerFilter): ManagerItem[] {
  const needle = norm(f.query.trim());
  return items.filter((it) => (f.state === 'all' || it.state === f.state) && (needle === '' || norm(haystack(it)).includes(needle)));
}

/** Quantos itens há em cada estado (para os números ao lado do filtro). */
export function countByState(items: readonly ManagerItem[]): Record<ManagerState | 'all', number> {
  const out: Record<ManagerState | 'all', number> = { all: items.length, active: 0, disabled: 0, 'needs-grant': 0, failed: 0, installed: 0 };
  for (const it of items) out[it.state] += 1;
  return out;
}

// ---- log por suplemento ----

export interface LogFilter {
  level: PluginLogLevel | 'all';
  text: string;
}

/** Filtra as entradas do log por nível e por texto (sem acento nem maiúsculas). */
export function filterLog(entries: readonly PluginLogEntry[], f: LogFilter): PluginLogEntry[] {
  const needle = norm(f.text.trim());
  return entries.filter((e) => (f.level === 'all' || e.level === f.level) && (needle === '' || norm(e.text).includes(needle)));
}

/** Texto para copiar: uma linha por entrada, `AAAA-MM-DDTHH:MM:SS.mmmZ [nível] texto` (UTC, estável entre fusos). */
export function formatLog(entries: readonly PluginLogEntry[]): string {
  return entries.map((e) => `${new Date(e.at).toISOString()} [${e.level}] ${e.text}`).join('\n');
}

// ---- espaço de dados do suplemento no projeto ----

/** Teto de dados de UM suplemento no projeto, em bytes (1 MiB), igual ao do host. */
export const DATA_SPACE_LIMIT_BYTES: number = PLUGIN_DATA_LIMITS.bytesPerPlugin;

export interface DataEntry {
  key: string;
  /** Tamanho do valor em JSON, em bytes (UTF-8). */
  bytes: number;
  /** Primeiros 400 caracteres do JSON, para olhar sem editar. */
  preview: string;
}

export interface DataSpaceInfo {
  /** Soma dos tamanhos dos valores, em bytes. */
  totalBytes: number;
  limitBytes: number;
  /** `true` quando o projeto traz dados de um `dataSchema` maior que o instalado: só leitura. */
  readOnly: boolean;
  entries: DataEntry[];
}

const encoder = new TextEncoder();

/** Lê (sem escrever) o espaço de dados de um suplemento pela porta do host. Nunca lança: falha vira espaço vazio. */
export function dataSpaceInfo(port: PluginDataPort, pluginId: string): DataSpaceInfo {
  try {
    const entries: DataEntry[] = [...port.keys(pluginId)].sort().map((key) => {
      const json = JSON.stringify(port.get(pluginId, key)) ?? 'null';
      return { key, bytes: encoder.encode(json).length, preview: json.slice(0, 400) };
    });
    return { totalBytes: entries.reduce((n, e) => n + e.bytes, 0), limitBytes: DATA_SPACE_LIMIT_BYTES, readOnly: port.readOnly(pluginId), entries };
  } catch {
    return { totalBytes: 0, limitBytes: DATA_SPACE_LIMIT_BYTES, readOnly: false, entries: [] };
  }
}

/** Tamanho legível: bytes até 1024, depois KiB e MiB com uma casa decimal. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`; // units-ok: tamanho de arquivo em KiB, não é medida do projeto
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`; // units-ok: tamanho de arquivo em MiB, não é medida do projeto
}
