import { useEffect } from 'react';
import { contadores, type SnapshotPerf } from '@hestia/render';
import { safeGet, safeSet } from '../../editor/storage.ts';
import { criarOverlay, type OverlayPerf } from './overlay.ts';
import { lerModoBench, lerOpcoesPerf, type ModoBench } from './opcoes.ts';

/** Chave que guarda a escolha do atalho (Ctrl+Shift+P) entre sessões; `'1'` = medição+overlay ligados. */
export const PERF_LOCAL_KEY = 'hestia.perf';

/** API pública de depuração: `window.__hestiaPerf.snapshot()` e `.reset()` (ver docs/desempenho). */
export interface ApiPerf {
  readonly ativo: boolean;
  readonly overlay: boolean;
  snapshot(): SnapshotPerf;
  reset(): void;
}

interface Instalacao {
  api: ApiPerf;
  remover(): void;
}

let instalacao: Instalacao | null = null;

function publicar(api: ApiPerf | null): void {
  const w = window as unknown as { __hestiaPerf?: ApiPerf };
  if (api) w.__hestiaPerf = api;
  else delete w.__hestiaPerf;
}

function apiDesligada(): ApiPerf {
  return { ativo: false, overlay: false, snapshot: () => contadores.snapshot(), reset: () => contadores.reset() };
}

function apiMedindo(overlay: OverlayPerf | null): ApiPerf {
  return { ativo: true, overlay: overlay !== null, snapshot: () => contadores.snapshot(), reset: () => contadores.reset() };
}

/** Evento de teclado mínimo para reconhecer o atalho (mesmo formato de `plugins/supShortcut.ts`). */
export interface PerfShortcutEvent {
  code: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
}

/** Atalho global do diagnóstico: Ctrl+Shift+P (`code` pela posição da tecla, sem AutoRepeat). */
export function isPerfShortcut(e: PerfShortcutEvent): boolean {
  return e.code === 'KeyP' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && !e.repeat;
}

/**
 * Liga a instrumentação conforme a URL (`?perf=1`) ou o `localStorage['hestia.perf']` gravado pelo
 * atalho — a URL manda quando fala de `perf`. Idempotente: chamadas repetidas devolvem a mesma API.
 * Sem nada ligado, não cria overlay, não liga contadores e devolve `null`.
 * `?bench=orbit` mede sem overlay: os contadores precisam estar ativos ANTES do contexto WebGL nascer
 * (é `wrap` que decide instrumentar o timer de GPU), por isso o boot já os liga aqui.
 */
export function instalarPerf(url: URL = new URL(location.href)): ApiPerf | null {
  const params = url.searchParams;
  const bench: ModoBench = lerModoBench(params);
  const opcoes = lerOpcoesPerf(params, safeGet(PERF_LOCAL_KEY));
  if (!params.has('perf') && !opcoes.ativo && !bench) {
    desinstalarPerf();
    return null;
  }
  if (instalacao) return instalacao.api;
  if (!opcoes.ativo) {
    if (bench) {
      contadores.ativar();
      const api = apiMedindo(null);
      instalacao = { api, remover: () => publicar(null) };
      publicar(api);
      return api;
    }
    const api = apiDesligada();
    instalacao = { api, remover: () => publicar(null) };
    publicar(api);
    return api;
  }
  contadores.ativar();
  const overlay: OverlayPerf | null = opcoes.overlay ? criarOverlay(() => contadores.snapshot()) : null;
  const api = apiMedindo(overlay);
  publicar(api);
  instalacao = {
    api,
    remover() {
      overlay?.remover();
      publicar(null);
    },
  };
  return api;
}

/** Desliga medição e overlay e remove `window.__hestiaPerf` (usado no teardown do `ViewportCanvas`). */
export function desinstalarPerf(): void {
  if (!instalacao) {
    publicar(null);
    return;
  }
  instalacao.remover();
  instalacao = null;
  contadores.desativar();
}

/**
 * Ctrl+Shift+P: liga/desliga medição e overlay em runtime, sem recarregar. Desligar desinstala na
 * hora; ligar reinstala (instalação e overlay são idempotentes, e os contadores voltam a medir do
 * ponto em que `desativar()` os deixou — `snapshot()` continua legível). A escolha fica no
 * `localStorage['hestia.perf']` para sobreviver ao F5 e à troca de vista. Precedência da URL
 * mantida: com `?perf=0` na URL o atalho não consegue ligar, e nada é gravado em contraste.
 */
export function alternarPerf(): boolean {
  const estavaLigado = instalacao?.api.ativo === true;
  desinstalarPerf();
  if (estavaLigado) {
    safeSet(PERF_LOCAL_KEY, '0');
    return false;
  }
  safeSet(PERF_LOCAL_KEY, '1');
  const api = instalarPerf();
  if (api === null || !api.ativo) {
    safeSet(PERF_LOCAL_KEY, '0');
    return false;
  }
  return true;
}

/** Liga a instrumentação (URL ou localStorage) no ciclo de vida da tela (`?perf=1`). */
export function usePerfDaUrl(): void {
  useEffect(() => {
    instalarPerf();
    return desinstalarPerf;
  }, []);
}

/** Conta um commit React do componente que o chama (sem depender de estado nem de props). */
export function useContarCommitPerf(): void {
  useEffect(() => {
    contadores.contarCommitReact();
  });
}

/** Mede o trabalho de CPU do quadro; com a instrumentação desligada os contadores são no-op. */
export function medirQuadro(desenhar: () => void): void {
  contadores.iniciarQuadro(performance.now());
  try {
    desenhar();
  } finally {
    contadores.encerrarQuadro(performance.now());
  }
}
