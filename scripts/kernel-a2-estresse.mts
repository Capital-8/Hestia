// Projetos de estresse da sub-etapa A2 do kernel Rust (decisão 0047): os da A1 (`projetoDeEstresse`: cantos, T,
// arcos, miter, tipos com prioridades diferentes, alturas diferentes) com os tipos de parede enriquecidos de forma
// determinística pela semente: materiais variados, camadas que contornam a ponta (`wraps`) e `wrapEnds`, faixas
// verticais (rodapé e barra) nos dois lados, e camadas de prioridade igual entre paredes (desempates do pintor).
// Nada de projeto real: só geometria sintética.
import type { Project, WallStrip, WallType, WrapMode } from '@hestia/model';
import { aleatorio, projetoDeEstresse, type OpcoesEstresse } from './kernel-a1-estresse.mts';

const MATERIAIS = ['mat_a', 'mat_b', 'mat_c', 'mat_d'];
const MODOS: WrapMode[] = ['none', 'exterior', 'interior', 'both', 'both'];

/** Enriquece os tipos de parede do projeto (a lista de paredes não muda). */
export function enriquecerTipos(p: Project, semente: number): Project {
  const r = aleatorio(semente * 7919 + 13);
  const wallTypes: Record<string, WallType> = {};
  for (const [id, t] of Object.entries(p.wallTypes)) {
    const layers = t.layers.map((l) => ({
      ...l,
      materialId: MATERIAIS[Math.floor(r() * MATERIAIS.length)]!,
      // camadas de acabamento (fora da estrutura) contornam a ponta livre na maior parte dos tipos
      wraps: l.function !== 'structure' && r() < 0.8,
      // prioridade igual entre camadas de funções diferentes em alguns tipos
      ...(r() < 0.1 ? { priority: Math.floor(r() * 4) + 1 } : {}),
    }));
    const strips: WallStrip[] = [];
    const n = r() < 0.55 ? 1 + Math.floor(r() * 3) : 0;
    for (let k = 0; k < n; k++) {
      const z0 = r() < 0.5 ? 0 : 0.9 + r() * 0.2;
      strips.push({
        id: `fx_${id}_${k}`,
        name: `faixa ${k}`,
        side: r() < 0.5 ? 'exterior' : 'interior',
        materialId: MATERIAIS[Math.floor(r() * MATERIAIS.length)]!,
        thickness: 0.005 + r() * 0.02,
        z0,
        z1: z0 + 0.15 + r() * 0.6,
      });
    }
    wallTypes[id] = { ...t, layers, strips, wrapEnds: MODOS[Math.floor(r() * MODOS.length)]! };
  }
  return { ...p, wallTypes };
}

export function projetoDeEstresseA2(semente: number, opcoes: OpcoesEstresse = {}): Project {
  return enriquecerTipos(projetoDeEstresse(semente, opcoes), semente);
}
