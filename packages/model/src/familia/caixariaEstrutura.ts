import { garantirCaixaria } from './caixaria.ts';
import { sincronizarCaixaria } from './caixariaCompilar.ts';
import type { Familia } from './tipos.ts';
import type {
  EstruturaCaixa,
  FundoCaixa,
  PreenchimentoVao,
  RodapeCaixa,
  TampoCaixa,
  TamponamentoCaixa,
  Vao,
} from './tiposCaixaria.ts';

const ESTRUTURAS_VALIDAS: readonly EstruturaCaixa[] = ['base_topo', 'laterais_passantes', 'sem_topo', 'aberta'];
const RODAPES_VALIDOS: readonly RodapeCaixa['tipo'][] = ['nenhum', 'recuado', 'pes'];
const FUNDOS_VALIDOS: readonly FundoCaixa['tipo'][] = ['encaixado', 'pregado', 'espesso', 'nenhum'];

function numeroFinito(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function encontrarVaoLocal(vao: Vao, vaoId: string): { vao: Vao } | null {
  if (vao.id === vaoId) return { vao };
  for (const f of vao.filhos ?? []) {
    if (!f) continue;
    const achado = encontrarVaoLocal(f, vaoId);
    if (achado) return achado;
  }
  return null;
}

function validarPreenchimento(p: PreenchimentoVao): string | null {
  if (!p || typeof p !== 'object') return 'preenchimento inválido';
  switch (p.tipo) {
    case 'nenhum':
      return null;
    case 'porta': {
      if (!['giro_1', 'giro_2', 'basculante', 'correr'].includes(p.estilo)) return 'estilo de porta inválido';
      if (p.montagem !== 'sobreposta' && p.montagem !== 'embutida') return 'montagem de porta inválida';
      if (p.folga !== undefined && (!numeroFinito(p.folga) || p.folga < 0)) return 'folga da porta inválida';
      if (p.folhasCorrer !== undefined && (!Number.isInteger(p.folhasCorrer) || p.folhasCorrer < 2 || p.folhasCorrer > 8)) {
        return 'quantidade de folhas de correr precisa estar entre 2 e 8';
      }
      return null;
    }
    case 'gavetas': {
      if (!Number.isInteger(p.quantidade) || p.quantidade < 1 || p.quantidade > 24) {
        return 'quantidade de gavetas precisa ser inteiro entre 1 e 24';
      }
      if (p.montagem !== 'sobreposta' && p.montagem !== 'embutida') return 'montagem das gavetas inválida';
      if (p.gavetoes !== undefined && (!Number.isInteger(p.gavetoes) || p.gavetoes < 0 || p.gavetoes > p.quantidade)) {
        return 'quantidade de gavetões inválida';
      }
      if (p.folga !== undefined && (!numeroFinito(p.folga) || p.folga < 0)) return 'folga das gavetas inválida';
      return null;
    }
    case 'cabideiro': {
      if (p.alturaOffsetTopo !== undefined && (!numeroFinito(p.alturaOffsetTopo) || p.alturaOffsetTopo < 0)) {
        return 'altura do cabideiro inválida';
      }
      return null;
    }
    case 'ripado': {
      if (p.direcao !== 'vertical' && p.direcao !== 'horizontal') return 'direção do ripado inválida';
      if (!numeroFinito(p.larguraRipa) || p.larguraRipa <= 0) return 'largura da ripa precisa ser maior que zero';
      if (!numeroFinito(p.espacamento) || p.espacamento < 0) return 'espaçamento do ripado inválido';
      if (p.profundidadeRipa !== undefined && (!numeroFinito(p.profundidadeRipa) || p.profundidadeRipa <= 0)) {
        return 'profundidade da ripa precisa ser maior que zero';
      }
      return null;
    }
    case 'sapateira': {
      if (!Number.isInteger(p.quantidade) || p.quantidade < 1 || p.quantidade > 32) {
        return 'quantidade da sapateira precisa ser inteiro entre 1 e 32';
      }
      if (p.inclinacaoGraus !== undefined && (!numeroFinito(p.inclinacaoGraus) || p.inclinacaoGraus < 0 || p.inclinacaoGraus > 60)) {
        return 'inclinação da sapateira inválida';
      }
      return null;
    }
    default:
      return 'tipo de preenchimento desconhecido';
  }
}

/** Define ou remove (`tipo: 'nenhum'`) o preenchimento de um vão. */
export function preencherVao(f: Familia, vaoId: string, preenchimento: PreenchimentoVao): string | null {
  const erro = validarPreenchimento(preenchimento);
  if (erro !== null) return erro;

  const cx = garantirCaixaria(f);
  const achado = encontrarVaoLocal(cx.raiz, vaoId);
  if (!achado) return `vão “${vaoId}” não existe`;

  if (preenchimento.tipo === 'nenhum') {
    delete achado.vao.preenchimento;
  } else {
    achado.vao.preenchimento = structuredClone(preenchimento);
  }
  sincronizarCaixaria(f);
  return null;
}

/** Altera estrutura, rodapé e/ou fundo da caixaria. */
export function alterarEstruturaCaixaria(
  f: Familia,
  patch: {
    estrutura?: EstruturaCaixa;
    rodape?: Partial<RodapeCaixa>;
    fundo?: Partial<FundoCaixa>;
  },
): string | null {
  if (!patch || typeof patch !== 'object') return 'alteração inválida';
  const cx = garantirCaixaria(f);

  const novaEstrutura = patch.estrutura ?? cx.estrutura;
  if (!ESTRUTURAS_VALIDAS.includes(novaEstrutura)) return `estrutura inválida: “${String(novaEstrutura)}”`;

  const novoRodape: RodapeCaixa = { ...cx.rodape, ...patch.rodape };
  if (!RODAPES_VALIDOS.includes(novoRodape.tipo)) return `tipo de rodapé inválido: “${String(novoRodape.tipo)}”`;
  if (!numeroFinito(novoRodape.altura) || novoRodape.altura < 0) return 'altura do rodapé inválida';
  if (!numeroFinito(novoRodape.recuo) || novoRodape.recuo < 0) return 'recuo do rodapé inválido';

  const novoFundo: FundoCaixa = { ...cx.fundo, ...patch.fundo };
  if (!FUNDOS_VALIDOS.includes(novoFundo.tipo)) return `tipo de fundo inválido: “${String(novoFundo.tipo)}”`;
  if (!numeroFinito(novoFundo.espessura) || (novoFundo.tipo !== 'nenhum' && novoFundo.espessura <= 0) || novoFundo.espessura < 0) {
    return 'espessura do fundo inválida';
  }
  if (!numeroFinito(novoFundo.recuo) || novoFundo.recuo < 0) return 'recuo do fundo inválido';

  cx.estrutura = novaEstrutura;
  cx.rodape = novoRodape;
  cx.fundo = novoFundo;
  sincronizarCaixaria(f);
  return null;
}

/** Define ou remove (`null`) o tampo da caixaria. */
export function definirTampoCaixaria(f: Familia, tampo: TampoCaixa | null): string | null {
  if (tampo !== null) {
    if (!tampo || typeof tampo !== 'object') return 'tampo inválido';
    if (!numeroFinito(tampo.espessura) || tampo.espessura <= 0) return 'espessura do tampo precisa ser maior que zero';
    for (const campo of [tampo.avancoFrente, tampo.avancoEsq, tampo.avancoDir, tampo.avancoFundo]) {
      if (!numeroFinito(campo)) return 'avanço do tampo inválido';
    }
    if (tampo.espessuraMoldura !== undefined && (!numeroFinito(tampo.espessuraMoldura) || tampo.espessuraMoldura <= 0)) {
      return 'espessura da moldura inválida';
    }
    if (tampo.recorte) {
      if (!numeroFinito(tampo.recorte.largura) || tampo.recorte.largura <= 0) return 'largura do recorte inválida';
      if (!numeroFinito(tampo.recorte.profundidade) || tampo.recorte.profundidade <= 0) return 'profundidade do recorte inválida';
      if (tampo.recorte.dx !== undefined && !numeroFinito(tampo.recorte.dx)) return 'deslocamento X do recorte inválido';
      if (tampo.recorte.dy !== undefined && !numeroFinito(tampo.recorte.dy)) return 'deslocamento Y do recorte inválido';
    }
  }

  const cx = garantirCaixaria(f);
  if (tampo === null) delete cx.tampo;
  else cx.tampo = structuredClone(tampo);
  sincronizarCaixaria(f);
  return null;
}

/** Define ou remove (`null`) os tamponamentos externos da caixaria. */
export function definirTamponamentosCaixaria(f: Familia, tamponamentos: TamponamentoCaixa | null): string | null {
  if (tamponamentos !== null) {
    if (!tamponamentos || typeof tamponamentos !== 'object') return 'tamponamento inválido';
    if (tamponamentos.espessura !== undefined && (!numeroFinito(tamponamentos.espessura) || tamponamentos.espessura <= 0)) {
      return 'espessura do tamponamento precisa ser maior que zero';
    }
    if (tamponamentos.avancoFrente !== undefined && (!numeroFinito(tamponamentos.avancoFrente) || tamponamentos.avancoFrente < 0)) {
      return 'avanço frontal do tamponamento inválido';
    }
  }

  const cx = garantirCaixaria(f);
  if (tamponamentos === null) delete cx.tamponamentos;
  else cx.tamponamentos = structuredClone(tamponamentos);
  sincronizarCaixaria(f);
  return null;
}

/** Marca uma peça `cx_*` como editada manualmente para não ser sobrescrita ao sincronizar. */
export function desvincularPecaCaixaria(f: Familia, pecaId: string): void {
  const cx = garantirCaixaria(f);
  if (!pecaId.startsWith('cx_')) return;
  const lista = cx.pecasDesvinculadas ?? [];
  if (!lista.includes(pecaId)) {
    cx.pecasDesvinculadas = [...lista, pecaId];
  }
}

/** Remove `pecaId` da lista de desvinculadas e re-sincroniza a caixaria. */
export function revincularPecaCaixaria(f: Familia, pecaId: string): void {
  const cx = f.caixaria;
  if (!cx?.pecasDesvinculadas) return;
  const filtrada = cx.pecasDesvinculadas.filter((id) => id !== pecaId);
  if (filtrada.length === 0) delete cx.pecasDesvinculadas;
  else cx.pecasDesvinculadas = filtrada;
  sincronizarCaixaria(f);
}
