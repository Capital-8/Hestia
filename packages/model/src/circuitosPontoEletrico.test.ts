import { describe, expect, it } from 'vitest';
import { ehPontoEletrico } from './circuitosEletricosConsulta.ts';
import { familiaDaBiblioteca } from './familia/biblioteca/index.ts';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import type { Component } from './types.ts';

/*
 * Ficha C8a (defeito E): só tomada, interruptor, luminária e dispositivo valem como ponto de circuito; eletroduto, curva, luva,
 * caixa e quadro, não. Lê os dados das famílias da biblioteca, não ids escritos no código.
 */

function projeto(ids: string[]) {
  const s = new ProjectStore(createEmptyProject('t'));
  ids.forEach((fid, i) => {
    const f = familiaDaBiblioteca(fid);
    if (!f) throw new Error(`família ausente: ${fid}`);
    s.exec({ type: 'upsertFamily', family: structuredClone(f) });
    s.exec({ type: 'addComponent', component: { id: `c${i}`, kind: 'component', familyId: fid, typeId: f.tipoPadrao ?? f.tipos[0]?.id ?? null, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: '' } as unknown as Component });
  });
  return s.project;
}
const eh = (ids: string[]): boolean[] => {
  const p = projeto(ids);
  return ids.map((_, i) => ehPontoEletrico(p, p.elements[`c${i}`]));
};

describe('ehPontoEletrico', () => {
  it('tomada, interruptor e luminárias da biblioteca são pontos', () => {
    expect(eh(['fam_tomada_2p_t', 'fam_interruptor_simples', 'fam_luminaria_plafon_redondo', 'fam_luminaria_arandela', 'fam_luminaria_pendente'])).toEqual([true, true, true, true, true]);
  });

  it('as famílias de exemplo da disciplina elétrica (tomada, interruptor, luminária de teto) continuam valendo como ponto', () => {
    expect(eh(['fam_tomada', 'fam_interruptor', 'fam_luminaria_teto'])).toEqual([true, true, true]);
  });

  it('eletroduto, curva e luva (Krona e F5) não são pontos', () => {
    expect(eh(['fam_krona_eletrica_tubo_corte', 'fam_krona_eletrica_curva90', 'fam_krona_eletrica_luva', 'fam_eletroduto_rigido', 'fam_eletroduto_curva90', 'fam_eletroduto_luva'])).toEqual([false, false, false, false, false, false]);
  });

  it('caixa de luz (Krona e F5) e caixa de passagem não são pontos, mesmo sendo dispositivo elétrico', () => {
    expect(eh(['fam_krona_eletrica_caixa_4x4', 'fam_krona_eletrica_caixa_4x2', 'fam_caixa_4x4', 'fam_caixa_passagem'])).toEqual([false, false, false, false]);
  });

  it('quadro de distribuição não é ponto; peça de outra disciplina (esgoto) e id inexistente também não', () => {
    expect(eh(['fam_quadro_distribuicao_eletrico', 'fam_tubo_esgoto'])).toEqual([false, false]);
    const p = projeto(['fam_tomada_2p_t']);
    expect(ehPontoEletrico(p, p.elements['nao_existe'])).toBe(false);
    expect(ehPontoEletrico(p, undefined)).toBe(false);
  });
});
