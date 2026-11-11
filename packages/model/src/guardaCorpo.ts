import type { Id } from './types.ts';
import { t, type Lang } from './i18n.ts';
import {
  LIMITES_GUARDA_CORPO,
  type CorrimaoGC,
  type ElementoPadraoGC,
  type GuardaCorpo,
  type HospedeiroGC,
  type PainelGC,
  type PerfilGC,
  type PosteGC,
  type PostesGC,
  type RefBaseGC,
  type SuportesGC,
  type TipoGuardaCorpo,
  type TrilhoGC,
} from './guardaCorpoTypes.ts';

/** Tipo de guarda-corpo usado por padrão quando o projeto não escolhe outro. */
export const DEFAULT_TIPO_GUARDA_CORPO_ID: Id = 'gct_balaustres';

type GuardaCorpoInput = { id: Id; levelId: Id; typeId: Id; hospedeiro: HospedeiroGC } & Partial<Omit<GuardaCorpo, 'order' | 'kind'>>;

/** Constrói um guarda-corpo com os campos padrão; `order` é atribuído pelo comando addGuardaCorpo. */
export function makeGuardaCorpo(g: GuardaCorpoInput): Omit<GuardaCorpo, 'order'> {
  return {
    kind: 'railing',
    cotaBase: 0,
    deslocamento: null,
    altura: null,
    inverter: false,
    mark: '',
    comments: '',
    ...g,
  };
}

const circular = (diametro: number): PerfilGC => ({ forma: 'circular', largura: diametro, altura: 0 });
const retangular = (largura: number, altura: number): PerfilGC => ({ forma: 'retangular', largura, altura });
const METAL = 'mat_aco';

const poste = (perfil: PerfilGC, materialId: string, ativo = true): PosteGC => ({ ativo, perfil, materialId, alturaAcima: 0, profundidadeAbaixo: 0 });

/** Postes padrão: início, fim e canto ligados; intermediários desligados. */
function postesPadrao(perfil: PerfilGC, materialId: string): PostesGC {
  return {
    inicio: poste(perfil, materialId),
    fim: poste(perfil, materialId),
    canto: poste(perfil, materialId),
    anguloCanto: 5 * (Math.PI / 180),
    intermediario: { ...poste(perfil, materialId, false), modo: 'nenhum', espacamento: 1.5, numero: 0 },
  };
}

const suportesNenhum = (materialId: string): SuportesGC => ({
  layout: 'nenhum',
  espacamento: 0,
  numero: 0,
  justificacao: 'distribuir',
  perfil: circular(0.02),
  comprimento: 0.05,
  materialId,
});

/** Corrimão padrão: extensões nulas, sem suportes, transição nula, junção por esquadria. */
function corrimaoPadrao(nome: string, funcao: CorrimaoGC['funcao'], posicao: CorrimaoGC['posicao'], altura: number, perfil: PerfilGC, materialId: string): CorrimaoGC {
  const nula = { estilo: 'nenhum' as const, comprimento: 0, maisPiso: false };
  return {
    nome,
    funcao,
    posicao,
    altura,
    afastamento: 0,
    perfil,
    materialId,
    extensaoInicio: nula,
    extensaoFim: nula,
    suportes: suportesNenhum(materialId),
    transicao: 'simples',
    juncao: 'esquadria',
    raioFilete: 0.05,
  };
}

/** Painel de preenchimento: vidro, cabos, tela ou chapa perfurada, apoiado no hospedeiro e no corrimão 0. */
function painel(nome: string, p: Omit<PainelGC, 'tipo' | 'nome' | 'base' | 'topo' | 'deslocamentoBase' | 'deslocamentoTopo' | 'larguraMaxima' | 'folgaLateral'>): PainelGC {
  return {
    tipo: 'painel',
    nome,
    base: { de: 'hospedeiro' },
    topo: { de: 'corrimao', indice: 0 },
    deslocamentoBase: 0.01,
    deslocamentoTopo: 0,
    larguraMaxima: 0,
    folgaLateral: 0.005,
    ...p,
  };
}

/** Travessa inferior (trilho) a 8 cm do piso: onde os balaústres e os painéis de tela, cabo e chapa nascem. */
const ALTURA_TRAVESSA_INFERIOR = 0.08;
const BASE_NA_TRAVESSA: RefBaseGC = { de: 'trilho', indice: 0 };
function travessaInferior(perfil: PerfilGC, materialId: string): TrilhoGC {
  return { nome: 'Travessa inferior', altura: ALTURA_TRAVESSA_INFERIOR, deslocamento: 0, perfil, materialId };
}

/** Balaústre redondo em padrão, de topo no corrimão 0. Nasce na travessa inferior (trilho 0) ou no hospedeiro. */
function balaustres(nome: string, perfil: PerfilGC, materialId: string, periodo: number, base: RefBaseGC = { de: 'hospedeiro' }): TipoGuardaCorpo['preenchimentos'][number] {
  const elemento: ElementoPadraoGC = { modelo: { perfil, materialId }, distanciaAnterior: 0, deslocamentoLateral: 0, deslocamentoBase: 0, deslocamentoTopo: 0 };
  return {
    tipo: 'balaustres',
    nome,
    base,
    topo: { de: 'corrimao', indice: 0 },
    elementos: [elemento],
    periodo,
    justificacao: 'distribuir',
    sobra: 'nenhuma',
    quebra: 'nunca',
    anguloQuebra: 0.5236,
    escopo: 'vao',
    // Automático (norma): em escada e rampa com degraus, o mínimo de balaústres por degrau para o vão livre não passar da esfera da norma, no centro de
    // faixas iguais da pisada (nunca na quina); fora dos lances, o espaçamento máximo da norma. `quantidade` só vale se o usuário desligar o automático.
    porDegrau: { ativo: true, quantidade: 2, automatico: true, distanciaDoBocel: null, modelo: elemento.modelo },
  };
}

/** Chaves de nome e de descrição de um tipo padrão (o dicionário é tipado por chave literal). */
type TextosTipo = readonly [Parameters<typeof t>[1], Parameters<typeof t>[1]];

/** Tipos de guarda-corpo iniciais no idioma pedido. */
export function tiposGuardaCorpo(lang: Lang = 'pt'): TipoGuardaCorpo[] {
  const base = (id: string, code: string, [nomeKey, descKey]: TextosTipo, altura: number, o: Partial<TipoGuardaCorpo>): TipoGuardaCorpo => ({
    id,
    name: t(lang, nomeKey),
    code,
    description: t(lang, descKey),
    altura,
    deslocamento: 0.035,
    ajusteAlturaPatamar: 0,
    folgaInferior: 0.1,
    trilhos: [],
    corrimaos: [],
    postes: postesPadrao(circular(0.05), METAL),
    preenchimentos: [],
    juncaoAngular: 'nenhum',
    juncaoTangente: 'nenhum',
    conexaoTrilho: 'cortar',
    normaId: null,
    ifcPredefinido: null,
    materialPadraoId: METAL,
    cargaLinear: null,
    cargaArea: null,
    cargaPontual: null,
    cost: 0,
    ...o,
  });
  const topoMetal = corrimaoPadrao('Corrimão tubular', 'corrimao', 'eixo', 1.1, circular(0.045), METAL);
  return [
    base('gct_balaustres', 'GC-01', ['md_gc_type_balaustres', 'md_gc_type_balaustres_desc'], 1.1, {
      corrimaos: [corrimaoPadrao('Travessa superior', 'topo', 'eixo', 1.1, circular(0.05), METAL)],
      trilhos: [travessaInferior(circular(0.05), METAL)],
      preenchimentos: [balaustres('Balaústres redondos', circular(0.02), METAL, 0.11, BASE_NA_TRAVESSA)],
      cost: 0,
    }),
    base('gct_vidro', 'GC-02', ['md_gc_type_vidro', 'md_gc_type_vidro_desc'], 1.1, {
      corrimaos: [topoMetal],
      preenchimentos: [painel('Vidro laminado', { familia: 'vidro', espessura: 0.012, materialId: 'mat_vidro' })],
    }),
    base('gct_madeira', 'GC-03', ['md_gc_type_madeira', 'md_gc_type_madeira_desc'], 1.1, {
      corrimaos: [corrimaoPadrao('Corrimão de madeira', 'corrimao', 'eixo', 1.1, retangular(0.06, 0.06), 'mat_madeira')],
      trilhos: [travessaInferior(retangular(0.06, 0.06), 'mat_madeira')],
      preenchimentos: [balaustres('Balaústres de madeira', retangular(0.04, 0.04), 'mat_madeira', 0.11, BASE_NA_TRAVESSA)],
      postes: postesPadrao(retangular(0.08, 0.08), 'mat_madeira'),
      materialPadraoId: 'mat_madeira',
    }),
    base('gct_cabos', 'GC-04', ['md_gc_type_cabos', 'md_gc_type_cabos_desc'], 1.1, {
      corrimaos: [topoMetal],
      trilhos: [travessaInferior(circular(0.05), METAL)],
      preenchimentos: [{ ...painel('Cabos de aço', { familia: 'cabo-aco', espessura: 0.005, materialId: METAL, cabos: { diametro: 0.005, espacamento: 0.09, orientacao: 'horizontal' } }), base: BASE_NA_TRAVESSA, deslocamentoBase: 0 }],
    }),
    base('gct_tela', 'GC-05', ['md_gc_type_tela', 'md_gc_type_tela_desc'], 1.1, {
      corrimaos: [topoMetal],
      trilhos: [travessaInferior(circular(0.05), METAL)],
      preenchimentos: [{ ...painel('Tela metálica', { familia: 'tela', espessura: 0.002, materialId: METAL, tela: { larguraMalha: 0.05, alturaMalha: 0.05, diametroFio: 0.002 } }), base: BASE_NA_TRAVESSA, deslocamentoBase: 0 }],
    }),
    base('gct_chapa_perfurada', 'GC-06', ['md_gc_type_chapa_perfurada', 'md_gc_type_chapa_perfurada_desc'], 1.1, {
      corrimaos: [topoMetal],
      trilhos: [travessaInferior(circular(0.05), METAL)],
      preenchimentos: [
        {
          ...painel('Chapa perfurada', {
            familia: 'chapa-perfurada',
            espessura: 0.002,
            materialId: METAL,
            perfuracao: { diametro: 0.008, passoX: 0.015, passoY: 0.015, alternado: true },
          }),
          base: BASE_NA_TRAVESSA,
          deslocamentoBase: 0,
        },
      ],
    }),
    base('gct_corrimao_parede', 'GC-07', ['md_gc_type_corrimao_parede', 'md_gc_type_corrimao_parede_desc'], 0.92, {
      // Sem preenchimento: corrimão fixado na parede ao lado da escada (decisão 0055 §12, ponto 6).
      // Duas alturas (0,92 e 0,70 m, NBR 9050, a conferir): dois corrimãos no mesmo tipo.
      corrimaos: [
        { ...corrimaoPadrao('Corrimão superior', 'corrimao', 'direita', 0.92, circular(0.045), METAL), afastamento: 0.04, extensaoInicio: { estilo: 'parede', comprimento: 0.3, maisPiso: true }, extensaoFim: { estilo: 'parede', comprimento: 0.3, maisPiso: true } },
        { ...corrimaoPadrao('Corrimão inferior', 'corrimao', 'direita', 0.7, circular(0.045), METAL), afastamento: 0.04, extensaoInicio: { estilo: 'parede', comprimento: 0.3, maisPiso: true }, extensaoFim: { estilo: 'parede', comprimento: 0.3, maisPiso: true } },
      ],
      postes: { ...postesPadrao(circular(0.05), METAL), inicio: poste(circular(0.05), METAL, false), fim: poste(circular(0.05), METAL, false), canto: poste(circular(0.05), METAL, false) },
    }),
  ];
}

/** Perfis de um tipo (trilhos, corrimãos, suportes, postes, padrões e painéis), para conferir a forma. */
function perfisDoTipo(tipo: TipoGuardaCorpo): PerfilGC[] {
  const out: PerfilGC[] = [];
  for (const tr of tipo.trilhos) out.push(tr.perfil);
  for (const c of tipo.corrimaos) out.push(c.perfil, c.suportes.perfil);
  for (const pst of [tipo.postes.inicio, tipo.postes.fim, tipo.postes.canto, tipo.postes.intermediario]) out.push(pst.perfil);
  for (const pr of tipo.preenchimentos) {
    if (pr.tipo === 'balaustres') {
      for (const e of pr.elementos) if (e.modelo) out.push(e.modelo.perfil);
      if (pr.porDegrau.modelo) out.push(pr.porDegrau.modelo.perfil);
    }
  }
  return out;
}

/** 1ª mensagem de erro do tipo de guarda-corpo ao salvar, ou null. Regras da decisão 0055 §4.2. */
export function tipoGuardaCorpoIssue(tipo: TipoGuardaCorpo, lang: Lang = 'pt'): string | null {
  if (!(tipo.altura > 0)) return t(lang, 'md_gc_altura_positiva');
  if (!(tipo.folgaInferior >= 0)) return t(lang, 'md_gc_folga_negativa');
  const limite = (what: string, n: number, max: number): string | null => (n > max ? t(lang, 'md_gc_limite', { what, max }) : null);
  const limites = [
    limite(t(lang, 'md_gc_what_trilhos'), tipo.trilhos.length, LIMITES_GUARDA_CORPO.trilhos),
    limite(t(lang, 'md_gc_what_corrimaos'), tipo.corrimaos.length, LIMITES_GUARDA_CORPO.corrimaos),
    limite(t(lang, 'md_gc_what_preenchimentos'), tipo.preenchimentos.length, LIMITES_GUARDA_CORPO.preenchimentos),
  ];
  const primeiroLimite = limites.find((m) => m !== null);
  if (primeiroLimite) return primeiroLimite;
  for (const perfil of perfisDoTipo(tipo)) {
    if (perfil.forma === 'poligono') {
      const n = perfil.pontos?.length ?? 0;
      if (n < 3 || n > LIMITES_GUARDA_CORPO.pontosPerfil) return t(lang, 'md_gc_perfil_poligono', { max: LIMITES_GUARDA_CORPO.pontosPerfil });
    } else if (!(perfil.largura > 0) || (perfil.forma === 'retangular' && !(perfil.altura > 0))) {
      return t(lang, 'md_gc_perfil_largura');
    }
  }
  for (const tr of tipo.trilhos) if (!(tr.altura >= 0) || tr.altura >= tipo.altura) return t(lang, 'md_gc_trilho_altura');
  for (const pr of tipo.preenchimentos) {
    const msg = preenchimentoIssue(tipo, pr, lang);
    if (msg) return msg;
  }
  return null;
}

function preenchimentoIssue(tipo: TipoGuardaCorpo, pr: TipoGuardaCorpo['preenchimentos'][number], lang: Lang): string | null {
  for (const ref of [pr.base, pr.topo]) {
    if (ref.de === 'trilho' && (ref.indice < 0 || ref.indice >= tipo.trilhos.length)) return t(lang, 'md_gc_ref_trilho');
    if (ref.de === 'corrimao' && (ref.indice < 0 || ref.indice >= tipo.corrimaos.length)) return t(lang, 'md_gc_ref_corrimao');
  }
  if (pr.tipo === 'painel') {
    if (['vidro', 'chapa', 'chapa-perfurada'].includes(pr.familia) && !(pr.espessura > 0)) return t(lang, 'md_gc_espessura');
    return null;
  }
  if (pr.elementos.length < 1 || pr.elementos.length > LIMITES_GUARDA_CORPO.elementosPadrao) {
    return t(lang, 'md_gc_elementos', { max: LIMITES_GUARDA_CORPO.elementosPadrao });
  }
  const soma = pr.elementos.reduce((acc, e) => acc + e.distanciaAnterior, 0);
  if (!(pr.periodo > soma)) return t(lang, 'md_gc_periodo');
  if (pr.porDegrau.ativo && !pr.porDegrau.automatico && !(pr.porDegrau.quantidade >= 1)) return t(lang, 'md_gc_pordegrau');
  return null;
}