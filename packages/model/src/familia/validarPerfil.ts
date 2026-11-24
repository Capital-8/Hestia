import { LIMITES_CORPO } from './tiposCorpo.ts';
import type { CampoExpressao } from './validarCampos.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import type { Problema } from './validar.ts';

/*
 * Validação estática de um perfil de corpo (CONTRATO §2.2 e §2.5): campos obrigatórios por tipo, medidas literais > 0,
 * relações entre medidas quando são literais, contagem de pontos do polígono e faixa de `segmentos`.
 * "Literal" é texto que é só número. Fórmula fica para a resolução; a sintaxe dela é conferida em `validarCorpos.ts`.
 * Auto-interseção do polígono e as checagens de geometria não cabem aqui (ficha A3/A4). Nunca lança.
 */

const LITERAL = /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/;
const SEGMENTOS_PERFIL_MIN = 8;

/** Valor numérico de um campo literal; `undefined` para fórmula, ausente ou valor que não é texto. */
export function literal(valor: unknown): number | undefined {
  if (typeof valor !== 'string' || !LITERAL.test(valor)) return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

interface DefinicaoPerfil {
  /** Medidas obrigatórias; todas precisam ser > 0 quando literais. */
  obrigatorios: readonly string[];
  /** Campos opcionais de fórmula. */
  opcionais: readonly string[];
}

const MEDIDAS_LAMINADO = ['altura', 'largura', 'almaEsp', 'mesaEsp'] as const;

const PERFIS = new Map<string, DefinicaoPerfil>([
  ['circulo', { obrigatorios: ['diametro'], opcionais: ['segmentos'] }],
  ['anel', { obrigatorios: ['diametroExterno', 'diametroInterno'], opcionais: ['segmentos'] }],
  ['retangulo', { obrigatorios: ['largura', 'altura'], opcionais: ['raio'] }],
  ['retanguloOco', { obrigatorios: ['largura', 'altura', 'espessura'], opcionais: [] }],
  ['poligono', { obrigatorios: [], opcionais: [] }],
  ['perfilI', { obrigatorios: MEDIDAS_LAMINADO, opcionais: [] }],
  ['perfilU', { obrigatorios: MEDIDAS_LAMINADO, opcionais: [] }],
  ['perfilT', { obrigatorios: MEDIDAS_LAMINADO, opcionais: [] }],
  ['perfilL', { obrigatorios: ['abaA', 'abaB', 'esp'], opcionais: [] }],
]);

/** Furos da seção: o perfil `anel` e o `retanguloOco` são os únicos que os têm (CONTRATO §2.2). */
export function temFuros(perfil: unknown): boolean {
  return ehObjeto(perfil) && (perfil.tipo === 'anel' || perfil.tipo === 'retanguloOco');
}

/** Campos de fórmula de um perfil (medidas, segmentos, coordenadas do polígono), com o `onde` de cada um. */
export function camposDoPerfil(perfil: unknown, onde: string, permiteIN: boolean): CampoExpressao[] {
  if (!ehObjeto(perfil)) return [];
  const definicao = PERFIS.get(texto(perfil.tipo));
  if (!definicao) return [];
  const out: CampoExpressao[] = [];
  for (const nome of [...definicao.obrigatorios, ...definicao.opcionais]) {
    out.push({ onde: `${onde}.${nome}`, valor: perfil[nome], obrigatorio: false, permiteIN });
  }
  if (perfil.tipo === 'poligono') {
    comoArray<unknown>(perfil.pontos).forEach((ponto, k) => {
      const par = comoArray<unknown>(ponto);
      for (let j = 0; j < 2; j++) {
        out.push({ onde: `${onde}.pontos[${k}][${j}]`, valor: par[j], obrigatorio: true, permiteIN });
      }
    });
  }
  return out;
}

/** Medida literal precisa ser > 0 (usada também por corpos, para `comprimento`). Fórmula e não-texto ficam de fora. */
export function exigirPositivo(valor: unknown, onde: string, diag: Problema[]): void {
  const n = literal(valor);
  if (n !== undefined && n <= 0) diag.push(criarProblema('faixa', 'medida precisa ser maior que zero', onde));
}

/** Valida um perfil e empilha os problemas em `diag`. `onde` é o caminho do perfil, p.ex. `corpos[c].forma.perfil`. */
export function validarPerfil(perfil: unknown, onde: string, diag: Problema[]): void {
  if (perfil === undefined) {
    diag.push(criarProblema('obrigatorio', 'perfil ausente', onde));
    return;
  }
  if (!ehObjeto(perfil)) {
    diag.push(criarProblema('tipo', 'o perfil precisa ser um objeto', onde));
    return;
  }
  const definicao = PERFIS.get(texto(perfil.tipo));
  if (!definicao) {
    diag.push(criarProblema('tipo', `forma de perfil desconhecida “${texto(perfil.tipo)}”`, onde));
    return;
  }

  for (const nome of definicao.obrigatorios) {
    const valor = perfil[nome];
    if (valor === undefined) {
      diag.push(criarProblema('obrigatorio', `medida “${nome}” é obrigatória`, `${onde}.${nome}`));
    } else {
      exigirPositivo(valor, `${onde}.${nome}`, diag);
    }
  }

  if (definicao.opcionais.includes('segmentos')) {
    const segmentos = literal(perfil.segmentos);
    if (segmentos !== undefined && (segmentos < SEGMENTOS_PERFIL_MIN || segmentos > LIMITES_CORPO.segmentosCirculo)) {
      diag.push(criarProblema(
        'faixa',
        `segmentos precisa estar entre ${SEGMENTOS_PERFIL_MIN} e ${LIMITES_CORPO.segmentosCirculo}`,
        `${onde}.segmentos`,
      ));
    }
  }

  if (perfil.tipo === 'poligono') validarPontosDoPoligono(perfil.pontos, onde, diag);
  validarRelacoes(perfil, onde, diag);
}

function validarPontosDoPoligono(pontos: unknown, onde: string, diag: Problema[]): void {
  const lugar = `${onde}.pontos`;
  if (pontos === undefined) {
    diag.push(criarProblema('obrigatorio', 'polígono sem pontos', lugar));
    return;
  }
  if (!Array.isArray(pontos)) {
    diag.push(criarProblema('tipo', 'os pontos do polígono precisam ser uma lista', lugar));
    return;
  }
  const lista = comoArray<unknown>(pontos);
  if (lista.length < 3) {
    diag.push(criarProblema('faixa', `polígono precisa de pelo menos 3 pontos (tem ${lista.length})`, lugar));
  }
  if (lista.length > LIMITES_CORPO.pontosPoligono) {
    diag.push(criarProblema('limite', `polígono passa de ${LIMITES_CORPO.pontosPoligono} pontos`, lugar));
  }
  lista.forEach((ponto, k) => {
    if (!Array.isArray(ponto) || ponto.length !== 2) {
      diag.push(criarProblema('tipo', 'ponto do polígono precisa de 2 coordenadas', `${onde}.pontos[${k}]`));
    }
  });
}

/** Relações entre medidas (CONTRATO §2.2), conferidas só quando todas as medidas envolvidas são literais. */
function validarRelacoes(perfil: Record<string, unknown>, onde: string, diag: Problema[]): void {
  if (perfil.tipo === 'anel') {
    const externo = literal(perfil.diametroExterno);
    const interno = literal(perfil.diametroInterno);
    if (externo !== undefined && interno !== undefined && interno >= externo) {
      diag.push(criarProblema('faixa', 'diâmetro interno precisa ser menor que o externo', `${onde}.diametroInterno`));
    }
    return;
  }
  if (perfil.tipo === 'retanguloOco') {
    const largura = literal(perfil.largura);
    const altura = literal(perfil.altura);
    const espessura = literal(perfil.espessura);
    if (largura !== undefined && altura !== undefined && espessura !== undefined && espessura * 2 >= Math.min(largura, altura)) {
      diag.push(criarProblema('faixa', 'espessura precisa ser menor que metade do lado menor', `${onde}.espessura`));
    }
    return;
  }
  if (perfil.tipo === 'perfilI' || perfil.tipo === 'perfilU' || perfil.tipo === 'perfilT') {
    const altura = literal(perfil.altura);
    const largura = literal(perfil.largura);
    const almaEsp = literal(perfil.almaEsp);
    const mesaEsp = literal(perfil.mesaEsp);
    if (altura !== undefined && mesaEsp !== undefined && mesaEsp * 2 >= altura) {
      diag.push(criarProblema('faixa', 'mesa precisa ser menor que metade da altura', `${onde}.mesaEsp`));
    }
    if (largura !== undefined && almaEsp !== undefined && almaEsp >= largura) {
      diag.push(criarProblema('faixa', 'alma precisa ser menor que a largura', `${onde}.almaEsp`));
    }
  }
}
