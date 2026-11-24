import { editarCorpo, excluirCorpo, criarCorpoPadrao, type Corpo, type NivelDetalhe, type PapelCorpo, type VistaFamilia as VistaCorpo } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { FamiliaCorpoForma } from './FamiliaCorpoForma.tsx';
import { CampoCorpo } from './FamiliaCorpoCampo.tsx';
import {
  NIVEIS_CORPO,
  PAPEIS_CORPO,
  ROTULO_FORMA,
  ROTULO_PAPEL,
  ROTULO_VISTA,
  TIPOS_FORMA,
  VISTAS_CORPO,
  executarCorpo,
  quadroComEixo,
  selecionarCorpo,
  type TipoForma,
} from './familiaCorpo.ts';
import { useFamilia } from './familiaStore.ts';
import './familiaCorpo.css';

/*
 * Painel do corpo selecionado (ficha B7): identidade, quadro, material, repetição/condição, vistas, detalhe 3D e a seção
 * da forma. Cada gravação passa pelo modelo (`editarCorpo`); a recusa aparece no campo ou no aviso do painel.
 */

const ORDEM_EIXOS: Array<0 | 1 | 2> = [0, 1, 2];
const EIXO_ROTULO = ['X', 'Y', 'Z'] as const;

export function FamiliaCorpoPainel({ corpoId }: { corpoId: string }): ReactElement {
  const { t } = useT();
  const familia = useFamilia((s) => s.historico.atual);
  const corpo = familia.corpos?.find((c) => c.id === corpoId);
  const [erro, setErro] = useState<string | null>(null);

  if (corpo === undefined) return <div className="fam-hint">{t('fam_corpo_sem_selecao')}</div>;

  const aplicar = (rotulo: string, patch: Partial<Omit<Corpo, 'id'>>): string | null =>
    executarCorpo(rotulo, (f) => editarCorpo(f, corpo.id, patch));

  /** Marca ou desmarca uma opção. Tudo marcado = ausente (todas); nada marcado é recusado (o corpo sumiria). */
  const alternar = <T extends string>(lista: readonly T[], atual: readonly T[] | undefined, item: T): T[] | null => {
    const base = atual ?? lista;
    const nova = base.includes(item) ? base.filter((x) => x !== item) : [...base, item];
    if (nova.length === 0) {
      setErro(t('fam_corpo_marque_uma'));
      return null;
    }
    return nova;
  };

  const alternarVista = (v: VistaCorpo): void => {
    const nova = alternar(VISTAS_CORPO, corpo.vistas, v);
    if (nova === null) return;
    const todas = VISTAS_CORPO.every((x) => nova.includes(x));
    setErro(aplicar('Editar vistas', { vistas: todas ? undefined : nova }));
  };

  const alternarDetalhe = (n: NivelDetalhe): void => {
    const nova = alternar(NIVEIS_CORPO, corpo.detalhe3d, n);
    if (nova === null) return;
    const todos = NIVEIS_CORPO.every((x) => nova.includes(x));
    setErro(aplicar('Editar detalhe 3D', { detalhe3d: todos ? undefined : nova }));
  };

  const excluir = (): void => {
    const motivo = executarCorpo('Excluir corpo', (f) => excluirCorpo(f, corpo.id));
    if (motivo !== null) setErro(motivo);
    else selecionarCorpo(null);
  };

  const trocarForma = (tipo: TipoForma): void => {
    if (tipo === corpo.forma.tipo) return;
    setErro(aplicar('Trocar forma', { forma: criarCorpoPadrao(tipo, corpo.id).forma }));
  };

  const vistas = corpo.vistas ?? VISTAS_CORPO;
  const detalhes = corpo.detalhe3d ?? NIVEIS_CORPO;

  return (
    <div className="fam-corpo-painel">
      <div className="fam-grp">
        <div className="fam-gh">{t('fam_corpo_painel')}: {corpo.nome}</div>
        <p className="fam-hint">{t('fam_corpo_formula_dica')}</p>
        <div className="fam-corpo-acoes">
          <button type="button" className="fam-bt" title={t('fam_corpo_excluir_dica')} onClick={excluir}>{t('fam_corpo_excluir')}</button>
        </div>
        {erro !== null && <div className="fam-aviso-erro" role="alert">{erro}</div>}
      </div>

      <div className="fam-grp">
        <div className="fam-gh">{t('fam_corpo_identidade')}</div>
        <CampoCorpo key={`nome:${corpo.nome}`} id={`fcn-${corpo.id}-nome`} rotulo={t('fam_corpo_nome')} valor={corpo.nome} formula={false} gravar={(texto) => aplicar('Renomear corpo', { nome: texto })} />
        <div className="fam-row"><label htmlFor={`fcn-${corpo.id}-papel`}>{t('fam_corpo_papel')}</label>
          <select id={`fcn-${corpo.id}-papel`} className="fam-f" value={corpo.papel} onChange={(e) => setErro(aplicar('Alterar papel', { papel: e.target.value as PapelCorpo }))}>
            {PAPEIS_CORPO.map((p) => <option key={p} value={p}>{t(ROTULO_PAPEL[p])}</option>)}
          </select>
        </div>
        <div className="fam-row"><label htmlFor={`fcn-${corpo.id}-forma`}>{t('fam_corpo_forma')}</label>
          <select id={`fcn-${corpo.id}-forma`} className="fam-f" value={corpo.forma.tipo} onChange={(e) => trocarForma(e.target.value as TipoForma)}>
            {TIPOS_FORMA.map((tipo) => <option key={tipo} value={tipo}>{t(ROTULO_FORMA[tipo])}</option>)}
          </select>
        </div>
      </div>

      <FamiliaCorpoForma corpo={corpo} />

      <div className="fam-grp">
        <div className="fam-gh">{t('fam_corpo_quadro')}</div>
        {ORDEM_EIXOS.map((i) => (
          <CampoCorpo
            key={`${i}:${corpo.quadro.origem[i]}`}
            id={`fcq-${corpo.id}-origem-${i}`}
            rotulo={`${t('fam_corpo_origem')} ${EIXO_ROTULO[i]}`}
            valor={corpo.quadro.origem[i]}
            gravar={(texto) => aplicar('Editar origem', { quadro: quadroComEixo(corpo.quadro, 'origem', i, texto) })}
          />
        ))}
        {ORDEM_EIXOS.map((i) => (
          <CampoCorpo
            key={`${i}:${corpo.quadro.rotacao?.[i] ?? '0'}`}
            id={`fcq-${corpo.id}-rotacao-${i}`}
            rotulo={`${t('fam_corpo_rotacao')} ${['rx', 'ry', 'rz'][i] ?? ''}`}
            valor={corpo.quadro.rotacao?.[i] ?? '0'}
            gravar={(texto) => aplicar('Editar rotação', { quadro: quadroComEixo(corpo.quadro, 'rotacao', i, texto) })}
          />
        ))}
      </div>

      <div className="fam-grp">
        <div className="fam-gh">{t('fam_corpo_repeticao')}</div>
        <CampoCorpo key={`repetir:${corpo.repetir ?? ''}`} id={`fcn-${corpo.id}-repetir`} rotulo={t('fam_corpo_repetir')} valor={corpo.repetir ?? ''} opcional gravar={(texto) => aplicar('Editar repetir', { repetir: texto.trim() === '' ? undefined : texto })} />
        <CampoCorpo key={`quando:${corpo.quando ?? ''}`} id={`fcn-${corpo.id}-quando`} rotulo={t('fam_corpo_quando')} valor={corpo.quando ?? ''} opcional gravar={(texto) => aplicar('Editar condição', { quando: texto.trim() === '' ? undefined : texto })} />
        <CampoCorpo key={`material:${corpo.material ?? ''}`} id={`fcn-${corpo.id}-material`} rotulo={t('fam_corpo_material')} valor={corpo.material ?? ''} opcional formula={false} gravar={(texto) => aplicar('Editar material', { material: texto.trim() === '' ? undefined : texto })} />
      </div>

      <div className="fam-grp">
        <div className="fam-gh">{t('fam_corpo_vistas')}</div>
        <div className="fam-corpo-marcas">
          {VISTAS_CORPO.map((v: VistaCorpo) => (
            <label key={v}>
              <input type="checkbox" checked={vistas.includes(v)} onChange={() => alternarVista(v)} />
              {' '}{t(ROTULO_VISTA[v])}
            </label>
          ))}
        </div>
        <div className="fam-hint">{corpo.vistas === undefined ? t('fam_corpo_vistas_todas') : ''}</div>
        <div className="fam-gh">{t('fam_corpo_detalhe')}</div>
        <div className="fam-corpo-marcas">
          {NIVEIS_CORPO.map((n: NivelDetalhe) => (
            <label key={n}>
              <input type="checkbox" checked={detalhes.includes(n)} onChange={() => alternarDetalhe(n)} />
              {' '}{n}
            </label>
          ))}
        </div>
        <div className="fam-hint">{corpo.detalhe3d === undefined ? t('fam_corpo_detalhe_todos') : ''}</div>
      </div>
    </div>
  );
}
