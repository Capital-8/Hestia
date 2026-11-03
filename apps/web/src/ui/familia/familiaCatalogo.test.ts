import { CATALOGO_PADRAO, type Catalogo } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import {
  ROTULO_UNIDADE,
  UNIDADES_FERRAGEM,
  adicionarChapa,
  adicionarFerragem,
  adicionarFita,
  atualizarChapa,
  atualizarChapaEm,
  atualizarFerragem,
  atualizarFerragemEm,
  atualizarFita,
  atualizarFitaEm,
  novoIdUnico,
  problemasDoCatalogo,
  removerChapa,
  removerChapaEm,
  removerFerragem,
  removerFerragemEm,
  removerFita,
  removerFitaEm,
} from './familiaCatalogo.ts';

const novo = (): Catalogo => structuredClone(CATALOGO_PADRAO);
const chapa = (c: Catalogo, id: string) => c.chapas.find((x) => x.id === id);
const fita = (c: Catalogo, id: string) => c.fitas.find((x) => x.id === id);
const ferragem = (c: Catalogo, id: string) => c.ferragens.find((x) => x.id === id);

describe('novoIdUnico', () => {
  it('usa o prefixo livre e sufixa _2, _3… quando ocupado', () => {
    expect(novoIdUnico('chapa', [])).toBe('chapa');
    expect(novoIdUnico('chapa', ['mdf18'])).toBe('chapa');
    expect(novoIdUnico('chapa', ['chapa'])).toBe('chapa_2');
    expect(novoIdUnico('chapa', ['chapa', 'chapa_2'])).toBe('chapa_3');
    expect(novoIdUnico('chapa', ['chapa', 'chapa_3'])).toBe('chapa_2');
  });

  it('limpa espaços e cai em “item” quando o prefixo é vazio', () => {
    expect(novoIdUnico('  fita  ', [])).toBe('fita');
    expect(novoIdUnico('   ', [])).toBe('item');
    expect(novoIdUnico('   ', ['item'])).toBe('item_2');
  });
});

describe('atualizarChapa', () => {
  it('converte número com vírgula e não mexe no catálogo original', () => {
    const c = novo();
    const r = atualizarChapa(c, 'mdf18', 'espessura', '18,5');
    expect(r).not.toBeNull();
    expect(chapa(r!, 'mdf18')?.espessura).toBe(18.5);
    expect(chapa(c, 'mdf18')?.espessura).toBe(18);
  });

  it('recusa número inválido, vazio e chapa inexistente', () => {
    const c = novo();
    expect(atualizarChapa(c, 'mdf18', 'espessura', 'grossa')).toBeNull();
    expect(atualizarChapa(c, 'mdf18', 'largura', '')).toBeNull();
    expect(atualizarChapa(c, 'nao_existe', 'nome', 'X')).toBeNull();
  });

  it('texto, veio, cor e id', () => {
    const c = novo();
    expect(chapa(atualizarChapa(c, 'mdf18', 'nome', ' MDF 18 ' )!, 'mdf18')?.nome).toBe('MDF 18');
    expect(chapa(atualizarChapa(c, 'mdf18', 'material', 'MDP')!, 'mdf18')?.material).toBe('MDP');
    expect(chapa(atualizarChapa(c, 'mdf18', 'veio', 'false')!, 'mdf18')?.veio).toBe(false);
    expect(chapa(atualizarChapa(c, 'mdf18', 'veio', 'true')!, 'mdf18')?.veio).toBe(true);
    expect(atualizarChapa(c, 'mdf18', 'veio', 'talvez')).toBeNull();
    expect(chapa(atualizarChapa(c, 'mdf18', 'cor', '')!, 'mdf18')?.cor).toBeUndefined();
    expect(chapa(atualizarChapa(c, 'mdf18', 'cor', '#123456')!, 'mdf18')?.cor).toBe('#123456');
    expect(chapa(atualizarChapa(c, 'mdf18', 'id', 'mdf18_novo')!, 'mdf18_novo')?.id).toBe('mdf18_novo');
    expect(atualizarChapa(c, 'mdf18', 'id', '  ')).toBeNull();
  });

  it('custoM2 vazio remove o campo; inválido recusa', () => {
    const c = novo();
    expect(chapa(atualizarChapa(c, 'mdf18', 'custoM2', '')!, 'mdf18')?.custoM2).toBeUndefined();
    expect(atualizarChapa(c, 'mdf18', 'custoM2', 'caro')).toBeNull();
    expect(chapa(atualizarChapa(c, 'mdf18', 'custoM2', '90,5')!, 'mdf18')?.custoM2).toBe(90.5);
  });

  it('atualizarChapaEm edita pela posição (mesmo com id repetido)', () => {
    const c = novo();
    c.chapas[1]!.id = c.chapas[0]!.id;
    const r = atualizarChapaEm(c, 1, 'nome', 'Segunda');
    expect(r?.chapas[0]?.nome).toBe('MDF 6 mm');
    expect(r?.chapas[1]?.nome).toBe('Segunda');
  });
});

describe('atualizarFita e atualizarFerragem', () => {
  it('fita: número, texto, custo opcional e cor', () => {
    const c = novo();
    expect(fita(atualizarFita(c, 'fita_pvc_1', 'custoM', '3,5')!, 'fita_pvc_1')?.custoM).toBe(3.5);
    expect(fita(atualizarFita(c, 'fita_pvc_1', 'nome', 'Fita 1')!, 'fita_pvc_1')?.nome).toBe('Fita 1');
    expect(fita(atualizarFita(c, 'fita_pvc_1', 'custoM', '')!, 'fita_pvc_1')?.custoM).toBeUndefined();
    expect(fita(atualizarFita(c, 'fita_pvc_1', 'cor', '#abcdef')!, 'fita_pvc_1')?.cor).toBe('#abcdef');
    expect(atualizarFita(c, 'fita_pvc_1', 'altura', 'alta')).toBeNull();
  });

  it('atualizarFitaEm e atualizarFerragemEm editam pela posição', () => {
    const c = novo();
    expect(fita(atualizarFitaEm(c, 0, 'nome', 'Primeira')!, 'fita_pvc_045')?.nome).toBe('Primeira');
    expect(atualizarFitaEm(c, 99, 'nome', 'X')).toBeNull();
    expect(ferragem(atualizarFerragemEm(c, 0, 'nome', 'Dobradiça nova')!, 'dobradica')?.nome).toBe('Dobradiça nova');
    expect(atualizarFerragemEm(c, 99, 'nome', 'X')).toBeNull();
  });

  it('ferragem: unidade válida, código opcional e custo', () => {
    const c = novo();
    expect(ferragem(atualizarFerragem(c, 'dobradica', 'unidade', 'par')!, 'dobradica')?.unidade).toBe('par');
    expect(atualizarFerragem(c, 'dobradica', 'unidade', 'kg')).toBeNull();
    expect(ferragem(atualizarFerragem(c, 'dobradica', 'codigo', 'D-35')!, 'dobradica')?.codigo).toBe('D-35');
    expect(ferragem(atualizarFerragem(c, 'dobradica', 'codigo', '')!, 'dobradica')?.codigo).toBeUndefined();
    expect(ferragem(atualizarFerragem(c, 'dobradica', 'custo', '7,25')!, 'dobradica')?.custo).toBe(7.25);
    expect(ferragem(atualizarFerragem(c, 'dobradica', 'custo', '')!, 'dobradica')?.custo).toBeUndefined();
    expect(atualizarFerragem(c, 'dobradica', 'custo', 'muito')).toBeNull();
  });

  it('unidades e rótulos de ferragem', () => {
    expect(UNIDADES_FERRAGEM).toEqual(['un', 'par', 'jogo', 'm']);
    expect(UNIDADES_FERRAGEM.map((u) => ROTULO_UNIDADE[u])).toEqual(['Unidade', 'Par', 'Jogo', 'Metro']);
  });
});

describe('adicionar e remover', () => {
  it('acrescenta chapa, fita e ferragem com id automático e padrões', () => {
    const c = novo();
    const c1 = adicionarChapa(c);
    expect(c1.chapas).toHaveLength(c.chapas.length + 1);
    expect(c1.chapas.at(-1)).toMatchObject({ id: 'chapa', nome: 'Nova chapa', material: 'MDF', espessura: 18, veio: false });
    expect(adicionarChapa(c1).chapas.at(-1)?.id).toBe('chapa_2');

    const f1 = adicionarFita(c);
    expect(f1.fitas.at(-1)).toMatchObject({ id: 'fita', nome: 'Nova fita', espessura: 0.45, altura: 22 });
    expect(adicionarFita(f1).fitas.at(-1)?.id).toBe('fita_2');

    const g1 = adicionarFerragem(c);
    expect(g1.ferragens.at(-1)).toMatchObject({ id: 'ferragem', nome: 'Nova ferragem', unidade: 'un' });
    expect(adicionarFerragem(g1).ferragens.at(-1)?.id).toBe('ferragem_2');
  });

  it('remove por posição e por id, sem tocar no original', () => {
    const c = novo();
    expect(removerChapa(c, 'mdf6').chapas).toHaveLength(c.chapas.length - 1);
    expect(removerChapa(c, 'nao_existe')).toBe(c);
    expect(removerChapaEm(c, 99)).toBe(c);
    expect(removerChapaEm(c, 0).chapas).toHaveLength(c.chapas.length - 1);
    expect(removerFita(c, 'fita_pvc_1').fitas).toHaveLength(c.fitas.length - 1);
    expect(removerFitaEm(c, 0).fitas).toHaveLength(c.fitas.length - 1);
    expect(removerFitaEm(c, 99)).toBe(c);
    expect(removerFerragem(c, 'dobradica').ferragens).toHaveLength(c.ferragens.length - 1);
    expect(removerFerragemEm(c, 0).ferragens).toHaveLength(c.ferragens.length - 1);
    expect(removerFerragemEm(c, 99)).toBe(c);
    expect(c.chapas).toHaveLength(6);
  });
});

describe('problemasDoCatalogo', () => {
  it('catálogo padrão não tem problemas', () => {
    expect(problemasDoCatalogo(novo())).toEqual([]);
  });

  it('lista no máximo cinco mensagens', () => {
    const c = novo();
    for (const x of c.chapas) x.espessura = 0;
    const p = problemasDoCatalogo(c);
    expect(p).toHaveLength(5);
    expect(p[0]).toContain('espessura');
  });
});
