import type { Familia, Tipo } from '../tipos.ts';
import type { Corpo } from '../tiposCorpo.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import type { Simbolo2D } from '../tiposRepresentacao.ts';
import { corpoEletrico, deEletrico, dimensao, familiaEletrica, ligacaoEletrica, parametroDnEletrico, parametroPotencia, parametroTensao, tiposDn } from './eletricaApoio.ts';
import { diametroEntradaKrona, entradasDeEletroduto } from './eletricaEntradas.ts';
import { comprimento } from './novosApoio.ts';

/*
 * Tomada 2P+T e interruptor simples (ficha F5). O corpo é um bloco retangular na face y = 0, de altura de instalação `hInst` (piso
 * → fundo) até `hInst + A`, com profundidade P para dentro da parede. O ponto de força e o eletroduto de alimentação saem do
 * fundo (y = P). O símbolo 2D de planta substitui a projeção automática (`substituiGeometria`). CONFERIR: símbolo e potência.
 */

const HINST_TOMADA = comprimento('hInst', 'Altura de instalação (piso → fundo)', 300, 0, 2000, 10);
const HINST_INTERRUPTOR = comprimento('hInst', 'Altura de instalação (piso → fundo)', 1300, 0, 2000, 10);

/** Corpo do dispositivo: bloco L × A de profundidade P, face em y = 0 e base em `hInst`. Rx(−90°) leva a extrusão para +Y. */
function corpoDispositivo(nome: string): Corpo {
  return corpoEletrico('corpo', nome, 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'A' }, comprimento: 'P' }, { origem: ['L / 2', '0', 'hInst + A / 2'], rotacao: ['-90', '0', '0'] });
}

/**
 * Ligações do dispositivo: ponto de força (a meia altura) e eletroduto do fundo (na base), ambos saindo para +Y, mais as entradas
 * laterais, de topo e de base (ficha C8a). O diâmetro das entradas de eletroduto é o do eletroduto Krona do DN (catálogo).
 */
function ligacoesDispositivo(): Ligacao[] {
  return [
    ligacaoEletrica('forca', 'Ponto de força', 'eletrica_forca', ['L / 2', 'P', 'hInst + A / 2'], ['0', '1', '0'], { propriedades: { potencia: 'potencia', tensao: 'tensao' } }),
    ligacaoEletrica('eletroduto', 'Eletroduto de alimentação', 'eletroduto', ['L / 2', 'P', 'hInst'], ['0', '1', '0'], { diametro: diametroEntradaKrona() }),
    ...entradasDeEletroduto(['esq', 'dir', 'topo', 'base'], 'hInst + A / 2', 'hInst', 'hInst + A'),
  ];
}

/** Planta da tomada: contorno L × P com dois polos (2P) e o terra (T) como círculo central menor. */
const SIMBOLO_TOMADA: Simbolo2D = {
  id: 'planta',
  nome: 'Planta da tomada 2P+T',
  vistas: ['planta'],
  plano: 'xy',
  substituiGeometria: true,
  primitivos: [
    { tipo: 'polilinha', pontos: [['0', '0'], ['L', '0'], ['L', 'P'], ['0', 'P']], fechada: true },
    { tipo: 'circulo', centro: ['L / 3', 'P / 2'], raio: 'P / 8' },
    { tipo: 'circulo', centro: ['2 * L / 3', 'P / 2'], raio: 'P / 8' },
    { tipo: 'circulo', centro: ['L / 2', 'P / 4'], raio: 'P / 12' },
  ],
};

/** Planta do interruptor: contorno L × P com a letra S no centro (CONFERIR: convenção do desenho). */
const SIMBOLO_INTERRUPTOR: Simbolo2D = {
  id: 'planta',
  nome: 'Planta do interruptor',
  vistas: ['planta'],
  plano: 'xy',
  substituiGeometria: true,
  primitivos: [
    { tipo: 'polilinha', pontos: [['0', '0'], ['L', '0'], ['L', 'P'], ['0', 'P']], fechada: true },
    { tipo: 'texto', posicao: ['L / 2', 'P / 2'], texto: '"S"', altura: 'P * 0.6' },
  ],
};

export const FAMILIA_TOMADA_2P_T: Familia = familiaEletrica({
  id: 'fam_tomada_2p_t',
  nome: 'Tomada 2P+T',
  categoria: 'dispositivo_eletrico',
  descricao: 'Tomada de parede 2P+T: bloco na face da parede a partir da altura de instalação hInst (0,30 m padrão). Símbolo de planta com os dois polos e o terra. Ponto de força e eletroduto saem do fundo. Potência e tensão vão às propriedades do ponto. CONFERIR dimensões e potência.',
  hospedagem: 'parede',
  parametros: [parametroDnEletrico([20, 25], 20), deEletrico(), dimensao('L', 'Largura', 80), dimensao('A', 'Altura', 80), dimensao('P', 'Profundidade', 50), HINST_TOMADA, parametroPotencia(1000), parametroTensao()],
  corpos: [corpoDispositivo('Tomada')],
  ligacoes: ligacoesDispositivo(),
  ifc: { classe: 'IFCOUTLET' },
  tipos: tiposDn([20, 25], () => ({ L: 80, A: 80, P: 50, hInst: 300 })),
  tipoPadrao: 'dn20',
  simbolos: [SIMBOLO_TOMADA],
});

const TIPOS_INTERRUPTOR: Tipo[] = [
  { id: 'simples', nome: 'Interruptor 1 tecla 80 × 50 × 80 (1,30 m)', valores: { DN: 20, L: 80, A: 80, P: 50, hInst: 1300 } },
  { id: 'duplo', nome: 'Interruptor 2 teclas 100 × 50 × 80 (1,30 m)', valores: { DN: 20, L: 100, A: 80, P: 50, hInst: 1300 } },
];

export const FAMILIA_INTERRUPTOR_SIMPLES: Familia = familiaEletrica({
  id: 'fam_interruptor_simples',
  nome: 'Interruptor simples',
  categoria: 'dispositivo_eletrico',
  descricao: 'Interruptor de parede (1 tecla, ou 2 teclas no tipo duplo) em bloco na face da parede, com a altura de instalação hInst (1,30 m padrão). Símbolo de planta com S. Ponto de força e eletroduto saem do fundo. CONFERIR dimensões e potência.',
  hospedagem: 'parede',
  parametros: [parametroDnEletrico([20, 25], 20), deEletrico(), dimensao('L', 'Largura', 80), dimensao('A', 'Altura', 80), dimensao('P', 'Profundidade', 50), HINST_INTERRUPTOR, parametroPotencia(0), parametroTensao()],
  corpos: [corpoDispositivo('Interruptor')],
  ligacoes: ligacoesDispositivo(),
  ifc: { classe: 'IFCSWITCHINGDEVICE' },
  tipos: TIPOS_INTERRUPTOR,
  tipoPadrao: 'simples',
  simbolos: [SIMBOLO_INTERRUPTOR],
});

/** Tomada e interruptor do ramo elétrico (ficha F5). */
export const DISPOSITIVOS_ELETRICOS: Familia[] = [FAMILIA_TOMADA_2P_T, FAMILIA_INTERRUPTOR_SIMPLES];
