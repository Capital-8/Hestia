import { useState, type ReactElement } from 'react';
import {
  camposDaForma,
  caixaMontante,
  contornoMontante,
  formatQuantity,
  montanteEmUso,
  montanteIssue,
  mullionTypesOf,
  newId,
  perfilParaForma,
  type MullionProfile,
  type MullionShape,
  type MullionType,
  type Project,
} from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { NumField, Row, TextField } from '../fields.tsx';
import { useUnits } from '../useUnits.ts';

/** Formas do montante, na ordem do seletor. */
const FORMAS: MullionShape[] = ['rect', 'round', 'L', 'trapezoid', 'corner'];
const LARGURA_PADRAO = 0.05;
const PROFUNDIDADE_PADRAO = 0.1;
const MATERIAL_PADRAO = 'mat_aluminio';

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Aba "Montantes" do tipo de parede cortina (decisão 0056, §4.2, fase 3): lista dos tipos de montante do projeto e o
 * editor do tipo escolhido. Tipo de montante é do projeto: cada alteração grava na hora, como a aba Cortina já fazia.
 */
export function AbaMontantes({ project }: { project: Project }): ReactElement {
  const { t } = useT();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const tipos = Object.values(mullionTypesOf(project));
  const atual = tipos.find((m) => m.id === escolhido) ?? tipos[0];

  /** Grava o tipo do projeto. Devolve false, com o motivo na aba, quando o comando recusa. */
  const gravar = (mt: MullionType): boolean => {
    try {
      editor.store.exec({ type: 'upsertMullionType', mullionType: mt }, 'undo_edit_wall_type');
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagem(e));
      return false;
    }
  };

  if (!atual) return <p className="hint">{t('pct_mullion_none')}</p>;

  const materialNovo = project.materials[MATERIAL_PADRAO] ? MATERIAL_PADRAO : (Object.keys(project.materials)[0] ?? MATERIAL_PADRAO);
  const criar = (): void => {
    const id = newId('mul');
    const novo: MullionType = {
      id,
      name: t('pct_mullion_new_name', { n: tipos.length + 1 }),
      profile: { shape: 'rect', width: LARGURA_PADRAO, depth: PROFUNDIDADE_PADRAO },
      materialId: materialNovo,
    };
    if (gravar(novo)) setEscolhido(id);
  };
  const duplicar = (): void => {
    const id = newId('mul');
    const copia: MullionType = { ...atual, id, name: t('pct_mullion_copy_name', { nome: atual.name }), profile: { ...atual.profile } };
    if (gravar(copia)) setEscolhido(id);
  };
  const excluir = (): void => {
    try {
      editor.store.exec({ type: 'deleteMullionType', id: atual.id });
      setErro(null);
      setEscolhido(null);
    } catch (e) {
      setErro(mensagem(e));
    }
  };
  /** Altera campos da seção. Redondo mantém profundidade = largura (§4.2). */
  const alterarPerfil = (patch: Partial<MullionProfile>): void => {
    const perfil: MullionProfile = { ...atual.profile, ...patch };
    gravar({ ...atual, profile: perfil.shape === 'round' ? { ...perfil, depth: perfil.width } : perfil });
  };

  const campos = camposDaForma(atual.profile.shape);
  const emUso = montanteEmUso(project, atual.id);
  const rotulo: Record<MullionShape, string> = {
    rect: t('pct_shape_rect'),
    round: t('pct_shape_round'),
    L: t('pct_shape_l'),
    trapezoid: t('pct_shape_trapezoid'),
    corner: t('pct_shape_corner'),
  };

  return (
    <div className="split">
      <div style={{ minWidth: 0 }}>
        <h3 className="wsched-h">{t('pct_mullion_list')}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tipos.map((mt) => (
            <button
              key={mt.id}
              type="button"
              className={`btn small${mt.id === atual.id ? ' primary' : ''}`}
              aria-pressed={mt.id === atual.id}
              style={{ textAlign: 'left' }}
              onClick={() => setEscolhido(mt.id)}
            >
              {mt.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className="btn small" onClick={criar}>{t('pct_mullion_new')}</button>
          <button type="button" className="btn small" onClick={duplicar}>{t('pct_mullion_duplicate')}</button>
          <button type="button" className="btn small danger" onClick={excluir} disabled={emUso}>{t('pct_mullion_delete')}</button>
        </div>
        {emUso && <p className="hint">{t('pct_mullion_in_use')}</p>}
        {erro && <p className="hint" role="alert">{erro}</p>}
      </div>

      <div style={{ minWidth: 0 }}>
        <Row label={t('pct_mullion_name')} htmlFor="mm-nome">
          <TextField id="mm-nome" value={atual.name} onCommit={(v) => {
            const nome = v.trim();
            if (nome && nome !== atual.name) gravar({ ...atual, name: nome });
          }} />
        </Row>
        <Row label={t('pct_shape')} htmlFor="mm-forma">
          <select id="mm-forma" className="select" value={atual.profile.shape} onChange={(e) => gravar({ ...atual, profile: perfilParaForma(atual.profile, e.target.value as MullionShape) })}>
            {FORMAS.map((f) => (
              <option key={f} value={f}>{rotulo[f]}</option>
            ))}
          </select>
        </Row>
        <Row label={atual.profile.shape === 'round' ? t('pct_mullion_diameter') : t('pct_width')} htmlFor="mm-largura">
          <NumField id="mm-largura" value={atual.profile.width} quantity="smallLength" min={0.001} onCommit={(v) => alterarPerfil({ width: v })} />
        </Row>
        {campos.profundidade && (
          <Row label={t('pct_depth')} htmlFor="mm-prof">
            <NumField id="mm-prof" value={atual.profile.depth} quantity="smallLength" min={0.001} onCommit={(v) => alterarPerfil({ depth: v })} />
          </Row>
        )}
        {campos.espessura && (
          <Row label={t('pct_mullion_thickness')} htmlFor="mm-esp">
            <NumField id="mm-esp" value={atual.profile.thickness ?? 0} quantity="smallLength" min={0.0001} onCommit={(v) => alterarPerfil({ thickness: v })} />
          </Row>
        )}
        {campos.larguraFaceInterna && (
          <Row label={t('pct_mullion_width_back')} htmlFor="mm-wb">
            <NumField id="mm-wb" value={atual.profile.widthBack ?? atual.profile.width} quantity="smallLength" min={0.0001} onCommit={(v) => alterarPerfil({ widthBack: v })} />
          </Row>
        )}
        <Row label={t('pct_mullion_offset')} htmlFor="mm-desl">
          <NumField id="mm-desl" value={atual.offset ?? 0} quantity="smallLength" decimals={3} onCommit={(v) => gravar({ ...atual, offset: v })} />
        </Row>
        <Row label={t('pct_mullion_material')} htmlFor="mm-mat">
          <select id="mm-mat" className="select" value={atual.materialId} onChange={(e) => gravar({ ...atual, materialId: e.target.value })}>
            {Object.values(project.materials).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Row>
        <PrevisaoMontante mt={atual} materiais={project.materials} />
      </div>
    </div>
  );
}

/**
 * Prévia 2D da seção (SVG, escala automática): contorno do tipo como está gravado, eixos do sistema e as faces.
 * Com medida inválida mostra o motivo, em vez de desenhar um contorno quebrado.
 */
export function PrevisaoMontante({ mt, materiais }: { mt: MullionType; materiais: Project['materials'] }): ReactElement {
  const { t, lang } = useT();
  const units = useUnits();
  const erro = montanteIssue(mt, lang);
  if (erro) return <p className="hint" role="alert">{erro}</p>;
  const W = 260;
  const H = 210;
  const pad = 36;
  const aneis = contornoMontante(mt.profile);
  const caixa = caixaMontante(aneis);
  const k = Math.min((W - pad * 2) / (caixa.maxX - caixa.minX), (H - pad * 2) / (caixa.maxY - caixa.minY));
  const X = (x: number): number => W / 2 + x * k;
  const Y = (y: number): number => H / 2 - y * k;
  const caminho = aneis.map((anel) => `M${anel.map(([x, y]) => `${X(x)} ${Y(y)}`).join('L')}Z`).join('');
  const cor = materiais[mt.materialId]?.color ?? '#9aa3ad';
  const { width, depth } = mt.profile;
  const medidas = mt.profile.shape === 'round'
    ? formatQuantity(units, 'smallLength', width)
    : `${formatQuantity(units, 'smallLength', width)} × ${formatQuantity(units, 'smallLength', depth)}`;
  return (
    <div>
      <svg className="section-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('pct_mullion_section')}>
        <path d={`M0 ${H / 2}H${W}M${W / 2} 0V${H}`} stroke="var(--fg-faint)" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
        <path d={caminho} fill={cor} fillOpacity="0.55" fillRule="evenodd" stroke="var(--fg)" strokeWidth="0.8" />
        <text x={W / 2} y={Y(caixa.maxY) - 6} textAnchor="middle" fontSize="10" fill="var(--fg-faint)" fontFamily="var(--font-ui)">{t('pct_mullion_outer')}</text>
        <text x={W / 2} y={Y(caixa.minY) + 14} textAnchor="middle" fontSize="10" fill="var(--fg-faint)" fontFamily="var(--font-ui)">{t('pct_mullion_inner')}</text>
      </svg>
      <p className="hint" style={{ textAlign: 'center' }}>{medidas}</p>
    </div>
  );
}
