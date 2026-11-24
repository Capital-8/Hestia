/**
 * Autopreparo do bench de órbita (`?bench=orbit`) — refinamento do WP-A0.
 *
 * Para quê: medir WebKitGTK × Chrome sem automação de mouse/teclado. Se o app abre direto na tela
 * de projetos (nenhum documento, nenhum `ViewportCanvas` montado), o bench nunca teria cena para
 * girar. Este módulo prepara a casa sozinho, repisando o que os e2e fazem por fora
 * (`tests/e2e/3d-niveis.mjs` + `abreVista3d` de `helpers.mjs`):
 *
 * 1. sem projeto (e sem sessão em restauração), cria o template `house2` via `editor.newProject`
 *    e entra no editor (`tela: 'editor'`, como o `HomeScreen` faz);
 * 2. abre/ativa a vista 3D (`editor.setView('3d')` + aba `{kind:'3d'}` em `openViews`);
 * 3. espera a montagem completa pelos mesmos números do canvas (`window.__hestia3dMontagem`,
 *    exposto também com `?bench=orbit`): os 300 quadros em si começam no `ViewportCanvas`, na
 *    primeira vez em que `montados >= total` — este módulo nunca orbita a câmera;
 * 4. passou do prazo (60 s, como o e2e) sem montar, escreve `HESTIA-BENCH erro=preparo` no
 *    `document.title` para o leitor externo (`xprop`) diferenciar falha de lentidão.
 *
 * Só roda com `bench=orbit` na URL; sem o parâmetro, `autoPrepararBenchOrbita` retorna na hora.
 */
import { editor } from '../../editor/controller.ts';
import { lerSessao } from '../../editor/sessao.ts';
import { useUi } from '../../editor/state.ts';
import { lerModoBench } from './opcoes.ts';

/** Prazo do preparo (o mesmo do `waitForFunction` do e2e): kernel lento + montagem em fatias. */
export const PRAZO_PREPARO_MS = 60_000;
/** Intervalo de observação do preparo (não desenho: só checar estado). */
export const INTERVALO_PREPARO_MS = 200;

export const TITULO_FALHA_PREPARO = 'HESTIA-BENCH erro=preparo';

interface JanelaComMontagem {
  __hestia3dMontagem?: { montados: number; total: number } | null;
}

/** A cena 3D montou por completo? Aí o `ViewportCanvas` assume (300 quadros → título). */
export function preparoPronto(): boolean {
  if (typeof window === 'undefined') return true; // sem janela não há o que preparar nem de quem observar
  const m = (window as unknown as JanelaComMontagem).__hestia3dMontagem;
  return !!m && m.total > 0 && m.montados >= m.total;
}

export type PassoPreparo = 'criou-projeto' | 'tentou-projeto' | 'abriu-3d' | 'esperando-restauracao';

/**
 * Um tick do preparo (exportado para teste): cria o projeto que falta ou abre a vista 3D. Sessão de
 * F5 em restauração = esperar (senão o bench atropelaria o projeto retomado).
 *
 * O `newProject` é engolido de propósito: no Vite dev o kernel wasm pode lançar DENTRO de
 * `load()` DEPOIS de `store.load` (o projeto já existe, com níveis), e deixar a exceção subir
 * pulava o `setState({tela:'editor'})` e matava o laço. A troca para o editor só acontece com
 * projeto de verdade na tela (`levels.length > 0`); sem isso, o próximo tick tenta de novo.
 */
export function passoPreparo(): PassoPreparo {
  const st = useUi.getState();
  if (st.tela !== 'editor') {
    // Sessão de F5 em restauração tem prioridade sobre o projeto sintético: não a atropela.
    if (lerSessao() !== null) return 'esperando-restauracao';
    try {
      editor.newProject('house2');
    } catch {
      // Corrida do kernel no dev: `load()` pode lançar DEPOIS de `store.load` — o projeto já está
      // na tela, mas o `setState` do chamador foi pulado. A exceção não pode subir (matava o laço).
    }
    // Só entra no editor com projeto de verdade: se o load morreu antes do `store.load`, o
    // próximo tick tenta de novo (e o prazo de 60 s do laço limita as tentativas).
    if (editor.project.levels.length === 0) return 'tentou-projeto';
    useUi.setState({ tela: 'editor' });
    return 'criou-projeto';
  }
  if (st.view !== '3d') editor.setView('3d');
  if (!st.openViews.some((v) => v.kind === '3d')) useUi.setState({ openViews: [...st.openViews, { kind: '3d' }] });
  return 'abriu-3d';
}

export interface DepsPreparo {
  agendar(cb: () => void, ms: number): void;
  agora(): number;
  prazoMs: number;
  intervaloMs: number;
  /** Título de falha (DOM); injectável para o teste não depender de janela. */
  escreverTitulo(t: string): void;
}

const depsPadrao: DepsPreparo = {
  agendar: (cb, ms) => void setTimeout(cb, ms),
  agora: () => Date.now(),
  prazoMs: PRAZO_PREPARO_MS,
  intervaloMs: INTERVALO_PREPARO_MS,
  escreverTitulo: (x) => { document.title = x; },
};

/** Boot do autopreparo (chamado pela raiz do app): sem `?bench=orbit` na URL, não faz nada. */
export function autoPrepararBenchOrbita(url: URL = new URL(location.href), deps: DepsPreparo = depsPadrao): void {
  if (!lerModoBench(url.searchParams)) return;
  const inicio = deps.agora();
  const laco = (): void => {
    if (preparoPronto()) return;
    if (deps.agora() - inicio > deps.prazoMs) {
      deps.escreverTitulo(TITULO_FALHA_PREPARO);
      return;
    }
    // `finally` agendando: nenhum passo que lança (kernel dev, estado transitório) mata o laço;
    // o prazo acima limita o total — no fim, o título diz `erro=preparo` para o leitor externo.
    try {
      passoPreparo();
    } finally {
      deps.agendar(laco, deps.intervaloMs);
    }
  };
  deps.agendar(laco, 0);
}
