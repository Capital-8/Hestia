import type { Id, Project } from '@hestia/model';
import { assinaturasDoProjeto, hashTexto, nivelDoElemento } from '@hestia/engine';

export { assinaturasDoProjeto, hashTexto, type AssinaturasProjeto } from '@hestia/engine';

/**
 * Chave de conteúdo por nível da vista 3D. A malha de um nível fica válida enquanto a chave dele não muda. A chave junta:
 *   - a marca da vista (tema, arestas, sombras), que muda a cor e o tipo dos materiais e das arestas;
 *   - o resto do projeto (tipos, materiais, cotas, vista 3D, gráficos), que vale para todos os níveis;
 *   - o conteúdo do próprio nível e o dos vizinhos imediatos por cota (o de cima e o de baixo). Os vizinhos entram porque o
 *     corte e a junção de paredes, e a chegada de escada à laje de cima, dependem deles.
 * Elemento sem nível (que não é nem da própria camada de nível nem esquadria de parede de nível) entra no bloco global:
 * mudar um deles refaz tudo (conservador). Assim a dependência não precisa ser provada elemento a elemento.
 */

/**
 * Chave de cada nível do projeto. `marca` é a marca da vista (tema, arestas, sombras): entra em todas as chaves.
 * Duas chaves iguais garantem a mesma malha; uma chave diferente refaz o nível. Nível com parede anexada ao telhado lê
 * os telhados de TODOS os níveis (`axisRoofs`): a chave deles entra na chave dele, senão editar um telhado de outro
 * nível deixaria a malha antiga na tela.
 */
export function chavesDeNivel(p: Project, marca: string, visibilidade?: VisibilidadeDaChave): Map<Id, string> {
  const a = assinaturasDoProjeto(p);
  const vis = visibilidadePorNivel(p, visibilidade);
  // Conteúdo + visibilidade do nível: é o que os vizinhos por cota e os telhados leem do nível.
  const conteudo = (id: Id): string => `${a.nivel.get(id) ?? '-'}#${vis.nivel.get(id) ?? ''}`;
  const telhados = a.comTelhado.map((id) => conteudo(id)).join('|');
  const out = new Map<Id, string>();
  a.ordem.forEach((id, i) => {
    const abaixo = i > 0 ? conteudo(a.ordem[i - 1]!) : '-';
    const acima = i < a.ordem.length - 1 ? conteudo(a.ordem[i + 1]!) : '-';
    const deTelhado = a.anexadosAoTelhado.has(id) ? telhados : '-';
    out.set(id, hashTexto([marca, a.global, vis.global, abaixo, conteudo(id), acima, deTelhado].join('|')));
  });
  return out;
}

/** Elementos ocultos (Hide in View + temporário) e revelados (Reveal): entram na chave do nível que os contém. */
export interface VisibilidadeDaChave {
  ocultos: ReadonlySet<Id>;
  revelados: ReadonlySet<Id>;
}

/**
 * Assinatura de visibilidade por nível: os ids ocultos/revelados de cada nível, em hash. Id que não é elemento de nível
 * (global, genérico, CAD, vista) vai para a assinatura global, que entra em todas as chaves (conservador, como antes).
 */
function visibilidadePorNivel(p: Project, v: VisibilidadeDaChave | undefined): { nivel: Map<Id, string>; global: string } {
  const porNivel = new Map<Id, string[]>();
  const globais: string[] = [];
  if (v) {
    for (const [tag, ids] of [['o', v.ocultos], ['r', v.revelados]] as const) {
      for (const id of ids) {
        const e = p.elements[id];
        const nivel = e ? nivelDoElemento(p.elements, e) : null;
        const entrada = `${tag}:${id}`;
        if (nivel === null) globais.push(entrada);
        else {
          const lista = porNivel.get(nivel);
          if (lista) lista.push(entrada);
          else porNivel.set(nivel, [entrada]);
        }
      }
    }
  }
  const nivel = new Map<Id, string>();
  for (const [id, lista] of porNivel) nivel.set(id, hashTexto(lista.sort().join('\u0001')));
  return { nivel, global: globais.length ? hashTexto(globais.sort().join('\u0001')) : '-' };
}
