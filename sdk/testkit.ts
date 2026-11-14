/**
 * Testkit do SDK: testa um suplemento SEM abrir o app. Carrega o manifesto (com o validador do Hestia), simula o `ctx`
 * com as portas reais do host (modelo com lista branca de comandos, dados do suplemento, portão de permissões) sobre um
 * projeto em memória, roda o script no mesmo runtime de Worker de produção (no mesmo processo) e confere permissões.
 *
 * Exemplo (vitest):
 *   const sup = carregarPasta('suplementos-autor/contador');
 *   const t = await criarTeste(sup, { grants: ['model.read'] });
 *   expect(await t.call('ola')).toMatchObject({ title: { pt: 'Contagem' } });
 *   t.fechar();
 */
import {
  createEmptyProject, PluginIdIssuer, ProjectStore, applyPluginBatch, pluginDataReadOnly, pluginDataSpace, type Project,
} from '@hestia/model';
import {
  ContributionRegistry, installWorkerRuntime, isCapabilityV2, pluginDataApi, pluginModelApi, resolveLimits, ScriptHost,
  validateManifestAny, type CapabilityV2, type ModelPort, type PluginDataPort, type PluginManifestV2, type ScriptPorts, type WorkerLike,
} from '@hestia/plugin-api';
import type { ZipEntryData } from '@hestia/io';
import { lerPasta } from './pasta.ts';
import { formatarProblemas, validarArquivos } from './validar.ts';

export interface SuplementoCarregado {
  manifest: PluginManifestV2;
  /** Código do `entry` (só `script`). */
  codigo?: string;
  arquivos: readonly ZipEntryData[];
}

/** Carrega e valida uma pasta de suplemento. Lança `Error` com os problemas legíveis se o manifesto/pacote for inválido. */
export function carregarArquivos(arquivos: readonly ZipEntryData[], nome = 'suplemento'): SuplementoCarregado {
  const res = validarArquivos(arquivos);
  if (!res.ok) throw new Error(formatarProblemas(nome, res));
  const bruto = JSON.parse(new TextDecoder().decode(arquivos.find((a) => a.path === 'manifest.json')!.data)) as unknown;
  const v = validateManifestAny(bruto);
  if (!v.ok) throw new Error(formatarProblemas(nome, res));
  const entry = v.manifest.entry;
  const codigoBytes = entry ? arquivos.find((a) => a.path === entry)?.data : undefined;
  return { manifest: v.manifest, arquivos, ...(codigoBytes ? { codigo: new TextDecoder().decode(codigoBytes) } : {}) };
}

export const carregarPasta = (dir: string): SuplementoCarregado => carregarArquivos(lerPasta(dir), dir);

/** Worker no mesmo processo que roda o runtime REAL do Worker de suplemento (protocolo, portão e limites de produção). */
function workerEmMemoria(): WorkerLike {
  const escopo = { postMessage: (_m: unknown) => undefined, onmessage: null as ((e: { data: unknown }) => void) | null };
  let morto = false;
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => { if (!morto) setTimeout(() => escopo.onmessage?.({ data: m }), 0); },
    terminate: () => { morto = true; },
  };
  escopo.postMessage = (m) => { if (!morto) setTimeout(() => w.onmessage?.({ data: m }), 0); };
  installWorkerRuntime(escopo, {
    loadModule: (codigo) => import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`) as Promise<Record<string, unknown>>,
  });
  return w;
}

export interface OpcoesTeste {
  /** Permissões CONCEDIDAS na simulação (padrão: todas as que o manifesto pede). Só vale o que o manifesto pede. */
  grants?: readonly string[];
  /** Projeto de partida (padrão: projeto vazio). */
  project?: Project;
}

export interface LoteAplicado {
  label: string;
  commands: unknown[];
  resultado: { ok: true; applied: number } | { ok: false; index: number; error: string };
}

export interface Teste {
  /** O projeto em memória (leia `store.project` depois de uma ação para conferir o efeito). */
  readonly store: ProjectStore;
  /** Permissões efetivamente concedidas. */
  readonly grants: readonly string[];
  /** Entradas de `ctx.log`. */
  readonly logs: Array<{ level: 'info' | 'warn' | 'error'; text: string }>;
  /** Cada chamada a `ctx.model.apply`, com o resultado do host. */
  readonly lotes: LoteAplicado[];
  /** Registro de contribuições como o app o veria com estas permissões (o que fica escondido sem permissão não aparece). */
  readonly registry: ContributionRegistry;
  /** Chama uma função exportada do script (rejeita com `ScriptError`). */
  call(handler: string, ...args: unknown[]): Promise<unknown>;
  /** O suplemento tem a permissão? */
  temPermissao(cap: string): boolean;
  /** Dados do suplemento no projeto: chave -> valor. */
  dados(): Record<string, unknown>;
  /** `true` se o projeto traz um `dataSchema` maior que o do manifesto (espaço somente leitura). */
  dadosSomenteLeitura(): boolean;
  /** Encerra o Worker. */
  fechar(): void;
}

/** Monta o ambiente de teste de um suplemento. Para `declarative`/`external` não há script: só `registry` e permissões. */
export async function criarTeste(sup: SuplementoCarregado, o: OpcoesTeste = {}): Promise<Teste> {
  const m = sup.manifest;
  const pedidas = m.capabilities as string[];
  const grants = (o.grants ?? pedidas).filter((g) => pedidas.includes(g) && isCapabilityV2(g));
  const store = new ProjectStore(o.project ?? createEmptyProject());
  const issuer = new PluginIdIssuer();
  const logs: Teste['logs'] = [];
  const lotes: LoteAplicado[] = [];

  const model: ModelPort = {
    read: () => structuredClone(store.project) as never,
    newId: (id, prefix) => issuer.issue(id, prefix),
    apply(id, label, commands, opts) {
      const resultado = applyPluginBatch(store, {
        pluginId: id, label: `${m.name}: ${label}`, commands, isIssuedId: (x) => issuer.has(id, x), dataSchema: m.dataSchema, version: m.version, maxCommands: opts?.maxCommands,
      });
      lotes.push({ label, commands: structuredClone(commands), resultado });
      return resultado;
    },
  };
  const data: PluginDataPort = {
    get: (id, key) => { const v = pluginDataSpace(store.project, id)?.values[key]; return v === undefined ? undefined : structuredClone(v); },
    keys: (id) => Object.keys(pluginDataSpace(store.project, id)?.values ?? {}),
    set: (id, key, value) => store.exec({ type: 'setPluginData', pluginId: id, key, value: value as never, schema: m.dataSchema, version: m.version }),
    delete: (id, key) => store.exec({ type: 'deletePluginData', pluginId: id, key, schema: m.dataSchema }),
    readOnly: (id) => pluginDataReadOnly(store.project, id, m.dataSchema),
  };
  const registry = new ContributionRegistry();
  registry.register(m, grants.filter((g): g is CapabilityV2 => isCapabilityV2(g)));

  let host: ScriptHost | null = null;
  if (m.runtime === 'script' && sup.codigo !== undefined) {
    const concedidas = (): readonly string[] => grants;
    const mp = pluginModelApi(model, m.id, concedidas);
    const dp = pluginDataApi(data, m.id, concedidas);
    const ports: ScriptPorts = {
      modelRead: () => mp.read(), modelApply: (label, commands) => mp.apply(label, commands), newId: (prefix) => mp.newId(prefix),
      dataGet: (key) => dp.get(key), dataSet: (key, value) => dp.set(key, value), dataDelete: (key) => dp.delete(key),
    };
    host = new ScriptHost({
      pluginId: m.id, code: sup.codigo, limits: resolveLimits(m.limits), grants, ports, createWorker: workerEmMemoria,
      log: (level, text) => logs.push({ level, text }), onFailed: (reason) => logs.push({ level: 'error', text: `falhou: ${reason}` }),
    });
  }
  return {
    store, grants, logs, lotes, registry,
    call: (handler, ...args) => {
      if (!host) return Promise.reject(new Error('este suplemento não tem script (runtime declarative ou external)'));
      return host.call(handler, args);
    },
    temPermissao: (cap) => grants.includes(cap),
    dados: () => ({ ...(pluginDataSpace(store.project, m.id)?.values ?? {}) }),
    dadosSomenteLeitura: () => pluginDataReadOnly(store.project, m.id, m.dataSchema),
    fechar: () => host?.stop(),
  };
}
