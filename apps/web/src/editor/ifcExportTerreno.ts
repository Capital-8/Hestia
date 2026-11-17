import { servicoTerreno, temTerreno, type ServicoTerreno } from '@hestia/engine';
import type { IfcTerrenoGeo } from '@hestia/io';
import type { Project } from '@hestia/model';

/**
 * Terrenos do projeto para o IFC (ficha X1, A.7): a malha da superfície PROPOSTA (`terreno_malha`, superfície 1, todos os níveis) do kernel, só o papel
 * `superficie` (as partes com região entram; saia e base ficam de fora), uma malha por terreno. Nada é calculado aqui. Sem terreno no projeto, sem kernel
 * pronto ou com o kernel recusando os dados devolve `undefined`: o terreno não sai e o exportador avisa. `servico` é injetável para os testes.
 */
export function terrenosOf(p: Project, servico: Pick<ServicoTerreno, 'malha'> = servicoTerreno()): IfcTerrenoGeo[] | undefined {
  if (!temTerreno(p)) return undefined;
  const malhas = servico.malha(p, 1, null);
  if (!malhas) return undefined;
  return malhas.map((m) => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const parte of m.partes) {
      if (parte.papel !== 'superficie') continue;
      const base = positions.length / 3;
      for (const v of parte.positions) positions.push(v);
      for (const i of parte.indices) indices.push(i + base);
    }
    return { terrenoId: m.terrenoId, mesh: { positions, indices } };
  });
}
