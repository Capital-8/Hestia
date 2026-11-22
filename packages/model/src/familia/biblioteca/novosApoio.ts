import type { Discipline } from '../../planView.ts';
import {
  FAMILIA_FORMATO,
  FAMILIA_VERSAO,
  type Aninhado,
  type CategoriaFamilia,
  type Conector,
  type Familia,
  type Ferragem,
  type Hospedagem,
  type PapelPeca,
  type Parametro,
  type Peca,
  type Tipo,
} from '../tipos.ts';
import { conectoresDe } from './conectores.ts';
import { comEscolhas } from './escolhas.ts';

export { booleano, chapa, comprimento, derivado, material, FITA_PVC } from './geralApoio.ts';

/*
 * Apoio das famílias novas da Biblioteca (ficha "famílias novas"): construtores curtos de peça e de parâmetro, polígonos de
 * contorno (elipse de 64 lados, pista oval, octógono) e o cabeçalho comum. Medidas em mm; as regras de montagem são PROPOSTAS do
 * Hestia. O editor só faz chapas planas: não há superfície curva, cilindro nem peça inclinada (o redondo vira polígono).
 */

type N = string | number;
type Extra = Partial<Peca>;

const s = (v: N): string => String(v);

/** Prisma de base retangular: eixo z, `dz` é a altura (espessura da chapa), `dx` × `dy` a pegada. */
export function bloco(id: string, nome: string, x: N, y: N, z: N, dx: N, dy: N, dz: N, material?: string, extra: Extra = {}): Peca {
  return { id, nome, papel: 'bloco', eixo: 'z', origem: [s(x), s(y), s(z)], tamanho: [s(dx), s(dy)], espessura: s(dz), ...(material ? { material } : {}), veio: 'livre', ...extra };
}

/** Chapa horizontal com papel (tampo, prateleira, base...). */
export function chapaZ(id: string, nome: string, papel: PapelPeca, x: N, y: N, z: N, dx: N, dy: N, esp: N, material?: string, extra: Extra = {}): Peca {
  return bloco(id, nome, x, y, z, dx, dy, esp, material, { papel, ...extra });
}

/** Chapa vertical de frente (eixo y): largura `w` × altura `h` com espessura `e` na profundidade. */
export function placaY(id: string, nome: string, papel: PapelPeca, x: N, y: N, z: N, w: N, h: N, e: N, material?: string, extra: Extra = {}): Peca {
  return { id, nome, papel, eixo: 'y', origem: [s(x), s(y), s(z)], tamanho: [s(w), s(h)], espessura: s(e), ...(material ? { material } : {}), veio: 'livre', ...extra };
}

/** Chapa vertical lateral (eixo x): profundidade `d` × altura `h` com espessura `e` na largura. */
export function placaX(id: string, nome: string, papel: PapelPeca, x: N, y: N, z: N, d: N, h: N, e: N, material?: string, extra: Extra = {}): Peca {
  return { id, nome, papel, eixo: 'x', origem: [s(x), s(y), s(z)], tamanho: [s(d), s(h)], espessura: s(e), ...(material ? { material } : {}), veio: 'livre', ...extra };
}

const r6 = (v: number): number => Math.round(v * 1e6) / 1e6 + 0;
const termo = (w: string, c: number): string => (c === 0 ? '0' : c === 1 ? w : `${w} * ${r6(c)}`);

/** Elipse (círculo quando `w` = `h`) de `n` lados inscrita em `w` × `h`; vértices em ângulos múltiplos de 360/n. */
export function contornoElipse(w: string, h: string, n = 64): Peca['contorno'] {
  const pontos: Array<[string, string]> = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    pontos.push([termo(w, r6((1 + Math.cos(a)) / 2)), termo(h, r6((1 + Math.sin(a)) / 2))]);
  }
  return { tipo: 'poligono', pontos };
}

/** Pista oval (retângulo com duas pontas semicirculares de raio `p / 2`), 33 pontos por ponta; exige `l` ≥ `p`. */
export function contornoOval(l: string, p: string): Peca['contorno'] {
  const pontos: Array<[string, string]> = [];
  for (let k = 0; k <= 32; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / 32;
    const u = r6((1 - Math.cos(a)) / 2);
    pontos.push([u === 0 ? l : `${l} - ${p} * ${u}`, termo(p, r6((1 + Math.sin(a)) / 2))]);
  }
  for (let k = 0; k <= 32; k++) {
    const a = Math.PI / 2 + (Math.PI * k) / 32;
    pontos.push([termo(p, r6((1 + Math.cos(a)) / 2)), termo(p, r6((1 + Math.sin(a)) / 2))]);
  }
  return { tipo: 'poligono', pontos };
}

/** Octógono regular `w` × `w` (prisma facetado) com chanfro de 29,3 % do lado. */
export function contornoOctogono(w: number): Peca['contorno'] {
  const c = Math.round(w * 0.2929);
  const f = w - c;
  return { tipo: 'poligono', pontos: [[s(c), '0'], [s(f), '0'], [s(w), s(c)], [s(w), s(f)], [s(f), s(w)], [s(c), s(w)], ['0', s(f)], ['0', s(c)]] };
}

export function enumerado(id: string, nome: string, padrao: string, opcoes: ReadonlyArray<readonly [string, string]>, escopo: 'tipo' | 'instancia' = 'instancia'): Parametro {
  return { id, nome, tipo: 'enum', escopo, padrao, grupo: 'Construção', opcoes: opcoes.map(([valor, rotulo]) => ({ valor, rotulo })) };
}

export function inteiro(id: string, nome: string, padrao: number, min: number, max: number, escopo: 'tipo' | 'instancia' = 'instancia'): Parametro {
  return { id, nome, tipo: 'inteiro', escopo, padrao, min, max, passo: 1, grupo: 'Construção' };
}

export const TIPOS_TAMPO: ReadonlyArray<readonly [string, string]> = [['madeira', 'Madeira'], ['vidro', 'Vidro'], ['marmore', 'Mármore'], ['quartzo', 'Quartzo']];
export const MATERIAL_TAMPO: Readonly<Record<string, string>> = { madeira: 'mat_tampo', vidro: 'mat_vidro_incolor', marmore: 'mat_marmore', quartzo: 'mat_quartzo' };
/** Espessura do tampo por tipo (mm): madeira 30, vidro 12, mármore e quartzo 20. */
export const ESP_TAMPO = 'tipoTampo == "vidro" ? 12 : (tipoTampo == "madeira" ? 30 : 20)';

export interface DadosNova {
  id: string;
  nome: string;
  categoria: CategoriaFamilia;
  /** Disciplina dos componentes da família (adendo 1 do ADR 0060); ausente = `arquitetura`. */
  disciplina?: Discipline;
  descricao: string;
  hospedagem?: Hospedagem;
  parametros: Parametro[];
  pecas: Peca[];
  aninhados?: Aninhado[];
  ferragens?: Ferragem[];
  conectores?: Conector[];
  etiqueta?: string;
  tipos: Tipo[];
  tipoPadrao: string;
}

/** Família com o cabeçalho fixo preenchido, conectores laterais/fundo e escolhas automáticas. */
export function nova(d: DadosNova): Familia {
  return comEscolhas({
    formato: FAMILIA_FORMATO,
    versao: FAMILIA_VERSAO,
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    disciplina: d.disciplina,
    descricao: d.descricao,
    unidade: 'mm',
    hospedagem: d.hospedagem ?? 'nivel',
    origem: 'canto',
    parametros: d.parametros,
    planos: [],
    pecas: d.pecas,
    aninhados: d.aninhados ?? [],
    ferragens: d.ferragens ?? [],
    conectores: d.conectores ?? conectoresDe(d.etiqueta ?? 'movel'),
    tipos: d.tipos,
    tipoPadrao: d.tipoPadrao,
  });
}
