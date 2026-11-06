import type { ColunasDeEntrada, NomeSecao } from './codec.ts';
import type { FonteDaCena } from './cena.ts';

/** Seções de uma cena em colunas (as do esquema v4), cada uma com o número de linhas. */
export type SecoesDaCena = Partial<Record<NomeSecao, { colunas: ColunasDeEntrada; n: number }>>;

/**
 * Fonte da cena que reenvia as seções dadas, na ordem do esquema (`paredes`, `paredes_quadro`, `tipos_parede`,
 * `camadas`, `faixas`, `paredes_z`, `tipos_abertura`, `aberturas`, `perfis_z`, e as da fatia B: `pisos`, `lajes`, `tipos_piso`, `tipos_laje`, `camadas_piso`, `camadas_laje`, `contornos_estaticos`, `contornos_vinculados`, `furos_nivel`, da B2: `niveis`, e da B3: `paredes_z_juncao`, `perfis_z_juncao`, `faixas_juncao` e `pontos_faixas_juncao`), lidas na hora (o projeto no JavaScript é a fonte da verdade; o Rust é cache).
 */
export function fonteDeSecoes(ler: () => SecoesDaCena): FonteDaCena {
  return (cena) => {
    const secoes = ler();
    for (const nome of ['paredes', 'tipos_parede', 'camadas', 'faixas', 'paredes_quadro', 'paredes_z', 'tipos_abertura', 'aberturas', 'perfis_z', 'tipos_piso', 'tipos_laje', 'camadas_piso', 'camadas_laje', 'pisos', 'lajes', 'contornos_estaticos', 'contornos_vinculados', 'furos_nivel', 'niveis', 'paredes_z_juncao', 'perfis_z_juncao', 'faixas_juncao', 'pontos_faixas_juncao', 'camadas_forro', 'pontos_forro'] as const) {
      const s = secoes[nome];
      if (s) cena.definirSecao(nome, s.colunas, s.n);
    }
  };
}
