import type { Vec2 } from '@hestia/geom';
import type { Id } from './types.ts';

// Tipos do guarda-corpo e do corrimão (decisão 0055, §4). Só tipos e constantes, no molde de stairTypes.ts.
// Metros e radianos em todo o modelo. O discriminante do elemento é 'railing'.

// ---- 4.1 Elemento --------------------------------------------------------------------------------------------------

/** Lado de um caminho, visto de quem sobe (escada, rampa) ou de quem percorre o caminho manual. */
export type LadoGC = 'esquerdo' | 'direito';

/** Em que parte do hospedeiro o guarda-corpo existe: ligar/desligar por lado e por tipo de trecho. */
export interface LadoHospedado {
  /** Acompanha os lances (e, na rampa, os lances inclinados). */
  lance: boolean;
  /** Acompanha os patamares (inclui o patamar de giro). */
  patamar: boolean;
}

/** Revit: Place on Treads / Stringer. */
export type PosicaoBaseGC = 'degrau' | 'lateral';

export interface HospedeiroEscada {
  tipo: 'escada';
  escadaId: Id;
  lados: Record<LadoGC, LadoHospedado>;
  posicaoBase: PosicaoBaseGC;
}
export interface HospedeiroRampa {
  tipo: 'rampa';
  rampaId: Id;
  lados: Record<LadoGC, LadoHospedado>;
  posicaoBase: PosicaoBaseGC;
}
/** Borda de laje, varanda, mezanino: o usuário traça o caminho. `referenciaId` só ajuda a ferramenta e o "Ir para". */
export interface HospedeiroManual {
  tipo: 'manual';
  uso: 'borda-laje' | 'varanda' | 'mezanino' | 'livre';
  referenciaId?: Id;
  /** Vértices em planta; `dz` é o desnível sobre `cotaBase` (0 = horizontal). Mínimo 2 pontos. */
  caminho: PontoCaminhoGC[];
  /** Laço fechado (último ponto liga ao primeiro). */
  fechado: boolean;
  /** Lado do caminho para o qual o deslocamento lateral vale. */
  ladoDeslocamento: LadoGC | 'centro';
}
export interface PontoCaminhoGC {
  x: number;
  y: number;
  dz: number;
}

export type HospedeiroGC = HospedeiroEscada | HospedeiroRampa | HospedeiroManual;

export interface GuardaCorpo {
  id: Id;
  kind: 'railing';
  levelId: Id;
  typeId: Id;
  hospedeiro: HospedeiroGC;
  /** Cota do ponto de partida sobre o nível, só no modo manual (m). Em escada e rampa vem do hospedeiro. */
  cotaBase: number;
  /** Deslocamento lateral do eixo do guarda-corpo (m); positivo = para dentro do hospedeiro (sobre o degrau/laje). null = usa o do tipo. */
  deslocamento: number | null;
  /** Altura do guarda-corpo (m) quando difere do tipo; null = a do tipo. */
  altura: number | null;
  /** Inverte o sentido do caminho (muda o início e o fim; no manual, o lado "esquerdo"). */
  inverter: boolean;
  /** Sobrescritas de instância (Revit: parâmetros de instância). Só o que o usuário alterou. */
  sobrescritas?: Partial<SobrescritasGC>;
  mark: string;
  comments: string;
  /** Ordem de criação. */
  order: number;
}
export interface SobrescritasGC {
  postesIntermediarios: boolean;
  preenchimentoAtivo: boolean;
  corrimaoAtivo: boolean;
  normaId: Id | null;
}

// ---- 4.2 Tipo (família) --------------------------------------------------------------------------------------------

export type FormaPerfilGC = 'circular' | 'retangular' | 'poligono';

/** Perfil de varredura ou de extrusão vertical. Origem no centro; Y para cima. */
export interface PerfilGC {
  forma: FormaPerfilGC;
  /** circular: diâmetro; retangular: largura (m). */
  largura: number;
  /** retangular: altura (m); ignorado no circular. */
  altura: number;
  /** poligono: vértices anti-horários (m), 3 a 64 pontos. */
  pontos?: Vec2[];
}

export type RefBaseGC =
  | { de: 'hospedeiro' } // piso/degrau/linha das quinas
  | { de: 'trilho'; indice: number }; // um dos `trilhos` do tipo
export type RefTopoGC =
  | { de: 'altura' } // altura do guarda-corpo
  | { de: 'trilho'; indice: number }
  | { de: 'corrimao'; indice: number };

/** Revit: Rail Structure (trilho não contínuo). */
export interface TrilhoGC {
  nome: string;
  /** Altura do eixo sobre o hospedeiro (m). */
  altura: number;
  /** Deslocamento lateral (m). */
  deslocamento: number;
  perfil: PerfilGC;
  materialId: Id;
}

export type ExtremidadeEstiloGC = 'nenhum' | 'parede' | 'piso' | 'poste';
export interface ExtensaoGC {
  estilo: ExtremidadeEstiloGC;
  /** Comprimento horizontal da extensão (m). */
  comprimento: number;
  /** Revit: Plus Tread Depth. Soma a profundidade de um degrau (só escada e rampa). */
  maisPiso: boolean;
}
export type LayoutSuporteGC = 'nenhum' | 'distancia-fixa' | 'alinhar-postes' | 'numero-fixo' | 'espacamento-maximo' | 'espacamento-minimo';
export type JustificacaoGC = 'inicio' | 'fim' | 'centro' | 'distribuir';
export interface SuportesGC {
  layout: LayoutSuporteGC;
  espacamento: number;
  numero: number;
  justificacao: JustificacaoGC;
  perfil: PerfilGC;
  /** Comprimento do suporte (m), do eixo do corrimão ao ponto de fixação. */
  comprimento: number;
  materialId: Id;
}
export type TransicaoCorrimaoGC = 'nenhuma' | 'simples' | 'pescoco-de-ganso';
export type JuncaoCorrimaoGC = 'esquadria' | 'filete';

/** Corrimão ou travessa superior (Revit: Continuous Rail; ArchiCAD: Toprail e Handrail). */
export interface CorrimaoGC {
  nome: string;
  /** 'topo' = travessa superior sobre os postes (não é para agarrar); demais = corrimão. */
  funcao: 'topo' | 'corrimao';
  /** Em que lado do guarda-corpo fica. 'eixo' = sobre o eixo (travessa superior). */
  posicao: 'eixo' | 'esquerda' | 'direita' | 'ambas';
  /** Altura do TOPO do corrimão sobre o hospedeiro (m): sobre a linha das quinas em escada e rampa. */
  altura: number;
  /** Folga entre a face lateral do corrimão e a face do guarda-corpo ou da parede (m). */
  afastamento: number;
  perfil: PerfilGC;
  materialId: Id;
  extensaoInicio: ExtensaoGC;
  extensaoFim: ExtensaoGC;
  suportes: SuportesGC;
  transicao: TransicaoCorrimaoGC;
  juncao: JuncaoCorrimaoGC;
  raioFilete: number;
}

export type PapelPosteGC = 'inicio' | 'fim' | 'canto' | 'intermediario';
export interface PosteGC {
  ativo: boolean;
  perfil: PerfilGC;
  materialId: Id;
  /** Quanto o poste sobe acima da altura do guarda-corpo (m, ≥ 0). */
  alturaAcima: number;
  /** Quanto desce abaixo da base (m, ≥ 0; embute na laje/degrau). */
  profundidadeAbaixo: number;
}
export interface PostesGC {
  inicio: PosteGC;
  fim: PosteGC;
  /** Poste em cada vértice cujo giro em planta passa de `anguloCanto`. */
  canto: PosteGC;
  /** rad, padrão 5° (0,0873). */
  anguloCanto: number;
  intermediario: PosteGC & {
    modo: 'espacamento-maximo' | 'espacamento-fixo' | 'numero-fixo' | 'nenhum';
    /** m */
    espacamento: number;
    /** por trecho */
    numero: number;
  };
}

export type QuebraPadraoGC = 'cada-segmento' | 'angulo' | 'nunca';
export type SobraPadraoGC = 'nenhuma' | 'balaustre-extra' | 'folga-nas-pontas';

/** Um balaústre dentro do padrão. `modelo: null` = vazio (só ocupa espaço). */
export interface ElementoPadraoGC {
  modelo: { perfil: PerfilGC; materialId: Id } | null;
  /** Distância horizontal ao elemento anterior do padrão (m); o primeiro usa 0. */
  distanciaAnterior: number;
  deslocamentoLateral: number;
  /** Cortes de altura em relação à base e ao topo do padrão (m). */
  deslocamentoBase: number;
  deslocamentoTopo: number;
}

/** Padrão de balaústres (Revit: Main Pattern; ArchiCAD: Balusters). */
export interface PadraoBalaustresGC {
  tipo: 'balaustres';
  nome: string;
  base: RefBaseGC;
  topo: RefTopoGC;
  /** 1 a 16 elementos. */
  elementos: ElementoPadraoGC[];
  /** Distância horizontal entre o início de uma repetição e o da seguinte (m). Maior que a soma das `distanciaAnterior`. */
  periodo: number;
  justificacao: JustificacaoGC;
  sobra: SobraPadraoGC;
  quebra: QuebraPadraoGC;
  /** rad, usado com quebra 'angulo'. */
  anguloQuebra: number;
  /** O padrão é distribuído em cada vão entre postes ('vao') ou no segmento inteiro ('segmento'). */
  escopo: 'vao' | 'segmento';
  /**
   * Só escada/rampa: balaústres por degrau no lugar do `periodo` nos lances. `distanciaDoBocel` é medida da borda frontal do piso até o centro do
   * montante (m); `null` = centro da pisada (padrão). O montante fica sempre inteiro sobre o piso: sem espaço, o motor avisa.
   */
  porDegrau: { ativo: boolean; quantidade: number; distanciaDoBocel: number | null; modelo: ElementoPadraoGC['modelo'] };
}

export type FamiliaPainelGC = 'vidro' | 'chapa' | 'chapa-perfurada' | 'tela' | 'cabo-aco';
export interface PainelGC {
  tipo: 'painel';
  nome: string;
  familia: FamiliaPainelGC;
  base: RefBaseGC;
  topo: RefTopoGC;
  deslocamentoBase: number;
  deslocamentoTopo: number;
  /** Espessura do painel (m): vidro, chapa, chapa perfurada. */
  espessura: number;
  /** Folga lateral entre o painel e o poste (m). */
  folgaLateral: number;
  /** Largura máxima de um painel (m); acima disso divide em painéis iguais. 0 = sem limite (um painel por vão). */
  larguraMaxima: number;
  materialId: Id;
  /** Só 'chapa-perfurada'. Furo circular. */
  perfuracao?: { diametro: number; passoX: number; passoY: number; alternado: boolean };
  /** Só 'tela': malha retangular e fio. */
  tela?: { larguraMalha: number; alturaMalha: number; diametroFio: number };
  /** Só 'cabo-aco': cabos paralelos. */
  cabos?: { diametro: number; espacamento: number; orientacao: 'horizontal' | 'vertical'; tensao?: number };
}

export type PreenchimentoGC = PadraoBalaustresGC | PainelGC;

export type JuncaoAngularGC = 'segmento-vertical' | 'nenhum';
export type JuncaoTangenteGC = 'segmento-vertical' | 'nenhum' | 'estender-trilhos';
export type ConexaoTrilhoGC = 'cortar' | 'soldar';

export interface TipoGuardaCorpo {
  id: Id;
  name: string;
  code: string;
  description: string;
  /** Altura nominal do guarda-corpo (m), medida do hospedeiro ao topo do trilho superior. */
  altura: number;
  /** Deslocamento lateral padrão do eixo (m). */
  deslocamento: number;
  /** Revit: Landing Height Adjustment. Soma à altura nos patamares (0 = desligado). */
  ajusteAlturaPatamar: number;
  /** Folga entre a base do preenchimento e o hospedeiro (m), para o aviso de vão inferior. */
  folgaInferior: number;
  /** 0 a 12. */
  trilhos: TrilhoGC[];
  /** 0 a 4. */
  corrimaos: CorrimaoGC[];
  postes: PostesGC;
  /** 0 a 8, desenhados na ordem. */
  preenchimentos: PreenchimentoGC[];
  juncaoAngular: JuncaoAngularGC;
  juncaoTangente: JuncaoTangenteGC;
  conexaoTrilho: ConexaoTrilhoGC;
  /** Perfil de norma que vale para este tipo; null = o do projeto. */
  normaId: Id | null;
  /** Para o IFC (IfcRailingTypeEnum): null = o Hestia escolhe pela composição. */
  ifcPredefinido: 'GUARDRAIL' | 'HANDRAIL' | 'BALUSTRADE' | 'USERDEFINED' | null;
  materialPadraoId: Id;
  /** Cargas que o tipo declara suportar (o Hestia não calcula estrutura); null = não declarada. */
  cargaLinear: number | null; // N/m
  cargaArea: number | null; // kPa
  cargaPontual: number | null; // N
  /** Custo informativo por metro, na moeda do projeto. */
  cost: number;
}

/** Limites de defesa e determinismo (decisão 0055 §4.2; molde da decisão 0049). */
export const LIMITES_GUARDA_CORPO = {
  trilhos: 12,
  corrimaos: 4,
  preenchimentos: 8,
  elementosPadrao: 16,
  pontosPerfil: 64,
  caminhoManual: 512,
  balaustres: 20_000,
} as const;
