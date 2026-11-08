/**
 * Quantidades por camada no kernel Rust (esquema v12): só o Rust calcula a geometria das quantidades (volume bruto, volume cortado, área de face e
 * altura média). Este módulo monta as seções dos forros (`camadas_forro`, `pontos_forro`: o contorno e a espessura que o JS já resolveu) e decodifica
 * as consultas `quant_paredes`, `quant_pisos`, `quant_lajes` e `quant_forros`. Não há geometria aqui.
 *
 * Uma falha do Rust (código de retorno diferente de zero) sobe como `ErroKernelLeve` ou `ErroKernelGrave`; quem despacha (`DespachoB`) a transforma em
 * `ErroDespachoKernel`, nunca em TypeScript no lugar (decisão do dono, commit 6b12e349).
 */
import type { CenaV2 } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { resolveCeilings } from './ceilings.ts';
import type { ColunasA1 } from './kernelA1.ts';
import type { LinhaQuantRust, QuantidadesRust, TipoQuant } from './quantidadesTipos.ts';

export type { LinhaQuantRust, QuantidadesRust, TipoQuant } from './quantidadesTipos.ts';

export const NOMES_SECOES_FORROS = ['camadas_forro', 'pontos_forro'] as const;
export type NomeSecaoForros = (typeof NOMES_SECOES_FORROS)[number];

export interface CenaForros {
  secoes: Record<NomeSecaoForros, ColunasA1>;
  nLinhas: Record<NomeSecaoForros, number>;
  /** id do forro -> `forro_num`. */
  forroDe: Map<Id, number>;
}

/**
 * Forros de todos os níveis -> seções `camadas_forro` e `pontos_forro`. Os forros chegam como `resolveCeilings` os devolve (contorno com furos e a
 * espessura vertical de cada camada); o Rust só multiplica a área pela espessura.
 */
export function montarCenaForros(p: Project, nivelDe: ReadonlyMap<Id, number>): CenaForros {
  const camadas: ColunasA1 = { id_num: [], forro_num: [], nivel_num: [], indice: [], espessura: [] };
  const pontos: ColunasA1 = { id_num: [], forro_num: [], poligono: [], anel: [], indice: [], x: [], y: [] };
  const forroDe = new Map<Id, number>();
  let idCamada = 0;
  let idPonto = 0;
  for (const level of p.levels) {
    const nivel = nivelDe.get(level.id);
    if (nivel === undefined) throw new Error(`nível ${level.id} sem nivel_num`);
    for (const rc of resolveCeilings(p, level.id)) {
      if (rc.layers.length === 0) continue;
      const num = forroDe.size + 1;
      forroDe.set(rc.ceilingId, num);
      for (const l of rc.layers) {
        idCamada++;
        camadas['id_num']!.push(idCamada);
        camadas['forro_num']!.push(num);
        camadas['nivel_num']!.push(nivel);
        camadas['indice']!.push(l.layerIndex);
        camadas['espessura']!.push(l.z1 - l.z0);
      }
      rc.polygon.forEach((pol, poligono) =>
        pol.forEach((anel, ai) =>
          anel.forEach((q, indice) => {
            idPonto++;
            pontos['id_num']!.push(idPonto);
            pontos['forro_num']!.push(num);
            pontos['poligono']!.push(poligono);
            pontos['anel']!.push(ai);
            pontos['indice']!.push(indice);
            pontos['x']!.push(q.x);
            pontos['y']!.push(q.y);
          }),
        ),
      );
    }
  }
  return {
    secoes: { camadas_forro: camadas, pontos_forro: pontos },
    nLinhas: { camadas_forro: camadas['id_num']!.length, pontos_forro: pontos['id_num']!.length },
    forroDe,
  };
}

const CONSULTA_DO_TIPO: Record<TipoQuant, 'quant_paredes' | 'quant_pisos' | 'quant_lajes' | 'quant_forros'> = {
  paredes: 'quant_paredes',
  pisos: 'quant_pisos',
  lajes: 'quant_lajes',
  forros: 'quant_forros',
};

/** Bit 1 de `flags`: linha de parede sem camada (só a altura vale). */
export const FLAG_SEM_CAMADA = 2;

/** Saída da consulta -> linhas. `linhas` (U32, 4 por camada) e `valores` (F64, 5 por camada). */
export function decodificarQuantidades(s: Record<string, ArrayLike<number>>): LinhaQuantRust[] {
  const u = s['linhas'];
  const f = s['valores'];
  if (!u || !f || u.length % 4 !== 0 || f.length % 5 !== 0 || u.length / 4 !== f.length / 5) throw new Error('saída de quantidades do Rust com formato inesperado');
  const out: LinhaQuantRust[] = [];
  for (let i = 0; i < u.length / 4; i++) {
    out.push({
      dono: u[4 * i]!,
      // complemento de dois: as faixas verticais da parede têm layerIndex negativo
      camada: u[4 * i + 1]! | 0,
      nFaixas: u[4 * i + 2]!,
      flags: u[4 * i + 3]!,
      bruto: f[5 * i]!,
      cortado: f[5 * i + 1]!,
      liquido: f[5 * i + 2]!,
      areaDeFace: f[5 * i + 3]!,
      altura: f[5 * i + 4]!,
    });
  }
  return out;
}

/**
 * Quantidades por camada de um nível, calculadas pelo Rust. Qualquer código de retorno diferente de zero lança (`ErroKernelLeve` ou `ErroKernelGrave`
 * do `CenaV2`); não há valor de reserva.
 */
export function quantidadesNivelRust(cena: CenaV2, nivel: number, tol: number, tipo: TipoQuant): LinhaQuantRust[] {
  return decodificarQuantidades(cena.consultar(CONSULTA_DO_TIPO[tipo], [nivel, tol]));
}

/** Índice das linhas por dono (id numérico do Rust) e camada, para a tradução de volta aos ids do projeto. */
export function indexarQuantidades(linhas: readonly LinhaQuantRust[], numeroDe: ReadonlyMap<Id, number>, tipo: TipoQuant): QuantidadesRust {
  const porCamada = new Map<string, LinhaQuantRust>();
  const alturas = new Map<number, number>();
  for (const l of linhas) {
    if ((l.flags & FLAG_SEM_CAMADA) === 0) porCamada.set(`${l.dono}|${l.camada}`, l);
    if (tipo === 'paredes') alturas.set(l.dono, l.altura);
  }
  const numero = (id: Id): number => {
    const n = numeroDe.get(id);
    if (n === undefined) throw new Error(`${tipo}: ${id} sem número interno no Rust`);
    return n;
  };
  return {
    camada(id, layerIndex) {
      const l = porCamada.get(`${numero(id)}|${layerIndex}`);
      if (!l) throw new Error(`o Rust não devolveu quantidade para ${tipo} ${id}, camada ${layerIndex}`);
      return l;
    },
    altura(id) {
      const h = alturas.get(numero(id));
      if (h === undefined) throw new Error(`o Rust não devolveu altura para a parede ${id}`);
      return h;
    },
  };
}
