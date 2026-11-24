import { definirPerfil, editarCorpo, type Corpo, type FormaCorpo, type Perfil, type Ponto2 } from '@hestia/model';
import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { FamiliaCorpoCaminho } from './FamiliaCorpoCaminho.tsx';
import { CampoCorpo } from './FamiliaCorpoCampo.tsx';
import {
  CAMPOS_PERFIL,
  ROTULO_PERFIL,
  TIPOS_PERFIL,
  comCampo,
  criarPerfilPadrao,
  executarCorpo,
  lerCampo,
  pontosParaTexto,
  textoParaPontos,
  type TipoPerfil,
} from './familiaCorpo.ts';

/*
 * Seção "Forma" do corpo: o perfil (com seletor de tipo e campos por tipo) e as medidas de cada forma. Transição tem dois
 * perfis (A e B) e o desvio opcional. Campos de fórmula gravam pelo modelo; a recusa fica no campo.
 */

interface Props {
  corpo: Corpo;
}

export function FamiliaCorpoForma({ corpo }: Props): ReactElement {
  const { t } = useT();
  const forma = corpo.forma;
  const id = corpo.id;

  const gravarForma = (rotulo: string, campo: string, texto: string): string | null =>
    executarCorpo(rotulo, (f) => editarCorpo(f, id, { forma: comCampo(forma, campo, texto) }));

  const campo = (nome: string, rotulo: string, opcional = false): ReactElement => (
    <CampoCorpo
      key={lerCampo(forma, nome)}
      id={`fcf-${id}-${nome}`}
      rotulo={rotulo}
      valor={lerCampo(forma, nome)}
      gravar={(texto) => gravarForma('Editar medida', nome, texto)}
      opcional={opcional}
    />
  );

  switch (forma.tipo) {
    case 'extrusao':
      return (
        <>
          <PerfilEditor corpoId={id} titulo={t('fam_corpo_perfil')} perfil={forma.perfil} />
          <div className="fam-grp"><div className="fam-gh">{t('fam_corpo_medidas')}</div>
            {campo('comprimento', t('fam_corpo_comprimento'))}
          </div>
        </>
      );
    case 'revolucao':
      return (
        <>
          <PerfilEditor corpoId={id} titulo={t('fam_corpo_perfil')} perfil={forma.perfil} />
          <div className="fam-grp"><div className="fam-gh">{t('fam_corpo_medidas')}</div>
            {campo('angulo', t('fam_corpo_angulo'))}
            {campo('afastamento', 'afastamento', true)}
            {campo('segmentos', 'segmentos', true)}
          </div>
        </>
      );
    case 'varredura':
      return (
        <>
          <PerfilEditor corpoId={id} titulo={t('fam_corpo_perfil')} perfil={forma.perfil} />
          <div className="fam-grp">
            <FamiliaCorpoCaminho corpoId={id} caminho={forma.caminho} />
            <CampoCorpo
              key={forma.caminho.segmentosPorCurva ?? ''}
              id={`fcf-${id}-segmentosPorCurva`}
              rotulo="segmentosPorCurva"
              valor={forma.caminho.segmentosPorCurva ?? ''}
              opcional
              gravar={(texto) => executarCorpo('Editar segmentos da curva', (f) => editarCorpo(f, id, {
                forma: { ...forma, caminho: comCampo(forma.caminho, 'segmentosPorCurva', texto) },
              }))}
            />
          </div>
        </>
      );
    case 'transicao':
      return <TransicaoEditor corpoId={id} forma={forma} />;
  }
}

function TransicaoEditor({ corpoId, forma }: { corpoId: string; forma: Extract<FormaCorpo, { tipo: 'transicao' }> }): ReactElement {
  const { t } = useT();
  const desvio = forma.desvio;

  const gravarDesvio = (eixo: 0 | 1, texto: string): string | null => {
    const par: [string, string] = [desvio?.[0] ?? '', desvio?.[1] ?? ''];
    par[eixo] = texto;
    const novo: Ponto2 | undefined = par[0].trim() === '' && par[1].trim() === '' ? undefined : [par[0] || '0', par[1] || '0'];
    const novaForma: FormaCorpo = {
      tipo: 'transicao',
      perfilA: forma.perfilA,
      perfilB: forma.perfilB,
      comprimento: forma.comprimento,
      ...(novo === undefined ? {} : { desvio: novo }),
    };
    return executarCorpo('Editar desvio', (f) => editarCorpo(f, corpoId, { forma: novaForma }));
  };

  return (
    <>
      <PerfilEditor corpoId={corpoId} lado="A" titulo={t('fam_corpo_perfil_a')} perfil={forma.perfilA} />
      <PerfilEditor corpoId={corpoId} lado="B" titulo={t('fam_corpo_perfil_b')} perfil={forma.perfilB} />
      <div className="fam-grp"><div className="fam-gh">{t('fam_corpo_medidas')}</div>
        <CampoCorpo key={forma.comprimento} id={`fcf-${corpoId}-comprimento`} rotulo={t('fam_corpo_comprimento')} valor={forma.comprimento} gravar={(texto) => executarCorpo('Editar medida', (f) => editarCorpo(f, corpoId, { forma: comCampo(forma, 'comprimento', texto) }))} />
        <CampoCorpo key={desvio?.[0] ?? ''} id={`fcf-${corpoId}-desvioX`} rotulo={`${t('fam_corpo_desvio')} x`} valor={desvio?.[0] ?? ''} opcional gravar={(texto) => gravarDesvio(0, texto)} />
        <CampoCorpo key={desvio?.[1] ?? ''} id={`fcf-${corpoId}-desvioY`} rotulo={`${t('fam_corpo_desvio')} y`} valor={desvio?.[1] ?? ''} opcional gravar={(texto) => gravarDesvio(1, texto)} />
      </div>
    </>
  );
}

interface PerfilProps {
  corpoId: string;
  titulo: string;
  perfil: Perfil;
  /** Lado do perfil na transição ('A' ou 'B'); ausente nas outras formas. */
  lado?: 'A' | 'B';
}

/** Perfil com seletor de tipo e os campos do tipo; o polígono edita a lista de pontos. */
function PerfilEditor({ corpoId, titulo, perfil, lado }: PerfilProps): ReactElement {
  const { t } = useT();
  const prefixo = `fcp-${corpoId}-${lado ?? 'p'}`;

  const trocarTipo = (tipo: TipoPerfil): void => {
    if (tipo === perfil.tipo) return;
    executarCorpo('Trocar perfil', (f) => definirPerfil(f, corpoId, criarPerfilPadrao(tipo), lado));
  };

  const gravarCampo = (nome: string, texto: string): string | null =>
    executarCorpo('Editar perfil', (f) => definirPerfil(f, corpoId, comCampo(perfil, nome, texto), lado));

  const gravarPontos = (texto: string): string | null => {
    const pontos = textoParaPontos(texto);
    if (typeof pontos === 'string') return pontos;
    return executarCorpo('Editar pontos do perfil', (f) => definirPerfil(f, corpoId, { tipo: 'poligono', pontos }, lado));
  };

  return (
    <div className="fam-grp">
      <div className="fam-gh">{titulo}</div>
      <div className="fam-row"><label htmlFor={`${prefixo}-tipo`}>{t('fam_corpo_tipo_perfil')}</label>
        <select id={`${prefixo}-tipo`} className="fam-f" value={perfil.tipo} onChange={(e) => trocarTipo(e.target.value as TipoPerfil)}>
          {TIPOS_PERFIL.map((tipo) => <option key={tipo} value={tipo}>{t(ROTULO_PERFIL[tipo])}</option>)}
        </select>
      </div>
      {CAMPOS_PERFIL[perfil.tipo].map((nome) => (
        <CampoCorpo
          key={`${nome}:${lerCampo(perfil, nome)}`}
          id={`${prefixo}-${nome}`}
          rotulo={nome}
          valor={lerCampo(perfil, nome)}
          opcional={nome === 'segmentos' || nome === 'raio'}
          gravar={(texto) => gravarCampo(nome, texto)}
        />
      ))}
      {perfil.tipo === 'poligono' && (
        <CampoCorpo
          key={pontosParaTexto(perfil.pontos)}
          id={`${prefixo}-pontos`}
          rotulo="pontos"
          valor={pontosParaTexto(perfil.pontos)}
          formula={false}
          gravar={gravarPontos}
        />
      )}
      {perfil.tipo === 'poligono' && <div className="fam-hint">{t('fam_corpo_pontos_poligono')}</div>}
    </div>
  );
}
