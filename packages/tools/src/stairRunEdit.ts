import { dist, mid, sub } from '@hestia/geom';
import { generateStraightRun } from '@hestia/engine';
import { defaultUnits, formatQuantity, type ResolvedUnits, type Stair, type StairLanding, type StairRun } from '@hestia/model';
import { t as translate, type Lang } from './i18n.ts';

/**
 * Nº de espelhos editado nas Propriedades de uma escada reta gerada (2º clique da ferramenta). O comprimento do lance
 * (do 1º ao último espelho) e a largura ficam; o piso vira comprimento ÷ (N − 1) e a altura do espelho, H ÷ N, que o
 * modelo calcula sozinho. Erro em pt-BR se a escada não é um lance reto gerado ou se o piso fica abaixo do mínimo.
 */
export function regenStraightComponents(stair: Stair, risers: number, minTread: number, u: ResolvedUnits = defaultUnits(), lang: Lang = 'pt'): { components: Array<StairRun | StairLanding> } | { error: string } {
  const only = stair.components[0];
  if (stair.components.length !== 1 || only?.kind !== 'run' || only.generatedBy !== 'straight') {
    return { error: translate(lang, 'tl_msg_risers_edit_straight') };
  }
  if (!Number.isInteger(risers) || risers < 2) return { error: 'o nº de espelhos é pelo menos 2.' };
  const first = only.risers[0];
  const last = only.risers[only.risers.length - 1];
  if (!first || !last || only.risers.length < 2) return { error: 'a escada não tem espelhos suficientes.' };
  // Espelho gerado: as pontas são o limite esquerdo (a) e o direito (b); o centro do 1º e do último dão o eixo.
  const c0 = mid(first.a, first.b);
  const c1 = mid(last.a, last.b);
  const length = dist(c0, c1);
  const width = dist(first.a, first.b);
  if (!(length > 0) || !(width > 0)) return { error: 'a escada não tem comprimento ou largura válidos.' };
  const tread = length / (risers - 1);
  if (tread < minTread - 1e-9) {
    return { error: `com ${risers} espelhos o piso ficaria em ${formatQuantity(u, 'smallLength', tread)}, abaixo do mínimo do tipo (${formatQuantity(u, 'smallLength', minTread)}).` };
  }
  const sketch = generateStraightRun({ start: c0, dir: sub(c1, c0), width, risers, tread });
  const run: StairRun = {
    id: only.id,
    kind: 'run',
    generatedBy: 'straight',
    boundaryLeft: sketch.boundaryLeft,
    boundaryRight: sketch.boundaryRight,
    risers: sketch.risers,
    path: sketch.path,
  };
  return { components: [run] };
}
