import type { Familia } from '../tipos.ts';
import { derivado } from './novosApoio.ts';
import { anelAgua, corpoAgua, dimensao, encaixeDe, familiaAgua, ligacaoAgua, mm, parametroDe, parametroDn, parametroEncaixe, parametroEspessura, tiposPorDn } from './tuboAguaFriaApoio.ts';

/*
 * Joelhos de água fria (ficha F2). O joelho é uma varredura do anel sobre a polilinha A → P → E, com raio de eixo `Rc` = De no
 * vértice P (curva curta de PVC, CONFERIR). Cada ponta tem trecho reto de encaixe `Lf` (aprendizado da F1: sem ele a varredura
 * começa e termina no próprio arco e o quadro pode degenerar).
 * Joelho 90°: A = (0, 0, 0), P = (0, 0, Lf + Rc), B = (Lf + Rc, 0, Lf + Rc); o arco tem centro (Rc, 0, Lf).
 * Joelho 45°: tangente de corte Tg = Rc · tan(22,5°); B = P + (Lf + Tg) · (sen 45°, 0, cos 45°).
 * L, A e P são a caixa nominal do tipo (valor por DN), calculada com as mesmas tabelas das fórmulas.
 */

const RAIO_EIXO = derivado('Rc', 'Raio de curva (eixo)', 'De');
const TANGENTE_45 = derivado('Tg', 'Tangente da curva de 45°', 'Rc * tan(22.5)');

export const FAMILIA_AGUA_FRIA_JOELHO90: Familia = familiaAgua({
  id: 'fam_agua_fria_joelho90',
  nome: 'Joelho 90° de água fria',
  categoria: 'conexao_tubo',
  descricao: 'Joelho de 90° de PVC soldável para água fria, varrido pelo anel De × (De − 2e) sobre um arco de raio Rc = De, com trecho reto Lf em cada ponta. Ponta A na origem (sai para −Z) e ponta B em (Lf + Rc, 0, Lf + Rc) (sai para +X).',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 25),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroEncaixe('DN'),
    RAIO_EIXO,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [
    corpoAgua(
      'joelho',
      'Joelho 90°',
      'conexao',
      {
        tipo: 'varredura',
        perfil: anelAgua(),
        caminho: { pontos: [['0', '0', '0'], ['0', '0', 'Lf + Rc'], ['Lf + Rc', '0', 'Lf + Rc']], raios: ['Rc'] },
      },
      { origem: ['0', '0', '0'] },
    ),
  ],
  ligacoes: [
    ligacaoAgua('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De'),
    ligacaoAgua('b', 'Ponta B', ['Lf + Rc', '0', 'Lf + Rc'], ['1', '0', '0'], 'De'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' },
  tipos: tiposPorDn((dn) => ({ L: mm(1.5 * dn + encaixeDe(dn)), A: mm(1.5 * dn + encaixeDe(dn)), P: dn })),
  tipoPadrao: 'dn25',
});

export const FAMILIA_AGUA_FRIA_JOELHO45: Familia = familiaAgua({
  id: 'fam_agua_fria_joelho45',
  nome: 'Joelho 45° de água fria',
  categoria: 'conexao_tubo',
  descricao: 'Joelho de 45° de PVC soldável para água fria, varrido pelo anel De × (De − 2e) sobre um arco de raio Rc = De, com trecho reto Lf em cada ponta. Ponta A na origem (sai para −Z) e ponta B na direção de 45° a partir de +Z.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 25),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroEncaixe('DN'),
    RAIO_EIXO,
    TANGENTE_45,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [
    corpoAgua(
      'joelho',
      'Joelho 45°',
      'conexao',
      {
        tipo: 'varredura',
        perfil: anelAgua(),
        caminho: { pontos: [['0', '0', '0'], ['0', '0', 'Lf + Tg'], ['(Lf + Tg) * sin(45)', '0', '(Lf + Tg) * (1 + cos(45))']], raios: ['Rc'] },
      },
      { origem: ['0', '0', '0'] },
    ),
  ],
  ligacoes: [
    ligacaoAgua('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De'),
    ligacaoAgua('b', 'Ponta B', ['(Lf + Tg) * sin(45)', '0', '(Lf + Tg) * (1 + cos(45))'], ['sin(45)', '0', 'cos(45)'], 'De'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' },
  tipos: tiposPorDn((dn) => {
    const tg = dn * Math.tan((22.5 * Math.PI) / 180);
    const lf = encaixeDe(dn);
    return {
      L: mm((lf + tg) * Math.sin(Math.PI / 4) + dn / 2),
      A: mm((lf + tg) * (1 + Math.cos(Math.PI / 4)) + dn / 2),
      P: dn,
    };
  }),
  tipoPadrao: 'dn25',
});
