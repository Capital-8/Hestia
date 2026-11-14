import type { Id, Project } from '@hestia/model';

/**
 * Versões da planta por conteúdo: o guarda-corpo tem camada e chave próprias, então o resto da planta não pode mudar de chave quando só um
 * guarda-corpo muda (e vice-versa). O projeto é imutável com compartilhamento estrutural (o que não mudou mantém a identidade), então comparar
 * a identidade dos elementos basta e custa uma passada pela tabela.
 *
 * - `resto`: muda quando qualquer coisa que NÃO é guarda-corpo muda (paredes, lajes, escadas, níveis, vistas...).
 * - `global`: muda quando algo que o guarda-corpo lê fora dele muda (escadas e rampas hospedeiras, níveis, vistas, configurações).
 * - `porNivel`: muda quando um guarda-corpo do nível muda.
 * - `massa`: muda quando uma massa muda (ou algo do projeto que a camada lê: níveis, vistas, configurações). Massa não muda `resto`.
 */
export interface VersoesPlanta {
  resto: number;
  global: number;
  massa: number;
  porNivel: ReadonlyMap<Id, number>;
}

/** Chaves do projeto que não entram em nenhuma das duas listas (contador de ordem de criação). */
const IGNORADAS = new Set<string>(['elements', 'nextOrder']);

let ultimoProjeto: Project | null = null;
let ultimo: VersoesPlanta = { resto: 0, global: 0, massa: 0, porNivel: new Map() };
let contador = 0;

export function versoesDaPlanta(p: Project): VersoesPlanta {
  if (p === ultimoProjeto) return ultimo;
  const antes = ultimoProjeto;
  if (antes === null) {
    ultimoProjeto = p;
    ultimo = { resto: ++contador, global: ++contador, massa: ++contador, porNivel: new Map() };
    return ultimo;
  }
  const a = antes as unknown as Record<string, unknown>;
  const b = p as unknown as Record<string, unknown>;
  let outras = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (IGNORADAS.has(k)) continue;
    if (a[k] !== b[k]) {
      outras = true;
      break;
    }
  }
  let resto = outras;
  let global = outras;
  let massa = outras;
  const porNivel = new Map(ultimo.porNivel);
  const ids = new Set([...Object.keys(antes.elements), ...Object.keys(p.elements)]);
  for (const id of ids) {
    const x = antes.elements[id];
    const y = p.elements[id];
    if (x === y) continue;
    if ((x === undefined || x.kind === 'railing') && (y === undefined || y.kind === 'railing')) {
      for (const e of [x, y]) if (e?.kind === 'railing') porNivel.set(e.levelId, ++contador);
      continue;
    }
    if ((x === undefined || x.kind === 'mass') && (y === undefined || y.kind === 'mass')) {
      massa = true;
      continue;
    }
    resto = true;
    if ((x ?? y)!.kind === 'stair' || (x ?? y)!.kind === 'ramp') global = true;
  }
  ultimoProjeto = p;
  ultimo = { resto: resto ? ++contador : ultimo.resto, global: global ? ++contador : ultimo.global, massa: massa ? ++contador : ultimo.massa, porNivel };
  return ultimo;
}

/** Os dois projetos diferem só em guarda-corpos e massas (e no contador de ordem)? A vista da planta não lê nenhum dos dois. */
export function mesmoSemGuardaCorpo(a: Project, b: Project): boolean {
  if (a === b) return true;
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (IGNORADAS.has(k)) continue;
    if (x[k] !== y[k]) return false;
  }
  for (const id of new Set([...Object.keys(a.elements), ...Object.keys(b.elements)])) {
    const e = a.elements[id];
    const f = b.elements[id];
    if (e === f) continue;
    if ((e === undefined || e.kind === 'railing' || e.kind === 'mass') && (f === undefined || f.kind === 'railing' || f.kind === 'mass')) continue;
    return false;
  }
  return true;
}
