import type { Id, Project } from '@hestia/model';
import { assinaturasDasCortinasPorNivel, assinaturasDoProjeto, hashTexto, nivelDoElemento } from '@hestia/engine';

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
export function chavesDeNivel(p: Project, marca: string, visibilidade?: VisibilidadeDaChave, opcoes: { semGuardaCorpo?: boolean } = {}): Map<Id, string> {
  const a = assinaturasDoProjeto(p);
  const semGC = opcoes.semGuardaCorpo === true;
  const vis = visibilidadePorNivel(p, visibilidade, semGC ? 'sem' : 'todos');
  // Conteúdo + visibilidade do nível: é o que os vizinhos por cota e os telhados leem do nível.
  const assinatura = semGC ? a.nivelSemGuardaCorpo : a.nivel;
  const conteudo = (id: Id): string => `${assinatura.get(id) ?? '-'}#${vis.nivel.get(id) ?? ''}`;
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

/**
 * Chave de cada nível para o LOTE 3D DOS GUARDA-CORPOS (só dele): a marca da vista, o bloco global (tipos, materiais, cotas), os guarda-corpos do
 * nível, as escadas e rampas (os hospedeiros) e a visibilidade dos próprios guarda-corpos. Editar paredes, lajes ou o resto do nível não a
 * muda; a chave do nível sem guarda-corpo (`chavesDeNivel` com `semGuardaCorpo`) também não muda ao editar o guarda-corpo. Só há chave para níveis com guarda-corpo.
 */
export function chavesDeGuardaCorpo(p: Project, marca: string, visibilidade?: VisibilidadeDaChave): Map<Id, string> {
  const a = assinaturasDoProjeto(p);
  const vis = visibilidadePorNivel(p, visibilidade, 'so');
  const out = new Map<Id, string>();
  for (const [id, h] of a.guardaCorpo) out.set(id, hashTexto([marca, a.global, a.hospedeiros, h, vis.nivel.get(id) ?? '', vis.global].join('|')));
  return out;
}

const aparenciaMemo = new WeakMap<object, string>();
const materiaisMemo = new WeakMap<object, string>();

/** Hash do que a cortina lê do resto do projeto: os materiais (cor, brilho, opacidade) e a vista 3D (categorias). Os tipos de cortina entram no hash de cada cortina. */
function aparenciaDoProjeto(p: Project): string {
  let m = materiaisMemo.get(p.materials);
  if (m === undefined) materiaisMemo.set(p.materials, (m = hashTexto(JSON.stringify(p.materials))));
  if (!p.view3d) return m;
  let v = aparenciaMemo.get(p.view3d);
  if (v === undefined) aparenciaMemo.set(p.view3d, (v = hashTexto(JSON.stringify(p.view3d))));
  return `${m}.${v}`;
}

/**
 * Chave de cada nível para o LOTE 3D DAS PAREDES CORTINA (só dele; ADR 0056 §9): a marca da vista, os materiais e a vista 3D, o HASH das
 * cortinas do nível (`assinaturasDasCortinasPorNivel`, nunca a serialização da grade) e a visibilidade das cortinas dele. O tamanho da chave não cresce com o
 * número de células, e editar uma cortina só muda a chave do nível dela. Só há chave para níveis com cortina.
 */
export function chavesDeCortina(p: Project, marca: string, visibilidade?: VisibilidadeDaChave): Map<Id, string> {
  const porNivel = assinaturasDasCortinasPorNivel(p);
  const out = new Map<Id, string>();
  if (porNivel.size === 0) return out;
  const vis = new Map<Id, string[]>();
  if (visibilidade) {
    for (const [tag, ids] of [['o', visibilidade.ocultos], ['r', visibilidade.revelados]] as const) {
      for (const id of ids) {
        const e = p.elements[id];
        if (e?.kind !== 'wall' || !porNivel.has(e.levelId)) continue;
        const l = vis.get(e.levelId);
        if (l) l.push(`${tag}:${id}`);
        else vis.set(e.levelId, [`${tag}:${id}`]);
      }
    }
  }
  for (const [id, h] of porNivel) out.set(id, hashTexto([marca, aparenciaDoProjeto(p), h, (vis.get(id) ?? []).sort().join('')].join('|')));
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
function visibilidadePorNivel(p: Project, v: VisibilidadeDaChave | undefined, guardaCorpo: 'todos' | 'sem' | 'so' = 'todos'): { nivel: Map<Id, string>; global: string } {
  const porNivel = new Map<Id, string[]>();
  const globais: string[] = [];
  if (v) {
    for (const [tag, ids] of [['o', v.ocultos], ['r', v.revelados]] as const) {
      for (const id of ids) {
        const e = p.elements[id];
        // Guarda-corpo tem lote e chave próprios: a visibilidade dele só entra na chave dele ('so'), nunca na do nível ('sem').
        const gc = e?.kind === 'railing';
        if ((guardaCorpo === 'sem' && gc) || (guardaCorpo === 'so' && !gc)) continue;
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
