import { dist, type Vec2 } from '@hestia/geom';
import {
  cotaDoProjeto,
  cotaExibida,
  formatQuantity,
  isTerrain,
  isTerrainRegion,
  makeTerrainRegion,
  newId,
  normalizarContorno,
  TERRENO_LIMITES,
  terrainRegionIssue,
  unitsOf,
  type Id,
  type PapelRegiaoTerreno,
  type TerrainRegion,
} from '@hestia/model';
import { ToolBase } from './base.ts';
import { cotaAbsolutaSobPonto } from './gravidade.ts';
import { contextoDeTraco, RascunhoPolilinha } from './desenhoPolilinha.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { centroDoContorno, elementoDeContornoSobPonto, terrenoSobPonto, verticesForaDoTerreno } from './terrainRegionPick.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

/** As três predefinições da ferramenta: o papel da região que ela cria (A.6). */
export type PredefinicaoRegiao = PapelRegiaoTerreno;

/** Padrões de cada predefinição (A.6): taludes de corte e aterro e se a região conta como área permeável. */
export const PADROES_REGIAO: Readonly<Record<PredefinicaoRegiao, { taludeCorte: number; taludeAterro: number; permeavel: boolean }>> = {
  subdivisao: { taludeCorte: 0, taludeAterro: 0, permeavel: true },
  plataforma: { taludeCorte: 0, taludeAterro: 0, permeavel: false },
  nivelada: { taludeCorte: 1.5, taludeAterro: 2, permeavel: false },
};

/** Valor padrão do campo "Cota" (z do projeto). */
export const COTA_REGIAO_PADRAO = 0;

const CHAVE_NOME = { subdivisao: 'tl_tn_rg_papel_subdivisao', plataforma: 'tl_tn_rg_papel_plataforma', nivelada: 'tl_tn_rg_papel_nivelada' } as const;

/**
 * Região de terreno (A.6, ficha T3): UMA ferramenta com três predefinições, que escreve só a REGIÃO (polígono e parâmetros, dado do modelo)
 * pelo comando `addTerrainRegion`. A malha, as curvas e os volumes vêm do kernel; nada é gerado aqui.
 *
 * - **Subdivisão**: papel `subdivisao`, `permeavel` true. **Plataforma**: papel `plataforma`, taludes 0, `permeavel` false. **Região nivelada**:
 *   papel `nivelada`, taludes 1,5 (corte) e 2 (aterro), `permeavel` false.
 * - O polígono nasce SOBRE um terreno: o terreno sob o primeiro clique vira `terrenoId` e a região fica no nível dele; sem terreno sob o
 *   clique, a ferramenta avisa e nada é criado. Traça pelo núcleo comum de desenho (Enter ou C fecha, Esc cancela, comprimento digitado).
 * - Vértice fora do terreno: aviso na barra de status, mas a região é criada (o kernel emite o aviso 6; a parte de fora se perde).
 * - Plataforma "Por elemento": um clique numa laje ou piso copia o contorno resolvido e usa a face inferior como cota.
 * - A "Cota" digitada vale como a EXIBIDA (`z + localizacao.cotaZero`) e passa por `cotaDoProjeto`; por dentro a ferramenta guarda o z do projeto.
 */
export class TerrainRegionTool extends ToolBase {
  readonly id = 'terrainRegion';
  readonly label = 'Região de terreno';
  private predef: PredefinicaoRegiao = 'plataforma';
  private porElementoV = false;
  /** z do projeto da cota do plano. */
  private cotaZ = COTA_REGIAO_PADRAO;
  private inclV = 0;
  private direcaoV = 0;
  private corteV = PADROES_REGIAO.plataforma.taludeCorte;
  private aterroV = PADROES_REGIAO.plataforma.taludeAterro;
  private permeavelV = PADROES_REGIAO.plataforma.permeavel;
  private r = new RascunhoPolilinha();
  /** Terreno sob o primeiro clique do polígono em traçado. */
  private terrenoId: Id | null = null;
  private ultimoCursor: Vec2 | null = null;

  // ---- estado da barra de opções ---------------------------------------------------------------------------------------------

  get predefinicao(): PredefinicaoRegiao {
    return this.predef;
  }

  /** Troca a predefinição: o papel e os padrões de taludes e permeabilidade passam a ser os dela. O polígono em traçado continua. */
  definirPredefinicao(p: PredefinicaoRegiao): void {
    this.predef = p;
    const pad = PADROES_REGIAO[p];
    this.corteV = pad.taludeCorte;
    this.aterroV = pad.taludeAterro;
    this.permeavelV = pad.permeavel;
    if (p !== 'plataforma') this.porElementoV = false;
    this.env.say(this.hint);
  }

  /** "Por elemento" (só plataforma): o clique numa laje ou piso cria a região. */
  get porElemento(): boolean {
    return this.porElementoV;
  }

  definirPorElemento(v: boolean): void {
    this.porElementoV = v && this.predef === 'plataforma';
    this.r.limpar();
    this.terrenoId = null;
    this.items = [];
    this.env.say(this.hint);
  }

  /** Cota do campo "Cota", como o usuário a vê (z do projeto mais a altitude da cota zero). */
  get cotaDoCampo(): number {
    return cotaExibida(this.env.project(), this.cotaZ);
  }

  /** z do projeto da cota corrente (o valor gravado em `cota`). */
  get cotaDoModelo(): number {
    return this.cotaZ;
  }

  definirCotaDoCampo(valor: number): boolean {
    const z = cotaDoProjeto(this.env.project(), valor);
    if (!Number.isFinite(z) || Math.abs(z) > TERRENO_LIMITES.cotaMax) {
      this.env.say(this.t('tl_tn_msg_cota_invalida'));
      return false;
    }
    this.cotaZ = z;
    return true;
  }

  /** Inclinação do plano em fração (0,02 = 2 %). */
  get inclinacao(): number {
    return this.inclV;
  }

  definirInclinacao(fracao: number): boolean {
    if (!Number.isFinite(fracao) || fracao < 0 || fracao > TERRENO_LIMITES.inclinacaoMax) {
      this.env.say(this.t('tl_tn_rg_incl_invalida'));
      return false;
    }
    this.inclV = fracao;
    return true;
  }

  /** Direção em que o plano sobe (rad, a partir de +x). */
  get direcao(): number {
    return this.direcaoV;
  }

  definirDirecao(rad: number): boolean {
    if (!Number.isFinite(rad)) return false;
    this.direcaoV = rad;
    return true;
  }

  get taludeCorte(): number {
    return this.corteV;
  }

  get taludeAterro(): number {
    return this.aterroV;
  }

  /** Talude (metros na horizontal para 1 m na vertical) de corte ou de aterro, de 0 a `taludeMax`. */
  definirTalude(qual: 'corte' | 'aterro', valor: number): boolean {
    if (!Number.isFinite(valor) || valor < 0 || valor > TERRENO_LIMITES.taludeMax) {
      this.env.say(this.t('tl_tn_rg_talude_invalido', { max: TERRENO_LIMITES.taludeMax }));
      return false;
    }
    if (qual === 'corte') this.corteV = valor;
    else this.aterroV = valor;
    return true;
  }

  get permeavel(): boolean {
    return this.permeavelV;
  }

  definirPermeavel(v: boolean): void {
    this.permeavelV = v;
  }

  /** Pontos do polígono em traçado (cópia). */
  pontosPendentes(): Vec2[] {
    return this.r.pts.map((q) => ({ ...q }));
  }

  // ---- ciclo da ferramenta -----------------------------------------------------------------------------------------------------

  override get hint(): string {
    if (this.predef === 'subdivisao') return this.t('tl_tn_rg_hint_subdivisao');
    if (this.predef === 'plataforma' && this.porElementoV) return this.t('tl_tn_rg_hint_plataforma_elemento');
    return this.t(this.predef === 'plataforma' ? 'tl_tn_rg_hint_plataforma' : 'tl_tn_rg_hint_nivelada', { cota: this.fmtCota(this.cotaZ) });
  }

  protected reset(): void {
    this.r.limpar();
    this.terrenoId = null;
    this.ultimoCursor = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.r.ativo;
  }

  private fmtLen(m: number): string {
    return formatQuantity(unitsOf(this.env.project()), 'length', m);
  }

  private fmtCota(z: number): string {
    return this.fmtLen(cotaExibida(this.env.project(), z));
  }

  private captura(p: PointerInfo): Vec2 {
    return this.snap(p, contextoDeTraco(this.r.ultimo)).point;
  }

  private atualizaPrevia(q: Vec2 | null): void {
    const itens: PreviewItem[] = [];
    const pts = this.r.pts;
    if (pts.length >= 2) itens.push({ kind: 'polygon', ring: pts, dashed: true });
    const fim = this.r.ultimo;
    if (q && fim) itens.push({ kind: 'line', a: fim, b: q, dashed: true });
    if (q) itens.push({ kind: 'point', at: q });
    this.items = itens;
  }

  override move(p: PointerInfo): void {
    const q = this.captura(p);
    this.ultimoCursor = q;
    this.atualizaPrevia(q);
  }

  /** Cota dinâmica do trecho em traçado (mesmo provedor da parede). */
  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const fim = this.r.ultimo;
    return fim && this.ultimoCursor && !this.porElementoV ? [segmentLengthDim(fim, this.ultimoCursor)] : [];
  }

  override inputPrompt(): string | null {
    return this.r.ativo ? this.t('tl_inp_length') : null;
  }

  override click(p: PointerInfo): void {
    const q = this.captura(p);
    if (this.porElementoV) {
      this.criarPorElemento(q);
      return;
    }
    if (this.r.pts.length >= 3 && dist(q, this.r.pts[0]!) <= 8 * this.env.metersPerPixel()) {
      this.concluir();
      return;
    }
    this.novoVertice(q);
    this.atualizaPrevia(q);
  }

  /** O primeiro vértice trava o terreno (sem terreno sob o clique, avisa e não começa); os seguintes só acrescentam. */
  private novoVertice(q: Vec2): void {
    if (!this.r.ativo) {
      const id = terrenoSobPonto(this.env.project(), q);
      if (!id) {
        this.env.say(this.t('tl_tn_rg_sem_terreno'));
        return;
      }
      this.terrenoId = id;
      // Gravidade (G1): a cota inicial do plano é a do terreno proposto sob o primeiro clique (absoluta, como a da região). Sem vínculo.
      const zTerreno = this.predef === 'subdivisao' ? null : cotaAbsolutaSobPonto(this.env, q.x, q.y);
      if (zTerreno !== null && Math.abs(zTerreno) <= TERRENO_LIMITES.cotaMax) this.cotaZ = zTerreno;
    }
    if (this.r.pts.length >= TERRENO_LIMITES.regiaoPontos) {
      this.env.say(this.t('tl_tn_rg_limite', { max: TERRENO_LIMITES.regiaoPontos }));
      return;
    }
    if (!this.r.adicionar(q)) return;
    const fora = verticesForaDoTerreno(this.env.project(), this.r.pts);
    this.env.say(fora > 0 ? this.t('tl_tn_rg_fora', { n: fora }) : this.t('tl_tn_rg_ponto', { n: this.r.pts.length }));
  }

  /** `C` fecha o polígono (três pontos ou mais); comprimento digitado + Enter acrescenta um ponto na direção do cursor. */
  override type(text: string): boolean {
    if (this.porElementoV) return false;
    if (text.toLowerCase() === 'c' && this.r.pts.length >= 3) {
      this.concluir();
      return true;
    }
    const q = this.r.pontoDigitado(this.env, text, this.inf, this.raw);
    if (!q) return false;
    this.novoVertice(q);
    this.ultimoCursor = null;
    this.atualizaPrevia(null);
    return true;
  }

  /** Enter: fecha e cria a região (três pontos ou mais). */
  override confirm(): void {
    if (this.r.ativo) this.concluir();
    else this.env.say(this.hint);
  }

  /** Esc: cancela o polígono em traçado; sem nada em curso, sai da ferramenta. */
  override cancel(): void {
    if (this.r.ativo) {
      this.reset();
      this.env.say(this.t('tl_tn_rg_cancelado'));
    } else this.env.done();
  }

  // ---- criação ---------------------------------------------------------------------------------------------------------------

  private nomeNovo(terrenoId: Id, papel: PapelRegiaoTerreno): string {
    const n = Object.values(this.env.project().elements).filter((e) => isTerrainRegion(e) && e.terrenoId === terrenoId && e.papel === papel).length;
    return `${this.t(CHAVE_NOME[papel])} ${n + 1}`;
  }

  /** Cria a região de `contorno` no terreno `terrenoId` (nível do terreno), com os parâmetros da predefinição. Falso, sem criar, se for inválida. */
  private criar(terrenoId: Id, contorno: Vec2[], cota: number): TerrainRegion | null {
    const p = this.env.project();
    const dono = p.elements[terrenoId];
    if (!isTerrain(dono)) return null;
    const papel = this.predef;
    const plano = papel !== 'subdivisao';
    const regiao = makeTerrainRegion({
      id: newId('rg'),
      levelId: dono.levelId,
      terrenoId,
      name: this.nomeNovo(terrenoId, papel),
      contorno: normalizarContorno(contorno),
      papel,
      cota: plano ? cota : 0,
      inclinacao: plano ? this.inclV : 0,
      direcao: plano ? this.direcaoV : 0,
      taludeCorte: this.corteV,
      taludeAterro: this.aterroV,
      permeavel: this.permeavelV,
    });
    const problema = terrainRegionIssue({ ...regiao, order: 0 }, p, this.uiLang());
    if (problema) {
      this.env.say(problema);
      return null;
    }
    this.env.transaction(this.t('tl_tn_undo_regiao'), () => this.env.exec({ type: 'addTerrainRegion', regiao }));
    const criada = this.env.project().elements[regiao.id];
    return isTerrainRegion(criada) ? criada : null;
  }

  private mensagemFinal(r: TerrainRegion, extra?: string): void {
    const fora = verticesForaDoTerreno(this.env.project(), r.contorno);
    const base = this.t('tl_tn_rg_criada', { papel: this.t(CHAVE_NOME[r.papel]) });
    this.env.say([extra, fora > 0 ? this.t('tl_tn_rg_fora', { n: fora }) : null, base].filter(Boolean).join(' '));
  }

  private concluir(): void {
    if (this.r.pts.length < 3) {
      this.env.say(this.t('tl_tn_rg_min'));
      return;
    }
    const terrenoId = this.terrenoId;
    if (!terrenoId) {
      this.env.say(this.t('tl_tn_rg_sem_terreno'));
      this.reset();
      return;
    }
    const r = this.criar(terrenoId, this.r.pts, this.cotaZ);
    if (!r) return;
    this.reset();
    this.mensagemFinal(r);
    this.env.setSelection([r.id]);
    this.env.done();
  }

  /** "Por elemento": o clique numa laje ou piso copia o contorno resolvido e usa a face inferior como cota da plataforma. */
  private criarPorElemento(q: Vec2): void {
    const p = this.env.project();
    const el = elementoDeContornoSobPonto(p, this.env.levelId(), q, this.env.metersPerPixel());
    if (!el) {
      this.env.say(this.t('tl_tn_rg_elemento_nenhum'));
      return;
    }
    const terrenoId = terrenoSobPonto(p, q) ?? terrenoSobPonto(p, centroDoContorno(el.contorno));
    if (!terrenoId) {
      this.env.say(this.t('tl_tn_rg_sem_terreno'));
      return;
    }
    const r = this.criar(terrenoId, el.contorno, el.faceInferior);
    if (!r) return;
    this.cotaZ = el.faceInferior;
    this.mensagemFinal(r, this.t('tl_tn_rg_elemento_feito', { cota: this.fmtCota(el.faceInferior) }));
    this.env.setSelection([r.id]);
    this.env.done();
  }
}
