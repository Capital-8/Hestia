import type { Familia, Parametro } from '../tipos.ts';
import type { Corpo } from '../tiposCorpo.ts';
import { dimensao } from './eletricaApoio.ts';
import { comprimento } from './novosApoio.ts';
import {
  circuloPerfil,
  corpoDifusor,
  corpoLuminaria,
  familiaLuminaria,
  ligacoesLuminaria,
  parametroEspessura,
  parametroHInst,
  parametrosComuns,
  parametrosFotometria,
  retanguloPerfil,
  simboloTeto,
  tiposLuminaria,
} from './luminariasApoio.ts';

/*
 * Luminárias de teto (ficha F6): plafon redondo, painel LED quadrado e retangular de embutir, spot embutido e pendente. A base
 * de cada uma é `hInst` (altura de instalação), com o difusor (papel `visor`) na face inferior, de espessura `E`. Os corpos
 * principais são revolução (plafon), extrusão (painéis e spot) e transição de círculos (cúpula do pendente, um cone). A
 * ligação de força sai do topo e a de eletroduto, do lado. Potência, fluxo e temperatura são valores TÍPICOS: CONFERIR.
 * Hospedagem `nivel`: o contrato ainda não tem `teto`, então a altura de instalação é o `hInst` (lacuna registrada na ficha).
 */

/** Entradas de eletroduto acrescentadas nas luminárias de teto (o fundo +Y já existe): esquerda, direita e frente. */
const LADOS_TETO = ['esq', 'dir', 'frente'] as const;

/** Plafon redondo: revolução do corpo (cilindro de raio L / 2) de `hInst + E` até o topo, com difusor circular embaixo. */
export const FAMILIA_PLAFON_REDONDO: Familia = familiaLuminaria({
  id: 'fam_luminaria_plafon_redondo',
  nome: 'Plafon redondo',
  descricao: 'Plafon de sobrepor redondo: corpo de revolução (cilindro de diâmetro L) e difusor circular na face inferior, a partir da altura de instalação hInst. Ponto de força no topo e eletroduto pela lateral. CONFERIR dimensões e fotometria.',
  hospedagem: 'nivel',
  parametros: [...parametrosComuns(), dimensao('L', 'Diâmetro', 300, 1000), dimensao('A', 'Altura', 100, 500), dimensao('P', 'Profundidade (igual ao diâmetro)', 300, 1000), parametroHInst(2500), parametroEspessura(), ...parametrosFotometria(18, 1600, 4000)],
  corpos: [
    corpoLuminaria('corpo', 'Corpo do plafon', { tipo: 'revolucao', perfil: retanguloPerfil('L / 2', 'A - E'), angulo: '360' }, { origem: ['L / 2', 'P / 2', 'hInst + E / 2 + A / 2'] }),
    corpoDifusor('difusor', 'Difusor', { tipo: 'extrusao', perfil: circuloPerfil('L - 10'), comprimento: 'E' }, { origem: ['L / 2', 'P / 2', 'hInst'] }),
  ],
  ligacoes: ligacoesLuminaria({ posicao: ['L / 2', 'P / 2', 'hInst + A'], direcao: ['0', '0', '1'] }, { posicao: ['L / 2', 'P', 'hInst + A / 2'], direcao: ['0', '1', '0'] }, LADOS_TETO),
  tipos: tiposLuminaria({ L: 300, A: 100, P: 300, hInst: 2500, E: 3, potencia: 18, fluxoLuminoso: 1600, temperaturaCor: 4000 }),
  simbolos: [simboloTeto()],
});

/** Corpo e difusor de um painel de embutir: caixa `L × P` de `A − E` acima do difusor `(L − 10) × (P − 10)` de espessura `E`. */
function corposPainel(): Corpo[] {
  return [
    corpoLuminaria('corpo', 'Caixa do painel', { tipo: 'extrusao', perfil: retanguloPerfil('L', 'P'), comprimento: 'A - E' }, { origem: ['L / 2', 'P / 2', 'hInst + E'] }),
    corpoDifusor('difusor', 'Difusor do painel', { tipo: 'extrusao', perfil: retanguloPerfil('L - 10', 'P - 10'), comprimento: 'E' }, { origem: ['L / 2', 'P / 2', 'hInst'] }),
  ];
}

/** Ligações do painel de embutir: força no topo e eletroduto lateral (em y = P). */
function ligacoesPainel() {
  return ligacoesLuminaria({ posicao: ['L / 2', 'P / 2', 'hInst + A'], direcao: ['0', '0', '1'] }, { posicao: ['L / 2', 'P', 'hInst + A / 2'], direcao: ['0', '1', '0'] }, LADOS_TETO);
}

/** Parâmetros de um painel (dimensões nominais, altura de instalação e espessura do difusor, fotometria). */
function parametrosPainel(L: number, P: number, fotometria: [number, number, number]): Parametro[] {
  return [...parametrosComuns(), dimensao('L', 'Largura', L, 2000), dimensao('A', 'Altura', 90, 300), dimensao('P', 'Profundidade', P, 2000), parametroHInst(2500), parametroEspessura(), ...parametrosFotometria(...fotometria)];
}

/** Painel LED quadrado de embutir (600 × 600), com difusor no fundo. */
export const FAMILIA_PAINEL_LED_QUADRADO: Familia = familiaLuminaria({
  id: 'fam_luminaria_painel_led_quadrado',
  nome: 'Painel LED quadrado',
  descricao: 'Painel LED quadrado de embutir (600 × 600 mm): caixa com difusor na face inferior, a partir de hInst. Ponto de força no topo e eletroduto pela lateral. CONFERIR dimensões e fotometria.',
  hospedagem: 'nivel',
  parametros: parametrosPainel(600, 600, [40, 4000, 4000]),
  corpos: corposPainel(),
  ligacoes: ligacoesPainel(),
  tipos: tiposLuminaria({ L: 600, A: 90, P: 600, hInst: 2500, E: 3, potencia: 40, fluxoLuminoso: 4000, temperaturaCor: 4000 }),
  simbolos: [simboloTeto()],
});

/** Painel LED retangular de embutir (1200 × 300), com difusor no fundo. */
export const FAMILIA_PAINEL_LED_RETANGULAR: Familia = familiaLuminaria({
  id: 'fam_luminaria_painel_led_retangular',
  nome: 'Painel LED retangular',
  descricao: 'Painel LED retangular de embutir (1200 × 300 mm): caixa com difusor na face inferior, a partir de hInst. Ponto de força no topo e eletroduto pela lateral. CONFERIR dimensões e fotometria.',
  hospedagem: 'nivel',
  parametros: parametrosPainel(1200, 300, [36, 3600, 4000]),
  corpos: corposPainel(),
  ligacoes: ligacoesPainel(),
  tipos: tiposLuminaria({ L: 1200, A: 90, P: 300, hInst: 2500, E: 3, potencia: 36, fluxoLuminoso: 3600, temperaturaCor: 4000 }),
  simbolos: [simboloTeto()],
});

/** Spot embutido: cilindro de diâmetro L de `A − E` e difusor circular de `(L − 6)` no fundo. */
export const FAMILIA_SPOT_EMBUTIDO: Familia = familiaLuminaria({
  id: 'fam_luminaria_spot_embutido',
  nome: 'Spot embutido',
  descricao: 'Spot de embutir de diâmetro L: cilindro com difusor circular na face inferior, a partir de hInst. Ponto de força no topo e eletroduto pela lateral. CONFERIR dimensões e fotometria.',
  hospedagem: 'nivel',
  parametros: [...parametrosComuns(), dimensao('L', 'Diâmetro', 90, 300), dimensao('A', 'Altura', 110, 300), dimensao('P', 'Profundidade (igual ao diâmetro)', 90, 300), parametroHInst(2500), parametroEspessura(), ...parametrosFotometria(7, 600, 3000)],
  corpos: [
    corpoLuminaria('corpo', 'Corpo do spot', { tipo: 'extrusao', perfil: circuloPerfil('L'), comprimento: 'A - E' }, { origem: ['L / 2', 'P / 2', 'hInst + E'] }),
    corpoDifusor('difusor', 'Difusor do spot', { tipo: 'extrusao', perfil: circuloPerfil('L - 6'), comprimento: 'E' }, { origem: ['L / 2', 'P / 2', 'hInst'] }),
  ],
  ligacoes: ligacoesLuminaria({ posicao: ['L / 2', 'P / 2', 'hInst + A'], direcao: ['0', '0', '1'] }, { posicao: ['L / 2', 'P', 'hInst + A / 2'], direcao: ['0', '1', '0'] }, LADOS_TETO),
  tipos: tiposLuminaria({ L: 90, A: 110, P: 90, hInst: 2500, E: 3, potencia: 7, fluxoLuminoso: 600, temperaturaCor: 3000 }),
  simbolos: [simboloTeto()],
});

/**
 * Pendente: cúpula em cone (transição de círculo de diâmetro L em baixo para L / 2 em cima), com difusor circular embaixo e cabo
 * de suspensão de 3 mm subindo de `hInst + A` por `HC`. Ponto de força no topo do cabo e eletroduto ao lado.
 */
export const FAMILIA_PENDENTE: Familia = familiaLuminaria({
  id: 'fam_luminaria_pendente',
  nome: 'Pendente',
  descricao: 'Pendente de cúpula cônica (diâmetro L embaixo, L / 2 em cima) com difusor, e cabo de suspensão de 3 mm de comprimento HC. Ponto de força no topo do cabo. CONFERIR dimensões, cabo e fotometria.',
  hospedagem: 'nivel',
  parametros: [...parametrosComuns(), dimensao('L', 'Diâmetro da base', 300, 1000), dimensao('A', 'Altura da cúpula', 150, 500), dimensao('P', 'Profundidade (igual ao diâmetro)', 300, 1000), comprimento('HC', 'Comprimento do cabo', 600, 1, 3000, 1), parametroHInst(1800), parametroEspessura(), ...parametrosFotometria(12, 1100, 3000)],
  corpos: [
    corpoLuminaria('cupula', 'Cúpula', { tipo: 'transicao', perfilA: circuloPerfil('L'), perfilB: circuloPerfil('L / 2'), comprimento: 'A - E' }, { origem: ['L / 2', 'P / 2', 'hInst + E'] }),
    corpoDifusor('difusor', 'Difusor do pendente', { tipo: 'extrusao', perfil: circuloPerfil('L - 10'), comprimento: 'E' }, { origem: ['L / 2', 'P / 2', 'hInst'] }),
    corpoLuminaria('cabo', 'Cabo de suspensão', { tipo: 'extrusao', perfil: circuloPerfil('3'), comprimento: 'HC' }, { origem: ['L / 2', 'P / 2', 'hInst + A'] }),
  ],
  ligacoes: ligacoesLuminaria({ posicao: ['L / 2', 'P / 2', 'hInst + A + HC'], direcao: ['0', '0', '1'] }, { posicao: ['L / 2 + De / 2', 'P / 2', 'hInst + A + HC'], direcao: ['0', '0', '1'] }),
  tipos: tiposLuminaria({ L: 300, A: 150, P: 300, HC: 600, hInst: 1800, E: 3, potencia: 12, fluxoLuminoso: 1100, temperaturaCor: 3000 }),
  simbolos: [simboloTeto()],
});

/** Luminárias de teto da ficha F6, na ordem de apresentação. */
export const LUMINARIAS_TETO: Familia[] = [FAMILIA_PLAFON_REDONDO, FAMILIA_PAINEL_LED_QUADRADO, FAMILIA_PAINEL_LED_RETANGULAR, FAMILIA_SPOT_EMBUTIDO, FAMILIA_PENDENTE];
