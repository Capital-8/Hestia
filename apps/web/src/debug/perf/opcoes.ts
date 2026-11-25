/**
 * Opções do `?perf` lidas da URL. Puro (sem DOM) para poder ser testado em Node.
 *
 * - sem `perf` → desligado (nenhuma medição, nenhum overlay);
 * - `?perf=1` (ou `?perf`) → medição ligada e overlay visível;
 * - `?perf=0` → desligado (a API `__hestiaPerf` ainda responde com zeros);
 * - `?perf=1&overlay=0` → mede sem desenhar o overlay;
 * - sem `perf` na URL, `salvo === '1'` (o `localStorage['hestia.perf']` que o chamador leu) liga
 *   medição e overlay — é o caminho do atalho Ctrl+Shift+P no desktop, onde não há barra de
 *   endereço. A URL continua mandando: com `perf` presente, `salvo` é ignorado.
 *
 * Quem lê o `localStorage` é o chamador (`debug/perf/index.ts`); este módulo recebe o valor pronto.
 */
export interface OpcoesPerf {
  ativo: boolean;
  overlay: boolean;
}

/** Modo de bench pedido pela URL (`?bench=orbit`); null = app normal, nada roda. */
export type ModoBench = 'orbit' | null;

export function lerOpcoesPerf(params: URLSearchParams, salvo?: string | null): OpcoesPerf {
  const bruto = params.get('perf');
  if (bruto === null && salvo === '1') return { ativo: true, overlay: true };
  const desligado = bruto === null || bruto === '0' || bruto.toLowerCase() === 'false' || bruto.toLowerCase() === 'off';
  return { ativo: !desligado, overlay: !desligado && params.get('overlay') !== '0' };
}

/** `?bench=orbit` (ou `?bench`, atalho): único bench implementado é o de órbita (ver `bench.ts`). */
export function lerModoBench(params: URLSearchParams): ModoBench {
  const bruto = params.get('bench');
  return bruto === null || bruto === '0' || bruto.toLowerCase() === 'off' ? null : bruto === '' || bruto === 'orbit' ? 'orbit' : null;
}
