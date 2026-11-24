import type { Corpo, Ponto3 } from '../tiposCorpo.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import { disco, externo, ligacaoKrona, oco, type Caixa } from './kronaEsgotoApoio.ts';

/*
 * Receitas de geometria das conexões da Krona (ficha P4): cada uma devolve corpos, ligações e a caixa nominal a partir dos ids de
 * parâmetro (B, Z, C, Db, De, e, B2, Z2, Db2...). Ver kronaEsgotoApoio.ts para o significado das cotas (CONFERIR). Eixos: o corpo
 * principal cresce em +Z; o cruzamento dos eixos é a origem; ligações apontam para fora; ponta lisa = sem profundidade de bolsa.
 */

export interface Receita {
  corpos: Corpo[];
  ligacoes: Ligacao[];
  caixa: Caixa;
  /** Colunas (ids de parâmetro) que a receita lê. */
  usa: string[];
}

const EXT = 'Db + 2 * e';
const INT = 'Db - 2 * e';
const S45 = 'sin(45)';
const C45 = 'cos(45)';
const z = (s: string): Ponto3 => ['0', '0', s];
const n = (v: Record<string, number>, k: string): number => v[k] ?? 0;

export function tubo(): Receita {
  return {
    usa: ['B', 'Db', 'De', 'e'],
    corpos: [oco('bolsa', 'Bolsa', 'tubo', EXT, 'Db', 'B', z('0')), oco('tubo', 'Tubo', 'tubo', 'De', 'De - 2 * e', 'L - B', z('B'))],
    ligacoes: [ligacaoKrona('a', 'Bolsa (A)', z('0'), ['0', '0', '-1'], 'Db', 'B'), ligacaoKrona('b', 'Ponta (B)', z('L'), ['0', '0', '1'], 'De')],
    caixa: (v) => ({ L: 1000, A: externo(v), P: externo(v) }),
  };
}

/** Joelho com duas bolsas: braço A sai para −Z e braço B desvia `ang` graus (90 = +X). */
export function joelho(ang: 90 | 45): Receita {
  const dir: [string, string, string] = ang === 90 ? ['1', '0', '0'] : [S45, '0', C45];
  const mult = (k: string): Ponto3 => (ang === 90 ? [k, '0', '0'] : [`(${k}) * ${S45}`, '0', `(${k}) * ${C45}`]);
  const rot: Ponto3 = ['0', String(ang), '0'];
  return {
    usa: ['B', 'Z', 'Db', 'e'],
    corpos: [
      oco('a_corpo', 'Braço A (corpo)', 'conexao', EXT, INT, 'Z', z('-Z')),
      oco('a_bolsa', 'Braço A (bolsa)', 'conexao', EXT, 'Db', 'B', z('-(Z + B)')),
      oco('b_corpo', 'Braço B (corpo)', 'conexao', EXT, INT, 'Z', z('0'), rot),
      oco('b_bolsa', 'Braço B (bolsa)', 'conexao', EXT, 'Db', 'B', mult('Z'), rot),
    ],
    ligacoes: [ligacaoKrona('a', 'Bolsa A', z('-(Z + B)'), ['0', '0', '-1'], 'Db', 'B'), ligacaoKrona('b', 'Bolsa B', mult('Z + B'), dir, 'Db', 'B')],
    caixa: (v) => {
      const r = n(v, 'Z') + n(v, 'B');
      return { L: (ang === 90 ? r : r * Math.SQRT1_2) + externo(v) / 2, A: ang === 90 ? r + externo(v) / 2 : r * 2, P: externo(v) };
    },
  };
}

/**
 * Curva: UMA varredura do anel (externo EXT, furo da bolsa) por A(ponta) → cruzamento → E(bolsa). O arco tem tangente Z em cada
 * braço (raio = Z no 90°; Z / tan(22,5°) no 45°); a ponta lisa fica a C do cruzamento e a bolsa a Z + B (CONFERIR).
 */
export function curva(ang: 90 | 45): Receita {
  const fim: Ponto3 = ang === 90 ? ['Z + B', '0', '0'] : [`(Z + B) * ${S45}`, '0', `(Z + B) * ${C45}`];
  const raio = ang === 90 ? 'Z' : 'Z / tan(22.5)';
  return {
    usa: ['B', 'Z', 'C', 'Db', 'De', 'e'],
    corpos: [{ id: 'curva', nome: `Curva ${ang}°`, papel: 'conexao', forma: { tipo: 'varredura', perfil: { tipo: 'anel', diametroExterno: EXT, diametroInterno: 'Db' }, caminho: { pontos: [z('-C'), z('0'), fim], raios: [raio] } }, quadro: { origem: z('0') }, material: 'mat_pvc' }],
    ligacoes: [ligacaoKrona('a', 'Ponta', z('-C'), ['0', '0', '-1'], 'De'), ligacaoKrona('b', 'Bolsa', fim, ang === 90 ? ['1', '0', '0'] : [S45, '0', C45], 'Db', 'B')],
    caixa: (v) => ({ L: ang === 90 ? n(v, 'Z') + n(v, 'B') + externo(v) / 2 : (n(v, 'Z') + n(v, 'B')) * Math.SQRT1_2 + externo(v) / 2, A: n(v, 'C') + externo(v) / 2, P: externo(v) }),
  };
}

/** Luva de duas bolsas (B2 pode ser igual a B) com batente central. */
export function luva(): Receita {
  return {
    usa: ['B', 'B2', 'C', 'Db', 'e'],
    corpos: [
      oco('bolsa1', 'Bolsa 1', 'conexao', EXT, 'Db', 'B', z('0')),
      oco('batente', 'Batente central', 'conexao', EXT, INT, 'C - B - B2', z('B')),
      oco('bolsa2', 'Bolsa 2', 'conexao', EXT, 'Db', 'B2', z('C - B2')),
    ],
    ligacoes: [ligacaoKrona('a', 'Bolsa 1', z('0'), ['0', '0', '-1'], 'Db', 'B'), ligacaoKrona('b', 'Bolsa 2', z('C'), ['0', '0', '1'], 'Db', 'B2')],
    caixa: (v) => ({ L: n(v, 'C'), A: externo(v), P: externo(v) }),
  };
}

/** Luva de correr (só C e D no catálogo): manga lisa; cada ponta recebe um tubo até a metade (CONFERIR). */
export function luvaDeCorrer(): Receita {
  return {
    usa: ['C', 'Db', 'e'],
    corpos: [oco('manga', 'Manga', 'conexao', EXT, 'Db', 'C', z('0'))],
    ligacoes: [ligacaoKrona('a', 'Ponta A', z('0'), ['0', '0', '-1'], 'Db', 'C / 2'), ligacaoKrona('b', 'Ponta B', z('C'), ['0', '0', '1'], 'Db', 'C / 2')],
    caixa: (v) => ({ L: n(v, 'C'), A: externo(v), P: externo(v) }),
  };
}

/**
 * Tê (90°) ou junção (45°): corrida ao longo de Z (bolsa em cima, ponta lisa embaixo, C no total) e ramal com bolsa a `ang` graus.
 * Z = eixo do ramal até a bolsa da corrida; Z2 = cruzamento até a bolsa do ramal. Redução: ramal de diâmetro Db2 e bolsa B2.
 */
export function te(ang: 90 | 45, reducao: boolean): Receita {
  const rot: Ponto3 = ['0', String(ang), '0'];
  const dir: [string, string, string] = ang === 90 ? ['1', '0', '0'] : [S45, '0', C45];
  const ao = (k: string): Ponto3 => (ang === 90 ? [k, '0', '0'] : [`(${k}) * ${S45}`, '0', `(${k}) * ${C45}`]);
  const dr = reducao ? 'Db2' : 'Db';
  const br = reducao ? 'B2' : 'B';
  const er = `${dr} + 2 * e`;
  return {
    usa: ['B', 'C', 'Z', 'Z2', 'Db', 'De', 'e', ...(reducao ? ['B2', 'Db2'] : [])],
    corpos: [
      oco('corrida', 'Corrida', 'conexao', EXT, INT, 'C - B', z('-(C - B - Z)')),
      oco('bolsa', 'Bolsa da corrida', 'conexao', EXT, 'Db', 'B', z('Z')),
      oco('ramal', 'Ramal (corpo)', 'conexao', er, `${dr} - 2 * e`, 'Z2', z('0'), rot),
      oco('ramal_bolsa', 'Ramal (bolsa)', 'conexao', er, dr, br, ao('Z2'), rot),
    ],
    ligacoes: [
      ligacaoKrona('a', 'Bolsa da corrida', z('Z + B'), ['0', '0', '1'], 'Db', 'B'),
      ligacaoKrona('b', 'Ponta da corrida', z('-(C - B - Z)'), ['0', '0', '-1'], 'De'),
      ligacaoKrona('c', 'Bolsa do ramal', ao(`Z2 + ${br}`), dir, dr, br),
    ],
    caixa: (v) => {
      const r = n(v, 'Z2') + n(v, reducao ? 'B2' : 'B');
      return { L: (ang === 90 ? r : r * Math.SQRT1_2) + externo(v) / 2, A: n(v, 'C'), P: externo(v) };
    },
  };
}

export function cap(): Receita {
  return {
    usa: ['B', 'C', 'Db', 'e'],
    corpos: [oco('bolsa', 'Bolsa', 'conexao', EXT, 'Db', 'B', z('0')), disco('fundo', 'Fundo', EXT, 'C - B', z('B'))],
    ligacoes: [ligacaoKrona('a', 'Bolsa', z('0'), ['0', '0', '-1'], 'Db', 'B')],
    caixa: (v) => ({ L: n(v, 'C'), A: externo(v), P: externo(v) }),
  };
}

/**
 * Redução excêntrica: ponta lisa grande (De) embaixo, bolsa pequena (Db, B) em cima, C no total; C2 = comprimento da parte grande;
 * o eixo da parte pequena fica deslocado (De − Db) / 2 para alinhar um dos lados (CONFERIR).
 */
export function reducaoExcentrica(): Receita {
  const dx = '(De - Db) / 2';
  const o = (zz: string): Ponto3 => [dx, '0', zz];
  return {
    usa: ['B', 'C', 'C2', 'Db', 'De', 'e'],
    corpos: [
      oco('grande', 'Parte grande', 'conexao', 'De', 'De - 2 * e', 'C2', z('0')),
      oco('transicao', 'Parte pequena', 'conexao', EXT, INT, 'C - C2 - B', o('C2')),
      oco('bolsa', 'Bolsa pequena', 'conexao', EXT, 'Db', 'B', o('C - B')),
    ],
    ligacoes: [ligacaoKrona('a', 'Ponta grande', z('0'), ['0', '0', '-1'], 'De'), ligacaoKrona('b', 'Bolsa pequena', o('C'), ['0', '0', '1'], 'Db', 'B')],
    caixa: (v) => ({ L: n(v, 'De'), A: n(v, 'C'), P: n(v, 'De') }),
  };
}

/** Bucha de redução: bolsa pequena (Db, B) em cima e ponta grande (De) embaixo, Z = comprimento da parte grande (CONFERIR). */
export function bucha(): Receita {
  return {
    usa: ['B', 'Z', 'Db', 'De', 'e'],
    corpos: [oco('grande', 'Parte grande', 'conexao', 'De', 'De - 2 * e', 'Z', z('0')), oco('bolsa', 'Bolsa pequena', 'conexao', EXT, 'Db', 'B', z('Z'))],
    ligacoes: [ligacaoKrona('a', 'Ponta grande', z('0'), ['0', '0', '-1'], 'De'), ligacaoKrona('b', 'Bolsa pequena', z('Z + B'), ['0', '0', '1'], 'Db', 'B')],
    caixa: (v) => ({ L: n(v, 'De'), A: n(v, 'Z') + n(v, 'B'), P: n(v, 'De') }),
  };
}
