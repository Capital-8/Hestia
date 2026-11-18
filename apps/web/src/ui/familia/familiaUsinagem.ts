import { compilar, tentar, type FaceUsinagem, type Peca, type Usinagem, type Valor } from '@hestia/model';
import { novoIdUnico } from './familiaCatalogo.ts';

/*
 * Apoio puro das usinagens da peça (sem React): rótulos de face, padrão por tipo, resumo da lista e a validação usada
 * antes de gravar. Em borda (n, s, l, o) só cabe furo; a posição muda de sentido (ao longo da borda e distância da face A).
 */

export type TipoUsinagem = Usinagem['tipo'];

export const TIPOS_USINAGEM: readonly TipoUsinagem[] = ['furo', 'rasgo', 'recorte'];

export const FACES: readonly FaceUsinagem[] = ['a', 'b', 'n', 's', 'l', 'o'];

export const FACES_DE_BORDA: readonly FaceUsinagem[] = ['n', 's', 'l', 'o'];

export const ROTULO_TIPO_USINAGEM: Readonly<Record<TipoUsinagem, string>> = {
  furo: 'Furo',
  rasgo: 'Rasgo',
  recorte: 'Recorte',
};

export const ROTULO_FACE: Readonly<Record<FaceUsinagem, string>> = {
  a: 'Face A',
  b: 'Face B',
  n: 'Borda norte',
  s: 'Borda sul',
  l: 'Borda leste',
  o: 'Borda oeste',
};

/** `n`, `s`, `l` e `o` são bordas; `a` e `b` são as faces da chapa. */
export function ehBorda(face: FaceUsinagem): boolean {
  return face === 'n' || face === 's' || face === 'l' || face === 'o';
}

/** Faces que o tipo aceita: furo em todas; rasgo e recorte só nas faces A e B. */
export function facesDisponiveis(tipo: TipoUsinagem): FaceUsinagem[] {
  return tipo === 'furo' ? [...FACES] : ['a', 'b'];
}

/** Rótulos das duas fórmulas de posição para o tipo e a face escolhidos. */
export function rotulosDaFace(tipo: TipoUsinagem, face: FaceUsinagem): [string, string] {
  if (tipo === 'furo' && ehBorda(face)) return ['Ao longo da borda', 'Distância da face A'];
  if (tipo === 'furo') return ['Centro (u)', 'Centro (v)'];
  return ['Canto mínimo (u)', 'Canto mínimo (v)'];
}

/** Usinagem nova com id único na peça (quando `existentes` é passado) e valores iniciais neutros. */
export function usinagemPadrao(tipo: TipoUsinagem, face: FaceUsinagem, existentes: Iterable<string> = []): Usinagem {
  const faceFinal: FaceUsinagem = tipo === 'furo' || !ehBorda(face) ? face : 'a';
  const base: Usinagem = {
    id: novoIdUnico(tipo, existentes),
    tipo,
    face: faceFinal,
    posicao: ['0', '0'],
    profundidade: 'passante',
  };
  if (tipo === 'furo') return { ...base, diametro: '8' };
  return { ...base, largura: '50', comprimento: '20' };
}

/** Confere uma usinagem contra a peça; devolve o motivo da recusa ou `null`. `idOriginal` libera o id ao editar. */
export function validarUsinagem(peca: Peca, usinagem: Usinagem, idOriginal?: string, env: Readonly<Record<string, Valor>> = {}): string | null {
  const id = usinagem.id.trim();
  if (id === '') return 'o id da usinagem não pode ficar vazio';
  const lista = Array.isArray(peca.usinagens) ? peca.usinagens : [];
  if (lista.some((u) => u.id === id && u.id !== idOriginal)) return `já existe uma usinagem “${id}” nesta peça`;
  if (usinagem.tipo !== 'furo' && ehBorda(usinagem.face)) return 'rasgo e recorte só entram nas faces A ou B';

  const obrigatorios: Array<[string, string]> = [
    ['posição u', usinagem.posicao[0] ?? ''],
    ['posição v', usinagem.posicao[1] ?? ''],
  ];

  if (usinagem.tipo === 'furo') {
    const diametro = (usinagem.diametro ?? '').trim();
    if (diametro === '') return 'informe o diâmetro do furo';
    obrigatorios.push(['diâmetro', diametro]);
  } else {
    const largura = (usinagem.largura ?? '').trim();
    const comprimento = (usinagem.comprimento ?? '').trim();
    if (largura === '') return 'informe a largura';
    if (comprimento === '') return 'informe o comprimento';
    obrigatorios.push(['largura', largura], ['comprimento', comprimento]);
  }

  if (usinagem.profundidade !== 'passante') {
    if (usinagem.profundidade.trim() === '') return 'informe a profundidade ou marque “passante”';
    obrigatorios.push(['profundidade', usinagem.profundidade]);
  }

  for (const [rotulo, texto] of obrigatorios) {
    if (texto.trim() === '') return `informe ${rotulo}`;
    const compilada = compilar(texto);
    if ('erro' in compilada) return `fórmula de ${rotulo}: ${compilada.erro.message}`;
  }

  const opcionais: Array<[string, string | undefined]> = [
    ['quantidade', usinagem.quantidade],
    ['“existe se”', usinagem.quando],
  ];
  for (const [rotulo, texto] of opcionais) {
    if (texto === undefined || texto.trim() === '') continue;
    const compilada = compilar(texto);
    if ('erro' in compilada) return `fórmula de ${rotulo}: ${compilada.erro.message}`;
  }

  return conferirMedidas(peca, usinagem, env);
}

/** Valor numérico de uma fórmula resolvida com o ambiente da família; `null` quando depende de algo que não foi resolvido. */
function valorNumerico(texto: string | undefined, env: Readonly<Record<string, Valor>>): number | null {
  if (texto === undefined || texto.trim() === '') return null;
  const r = tentar(texto, env);
  return r.ok && typeof r.valor === 'number' && Number.isFinite(r.valor) ? r.valor : null;
}

/**
 * Medidas da usinagem contra a peça resolvida: diâmetro/profundidade maiores que zero e o furo (ou o rasgo) dentro da
 * chapa. Só confere o que dá para resolver; fórmula que depende de parâmetro livre fica para o motor.
 */
function conferirMedidas(peca: Peca, usinagem: Usinagem, env: Readonly<Record<string, Valor>>): string | null {
  const u = valorNumerico(usinagem.posicao[0], env);
  const v = valorNumerico(usinagem.posicao[1], env);
  const a = valorNumerico(peca.tamanho[0], env);
  const b = valorNumerico(peca.tamanho[1], env);
  const espessura = valorNumerico(peca.espessura, env);
  const borda = ehBorda(usinagem.face);
  const noV = usinagem.face === 'n' || usinagem.face === 's';
  const aoLongo = noV ? a : b;
  const perpendicular = noV ? b : a;

  if (usinagem.tipo === 'furo') {
    const diametro = valorNumerico(usinagem.diametro, env);
    if (diametro !== null) {
      if (diametro <= 0) return 'o diâmetro do furo precisa ser maior que zero';
      if (u !== null && v !== null) {
        const raio = diametro / 2;
        if (borda) {
          const foraDaBorda = (aoLongo !== null && (u - raio < 0 || u + raio > aoLongo))
            || (espessura !== null && (v - raio < 0 || v + raio > espessura));
          if (foraDaBorda) return 'furo fora da peça';
        } else if (a !== null && b !== null && (u - raio < 0 || u + raio > a || v - raio < 0 || v + raio > b)) {
          return 'furo fora da peça';
        }
      }
    }
  } else {
    const largura = valorNumerico(usinagem.largura, env);
    const comprimento = valorNumerico(usinagem.comprimento, env);
    if (largura !== null && largura <= 0) return 'a largura precisa ser maior que zero';
    if (comprimento !== null && comprimento <= 0) return 'o comprimento precisa ser maior que zero';
    if (u !== null && v !== null && largura !== null && comprimento !== null && a !== null && b !== null) {
      if (u < 0 || v < 0 || u + comprimento > a || v + largura > b) return `${usinagem.tipo} fora da peça`;
    }
  }

  if (usinagem.profundidade !== 'passante') {
    const profundidade = valorNumerico(usinagem.profundidade, env);
    if (profundidade !== null) {
      if (profundidade <= 0) return 'a profundidade precisa ser maior que zero';
      if (!borda && espessura !== null && profundidade > espessura + 1e-9) return 'a profundidade não pode passar da espessura';
      if (borda && perpendicular !== null && profundidade > perpendicular + 1e-9) return 'a profundidade é maior que a chapa';
    }
  }

  return null;
}

/** Texto curto da lista: diâmetro do furo ou largura × comprimento do rasgo/recorte. */
export function resumoUsinagem(usinagem: Usinagem): string {
  if (usinagem.tipo === 'furo') {
    const diametro = (usinagem.diametro ?? '').trim() || '—';
    const profundidade = usinagem.profundidade === 'passante' ? 'passante' : (usinagem.profundidade ?? '').trim();
    return `Ø ${diametro}${profundidade === '' ? '' : ` · ${profundidade}`}`;
  }
  const largura = (usinagem.largura ?? '').trim() || '—';
  const comprimento = (usinagem.comprimento ?? '').trim() || '—';
  return `${largura} × ${comprimento}`;
}
