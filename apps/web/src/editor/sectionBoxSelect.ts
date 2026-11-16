import { boxOf, type Box, type Vec2 } from '@hestia/geom';
import type { SectionResult } from '@hestia/engine';
import { guardaCorpoNaCaixaDoCorte, guardaCorposVisiveisNoCorte, massasNaCaixaDoCorte, ownerOf, sectionDimensionPoints, sectionItems, type SectionItem, type SectionPick } from '@hestia/render';
import { angularDimensionGeometry, dimensionGeometry, type Id, type Project, type SectionAnnotations } from '@hestia/model';
import { annotationIdsInBoxOf } from '@hestia/tools';

/**
 * Caixa de seleção na vista de corte, como na planta (`idsInBox` / `selectTool`): arrastar da esquerda para a direita
 * é janela (pega o que está inteiro dentro); da direita para a esquerda é cruzamento (pega o que toca a caixa).
 */
export type ModoDaCaixa = 'janela' | 'cruzamento';

/** Empate (x igual) conta como janela, igual à planta. */
export function modoDaCaixa(a: Vec2, b: Vec2): ModoDaCaixa {
  return b.x >= a.x ? 'janela' : 'cruzamento';
}

/**
 * Gesto do botão no corte sem ferramenta. O botão esquerdo sem Espaço nem Alt faz caixa; meio, Espaço e Alt arrastam a
 * vista (pan). Shift e Ctrl não mudam o gesto: só somam à seleção (`selecaoComCaixa`).
 */
export function gestoDoBotaoNoCorte(p: { botao: number; espaco: boolean; alt: boolean }): 'caixa' | 'pan' {
  return p.botao === 0 && !p.espaco && !p.alt ? 'caixa' : 'pan';
}

/** Dono de um pedaço visível e a caixa que o envolve (em coordenadas (t,z) do corte). */
interface Candidato {
  dono: SectionPick;
  box: Box;
}

/**
 * Pedaços visíveis de um item: com `parts` (corte unido), cada peça vira um candidato com o seu dono; sem `parts`, o
 * item inteiro vale para cada dono dele. Peças vazias ou sem dono não entram.
 */
function candidatosDoItem(item: SectionItem): Candidato[] {
  if (item.parts) {
    const out: Candidato[] = [];
    for (const part of item.parts) {
      const dono = ownerOf(part.origin);
      const pts = part.polygons.flatMap((p) => p.flatMap((r) => r));
      if (dono && pts.length > 0) out.push({ dono, box: boxOf(pts) });
    }
    return out;
  }
  return item.owners.map((dono) => ({ dono, box: item.box }));
}

/**
 * Elementos do corte que a caixa seleciona (coordenadas (t,z)). Usa os mesmos itens visíveis do clique (`sectionItems`),
 * então o que está oculto na vista (`hidden`) não é selecionado. Na janela, um elemento vale se todos os seus pedaços estão inteiros dentro;
 * no cruzamento, se algum pedaço toca a caixa. Devolve ids sem repetição, na ordem da primeira aparição.
 */
export function idsNaCaixaDoCorte(s: SectionResult, a: Vec2, b: Vec2, hidden?: ReadonlySet<Id>): Id[] {
  const caixa = boxOf([a, b]);
  const janela = modoDaCaixa(a, b) === 'janela';
  const dentro = (q: Box): boolean => q.minX >= caixa.minX && q.maxX <= caixa.maxX && q.minY >= caixa.minY && q.maxY <= caixa.maxY;
  const toca = (q: Box): boolean => q.minX <= caixa.maxX && q.maxX >= caixa.minX && q.minY <= caixa.maxY && q.maxY >= caixa.minY;

  const porDono = new Map<string, { id: Id; ok: boolean }>();
  for (const item of sectionItems(s, hidden)) {
    for (const c of candidatosDoItem(item)) {
      const chave = `${c.dono.kind}|${c.dono.id}`;
      const passa = janela ? dentro(c.box) : toca(c.box);
      const atual = porDono.get(chave);
      if (!atual) porDono.set(chave, { id: c.dono.id, ok: passa });
      else atual.ok = janela ? atual.ok && passa : atual.ok || passa;
    }
  }
  return [...new Set([...porDono.values()].filter((v) => v.ok).map((v) => v.id))];
}

/** Guarda-corpos que a caixa pega (as mesmas linhas que o corte desenha; ficam fora do `SectionResult`). Mesma regra de janela e cruzamento. */
export function guardaCorposNaCaixaDoCorteDoProjeto(p: Project, s: SectionResult, a: Vec2, b: Vec2, hidden?: ReadonlySet<Id>): Id[] {
  return guardaCorpoNaCaixaDoCorte(p, s, hidden, a, b);
}

/** Massas que a caixa pega (as linhas do kernel que o corte desenha; ficam fora do `SectionResult`). Mesma regra de janela e cruzamento; sem kernel, nenhuma. */
export function massasNaCaixaDoCorteDoProjeto(p: Project, s: SectionResult, a: Vec2, b: Vec2, hidden?: ReadonlySet<Id>): Id[] {
  return massasNaCaixaDoCorte(p, s, hidden, a, b);
}

/** Seleção depois da caixa: Shift/Ctrl somam à seleção atual; sem eles, a caixa substitui (como na planta). */
export function selecaoComCaixa(atual: readonly Id[], ids: readonly Id[], somar: boolean): Id[] {
  return somar ? [...new Set([...atual, ...ids])] : [...ids];
}

/**
 * Cotas e demais anotações do corte dentro da caixa (coordenadas (t,z)): a MESMA regra de janela e cruzamento da planta
 * (`annotationIdsInBoxOf`, em tools). No corte as cotas não resolvem `refs`: vale o `a`/`b` gravado, como no clique.
 */
export function anotacoesNaCaixaDoCorte(an: SectionAnnotations, a: Vec2, b: Vec2, escala: number): Id[] {
  return annotationIdsInBoxOf({ scale: escala, ...an }, a, b, {
    linear: (d) => {
      const pts = sectionDimensionPoints(d);
      return dimensionGeometry(pts.a, pts.b, d.offset, escala / 1000, d.textHeight, d.textAt);
    },
    angular: (d) => angularDimensionGeometry(d),
  });
}

/**
 * "Selecionar todas as instâncias → Visíveis na vista" no corte: os elementos do tipo dado que aparecem no desenho
 * (itens visíveis, sem os ocultos da vista), de qualquer pavimento. Ordem da primeira aparição, sem repetição.
 */
export function idsVisiveisDoTipoNoCorte(p: Project, s: SectionResult, typeId: Id, hidden?: ReadonlySet<Id>): Id[] {
  const vistos = new Set<Id>();
  for (const item of sectionItems(s, hidden)) for (const c of candidatosDoItem(item)) vistos.add(c.dono.id);
  for (const id of guardaCorposVisiveisNoCorte(p, s, hidden)) vistos.add(id);
  return [...vistos].filter((id) => (p.elements[id] as { typeId?: Id } | undefined)?.typeId === typeId);
}
