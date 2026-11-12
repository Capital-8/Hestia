import { cotaDeCorteCortina, sNaParede, type ItemSubelementoCortina, type ParedeSubelementos } from '@hestia/engine';
import { isCurtainType, isWall, newId, type Id, type Project, type Wall } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { ToolBase } from './base.ts';
import { fmtNumLang } from './i18n.ts';
import { hostUnder } from './infer.ts';
import type { PointerInfo } from './types.ts';

/** Eixo da linha: U (vertical na planta, ao longo da parede) ou V (horizontal, na altura). */
export type EixoGrade = 'u' | 'v';

/** Tolerância (px) para casar a posição com uma linha ou borda existente, e a folga de cada lado da prévia (m). */
const PIXELS_CASAMENTO = 8;
const MARGEM_PREVIA = 0.15;
/** Distância (m) abaixo da qual duas linhas do mesmo eixo são a mesma (duplicata). */
const TOL_DUPLICATA = 1e-3;
/** Tolerância (m) para considerar a linha fora do vão (encostada numa borda). */
const TOL_VAO = 1e-6;

/**
 * Encaixe na grade do projeto ao longo da parede: a grade vale para a coordenada X ou Y dominante da parede (o eixo do
 * desenho), medida no mundo. Passo 0 ou ausente: sem encaixe. Função local (o pacote tools não importa o app).
 */
export function encaixeNaGradeDaParede(s: number, a: Vec2, dir: Vec2, passo: number): number {
  if (!(passo > 0)) return s;
  const usaX = Math.abs(dir.x) >= Math.abs(dir.y);
  const k = usaX ? dir.x : dir.y;
  if (Math.abs(k) < 1e-9) return s;
  const base = usaX ? a.x : a.y;
  const grade = Math.round((base + s * k) / passo) * passo;
  return (grade - base) / k;
}

/** Encaixe na grade do projeto na altura: a grade vale para a altura absoluta (a base mais a altura). Passo 0: sem encaixe. */
export function encaixeNaAltura(altura: number, zBase: number, passo: number): number {
  if (!(passo > 0)) return altura;
  return Math.round((zBase + altura) / passo) * passo - zBase;
}

/** Posição da linha: a linha ou borda existente mais perto dentro da tolerância; sem casamento, a grade do projeto. */
export function posicaoDaLinha(valor: number, existentes: readonly number[], tolerancia: number, grade: (v: number) => number): number {
  let melhor: number | null = null;
  for (const e of existentes) {
    if (Math.abs(e - valor) <= tolerancia && (melhor === null || Math.abs(e - valor) < Math.abs(melhor - valor))) melhor = e;
  }
  return melhor ?? grade(valor);
}

interface Alvo {
  wallId: Id;
  eixo: EixoGrade;
  pos: number;
  /** Ponto da parede (planta) onde a prévia U cruza a parede. */
  ponto: Vec2;
  /** Vetor unitário da parede e a espessura do sistema (para a prévia). */
  dir: Vec2;
  profundidade: number;
  duplicada: boolean;
}

/**
 * Linha de grade extra numa parede cortina (decisão 0056, fase 2). Com a parede sob o cursor, mostra a prévia da linha:
 * vertical (eixo U, na posição ao longo da cortina) ou horizontal (eixo V, na altura). A posição casa com as linhas e
 * bordas existentes e com a grade do projeto. O clique grava `addGridLine` e deixa a linha criada selecionada como
 * subelemento. Tab alterna vertical e horizontal; Esc sai. Clique numa posição que já tem linha não duplica (mensagem).
 *
 * Na planta a altura não se lê do cursor: a horizontal usa a altura do corte (a mesma da janela na cortina). Na 3D, o
 * ponto da superfície dá a altura. A prévia visível é a da planta; na 3D a barra de status mostra a posição.
 */
export class CurtainGridLineTool extends ToolBase {
  readonly id = 'curtainGridLine' as const;
  readonly label = 'Linha de grade na cortina';
  /** Na 3D, o clique chega com o ponto da superfície; o movimento também recebe o elemento e a altura sob o cursor. */
  readonly pick3d = true;
  readonly hover3d = true;
  override get hint(): string {
    return this.t('tl_hint_curtain_gridline', { label: this.t('tl_tool_curtain_gridline') });
  }
  private eixo: EixoGrade = 'u';
  private alvo: Alvo | null = null;
  private lastPointer: PointerInfo | null = null;

  protected reset(): void {
    this.items = [];
    this.inf = null;
    this.alvo = null;
    this.lastPointer = null;
  }

  protected busy(): boolean {
    return false;
  }

  override start(): void {
    this.reset();
    this.env.setSubelemento?.(null);
    this.env.say(this.hint);
  }

  /** Esc sai da ferramenta: tira o destaque e volta à seleção. */
  override cancel(): void {
    this.env.setSubelemento?.(null);
    this.reset();
    this.env.done();
  }

  /** Parede cortina sob o cursor: na 3D, a que a vista destaca (com a altura da superfície); na planta, a mais perto. */
  private paredeSob(p: PointerInfo): { wall: Wall; zAbs: number | null } | null {
    const pr = this.env.project();
    if (p.hit3d !== undefined) {
      if (!p.hit3d || p.hitZ === undefined) return null;
      const w = pr.elements[p.hit3d];
      return w && isWall(w) && isCurtainType(pr.wallTypes[w.typeId]) ? { wall: w, zAbs: p.hitZ } : null;
    }
    const snapOn = this.env.options().snap?.enabled !== false;
    const host = hostUnder(p.raw, pr, this.env.levelId(), this.env.metersPerPixel(), snapOn, 16);
    const w = host ? pr.elements[host.wallId] : undefined;
    return w && isWall(w) && isCurtainType(pr.wallTypes[w.typeId]) ? { wall: w, zAbs: null } : null;
  }

  /** Posições (m) das linhas internas existentes de um eixo, com as bordas (0 e o comprimento do vão). */
  private existentes(par: ParedeSubelementos, eixo: EixoGrade): number[] {
    const A = eixo === 'u' ? par.L : par.H;
    const linhas = par.itens.flatMap((it: ItemSubelementoCortina) => (it.geo.kind === 'line' && it.geo.axis === eixo ? [it.geo.pos] : []));
    return [0, A, ...linhas];
  }

  /** Candidato do cursor para o eixo atual: posição casada (linha existente ou grade do projeto), duplicata e se cai fora do vão. */
  private candidato(pr: Project, wall: Wall, par: ParedeSubelementos, zAbs: number | null, raw: Vec2): { alvo: Alvo; fora: boolean } {
    const tol = PIXELS_CASAMENTO * this.env.metersPerPixel();
    const passo = this.env.gridStep();
    const dir: Vec2 = par.L > 0 ? { x: (par.b.x - par.a.x) / par.L, y: (par.b.y - par.a.y) / par.L } : { x: 1, y: 0 };
    const A = this.eixo === 'u' ? par.L : par.H;
    const existentes = this.existentes(par, this.eixo);
    // U: a posição é o s da parede sob o cursor; V: a altura (superfície na 3D, corte na planta), medida da base.
    const valor = this.eixo === 'u' ? sNaParede(par, raw.x, raw.y) : (zAbs !== null ? zAbs - par.zBase : cotaDeCorteCortina(pr, this.env.levelId()) - par.zBase);
    const naGrade = (v: number): number => (this.eixo === 'u' ? encaixeNaGradeDaParede(v, par.a, dir, passo) : encaixeNaAltura(v, par.zBase, passo));
    const pos = posicaoDaLinha(valor, existentes, tol, naGrade);
    const fora = pos <= TOL_VAO || pos >= A - TOL_VAO;
    const duplicada = existentes.some((e) => e > TOL_VAO && e < A - TOL_VAO && Math.abs(e - pos) < TOL_DUPLICATA);
    const sB = this.eixo === 'u' ? pos : sNaParede(par, raw.x, raw.y);
    const ponto: Vec2 = { x: par.a.x + dir.x * sB, y: par.a.y + dir.y * sB };
    return { alvo: { wallId: wall.id, eixo: this.eixo, pos, ponto, dir, profundidade: par.profundidade, duplicada }, fora };
  }

  /** Atualiza o candidato e a prévia sob o cursor. Sem parede cortina, limpa a prévia. */
  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.lastPointer = p;
    this.items = [];
    this.alvo = null;
    const pr = this.env.project();
    const sob = this.paredeSob(p);
    if (!sob) {
      this.env.say(this.hint);
      return;
    }
    const par = this.env.subelementos?.(sob.wall.id) ?? null;
    if (!par) {
      this.env.say(this.t('tl_msg_curtain_no_grid'));
      return;
    }
    const { alvo, fora } = this.candidato(pr, sob.wall, par, sob.zAbs, p.raw);
    this.alvo = alvo;
    const nome = this.eixo === 'u' ? this.t('tl_curtain_gridline_axis_u') : this.t('tl_curtain_gridline_axis_v');
    const valor = fmtNumLang(alvo.pos, 3, this.uiLang());
    if (fora) {
      this.alvo = null;
      this.env.say(this.t('tl_msg_curtain_gridline_span'));
      return;
    }
    if (alvo.duplicada) {
      this.env.say(this.t('tl_msg_curtain_gridline_dup'));
    } else {
      this.env.say(this.t('tl_msg_curtain_gridline_ready', { eixo: nome, pos: valor }));
    }
    if (this.eixo === 'u') {
      const n: Vec2 = { x: -alvo.dir.y, y: alvo.dir.x };
      const m = alvo.profundidade / 2 + MARGEM_PREVIA;
      const a = { x: alvo.ponto.x - n.x * m, y: alvo.ponto.y - n.y * m };
      const b = { x: alvo.ponto.x + n.x * m, y: alvo.ponto.y + n.y * m };
      this.items = [{ kind: 'line', a, b, dashed: alvo.duplicada, ...(alvo.duplicada ? { tone: 'invalid' as const } : {}) }];
    } else {
      this.items = [{ kind: 'point', at: p.raw }];
    }
  }

  override click(p: PointerInfo): void {
    this.move(p);
    if (this.alvo && !this.alvo.duplicada) this.criar(this.alvo);
  }

  /** Grava a linha extra (`addGridLine`) e a deixa selecionada como subelemento. Erros do modelo saem na barra de status. */
  private criar(alvo: Alvo): void {
    const id = newId('gl');
    try {
      this.env.exec({ type: 'addGridLine', wallId: alvo.wallId, line: { id, axis: alvo.eixo, pos: alvo.pos } });
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : String(e));
      return;
    }
    this.env.setSubelemento?.({ wallId: alvo.wallId, kind: 'line', line: { added: id } });
    this.env.say(this.t('tl_msg_curtain_gridline_created', { pos: fmtNumLang(alvo.pos, 3, this.uiLang()) }));
    this.alvo = null;
    this.items = [];
  }

  /** Tab alterna a linha entre vertical (U) e horizontal (V). */
  override tab(): void {
    this.eixo = this.eixo === 'u' ? 'v' : 'u';
    if (this.lastPointer) this.move(this.lastPointer);
    else this.env.say(this.hint);
  }
}
