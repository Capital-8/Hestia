import { applyTransform, type Transform, type Vec2 } from '@hestia/geom';
import { areaComSinal } from './validateMass.ts';
import { MASSA_LIMITES, type ArranjoMassa, type Mass, type PerfilMassa, type SecaoMassa } from './massTypes.ts';
import type { Element } from './types.ts';

export const isMass = (e: Element | undefined): e is Mass => e?.kind === 'mass';

/** Seção circular de raio `raio` na altura `z`, sem rotação, escala 1 e centrada (atalho para pilhas simples). */
export const secaoCirculo = (z: number, raio: number): SecaoMassa => ({ z, perfil: { forma: 'circulo', raio }, rotacao: 0, escala: 1, dx: 0, dy: 0 });

/** Monta uma massa com os padrões do modelo; `secoes` é obrigatório. `order` o comando atribui. */
export function makeMass(p: Pick<Mass, 'id' | 'levelId' | 'secoes'> & Partial<Omit<Mass, 'kind' | 'order'>>): Omit<Mass, 'order'> {
  return {
    kind: 'mass',
    name: 'Massa',
    origem: { x: 0, y: 0 },
    baseOffset: 0,
    interpolacao: 'linear',
    resolucao: MASSA_LIMITES.resolucaoPadrao,
    ...p,
  };
}

/** Perfil livre sempre anti-horário (o comando normaliza o sentido; A.3 item 5). Os demais perfis passam como estão. */
export function normalizarPerfil(p: PerfilMassa): PerfilMassa {
  if (p.forma !== 'livre' || p.pontos.length < 3 || areaComSinal(p.pontos) >= 0) return p;
  return { forma: 'livre', pontos: [...p.pontos].reverse() };
}

export const normalizarSecoes = (secoes: readonly SecaoMassa[]): SecaoMassa[] => secoes.map((s) => ({ ...s, perfil: normalizarPerfil(s.perfil) }));

const copiaSecao = (s: SecaoMassa): SecaoMassa => ({ ...s, perfil: s.perfil.forma === 'livre' ? { forma: 'livre', pontos: s.perfil.pontos.map((q) => ({ ...q })) } : { ...s.perfil } });
export const copiarSecoes = (secoes: readonly SecaoMassa[]): SecaoMassa[] => secoes.map(copiaSecao);

/** Vetor (sem translação) depois da transformação: a parte linear do `Transform`. */
function vetorTransformado(t: Transform, v: Vec2): Vec2 {
  if (t.kind === 'translate') return v;
  const o = applyTransform(t, { x: 0, y: 0 });
  const p = applyTransform(t, v);
  return { x: p.x - o.x, y: p.y - o.y };
}

/** Perfil espelhado no eixo x local (y → −y); o anel livre inverte a ordem para continuar anti-horário. */
function perfilEspelhado(p: PerfilMassa): PerfilMassa {
  return p.forma === 'livre' ? { forma: 'livre', pontos: p.pontos.map((q) => ({ x: q.x, y: -q.y })).reverse() } : p;
}

/**
 * Move, gira ou espelha a massa (A.3 item 4). Translação: `origem` e o centro do arranjo. Rotação: soma o ângulo a
 * todas as `rotacao` e gira `origem`, `dx/dy` e o centro do arranjo. Espelho: inverte o sentido dos pontos e as
 * rotações. Em um espelho cuja linha faz o ângulo φ com o eixo x, o espelho do perfil local é y → −y e a rotação
 * vira 2φ − rotacao (igual a −rotacao quando a linha é paralela a x); o arranjo troca o sinal do ângulo total.
 */
export function transformMass(m: Mass, t: Transform): Mass {
  const origem = applyTransform(t, m.origem);
  let arranjo: ArranjoMassa | undefined;
  if (m.arranjo) {
    const c = applyTransform(t, { x: m.arranjo.cx, y: m.arranjo.cy });
    arranjo = { ...m.arranjo, cx: c.x, cy: c.y, anguloTotal: t.kind === 'mirror' ? -m.arranjo.anguloTotal : m.arranjo.anguloTotal };
  }
  const phi = t.kind === 'mirror' ? Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x) : 0;
  const secoes = m.secoes.map((s): SecaoMassa => {
    const d = vetorTransformado(t, { x: s.dx, y: s.dy });
    if (t.kind === 'mirror') return { ...s, perfil: perfilEspelhado(s.perfil), rotacao: 2 * phi - s.rotacao, dx: d.x, dy: d.y };
    return { ...s, perfil: copiaSecao(s).perfil, rotacao: s.rotacao + (t.kind === 'rotate' ? t.angle : 0), dx: d.x, dy: d.y };
  });
  return { ...m, origem, secoes, ...(arranjo ? { arranjo } : {}) };
}
