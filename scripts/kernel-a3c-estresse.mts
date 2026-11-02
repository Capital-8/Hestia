// Projetos e opções de estresse da sub-etapa A3c do kernel Rust (decisão 0047 §7): os da A3a/A3b (paredes retas e curvas, vãos de
// todo o catálogo, retornos) com os tipos de parede enriquecidos da A2 (materiais variados, faixas verticais de rodapé e barra,
// `wrapEnds`) e, para cada pavimento, várias combinações das opções de planta: `cutZ` diferentes (abaixo e acima das faixas e
// das paredes), `outlineWalls` (paredes fora do corte só como contorno) e `planOpenings` (só algumas aberturas furam a planta).
// Nada de projeto real: só geometria sintética.
import { ProjectStore, openingsOfWall, wallsOnLevel, type Command, type Id, type Opening, type Project } from '@hestia/model';
import type { OpcoesA3c } from '../packages/engine/src/kernelA3.ts';
import { aleatorio } from './kernel-a1-estresse.mts';
import { enriquecerTipos } from './kernel-a2-estresse.mts';
import { projetoDeEstresseA3a, type OpcoesEstresseA3a } from './kernel-a3a-estresse.mts';

/** Projeto de estresse da A3a/A3b com os tipos de parede enriquecidos (materiais, faixas verticais, `wrapEnds`). */
export function projetoDeEstresseA3c(semente: number, opcoes: OpcoesEstresseA3a = {}): Project {
  return enriquecerTipos(projetoDeEstresseA3a(semente, opcoes), semente);
}

export interface VarianteA3c {
  nome: string;
  opcoes: OpcoesA3c;
}

/**
 * Combinações de opções de planta de um pavimento, determinísticas pela semente. `zBase` é a menor base de parede do pavimento e
 * `zTopo` o maior topo: `cutZ` abaixo do rodapé, no padrão (1,20 m), no meio da barra e acima de tudo (só contorno).
 */
export function variantesDoNivel(p: Project, levelId: Id, semente: number, zBase: number, zTopo: number): VarianteA3c[] {
  const r = aleatorio(semente * 6151 + 11);
  const paredes = wallsOnLevel(p, levelId).map((w) => w.id);
  const aberturas: Id[] = paredes.flatMap((id) => openingsOfWall(p, id).map((o: Opening) => o.id));
  const sub = <T,>(v: readonly T[], fracao: number): T[] => v.filter(() => r() < fracao);
  const contorno = new Set(sub(paredes, 0.45));
  const metade = new Set(sub(aberturas, 0.5));
  return [
    { nome: 'padrão', opcoes: {} },
    { nome: 'corte baixo', opcoes: { cutZ: zBase + 0.05 } },
    { nome: 'corte na barra', opcoes: { cutZ: zBase + 1.0 } },
    { nome: 'planOpenings metade', opcoes: { planOpenings: metade } },
    { nome: 'planOpenings vazio', opcoes: { planOpenings: new Set<Id>() } },
    { nome: 'corte alto, contorno', opcoes: { cutZ: zTopo + 1, outlineWalls: contorno } },
    { nome: 'corte baixo, contorno e metade', opcoes: { cutZ: zBase + 1.0, outlineWalls: contorno, planOpenings: metade } },
  ];
}

/** Aberturas adicionais determinísticas para exercitar vãos altos, baixos e de pé-direito parcial (sem tocar o resto do projeto). */
export function comVaosExtras(p: Project, semente: number): Project {
  const r = aleatorio(semente * 31 + 5);
  const tipos = Object.values(p.openingTypes);
  const cmds: Command[] = [];
  let n = 0;
  for (const w of Object.values(p.elements)) {
    if (w.kind !== 'wall' || r() >= 0.3) continue;
    const t = tipos[Math.floor(r() * tipos.length)]!;
    cmds.push({
      type: 'addOpening',
      opening: {
        id: `ox_${semente}_${n++}`,
        kind: t.kind,
        typeId: t.id,
        hostId: w.id,
        offset: r() * 8,
        flipHand: r() < 0.5,
        flipFacing: r() < 0.5,
        sillOverride: r() < 0.5 ? r() * 2.2 : null,
        mark: '',
        ...(r() < 0.5 ? { heightOverride: 0.3 + r() * 2.0 } : {}),
      } as Opening,
    });
  }
  const store = new ProjectStore(p);
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}
