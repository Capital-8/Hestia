import type { ColunasDeEntrada, NomeSecao } from './codec.ts';
import type { FonteDaCena } from './cena.ts';

/** Seções de uma cena em colunas (as do esquema v4), cada uma com o número de linhas. */
export type SecoesDaCena = Partial<Record<NomeSecao, { colunas: ColunasDeEntrada; n: number }>>;

/**
 * Fonte da cena que reenvia as seções dadas, na ordem do esquema (`paredes`, `paredes_quadro`, `tipos_parede`,
 * `camadas`, `faixas`, `paredes_z`, `tipos_abertura`, `aberturas`, `perfis_z`), lidas na hora (o projeto no JavaScript é a fonte da verdade; o Rust é cache).
 */
export function fonteDeSecoes(ler: () => SecoesDaCena): FonteDaCena {
  return (cena) => {
    const secoes = ler();
    for (const nome of ['paredes', 'tipos_parede', 'camadas', 'faixas', 'paredes_quadro', 'paredes_z', 'tipos_abertura', 'aberturas', 'perfis_z'] as const) {
      const s = secoes[nome];
      if (s) cena.definirSecao(nome, s.colunas, s.n);
    }
  };
}
