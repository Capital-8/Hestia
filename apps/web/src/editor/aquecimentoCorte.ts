import { ProjectStore, createEmptyProject, isWall, makeWall, type Project, type SectionView, type Wall } from '@hestia/model';
import type { ClienteResolucao } from '@hestia/engine/src/worker/cliente.ts';

/**
 * Aquecimento do corte e da elevação (etapa W). O primeiro corte com parede inclinada roda o caminho TS "frio" no worker
 * (a guarda E5 impede o Rust) e custa 0,5 a 0,8 s. Aqui o worker calcula, em ociosidade, uma seção e uma elevação de um
 * projeto sintético (20 paredes a 15°, janela inclinada e porta vertical) para compilar os caminhos quentes (JIT).
 * Os pedidos usam ids de vista próprios, então nunca disputam a chave de uma vista real nem tocam o cache de cortes.
 */
export const VISTA_AQUECIMENTO_CORTE = '__aquecimento_corte';
export const VISTA_AQUECIMENTO_ELEVACAO = '__aquecimento_elevacao';

/** Projeto descartável: zigue-zague de paredes inclinadas com vãos, mais uma vista de corte e uma de elevação. */
export function projetoDeAquecimento(): Project {
  const base = createEmptyProject();
  const s = new ProjectStore(base);
  // Zigue-zague de 20 paredes (linha de corte de ~60 m): exercita as uniões do Clipper em escala de projeto real.
  const N = 20;
  const pts = Array.from({ length: N + 1 }, (_, i) => ({ x: i * 3, y: i % 2 ? 2 : 0 }));
  for (let i = 0; i < N; i++) {
    s.exec({ type: 'addWall', wall: makeWall({ id: `aq_w${i}`, typeId: base.defaults.wallTypeId, levelId: base.levels[0]!.id, height: 2.8, a: pts[i]!, b: pts[i + 1]!, tilt: 15 }) as Wall });
  }
  const tipo = (k: 'window' | 'door'): string => (k === 'window' ? base.defaults.windowTypeId : base.defaults.doorTypeId);
  s.exec({ type: 'addOpening', opening: { id: 'aq_j', kind: 'window', typeId: tipo('window'), hostId: 'aq_w0', offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as never });
  s.exec({ type: 'addOpening', opening: { id: 'aq_p', kind: 'door', typeId: tipo('door'), hostId: 'aq_w1', offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '', plano: 'vertical' } as never });
  const p = s.project;
  const vistas: SectionView[] = [
    { id: VISTA_AQUECIMENTO_CORTE, name: 'aq', kind: 'section', a: { x: -2, y: 1 }, b: { x: 62, y: 1 }, depth: 6 },
    { id: VISTA_AQUECIMENTO_ELEVACAO, name: 'aq', kind: 'elevation', role: 'south', a: { x: -2, y: -3 }, b: { x: 62, y: -3 }, depth: 12 } as SectionView,
  ];
  return { ...p, views: [...p.views, ...vistas] };
}

export const temParedeInclinada = (p: Project): boolean => Object.values(p.elements).some((e) => isWall(e) && !!e.tilt);

type Agendador = (f: () => void) => void;

/** Roda `f` quando o navegador estiver ocioso (depois do primeiro desenho); sem `requestIdleCallback`, num `setTimeout`. */
export const emOciosidade: Agendador = (f) => {
  const g = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(f, { timeout: 1500 });
  else setTimeout(f, 200);
};

/**
 * Pede ao worker a seção e depois a elevação sintéticas, cada uma num turno ocioso próprio (a interface nunca espera
 * as duas juntas). Devolve a promessa do conjunto; erros e cancelamentos são ignorados (aquecimento é opcional).
 */
export function aquecerCorteNoWorker(cliente: ClienteResolucao, agendar: Agendador = emOciosidade, aoTerminar?: () => void): Promise<void> {
  const projeto = projetoDeAquecimento();
  const pedir = (id: string): Promise<void> =>
    new Promise((ok) => agendar(() => { cliente.resolver('corte', id, projeto, 0).then(() => ok(), () => ok()); }));
  return pedir(VISTA_AQUECIMENTO_CORTE).then(() => pedir(VISTA_AQUECIMENTO_ELEVACAO)).then(() => aoTerminar?.());
}
