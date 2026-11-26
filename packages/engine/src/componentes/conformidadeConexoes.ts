/*
 * Conformidade entre conexões vizinhas (fase 4, ficha F1). Folha pura (não importa nada do motor): duas peças de tubulação ligadas
 * uma na outra, sem tubo entre elas, não são aceitas, salvo se o par de categorias estiver em `paresDiretos` do tipo de tubulação.
 * Entre duas peças o tubo restante (depois dos recuos das bolsas) precisa ter ao menos `trechoMinimoEntreConexoes`. Unidades: mm.
 */

/** Categoria de peça de tubulação (as chaves de `RegrasConexao` que são peças, mais o tampão). */
export type CategoriaPeca = 'luva' | 'curva90' | 'curva45' | 'reducao' | 'te' | 'juncao45' | 'tampao';

/** Par de categorias que pode encostar sem tubo (sem ordem: [luva, curva90] vale também para curva90 e luva). */
export type ParDireto = readonly [CategoriaPeca, CategoriaPeca];

/**
 * Tubo mínimo (mm) entre duas conexões vizinhas. CONFERIR contra o fabricante/projeto; valor provisório: regra de ofício (um tubo
 * menor que isso não se corta nem se encaixa), não vem de norma nem de catálogo. É o mesmo valor que a viabilidade B2 já usava.
 */
export const TRECHO_MINIMO_ENTRE_CONEXOES = 10;

/** O que a conformidade lê de um tipo de tubulação; ausente = valor padrão e nenhum par direto. */
export interface RegraConformidade {
  trechoMinimoEntreConexoes?: number;
  paresDiretos?: readonly ParDireto[];
}

const FOLGA = 1e-6;

const ROTULO: Record<CategoriaPeca, string> = { luva: 'luva', curva90: 'joelho ou curva de 90°', curva45: 'joelho ou curva de 45°', reducao: 'redução', te: 'tê', juncao45: 'junção de 45°', tampao: 'tampão' };

/** Nome em português da categoria, para os motivos. */
export const rotuloDaCategoria = (c: CategoriaPeca): string => ROTULO[c];

export const trechoMinimoDe = (tipo?: RegraConformidade): number => tipo?.trechoMinimoEntreConexoes ?? TRECHO_MINIMO_ENTRE_CONEXOES;

/** O par pode encostar sem tubo? Só se o tipo o lista (padrão: nunca). */
export function parDiretoPermitido(tipo: RegraConformidade | undefined, a: CategoriaPeca, b: CategoriaPeca): boolean {
  return (tipo?.paresDiretos ?? []).some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Tubo (mm) que precisa existir entre as duas peças: 0 se o par é direto, senão o mínimo do tipo. */
export const lacunaMinima = (tipo: RegraConformidade | undefined, a: CategoriaPeca, b: CategoriaPeca): number => (parDiretoPermitido(tipo, a, b) ? 0 : trechoMinimoDe(tipo));

/** Peça ao longo de uma linha reta. Recuos em mm, COM sinal (negativo = a ponta do tubo entra além do centro): voltado ao início da linha e ao fim. */
export interface PecaNaLinha {
  rotulo: string;
  categoria: CategoriaPeca;
  recuoAntes: number;
  recuoDepois: number;
}

/** Posição das peças na menor linha que as conforma: a primeira em 0; entre duas, o tubo é a lacuna mínima do par. */
export function empacotarLinha(tipo: RegraConformidade | undefined, pecas: readonly PecaNaLinha[]): { centros: number[]; lacunas: number[]; fim: number } {
  const centros: number[] = [];
  const lacunas: number[] = [];
  pecas.forEach((p, i) => {
    const anterior = pecas[i - 1];
    if (!anterior) return void centros.push(0);
    const lacuna = lacunaMinima(tipo, anterior.categoria, p.categoria);
    lacunas.push(lacuna);
    centros.push((centros[i - 1] ?? 0) + anterior.recuoDepois + lacuna + p.recuoAntes);
  });
  const ultima = pecas[pecas.length - 1];
  return { centros, lacunas, fim: (centros[centros.length - 1] ?? 0) + (ultima?.recuoDepois ?? 0) };
}

/** Par de conexões coladas: `restante` é o tubo que sobra entre elas (mm) e `necessario` o que o tipo exige. */
export interface Colada {
  a: string;
  b: string;
  restante: number;
  necessario: number;
  motivo: string;
}

// units-ok: mensagem em mm por contrato do engine (a ferramenta converte de metros); não é exibição de quantidade do projeto
const mm = (v: number): string => String(Math.round(v * 10) / 10).replace('.', ',');

/** Motivo fixo de conexões coladas. */
export const motivoColadas = (a: string, b: string, minimoMm: number): string => `As conexões ${a} e ${b} ficariam coladas: o trecho entre elas precisa de pelo menos ${mm(minimoMm)} mm de tubo.`;

/** Motivo quando só uma das conexões é conhecida (o outro extremo do trecho é ponta aberta ou peça de fora do plano). */
export const motivoColada = (a: string, minimoMm: number): string => `A conexão ${a} ficaria colada: o trecho até a conexão seguinte precisa de pelo menos ${mm(minimoMm)} mm de tubo.`;

/** Primeiro par vizinho cujo tubo restante não é aceito, ou `null`. `centros` (mm) na ordem de `pecas`. */
export function conferirLinha(tipo: RegraConformidade | undefined, pecas: readonly PecaNaLinha[], centros: readonly number[]): Colada | null {
  for (let i = 1; i < pecas.length; i++) {
    const a = pecas[i - 1];
    const b = pecas[i];
    if (!a || !b) continue;
    const restante = (centros[i] ?? 0) - (centros[i - 1] ?? 0) - a.recuoDepois - b.recuoAntes;
    const necessario = trechoMinimoDe(tipo);
    const encostadas = Math.abs(restante) <= FOLGA && parDiretoPermitido(tipo, a.categoria, b.categoria);
    if (!encostadas && restante < necessario - FOLGA) return { a: a.rotulo, b: b.rotulo, restante, necessario, motivo: motivoColadas(a.rotulo, b.rotulo, necessario) };
  }
  return null;
}
