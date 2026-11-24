import { describe, expect, it } from 'vitest';
import {
  adicionarPrimitivo,
  adicionarSimbolo,
  criarPrimitivoPadrao,
  criarSimboloPadrao,
  editarSimbolo,
  excluirPrimitivo,
  excluirSimbolo,
  idNovoSimbolo,
  milimetros,
  moverPonto,
  pontosDoPrimitivo,
  substituirPrimitivo,
} from './edicaoSimbolos.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import type { Familia } from './tipos.ts';
import type { Primitivo2D } from './tiposRepresentacao.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);

/** Família com o símbolo `tom` (uma linha de 0 a L, em planta). */
const comSimbolo = (): Familia => {
  const f = nova();
  expect(adicionarSimbolo(f, criarSimboloPadrao('tom', 'Tomada'))).toBeNull();
  return f;
};

describe('criação e edição de símbolos', () => {
  it('cria símbolo em planta, plano XY, com uma linha de exemplo', () => {
    const s = criarSimboloPadrao('x', 'X');
    expect(s).toEqual({ id: 'x', nome: 'X', vistas: ['planta'], plano: 'xy', primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['100', '0'] }], substituiGeometria: false });
  });

  it('adiciona e recusa id repetido, nome vazio e id vazio', () => {
    const f = comSimbolo();
    expect(adicionarSimbolo(f, criarSimboloPadrao('tom', 'Outra'))).toBe('id repetido: “tom”');
    expect(adicionarSimbolo(f, criarSimboloPadrao('b', '  '))).toBe('o símbolo precisa de um nome');
    expect(adicionarSimbolo(f, criarSimboloPadrao('  ', 'X'))).toBe('o símbolo precisa de um id não vazio');
    expect(f.simbolos?.map((s) => s.id)).toEqual(['tom']);
  });

  it('recusa vista vazia sem alterar a família', () => {
    const f = comSimbolo();
    const antes = structuredClone(f);
    expect(editarSimbolo(f, 'tom', { vistas: [] })).not.toBeNull();
    expect(f).toEqual(antes);
  });

  it('edita vistas, plano e substituição; remove campo opcional com undefined', () => {
    const f = comSimbolo();
    expect(editarSimbolo(f, 'tom', { vistas: ['planta', 'corte'], plano: 'xz', substituiGeometria: true })).toBeNull();
    const s = f.simbolos?.[0];
    expect(s?.vistas).toEqual(['planta', 'corte']);
    expect(s?.plano).toBe('xz');
    expect(s?.substituiGeometria).toBe(true);
    expect(editarSimbolo(f, 'tom', { substituiGeometria: undefined })).toBeNull();
    expect(f.simbolos?.[0]?.substituiGeometria).toBeUndefined();
  });

  it('recusa editar símbolo inexistente, id ou primitivos no patch', () => {
    const f = comSimbolo();
    expect(editarSimbolo(f, 'nao', { nome: 'x' })).toBe('símbolo “nao” não existe');
    expect(editarSimbolo(f, 'tom', { id: 'novo' } as never)).toBe('o id e os primitivos não mudam por aqui');
  });

  it('exclui o símbolo e recusa exclusão de inexistente', () => {
    const f = comSimbolo();
    expect(excluirSimbolo(f, 'tom')).toBeNull();
    expect(f.simbolos).toEqual([]);
    expect(excluirSimbolo(f, 'tom')).toBe('símbolo “tom” não existe');
  });

  it('idNovoSimbolo devolve o primeiro id livre', () => {
    const f = comSimbolo();
    expect(idNovoSimbolo(f)).toBe('simbolo');
    adicionarSimbolo(f, criarSimboloPadrao('simbolo', 'S'));
    expect(idNovoSimbolo(f)).toBe('simbolo_2');
  });
});

describe('primitivos', () => {
  it('cria um primitivo de cada tipo com validade própria', () => {
    const tipos: Primitivo2D['tipo'][] = ['linha', 'circulo', 'arco', 'polilinha', 'texto'];
    const f = comSimbolo();
    for (const t of tipos) expect(adicionarPrimitivo(f, 'tom', criarPrimitivoPadrao(t))).toBeNull();
    expect(f.simbolos?.[0]?.primitivos.map((p) => p.tipo)).toEqual(['linha', ...tipos]);
  });

  it('recusa primitivo sem tipo conhecido e símbolo inexistente', () => {
    const f = comSimbolo();
    expect(adicionarPrimitivo(f, 'tom', { tipo: 'nuvem' } as unknown as Primitivo2D)).toBe('primitivo inválido');
    expect(adicionarPrimitivo(f, 'nao', criarPrimitivoPadrao('linha'))).toBe('símbolo “nao” não existe');
  });

  it('recusa primitivo que o validador rejeita (raio zero) e mantém a família', () => {
    const f = comSimbolo();
    const antes = structuredClone(f);
    expect(adicionarPrimitivo(f, 'tom', { tipo: 'circulo', centro: ['0', '0'], raio: '0' })).not.toBeNull();
    expect(f).toEqual(antes);
  });

  it('substitui e exclui por posição; posição inválida é recusada', () => {
    const f = comSimbolo();
    adicionarPrimitivo(f, 'tom', criarPrimitivoPadrao('texto'));
    expect(substituirPrimitivo(f, 'tom', 0, criarPrimitivoPadrao('circulo'))).toBeNull();
    expect(f.simbolos?.[0]?.primitivos[0]?.tipo).toBe('circulo');
    expect(substituirPrimitivo(f, 'tom', 5, criarPrimitivoPadrao('circulo'))).toBe('primitivo 5 não existe');
    expect(excluirPrimitivo(f, 'tom', 0)).toBeNull();
    expect(f.simbolos?.[0]?.primitivos.map((p) => p.tipo)).toEqual(['texto']);
    expect(excluirPrimitivo(f, 'tom', 9)).toBe('primitivo 9 não existe');
  });

  it('recusa excluir o último primitivo (o símbolo precisa de pelo menos um) e mantém a família', () => {
    const f = comSimbolo();
    const antes = structuredClone(f);
    expect(excluirPrimitivo(f, 'tom', 0)).not.toBeNull();
    expect(f).toEqual(antes);
  });

  it('pontosDoPrimitivo lista os pontos de controle de cada tipo', () => {
    expect(pontosDoPrimitivo(criarPrimitivoPadrao('linha'))).toHaveLength(2);
    expect(pontosDoPrimitivo(criarPrimitivoPadrao('circulo'))).toHaveLength(1);
    expect(pontosDoPrimitivo(criarPrimitivoPadrao('polilinha'))).toHaveLength(3);
    expect(pontosDoPrimitivo(criarPrimitivoPadrao('texto'))).toHaveLength(1);
  });
});

describe('arrasto de ponto', () => {
  it('move o ponto para números literais em mm, arredondados', () => {
    const f = comSimbolo();
    expect(moverPonto(f, 'tom', 0, 1, 123.4567, -20)).toBeNull();
    expect(f.simbolos?.[0]?.primitivos[0]).toEqual({ tipo: 'linha', de: ['0', '0'], ate: ['123.457', '-20'] });
  });

  it('recusa coordenada não finita e ponto inexistente, sem alterar a família', () => {
    const f = comSimbolo();
    const antes = structuredClone(f);
    expect(moverPonto(f, 'tom', 0, 0, Number.NaN, 0)).toBe('coordenada inválida');
    expect(moverPonto(f, 'tom', 0, 9, 1, 1)).toBe('ponto 9 não existe');
    expect(moverPonto(f, 'tom', 3, 0, 1, 1)).toBe('primitivo 3 não existe');
    expect(f).toEqual(antes);
  });

  it('milimetros arredonda e nunca devolve notação científica para valores pequenos', () => {
    expect(milimetros(0.0000004)).toBe('0');
    expect(milimetros(12.34567)).toBe('12.346');
  });
});
