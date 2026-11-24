import type { Corpo, Ponto3 } from '../tiposCorpo.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import { disco, ESGOTO, externo, ligacaoKrona, oco, type Caixa, type Contexto } from './kronaEsgotoApoio.ts';

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
/** Furo do corpo: a parede nunca passa de 1/8 do furo (a cota A de uniões e tês tem aba externa e daria parede absurda). */
const INT = 'Db - 2 * min(e, Db / 8)';
const S45 = 'sin(45)';
const C45 = 'cos(45)';
/**
 * Raio do arco da varredura: a tangente é Z (raio = Z no 90°; Z / tan(22,5°) no 45°), mas nunca menor que 0,55 do diâmetro externo,
 * senão o anel se cruza na curva interna (joelhos curtos de bitola grande).
 */
const raioDoArco = (ang: 90 | 45): string => `max(${ang === 90 ? 'Z' : 'Z / tan(22.5)'}, 0.55 * (${EXT}))`;
const z = (s: string): Ponto3 => ['0', '0', s];
const n = (v: Record<string, number>, k: string): number => v[k] ?? 0;

export function tubo(ctx: Contexto = ESGOTO): Receita {
  return {
    usa: ['B', 'Db', 'De', 'e'],
    corpos: [oco('bolsa', 'Bolsa', 'tubo', EXT, 'Db', 'B', z('0')), oco('tubo', 'Tubo', 'tubo', 'De', 'De - 2 * e', 'L - B', z('B'))],
    ligacoes: [ligacaoKrona(ctx, 'a', 'Bolsa (A)', z('0'), ['0', '0', '-1'], 'Db', 'B'), ligacaoKrona(ctx, 'b', 'Ponta (B)', z('L'), ['0', '0', '1'], 'De')],
    caixa: (v) => ({ L: 1000, A: externo(v), P: externo(v) }),
  };
}

/**
 * Joelho com duas bolsas: braço A sai para −Z e braço B desvia `ang` graus (90 = +X). É UMA varredura contínua (fechada, sem a
 * fresta que dois cilindros retos deixavam no canto): ver `curvaBolsas`.
 */
export function joelho(ang: 90 | 45, ctx: Contexto = ESGOTO): Receita {
  return curvaBolsas(ang, ctx);
}

/**
 * Curva: UMA varredura do anel (externo EXT, furo da bolsa) por A(ponta) → cruzamento → E(bolsa). O arco tem tangente Z em cada
 * braço (raio = Z no 90°; Z / tan(22,5°) no 45°); a ponta lisa fica a C do cruzamento e a bolsa a Z + B (CONFERIR).
 */
export function curva(ang: 90 | 45, ctx: Contexto = ESGOTO): Receita {
  const fim: Ponto3 = ang === 90 ? ['Z + B', '0', '0'] : [`(Z + B) * ${S45}`, '0', `(Z + B) * ${C45}`];
  const raio = raioDoArco(ang);
  return {
    usa: ['B', 'Z', 'C', 'Db', 'De', 'e'],
    corpos: [{ id: 'curva', nome: `Curva ${ang}°`, papel: 'conexao', forma: { tipo: 'varredura', perfil: { tipo: 'anel', diametroExterno: EXT, diametroInterno: 'Db' }, caminho: { pontos: [z('-C'), z('0'), fim], raios: [raio] } }, quadro: { origem: z('0') }, material: 'mat_pvc' }],
    ligacoes: [ligacaoKrona(ctx, 'a', 'Ponta', z('-C'), ['0', '0', '-1'], 'De'), ligacaoKrona(ctx, 'b', 'Bolsa', fim, ang === 90 ? ['1', '0', '0'] : [S45, '0', C45], 'Db', 'B')],
    caixa: (v) => ({ L: ang === 90 ? n(v, 'Z') + n(v, 'B') + externo(v) / 2 : (n(v, 'Z') + n(v, 'B')) * Math.SQRT1_2 + externo(v) / 2, A: n(v, 'C') + externo(v) / 2, P: externo(v) }),
  };
}

/** Luva de duas bolsas (B2 pode ser igual a B) com batente central. */
export function luva(ctx: Contexto = ESGOTO): Receita {
  return {
    usa: ['B', 'B2', 'C', 'Db', 'e'],
    corpos: [
      oco('bolsa1', 'Bolsa 1', 'conexao', EXT, 'Db', 'B', z('0')),
      oco('batente', 'Batente central', 'conexao', EXT, INT, 'C - B - B2', z('B')),
      oco('bolsa2', 'Bolsa 2', 'conexao', EXT, 'Db', 'B2', z('C - B2')),
    ],
    ligacoes: [ligacaoKrona(ctx, 'a', 'Bolsa 1', z('0'), ['0', '0', '-1'], 'Db', 'B'), ligacaoKrona(ctx, 'b', 'Bolsa 2', z('C'), ['0', '0', '1'], 'Db', 'B2')],
    caixa: (v) => ({ L: n(v, 'C'), A: externo(v), P: externo(v) }),
  };
}

/** Luva de correr (só C e D no catálogo): manga lisa; cada ponta recebe um tubo até a metade (CONFERIR). */
export function luvaDeCorrer(ctx: Contexto = ESGOTO): Receita {
  return {
    usa: ['C', 'Db', 'e'],
    corpos: [oco('manga', 'Manga', 'conexao', EXT, 'Db', 'C', z('0'))],
    ligacoes: [ligacaoKrona(ctx, 'a', 'Ponta A', z('0'), ['0', '0', '-1'], 'Db', 'C / 2'), ligacaoKrona(ctx, 'b', 'Ponta B', z('C'), ['0', '0', '1'], 'Db', 'C / 2')],
    caixa: (v) => ({ L: n(v, 'C'), A: externo(v), P: externo(v) }),
  };
}

/**
 * Tê (90°) ou junção (45°): corrida ao longo de Z (bolsa em cima, ponta lisa embaixo, C no total) e ramal com bolsa a `ang` graus.
 * Z = eixo do ramal até a bolsa da corrida; Z2 = cruzamento até a bolsa do ramal. Redução: ramal de diâmetro Db2 e bolsa B2.
 */
export function te(ang: 90 | 45, reducao: boolean, ctx: Contexto = ESGOTO): Receita {
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
      oco('ramal', 'Ramal (corpo)', 'conexao', er, `${dr} - 2 * min(e, ${dr} / 8)`, 'Z2', z('0'), rot),
      oco('ramal_bolsa', 'Ramal (bolsa)', 'conexao', er, dr, br, ao('Z2'), rot),
    ],
    ligacoes: [
      ligacaoKrona(ctx, 'a', 'Bolsa da corrida', z('Z + B'), ['0', '0', '1'], 'Db', 'B'),
      ligacaoKrona(ctx, 'b', 'Ponta da corrida', z('-(C - B - Z)'), ['0', '0', '-1'], 'De'),
      ligacaoKrona(ctx, 'c', 'Bolsa do ramal', ao(`Z2 + ${br}`), dir, dr, br),
    ],
    caixa: (v) => {
      const r = n(v, 'Z2') + n(v, reducao ? 'B2' : 'B');
      return { L: (ang === 90 ? r : r * Math.SQRT1_2) + externo(v) / 2, A: n(v, 'C'), P: externo(v) };
    },
  };
}

export function cap(ctx: Contexto = ESGOTO): Receita {
  return {
    usa: ['B', 'C', 'Db', 'e'],
    corpos: [oco('bolsa', 'Bolsa', 'conexao', EXT, 'Db', 'B', z('0')), disco('fundo', 'Fundo', EXT, 'C - B', z('B'))],
    ligacoes: [ligacaoKrona(ctx, 'a', 'Bolsa', z('0'), ['0', '0', '-1'], 'Db', 'B')],
    caixa: (v) => ({ L: n(v, 'C'), A: externo(v), P: externo(v) }),
  };
}

/**
 * Redução excêntrica: ponta lisa grande (De) embaixo, bolsa pequena (Db, B) em cima, C no total; C2 = comprimento da parte grande;
 * o eixo da parte pequena fica deslocado (De − Db) / 2 para alinhar um dos lados (CONFERIR).
 */
export function reducaoExcentrica(ctx: Contexto = ESGOTO): Receita {
  const dx = '(De - Db) / 2';
  const o = (zz: string): Ponto3 => [dx, '0', zz];
  return {
    usa: ['B', 'C', 'C2', 'Db', 'De', 'e'],
    corpos: [
      oco('grande', 'Parte grande', 'conexao', 'De', 'De - 2 * e', 'C2', z('0')),
      oco('transicao', 'Parte pequena', 'conexao', EXT, INT, 'C - C2 - B', o('C2')),
      oco('bolsa', 'Bolsa pequena', 'conexao', EXT, 'Db', 'B', o('C - B')),
    ],
    ligacoes: [ligacaoKrona(ctx, 'a', 'Ponta grande', z('0'), ['0', '0', '-1'], 'De'), ligacaoKrona(ctx, 'b', 'Bolsa pequena', o('C'), ['0', '0', '1'], 'Db', 'B')],
    caixa: (v) => ({ L: n(v, 'De'), A: n(v, 'C'), P: n(v, 'De') }),
  };
}

/** Bucha de redução: bolsa pequena (Db, B) em cima e ponta grande (De) embaixo, Z = comprimento da parte grande (CONFERIR). */
export function bucha(ctx: Contexto = ESGOTO): Receita {
  return {
    usa: ['B', 'Z', 'Db', 'De', 'e'],
    corpos: [oco('grande', 'Parte grande', 'conexao', 'De', 'De - 2 * e', 'Z', z('0')), oco('bolsa', 'Bolsa pequena', 'conexao', EXT, 'Db', 'B', z('Z'))],
    ligacoes: [ligacaoKrona(ctx, 'a', 'Ponta grande', z('0'), ['0', '0', '-1'], 'De'), ligacaoKrona(ctx, 'b', 'Bolsa pequena', z('Z + B'), ['0', '0', '1'], 'Db', 'B')],
    caixa: (v) => ({ L: n(v, 'De'), A: n(v, 'Z') + n(v, 'B'), P: n(v, 'De') }),
  };
}

/**
 * Curva com bolsa nas DUAS pontas (soldável): uma varredura do anel por (bolsa A) → cruzamento → (bolsa B), pernas de Z + B;
 * o arco tem tangente Z em cada braço (raio = Z no 90°; Z / tan(22,5°) no 45°). CONFERIR.
 */
export function curvaBolsas(ang: 90 | 45, ctx: Contexto = ESGOTO): Receita {
  const fim: Ponto3 = ang === 90 ? ['Z + B', '0', '0'] : [`(Z + B) * ${S45}`, '0', `(Z + B) * ${C45}`];
  const raio = raioDoArco(ang);
  return {
    usa: ['B', 'Z', 'Db', 'e'],
    corpos: [{ id: 'curva', nome: `Curva ${ang}°`, papel: 'conexao', forma: { tipo: 'varredura', perfil: { tipo: 'anel', diametroExterno: EXT, diametroInterno: 'Db' }, caminho: { pontos: [z('-(Z + B)'), z('0'), fim], raios: [raio] } }, quadro: { origem: z('0') }, material: 'mat_pvc' }],
    ligacoes: [ligacaoKrona(ctx, 'a', 'Bolsa A', z('-(Z + B)'), ['0', '0', '-1'], 'Db', 'B'), ligacaoKrona(ctx, 'b', 'Bolsa B', fim, ang === 90 ? ['1', '0', '0'] : [S45, '0', C45], 'Db', 'B')],
    caixa: (v) => ({ L: ang === 90 ? n(v, 'Z') + n(v, 'B') + externo(v) / 2 : (n(v, 'Z') + n(v, 'B')) * Math.SQRT1_2 + externo(v) / 2, A: n(v, 'Z') + n(v, 'B') + externo(v) / 2, P: externo(v) }),
  };
}

/**
 * Tê com bolsa nas TRÊS pontas (soldável): corrida ao longo de Z com C2 no total (centrada no cruzamento) e ramal para +X com C1
 * a partir do eixo. Redução: ramal de diâmetro Db2 e bolsa B2 (CONFERIR).
 */
export function teBolsas(reducao: boolean, ctx: Contexto = ESGOTO): Receita {
  const dr = reducao ? 'Db2' : 'Db';
  const br = reducao ? 'B2' : 'B';
  const er = `${dr} + 2 * e`;
  const rot: Ponto3 = ['0', '90', '0'];
  return {
    usa: ['B', 'C1', 'C2', 'Db', 'e', ...(reducao ? ['B2', 'Db2'] : [])],
    corpos: [
      oco('corrida', 'Corrida', 'conexao', EXT, INT, 'C2 - 2 * B', z('-(C2 / 2 - B)')),
      oco('bolsa_a', 'Bolsa de baixo', 'conexao', EXT, 'Db', 'B', z('-(C2 / 2)')),
      oco('bolsa_b', 'Bolsa de cima', 'conexao', EXT, 'Db', 'B', z('C2 / 2 - B')),
      oco('ramal', 'Ramal (corpo)', 'conexao', er, `${dr} - 2 * min(e, ${dr} / 8)`, `C1 - ${br}`, z('0'), rot),
      oco('ramal_bolsa', 'Ramal (bolsa)', 'conexao', er, dr, br, [`C1 - ${br}`, '0', '0'], rot),
    ],
    ligacoes: [
      ligacaoKrona(ctx, 'a', 'Bolsa de baixo', z('-(C2 / 2)'), ['0', '0', '-1'], 'Db', 'B'),
      ligacaoKrona(ctx, 'b', 'Bolsa de cima', z('C2 / 2'), ['0', '0', '1'], 'Db', 'B'),
      ligacaoKrona(ctx, 'c', 'Bolsa do ramal', ['C1', '0', '0'], ['1', '0', '0'], dr, br),
    ],
    caixa: (v) => ({ L: n(v, 'C1') + externo(v) / 2, A: n(v, 'C2'), P: externo(v) }),
  };
}

/** Luva de redução (soldável): bolsa grande (Db, B) e bolsa pequena (Db2, B2) separadas por batente; C no total. */
export function luvaReducao(ctx: Contexto = ESGOTO): Receita {
  return {
    usa: ['B', 'B2', 'C', 'Db', 'Db2', 'e'],
    corpos: [
      oco('bolsa1', 'Bolsa grande', 'conexao', EXT, 'Db', 'B', z('0')),
      oco('batente', 'Batente', 'conexao', EXT, 'Db2', 'C - B - B2', z('B')),
      oco('bolsa2', 'Bolsa pequena', 'conexao', 'Db2 + 2 * e', 'Db2', 'B2', z('C - B2')),
    ],
    ligacoes: [ligacaoKrona(ctx, 'a', 'Bolsa grande', z('0'), ['0', '0', '-1'], 'Db', 'B'), ligacaoKrona(ctx, 'b', 'Bolsa pequena', z('C'), ['0', '0', '1'], 'Db2', 'B2')],
    caixa: (v) => ({ L: n(v, 'C'), A: externo(v), P: externo(v) }),
  };
}
