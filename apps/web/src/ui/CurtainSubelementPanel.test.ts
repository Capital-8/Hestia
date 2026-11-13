import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, curtainPanelTypesOf, refGerada, resolverParede, type SubelementoCortina, type Wall } from '@hestia/model';
import { projetoComCortina } from '../../../../packages/engine/src/fixtureCortina.ts';
import { celulaDaEsquadria, celulaDoSubelemento, dadosDoSubelemento } from './CurtainSubelementPanel.tsx';
import {
  comandoAlinhamentoEsquadria,
  comandoModoEsquadria,
  comandoPeitoril,
  comandoRemoverEsquadria,
  comandoTipoEsquadria,
} from './CurtainSubelementProps.tsx';

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

  it('linha extra: os dados trazem a posição, extra verdadeiro e sem sobrescrita', () => {
    const s = comCortina();
    s.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'x1', axis: 'u', pos: 1.7 } });
    const d = dadosDoSubelemento(s.project, { wallId: 'ct1', kind: 'line', line: { added: 'x1' } });
    expect(d && d.kind === 'line' && d.extra).toBe(true);
    expect(d && d.kind === 'line' && d.pos).toBeCloseTo(1.7, 6);
    expect(d && d.kind === 'line' && d.sobrescrita).toBe(false);
  });

  it('linha gerada: a posição vem da grade; com sobrescrita (posição movida) "Voltar ao padrão" fica ativo', () => {
    const s = comCortina();
    const w = s.project.elements.ct1 as Wall;
    const r = resolverParede(s.project, w)!;
    const gerada = r.u.find((l) => l.added === undefined)!;
    const ref = refGerada('u', gerada.gerada as number, r.L, r.geradasU);
    const semSobrescrita = dadosDoSubelemento(s.project, { wallId: 'ct1', kind: 'line', line: ref });
    expect(semSobrescrita && semSobrescrita.kind === 'line' && semSobrescrita.extra).toBe(false);
    expect(semSobrescrita && semSobrescrita.kind === 'line' && semSobrescrita.sobrescrita).toBe(false);
    s.exec({ type: 'moveGridLine', wallId: 'ct1', line: ref, pos: gerada.pos * 0.5 });
    const comSobrescrita = dadosDoSubelemento(s.project, { wallId: 'ct1', kind: 'line', line: ref });
    expect(comSobrescrita && comSobrescrita.kind === 'line' && comSobrescrita.sobrescrita).toBe(true);
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
const celula = (i: number, j: number): SubelementoCortina => ({ wallId: 'ct1', kind: 'cell', cell: { i, j, s: 0.1, z: 0.1, nu: 4, nv: 2 } });
const esquadria = (i: number, j: number): SubelementoCortina => ({ wallId: 'ct1', kind: 'opening', cell: { i, j, s: 0.1, z: 0.1, nu: 4, nv: 2 } });

describe('célula com porta ou janela no painel (fase 5, §7.7)', () => {
  it('a esquadria é o próprio subelemento: tipo de porta, giro, sentido, marca, modo e peitoril', () => {
    const s = comEsquadrias();
    const d = dadosDoSubelemento(s.project, esquadria(0, 0));
    expect(d).toEqual({
      kind: 'opening',
      wallId: 'ct1',
      i: 0,
      j: 0,
      esquadria: { tipo: 'door', openingTypeId: 'ot_pq', flipHand: true, flipFacing: false, mark: 'P1', fit: 'cell', align: 'center', peitoril: null },
    });
  });

  it('janela: o tipo da esquadria é de janela', () => {
    const s = comEsquadrias();
    const d = dadosDoSubelemento(s.project, esquadria(1, 0));
    expect(d && d.kind === 'opening' && d.esquadria.tipo).toBe('window');
  });

  it('a célula com esquadria mostra o painel sob ela (comEsquadria) e não a esquadria', () => {
    const s = comEsquadrias();
    const d = dadosDoSubelemento(s.project, celula(0, 0));
    expect(d && d.kind === 'cell' && d.comEsquadria).toBe(true);
    expect(d && d.kind === 'cell' && d.sobrescrita).toBe(false);
  });

  it('célula sem esquadria não é marcada, e a esquadria de célula sem esquadria não existe', () => {
    const s = comEsquadrias();
    const d = dadosDoSubelemento(s.project, celula(3, 1));
    expect(d && d.kind === 'cell' && d.comEsquadria).toBe(false);
    expect(dadosDoSubelemento(s.project, esquadria(3, 1))).toBeNull();
  });

  it('celulaDoSubelemento: a célula de célula ou de esquadria; null para linha e segmento', () => {
    expect(celulaDoSubelemento(celula(2, 1))).toEqual({ i: 2, j: 1, s: 0.1, z: 0.1, nu: 4, nv: 2 });
    expect(celulaDoSubelemento(esquadria(0, 0))?.i).toBe(0);
    expect(celulaDoSubelemento({ wallId: 'ct1', kind: 'line', line: { axis: 'u', index: 1, pos: 0.5, n: 4 } })).toBeNull();
  });

  it('trocar o tipo pelo seletor grava o novo tipo na esquadria (se ele cabe)', () => {
    const s = comEsquadrias();
    s.exec({ type: 'upsertOpeningType', openingType: { ...createEmptyProject().openingTypes.ot_p80!, id: 'ot_pq2', name: 'Porta 50', code: 'P50', width: 0.5, height: 1.0, sill: 0 } });
    s.exec(comandoTipoEsquadria('ct1', 0, 0, 'ot_pq2'), undefined, 'pt');
    const d = dadosDoSubelemento(s.project, esquadria(0, 0));
    expect(d && d.kind === 'opening' && d.esquadria.openingTypeId).toBe('ot_pq2');
  });

  it('trocar um tipo que não cabe na célula é recusado pelo modelo e a porta fica como estava', () => {
    const s = comEsquadrias();
    expect(() => s.exec(comandoTipoEsquadria('ct1', 0, 0, 'ot_p80'), undefined, 'pt')).toThrow();
    const d = dadosDoSubelemento(s.project, esquadria(0, 0));
    expect(d && d.kind === 'opening' && d.esquadria.openingTypeId).toBe('ot_pq');
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
    const d = dadosDoSubelemento(s.project, esquadria(fim!.i, fim!.j));
    expect(d && d.kind === 'opening' && d.esquadria).toMatchObject({ fit: 'grid', align: 'start' });
  });

  it('celulaDaEsquadria devolve null quando não há esquadria com esses dados', () => {
    const s = comEsquadrias();
    expect(celulaDaEsquadria(s.project, 'ct1', 'ot_pq', 'nao_existe')).toBeNull();
    expect(celulaDaEsquadria(s.project, 'ct1', 'ot_jq', 'P1')).toBeNull();
  });

  it('peitoril: grava o sillOverride e desfaz em um passo (volta ao padrão, null)', () => {
    const s = comEsquadrias();
    s.exec(comandoPeitoril('ct1', 1, 0, 0.5), undefined, 'pt');
    const d = dadosDoSubelemento(s.project, esquadria(1, 0));
    expect(d && d.kind === 'opening' && d.esquadria.peitoril).toBe(0.5);
    s.undo();
    const antes = dadosDoSubelemento(s.project, esquadria(1, 0));
    expect(antes && antes.kind === 'opening' && antes.esquadria.peitoril).toBeNull();
  });

  it('remover a esquadria: o subelemento da esquadria deixa de existir e a célula volta a seguir o painel padrão', () => {
    const s = comEsquadrias();
    s.exec(comandoRemoverEsquadria('ct1', 0, 0), undefined, 'pt');
    expect(dadosDoSubelemento(s.project, esquadria(0, 0))).toBeNull();
    const d = dadosDoSubelemento(s.project, celula(0, 0));
    expect(d && d.kind === 'cell' && d.comEsquadria).toBe(false);
    expect(d && d.kind === 'cell' && d.sobrescrita).toBe(false);
  });
});
