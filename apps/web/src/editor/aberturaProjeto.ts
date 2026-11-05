import { migrateProject, type Id, type Project } from '@hestia/model';
import { publicarProgressoAbertura } from '../ui/progressoAbertura.ts';
import { aquecerPlanta } from './aquecerPlanta.ts';
import { usuarioEmGesto } from './atividadeUsuario.ts';
import { editor } from './controller.ts';
import { restaurarDoCache } from './geometriaAbertura.ts';
import { t, useI18n } from './i18n.ts';
import { iniciarPreparo3d } from '../ui/preparo3d.ts';
import { PreparoProjeto, type TarefaPreparo } from './preparoProjeto.ts';
import { useUi } from './state.ts';

/**
 * Abertura de projeto em duas fases.
 *
 * Fase 1 (curta, na tela): "Lendo arquivo" (parse e migração, com a thread cedida entre as etapas para a barra animar),
 * leitura dos níveis do cache persistente (por conteúdo, `geometriaAbertura.ts`) e "Preparando o pavimento ativo": carga
 * do projeto e primeiro quadro da planta.
 *
 * Fase 2 (segundo plano, sem bloquear): "Preparando o projeto: n de N", em ordem de prioridade — resolução dos níveis
 * (vizinhos do ativo primeiro; o trabalho corre no worker), geometria da planta dos demais pavimentos e os cortes e
 * elevações que já existem em `project.views`. Cooperativa: não começa no meio de um gesto do usuário, uma tarefa
 * pesada por vez e com intervalo. Qualquer edição, ou outra abertura, a cancela. `priorizar` sobe uma tarefa na fila.
 *
 * Última tarefa: a malha 3D (a montagem em fatias de sempre, `montagem3dProgressiva.ts`, iniciada com a planta na tela).
 * Fora da fila: os avisos do projeto, que correm em worker próprio (`avisosWorker.ts`).
 */

const cederThread = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const proximoQuadro = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/** Medidas da última abertura (diagnóstico; visíveis em `window.__hestiaAbertura` com `?debug=1`). */
export interface MedidasAbertura {
  leituraMs: number;
  parseMs: number;
  migracaoMs: number;
  cacheMs: number;
  cargaMs: number;
  niveisDoCache: number;
}

function agendarOcioso(f: () => void, atrasoMs: number): () => void {
  let id: number | ReturnType<typeof setTimeout>;
  let ric = false;
  const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void };
  const rodar = (): void => {
    if (typeof g.requestIdleCallback === 'function') {
      ric = true;
      id = g.requestIdleCallback(f, { timeout: 1000 });
    } else id = setTimeout(f, 0);
  };
  let t: ReturnType<typeof setTimeout> | undefined;
  if (atrasoMs > 0) t = setTimeout(rodar, atrasoMs);
  else rodar();
  return () => {
    if (t !== undefined) clearTimeout(t);
    if (id === undefined) return;
    if (ric) g.cancelIdleCallback?.(id as number);
    else clearTimeout(id as ReturnType<typeof setTimeout>);
  };
}

const preparo = new PreparoProjeto({
  agendar: agendarOcioso,
  agora: () => performance.now(),
  usuarioAtivo: usuarioEmGesto,
  ociosoParaPesadasMs: 1500,
  intervaloPesadasMs: 300,
  aoProgresso: (p) => {
    if (p.total === 0 || p.feitas >= p.total) {
      publicarProgressoAbertura(null);
      desligarVigia();
    } else publicarProgressoAbertura({ fase: 'projeto', feitas: p.feitas, total: p.total });
  },
});

let desligar: Array<() => void> = [];
function desligarVigia(): void {
  for (const d of desligar) d();
  desligar = [];
}

/** Cancela o preparo em segundo plano (nova abertura, edição). */
export function cancelarPreparo(): void {
  preparo.cancelar();
  desligarVigia();
  publicarProgressoAbertura(null);
}

/** Sobe uma tarefa na fila do preparo: o pavimento (planta e resolução) ou a vista (corte, elevação) que o usuário pediu. */
export function priorizar(alvo: { nivel?: Id; vista?: Id }): void {
  if (alvo.nivel) {
    preparo.priorizar(`nivel:${alvo.nivel}`);
    preparo.priorizar(`planta:${alvo.nivel}`);
    editor.fluxo.priorizarNivel(alvo.nivel);
  }
  if (alvo.vista) preparo.priorizar(`corte:${alvo.vista}`);
}

const aguardar = (pronto: () => boolean, maxMs = 180000): Promise<void> =>
  new Promise((resolver) => {
    const t0 = performance.now();
    const volta = (): void => (pronto() || performance.now() - t0 > maxMs ? resolver() : void setTimeout(volta, 30));
    volta();
  });

/** Tarefas da fase 2 para o projeto carregado, na ordem de prioridade descrita acima. */
export function tarefasDoPreparo(p: Project, ativo: Id): TarefaPreparo[] {
  const ids = p.levels.map((l) => l.id);
  const i0 = Math.max(0, ids.indexOf(ativo));
  const dist = (id: Id): number => Math.abs(ids.indexOf(id) - i0);
  const tarefas: TarefaPreparo[] = [];
  for (const id of ids) {
    // 1. vizinhos do ativo (distância 1) antes dos demais; 2. resolução de todos. O worker de resolução já corre sozinho
    // (`FluxoEdicao.abrir`); a tarefa espera o nível ficar pronto e conta no progresso.
    tarefas.push({ id: `nivel:${id}`, grupo: 'nivel', prioridade: dist(id), executar: () => aguardar(() => editor.fluxo.nivelPronto(id) !== null || editor.project !== p) });
  }
  for (const id of ids) {
    if (id === ativo) continue;
    tarefas.push({
      id: `planta:${id}`,
      grupo: 'planta',
      prioridade: 100 + dist(id),
      pesada: true,
      executar: () => {
        if (editor.project !== p) return;
        const st = useUi.getState();
        aquecerPlanta(p, id, editor.store.version, (n) => editor.resolved(n, false), { showUnderlay: st.showUnderlay, underlayLevel: st.underlayLevel, showRoofProjection: st.showRoofProjection });
      },
    });
  }
  for (const v of p.views) {
    tarefas.push({ id: `corte:${v.id}`, grupo: 'corte', prioridade: 200, pesada: true, executar: () => void (editor.project === p && editor.sectionOf(v.id)) });
  }
  // Por último: a malha 3D, para a aba abrir já montada. A montagem corre em fatias e no worker de resolução, como sempre.
  tarefas.push({
    id: 'malha3d',
    grupo: 'malha3d',
    prioridade: 300,
    pesada: true,
    executar: () =>
      aguardar(() => {
        if (editor.project !== p) return true;
        const a = iniciarPreparo3d();
        return !a || a.total === 0 || a.montados >= a.total;
      }, 120000),
  });
  return tarefas;
}

/** Inicia a fase 2 para o projeto que acabou de ser carregado. Só roda num navegador com Worker (testes não a disparam). */
export function iniciarPreparo(): void {
  cancelarPreparo();
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return;
  const p = editor.project;
  const versao = editor.store.version;
  usuarioEmGesto(); // instala os ouvintes de gesto
  // Edição (outra versão do projeto) invalida o que foi aquecido: a fila para. A resolução segue pelo fluxo de edição.
  desligar.push(editor.store.subscribe(() => editor.store.version !== versao && cancelarPreparo()));
  let nivelAnterior = useUi.getState().levelId;
  let vistaAnterior = useUi.getState().sectionId;
  desligar.push(
    useUi.subscribe((s) => {
      if (s.levelId !== nivelAnterior) priorizar({ nivel: (nivelAnterior = s.levelId) });
      if (s.sectionId !== vistaAnterior) priorizar({ vista: (vistaAnterior = s.sectionId) ?? undefined });
    }),
  );
  for (const t of tarefasDoPreparo(p, useUi.getState().levelId)) preparo.adicionar(t);
}

/**
 * Abre o texto de um projeto em duas fases. Devolve o mesmo resultado de `editor.openFromText`. A thread é cedida entre as
 * etapas (a barra anima); o parse e a migração rodam na thread principal porque, medidos, são pequenos perto do resto
 * (ver `MedidasAbertura`).
 */
export async function abrirProjetoPorFases(texto: string, nome: string): Promise<{ ok: true; medidas: MedidasAbertura } | { ok: false; error: string }> {
  const t0 = performance.now();
  cancelarPreparo();
  publicarProgressoAbertura({ fase: 'lendo', feitas: 0, total: 0 });
  try {
    await proximoQuadro();
    const tParse = performance.now();
    const cru = JSON.parse(texto) as unknown;
    const parseMs = performance.now() - tParse;
    await cederThread();
    const tMig = performance.now();
    const projeto = migrateProject(cru);
    const migracaoMs = performance.now() - tMig;
    await cederThread();
    // Níveis do cache (por conteúdo). Não espera mais que o prazo: armazenamento lento não atrasa a abertura.
    const tCache = performance.now();
    const restaurado = await Promise.race([restaurarDoCache(editor.portasAbertura, projeto), new Promise<null>((r) => setTimeout(() => r(null), 600))]);
    const cacheMs = performance.now() - tCache;
    publicarProgressoAbertura({ fase: 'ativo', feitas: 0, total: 0 });
    await cederThread();
    const tCarga = performance.now();
    editor.load(projeto, nome, restaurado ?? undefined);
    const cargaMs = performance.now() - tCarga;
    const medidas: MedidasAbertura = { leituraMs: Math.round(performance.now() - t0), parseMs: Math.round(parseMs), migracaoMs: Math.round(migracaoMs), cacheMs: Math.round(cacheMs), cargaMs: Math.round(cargaMs), niveisDoCache: restaurado?.semeados.size ?? 0 };
    (globalThis as { __hestiaAbertura?: unknown }).__hestiaAbertura = medidas;
    publicarProgressoAbertura(null);
    // O primeiro quadro da planta pinta antes de a fase 2 começar.
    await proximoQuadro();
    iniciarPreparo();
    return { ok: true, medidas };
  } catch (e) {
    publicarProgressoAbertura(null);
    return { ok: false, error: e instanceof Error ? e.message : t(useI18n.getState().lang, 'edc_file_invalid') };
  }
}
