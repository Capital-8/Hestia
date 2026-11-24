import type { Familia } from '../tipos.ts';
import { dimensao } from './eletricaApoio.ts';
import {
  corpoDifusor,
  corpoLuminaria,
  familiaLuminaria,
  ligacoesLuminaria,
  parametroEspessura,
  parametroHInst,
  parametrosComuns,
  parametrosFotometria,
  retanguloPerfil,
  simboloLinear,
  simboloParede,
  tiposLuminaria,
} from './luminariasApoio.ts';
import { LUMINARIAS_TETO } from './luminariasTeto.ts';

/*
 * Luminárias de parede e linear (ficha F6). A arandela é uma caixa com o difusor na face da sala (y = 0), na mesma convenção da
 * tomada (F5): a alimentação sai do fundo (y = P) e a altura de instalação `hInst` é a base. A fita linear é uma extrusão de
 * seção `A × P` girada 90° em Y, para ficar horizontal ao longo de +X; o difusor é uma faixa na face inferior. Valores típicos,
 * CONFERIR. A arandela usa hospedagem `parede` (existe no contrato); a linear é `nivel` (teto), pela mesma lacuna das de teto.
 */

/** Arandela de parede: caixa `L × A` de profundidade `P`, difusor de espessura `E` na face da sala (y = 0). */
export const FAMILIA_ARANDELA: Familia = familiaLuminaria({
  id: 'fam_luminaria_arandela',
  nome: 'Arandela de parede',
  descricao: 'Arandela de parede: caixa de largura L e altura A com difusor na face da sala, a partir da altura de instalação hInst. Alimentação saindo do fundo, como a tomada. CONFERIR dimensões e fotometria.',
  hospedagem: 'parede',
  parametros: [...parametrosComuns(), dimensao('L', 'Largura', 120, 600), dimensao('A', 'Altura', 180, 600), dimensao('P', 'Profundidade', 100, 300), parametroHInst(1900, 2500), parametroEspessura(), ...parametrosFotometria(6, 300, 3000)],
  corpos: [
    corpoLuminaria('corpo', 'Caixa da arandela', { tipo: 'extrusao', perfil: retanguloPerfil('L', 'A'), comprimento: 'P - E' }, { origem: ['L / 2', 'E', 'hInst + A / 2'], rotacao: ['-90', '0', '0'] }),
    corpoDifusor('difusor', 'Difusor da arandela', { tipo: 'extrusao', perfil: retanguloPerfil('L - 10', 'A - 10'), comprimento: 'E' }, { origem: ['L / 2', '0', 'hInst + A / 2'], rotacao: ['-90', '0', '0'] }),
  ],
  ligacoes: ligacoesLuminaria({ posicao: ['L / 2', 'P', 'hInst + A / 2'], direcao: ['0', '1', '0'] }, { posicao: ['L / 2', 'P', 'hInst'], direcao: ['0', '1', '0'] }),
  tipos: tiposLuminaria({ L: 120, A: 180, P: 100, hInst: 1900, E: 3, potencia: 6, fluxoLuminoso: 300, temperaturaCor: 3000 }),
  simbolos: [simboloParede()],
});

/**
 * Fita linear: extrusão de seção `A × P` ao longo de X (`L`), girada 90° em Y. O corpo ocupa `A − E` acima do difusor de
 * espessura `E`, que fica na face inferior. A origem está no canto da fita (x = 0, z = hInst).
 */
export const FAMILIA_LINEAR: Familia = familiaLuminaria({
  id: 'fam_luminaria_linear',
  nome: 'Fita LED linear',
  descricao: 'Perfil linear de LED: extrusão de comprimento L com difusor na face inferior, a partir de hInst. Pontas: alimentação em x = 0 e passagem em x = L. CONFERIR dimensões e fotometria por metro.',
  hospedagem: 'nivel',
  parametros: [...parametrosComuns(), dimensao('L', 'Comprimento', 1200, 6000), dimensao('A', 'Altura', 40, 200), dimensao('P', 'Profundidade', 60, 200), parametroHInst(2500), parametroEspessura(), ...parametrosFotometria(36, 3600, 4000)],
  corpos: [
    corpoLuminaria('corpo', 'Perfil linear', { tipo: 'extrusao', perfil: retanguloPerfil('A - E', 'P'), comprimento: 'L' }, { origem: ['0', 'P / 2', 'hInst + E / 2 + A / 2'], rotacao: ['0', '90', '0'] }),
    corpoDifusor('difusor', 'Difusor linear', { tipo: 'extrusao', perfil: retanguloPerfil('E', 'P - 4'), comprimento: 'L - 10' }, { origem: ['5', 'P / 2', 'hInst + E / 2'], rotacao: ['0', '90', '0'] }),
  ],
  ligacoes: ligacoesLuminaria({ posicao: ['0', 'P / 2', 'hInst + A / 2'], direcao: ['-1', '0', '0'] }, { posicao: ['L', 'P / 2', 'hInst + A / 2'], direcao: ['1', '0', '0'] }),
  tipos: tiposLuminaria({ L: 1200, A: 40, P: 60, hInst: 2500, E: 3, potencia: 36, fluxoLuminoso: 3600, temperaturaCor: 4000 }),
  simbolos: [simboloLinear()],
});

/** Luminárias da ficha F6 (teto, parede e linear), na ordem da ficha. Registradas em `BIBLIOTECA_MEP`, não em `BIBLIOTECA_BASE`. */
export const LUMINARIAS: Familia[] = [...LUMINARIAS_TETO, FAMILIA_ARANDELA, FAMILIA_LINEAR];
