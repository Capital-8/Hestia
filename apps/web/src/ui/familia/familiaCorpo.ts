import {
  adicionarCorpo,
  criarCorpoPadrao,
  type Corpo,
  type Familia,
  type FormaCorpo,
  type NivelDetalhe,
  type PapelCorpo,
  type Perfil,
  type Ponto2,
  type Ponto3,
  type VistaFamilia as VistaCorpo,
} from '@hestia/model';
import type { useT } from '../../editor/i18n.ts';
import { create } from 'zustand';
import { useFamilia } from './familiaStore.ts';

/*
 * Apoio da UI dos CORPOS (ficha B7): constantes de tipos, texto ↔ campo, id novo, seleção do corpo e a criação pela faixa.
 * As operações de edição do modelo (`editarCorpo`, `definirPerfil`, …) são chamadas pelos componentes dentro de
 * `useFamilia.executar`, que grava no histórico e devolve a recusa em português. Tudo aqui é puro, exceto o store de seleção.
 */

export type TipoForma = FormaCorpo['tipo'];
export type TipoPerfil = Perfil['tipo'];
export type ChaveI18n = Parameters<ReturnType<typeof useT>['t']>[0];
export type Receita = (rascunho: Familia) => string | null;
type Registro = Record<string, unknown>;

export const TIPOS_FORMA: readonly TipoForma[] = ['extrusao', 'revolucao', 'varredura', 'transicao'];

export const ICONE_FORMA: Readonly<Record<TipoForma, string>> = {
  extrusao: 'cube',
  revolucao: 'roof',
  varredura: 'rebar',
  transicao: 'ramp',
};

export const ROTULO_FORMA: Readonly<Record<TipoForma, ChaveI18n>> = {
  extrusao: 'fam_corpo_extrusao',
  revolucao: 'fam_corpo_revolucao',
  varredura: 'fam_corpo_varredura',
  transicao: 'fam_corpo_transicao',
};

export const PAPEIS_CORPO: readonly PapelCorpo[] = ['generico', 'tubo', 'conexao', 'perfil', 'corpo', 'tampa', 'visor'];

export const ROTULO_PAPEL: Readonly<Record<PapelCorpo, ChaveI18n>> = {
  generico: 'fam_corpo_papel_generico',
  tubo: 'fam_corpo_papel_tubo',
  conexao: 'fam_corpo_papel_conexao',
  perfil: 'fam_corpo_papel_perfil',
  corpo: 'fam_corpo_papel_corpo',
  tampa: 'fam_corpo_papel_tampa',
  visor: 'fam_corpo_papel_visor',
};

export const VISTAS_CORPO: readonly VistaCorpo[] = ['planta', 'corte', 'elevacao', '3d'];

export const ROTULO_VISTA: Readonly<Record<VistaCorpo, ChaveI18n>> = {
  planta: 'fam_corpo_vista_planta',
  corte: 'fam_corpo_vista_corte',
  elevacao: 'fam_corpo_vista_elevacao',
  '3d': 'fam_corpo_vista_3d',
};

export const NIVEIS_CORPO: readonly NivelDetalhe[] = ['grosso', 'medio', 'fino'];

export const TIPOS_PERFIL: readonly TipoPerfil[] = [
  'circulo',
  'anel',
  'retangulo',
  'retanguloOco',
  'poligono',
  'perfilI',
  'perfilU',
  'perfilL',
  'perfilT',
];

export const ROTULO_PERFIL: Readonly<Record<TipoPerfil, ChaveI18n>> = {
  circulo: 'fam_corpo_perfil_circulo',
  anel: 'fam_corpo_perfil_anel',
  retangulo: 'fam_corpo_perfil_retangulo',
  retanguloOco: 'fam_corpo_perfil_retanguloOco',
  poligono: 'fam_corpo_perfil_poligono',
  perfilI: 'fam_corpo_perfil_perfilI',
  perfilU: 'fam_corpo_perfil_perfilU',
  perfilL: 'fam_corpo_perfil_perfilL',
  perfilT: 'fam_corpo_perfil_perfilT',
};

/**
 * Campos de medida de cada perfil (nomes técnicos do contrato, iguais aos do arquivo: não são traduzidos). O polígono não
 * tem campos de texto: os pontos são editados como lista "x, y; x, y".
 */
export const CAMPOS_PERFIL: Readonly<Record<TipoPerfil, readonly string[]>> = {
  circulo: ['diametro', 'segmentos'],
  anel: ['diametroExterno', 'diametroInterno', 'segmentos'],
  retangulo: ['largura', 'altura', 'raio'],
  retanguloOco: ['largura', 'altura', 'espessura'],
  poligono: [],
  perfilI: ['altura', 'largura', 'almaEsp', 'mesaEsp'],
  perfilU: ['altura', 'largura', 'almaEsp', 'mesaEsp'],
  perfilL: ['abaA', 'abaB', 'esp'],
  perfilT: ['altura', 'largura', 'almaEsp', 'mesaEsp'],
};

/** Campos que podem ficar vazios: vazio remove a chave (o contrato trata ausente como padrão). */
const OPCIONAIS = new Set(['segmentos', 'raio', 'afastamento', 'segmentosPorCurva', 'material', 'repetir', 'quando']);

export const campoOpcional = (campo: string): boolean => OPCIONAIS.has(campo);

/** Texto atual de um campo (vazio se ausente ou não for texto). */
export function lerCampo(objeto: object, campo: string): string {
  const valor = (objeto as Registro)[campo];
  return typeof valor === 'string' ? valor : '';
}

/** Cópia do objeto com o campo trocado pelo texto; campo opcional vazio é removido. Não altera o original. */
export function comCampo<T extends object>(objeto: T, campo: string, texto: string): T {
  const copia: Registro = { ...(objeto as Registro) };
  if (texto.trim() === '' && campoOpcional(campo)) delete copia[campo];
  else copia[campo] = texto;
  return copia as T;
}

/** Perfil com forma padrão sensata (cada chamada devolve um objeto novo). */
export function criarPerfilPadrao(tipo: TipoPerfil): Perfil {
  switch (tipo) {
    case 'circulo':
      return { tipo, diametro: '50' };
    case 'anel':
      return { tipo, diametroExterno: '60', diametroInterno: '50' };
    case 'retangulo':
      return { tipo, largura: '20', altura: '40' };
    case 'retanguloOco':
      return { tipo, largura: '40', altura: '20', espessura: '3' };
    case 'poligono':
      return { tipo, pontos: [['0', '0'], ['40', '0'], ['0', '30']] };
    case 'perfilI':
      return { tipo, altura: '200', largura: '100', almaEsp: '6', mesaEsp: '10' };
    case 'perfilU':
      return { tipo, altura: '200', largura: '100', almaEsp: '6', mesaEsp: '10' };
    case 'perfilL':
      return { tipo, abaA: '40', abaB: '30', esp: '4' };
    case 'perfilT':
      return { tipo, altura: '60', largura: '60', almaEsp: '6', mesaEsp: '8' };
  }
}

/** Pontos do polígono em texto ("x, y; x, y"). */
export function pontosParaTexto(pontos: readonly Ponto2[]): string {
  return pontos.map((p) => `${p[0]}, ${p[1]}`).join('; ');
}

/** Lê "x, y; x, y" de volta. Devolve os pontos ou o motivo em português (um ponto precisa de exatamente duas partes não vazias). */
export function textoParaPontos(texto: string): Ponto2[] | string {
  const pontos: Ponto2[] = [];
  for (const bruto of texto.split(';')) {
    const partes = bruto.split(',').map((p) => p.trim());
    if (partes.length !== 2 || partes[0] === '' || partes[1] === '') return 'cada ponto precisa de dois valores: x, y';
    pontos.push([partes[0] ?? '0', partes[1] ?? '0']);
  }
  return pontos;
}

/** Quadro com uma coordenada trocada: `origem[i]` ou `rotacao[i]`. Rotação vazia vira 0 e, ausente, nasce só quando editada. */
export function quadroComEixo(quadro: Corpo['quadro'], grupo: 'origem' | 'rotacao', indice: 0 | 1 | 2, texto: string): Corpo['quadro'] {
  const limpo = texto.trim() === '' ? '0' : texto;
  const origem: Ponto3 = [quadro.origem[0], quadro.origem[1], quadro.origem[2]];
  if (grupo === 'origem') {
    origem[indice] = limpo;
    return { ...quadro, origem };
  }
  const rotacao: Ponto3 = quadro.rotacao ? [quadro.rotacao[0], quadro.rotacao[1], quadro.rotacao[2]] : ['0', '0', '0'];
  rotacao[indice] = limpo;
  return { ...quadro, rotacao };
}

/** Ponto do caminho com uma coordenada trocada (texto vazio vale 0). */
export function pontoComEixo(ponto: Ponto3, indice: 0 | 1 | 2, texto: string): Ponto3 {
  const novo: Ponto3 = [ponto[0], ponto[1], ponto[2]];
  novo[indice] = texto.trim() === '' ? '0' : texto;
  return novo;
}

/** Ponto novo para o fim do caminho: o último deslocado 100 mm em X, como fórmula (sem chute de valor). */
export function pontoDeslocado(ultimo: Ponto3): Ponto3 {
  return [`(${ultimo[0]})+100`, ultimo[1], ultimo[2]];
}

/** Próximo id `corpo_n` livre entre peças, aninhados e corpos (mesmo espaço de ids do modelo). */
export function proximoIdCorpo(f: Familia): string {
  const usados = new Set<string>();
  for (const p of f.pecas) usados.add(p.id);
  for (const a of f.aninhados ?? []) usados.add(a.id);
  for (const c of f.corpos ?? []) usados.add(c.id);
  let n = 1;
  while (usados.has(`corpo_${n}`)) n++;
  return `corpo_${n}`;
}

/* Seleção do corpo no editor. Peça e corpo não ficam selecionados ao mesmo tempo: `selecionarCorpo` limpa a peça. */
interface EstadoCorpoSel {
  id: string | null;
  selecionar: (id: string | null) => void;
}

export const useCorpoSel = create<EstadoCorpoSel>((set) => ({
  id: null,
  selecionar: (id) => set({ id }),
}));

export function selecionarCorpo(id: string | null): void {
  useFamilia.getState().selecionarPeca(null);
  useCorpoSel.getState().selecionar(id);
}

/** Cria um corpo padrão da forma pedida no histórico (um passo de desfazer) e o seleciona. Devolve a recusa, se houver. */
export function criarCorpoNoEditor(tipo: TipoForma): string | null {
  const estado = useFamilia.getState();
  const id = proximoIdCorpo(estado.familia());
  const motivo = estado.executar('Novo corpo', (f) => adicionarCorpo(f, criarCorpoPadrao(tipo, id)));
  if (motivo === null) selecionarCorpo(id);
  return motivo;
}

/** Executa uma receita de corpo no histórico; devolve a recusa em português ou `null`. */
export function executarCorpo(rotulo: string, receita: Receita): string | null {
  return useFamilia.getState().executar(rotulo, receita);
}
