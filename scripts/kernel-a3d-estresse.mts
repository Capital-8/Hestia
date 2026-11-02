// Projetos de estresse da sub-etapa A3d do kernel Rust (decisão 0047 §7): os da A3c (paredes retas e curvas, vãos, retornos, faixas
// verticais) com paredes de PERFIL: pisos que cobrem só parte do eixo (base por trecho, `attachBottomToFloor`), topo anexado ao piso do
// pavimento de cima (`attachTopToFloor`, perfil de topo em degraus) e `topProfile` do modelo (rampas e degraus), tudo calculado pelo
// `wallZRange` do próprio motor TypeScript. Também paredes com membrana (tipo `wt_x_membrana` da A1). Nada de projeto real: só geometria sintética.
import { ProjectStore, createEmptyProject, makeFloor, makeWall, type Command, type Project, type ProfilePoint, type Wall } from '@hestia/model';
import { aleatorio } from './kernel-a1-estresse.mts';
import { projetoDeEstresseA3c } from './kernel-a3c-estresse.mts';
import type { OpcoesEstresseA3a } from './kernel-a3a-estresse.mts';

export interface OpcoesEstresseA3d extends OpcoesEstresseA3a {
  /** Probabilidade de uma parede ter base anexada ao piso (padrão 0,35). */
  base?: number;
  /** Probabilidade de uma parede do térreo ter o topo anexado ao piso do pavimento de cima (padrão 0,5). */
  topo?: number;
  /** Probabilidade de uma parede ter `topProfile` do modelo (padrão 0,18). */
  perfil?: number;
}

const retangulo = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Perfil superior do modelo: rampa, degrau ou serra, sempre com `t` não decrescente e `h` > 0. */
export function perfilDeTopo(r: () => number, comprimento: number): ProfilePoint[] {
  const forma = Math.floor(r() * 3);
  const h = (): number => 0.6 + r() * 2.2;
  if (forma === 0) return [{ t: 0, h: h() }, { t: comprimento, h: h() }];
  if (forma === 1) {
    const t = comprimento * (0.2 + 0.6 * r());
    const a = h();
    const b = h();
    return [{ t: 0, h: a }, { t, h: a }, { t, h: b }, { t: comprimento, h: b }];
  }
  return [{ t: 0, h: h() }, { t: comprimento * 0.3, h: h() }, { t: comprimento * 0.55, h: h() }, { t: comprimento * 1.1, h: h() }];
}

/**
 * Projeto de estresse da A3c com pisos (8 por pavimento, cobrindo parte do eixo de várias paredes) e paredes anexadas (base, topo) ou com
 * `topProfile`. O terreno é sempre o motor TypeScript: `wallZRange` decide o perfil derivado.
 */
export function projetoDeEstresseA3d(semente: number, opcoes: OpcoesEstresseA3d = {}): Project {
  const p0 = projetoDeEstresseA3c(semente, opcoes);
  const r = aleatorio(semente * 2654435 + 17);
  const store = new ProjectStore(p0);
  const cmds: Command[] = [];
  p0.levels.forEach((l) => {
    for (let k = 0; k < 8; k++) {
      const x0 = r() * 10;
      const y0 = r() * 10;
      cmds.push({
        type: 'addFloor',
        floor: makeFloor({ id: `fl_${semente}_${l.id}_${k}`, typeId: 'ft_ceram', levelId: l.id, boundary: retangulo(x0, y0, x0 + 1 + r() * 3, y0 + 1 + r() * 3), heightOffset: [0.05, 0.12, 0.2][Math.floor(r() * 3)]! }),
      });
    }
  });
  store.exec({ type: 'batch', commands: cmds });
  const p = store.project;
  const elementos = Object.fromEntries(
    Object.entries(p.elements).map(([id, e]) => {
      if (e.kind !== 'wall') return [id, e] as const;
      const w = e as Wall;
      const reta = w.sag === 0;
      const comprimento = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const patch: Partial<Wall> = {};
      if (r() < (opcoes.base ?? 0.35)) patch.attachBottomToFloor = true;
      if (w.levelId === p.levels[0]!.id && p.levels.length > 1 && r() < (opcoes.topo ?? 0.5)) {
        patch.attachTopToFloor = true;
        patch.topLevelId = p.levels[1]!.id;
      }
      // reta ou curva (na curva o `topProfile` vale para o motor, mas o recorte das faixas é pulado)
      if (r() < (opcoes.perfil ?? 0.18) * (reta ? 1 : 0.4)) patch.topProfile = perfilDeTopo(r, comprimento);
      return [id, { ...w, ...patch }] as const;
    }),
  );
  return { ...p, elements: elementos };
}

/** Uma parede isolada de perfil conhecido (propriedades): `h` constante na altura dada e base anexada ao piso. */
export function projetoDeParedeComPerfil(topProfile: ProfilePoint[] | null, comPiso: boolean): Project {
  const p0 = createEmptyProject('perfil');
  const store = new ProjectStore(p0);
  const cmds: Command[] = [];
  cmds.push({ type: 'addWall', wall: makeWall({ id: 'WP', typeId: p0.defaults.wallTypeId, levelId: p0.levels[0]!.id, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3, topProfile, attachBottomToFloor: comPiso }) });
  if (comPiso) cmds.push({ type: 'addFloor', floor: makeFloor({ id: 'FP', typeId: 'ft_ceram', levelId: p0.levels[0]!.id, boundary: retangulo(-1, -1, 3, 1), heightOffset: 0.12 }) });
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}
