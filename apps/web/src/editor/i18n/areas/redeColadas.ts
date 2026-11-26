/*
 * Texto do diagnóstico `conexoes_coladas` em "Verificar rede" (ficha F1): duas conexões ligadas direto, sem tubo entre elas. Shard próprio:
 * `familias.ts` só importa e espalha. Paridade PT/EN/ES/DE/FR/IT/PL pelo tipo `D`.
 */

export const PT_COLADAS = {
  rede_coladas: 'Conexões coladas: falta tubo entre elas (mínimo {mm} mm, valor provisório a conferir)',
} as const;

type D = Record<keyof typeof PT_COLADAS, string>;

export const EN_COLADAS: D = { rede_coladas: 'Fittings joined directly: a pipe is missing between them (minimum {mm} mm, provisional value to check)' };
export const ES_COLADAS: D = { rede_coladas: 'Conexiones pegadas: falta tubo entre ellas (mínimo {mm} mm, valor provisional por verificar)' };
export const DE_COLADAS: D = { rede_coladas: 'Formstücke direkt verbunden: Es fehlt ein Rohr dazwischen (mindestens {mm} mm, vorläufiger Wert, zu prüfen)' };
export const FR_COLADAS: D = { rede_coladas: 'Raccords collés : il manque un tuyau entre eux (minimum {mm} mm, valeur provisoire à vérifier)' };
export const IT_COLADAS: D = { rede_coladas: 'Raccordi attaccati: manca il tubo tra loro (minimo {mm} mm, valore provvisorio da verificare)' };
export const PL_COLADAS: D = { rede_coladas: 'Kształtki połączone bezpośrednio: brakuje rury między nimi (minimum {mm} mm, wartość tymczasowa do sprawdzenia)' };
