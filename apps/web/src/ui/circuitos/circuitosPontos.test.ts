import { consultarCircuitos, createEmptyProject, familiaDaBiblioteca, ID_QUADRO_ELETRICO, ProjectStore, type Component, type Project } from '@hestia/model';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { atribuirSelecionados, mensagemDeAtribuicao, novoCircuito } from './circuitosAcoes.ts';
import { CircuitosView, type AcoesCircuitos } from './CircuitosView.tsx';

/*
 * Ficha C8a (defeito E): "Atribuir selecionados" só aceita ponto elétrico (tomada, interruptor, luminária, dispositivo); eletroduto,
 * curva, luva, caixa e quadro ficam de fora e o painel avisa "N itens ignorados".
 */
const FAMILIAS = ['fam_tomada_2p_t', 'fam_interruptor_simples', 'fam_luminaria_plafon_redondo', 'fam_krona_eletrica_tubo_corte', 'fam_krona_eletrica_curva90', 'fam_krona_eletrica_luva', 'fam_krona_eletrica_caixa_4x4', ID_QUADRO_ELETRICO];
const ID = ['tomada', 'interruptor', 'luminaria', 'eletroduto', 'curva', 'luva', 'caixa', 'quadro'] as const;

function loja(): ProjectStore {
  const s = new ProjectStore(createEmptyProject('t') as Project);
  FAMILIAS.forEach((fid, i) => {
    const f = familiaDaBiblioteca(fid)!;
    s.exec({ type: 'upsertFamily', family: structuredClone(f) });
    s.exec({ type: 'addComponent', component: { id: ID[i]!, kind: 'component', familyId: fid, typeId: f.tipoPadrao ?? f.tipos[0]?.id ?? null, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: '' } as unknown as Omit<Component, 'order'> as Component });
  });
  return s;
}
const pontos = (s: ProjectStore, c: string): string[] => s.project.circuitosEletricos![c]!.pontos.map((p) => p.componenteId);
const semAcoes = new Proxy({}, { get: () => () => undefined }) as AcoesCircuitos;

describe('Atribuir selecionados (defeito E)', () => {
  it('eletroduto sozinho não vira ponto: nada é atribuído e o item conta como ignorado', () => {
    const s = loja();
    const c = novoCircuito(s);
    expect(atribuirSelecionados(s, c, ['eletroduto'], 100)).toEqual({ atribuidos: 0, ignorados: 1 });
    expect(pontos(s, c)).toEqual([]);
  });

  it('tomada, interruptor e luminária entram; eletroduto, curva, luva, caixa e quadro ficam de fora (5 ignorados)', () => {
    const s = loja();
    const c = novoCircuito(s);
    const r = atribuirSelecionados(s, c, [...ID], 100);
    expect(r).toEqual({ atribuidos: 3, ignorados: 5 });
    expect(pontos(s, c)).toEqual(['tomada', 'interruptor', 'luminaria']);
  });

  it('a atribuição mista continua sendo um só passo de desfazer, e o que ficou de fora não cria circuito nem ponto', () => {
    const s = loja();
    const c = novoCircuito(s);
    atribuirSelecionados(s, c, ['tomada', 'caixa', 'curva'], 100);
    s.undo();
    expect(pontos(s, c)).toEqual([]);
    expect(Object.keys(s.project.circuitosEletricos!)).toEqual([c]);
  });

  it('mensagem: "N itens ignorados" (plural), "1 item ignorado" (singular) e a orientação quando nada entrou', () => {
    expect(mensagemDeAtribuicao({ atribuidos: 3, ignorados: 5 })).toBe('3 ponto(s) atribuído(s), 5 itens ignorados.');
    expect(mensagemDeAtribuicao({ atribuidos: 2, ignorados: 1 })).toBe('2 ponto(s) atribuído(s), 1 item ignorado.');
    expect(mensagemDeAtribuicao({ atribuidos: 2, ignorados: 0 })).toBe('2 ponto(s) atribuído(s).');
    expect(mensagemDeAtribuicao({ atribuidos: 0, ignorados: 1 })).toMatch(/^Nenhum ponto elétrico selecionado \(1 item ignorado: só tomada, interruptor, luminária e dispositivo valem como ponto\)\.$/);
  });

  it('o painel mostra "N itens ignorados" quando a seleção tem peça de rede, e nada quando não tem', () => {
    const s = loja();
    const com = renderToStaticMarkup(createElement(CircuitosView, { consulta: consultarCircuitos(s.project), selecionados: 1, ignorados: 2, acoes: semAcoes }));
    expect(com).toContain('2 itens ignorados');
    const sem = renderToStaticMarkup(createElement(CircuitosView, { consulta: consultarCircuitos(s.project), selecionados: 1, acoes: semAcoes }));
    expect(sem).not.toContain('ignorado');
  });
});
