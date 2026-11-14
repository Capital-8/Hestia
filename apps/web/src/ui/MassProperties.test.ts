import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectStore, createEmptyProject, makeMass, type Mass, type SecaoMassa } from '@hestia/model';
import { acoesDaMassa, MassProperties, type RotulosMassa } from './MassProperties.tsx';
import { torcaoTotalGraus } from './massSecoesForm.ts';

// O painel real assina o projeto pelo editor; no teste basta o projeto atual (sem `getServerSnapshot` no render de servidor).
vi.mock('../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.project };
});

const ROTULOS: RotulosMassa = { edit: 'Editar massa', torcao: 'Torção da massa', arranjo: 'Arranjo polar da massa' };
const quad = (z: number): SecaoMassa => ({ z, perfil: { forma: 'poligono', lados: 4, raio: 5 }, rotacao: 0, escala: 1, dx: 0, dy: 0 });

function cena(): { store: ProjectStore; massa: () => Mass } {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addMass', mass: makeMass({ id: 'ms_p1', levelId: 'lv_0', name: 'Torre', secoes: [quad(0), quad(12), quad(24)] }) });
  const massa = (): Mass => {
    const m = store.project.elements['ms_p1'];
    if (!m || m.kind !== 'mass') throw new Error('massa não existe');
    return m;
  };
  return { store, massa };
}

const html = (massas: Mass[]): string => renderToStaticMarkup(createElement(MassProperties, { massas }));

describe('painel de propriedades da massa: campos exibidos', () => {
  it('uma massa mostra nome, nível, base, altura total, interpolação, resolução, torção, arranjo, cor e Editar seções', () => {
    const { massa } = cena();
    const out = html([massa()]);
    for (const id of ['ms-name', 'prop-level', 'ms-base', 'ms-height', 'ms-interp', 'ms-res', 'ms-torcao', 'ms-arr', 'ms-cor', 'ms-edit-secoes']) expect(out, id).toContain(`id="${id}"`);
    // altura total é só leitura e vale o z da última seção (24 m)
    expect(out).toMatch(/id="ms-height"[^>]*readOnly=""|id="ms-height"[^>]*readonly=""/i);
    expect(out).toContain('Torre');
    // sem arranjo ligado, os campos do arranjo não aparecem
    expect(out).not.toContain('id="ms-arr-n"');
  });

  it('com arranjo ligado mostra cópias, centro e ângulo total', () => {
    const { store, massa } = cena();
    acoesDaMassa(store, [massa()], ROTULOS, 'pt').arranjoLigado(true);
    const out = html([massa()]);
    for (const id of ['ms-arr-n', 'ms-arr-cx', 'ms-arr-cy', 'ms-arr-ang']) expect(out, id).toContain(`id="${id}"`);
  });

  it('seleção múltipla mostra só os campos comuns (sem nome, altura, torção, arranjo nem Editar seções)', () => {
    const { store, massa } = cena();
    store.exec({ type: 'addMass', mass: makeMass({ id: 'ms_p2', levelId: 'lv_0', secoes: [quad(0), quad(5)] }) });
    const outra = store.project.elements['ms_p2'];
    if (!outra || outra.kind !== 'mass') throw new Error('segunda massa');
    const out = html([massa(), outra]);
    for (const id of ['prop-level', 'ms-base', 'ms-interp', 'ms-res', 'ms-cor']) expect(out, id).toContain(`id="${id}"`);
    for (const id of ['ms-name', 'ms-height', 'ms-torcao', 'ms-arr', 'ms-edit-secoes']) expect(out, id).not.toContain(`id="${id}"`);
  });

  it('o painel não usa o cabeçalho de tipo: a massa não tem tipo', () => {
    const { massa } = cena();
    expect(html([massa()])).not.toContain('prop-gctype');
  });
});

describe('painel de propriedades da massa: edições', () => {
  it('edita nome, base, interpolação, resolução e cor, cada uma em UM passo de desfazer', () => {
    const { store, massa } = cena();
    const run = (f: (a: ReturnType<typeof acoesDaMassa>) => { ok: boolean }): void => {
      expect(f(acoesDaMassa(store, [massa()], ROTULOS, 'pt')).ok).toBe(true);
    };
    const rotuloDaCriacao = store.undoLabel;
    run((a) => a.nome('Torre norte'));
    expect(massa().name).toBe('Torre norte');
    expect(store.undoLabel).toBe('Editar massa');
    run((a) => a.base(1.5));
    expect(massa().baseOffset).toBe(1.5);
    run((a) => a.interpolacao('suave'));
    expect(massa().interpolacao).toBe('suave');
    run((a) => a.resolucao(96));
    expect(massa().resolucao).toBe(96);
    run((a) => a.cor('#ff8800'));
    expect(massa().color).toBe('#ff8800');
    // cinco edições, cinco passos: desfazer cinco vezes volta ao estado de antes e ao rótulo da criação
    for (let i = 0; i < 5; i++) store.undo();
    expect(massa()).toMatchObject({ name: 'Torre', baseOffset: 0, interpolacao: 'linear', resolucao: 64 });
    expect(massa().color).toBeUndefined();
    expect(store.undoLabel).toBe(rotuloDaCriacao);
  });

  it('nome vazio não grava nada', () => {
    const { store, massa } = cena();
    const label = store.undoLabel;
    expect(acoesDaMassa(store, [massa()], ROTULOS, 'pt').nome('   ')).toEqual({ ok: true, erro: null });
    expect(massa().name).toBe('Torre');
    expect(store.undoLabel).toBe(label);
  });

  it('torção total em radianos distribui a rotação pelas seções, em um passo de desfazer', () => {
    const { store, massa } = cena();
    const rotulo = store.undoLabel;
    const r = acoesDaMassa(store, [massa()], ROTULOS, 'pt').torcao(Math.PI / 2);
    expect(r.ok).toBe(true);
    expect(massa().secoes.map((s) => s.rotacao)).toEqual([0, expect.closeTo(Math.PI / 4, 12), expect.closeTo(Math.PI / 2, 12)]);
    expect(torcaoTotalGraus(massa().secoes)).toBeCloseTo(90, 9);
    expect(store.undoLabel).toBe('Torção da massa');
    store.undo();
    expect(torcaoTotalGraus(massa().secoes)).toBe(0);
    expect(store.undoLabel).toBe(rotulo);
  });

  it('liga o arranjo polar com 12 cópias e desliga (null remove o campo)', () => {
    const { store, massa } = cena();
    const a = (): ReturnType<typeof acoesDaMassa> => acoesDaMassa(store, [massa()], ROTULOS, 'pt');
    expect(massa().arranjo).toBeUndefined();
    expect(a().arranjoLigado(true).ok).toBe(true);
    expect(massa().arranjo).toMatchObject({ n: 6, cx: 0, cy: 0 });
    expect(a().arranjoCampo({ n: 12 }).ok).toBe(true);
    expect(a().arranjoCampo({ cx: 3, cy: -2 }).ok).toBe(true);
    expect(a().arranjoCampo({ anguloTotal: Math.PI }).ok).toBe(true);
    expect(massa().arranjo).toEqual({ n: 12, cx: 3, cy: -2, anguloTotal: Math.PI });
    expect(a().arranjoLigado(false).ok).toBe(true);
    expect(massa().arranjo).toBeUndefined();
    expect('arranjo' in massa()).toBe(false);
    expect(store.undoLabel).toBe('Arranjo polar da massa');
    store.undo();
    expect(massa().arranjo?.n).toBe(12);
  });

  it('recusa valor inválido com a mensagem do modelo e sem gravar nem criar passo de desfazer', () => {
    const { store, massa } = cena();
    const antes = store.project;
    const label = store.undoLabel;
    const a = acoesDaMassa(store, [massa()], ROTULOS, 'pt');
    const res = a.resolucao(8);
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/16/);
    const fracao = a.resolucao(20.5);
    expect(fracao.ok).toBe(false);
    expect(a.arranjoLigado(true).ok).toBe(true);
    const copias = acoesDaMassa(store, [massa()], ROTULOS, 'pt').arranjoCampo({ n: 1 });
    expect(copias.ok).toBe(false);
    expect(copias.erro).toMatch(/64|2/);
    expect(massa().resolucao).toBe(64);
    expect(massa().arranjo?.n).toBe(6);
    expect(store.project).not.toBe(antes);
    store.undo(); // desfaz só o "ligar arranjo"
    expect(store.project.elements['ms_p1']).toEqual(antes.elements['ms_p1']);
    expect(store.undoLabel).toBe(label);
  });

  it('torção que passa de π entre seções vizinhas é recusada com a mensagem do modelo', () => {
    const { store, massa } = cena();
    const antes = store.project;
    const r = acoesDaMassa(store, [massa()], ROTULOS, 'pt').torcao(Math.PI * 4);
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    expect(store.project).toBe(antes);
  });

  it('edição com várias massas é um único passo e valida todas antes de gravar', () => {
    const { store, massa } = cena();
    store.exec({ type: 'addMass', mass: makeMass({ id: 'ms_p2', levelId: 'lv_0', secoes: [quad(0), quad(5)] }) });
    const outra = store.project.elements['ms_p2'];
    if (!outra || outra.kind !== 'mass') throw new Error('segunda massa');
    const a = acoesDaMassa(store, [massa(), outra], ROTULOS, 'pt');
    expect(a.resolucao(32).ok).toBe(true);
    expect([massa().resolucao, (store.project.elements['ms_p2'] as Mass).resolucao]).toEqual([32, 32]);
    store.undo();
    expect([massa().resolucao, (store.project.elements['ms_p2'] as Mass).resolucao]).toEqual([64, 64]);
    const ruim = a.resolucao(9999);
    expect(ruim.ok).toBe(false);
    expect([massa().resolucao, (store.project.elements['ms_p2'] as Mass).resolucao]).toEqual([64, 64]);
  });
});
