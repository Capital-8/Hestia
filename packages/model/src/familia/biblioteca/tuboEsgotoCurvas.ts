import type { Familia } from '../tipos.ts';
import { derivado } from './novosApoio.ts';
import { anelEsgoto, corpoEsgoto, dimensao, encaixeDe, familiaEsgoto, ligacaoEsgoto, mm, parametroDe, parametroDn, parametroEncaixe, parametroEspessura, parametroRaioCurva, tiposPorDn } from './tuboEsgotoApoio.ts';

/*
 * Curvas de esgoto (ficha F1). A curva é uma varredura do anel sobre a polilinha A → P → E, com raio de curva `Rc` no vértice P.
 * Para 90°: A = (0, 0, 0), P = (0, 0, Rc), E = (Rc, 0, Rc); a tangente inicial é +Z (a ponta A sai para −Z) e a final é +X.
 * Para 45°: a tangente de corte é Tg = Rc · tan(22,5°); E = P + Tg · (sen 45°, 0, cos 45°).
 * O raio `Rc` é `De` na curva curta e `2 De` na longa (CONFERIR: raios de catálogo). L, A e P são a caixa nominal do tipo
 * (raio curto); trocar o raio para longa não recalcula a caixa.
 */

const RAIO_CURVA = derivado('Rc', 'Raio de curva (eixo)', 'raio == "longa" ? 2 * De : De');
const TANGENTE_45 = derivado('Tg', 'Tangente da curva de 45°', 'Rc * tan(22.5)');

export const FAMILIA_ESGOTO_CURVA90: Familia = familiaEsgoto({
  id: 'fam_esgoto_curva90',
  nome: 'Curva 90° de esgoto',
  categoria: 'conexao_tubo',
  descricao: 'Curva de 90° de PVC para esgoto, varrida pelo anel De × (De − 2e) sobre um arco de raio Rc (curta ou longa). Ponta A na origem (sai para −Z) e ponta B em (Rc, 0, Rc) (sai para +X).',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 100),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroRaioCurva(),
    RAIO_CURVA,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [
    corpoEsgoto('curva', 'Curva 90°', 'conexao', { tipo: 'varredura', perfil: anelEsgoto(), caminho: { pontos: [['0', '0', '0'], ['0', '0', 'Rc'], ['Rc', '0', 'Rc']], raios: ['Rc'] } }, { origem: ['0', '0', '0'] }),
  ],
  ligacoes: [ligacaoEsgoto('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De'), ligacaoEsgoto('b', 'Ponta B', ['Rc', '0', 'Rc'], ['1', '0', '0'], 'De')],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' },
  tipos: tiposPorDn((dn) => ({ raio: 'curta', L: mm(1.5 * dn), A: mm(1.5 * dn), P: dn })),
  tipoPadrao: 'dn100',
});

/*
 * Curva 45°: o trecho reto de encaixe `Lf` fica em cada ponta (A → P e P → B têm comprimento Lf + Tg). Assim o arco nunca
 * começa exatamente no vértice A nem termina no vértice B: sem isso, o arredondamento cria um segmento quase nulo de direção
 * invertida e o quadro da varredura explode (ver relatório da ficha F1).
 */
export const FAMILIA_ESGOTO_CURVA45: Familia = familiaEsgoto({
  id: 'fam_esgoto_curva45',
  nome: 'Curva 45° de esgoto',
  categoria: 'conexao_tubo',
  descricao: 'Curva de 45° de PVC para esgoto, varrida pelo anel De × (De − 2e) sobre um arco de raio Rc (curta ou longa), com trecho reto de encaixe Lf em cada ponta. Ponta A na origem (sai para −Z) e ponta B na direção de 45° a partir de +Z.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 100),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroEncaixe('DN'),
    parametroRaioCurva(),
    RAIO_CURVA,
    TANGENTE_45,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [
    corpoEsgoto(
      'curva',
      'Curva 45°',
      'conexao',
      {
        tipo: 'varredura',
        perfil: anelEsgoto(),
        caminho: { pontos: [['0', '0', '0'], ['0', '0', 'Lf + Tg'], ['(Lf + Tg) * sin(45)', '0', '(Lf + Tg) * (1 + cos(45))']], raios: ['Rc'] },
      },
      { origem: ['0', '0', '0'] },
    ),
  ],
  ligacoes: [
    ligacaoEsgoto('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De'),
    ligacaoEsgoto('b', 'Ponta B', ['(Lf + Tg) * sin(45)', '0', '(Lf + Tg) * (1 + cos(45))'], ['sin(45)', '0', 'cos(45)'], 'De'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' },
  tipos: tiposPorDn((dn) => {
    const tg = dn * Math.tan((22.5 * Math.PI) / 180);
    const lf = encaixeDe(dn);
    return {
      raio: 'curta',
      L: mm((lf + tg) * Math.sin(Math.PI / 4) + dn / 2),
      A: mm((lf + tg) * (1 + Math.cos(Math.PI / 4)) + dn / 2),
      P: dn,
    };
  }),
  tipoPadrao: 'dn100',
});
