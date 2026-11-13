import { useState, type ReactElement } from 'react';
import { FORMAS_DE_PERFIL, PERFIS_CATALOGO, validarPerfil, type FamiliaCatalogo, type FormaDePerfil, type PerfilForma } from '@hestia/model';
import { useI18n, useT } from '../../editor/i18n.ts';
import { NumField } from '../fields.tsx';
import { FamilyHint, FamilyPair, FamilyRow, FamilySplit } from './familia/index.ts';
import { PerfilPreview } from './PerfilPreview.tsx';
import {
  PARAMETRO_MIN,
  PARAMETROS_DA_FORMA,
  comParametro,
  furosParaTexto,
  parametroDe,
  perfilParaForma,
  textoParaFuros,
  textoParaVertices,
  verticesParaTexto,
  type ParametroPerfil,
} from './perfilForm.ts';

const FORMA_KEY = {
  retangular: 'estr_shape_retangular',
  circular: 'estr_shape_circular',
  L: 'estr_shape_L',
  T: 'estr_shape_T',
  I: 'estr_shape_I',
  U: 'estr_shape_U',
  tuboRetangular: 'estr_shape_tuboRetangular',
  tuboCircular: 'estr_shape_tuboCircular',
  personalizado: 'estr_shape_personalizado',
} as const satisfies Record<FormaDePerfil, string>;

const PARAMETRO_KEY = {
  b: 'estr_f_b',
  h: 'estr_f_h',
  d: 'estr_f_d',
  tf: 'estr_f_tf',
  tw: 'estr_f_tw',
  t: 'estr_f_t',
} as const satisfies Record<ParametroPerfil, string>;

const FAMILIA_KEY = { concreto: 'estr_cat_concreto', madeira: 'estr_cat_madeira', aco: 'estr_cat_aco' } as const satisfies Record<FamiliaCatalogo, string>;
const FAMILIAS: readonly FamiliaCatalogo[] = ['concreto', 'madeira', 'aco'];

interface PerfilEditorProps {
  perfil: PerfilForma;
  onChange: (p: PerfilForma) => void;
  /** Prefixo dos ids dos campos (únicos por editor na tela). */
  idBase: string;
  /** Formas oferecidas (padrão: as 9). */
  formas?: readonly FormaDePerfil[];
}

const mesmoPerfil = (a: PerfilForma, b: PerfilForma): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Vértices e furos do perfil personalizado, em texto; só grava quando o texto é válido (o resto mostra a mensagem). */
function CamposPersonalizado({ perfil, onChange, idBase }: { perfil: Extract<PerfilForma, { forma: 'personalizado' }>; onChange: (p: PerfilForma) => void; idBase: string }): ReactElement {
  const { t } = useT();
  const [anelTxt, setAnelTxt] = useState(verticesParaTexto(perfil.anel));
  const [furosTxt, setFurosTxt] = useState(furosParaTexto(perfil.furos));
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = (): void => {
    const anel = textoParaVertices(anelTxt);
    const furos = textoParaFuros(furosTxt);
    if (anel === null || furos === null) {
      setErro(t('estr_err_vertices'));
      return;
    }
    setErro(null);
    const novo: PerfilForma = { forma: 'personalizado', anel, ...(furos.length > 0 ? { furos } : {}) };
    if (!mesmoPerfil(novo, perfil)) onChange(novo);
  };
  return (
    <>
      <FamilyRow label={t('estr_f_ring')} htmlFor={`${idBase}-anel`} title={t('estr_tt_vertices')}>
        <textarea id={`${idBase}-anel`} className="input" rows={5} value={anelTxt} onChange={(e) => setAnelTxt(e.target.value)} onBlur={confirmar} />
      </FamilyRow>
      <FamilyRow label={t('estr_f_holes')} htmlFor={`${idBase}-furos`} title={t('estr_tt_holes')}>
        <textarea id={`${idBase}-furos`} className="input" rows={3} value={furosTxt} onChange={(e) => setFurosTxt(e.target.value)} onBlur={confirmar} />
      </FamilyRow>
      <FamilyHint tone="faint">{t('estr_hint_vertices')}</FamilyHint>
      {erro ? <FamilyHint warn role="alert">{erro}</FamilyHint> : null}
    </>
  );
}

/**
 * Editor do perfil da seção (estrutura, A.2): seletor de preset do catálogo, forma (as 9, ou as que `formas` permitir),
 * os parâmetros que a forma pede e a prévia 2D. Trocar de forma completa valores válidos (`perfilParaForma`). Perfil que
 * viola as regras de A.2 mostra a mensagem de `validarPerfil` e o diálogo recusa gravar. O contorno da prévia é do kernel.
 */
export function PerfilEditor({ perfil, onChange, idBase, formas = FORMAS_DE_PERFIL }: PerfilEditorProps): ReactElement {
  const { t } = useT();
  const lang = useI18n((s) => s.lang);
  const presets = PERFIS_CATALOGO.filter((p) => formas.includes(p.perfil.forma));
  const presetAtual = presets.find((p) => mesmoPerfil(p.perfil, perfil))?.id ?? '';
  const issue = validarPerfil(perfil, lang);
  const parametros = PARAMETROS_DA_FORMA[perfil.forma];
  const campo = (nome: ParametroPerfil): ReactElement => (
    <FamilyRow key={nome} label={t(PARAMETRO_KEY[nome])} htmlFor={`${idBase}-${nome}`}>
      <NumField id={`${idBase}-${nome}`} value={parametroDe(perfil, nome)} quantity="smallLength" min={PARAMETRO_MIN} onCommit={(v) => onChange(comParametro(perfil, nome, v))} />
    </FamilyRow>
  );
  const pares: ReactElement[] = [];
  for (let i = 0; i < parametros.length; i += 2) {
    const [a, b] = [parametros[i]!, parametros[i + 1]];
    pares.push(b ? <FamilyPair key={a}>{campo(a)}{campo(b)}</FamilyPair> : campo(a));
  }
  return (
    <FamilySplit
      main={
        <>
          {presets.length > 0 && (
            <FamilyRow label={t('estr_f_preset')} htmlFor={`${idBase}-preset`} title={t('estr_tt_preset')}>
              <select id={`${idBase}-preset`} className="select" value={presetAtual} onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) onChange(structuredClone(p.perfil)); }}>
                <option value="">{t('estr_preset_none')}</option>
                {FAMILIAS.map((f) => {
                  const itens = presets.filter((p) => p.familia === f);
                  return itens.length === 0 ? null : (
                    <optgroup key={f} label={t(FAMILIA_KEY[f])}>
                      {itens.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </optgroup>
                  );
                })}
              </select>
            </FamilyRow>
          )}
          <FamilyRow label={t('estr_f_shape')} htmlFor={`${idBase}-forma`}>
            <select id={`${idBase}-forma`} className="select" value={perfil.forma} onChange={(e) => onChange(perfilParaForma(perfil, e.target.value as FormaDePerfil))}>
              {formas.map((f) => <option key={f} value={f}>{t(FORMA_KEY[f])}</option>)}
            </select>
          </FamilyRow>
          {perfil.forma === 'personalizado' ? <CamposPersonalizado perfil={perfil} onChange={onChange} idBase={idBase} /> : pares}
          {issue ? <FamilyHint warn role="alert">{issue}</FamilyHint> : null}
        </>
      }
      side={<PerfilPreview perfil={perfil} />}
    />
  );
}
