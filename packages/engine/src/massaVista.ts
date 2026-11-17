import { isMass, type Id, type Project } from '@hestia/model';
import { distanciaALinhaGC, guardaCorposNaCaixa, type LinhaVistaGC } from './guardaCorpoVista.ts';
import { ESTILO_CORTE_MASSA } from './kernelMassa.ts';
import { servicoMassa, type LinhaCorteMassaProjeto } from './massaServico.ts';
import { planoDaSecao, type SectionResult } from './section.ts';

/**
 * Massa no corte e na elevação (ficha V3; A.4 regra 9). Mesmo molde de `guardaCorpoVista.ts`: as linhas vêm do kernel (consulta 143,
 * `massa_corte`) em `(s, z)` do plano da vista, e aqui só se escolhe o que vale (visível, sob o cursor, dentro da caixa). Sem kernel
 * pronto ou com erro dele, tudo devolve `null` ou vazio, sem lançar: o corte não desenha a massa (A.5, "Kernel desligado ou com erro").
 */

type Pt = { x: number; y: number };

/** Tem alguma massa no projeto? Memorizado por projeto, porque a consulta roda a cada movimento do mouse. */
const comMassa = new WeakMap<Project, boolean>();
export function temMassaNaVista(p: Project): boolean {
  let v = comMassa.get(p);
  if (v === undefined) {
    v = Object.values(p.elements).some((e) => isMass(e));
    comMassa.set(p, v);
  }
  return v;
}

/** Linhas da massa no plano da seção (consulta 143, todos os níveis). `null` sem massa, sem plano, sem kernel pronto ou com erro dele. */
export function linhasCorteDaMassa(p: Project, s: SectionResult): LinhaCorteMassaProjeto[] | null {
  if (!temMassaNaVista(p)) return null;
  const plano = planoDaSecao(s);
  if (!plano) return null;
  return servicoMassa().corte(p, null, plano.a.x, plano.a.y, plano.b.x - plano.a.x, plano.b.y - plano.a.y, plano.depth);
}

/** Tira o que está oculto na vista (Hide in View, isolamento ou categoria desligada, já expandidos em ids). */
export function linhasVisiveisMassa(linhas: readonly LinhaCorteMassaProjeto[], hidden: ReadonlySet<Id>): LinhaCorteMassaProjeto[] {
  return linhas.filter((l) => !hidden.has(l.massaId));
}

/**
 * Para o molde do guarda-corpo: cortado e projetado são contornos fechados; a feição (estilo 3) é linha aberta, então vira eixo
 * (papel 255). O molde não usa o papel para mais nada: ignora o eixo na caixa e mede distância às arestas dele no clique.
 */
function paraGC(l: LinhaCorteMassaProjeto): LinhaVistaGC {
  return {
    guardaId: l.massaId,
    papel: l.estilo === ESTILO_CORTE_MASSA.feicao ? 255 : 1,
    estilo: l.estilo,
    pontos: l.pontos.map((q) => ({ x: q.s, y: q.z })),
  };
}

/** Prioridade no clique: a massa cortada (na frente) antes da projetada e da feição; depois a distância; por fim o id (determinístico). */
const PRIORIDADE: Readonly<Record<number, number>> = { [ESTILO_CORTE_MASSA.cortado]: 0, [ESTILO_CORTE_MASSA.projetado]: 1, [ESTILO_CORTE_MASSA.feicao]: 2 };

/**
 * Massa sob o ponto (s, z) do corte ou da elevação, nas mesmas linhas desenhadas: o contorno cortado ou projetado é a região clicável
 * (dentro dele conta distância zero), e a feição vale só pela linha. Oculta não é alvo. Null se nenhuma está dentro de `tol`.
 */
export function massaNoPonto(linhas: readonly LinhaCorteMassaProjeto[], hidden: ReadonlySet<Id>, ponto: Pt, tol: number): Id | null {
  let melhor: { id: Id; d: number; prio: number } | null = null;
  for (const l of linhasVisiveisMassa(linhas, hidden)) {
    if (l.pontos.length < 2) continue;
    const d = distanciaALinhaGC(ponto, paraGC(l));
    if (d > tol) continue;
    const prio = PRIORIDADE[l.estilo] ?? 3;
    const ganha = !melhor || prio < melhor.prio || (prio === melhor.prio && (d < melhor.d || (d === melhor.d && l.massaId < melhor.id)));
    if (ganha) melhor = { id: l.massaId, d, prio };
  }
  return melhor?.id ?? null;
}

/**
 * Massas que a caixa de seleção do corte pega (coordenadas (s, z)). Janela (`b.x >= a.x`): vale se TODAS as peças visíveis dela (cortado e
 * projetado) ficam inteiras dentro da caixa. Cruzamento: vale se alguma peça toca a caixa. A feição não entra no critério (é linha dentro
 * da peça). Oculta não entra. Mesma regra de `guardaCorposNaCaixa`, que é quem faz a conta.
 */
export function massasNaCaixa(linhas: readonly LinhaCorteMassaProjeto[], hidden: ReadonlySet<Id>, a: Pt, b: Pt): Id[] {
  return guardaCorposNaCaixa(linhas.map(paraGC), hidden, a, b);
}
