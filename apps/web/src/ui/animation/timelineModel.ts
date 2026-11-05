import type { CameraKeyframe } from '@hestia/render';

/**
 * Lógica pura da linha do tempo do Estúdio de animação. Nada aqui toca no DOM, no store ou no
 * relógio: a componente converte pixels em segundos, testa alvos e desenha; estas funções só fazem
 * as contas. Todas devolvem valores finitos mesmo com entrada inválida, porque a timeline é usada
 * durante arrastes e o navegador pode mandar coordenadas quebradas.
 */

/** Intervalo de tempo em segundos. */
export interface TimeRange {
  start: number;
  end: number;
}

/** Trecho visível da timeline: intervalo de tempo e largura da pista em pixels. */
export interface TimelineView extends TimeRange {
  width: number;
}

export interface SnapOptions {
  /** Quadros por segundo; ausente ou <= 0 desliga o encaixe em quadros. */
  fps?: number;
  /** Tempos candidatos (playhead, bordas, outros keyframes), em segundos. */
  alvos?: readonly number[];
  /** Distância máxima para aceitar um candidato, em segundos. */
  tolerancia?: number;
}

/** Menor trecho visível (segundos) para o zoom não colapsar a régua. */
export const MIN_VISIBLE_SPAN = 0.1;

const finitoOu = (n: number, padrao: number): number => (Number.isFinite(n) ? n : padrao);
const limitar = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Converte um tempo (s) em posição horizontal (px). Fora do trecho visível devolve valores fora de
 * `[0, width]`, de propósito: o desenho decide o que recortar.
 */
export function timeToX(t: number, view: TimelineView): number {
  const span = view.end - view.start;
  const largura = finitoOu(view.width, 0);
  if (!Number.isFinite(span) || span <= 0 || largura <= 0) return 0;
  const tempo = finitoOu(t, view.start);
  return ((tempo - view.start) / span) * largura;
}

/** Inverso de `timeToX`; devolve o início do trecho quando a pista ainda não foi medida. */
export function xToTime(x: number, view: TimelineView): number {
  const span = view.end - view.start;
  const largura = finitoOu(view.width, 0);
  if (!Number.isFinite(span) || span <= 0 || largura <= 0) return finitoOu(view.start, 0);
  return view.start + (finitoOu(x, 0) / largura) * span;
}

/**
 * Normaliza o trecho visível para dentro de `[0, duration]`, garantindo um vão mínimo. É usado ao
 * mudar a duração, ao ajustar o zoom e ao deslocar a régua: assim nenhuma conta posterior divide
 * por zero nem mostra tempo negativo.
 */
export function visibleRange(duration: number, start: number, end: number, minSpan = MIN_VISIBLE_SPAN): TimeRange {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (dur === 0) return { start: 0, end: 0 };
  const minimo = Math.min(
    Math.max(1e-9, Number.isFinite(minSpan) && minSpan > 0 ? minSpan : MIN_VISIBLE_SPAN),
    dur,
  );
  const a0 = finitoOu(start, 0);
  const b0 = finitoOu(end, dur);
  let a = limitar(a0, 0, dur - minimo);
  let b = limitar(b0, a + minimo, dur);
  if (b - a < minimo) {
    if (a + minimo <= dur) b = a + minimo;
    else {
      a = dur - minimo;
      b = dur;
    }
  }
  return { start: a, end: b };
}

/** Limita o tempo de um keyframe a `[0, duration]`; entrada inválida vira 0. */
export function clampKeyframeTime(t: number, duration: number): number {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  return limitar(finitoOu(t, 0), 0, dur);
}

/**
 * Arredonda o tempo para o quadro mais próximo (`1/fps`) ou, se estiver perto de um candidato
 * (playhead, outro keyframe, borda), encaixa nele. Os candidatos vencem o quadro: é o que dá a
 * sensação de ímã ao arrastar um keyframe sobre o playhead.
 */
export function snapTime(t: number, opcoes: SnapOptions = {}): number {
  const bruto = finitoOu(t, 0);
  const tolerancia = Math.max(0, finitoOu(opcoes.tolerancia ?? 0, 0));
  let melhor: number | null = null;
  let distancia = Infinity;
  for (const candidato of opcoes.alvos ?? []) {
    if (!Number.isFinite(candidato)) continue;
    const d = Math.abs(candidato - bruto);
    if (d <= tolerancia && d < distancia) {
      melhor = candidato;
      distancia = d;
    }
  }
  if (melhor !== null) return melhor;

  const fps = finitoOu(opcoes.fps ?? 0, 0);
  if (fps > 0) {
    const quadro = Math.round(bruto * fps) / fps;
    return Number.isFinite(quadro) ? quadro : bruto;
  }
  return bruto;
}

/**
 * Devolve o id do keyframe sob o ponteiro (ou `null`). O teste é só horizontal, com raio em
 * pixels: a faixa da câmera é baixa e o losango é o alvo visual, não a caixa inteira.
 */
export function hitKeyframe(
  x: number,
  keyframes: readonly CameraKeyframe[],
  view: TimelineView,
  raioPx = 8,
): string | null {
  if (!Number.isFinite(x) || keyframes.length === 0) return null;
  const raio = Number.isFinite(raioPx) ? Math.max(0, raioPx) : 8;
  let melhor: string | null = null;
  let distancia = raio + 1e-9;
  for (const k of keyframes) {
    const d = Math.abs(timeToX(k.t, view) - x);
    if (d <= raio && d < distancia) {
      melhor = k.id;
      distancia = d;
    }
  }
  return melhor;
}

/**
 * Formata segundos como `m:ss.d` (ou com mais casas quando o zoom pede). Com `fps`, acrescenta o
 * número do quadro, que é o que a régua e o cabeçalho mostram.
 */
export function formatTime(t: number, fps = 0, casas = 1): string {
  const seg = Math.max(0, finitoOu(t, 0));
  const decimais = limitar(Math.round(finitoOu(casas, 1)), 0, 3);
  const fator = 10 ** decimais;
  const total = Math.round(seg * fator);
  const porMinuto = 60 * fator;
  const minutos = Math.floor(total / porMinuto);
  const resto = total % porMinuto;
  const segundos = Math.floor(resto / fator);
  const fracao = resto % fator;
  const base = `${minutos}:${String(segundos).padStart(2, '0')}${decimais > 0 ? `.${String(fracao).padStart(decimais, '0')}` : ''}`;
  return Number.isFinite(fps) && fps > 0 ? `${base} · ${frameAt(seg, fps)}f` : base;
}

/** Quadro correspondente ao tempo; sem fps válido assume 30. */
export function frameAt(t: number, fps: number): number {
  const taxa = Number.isFinite(fps) && fps > 0 ? fps : 30;
  return Math.round(Math.max(0, finitoOu(t, 0)) * taxa);
}

/**
 * Aplica zoom horizontal em torno de uma âncora (segundos), mantendo a posição relativa dela.
 * O resultado nunca sai de `[0, duration]` nem fica menor que `MIN_VISIBLE_SPAN`.
 */
export function zoomRange(view: TimeRange, duration: number, fator: number, ancora: number): TimeRange {
  const atual = visibleRange(duration, view.start, view.end);
  const dur = atual.end - atual.start;
  if (!Number.isFinite(fator) || fator <= 0 || dur <= 0) return atual;
  const duracao = Number.isFinite(duration) && duration > 0 ? duration : dur;
  const minimo = Math.min(MIN_VISIBLE_SPAN, duracao);
  const novaDuracao = Math.max(minimo, Math.min(duracao, dur / fator));
  const alvo = Number.isFinite(ancora) ? ancora : (atual.start + atual.end) / 2;
  const fracao = (alvo - atual.start) / dur;
  const inicio = alvo - fracao * novaDuracao;
  return visibleRange(duracao, inicio, inicio + novaDuracao);
}

/**
 * Passo "bonito" da régua (1, 2, 5 × 10ⁿ segundos) para que os rótulos fiquem com pelo menos
 * `minLabelPx` entre si. Evita tanto amontoar texto quanto mostrar um único traço na tela.
 */
export function chooseTickStep(pxPerSecond: number, minLabelPx = 72): number {
  const px = Number.isFinite(pxPerSecond) && pxPerSecond > 0 ? pxPerSecond : 1;
  const minimo = Number.isFinite(minLabelPx) && minLabelPx > 0 ? minLabelPx : 72;
  const bruto = minimo / px;
  const expoente = Math.floor(Math.log10(Math.max(bruto, 1e-9)));
  const base = 10 ** expoente;
  const escala = bruto / base;
  const passo = escala <= 1 ? 1 : escala <= 2 ? 2 : escala <= 5 ? 5 : 10;
  return passo * base;
}

/**
 * Tempos dos traços da régua dentro do trecho visível, em múltiplos exatos do passo (sem acumular
 * erro de ponto flutuante). `limite` protege contra zoom absurdo.
 */
export function ticksBetween(view: TimelineView, step: number, limite = 500): number[] {
  const passo = Number.isFinite(step) && step > 0 ? step : 1;
  const lista: number[] = [];
  const primeiro = Math.ceil(finitoOu(view.start, 0) / passo - 1e-9);
  const ultimo = Math.floor(finitoOu(view.end, 0) / passo + 1e-9);
  for (let i = primeiro; i <= ultimo && lista.length < limite; i++) {
    const t = i * passo;
    if (t >= -1e-9) lista.push(Math.abs(t) < 1e-12 ? 0 : t);
  }
  return lista;
}

/** Traços menores em cada quadro, só quando há espaço suficiente (`minPx` por quadro). */
export function frameTicks(view: TimelineView, fps: number, minPx = 7, limite = 400): number[] {
  const taxa = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const passo = 1 / taxa;
  const pxPorSegundo = finitoOu(view.width, 0) / Math.max(1e-9, view.end - view.start);
  if (pxPorSegundo * passo < minPx) return [];
  return ticksBetween(view, passo, limite);
}

/**
 * Tempos que funcionam como ímã ao arrastar: bordas, playhead (opcional) e os outros keyframes.
 * O keyframe em arraste fica de fora para não grudar na própria posição de origem.
 */
export function snapTargets(
  duration: number,
  playhead: number,
  keyframes: readonly CameraKeyframe[],
  excluir: string | null = null,
  incluirPlayhead = false,
): number[] {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const alvos: number[] = [0, dur];
  if (incluirPlayhead && Number.isFinite(playhead)) alvos.push(playhead);
  for (const k of keyframes) {
    if (k.id !== excluir && Number.isFinite(k.t)) alvos.push(k.t);
  }
  return alvos;
}

/** Hora solar decimal (0..24) no tempo `t`, interpolando o intervalo configurado. */
export function solarHourAt(startHour: number, endHour: number, t: number, duration: number): number {
  const inicio = finitoOu(startHour, 0);
  let fim = finitoOu(endHour, 0);
  // Intervalo que cruza a meia-noite (20h → 4h) soma 24h ao fim para a interpolação não voltar
  // pelo meio-dia.
  if (fim < inicio) fim += 24;
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 1;
  const u = limitar(finitoOu(t, 0) / dur, 0, 1);
  const h = inicio + (fim - inicio) * u;
  return ((h % 24) + 24) % 24;
}

/** Formata a hora solar como `08h`, `08:30h` ou `00h`. */
export function formatHour(h: number): string {
  const total = Math.round((((finitoOu(h, 0) % 24) + 24) % 24) * 60) % (24 * 60);
  const hora = Math.floor(total / 60);
  const minuto = total % 60;
  return `${String(hora).padStart(2, '0')}${minuto > 0 ? `:${String(minuto).padStart(2, '0')}` : ''}h`;
}

/** Hora solar já formatada para o tempo da sequência. */
export function formatSolarHour(startHour: number, endHour: number, t: number, duration: number): string {
  return formatHour(solarHourAt(startHour, endHour, t, duration));
}

export interface SolarHourTick {
  t: number;
  hora: number;
}

/**
 * Marcas de hora inteira na faixa do sol. Funciona também com intervalo que cruza a meia-noite
 * (20h → 4h): a lista sai ordenada pelo tempo, não pelo número da hora.
 */
export function solarHourTicks(
  startHour: number,
  endHour: number,
  duration: number,
  view: TimeRange,
  limite = 48,
): SolarHourTick[] {
  const inicio = finitoOu(startHour, 0);
  let fim = finitoOu(endHour, 0);
  if (fim < inicio) fim += 24;
  const faixa = fim - inicio;
  if (!Number.isFinite(faixa) || faixa < 1e-9) return [];
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 1;
  const lista: SolarHourTick[] = [];
  for (let h = Math.ceil(inicio - 1e-9); h <= fim + 1e-9 && lista.length < limite; h++) {
    const t = ((h - inicio) / faixa) * dur;
    const hora = ((h % 24) + 24) % 24;
    if (t >= view.start - 1e-6 && t <= view.end + 1e-6) lista.push({ t: Math.abs(t) < 1e-12 ? 0 : t, hora });
  }
  return lista;
}
