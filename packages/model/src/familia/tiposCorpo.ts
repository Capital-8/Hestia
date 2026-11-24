import type { Expr, NivelDetalhe } from './tipos.ts';

/*
 * CONTRATO dos CORPOS paramétricos (ADR 0061 §D2; especificação completa em docs/familias-parametricas/CONTRATO.md).
 * SÓ tipos e constantes: nada aqui tem lógica. O corpo é o sólido de FORMA CURVA ou de seção qualquer (tubo, curva, cone,
 * perfil laminado, cilindro), ao lado da `Peca` (chapa prismática da marcenaria), que continua igual.
 *
 * Texto em MILÍMETROS e GRAUS (como o resto da família); a resolução devolve metros e radianos (`CorpoResolvido`).
 * Perfil: coordenadas (u, v) no plano do perfil, origem no centro da seção (u = horizontal, v = vertical).
 * Quadro do corpo: `mundoLocal = Rz(rz) · Ry(ry) · Rx(rx) · ponto + origem` (rotações extrínsecas, em graus, ao redor dos
 * eixos da FAMÍLIA). A extrusão cresce em +Z do quadro; a revolução gira em torno do eixo Z do quadro; a varredura segue o
 * caminho dado nas coordenadas do quadro.
 */

export const LIMITES_CORPO = {
  corpos: 256,
  pontosCaminho: 64,
  pontosPoligono: 256,
  segmentosCirculo: 128,
  segmentosCurva: 64,
  /** Triângulos por corpo resolvido: acima disso a resolução devolve erro, nunca uma malha gigante. */
  triangulosPorCorpo: 200_000,
} as const;

export type Ponto3 = [Expr, Expr, Expr];
export type Ponto2 = [Expr, Expr];

/** Seção transversal. Os perfis `oco*`, `anel` e os laminados geram contorno externo + furos. */
export type Perfil =
  | { tipo: 'circulo'; diametro: Expr; segmentos?: Expr }
  | { tipo: 'anel'; diametroExterno: Expr; diametroInterno: Expr; segmentos?: Expr }
  | { tipo: 'retangulo'; largura: Expr; altura: Expr; raio?: Expr }
  | { tipo: 'retanguloOco'; largura: Expr; altura: Expr; espessura: Expr }
  | { tipo: 'poligono'; pontos: Ponto2[] }
  | { tipo: 'perfilI'; altura: Expr; largura: Expr; almaEsp: Expr; mesaEsp: Expr }
  | { tipo: 'perfilU'; altura: Expr; largura: Expr; almaEsp: Expr; mesaEsp: Expr }
  | { tipo: 'perfilL'; abaA: Expr; abaB: Expr; esp: Expr }
  | { tipo: 'perfilT'; altura: Expr; largura: Expr; almaEsp: Expr; mesaEsp: Expr };

/**
 * Caminho 3D da varredura: polilinha pelos `pontos` (mm, no quadro do corpo). `raios[i]` é o raio de curva (mm) no vértice
 * INTERIOR `i + 1`; ausente ou 0 = canto vivo. O trecho curvo é um arco tangente aos dois segmentos (cotovelo de tubo).
 */
export interface Caminho {
  pontos: Ponto3[];
  raios?: Expr[];
  /** Segmentos por arco de curva (padrão 12). */
  segmentosPorCurva?: Expr;
}

export type FormaCorpo =
  | { tipo: 'extrusao'; perfil: Perfil; comprimento: Expr }
  /** O perfil fica no plano (u = distância ao eixo ≥ 0, v = altura ao longo do eixo Z). `angulo` em graus (360 = volta inteira). */
  | { tipo: 'revolucao'; perfil: Perfil; angulo: Expr; segmentos?: Expr }
  | { tipo: 'varredura'; perfil: Perfil; caminho: Caminho }
  /** Mesclagem entre dois perfis ao longo de +Z (redução, cone, transição redondo → retangular). */
  | { tipo: 'transicao'; perfilA: Perfil; perfilB: Perfil; comprimento: Expr; desvio?: Ponto2 };

export type PapelCorpo = 'generico' | 'tubo' | 'conexao' | 'perfil' | 'corpo' | 'tampa' | 'visor';
export type VistaFamilia = 'planta' | 'corte' | 'elevacao' | '3d';

export interface QuadroCorpo {
  origem: Ponto3;
  /** Graus ao redor de X, Y e Z da família, nesta ordem de leitura `[rx, ry, rz]`. Ausente = sem rotação. */
  rotacao?: Ponto3;
}

export interface Corpo {
  id: string;
  nome: string;
  papel: PapelCorpo;
  forma: FormaCorpo;
  quadro: QuadroCorpo;
  /** Vazio: subtrai dos sólidos (v1: fantasma e aviso; subtração real só na ficha F-CSG). */
  vazio?: boolean;
  /** Id de parâmetro `material` ou id de material do projeto. */
  material?: string;
  repetir?: Expr;
  quando?: Expr;
  detalhe3d?: NivelDetalhe[];
  /** Vistas em que o corpo aparece; ausente = todas. */
  vistas?: VistaFamilia[];
  grupo?: string;
}
