import type { Familia, Tipo } from '../tipos.ts';
import { derivado } from './novosApoio.ts';
import { corpoEletrico, dimensao, ESPESSURA_CALHA, familiaEletrica, ligacaoCalha } from './eletricaApoio.ts';

/*
 * Eletrocalhas (ficha F5): reta, curva de 90° e tê. A seção é retangular: largura P (horizontal, em X ou no plano da curva),
 * altura A e chapa `e` (CONFERIR: a calha perfurada e o perfil U de catálogo não são modelados; aqui é um perfil fechado).
 * A reta vai de z = 0 a z = L, com ligações em A (0,0,0) e B (0,0,L). A curva é varredura de raio Rc = 2 P (CONFERIR).
 * O tê tem o principal de −Ce a +Ce em X e o ramal saindo para +Y da face do principal (Ce = 2 P, CONFERIR).
 */

const ESPESSURA = derivado('e', 'Espessura da chapa', ESPESSURA_CALHA);
const RAIO_CALHA = derivado('Rc', 'Raio de curva', '2 * P');
const DISTANCIA_CALHA = derivado('Ce', 'Distância do centro à ponta', '2 * P');

/** Tipos por largura: 100, 150 e 200 mm, com altura de 50 mm e o comprimento nominal `L` dado (fórmula por largura). */
function tiposCalha(lado: (w: number) => number): Tipo[] {
  return [100, 150, 200].map((w) => ({ id: `l${w}`, nome: `Eletrocalha ${w} × 50`, valores: { P: w, A: 50, L: lado(w) } }));
}

export const FAMILIA_ELETROCALHA_RETA: Familia = familiaEletrica({
  id: 'fam_eletrocalha_reta',
  nome: 'Eletrocalha reta',
  categoria: 'eletroduto',
  descricao: 'Eletrocalha reta de chapa: perfil retangular fechado de largura P e altura A, ao longo do comprimento L (mm). Ligação retangular em cada ponta. CONFERIR: calha perfurada e perfil U.',
  parametros: [dimensao('L', 'Comprimento', 2000), dimensao('A', 'Altura', 50), dimensao('P', 'Largura', 100), ESPESSURA],
  corpos: [
    corpoEletrico('calha', 'Eletrocalha', 'tubo', { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'P', altura: 'A', espessura: 'e' }, comprimento: 'L' }, { origem: ['0', '0', '0'] }),
  ],
  ligacoes: [ligacaoCalha('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1']), ligacaoCalha('b', 'Ponta B', ['0', '0', 'L'], ['0', '0', '1'])],
  ifc: { classe: 'IFCCABLECARRIERSEGMENT', tipoPredefinido: 'CABLELADDERSEGMENT' },
  tipos: tiposCalha(() => 2000),
  tipoPadrao: 'l100',
});

export const FAMILIA_ELETROCALHA_CURVA: Familia = familiaEletrica({
  id: 'fam_eletrocalha_curva',
  nome: 'Curva 90° de eletrocalha',
  categoria: 'eletroduto',
  descricao: 'Curva de 90° de eletrocalha: varredura do perfil retangular de largura P e altura A sobre um arco de raio Rc = 2 P. Ponta A na origem (sai para −Z) e ponta B em (Rc, 0, Rc) (sai para +X). CONFERIR raio.',
  parametros: [dimensao('L', 'Largura', 250), dimensao('A', 'Altura', 50), dimensao('P', 'Largura da calha', 100), ESPESSURA, RAIO_CALHA],
  corpos: [
    corpoEletrico(
      'curva',
      'Curva 90°',
      'conexao',
      { tipo: 'varredura', perfil: { tipo: 'retanguloOco', largura: 'P', altura: 'A', espessura: 'e' }, caminho: { pontos: [['0', '0', '0'], ['0', '0', 'Rc'], ['Rc', '0', 'Rc']], raios: ['Rc'] } },
      { origem: ['0', '0', '0'] },
    ),
  ],
  ligacoes: [ligacaoCalha('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1']), ligacaoCalha('b', 'Ponta B', ['Rc', '0', 'Rc'], ['1', '0', '0'])],
  ifc: { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'BEND' },
  tipos: tiposCalha((w) => 2.5 * w),
  tipoPadrao: 'l100',
});

export const FAMILIA_ELETROCALHA_TE: Familia = familiaEletrica({
  id: 'fam_eletrocalha_te',
  nome: 'Tê de eletrocalha',
  categoria: 'eletroduto',
  descricao: 'Tê de eletrocalha: principal em X (pontas A e B) e ramal saindo para +Y (ponta C) da face do principal. Seção retangular de largura P e altura A. CONFERIR dimensões.',
  parametros: [dimensao('L', 'Comprimento do principal', 400), dimensao('A', 'Altura', 50), dimensao('P', 'Largura', 100), ESPESSURA, DISTANCIA_CALHA],
  corpos: [
    corpoEletrico(
      'principal',
      'Principal',
      'conexao',
      { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'P', altura: 'A', espessura: 'e' }, comprimento: '2 * Ce' },
      { origem: ['0 - Ce', '0', '0'], rotacao: ['0', '90', '0'] },
    ),
    corpoEletrico(
      'ramal',
      'Ramal',
      'conexao',
      { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'A', altura: 'P', espessura: 'e' }, comprimento: 'Ce' },
      { origem: ['0', 'A / 2', '0'], rotacao: ['-90', '0', '0'] },
    ),
  ],
  ligacoes: [
    ligacaoCalha('a', 'Ponta A', ['0 - Ce', '0', '0'], ['-1', '0', '0']),
    ligacaoCalha('b', 'Ponta B', ['Ce', '0', '0'], ['1', '0', '0']),
    ligacaoCalha('c', 'Ramal C', ['0', 'A / 2 + Ce', '0'], ['0', '1', '0']),
  ],
  ifc: { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'TEE' },
  tipos: tiposCalha((w) => 4 * w),
  tipoPadrao: 'l100',
});

/** Eletrocalhas do ramo elétrico (ficha F5): reta, curva e tê. */
export const CALHAS: Familia[] = [FAMILIA_ELETROCALHA_RETA, FAMILIA_ELETROCALHA_CURVA, FAMILIA_ELETROCALHA_TE];
