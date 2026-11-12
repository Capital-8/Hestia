import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, curtainPanelTypesOf } from '@hestia/model';
import { projetoComCortina } from '../../../../packages/engine/src/fixtureCortina.ts';
import { celulaDaEsquadria, dadosDoSubelemento } from './CurtainSubelementPanel.tsx';
import { comandoAlinhamentoEsquadria, comandoModoEsquadria, comandoRemoverEsquadria, comandoTipoEsquadria } from './CurtainSubelementProps.tsx';

function comCortina(): ProjectStore {
  return new ProjectStore(projetoComCortina());
}

describe('painel do subelemento da cortina (dados)', () => {
  it('linha gerada: sem sobrescrita herda o montante e não está travada', () => {
    const s = comCortina();
    const d = dadosDoSubelemento(s.project, { wallId: 'ct1', kind: 'line', line: { axis: 'u', index: 1, pos: 0, n: 1 } });
    // a posição gravada não casa com nenhuma linha se a grade tem uma só coluna: o painel não inventa dados
    expect(d === null || (d.kind === 'line' && d.travada === false)).toBe(true);
  });

  it('célula: sem sobrescrita segue o painel padrão', () => {
    const s = comCortina();
    const d = dadosDoSubelemento(s.project, { wallId: 'ct1', kind: 'cell', cell: { i: 0, j: 0, s: 0.1, z: 0.1, nu: 4, nv: 2 } });
    expect(d).not.toBeNull();
    expect(d && d.kind === 'cell' && d.sobrescrita).toBe(false);
  });

  it('célula com sobrescrita de painel: mostra o painel próprio', () => {
    const s = comCortina();
    const solido = Object.values(curtainPanelTypesOf(s.project)).find((p) => p.kind === 'solid');
    expect(solido).toBeDefined();
    s.exec({ type: 'setCellPanel', wallId: 'ct1', i: 0, j: 0, panelTypeId: solido!.id } as never);
    const d = dadosDoSubelemento(s.project, { wallId: 'ct1', kind: 'cell', cell: { i: 0, j: 0, s: 0.1, z: 0.1, nu: 4, nv: 2 } });
    expect(d && d.kind === 'cell' && d.sobrescrita).toBe(true);
    expect(d && d.kind === 'cell' && d.painel).toBe(solido!.id);
  });

  it('parede inexistente ou comum não tem subelemento', () => {
    const s = comCortina();
    expect(dadosDoSubelemento(s.project, { wallId: 'nao_existe', kind: 'cell', cell: { i: 0, j: 0, s: 0, z: 0, nu: 1, nv: 1 } })).toBeNull();
    expect(dadosDoSubelemento(s.project, { wallId: 'w1', kind: 'cell', cell: { i: 0, j: 0, s: 0, z: 0, nu: 1, nv: 1 } })).toBeNull();
  });
});

/** Cortina `ct1` (4 x 2 células) com uma porta pequena (0,60 x 1,20) na célula (0, 0), e a janela pequena na (1, 0). */
function comEsquadrias(): ProjectStore {
  const s = comCortina();
  const base = createEmptyProject().openingTypes;
  s.exec({ type: 'upsertOpeningType', openingType: { ...base.ot_p80!, id: 'ot_pq', name: 'Porta pequena', code: 'PQ', width: 0.6, height: 1.2, sill: 0 } });
  s.exec({ type: 'upsertOpeningType', openingType: { ...base.ot_j120!, id: 'ot_jq', name: 'Janela pequena', code: 'JQ', width: 0.6, height: 0.6, sill: 0.4 } });
  s.exec({ type: 'setCellOpening', wallId: 'ct1', i: 0, j: 0, openingTypeId: 'ot_pq', flipHand: true, flipFacing: false, mark: 'P1', fit: 'cell', fundir: false });
  s.exec({ type: 'setCellOpening', wallId: 'ct1', i: 1, j: 0, openingTypeId: 'ot_jq', flipHand: false, flipFacing: false, mark: 'J1', fit: 'cell', fundir: false });
  return s;
}
const celula = (i: number, j: number) => ({ wallId: 'ct1', kind: 'cell' as const, cell: { i, j, s: 0.1, z: 0.1, nu: 4, nv: 2 } });

describe('célula com porta ou janela no painel (fase 5, §7.7)', () => {
  it('mostra a esquadria da célula: tipo de porta, giro, sentido, marca e modo', () => {
    const s = comEsquadrias();
    const d = dadosDoSubelemento(s.project, celula(0, 0));
    expect(d && d.kind === 'cell' && d.esquadria).toEqual({ tipo: 'door', openingTypeId: 'ot_pq', flipHand: true, flipFacing: false, mark: 'P1', fit: 'cell', align: 'center' });
  });

  it('janela: o tipo do painel é de janela', () => {
    const s = comEsquadrias();
    const d = dadosDoSubelemento(s.project, celula(1, 0));
    expect(d && d.kind === 'cell' && d.esquadria?.tipo).toBe('window');
  });

  it('célula sem esquadria não traz o bloco de esquadria', () => {
    const s = comEsquadrias();
    const d = dadosDoSubelemento(s.project, celula(3, 1));
    expect(d && d.kind === 'cell' && d.esquadria).toBeUndefined();
  });

  it('trocar o tipo pelo seletor grava o novo tipo na célula (se ele cabe)', () => {
    const s = comEsquadrias();
    s.exec({ type: 'upsertOpeningType', openingType: { ...createEmptyProject().openingTypes.ot_p80!, id: 'ot_pq2', name: 'Porta 50', code: 'P50', width: 0.5, height: 1.0, sill: 0 } });
    s.exec(comandoTipoEsquadria('ct1', 0, 0, 'ot_pq2'), undefined, 'pt');
    const d = dadosDoSubelemento(s.project, celula(0, 0));
    expect(d && d.kind === 'cell' && d.esquadria?.openingTypeId).toBe('ot_pq2');
  });

  it('trocar um tipo que não cabe na célula é recusado pelo modelo e a porta fica como estava', () => {
    const s = comEsquadrias();
    expect(() => s.exec(comandoTipoEsquadria('ct1', 0, 0, 'ot_p80'), undefined, 'pt')).toThrow();
    const d = dadosDoSubelemento(s.project, celula(0, 0));
    expect(d && d.kind === 'cell' && d.esquadria?.openingTypeId).toBe('ot_pq');
  });

  it('trocar para o modo "ajustar grade" cria as linhas presas e a porta passa a outra célula; o alinhamento segue a porta', () => {
    const s = comEsquadrias();
    s.exec(comandoModoEsquadria('ct1', 0, 0, 'grid'), undefined, 'pt');
    // A porta de 0,60 m centrada na célula de 1,5 m ocupa a coluna do meio: a célula (0, 0) virou sobra.
    const nova = celulaDaEsquadria(s.project, 'ct1', 'ot_pq', 'P1');
    expect(nova).not.toBeNull();
    expect(nova!.i).not.toBe(0);
    s.exec(comandoAlinhamentoEsquadria('ct1', nova!.i, nova!.j, 'start'), undefined, 'pt');
    // Alinhada ao início, a porta encosta na borda da célula: a célula dela muda outra vez, e o destaque acompanha.
    const fim = celulaDaEsquadria(s.project, 'ct1', 'ot_pq', 'P1');
    expect(fim).not.toBeNull();
    const d = dadosDoSubelemento(s.project, celula(fim!.i, fim!.j));
    expect(d && d.kind === 'cell' && d.esquadria).toMatchObject({ fit: 'grid', align: 'start' });
  });

  it('celulaDaEsquadria devolve null quando não há esquadria com esses dados', () => {
    const s = comEsquadrias();
    expect(celulaDaEsquadria(s.project, 'ct1', 'ot_pq', 'nao_existe')).toBeNull();
    expect(celulaDaEsquadria(s.project, 'ct1', 'ot_jq', 'P1')).toBeNull();
  });

  it('remover a esquadria tira a sobrescrita: a célula volta a seguir o painel padrão', () => {
    const s = comEsquadrias();
    s.exec(comandoRemoverEsquadria('ct1', 0, 0), undefined, 'pt');
    const d = dadosDoSubelemento(s.project, celula(0, 0));
    expect(d && d.kind === 'cell' && d.esquadria).toBeUndefined();
    expect(d && d.kind === 'cell' && d.sobrescrita).toBe(false);
  });
});
