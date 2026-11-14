import { describe, expect, it } from 'vitest';
import { areaComSinal, isMass, type Mass, type PerfilMassa, type Project, type SecaoMassa } from '@hestia/model';
import { massaM1, massaM2 } from '@hestia/engine/src/fixtureMassa.ts';
import { clickAt, makeEnv, P } from './testEnv.ts';
import { MassTool } from './massTool.ts';
import type { ToolEnv } from './types.ts';

/** Ferramenta de massa num ambiente de teste que guarda as mensagens da barra e pode simular corte ou inglês. */
function criar(opts: { lang?: 'pt' | 'en'; vistaCorte?: boolean } = {}) {
  const base = makeEnv();
  const mensagens: string[] = [];
  const env: ToolEnv = {
    ...base.env,
    say: (m) => {
      mensagens.push(m);
    },
    ...(opts.lang ? { lang: () => opts.lang! } : {}),
    ...(opts.vistaCorte ? { isSectionView: () => true } : {}),
  };
  const t = new MassTool(env);
  t.start();
  return { store: base.store, t, mensagens, sel: base.sel, done: base.done };
}

const massas = (store: { project: Project }): Mass[] => Object.values(store.project.elements).filter(isMass);
const ultimaMensagem = (ms: string[]): string => ms[ms.length - 1] ?? '';
const raioDe = (s: SecaoMassa): number => (s.perfil.forma === 'circulo' ? s.perfil.raio : NaN);
/** Vértices do perfil livre da primeira seção, em coordenadas locais. */
const pontosLivres = (m: Mass): { x: number; y: number }[] => {
  const p: PerfilMassa = m.secoes[0]!.perfil;
  if (p.forma !== 'livre') throw new Error('o teste espera perfil livre');
  return p.pontos;
};

describe('ferramenta Massa: extrusão de cada perfil', () => {
  it('extrusão de círculo: 2 seções em z 0 e na altura, raio até o segundo clique, origem no centro', () => {
    const { store, t } = criar();
    clickAt(t, 2, 1);
    clickAt(t, 5, 1);
    const [m] = massas(store);
    expect(massas(store)).toHaveLength(1);
    expect(m!.origem).toEqual({ x: 2, y: 1 });
    expect(m!.secoes.map((s) => s.z)).toEqual([0, 9]);
    expect(m!.secoes.map((s) => s.perfil)).toEqual([{ forma: 'circulo', raio: 3 }, { forma: 'circulo', raio: 3 }]);
    expect(m!.interpolacao).toBe('linear');
    expect(m!.resolucao).toBe(64);
  });

  it('extrusão de elipse: rx e ry são |dx| e |dy| até o canto clicado', () => {
    const { store, t } = criar();
    t.perfil = 'elipse';
    clickAt(t, 0, 0);
    clickAt(t, -4, 2);
    const [m] = massas(store);
    expect(m!.secoes[0]!.perfil).toEqual({ forma: 'elipse', rx: 4, ry: 2 });
    expect(m!.secoes[1]!.perfil).toEqual({ forma: 'elipse', rx: 4, ry: 2 });
    expect(m!.secoes[1]!.z).toBe(9);
  });

  it('extrusão de polígono regular de 6 lados (padrão) com o raio do clique e a altura padrão de 9 m', () => {
    const { store, t } = criar();
    t.perfil = 'poligono';
    expect(t.lados).toBe(6);
    expect(t.altura).toBe(9);
    clickAt(t, 0, 0);
    clickAt(t, 5, 0);
    const [m] = massas(store);
    expect(m!.secoes[0]!.perfil).toEqual({ forma: 'poligono', lados: 6, raio: 5 });
    expect(m!.secoes[1]!.z).toBe(9);
  });

  it('extrusão de perfil livre: origem é o centróide arredondado a 1 mm e os pontos saem locais a ela', () => {
    const { store, t } = criar();
    t.perfil = 'livre';
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    clickAt(t, 0, 3);
    t.confirm();
    const [m] = massas(store);
    expect(m!.origem).toEqual({ x: 1.333, y: 1 });
    const cliques = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }];
    pontosLivres(m!).forEach((q, i) => {
      expect(q.x + m!.origem.x).toBeCloseTo(cliques[i]!.x, 9);
      expect(q.y + m!.origem.y).toBeCloseTo(cliques[i]!.y, 9);
    });
  });

  it('perfil livre traçado no sentido horário sai anti-horário, porque o comando normaliza o sentido', () => {
    const { store, t } = criar();
    t.perfil = 'livre';
    clickAt(t, 0, 0);
    clickAt(t, 0, 3);
    clickAt(t, 4, 0);
    t.confirm();
    const [m] = massas(store);
    expect(areaComSinal(pontosLivres(m!))).toBeGreaterThan(0);
  });

  it('C fecha o perfil livre com três pontos e cria a massa', () => {
    const { store, t } = criar();
    t.perfil = 'livre';
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    clickAt(t, 0, 3);
    expect(t.type('c')).toBe(true);
    expect(massas(store)).toHaveLength(1);
  });

  it('o raio digitado e Enter vai até o ponto na direção do cursor', () => {
    const { store, t } = criar();
    clickAt(t, 0, 0);
    t.move(P(1, 0));
    expect(t.type('3')).toBe(true);
    const [m] = massas(store);
    expect(m!.secoes[0]!.perfil).toEqual({ forma: 'circulo', raio: 3 });
    expect(m!.origem).toEqual({ x: 0, y: 0 });
  });

  it('lados do polígono ficam entre 3 e 64 e são inteiros', () => {
    const { t } = criar();
    t.lados = 2;
    expect(t.lados).toBe(3);
    t.lados = 100;
    expect(t.lados).toBe(64);
    t.lados = 7.4;
    expect(t.lados).toBe(7);
    t.lados = Number.NaN;
    expect(t.lados).toBe(7);
  });

  it('altura inválida (zero ou não numérica) é ignorada pela propriedade', () => {
    const { t } = criar();
    t.altura = 0;
    t.altura = Number.NaN;
    expect(t.altura).toBe(9);
  });
});

describe('ferramenta Massa: M1 e M2 criadas pelo clique são iguais às da fixture', () => {
  it('M1 (retângulo 10 × 6, altura 9, livre) é igual à massaM1 de fixtureMassa.ts', () => {
    const { store, t } = criar();
    t.perfil = 'livre';
    clickAt(t, -5, -3);
    clickAt(t, 5, -3);
    clickAt(t, 5, 3);
    clickAt(t, -5, 3);
    t.confirm();
    const [m] = massas(store);
    const f = massaM1();
    expect(m!.secoes).toEqual(f.secoes);
    expect(m!.origem).toEqual(f.origem);
    expect(m!.levelId).toBe(f.levelId);
    expect(m!.interpolacao).toBe(f.interpolacao);
    expect(m!.resolucao).toBe(f.resolucao);
    expect(m!.baseOffset).toBe(f.baseOffset);
  });

  it('M2 (círculo r = 5, altura 12) é igual à massaM2 de fixtureMassa.ts', () => {
    const { store, t } = criar();
    t.altura = 12;
    clickAt(t, 0, 0);
    clickAt(t, 5, 0);
    const [m] = massas(store);
    const f = massaM2();
    expect(m!.secoes).toEqual(f.secoes);
    expect(m!.origem).toEqual(f.origem);
    expect(m!.interpolacao).toBe(f.interpolacao);
  });
});

describe('ferramenta Massa: mistura e bulbo', () => {
  it('mistura: a base em z 0 e o topo na altura, com perfis diferentes e o deslocamento do topo em relação à base', () => {
    const { store, t } = criar();
    t.modo = 'mistura';
    t.altura = 6;
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    clickAt(t, 1, 2);
    clickAt(t, 2, 2);
    const [m] = massas(store);
    expect(m!.origem).toEqual({ x: 0, y: 0 });
    expect(m!.secoes).toEqual([
      { z: 0, perfil: { forma: 'circulo', raio: 3 }, rotacao: 0, escala: 1, dx: 0, dy: 0 },
      { z: 6, perfil: { forma: 'circulo', raio: 1 }, rotacao: 0, escala: 1, dx: 1, dy: 2 },
    ]);
    expect(m!.interpolacao).toBe('linear');
  });

  it('bulbo: 5 seções de círculo com as razões de M4, interpolação suave e o raio do meio igual ao raio máximo', () => {
    const { store, t } = criar();
    t.modo = 'bulbo';
    t.altura = 15;
    clickAt(t, 0, 0);
    clickAt(t, 6, 0);
    const [m] = massas(store);
    expect(m!.secoes).toHaveLength(5);
    expect(m!.interpolacao).toBe('suave');
    expect(m!.secoes.every((s) => s.perfil.forma === 'circulo')).toBe(true);
    expect(raioDe(m!.secoes[2]!)).toBe(6);
    [3, 5, 6, 4, 1.5].forEach((r, i) => expect(raioDe(m!.secoes[i]!)).toBeCloseTo(r, 3));
    [0, 4, 8, 12, 15].forEach((z, i) => expect(m!.secoes[i]!.z).toBeCloseTo(z, 2));
  });

  it('bulbo ignora a opção de perfil: sempre círculo', () => {
    const { store, t } = criar();
    t.modo = 'bulbo';
    t.perfil = 'poligono';
    t.altura = 10;
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    expect(massas(store)[0]!.secoes.every((s) => s.perfil.forma === 'circulo')).toBe(true);
  });

  it('número digitado sem passo em andamento muda a altura da massa seguinte', () => {
    const { store, t, mensagens } = criar();
    expect(t.type('12')).toBe(true);
    expect(t.altura).toBe(12);
    expect(mensagens.some((m) => m.includes('12,00 m'))).toBe(true);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    expect(massas(store)[0]!.secoes[1]!.z).toBe(12);
  });

  it('o texto que não é número não é tratado pela ferramenta', () => {
    const { t } = criar();
    expect(t.type('abc')).toBe(false);
  });
});

describe('ferramenta Massa: loft e o aviso ao diálogo de seções', () => {
  it('loft cria a massa com 2 seções e chama aoCriar com o id dela', () => {
    const { store, t } = criar();
    const ids: string[] = [];
    t.aoCriar = (id) => ids.push(id);
    t.modo = 'loft';
    t.altura = 4;
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    const [m] = massas(store);
    expect(m!.secoes).toHaveLength(2);
    expect(m!.secoes[1]!.z).toBe(4);
    expect(ids).toEqual([m!.id]);
  });

  it('mistura não chama aoCriar: só o loft abre o diálogo de seções', () => {
    const { store, t } = criar();
    const ids: string[] = [];
    t.aoCriar = (id) => ids.push(id);
    t.modo = 'mistura';
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    expect(massas(store)).toHaveLength(1);
    expect(ids).toEqual([]);
  });
});

describe('ferramenta Massa: Esc e volta de passo', () => {
  it('Esc cancela o passo em andamento sem criar nada, e o segundo Esc sai da ferramenta', () => {
    const { store, t, done } = criar();
    clickAt(t, 0, 0);
    t.cancel();
    expect(massas(store)).toHaveLength(0);
    expect(done()).toBe(0);
    t.cancel();
    expect(done()).toBe(1);
  });

  it('mistura: Esc no topo sem nada clicado volta ao perfil da base', () => {
    const { store, t, mensagens } = criar();
    t.modo = 'mistura';
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    t.cancel();
    expect(ultimaMensagem(mensagens)).toContain('base');
    clickAt(t, 10, 10);
    clickAt(t, 12, 10);
    clickAt(t, 10, 10);
    clickAt(t, 11, 10);
    const [m] = massas(store);
    expect(m!.origem).toEqual({ x: 10, y: 10 });
  });

  it('mistura: com o centro do topo já clicado, o primeiro Esc só limpa o topo e o segundo volta à base', () => {
    const { store, t } = criar();
    t.modo = 'mistura';
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    clickAt(t, 1, 1);
    t.cancel();
    expect(massas(store)).toHaveLength(0);
    t.cancel();
    clickAt(t, 10, 10);
    clickAt(t, 12, 10);
    clickAt(t, 10, 10);
    clickAt(t, 11, 10);
    expect(massas(store)[0]!.origem).toEqual({ x: 10, y: 10 });
  });
});

describe('ferramenta Massa: validação pelo modelo, desfazer e seleção', () => {
  it('perfil livre com dois pontos não cria massa e mostra a mensagem do modelo', () => {
    const { store, t, mensagens } = criar();
    t.perfil = 'livre';
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    t.confirm();
    expect(massas(store)).toHaveLength(0);
    expect(ultimaMensagem(mensagens)).toMatch(/3 a 256 pontos/);
  });

  it('perfil livre de três pontos alinhados (área nula) é recusado com a mensagem do modelo', () => {
    const { store, t, mensagens } = criar();
    t.perfil = 'livre';
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 4, 0);
    t.confirm();
    expect(massas(store)).toHaveLength(0);
    expect(ultimaMensagem(mensagens)).toMatch(/simples/);
  });

  it('na mistura, a base livre inválida é recusada logo ao concluí-la, sem pedir o topo', () => {
    const { store, t, mensagens } = criar();
    t.modo = 'mistura';
    t.perfil = 'livre';
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    t.confirm();
    expect(massas(store)).toHaveLength(0);
    expect(ultimaMensagem(mensagens)).toMatch(/3 a 256 pontos/);
    expect(ultimaMensagem(mensagens)).not.toContain('topo');
  });

  it('um Ctrl+Z desfaz a massa criada num único passo, e a massa criada fica selecionada', () => {
    const { store, t, sel } = criar();
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    const [m] = massas(store);
    expect(sel()).toEqual([m!.id]);
    store.undo();
    expect(massas(store)).toHaveLength(0);
  });
});

describe('ferramenta Massa: vista, prévia, barra e idioma', () => {
  it('na vista de corte a ferramenta não cria massa e avisa que a massa é de planta', () => {
    const { store, t, mensagens } = criar({ vistaCorte: true });
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    expect(massas(store)).toHaveLength(0);
    expect(ultimaMensagem(mensagens)).toContain('planta');
  });

  it('a prévia mostra o contorno em andamento até o cursor, sem gravar nada', () => {
    const { store, t } = criar();
    clickAt(t, 0, 0);
    t.move(P(3, 0));
    const itens = t.preview();
    expect(itens.some((i) => i.kind === 'polygon')).toBe(true);
    expect(itens.some((i) => i.kind === 'line')).toBe(true);
    expect(massas(store)).toHaveLength(0);
  });

  it('trocar o perfil pela barra recomeça o passo em andamento', () => {
    const { store, t } = criar();
    clickAt(t, 0, 0);
    t.perfil = 'elipse';
    clickAt(t, 1, 1);
    clickAt(t, 4, 3);
    const [m] = massas(store);
    expect(m!.origem).toEqual({ x: 1, y: 1 });
    expect(m!.secoes[0]!.perfil).toEqual({ forma: 'elipse', rx: 3, ry: 2 });
  });

  it('a dica inicial sai em inglês quando a interface pede inglês', () => {
    const { mensagens } = criar({ lang: 'en' });
    expect(ultimaMensagem(mensagens)).toMatch(/^Mass: click/);
  });
});

describe('ferramenta Massa: opções da barra (options.mass, ficha E11)', () => {
  it('ao ligar, lê options.mass: modo, perfil, altura e lados vêm da barra', () => {
    const { env, options } = makeEnv();
    options.mass = { modo: 'mistura', perfil: 'poligono', altura: 5, lados: 8 };
    const t = new MassTool(env);
    t.start();
    expect(t.modo).toBe('mistura');
    expect(t.perfil).toBe('poligono');
    expect(t.altura).toBe(5);
    expect(t.lados).toBe(8);
  });

  it('sem options.mass, o padrão é extrusão, círculo, 9 m e 6 lados', () => {
    const { env } = makeEnv();
    const t = new MassTool(env);
    t.start();
    expect([t.modo, t.perfil, t.altura, t.lados]).toEqual(['extrusao', 'circulo', 9, 6]);
  });

  it('options.mass com altura inválida mantém a altura padrão (o setter valida)', () => {
    const { env, options } = makeEnv();
    options.mass = { modo: 'bulbo', perfil: 'circulo', altura: -1, lados: 6 };
    const t = new MassTool(env);
    t.start();
    expect(t.modo).toBe('bulbo');
    expect(t.altura).toBe(9);
  });
});
