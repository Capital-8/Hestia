import { servicoTerreno, ServicoTerreno } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import type { PlanInput } from './build.ts';
import type { FloorOps } from './floors.ts';
import type { PlanPaint } from './style.ts';
import { regiaoOps, terrenoOps, terrenosDoNivel, regioesDoNivel, type DadosTerreno } from './terreno.ts';

/**
 * Terrenos e regiões ocultos na vista: o Hide in View do usuário (menos os revelados) e, com a categoria `site` desligada, todos os do nível.
 * Mesma regra de `ocultosDoLote`.
 */
export function ocultosDoTerreno(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined, revealed: ReadonlySet<Id> | undefined, categoriaVisivel: boolean): ReadonlySet<Id> | undefined {
  const out = new Set<Id>();
  if (hidden) for (const id of hidden) if (!revealed?.has(id)) out.add(id);
  if (!categoriaVisivel) for (const e of Object.values(p.elements)) if ((e.kind === 'terrain' || e.kind === 'terrainRegion') && e.levelId === levelId) out.add(e.id);
  return out.size > 0 ? out : undefined;
}

/** Dados do kernel para o nível: superfície proposta (1) e, se algum terreno pede, a existente (0). `null` em tudo sem kernel. */
export function dadosDoKernel(p: Project, levelId: Id, comExistente: boolean): DadosTerreno {
  const s = servicoTerreno();
  return {
    propostas: s.curvas(p, 1, levelId),
    existentes: comExistente ? s.curvas(p, 0, levelId) : null,
    bordas: s.planta(p, 1, levelId),
    cotas: (pts) => s.cotaDoTerreno(p, pts, 1),
  };
}

/**
 * Camada de terrenos do nível na planta: regiões (preenchimento e contorno), depois curvas, borda, pontos cotados e rótulos, no estilo da categoria
 * `site`. Terreno de outro nível não entra; planta de área não desenha terreno. Sem terreno no projeto, nada é consultado. `dados` é injetável para teste.
 */
export function terrenoOpsDaPlanta(input: PlanInput, paint: PlanPaint, scale: number, dados?: DadosTerreno): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  if (input.areaPlan || !ServicoTerreno.temTerreno(input.project)) return out;
  const { project: p, levelId } = input;
  const ocultos = ocultosDoTerreno(p, levelId, input.hidden, input.revealed, paint.visible);
  const terrenos = terrenosDoNivel(p, levelId, ocultos);
  const regioes = regioesDoNivel(p, levelId, ocultos);
  if (terrenos.length === 0 && regioes.length === 0) return out;
  const d = dados ?? dadosDoKernel(p, levelId, terrenos.some((t) => t.mostrarExistente));
  for (const r of regioes) {
    const o = regiaoOps(p, r, input.dark, paint);
    out.fills.push(...o.fills);
    out.strokes.push(...o.strokes);
  }
  for (const t of terrenos) {
    const o = terrenoOps(p, t, d, input.theme, input.dark, paint, scale);
    out.strokes.push(...o.strokes);
    out.labels.push(...o.labels);
  }
  return out;
}
