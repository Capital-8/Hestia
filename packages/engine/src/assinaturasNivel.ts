import type { Id, Project } from '@hestia/model';

/**
 * Assinaturas de conteúdo do projeto por nível (hash do JSON dos elementos). Servem de chave de cache para quem só
 * precisa refazer o que mudou: a malha 3D de um nível (`chavesDeNivel`, em `@hestia/render`) e as partes do corte por
 * pavimento (`sectionIncremental.ts`).
 */

/** Hash de 53 bits (cyrb53) de um texto: chave curta e estável. A colisão é desprezível para comparar conteúdos de nível. */
const NL = String.fromCharCode(10);

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

/**
 * Hash do conteúdo de uma malha (posições e índices), direto dos números, sem passar por texto. O `JSON.stringify` de uma
 * malha de IFC (milhões de números; e um `Float32Array` vira um objeto com uma chave por índice) custava ~10 s por
 * chamada. O resultado é guardado por objeto de malha: o projeto é imutável, uma edição troca o objeto `mesh` do
 * elemento, então a mesma referência tem sempre o mesmo conteúdo e só a primeira passada paga o custo.
 */
const hashesDeMalha = new WeakMap<object, string>();

function misturar(h: number, valores: ArrayLike<number>): number {
  for (let i = 0; i < valores.length; i++) h = Math.imul(h ^ (valores[i]! | 0), 2654435761);
  return h;
}

/** Palavras de 32 bits do vetor: os bytes de um typed array de 4 bytes, ou o `float32` de cada número de um array comum (projeto antigo). */
function palavras(v: ArrayLike<number>, inteiros: boolean): ArrayLike<number> {
  if (v instanceof Float32Array || v instanceof Uint32Array || v instanceof Int32Array) return new Uint32Array(v.buffer, v.byteOffset, v.length);
  return inteiros ? Uint32Array.from(v) : new Uint32Array(Float32Array.from(v).buffer);
}

function hashDaMalha(mesh: { positions: ArrayLike<number>; indices: ArrayLike<number> }): string {
  const hit = hashesDeMalha.get(mesh);
  if (hit) return hit;
  let h = 0x9e3779b9 ^ mesh.positions.length;
  h = misturar(h, palavras(mesh.positions, false));
  h = Math.imul(h ^ mesh.indices.length, 1597334677);
  h = misturar(h, palavras(mesh.indices, true));
  const hash = `${mesh.positions.length}.${mesh.indices.length}.${(h >>> 0).toString(36)}`;
  hashesDeMalha.set(mesh, hash);
  return hash;
}

/** Texto do elemento para a assinatura: o JSON de tudo, menos a malha dos genéricos, que entra como hash do conteúdo. */
function textoDoElemento(e: Project['elements'][string]): string {
  if (e.kind !== 'generic') return JSON.stringify(e);
  const { mesh, ...resto } = e;
  return `${JSON.stringify(resto)}#${hashDaMalha(mesh)}`;
}

/** Nível de um elemento: o próprio `levelId`, ou, na esquadria, o da parede que a hospeda. Sem nível: null. */
export function nivelDoElemento(elementos: Project['elements'], e: object): Id | null {
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
  /** Hash dos pisos, lajes, escadas, rampas e telhados do projeto inteiro: os cortadores de qualquer nível os leem. */
  horizontais: string;
  nivel: Map<Id, string>;
  /** Como `nivel`, sem os guarda-corpos: a malha 3D das paredes, lajes e escadas não depende deles (eles têm lote e chave próprios). */
  nivelSemGuardaCorpo: Map<Id, string>;
  /** Hash dos guarda-corpos de cada nível (só dos níveis que têm). */
  guardaCorpo: Map<Id, string>;
  /**
   * Hash das massas do projeto, igual em todos os níveis: uma massa ocupa vários pavimentos, então qualquer uma pode cruzar a cota de um
   * nível sem ser dele. Conservador de propósito: editar uma massa muda a assinatura de todos os níveis.
   */
  massa: Map<Id, string>;
  /** Hash das escadas e rampas do projeto: os hospedeiros de que o caminho do guarda-corpo depende. */
  hospedeiros: string;
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
  // Os ajustes da vista 3D (`view3d`), `settings`, `defaults`, tipos e materiais continuam dentro. A `thumbnail` também
  // fica fora: é a imagem da tela inicial, refeita a cada salvamento, e não pode mudar a chave de nenhum nível.
  const { elements, views: _views, areaPlans: _areaPlans, roomCategories: _roomCategories, colorSchemes: _colorSchemes, nextOrder: _nextOrder, name: _name, thumbnail: _thumbnail, ...resto } = p;
  const porNivel = new Map<Id, string[]>();
  const porNivelSemGuarda = new Map<Id, string[]>();
  const guardas = new Map<Id, string[]>();
  const massasDoProjeto: string[] = [];
  const hospedeiros: string[] = [];
  const globais: string[] = [];
  const anexadosAoTelhado = new Set<Id>();
  const comTelhado = new Set<Id>();
  const horizontais: string[] = [];
  for (const id of Object.keys(elements)) {
    const e = elements[id]!;
    // O lote é só de planta e prancha: não entra na malha 3D nem no corte, então editá-lo não muda a chave de nenhum nível.
    // Terreno e região de terreno (ficha V2) também ficam de fora: o terreno tem malha, chave e cache próprios (kernel, por assinatura) e não é parte do edifício.
    if (e.kind === 'lot' || e.kind === 'terrain' || e.kind === 'terrainRegion') continue;
    const linha = `${id}:${textoDoElemento(e)}`;
    const nivel = nivelDoElemento(elements, e);
    if (e.kind === 'floor' || e.kind === 'slab' || e.kind === 'stair' || e.kind === 'ramp' || e.kind === 'roof') horizontais.push(linha);
    if (e.kind === 'stair' || e.kind === 'ramp') hospedeiros.push(linha);
    if (e.kind === 'mass') massasDoProjeto.push(linha);
    if (nivel === null) globais.push(linha);
    else {
      const lista = porNivel.get(nivel);
      if (lista) lista.push(linha);
      else porNivel.set(nivel, [linha]);
      const alvo = e.kind === 'railing' ? guardas : porNivelSemGuarda;
      const l2 = alvo.get(nivel);
      if (l2) l2.push(linha);
      else alvo.set(nivel, [linha]);
      if (e.kind === 'wall' && e.attachTopToRoof === true) anexadosAoTelhado.add(nivel);
      if (e.kind === 'roof') comTelhado.add(nivel);
    }
  }
  const nivel = new Map<Id, string>();
  for (const l of p.levels) nivel.set(l.id, hashTexto((porNivel.get(l.id) ?? []).join('\n')));
  const nivelSemGuardaCorpo = new Map<Id, string>();
  for (const l of p.levels) nivelSemGuardaCorpo.set(l.id, hashTexto((porNivelSemGuarda.get(l.id) ?? []).join(NL)));
  const guardaCorpo = new Map<Id, string>();
  for (const [id, lista] of guardas) guardaCorpo.set(id, hashTexto(lista.join(NL)));
  const massaHash = hashTexto(massasDoProjeto.join(NL));
  const massa = new Map<Id, string>();
  for (const l of p.levels) massa.set(l.id, massaHash);
  const ordem = p.levels
    .map((l, i) => ({ id: l.id, cota: l.elevation, i }))
    .sort((a, b) => a.cota - b.cota || a.i - b.i)
    .map((l) => l.id);
  return {
    horizontais: hashTexto(horizontais.join('\n')),
    global: hashTexto(`${JSON.stringify(resto)}\u0002${globais.join('\n')}`),
    nivel,
    nivelSemGuardaCorpo,
    guardaCorpo,
    massa,
    hospedeiros: hashTexto(hospedeiros.join(NL)),
    ordem,
    anexadosAoTelhado,
    comTelhado: p.levels.filter((l) => comTelhado.has(l.id)).map((l) => l.id),
  };
}
