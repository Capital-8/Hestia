import { describe, expect, it } from 'vitest';
import { familiaDaBiblioteca } from './familia/biblioteca/index.ts';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { tipoSugeridoDaFamilia, TIPO_PADRAO_CIRCUITO, type TipoCircuito } from './circuitosEletricos.ts';
import type { Component } from './types.ts';

/*
 * Ficha C8b, defeito (I): circuito com tomada e interruptor aparecia com o tipo padrão "Iluminação". Agora o PRIMEIRO ponto atribuído
 * sugere o tipo (tomada -> tomadas de uso geral; luminária -> iluminação), só enquanto o circuito estiver no tipo padrão e sem escolha
 * manual. A escolha da pessoa nunca é sobrescrita.
 */

const TOMADA = 'fam_tomada_2p_t';
const INTERRUPTOR = 'fam_interruptor_simples';
const LUMINARIA = 'fam_luminaria_plafon_redondo';

/** Projeto com um circuito novo (tipo padrão) e um componente por família, nesta ordem (c0, c1, ...). */
function cenario(familias: string[]) {
  const s = new ProjectStore(createEmptyProject('t'));
  familias.forEach((fid, i) => {
    const f = familiaDaBiblioteca(fid);
    if (!f) throw new Error(`família ausente: ${fid}`);
    if (!s.project.componentFamilies?.[fid]) s.exec({ type: 'upsertFamily', family: structuredClone(f) });
    s.exec({ type: 'addComponent', component: { id: `c${i}`, kind: 'component', familyId: fid, typeId: f.tipoPadrao ?? f.tipos[0]?.id ?? null, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: '' } as unknown as Component });
  });
  s.exec({ type: 'addCircuitoEletrico', circuito: { id: 'k1', nome: 'C1', tipo: TIPO_PADRAO_CIRCUITO, tensao: 127, pontos: [], cor: '#1c7ed6' } });
  return s;
}
const tipoDo = (s: ProjectStore): TipoCircuito => s.project.circuitosEletricos!['k1']!.tipo;
const atribui = (s: ProjectStore, componenteId: string): void => s.exec({ type: 'assignPontoCircuito', circuitoId: 'k1', ponto: { componenteId, potenciaVA: 100 } });

describe('tipo sugerido pelo primeiro ponto (ficha C8b, defeito I)', () => {
  it('tomada como primeiro ponto de um circuito no tipo padrão: vira tomadas de uso geral', () => {
    const s = cenario([TOMADA, INTERRUPTOR]);
    atribui(s, 'c0');
    expect(tipoDo(s)).toBe('tomadas_uso_geral');
  });

  it('tomada e interruptor no mesmo circuito (tomada primeiro): aparece como tomadas, não como iluminação', () => {
    const s = cenario([TOMADA, INTERRUPTOR]);
    atribui(s, 'c0');
    atribui(s, 'c1');
    expect(tipoDo(s)).toBe('tomadas_uso_geral');
    expect(s.project.circuitosEletricos!['k1']!.pontos.map((p) => p.componenteId)).toEqual(['c0', 'c1']);
  });

  it('luminária como primeiro ponto mantém a iluminação', () => {
    const s = cenario([LUMINARIA, TOMADA]);
    atribui(s, 'c0');
    expect(tipoDo(s)).toBe('iluminacao');
  });

  it('só o primeiro ponto sugere: uma tomada atribuída depois de uma luminária não muda o tipo', () => {
    const s = cenario([LUMINARIA, TOMADA]);
    atribui(s, 'c0');
    atribui(s, 'c1');
    expect(tipoDo(s)).toBe('iluminacao');
  });

  it('escolha manual do tipo nunca é sobrescrita, mesmo quando é igual ao padrão', () => {
    const s = cenario([TOMADA]);
    s.exec({ type: 'updateCircuitoEletrico', id: 'k1', patch: { tipo: 'iluminacao' } });
    expect(s.project.circuitosEletricos!['k1']!.tipoManual).toBe(true);
    atribui(s, 'c0');
    expect(tipoDo(s)).toBe('iluminacao');
  });

  it('interruptor sozinho não sugere tipo (fica no padrão)', () => {
    const s = cenario([INTERRUPTOR]);
    atribui(s, 'c0');
    expect(tipoDo(s)).toBe('iluminacao');
  });

  it('o mapa famílias -> tipo sugerido cobre tomada e luminária, e deixa o resto sem sugestão', () => {
    expect(tipoSugeridoDaFamilia(TOMADA)).toBe('tomadas_uso_geral');
    expect(tipoSugeridoDaFamilia(LUMINARIA)).toBe('iluminacao');
    expect(tipoSugeridoDaFamilia(INTERRUPTOR)).toBeUndefined();
    expect(tipoSugeridoDaFamilia('fam_armario_x')).toBeUndefined();
  });
});
