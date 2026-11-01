import type { Id, Project } from '@hestia/model';

/**
 * Chave de conteúdo por nível da vista 3D. A malha de um nível fica válida enquanto a chave dele não muda. A chave junta:
 *   - a marca da vista (tema, arestas, sombras), que muda a cor e o tipo dos materiais e das arestas;
 *   - o resto do projeto (tipos, materiais, cotas, vista 3D, gráficos), que vale para todos os níveis;
 *   - o conteúdo do próprio nível e o dos vizinhos imediatos por cota (o de cima e o de baixo). Os vizinhos entram porque o
 *     corte e a junção de paredes, e a chegada de escada à laje de cima, dependem deles.
 * Elemento sem nível (que não é nem da própria camada de nível nem esquadria de parede de nível) entra no bloco global:
 * mudar um deles refaz tudo (conservador). Assim a dependência não precisa ser provada elemento a elemento.
 */

/** Hash de 53 bits (cyrb53) de um texto: chave curta e estável. A colisão é desprezível para comparar conteúdos de nível. */
export function hashTexto(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Nível de um elemento: o próprio `levelId`, ou, na esquadria, o da parede que a hospeda. Sem nível: null. */
function nivelDoElemento(elementos: Project['elements'], e: object): Id | null {
  const campos = e as { levelId?: unknown; hostId?: unknown };
  if (typeof campos.levelId === 'string') return campos.levelId;
  if (typeof campos.hostId === 'string') {
    const host = elementos[campos.hostId] as { levelId?: unknown } | undefined;
    if (typeof host?.levelId === 'string') return host.levelId;
  }
  return null;
}

/** Assinaturas do projeto: o bloco global, o conteúdo de cada nível e a ordem dos níveis por cota. */
export interface AssinaturasProjeto {
  global: string;
  nivel: Map<Id, string>;
  /** Ids dos níveis do mais baixo ao mais alto (cota; empate pela ordem do projeto). */
  ordem: Id[];
  /** Níveis com parede de topo anexado ao telhado: a malha do nível depende dos telhados de qualquer nível. */
  anexadosAoTelhado: Set<Id>;
  /** Ids dos níveis que têm telhado, na ordem do projeto. */
  comTelhado: Id[];
}

/** Assinaturas do projeto para as chaves dos níveis (uma passada sobre os elementos). */
export function assinaturasDoProjeto(p: Project): AssinaturasProjeto {
  // Fora da assinatura global: o que não entra na geometria 3D nem na resolução dos níveis. Cortes/elevações (`views`),
  // plantas de área, categorias e esquemas de cor de ambiente, contador de ordem e nome. Antes, apagar um corte ou criar
  // qualquer elemento (o `nextOrder` sobe) mudava a chave de TODOS os pavimentos e remontava o prédio inteiro (~6 s).
  // Os ajustes da vista 3D (`view3d`), `settings`, `defaults`, tipos e materiais continuam dentro.
  const { elements, views: _views, areaPlans: _areaPlans, roomCategories: _roomCategories, colorSchemes: _colorSchemes, nextOrder: _nextOrder, name: _name, ...resto } = p;
  const porNivel = new Map<Id, string[]>();
  const globais: string[] = [];
  const anexadosAoTelhado = new Set<Id>();
  const comTelhado = new Set<Id>();
  for (const id of Object.keys(elements)) {
    const e = elements[id]!;
    const linha = `${id}:${JSON.stringify(e)}`;
    const nivel = nivelDoElemento(elements, e);
    if (nivel === null) globais.push(linha);
    else {
      const lista = porNivel.get(nivel);
      if (lista) lista.push(linha);
      else porNivel.set(nivel, [linha]);
      if (e.kind === 'wall' && e.attachTopToRoof === true) anexadosAoTelhado.add(nivel);
      if (e.kind === 'roof') comTelhado.add(nivel);
    }
  }
  const nivel = new Map<Id, string>();
  for (const l of p.levels) nivel.set(l.id, hashTexto((porNivel.get(l.id) ?? []).join('\n')));
  const ordem = p.levels
    .map((l, i) => ({ id: l.id, cota: l.elevation, i }))
    .sort((a, b) => a.cota - b.cota || a.i - b.i)
    .map((l) => l.id);
  return {
    global: hashTexto(`${JSON.stringify(resto)}\u0002${globais.join('\n')}`),
    nivel,
    ordem,
    anexadosAoTelhado,
    comTelhado: p.levels.filter((l) => comTelhado.has(l.id)).map((l) => l.id),
  };
}

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
