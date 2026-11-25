import { describe, expect, it } from 'vitest';
import type { ItemCatalogo } from '../catalogoMep.ts';
import { KRONA_ESGOTO } from '../catalogosMep/kronaEsgoto.ts';
import { itemKrona } from './kronaEsgotoApoio.ts';

/*
 * Peças da Krona com TRANSCRIÇÃO no catálogo e SEM família (ficha D3): nenhuma receita existente em kronaReceitas.ts serve a elas
 * (ver docs/familias-parametricas/catalogos/README.md, seção D3). Este teste prende as cotas ao PDF de 53 páginas, cujo SHA-256
 * está registrado no catálogo; uma troca acidental de número aparece aqui. Os valores vieram da extração automática e foram
 * conferidos contra o texto do PDF (CONFERIR com o documento até alguém do projeto validar).
 */

const PDF_SHA256 = '10c24aa86eb44a2ecb5618d73a59d5d28d134dc1143bdc52c72024fffedadb33';

type Cotas = Record<string, number>;
interface Peca {
  id: string;
  pagina: number;
  codigos: string[];
  amostra: [codigo: string, cotas: Cotas];
}

const PECAS: Peca[] = [
  { id: 'te_de_inspecao_esgoto', pagina: 17, codigos: ['0728'], amostra: ['0728', { B: 45, C1: 186, Z: 42.5, C2: 71.4, D: 101.6, d: 101.6, T: 82 }] },
  { id: 'te_de_inspecao_esgoto_serie_reforcada', pagina: 35, codigos: ['1467', '1468', '1469'], amostra: ['1468', { B1: 45, C1: 182, C2: 67, D: 101.6, Z: 43.2, T: 72.2, d: 101.6 }] },
  { id: 'juncao_45_esgoto_dupla_primario', pagina: 15, codigos: ['0708', '0710'], amostra: ['0710', { B: 45, C: 260, Z: 130, d: 101.6, D: 101.6 }] },
  { id: 'juncao_45_esgoto_invertida_primario', pagina: 15, codigos: ['0704', '0709'], amostra: ['0704', { B: 44, C: 211, Z1: 19.1, Z2: 93.6, D: 75.5, d: 75.5 }] },
  { id: 'juncao_dupla_esgoto_serie_reforcada', pagina: 32, codigos: ['1426'], amostra: ['1426', { B: 45, C: 245, Z: 127, d: 101.6, D: 101.6 }] },
  { id: 'joelho_90_esgoto_com_visita', pagina: 14, codigos: ['0622'], amostra: ['0622', { B1: 45, Z: 58, D1: 101.6, d: 101.6, B2: 39, Z2: 52.8, C: 200, D2: 50.7 }] },
  { id: 'joelho_90_visita_esgoto_serie_reforcada', pagina: 35, codigos: ['1472'], amostra: ['1472', { B1: 45, B2: 44, C: 202.6, d: 101.6, D2: 75.5, Z1: 57.5, Z2: 58 }] },
  { id: 'curva_90_curta_pe_coluna_esgoto_serie_reforcada', pagina: 31, codigos: ['1409', '1410', '1411'], amostra: ['1410', { A1: 125, A2: 120, B1: 45, B2: 45, D1: 101.6, D2: 101.6 }] },
  { id: 'aneis_de_vedacao_esgoto_sn_e_sr', pagina: 17, codigos: ['0670', '0671', '0672', '0673', '0674', '0678'], amostra: ['0674', { D: 149, d: 9.2 }] },
  { id: 'valvula_de_retencao_esgoto', pagina: 18, codigos: ['0668', '0669'], amostra: ['0669', { B: 60, C1: 299, C2: 160.7, C3: 145.7, Z1: 100, Z2: 79, D1: 150, T: 208, D2: 200 }] },
  { id: 'terminal_de_ventilacao_esgoto', pagina: 18, codigos: ['1165', '1166', '1167'], amostra: ['1167', { ØA: 115, ØB: 101.6, ØC: 106, D: 31, E: 73.5 }] },
];

const linhaDe = (item: ItemCatalogo, codigo: string): Cotas => {
  const l = item.linhas.find((x) => x.codigo === codigo);
  if (!l) throw new Error(`código ${codigo} ausente em ${item.id}`);
  return l.valores;
};

describe('Krona esgoto: peças pendentes (catálogo transcrito, sem família)', () => {
  it('a fonte é o catálogo técnico de esgoto 2025, com o SHA-256 registrado', () => {
    expect(KRONA_ESGOTO.fonte.sha256).toBe(PDF_SHA256);
    expect(KRONA_ESGOTO.fonte.url).toMatch(/Catalogo-Tecnico-Esgoto-2025\.pdf$/);
  });

  it.each(PECAS)('$id: página, estado CONFERIR e códigos do PDF', (p) => {
    const item = itemKrona(p.id);
    expect(item.pagina).toBe(p.pagina);
    expect(item.estado).toBe('CONFERIR');
    expect(item.linhas.map((l) => l.codigo)).toEqual(p.codigos);
  });

  it.each(PECAS)('$id: cotas de uma linha iguais às do PDF', (p) => {
    const [codigo, cotas] = p.amostra;
    expect(linhaDe(itemKrona(p.id), codigo)).toEqual(cotas);
  });

  it('o anel de vedação rotula d como seção (e não como diâmetro da ponta)', () => {
    expect(itemKrona('aneis_de_vedacao_esgoto_sn_e_sr').colunas.d).toMatch(/seção/);
  });
});
