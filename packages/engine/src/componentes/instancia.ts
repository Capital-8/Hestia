import { levelElevation, type Component, type Familia, type Project } from '@hestia/model';
import { ringArea, union, v2, type MultiPolygon } from '@hestia/geom';
import type { Malha, MalhasDasPecas } from './malha.ts';
import { malhaDasPecas } from './malha.ts';
import { resolverFamilia } from './resolver.ts';
import type { PecaResolvida, ResolucaoFamilia } from './pecas.ts';

/*
 * Componente colocado no projeto (ADR 0049 §3.1): da INSTÂNCIA (`Component`) à geometria no mundo. FICHA E8-motor: implementar as quatro
 * funções abaixo. Testes em `instancia.test.ts`. Puras e numéricas (metros). Mundo = `R(rotation) · E · local + (x, y)` no plano, com `E`
 * espelhando o eixo X local quando `mirrored`, e altura Z = `levelElevation(p, c.levelId) + c.z + z local` (`levelElevation` de `@hestia/model`).
 */

/** Biblioteca vazia fixa: `WeakMap` precisa de um objeto estável quando o projeto não tem `componentFamilies`. */
const SEM_FAMILIAS: Record<string, Familia> = {};
/** Memória por `p.componentFamilies`: uma edição imutável do projeto troca o objeto e invalida sozinha. */
const MEMORIA = new WeakMap<object, Map<string, ResolucaoFamilia>>();
/** Abaixo disso (m2) o anel é degenerado e sai da pegada. */
const AREA_MINIMA = 1e-9;

function chaveDosValores(values: Component['values']): string {
  if (!values) return '[]';
  const nomes = Object.keys(values).sort();
  return JSON.stringify(nomes.map((nome) => [nome, values[nome]]));
}

/**
 * Resolve a família da instância com o tipo (`c.typeId`, `null` = padrão da família), os valores da instância (`c.values`, em mm) e as
 * famílias do projeto como biblioteca (para aninhados). Família ausente em `p.componentFamilies`: devolve `{ pecas: [], ferragens: [], env: {},
 * erros: [{ onde: 'familia', mensagem: 'Família do componente não existe no projeto.' }] }` (nunca lança). Memoize: a MESMA referência de
 * resultado enquanto `p.componentFamilies`, a família, o tipo e os valores forem os mesmos (use um `WeakMap` por `p.componentFamilies`;
 * uma edição imutável da família ou do projeto invalida sozinha).
 */
export function resolverComponente(p: Project, c: Component): ResolucaoFamilia {
  const biblioteca = p.componentFamilies ?? SEM_FAMILIAS;
  let porChave = MEMORIA.get(biblioteca);
  if (!porChave) { porChave = new Map<string, ResolucaoFamilia>(); MEMORIA.set(biblioteca, porChave); }
  const chave = `${c.familyId}|${c.typeId ?? ''}|${chaveDosValores(c.values)}`;
  const guardada = porChave.get(chave);
  if (guardada) return guardada;
  const familia = biblioteca[c.familyId];
  const resultado: ResolucaoFamilia = familia
    ? resolverFamilia(familia, {
      tipoId: c.typeId ?? undefined,
      valores: c.values,
      biblioteca: (id) => biblioteca[id],
    })
    : { pecas: [], ferragens: [], env: {}, erros: [{ onde: 'familia', mensagem: 'Família do componente não existe no projeto.' }] };
  porChave.set(chave, resultado);
  return resultado;
}

/** Parte linear da transformação da instância (rotação e espelho), reutilizada por vértices e normais. */
interface Transformacao {
  cos: number;
  sen: number;
  x: number;
  y: number;
  espelha: boolean;
}

function transformacaoDe(c: Component): Transformacao {
  return { cos: Math.cos(c.rotation), sen: Math.sin(c.rotation), x: c.x, y: c.y, espelha: c.mirrored };
}

/** Ponto local (x, y) → mundo (x, y); o eixo X local muda de sinal quando espelhado. */
function pontoNoPlano(t: Transformacao, x: number, y: number): [number, number] {
  const lx = t.espelha ? -x : x;
  return [t.x + lx * t.cos - y * t.sen, t.y + lx * t.sen + y * t.cos];
}

/** Normal local (nx, ny) → mundo; a componente Z não muda. */
function normalNoPlano(t: Transformacao, nx: number, ny: number): [number, number] {
  const ax = t.espelha ? -nx : nx;
  return [ax * t.cos - ny * t.sen, ax * t.sen + ny * t.cos];
}

function transformarMalha(m: Malha, t: Transformacao, baseZ: number): Malha {
  const positions = new Array<number>(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const [x, y] = pontoNoPlano(t, m.positions[i]!, m.positions[i + 1]!);
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = baseZ + m.positions[i + 2]!;
  }
  const normals = new Array<number>(m.normals.length);
  for (let i = 0; i < m.normals.length; i += 3) {
    const [nx, ny] = normalNoPlano(t, m.normals[i]!, m.normals[i + 1]!);
    normals[i] = nx;
    normals[i + 1] = ny;
    normals[i + 2] = m.normals[i + 2]!;
  }
  const indices = m.indices.slice();
  if (t.espelha) {
    for (let i = 0; i < indices.length; i += 3) {
      const troca = indices[i]!;
      indices[i] = indices[i + 1]!;
      indices[i + 1] = troca;
    }
  }
  return { positions, normals, indices, pecaDoTriangulo: m.pecaDoTriangulo.slice() };
}

/**
 * Malha triangular da instância no MUNDO (mesmas malhas de `malhaDasPecas`, `solidas` e `vazios`, com `pecaDoTriangulo` apontando para o índice
 * da peça em `res.pecas`). Cada vértice é transformado pela fórmula do cabeçalho; as normais giram junto (rotação e espelho: a normal de X
 * muda de sinal quando `mirrored`). Quando `mirrored`, a transformação inverte a orientação: troque dois índices de cada triângulo para as normais
 * continuarem saindo para FORA e o volume continuar positivo. `res` opcional (padrão: `resolverComponente(p, c)`).
 */
export function malhaDoComponente(p: Project, c: Component, res: ResolucaoFamilia = resolverComponente(p, c)): MalhasDasPecas {
  const local = malhaDasPecas(res.pecas);
  const t = transformacaoDe(c);
  const baseZ = levelElevation(p, c.levelId) + c.z;
  return {
    solidas: transformarMalha(local.solidas, t, baseZ),
    vazios: transformarMalha(local.vazios, t, baseZ),
  };
}

function retanguloDaPeca(peca: PecaResolvida, t: Transformacao): MultiPolygon {
  const [ox, oy] = peca.origem;
  const [ex, ey] = peca.extensao;
  const cantos: Array<[number, number]> = [[ox, oy], [ox + ex, oy], [ox + ex, oy + ey], [ox, oy + ey]];
  const anel = cantos.map(([x, y]) => {
    const [wx, wy] = pontoNoPlano(t, x, y);
    return v2(wx, wy);
  });
  return [[anel]];
}

/** Remove anéis degenerados; um polígono sem anel externo válido sai inteiro. */
function limparAneis(m: MultiPolygon): MultiPolygon {
  const saida: MultiPolygon = [];
  for (const poly of m) {
    const externo = poly[0];
    if (!externo || Math.abs(ringArea(externo)) <= AREA_MINIMA) continue;
    const aneis = poly.filter((r) => Math.abs(ringArea(r)) > AREA_MINIMA);
    if (aneis.length > 0) saida.push(aneis);
  }
  return saida;
}

/**
 * Pegada em planta (vista de cima): união, via `union` de `@hestia/geom`, dos retângulos (no mundo) de todas as peças NÃO vazias (caixa local
 * `origem` a `origem + extensao` em X e Y, ignorando o contorno). Devolve o `MultiPolygon` da união, sem anel degenerado. Sem peças: `[]`.
 */
export function pegadaDoComponente(p: Project, c: Component, res: ResolucaoFamilia = resolverComponente(p, c)): MultiPolygon {
  const t = transformacaoDe(c);
  const retangulos = res.pecas.filter((q) => !q.vazio).map((q) => retanguloDaPeca(q, t));
  if (retangulos.length === 0) return [];
  return limparAneis(union(...retangulos));
}

/** Caixa envolvente (m) das peças não vazias no mundo, ou `null` sem peças. Vem dos vértices da malha, não de uma estimativa. */
export function caixaDoComponente(p: Project, c: Component, res: ResolucaoFamilia = resolverComponente(p, c)): { min: [number, number, number]; max: [number, number, number] } | null {
  const m = malhaDoComponente(p, c, res).solidas;
  const positions = m.positions;
  if (positions.length === 0) return null;
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
