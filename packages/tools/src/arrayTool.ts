import { len, mul, norm, sub, v2, type Vec2 } from '@hestia/geom';
import { formatQuantity, unitsOf, type ResolvedUnits } from '@hestia/model';
import { copyWalls, ghostBands, ghostViews, transformViews } from './edit.ts';
import { fmtM, SelectionTool } from './transformTools.ts';
import { parseQuantityText } from './numeric.ts';
import { arraySet, commitRadial, fmtXY, itensSobrepostos, linearStep, radialAngles, radialGhosts, rotations } from './arrayRadial.ts';
import { refuseCopiesOverlap } from './wallOverlapGuard.ts';
import type { PointerInfo } from './types.ts';

/**
 * Textos da Matriz por idioma. As ferramentas não leem o I18N do app: o idioma vem de `env.lang` (ausente = português).
 * Mensagens com valores são funções, para que a ordem das partes siga cada língua.
 */
const TEXTOS = {
  pt: {
    hintLinear: 'Matriz linear: clique no ponto base e no segundo ponto (espaçamento) — ou digite o espaçamento.',
    hintRadial: 'Matriz radial: clique no centro da matriz. Depois clique para criar os itens, ou digite o ângulo em graus.',
    /** Porta ou janela sozinha não se copia: ela depende da parede hospedeira (D3). */
    hospedeira: 'Selecione também a parede hospedeira: portas e janelas acompanham a parede.',
    /** Ângulo total 0 não gira nada: a matriz radial rejeita e mantém o último valor válido (D4). */
    anguloZero: 'O ângulo total deve ser diferente de 0°',
    centroRadial: 'Clique no centro da matriz',
    anguloGraus: 'Ângulo (graus)',
    distanciaTotal: 'Distância total',
    espacamento: 'Espaçamento',
    centroDefinido: (xy: string) => `Matriz radial: centro em (${xy}). Clique para criar os itens, ou digite o ângulo.`,
    resumoRadial: (n: number, graus: string, xy: string) => `Matriz radial: ${n} itens em ${graus}° em torno de (${xy})`,
  },
  en: {
    hintLinear: 'Linear array: click the base point and the second point (spacing), or type the spacing.',
    hintRadial: 'Radial array: click the array center. Then click to create the items, or type the angle in degrees.',
    hospedeira: 'Also select the host wall: doors and windows follow the wall.',
    anguloZero: 'The total angle must be different from 0°',
    centroRadial: 'Click the array center',
    anguloGraus: 'Angle (degrees)',
    distanciaTotal: 'Total distance',
    espacamento: 'Spacing',
    centroDefinido: (xy: string) => `Radial array: center at (${xy}). Click to create the items, or type the angle.`,
    resumoRadial: (n: number, graus: string, xy: string) => `Radial array: ${n} items at ${graus}° around (${xy})`,
  },
} as const;

/** Dica do primeiro passo de cada tipo (a barra de status usa a mesma ao trocar o tipo). */
export const arrayHint = (radial: boolean, lang: 'pt' | 'en' = 'pt'): string => (radial ? TEXTOS[lang].hintRadial : TEXTOS[lang].hintLinear);

/** Porta ou janela sozinha não se copia: ela depende da parede hospedeira (D3). */
export const AVISO_HOSPEDEIRA = TEXTOS.pt.hospedeira;

/** Aviso dos itens da radial que caíram sobre elementos existentes (a cópia é feita mesmo assim). */
const avisoSobrepostos = (itens: number[]): string =>
  itens.length === 1 ? `O item ${itens[0]} ficou sobre um elemento existente.` : `Os itens ${itens.join(', ')} ficaram sobre elementos existentes.`;

/** Ângulo em graus como número (sem a unidade), para as mensagens que já trazem o `°`. */
const angleText = (u: ResolvedUnits, deg: number): string => formatQuantity(u, 'angle', (deg * Math.PI) / 180, { withUnit: false });

/** Ângulo total 0 não gira nada: a matriz radial rejeita e mantém o último valor válido (D4). */
export const AVISO_ANGULO_ZERO = TEXTOS.pt.anguloZero;

/**
 * Matriz: linear (N elementos pelo espaçamento) ou radial (N elementos girados em torno de um centro).
 * "Mover para": Segundo leva o espaçamento/ângulo do 1º ao 2º item; Último, do 1º ao último (dividido entre os itens).
 */
export class ArrayTool extends SelectionTool {
  readonly id = 'array';
  readonly label = 'Matriz';
  /** Dica do início (base chama `say(hint)` no start): segue o idioma da interface. */
  override get hint(): string {
    return arrayHint(false, this.lang());
  }
  /** Linear: ponto base. Radial: centro da matriz. */
  private base: Vec2 | null = null;
  /** Tipo e "Mover para" em uso quando o passo começou: se a barra mudar, o passo recomeça (D1/D2). */
  private stepMode = '';

  private lang(): 'pt' | 'en' {
    return this.env.lang?.() ?? 'pt';
  }
  private radial(): boolean {
    return this.env.options().arrayKind === 'radial';
  }
  private anchor() {
    return this.env.options().arrayAnchor ?? 'second';
  }
  private count(): number {
    return Math.max(2, this.env.options().arrayCount);
  }
  private angleDeg(): number {
    return this.env.options().arrayAngle ?? 360;
  }
  private hintNow(): string {
    return arrayHint(this.radial(), this.lang());
  }
  private modeNow(): string {
    return `${this.radial()}|${this.anchor()}`;
  }
  /** Trocar o tipo ou "Mover para" no meio do passo descarta a base/centro e a prévia: o próximo clique é um primeiro passo. */
  private checkStep(): void {
    if (this.base && this.stepMode !== this.modeNow()) this.reset();
  }
  private startStep(p: Vec2): void {
    this.base = p;
    this.stepMode = this.modeNow();
  }

  protected reset(): void {
    this.base = null;
    this.items = [];
  }
  protected busy(): boolean {
    return this.base !== null;
  }
  override inputPrompt(): string | null {
    this.checkStep();
    if (!this.base) return null;
    const t = TEXTOS[this.lang()];
    if (this.radial()) return t.anguloGraus;
    return this.anchor() === 'last' ? t.distanciaTotal : t.espacamento;
  }

  override start(): void {
    super.start();
    if (this.soAberturas()) this.env.say(TEXTOS[this.lang()].hospedeira);
    else if (this.hasSelection()) this.env.say(this.hintNow());
  }

  /** Só portas ou janelas selecionadas: a Matriz copia paredes, pisos, lajes, vistas e forros, não a abertura solta. */
  private soAberturas(): boolean {
    const set = arraySet(this.env.project(), this.env.selection());
    return this.openings().length > 0 && set.els.length === 0 && set.views.length === 0 && set.ceil.length === 0;
  }

  /** Esc: cancela o centro ou o ponto base; o segundo Esc sai da ferramenta. */
  override cancel(): void {
    if (!this.busy()) {
      this.env.done();
      return;
    }
    this.reset();
    this.env.say(this.hintNow());
  }

  private ghosts(step: Vec2): void {
    const n = this.count();
    for (let i = 1; i < n; i++) {
      const t = { kind: 'translate', d: mul(step, i) } as const;
      this.items.push(...ghostBands(this.env.project(), this.movables(), t), ...ghostViews(this.env.project(), this.env.selection(), t));
    }
  }

  override move(p: PointerInfo): void {
    this.checkStep();
    this.items = [];
    if (this.radial()) return this.moveRadial(p);
    const inf = this.snap(p, { from: this.base ?? undefined });
    if (!this.base) {
      this.items.push({ kind: 'point', at: inf.point });
      return;
    }
    const d = sub(inf.point, this.base);
    this.items.push({ kind: 'line', a: this.base, b: inf.point, dashed: true });
    const step = linearStep(d, this.count(), this.anchor());
    this.ghosts(step);
    this.items.push({ kind: 'label', at: inf.point, text: `${this.count()} × ${fmtM(unitsOf(this.env.project()), len(step))}` });
  }

  /** Radial: antes do centro, mostra a dica no cursor; depois, a pré-visualização dos itens nos ângulos da barra. */
  private moveRadial(p: PointerInfo): void {
    const inf = this.snap(p, { from: this.base ?? undefined });
    if (!this.base) {
      this.items.push({ kind: 'point', at: inf.point }, { kind: 'label', at: inf.point, text: TEXTOS[this.lang()].centroRadial });
      return;
    }
    this.items.push({ kind: 'point', at: this.base }, { kind: 'line', a: this.base, b: inf.point, dashed: true });
    const angles = radialAngles(this.count(), this.angleDeg(), this.anchor());
    this.items.push(...radialGhosts(this.env, arraySet(this.env.project(), this.env.selection()), this.base, angles));
    this.items.push({ kind: 'label', at: inf.point, text: `${this.count()} × ${angleText(unitsOf(this.env.project()), this.angleDeg())}°` });
  }

  private commit(d: Vec2): void {
    if (this.soAberturas()) return this.env.say(TEXTOS[this.lang()].hospedeira);
    const n = this.count();
    const step = linearStep(d, n, this.anchor());
    if (len(step) < 1e-6) return;
    const els = this.movables();
    const views = this.views();
    // Decisão 0044: a matriz não pode criar parede em cima de outra (nem uma cópia em cima da outra).
    const passos = Array.from({ length: n - 1 }, (_, i) => ({ kind: 'translate' as const, d: mul(step, i + 1) }));
    if (els.length && refuseCopiesOverlap(this.env, els, passos)) return;
    this.env.transaction('Matriz', () => {
      for (let i = 1; i < n; i++) {
        const t = { kind: 'translate', d: mul(step, i) } as const;
        if (els.length) copyWalls(this.env, els, t);
        if (views.length) transformViews(this.env, views, t, true);
      }
    });
    this.reset();
    this.env.done();
  }

  /** Radial: copia a seleção em cada ângulo e sai, com a mensagem de resumo. */
  private applyRadial(angleDeg: number): void {
    const center = this.base;
    if (!center) return;
    const t = TEXTOS[this.lang()];
    if (Math.abs(angleDeg) < 1e-6) return this.env.say(t.anguloZero);
    if (this.soAberturas()) return this.env.say(t.hospedeira);
    const n = this.count();
    const angles = radialAngles(n, angleDeg, this.anchor());
    const p = this.env.project();
    const set = arraySet(p, this.env.selection());
    // Decisão 0044: nenhuma cópia da matriz radial pode cair em cima de uma parede.
    if (set.els.length && refuseCopiesOverlap(this.env, set.els, rotations(center, angles))) return;
    // Itens que caem sobre parede existente: o aviso sai na barra, mas a cópia é feita (só avisa, como no croqui).
    const sobre = itensSobrepostos(p, this.env.levelId(), set, center, angles);
    commitRadial(this.env, set, center, angles);
    const aviso = sobre.length ? ` ${avisoSobrepostos(sobre)}` : '';
    const msg = t.resumoRadial(n, angleText(unitsOf(p), angleDeg), fmtXY(unitsOf(p), center)) + aviso;
    this.reset();
    this.env.done();
    this.env.say(msg);
  }

  override click(p: PointerInfo): void {
    this.checkStep();
    const inf = this.snap(p, { from: this.base ?? undefined });
    if (this.radial()) {
      if (!this.base) {
        this.startStep(inf.point);
        this.env.say(TEXTOS[this.lang()].centroDefinido(fmtXY(unitsOf(this.env.project()), inf.point)));
        return;
      }
      this.applyRadial(this.angleDeg());
      return;
    }
    if (!this.base) {
      this.startStep(inf.point);
      return;
    }
    this.commit(sub(inf.point, this.base));
  }

  override type(text: string): boolean {
    this.checkStep();
    if (!this.base) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), this.radial() ? 'angle' : 'length');
    if (v === null) return false;
    if (this.radial()) {
      this.applyRadial((v * 180) / Math.PI);
      return true;
    }
    const dir = norm(sub(this.inf?.point ?? this.raw, this.base));
    this.commit(mul(len(dir) < 1e-9 ? v2(1, 0) : dir, v));
    return true;
  }
}
