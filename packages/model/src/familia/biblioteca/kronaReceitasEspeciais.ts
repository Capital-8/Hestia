import type { Corpo, Ponto3 } from '../tiposCorpo.ts';
import { disco, ESGOTO, ligacaoKrona, oco, type Contexto } from './kronaEsgotoApoio.ts';
import type { Receita } from './kronaReceitas.ts';

/*
 * Receitas das peças especiais da Krona esgoto (ficha D3b). Leitura MAIS SIMPLES das letras do catálogo, sem confirmação do
 * fabricante (CONFERIR em todas): C1/C = comprimento da corrida; C2 = eixo da corrida até a ponta do ramal de inspeção; T = diâmetro
 * externo do ramal de inspeção e da sua tampa; Z = eixo do ramal até o fundo da bolsa da corrida; A1/A2 = cruzamento até a entrada
 * da bolsa de cada perna. A tampa tem a espessura da parede (e), cota que o catálogo não traz.
 */

const EXT = 'Db + 2 * e';
const INT = 'Db - 2 * min(e, Db / 8)';
const S45 = 'sin(45)';
const C45 = 'cos(45)';
const z = (s: string): Ponto3 => ['0', '0', s];
const n = (v: Record<string, number>, k: string): number => v[k] ?? 0;
const ext = (v: Record<string, number>): number => n(v, 'Db') + 2 * n(v, 'e');

/** Tê de inspeção: corrida com bolsa em cima e ponta lisa embaixo (C no total) e ramal a 90° para +X que termina em TAMPA (sem ligação). */
export function teInspecao(ctx: Contexto = ESGOTO): Receita {
  const rot: Ponto3 = ['0', '90', '0'];
  return {
    usa: ['B', 'C', 'Z', 'C2', 'T', 'Db', 'De', 'e'],
    corpos: [
      oco('corrida', 'Corrida', 'conexao', EXT, INT, 'C - B', z('-(C - B - Z)')),
      oco('bolsa', 'Bolsa da corrida', 'conexao', EXT, 'Db', 'B', z('Z')),
      oco('ramal', 'Ramal de inspeção', 'conexao', 'T', 'T - 2 * min(e, T / 8)', 'C2 - e', z('0'), rot),
      disco('tampa', 'Tampa de inspeção', 'T', 'e', ['C2 - e', '0', '0']),
    ].map((c, i) => (i === 3 ? { ...c, quadro: { ...c.quadro, rotacao: rot } } : c)),
    ligacoes: [
      ligacaoKrona(ctx, 'a', 'Bolsa da corrida', z('Z + B'), ['0', '0', '1'], 'Db', 'B'),
      ligacaoKrona(ctx, 'b', 'Ponta da corrida', z('-(C - B - Z)'), ['0', '0', '-1'], 'De'),
    ],
    caixa: (v) => ({ L: n(v, 'C2') + n(v, 'T') / 2, A: n(v, 'C'), P: Math.max(ext(v), n(v, 'T')) }),
  };
}

/** Junção 45° dupla: corrida como a da junção simples e DOIS ramais a 45° saindo do mesmo cruzamento (um para +X, outro para −X). */
export function juncaoDupla(ctx: Contexto = ESGOTO): Receita {
  const ramos = [1, -1].map((s) => {
    const rot: Ponto3 = ['0', String(45 * s), '0'];
    const ao = (k: string): Ponto3 => [`${s} * (${k}) * ${S45}`, '0', `(${k}) * ${C45}`];
    const sufixo = s === 1 ? 'x_mais' : 'x_menos';
    return {
      corpos: [
        oco(`ramal_${sufixo}`, `Ramal ${s === 1 ? '+X' : '−X'}`, 'conexao', EXT, INT, 'Z', z('0'), rot),
        oco(`ramal_bolsa_${sufixo}`, `Bolsa do ramal ${s === 1 ? '+X' : '−X'}`, 'conexao', EXT, 'Db', 'B', ao('Z'), rot),
      ],
      ligacao: ligacaoKrona(ctx, s === 1 ? 'c' : 'd', `Bolsa do ramal ${s === 1 ? '+X' : '−X'}`, ao('Z + B'), [`${s} * ${S45}`, '0', C45], 'Db', 'B'),
    };
  });
  return {
    usa: ['B', 'C', 'Z', 'Db', 'De', 'e'],
    corpos: [
      oco('corrida', 'Corrida', 'conexao', EXT, INT, 'C - B', z('-(C - B - Z)')),
      oco('bolsa', 'Bolsa da corrida', 'conexao', EXT, 'Db', 'B', z('Z')),
      ...ramos.flatMap((r) => r.corpos),
    ],
    ligacoes: [
      ligacaoKrona(ctx, 'a', 'Bolsa da corrida', z('Z + B'), ['0', '0', '1'], 'Db', 'B'),
      ligacaoKrona(ctx, 'b', 'Ponta da corrida', z('-(C - B - Z)'), ['0', '0', '-1'], 'De'),
      ...ramos.map((r) => r.ligacao),
    ],
    caixa: (v) => ({ L: 2 * (((n(v, 'Z') + n(v, 'B')) * Math.SQRT1_2) + ext(v) / 2), A: n(v, 'C'), P: ext(v) }),
  };
}

/**
 * Joelho 90° com visita: perna vertical de comprimento C (bolsa embaixo, visita em cima fechada por TAMPA, sem ligação) e perna
 * horizontal para +X com bolsa de diâmetro Db2. B1/Z na bolsa vertical; B2/Z2 na horizontal (bolsa do ramal).
 */
export function joelhoVisita(ctx: Contexto = ESGOTO): Receita {
  const rot: Ponto3 = ['0', '90', '0'];
  const er = 'Db2 + 2 * e';
  return {
    usa: ['B1', 'B2', 'C', 'Z', 'Z2', 'Db', 'Db2', 'e'],
    corpos: [
      oco('bolsa', 'Bolsa vertical', 'conexao', EXT, 'Db', 'B1', z('-(Z + B1)')),
      oco('vertical', 'Perna vertical e visita', 'conexao', EXT, INT, 'C - B1 - e', z('-Z')),
      disco('tampa', 'Tampa da visita', EXT, 'e', z('C - B1 - Z - e')),
      oco('horizontal', 'Perna horizontal', 'conexao', er, 'Db2 - 2 * min(e, Db2 / 8)', 'Z2', z('0'), rot),
      oco('horizontal_bolsa', 'Bolsa horizontal', 'conexao', er, 'Db2', 'B2', ['Z2', '0', '0'], rot),
    ],
    ligacoes: [
      ligacaoKrona(ctx, 'a', 'Bolsa vertical', z('-(Z + B1)'), ['0', '0', '-1'], 'Db', 'B1'),
      ligacaoKrona(ctx, 'b', 'Bolsa horizontal', ['Z2 + B2', '0', '0'], ['1', '0', '0'], 'Db2', 'B2'),
    ],
    caixa: (v) => ({ L: n(v, 'Z2') + n(v, 'B2') + ext(v) / 2, A: n(v, 'C'), P: ext(v) }),
  };
}

/** Curva 90° de pé de coluna: UMA varredura com pernas diferentes, A1 (vertical) e A2 (+X), do cruzamento até a entrada da bolsa. */
export function curvaPeColuna(ctx: Contexto = ESGOTO): Receita {
  const curva: Corpo = {
    id: 'curva', nome: 'Curva 90° pé de coluna', papel: 'conexao',
    forma: { tipo: 'varredura', perfil: { tipo: 'anel', diametroExterno: EXT, diametroInterno: 'Db' }, caminho: { pontos: [z('-A1'), z('0'), ['A2', '0', '0']], raios: ['max(min(A1 - B1, A2 - B2), 0.55 * (' + EXT + '))'] } },
    quadro: { origem: z('0') }, material: 'mat_pvc',
  };
  return {
    usa: ['A1', 'A2', 'B1', 'B2', 'Db', 'e'],
    corpos: [curva],
    ligacoes: [
      ligacaoKrona(ctx, 'a', 'Bolsa 1', z('-A1'), ['0', '0', '-1'], 'Db', 'B1'),
      ligacaoKrona(ctx, 'b', 'Bolsa 2', ['A2', '0', '0'], ['1', '0', '0'], 'Db', 'B2'),
    ],
    caixa: (v) => ({ L: n(v, 'A2') + ext(v) / 2, A: n(v, 'A1') + ext(v) / 2, P: ext(v) }),
  };
}
