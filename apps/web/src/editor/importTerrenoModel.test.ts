import { describe, expect, it } from 'vitest';
import { lerLevantamentoDxf } from '@hestia/io';
import { cotaExibida, TERRENO_LIMITES, tDoModelo } from '@hestia/model';
import levantamento from '../../../../tests/fixtures/terreno/levantamento.dxf?raw';
import {
  bloqueioDaImportacao,
  caixaDasFontes,
  contarVertices,
  cotaDoArquivoExibida,
  destinosPadrao,
  fontesDoCsv,
  fontesDoDxf,
  fontesFinais,
  levarParaLocais,
  propostaLocalizacao,
  type FontesImportadas,
} from './importTerrenoModel.ts';
import { PT_TERRENO } from './i18n/areas/terreno.ts';

/** DXF mínimo com uma camada de pontos, uma de curvas (cota constante) e uma de quebras (cota variável). */
const MISTO = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'POINT', '8', 'PTS', '10', '1', '20', '1', '30', '5',
  '0', 'LWPOLYLINE', '8', 'CUR', '90', '4', '70', '0', '38', '3', '10', '0', '20', '0', '10', '5', '20', '0.01', '10', '10', '20', '0', '10', '20', '20', '0',
  '0', 'LINE', '8', 'QUE', '10', '0', '20', '0', '30', '1', '11', '3', '21', '4', '31', '2',
  '0', 'ENDSEC', '0', 'EOF',
].join('\n');

const lev = lerLevantamentoDxf(MISTO);
const SEM_PROJETO = { localizacao: undefined };

describe('destinos e fontes do DXF', () => {
  it('o destino padrão segue o que a camada tem: curvas, quebras ou pontos', () => {
    expect(destinosPadrao(lev.camadas)).toEqual({ PTS: 'pontos', CUR: 'curvas', QUE: 'quebras' });
  });

  it('camada ignorada não entra; pontos, curvas e quebras vão para as fontes certas', () => {
    const f = fontesDoDxf(lev, { PTS: 'pontos', CUR: 'curvas', QUE: 'quebras' }, 0);
    expect(f.pontos).toEqual([1, 1, 5]);
    expect(f.curvas).toEqual([{ z: 3, xy: [0, 0, 5, 0.01, 10, 0, 20, 0], fechada: false }]);
    expect(f.quebras).toEqual([{ xyz: [0, 0, 1, 3, 4, 2] }]);
    expect(fontesDoDxf(lev, { PTS: 'ignorar', CUR: 'ignorar', QUE: 'ignorar' }, 0)).toEqual({ pontos: [], curvas: [], quebras: [] });
  });

  it('a tolerância simplifica curvas (5 pontos viram 2) e o 0 desliga', () => {
    const f = fontesDoDxf(lev, { CUR: 'curvas' }, 0.05);
    expect(f.curvas[0]!.xy).toEqual([0, 0, 20, 0]);
    expect(fontesDoDxf(lev, { CUR: 'curvas' }, 0).curvas[0]!.xy).toHaveLength(8);
  });

  it('curva no destino pontos vira vértices; no destino quebras vira quebra com a cota em cada vértice', () => {
    expect(fontesDoDxf(lev, { CUR: 'pontos' }, 0).pontos).toEqual([0, 0, 3, 5, 0.01, 3, 10, 0, 3, 20, 0, 3]);
    expect(fontesDoDxf(lev, { CUR: 'quebras' }, 0).quebras).toEqual([{ xyz: [0, 0, 3, 5, 0.01, 3, 10, 0, 3, 20, 0, 3] }]);
  });

  it('quebra no destino curvas não perde dado: os vértices viram pontos', () => {
    expect(fontesDoDxf(lev, { QUE: 'curvas' }, 0)).toEqual({ pontos: [0, 0, 1, 3, 4, 2], curvas: [], quebras: [] });
  });

  it('o levantamento.dxf importa 12 curvas simplificadas e 40 pontos', () => {
    const l = lerLevantamentoDxf(levantamento);
    const f = fontesDoDxf(l, destinosPadrao(l.camadas), 0.05);
    expect(f.curvas).toHaveLength(12);
    expect(f.pontos).toHaveLength(120);
    expect(contarVertices(f)).toBeLessThanOrEqual(12 * 24 + 40);
  });

  it('o CSV vira só pontos', () => {
    expect(fontesDoCsv({ separador: ';', ordem: 'xyz', cabecalho: false, virgulaDecimal: false, pontos: [1, 2, 3], linhas: 1, invalidas: 0, zMin: 3, zMax: 3 })).toEqual({ pontos: [1, 2, 3], curvas: [], quebras: [] });
  });
});

/** Pontos em UTM de exemplo: leste 332 950 a 333 050, norte 7 393 950 a 7 394 050, cotas 740 a 760. */
const utm: FontesImportadas = { pontos: [332950, 7393950, 740, 333050, 7394050, 760, 333000, 7394000, 750], curvas: [], quebras: [] };

describe('proposta de localização', () => {
  it('coordenadas UTM: origem no centro da caixa arredondado para 100 m e cota zero no menor z arredondado para baixo', () => {
    expect(propostaLocalizacao(utm, SEM_PROJETO)).toEqual({ origemE: 333000, origemN: 7394000, cotaZero: 740 });
    const quebrada: FontesImportadas = { pontos: [332900, 7393900, 740.9, 333200, 7394300, 760], curvas: [], quebras: [] };
    expect(propostaLocalizacao(quebrada, SEM_PROJETO)).toEqual({ origemE: 333100, origemN: 7394100, cotaZero: 740 });
  });

  it('o centro é arredondado ao múltiplo de 100 mais próximo', () => {
    const f: FontesImportadas = { pontos: [200000, 300000, -3.2, 200140, 300000, 5], curvas: [], quebras: [] };
    expect(propostaLocalizacao(f, SEM_PROJETO)).toEqual({ origemE: 200100, origemN: 300000, cotaZero: -4 });
  });

  it('não propõe com coordenadas pequenas, no limite exato, com fontes vazias ou se o projeto já tem localização', () => {
    expect(propostaLocalizacao({ pontos: [10, 20, 1], curvas: [], quebras: [] }, SEM_PROJETO)).toBeNull();
    expect(propostaLocalizacao({ pontos: [TERRENO_LIMITES.coordMax, 0, 1], curvas: [], quebras: [] }, SEM_PROJETO)).toBeNull();
    expect(propostaLocalizacao({ pontos: [], curvas: [], quebras: [] }, SEM_PROJETO)).toBeNull();
    expect(propostaLocalizacao(utm, { localizacao: { origemE: 0, origemN: 0, cotaZero: 0, norteVerdadeiro: 0 } })).toBeNull();
  });

  it('a caixa considera pontos, curvas e quebras', () => {
    const c = caixaDasFontes({ pontos: [0, 0, 1], curvas: [{ z: 9, xy: [5, -5, 6, 6], fechada: false }], quebras: [{ xyz: [-2, 1, 0, 3, 3, 4] }] });
    expect(c).toEqual({ minX: -2, maxX: 6, minY: -5, maxY: 6, minZ: 0, maxZ: 9 });
    expect(caixaDasFontes({ pontos: [], curvas: [], quebras: [] })).toBeNull();
  });
});

describe('conversão para coordenadas locais', () => {
  it('subtrai a origem de x e y e a cota zero de z em pontos, curvas e quebras, sem alterar a entrada', () => {
    const f: FontesImportadas = {
      pontos: [333010, 7394020, 745],
      curvas: [{ z: 750, xy: [333000, 7394000, 333010, 7394010], fechada: true }],
      quebras: [{ xyz: [333005, 7394005, 741, 333006, 7394006, 742] }],
    };
    const copia = JSON.parse(JSON.stringify(f)) as FontesImportadas;
    const prop = { origemE: 333000, origemN: 7394000, cotaZero: 740 };
    const l = levarParaLocais(f, prop);
    expect(l.pontos).toEqual([10, 20, 5]);
    expect(l.curvas).toEqual([{ z: 10, xy: [0, 0, 10, 10], fechada: true }]);
    expect(l.quebras).toEqual([{ xyz: [5, 5, 1, 6, 6, 2] }]);
    expect(f).toEqual(copia);
    expect(fontesFinais(f, prop, true)).toEqual(l);
    expect(fontesFinais(f, prop, false)).toBe(f);
    expect(fontesFinais(f, null, true)).toBe(f);
  });

  it('a cota exibida depois da importação é a do arquivo com a proposta aceita, e passa por cotaExibida sem ela', () => {
    const prop = { origemE: 0, origemN: 0, cotaZero: 740 };
    expect(cotaDoArquivoExibida(SEM_PROJETO, prop, true, 752)).toBe(752);
    expect(cotaDoArquivoExibida(SEM_PROJETO, null, false, 752)).toBe(cotaExibida(SEM_PROJETO, 752));
    expect(cotaDoArquivoExibida({ localizacao: { origemE: 0, origemN: 0, cotaZero: 100, norteVerdadeiro: 0 } }, null, false, 5)).toBe(105);
  });
});

describe('bloqueios da importação', () => {
  const pts = (n: number): FontesImportadas => ({
    pontos: Array.from({ length: n * 3 }, (_, k) => (k % 3 === 2 ? 1 : k % 3 === 0 ? (k / 3) % 1000 : Math.floor(k / 3000))),
    curvas: [],
    quebras: [],
  });

  it('bloqueia acima de 200 000 vértices com a mensagem do limite, e aceita 200 000', () => {
    const b = bloqueioDaImportacao(pts(TERRENO_LIMITES.vertices + 1), 'lv_0');
    expect(b).toEqual({ chave: 'ui_tn_imp_limite_vertices', args: { n: 200001, max: 200000 } });
    expect(PT_TERRENO.ui_tn_imp_limite_vertices).toContain('{max}');
    expect(bloqueioDaImportacao(pts(TERRENO_LIMITES.vertices), 'lv_0')).toBeNull();
  });

  it('conta os vértices de curvas e quebras junto com os pontos', () => {
    const f: FontesImportadas = { pontos: [0, 0, 1], curvas: [{ z: 1, xy: [0, 0, 1, 1, 2, 2], fechada: false }], quebras: [{ xyz: [0, 0, 1, 1, 1, 1] }] };
    expect(contarVertices(f)).toBe(1 + 3 + 2);
    const grande: FontesImportadas = { pontos: pts(TERRENO_LIMITES.vertices - 4).pontos, curvas: f.curvas, quebras: f.quebras };
    expect(bloqueioDaImportacao(grande, 'lv_0')?.chave).toBe('ui_tn_imp_limite_vertices');
  });

  it('bloqueia o vazio e o terreno que o modelo recusa (coordenada fora da faixa sem a proposta aceita)', () => {
    expect(bloqueioDaImportacao({ pontos: [], curvas: [], quebras: [] }, 'lv_0')?.chave).toBe('ui_tn_imp_vazio');
    const b = bloqueioDaImportacao(utm, 'lv_0');
    expect(b?.chave).toBe('ui_tn_imp_invalido');
    expect(b?.args['motivo']).toBe(tDoModelo('pt', 'md_tn_coord', { max: TERRENO_LIMITES.coordMax }));
    expect(bloqueioDaImportacao(levarParaLocais(utm, propostaLocalizacao(utm, SEM_PROJETO)!), 'lv_0')).toBeNull();
  });
});
