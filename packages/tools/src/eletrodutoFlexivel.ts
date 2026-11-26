import { COMPRIMENTO_MINIMO_TRECHO, desvioEntre, direcaoDaLigacao, raioMinimoMm, tangenteDoCanto, tangenteGravada, tipoSemConexoes, trechoFlexivel, trechoDeTubo, type PontoSegmento } from '@hestia/engine';
import { isComponent, newId, type Component, type Familia, type Project } from '@hestia/model';
import type { PontoTubo } from './tuboGeometria.ts';
import { motivoTrechoLongo } from './tuboViabilidade.ts';

/*
 * Traçado do eletroduto CORRUGADO (fase 4, ficha F2): cada clique cria UM trecho reto, ligado ao anterior (ou à caixa/dispositivo) por
 * ligação flexível, sem peça no canto. A direção e a cota mudam livremente de um clique ao outro (o trecho pode ser inclinado); o
 * limite é o raio mínimo de curvatura do tipo (`curvaturaFlexivel.ts`): cada canto consome `R · tan(θ / 2)` do trecho. Aqui só a conta do
 * trecho novo (prévia e clique usam a mesma, sem gravar); a ferramenta (`eletrodutoTool.ts`) grava e liga.
 */

/** Resultado no formato de `TuboTool.verificar`: a cadeia (um trecho) ou o bloqueio com motivo e sugestão calculada pela geometria. */
export interface PlanoFlexivel {
  bloqueio: { motivo: string; sugestao: string | null; naFala: boolean } | null;
  pts: PontoTubo[];
  cadeia: Array<Component | null>;
}

// units-ok: mensagem em mm por contrato do motor (as tangentes saem em mm); não é exibição de quantidade do projeto
const mm = (v: number): string => String(Math.round(v)).replace('.', ',');

/** Direção do trecho `a`→`b` (unitária); `null` se coincidem. */
function direcaoDoTrecho(a: PontoSegmento, b: PontoSegmento): [number, number, number] | null {
  const d: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const n = Math.hypot(...d);
  return n < 1e-9 ? null : [d[0] / n, d[1] / n, d[2] / n];
}

/**
 * Plano do trecho flexível `a`→`b` de `familia` (DN em mm). Bloqueia: trecho menor que o mínimo de B2; canto do início ou do fim que
 * não cabe no trecho novo (sugestão: o comprimento que cabe); canto do início que não cabe no trecho ANTERIOR (que já está gravado).
 */
export function planejarFlexivel(p: Project, familia: Familia, dn: number, levelId: string, a: PontoTubo, b: PontoTubo): PlanoFlexivel {
  const pts = [a, b];
  const trecho = trechoDeTubo(a.xyz, b.xyz, familia, dn, { id: newId('cm'), levelId });
  if (!trecho) return { bloqueio: null, pts, cadeia: [null] };
  const u = direcaoDoTrecho(a.xyz, b.xyz) as [number, number, number];
  const L = Math.hypot(b.xyz[0] - a.xyz[0], b.xyz[1] - a.xyz[1], b.xyz[2] - a.xyz[2]) * 1000;
  const bloqueia = (motivo: string, sugestao: string | null): PlanoFlexivel => ({ bloqueio: { motivo, sugestao, naFala: true }, pts, cadeia: [trecho] });
  const longo = motivoTrechoLongo(familia, a.xyz, b.xyz);
  if (longo) return bloqueia(longo, null);
  if (L < COMPRIMENTO_MINIMO_TRECHO) return bloqueia(`trecho curto demais: ${mm(L)} mm; o mínimo é ${mm(COMPRIMENTO_MINIMO_TRECHO)} mm.`, `Sugestão: aumentar o trecho para ${mm(COMPRIMENTO_MINIMO_TRECHO)} mm.`);
  const tipo = tipoSemConexoes(familia.id);
  const raio = tipo ? raioMinimoMm(tipo, familia, dn) : null;
  if (raio === null) return { bloqueio: null, pts, cadeia: [trecho] };
  // Início: a direção para fora da ligação a que `a` se liga (trecho anterior ou entrada de caixa) e a do novo trecho.
  const alvoA = a.alvo ? direcaoDaLigacao(p, a.alvo.componentId, a.alvo.ligacaoId) : null;
  const t0 = alvoA ? tangenteDoCanto(raio, desvioEntre(u, alvoA.direcaoMundo)) : 0;
  // Fim: o trecho chega à entrada de destino; reto quando chega no sentido oposto ao dela.
  const alvoB = b.alvo ? direcaoDaLigacao(p, b.alvo.componentId, b.alvo.ligacaoId) : null;
  const t1 = alvoB ? tangenteDoCanto(raio, desvioEntre(u, [-alvoB.direcaoMundo[0], -alvoB.direcaoMundo[1], -alvoB.direcaoMundo[2]])) : 0;
  // O trecho anterior já gravado também cede a tangente do canto de `a` (e já cede a do outro extremo dele).
  const anterior = a.alvo ? p.elements[a.alvo.componentId] : undefined;
  const tAnterior = isComponent(anterior) && anterior.familyId === familia.id ? trechoFlexivel(p, anterior) : null;
  if (tAnterior && alvoA) {
    const outraPonta = a.alvo?.ligacaoId === tAnterior.inicio.id ? tAnterior.fim : tAnterior.inicio;
    const livre = tAnterior.comprimento - tangenteGravada(p, tAnterior, outraPonta);
    if (t0 > livre + 0.5) return bloqueia(`canto fechado demais: o raio mínimo de curvatura (${mm(raio)} mm, provisório) pede ${mm(t0)} mm e o trecho anterior tem ${mm(livre)} mm livres.`, `Sugestão: abrir o ângulo do canto ou alongar o trecho anterior para ${mm(t0 + (tAnterior.comprimento - livre))} mm.`);
  }
  if (t0 + t1 > L + 0.5) return bloqueia(`canto fechado demais: o raio mínimo de curvatura (${mm(raio)} mm, provisório) pede ${mm(t0 + t1)} mm de trecho e há ${mm(L)} mm.`, `Sugestão: aumentar o trecho para ${mm(Math.ceil(t0 + t1))} mm.`);
  return { bloqueio: null, pts, cadeia: [trecho] };
}
