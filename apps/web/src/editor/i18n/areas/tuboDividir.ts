/*
 * Opção 'Inserir' da ferramenta Dividir sobre tubo e eletroduto (ficha F6a), prefixo `pro_split_tubo_`. Shard próprio: `familias.ts` só
 * importa e espalha. Paridade PT/EN/ES/DE/FR/IT/PL pelo tipo `D`.
 */

export const PT_DIVTUBO = {
  pro_split_tubo: 'Inserir no corte',
  pro_split_tubo_luva: 'Luva',
  pro_split_tubo_uniao: 'União',
  pro_split_tubo_te: 'Tê (abre o ramal)',
  pro_split_tubo_livre: 'Pontas livres',
} as const;

type D = Record<keyof typeof PT_DIVTUBO, string>;

export const EN_DIVTUBO: D = { pro_split_tubo: 'Insert at cut', pro_split_tubo_luva: 'Coupling', pro_split_tubo_uniao: 'Union', pro_split_tubo_te: 'Tee (opens the branch)', pro_split_tubo_livre: 'Free ends' };
export const ES_DIVTUBO: D = { pro_split_tubo: 'Insertar en el corte', pro_split_tubo_luva: 'Manguito', pro_split_tubo_uniao: 'Unión', pro_split_tubo_te: 'Te (abre el ramal)', pro_split_tubo_livre: 'Extremos libres' };
export const DE_DIVTUBO: D = { pro_split_tubo: 'Am Schnitt einsetzen', pro_split_tubo_luva: 'Muffe', pro_split_tubo_uniao: 'Verschraubung', pro_split_tubo_te: 'T-Stück (öffnet den Abzweig)', pro_split_tubo_livre: 'Freie Enden' };
export const FR_DIVTUBO: D = { pro_split_tubo: 'Insérer à la coupe', pro_split_tubo_luva: 'Manchon', pro_split_tubo_uniao: 'Union', pro_split_tubo_te: 'Té (ouvre la dérivation)', pro_split_tubo_livre: 'Extrémités libres' };
export const IT_DIVTUBO: D = { pro_split_tubo: 'Inserisci al taglio', pro_split_tubo_luva: 'Manicotto', pro_split_tubo_uniao: 'Giunto', pro_split_tubo_te: 'Raccordo a T (apre la derivazione)', pro_split_tubo_livre: 'Estremità libere' };
export const PL_DIVTUBO: D = { pro_split_tubo: 'Wstaw w miejscu cięcia', pro_split_tubo_luva: 'Mufa', pro_split_tubo_uniao: 'Złączka', pro_split_tubo_te: 'Trójnik (otwiera odgałęzienie)', pro_split_tubo_livre: 'Wolne końce' };
