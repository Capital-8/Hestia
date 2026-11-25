import { consultarCircuitos, createEmptyProject, familiaDaBiblioteca, ProjectStore, type Component } from '@hestia/model';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { novoCircuito, atribuirSelecionados } from './circuitosAcoes.ts';
import { CircuitosView, type AcoesCircuitos } from './CircuitosView.tsx';
import { CircuitosDialog } from '../dialogs/CircuitosDialog.tsx';

/*
 * Ficha C8b. (I) os cartões de ponto mostram o nome da família, e o id técnico (cm_...) só no tooltip. (J) o painel Circuitos é
 * uma janela flutuante e não modal: sem overlay que cubra a planta, com botão de recolher e de fechar.
 */

// A moldura da janela é testada sem o painel (que lê o store reativo, indisponível no servidor).
vi.mock('./CircuitosPainel.tsx', () => ({ CircuitosPainel: () => createElement('div', { className: 'circ-painel-mock' }) }));

const comp = (id: string, familyId: string): Omit<Component, 'order'> => ({ id, kind: 'component', familyId, typeId: familiaDaBiblioteca(familyId)!.tipos[0]!.id, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id });
const nada = (): void => undefined;
const acoes: AcoesCircuitos = { onNovo: nada, onRenomear: nada, onTipo: nada, onTensao: nada, onCor: nada, onQuadro: nada, onAtribuir: nada, onApagar: nada, onPotencia: nada, onTirar: nada, onRenomearQuadro: nada };

function projetoComTomada(): ProjectStore {
  const s = new ProjectStore(createEmptyProject('t'));
  for (const fid of ['fam_tomada_2p_t']) s.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(fid)!) });
  s.exec({ type: 'addComponent', component: comp('cm_18fa3', 'fam_tomada_2p_t') });
  const a = novoCircuito(s);
  atribuirSelecionados(s, a, ['cm_18fa3'], 150);
  return s;
}

describe('painel Circuitos: rótulo e janela (ficha C8b, defeitos I e J)', () => {
  it('o cartão do ponto mostra o nome da família e o id técnico só no tooltip', () => {
    const s = projetoComTomada();
    const h = renderToStaticMarkup(createElement(CircuitosView, { consulta: consultarCircuitos(s.project), selecionados: 0, acoes }));
    const m = /<span class="circ-ponto-nome"([^>]*)>([^<]*)<\/span>/.exec(h);
    expect(m).not.toBeNull();
    expect(m?.[2]).toBe('Tomada 2P+T');
    expect(m?.[2]).not.toContain('cm_');
    expect(m?.[1]).toContain('title="Tomada 2P+T (cm_18fa3)"');
    // O id não aparece mais como texto visível do cartão (o botão Tirar e a linha de potência seguem com o id no aria-label).
    expect(h).not.toMatch(/<small>\(cm_/);
  });

  it('a janela é flutuante e não modal: sem aria-modal, sem overlay de tela cheia', () => {
    const h = renderToStaticMarkup(createElement(CircuitosDialog));
    expect(h).toContain('class="circ-janela');
    expect(h).toContain('role="dialog"');
    expect(h).not.toContain('aria-modal');
    expect(h).not.toContain('class="overlay"');
    expect(h).not.toMatch(/class="dialog /);
  });

  it('a janela abre ancorada à direita (não tapa a planta por padrão) e tem recolher e fechar', () => {
    const h = renderToStaticMarkup(createElement(CircuitosDialog));
    expect(h).toMatch(/style="right:16px;top:150px;width:min\(340px, calc\(100vw - 32px\)\)"/);
    expect(h).toContain('aria-label="Recolher painel Circuitos"');
    expect(h).toContain('aria-label="Fechar painel Circuitos"');
  });
});
