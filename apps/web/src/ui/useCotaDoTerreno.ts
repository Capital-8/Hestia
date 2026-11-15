import { useMemo } from 'react';
import { servicoTerreno, temTerreno } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { criarSondaDoTerreno } from '../editor/terrenoVista.ts';

/**
 * Cota do terreno proposto (z do projeto) sob o cursor na planta, ou null (fora do terreno, kernel não pronto, outra vista, terreno oculto). Uma sonda
 * memorizada: o kernel só é consultado quando o cursor anda o bastante e passa o intervalo (ver `precisaConsultar`), nunca a cada pixel.
 */
export function useCotaDoTerreno(ocultos: (p: Project) => ReadonlySet<Id>): number | null {
  const project = useProject();
  const cursor = useUi((s) => s.cursor);
  const view = useUi((s) => s.view);
  const levelId = useUi((s) => s.levelId);
  const sonda = useMemo(() => criarSondaDoTerreno((q) => servicoTerreno().cotaDoTerreno(editor.project, [q], 1)?.[0]?.z ?? null), []);
  if (view !== 'plan' || !cursor || !temTerreno(project) || !servicoTerreno().pronto()) return null;
  const zoom = editor.viewport()?.zoom ?? 60;
  const z = sonda.ler(cursor, performance.now(), 1 / zoom, `${editor.store.version}|${levelId}`);
  if (z === null) return null;
  // Terreno oculto pela categoria site (ou pela vista) não responde: a sonda só vale se algum terreno do nível está visível.
  const oc = ocultos(project);
  const algum = Object.values(project.elements).some((e) => e.kind === 'terrain' && e.levelId === levelId && !oc.has(e.id));
  return algum ? z : null;
}
