/*
 * Textos do diagnóstico ELÉTRICO em "Verificar rede" (ficha C5), prefixo `rede_el_`. Shard próprio: `familias.ts` só importa e
 * espalha. Paridade PT/EN/ES/DE/FR/IT/PL pelo tipo `D`.
 */

export const PT_ELREDE = {
  rede_el_sem_quadro: 'Circuito {circuito} sem quadro',
  rede_el_ponto_sem_eletroduto: 'Circuito {circuito}: ponto sem eletroduto ligado até o quadro',
  rede_el_dispositivo_sem_eletroduto: 'Caixa ou dispositivo elétrico sem eletroduto ligado',
  rede_el_quadro_posicoes: 'Quadro com {n} circuito(s) para {limite} posição(ões)',
  rede_el_potencia_zero: 'Circuito {circuito}: ponto com potência 0',
} as const;

type D = Record<keyof typeof PT_ELREDE, string>;

export const EN_ELREDE: D = {
  rede_el_sem_quadro: 'Circuit {circuito} has no panel',
  rede_el_ponto_sem_eletroduto: 'Circuit {circuito}: point with no conduit connected to the panel',
  rede_el_dispositivo_sem_eletroduto: 'Electrical box or device with no conduit connected',
  rede_el_quadro_posicoes: 'Panel with {n} circuit(s) for {limite} slot(s)',
  rede_el_potencia_zero: 'Circuit {circuito}: point with power 0',
};

export const ES_ELREDE: D = {
  rede_el_sem_quadro: 'Circuito {circuito} sin cuadro',
  rede_el_ponto_sem_eletroduto: 'Circuito {circuito}: punto sin conducto conectado al cuadro',
  rede_el_dispositivo_sem_eletroduto: 'Caja o dispositivo eléctrico sin conducto conectado',
  rede_el_quadro_posicoes: 'Cuadro con {n} circuito(s) para {limite} posición(es)',
  rede_el_potencia_zero: 'Circuito {circuito}: punto con potencia 0',
};

export const DE_ELREDE: D = {
  rede_el_sem_quadro: 'Stromkreis {circuito} ohne Verteiler',
  rede_el_ponto_sem_eletroduto: 'Stromkreis {circuito}: Punkt ohne Leerrohr bis zum Verteiler',
  rede_el_dispositivo_sem_eletroduto: 'Elektrodose oder Gerät ohne angeschlossenes Leerrohr',
  rede_el_quadro_posicoes: 'Verteiler mit {n} Stromkreis(en) für {limite} Platz/Plätze',
  rede_el_potencia_zero: 'Stromkreis {circuito}: Punkt mit Leistung 0',
};

export const FR_ELREDE: D = {
  rede_el_sem_quadro: 'Circuit {circuito} sans tableau',
  rede_el_ponto_sem_eletroduto: 'Circuit {circuito} : point sans conduit relié au tableau',
  rede_el_dispositivo_sem_eletroduto: 'Boîte ou appareil électrique sans conduit relié',
  rede_el_quadro_posicoes: 'Tableau avec {n} circuit(s) pour {limite} emplacement(s)',
  rede_el_potencia_zero: 'Circuit {circuito} : point de puissance 0',
};

export const IT_ELREDE: D = {
  rede_el_sem_quadro: 'Circuito {circuito} senza quadro',
  rede_el_ponto_sem_eletroduto: 'Circuito {circuito}: punto senza tubo collegato al quadro',
  rede_el_dispositivo_sem_eletroduto: 'Scatola o dispositivo elettrico senza tubo collegato',
  rede_el_quadro_posicoes: 'Quadro con {n} circuito/i per {limite} posizione/i',
  rede_el_potencia_zero: 'Circuito {circuito}: punto con potenza 0',
};

export const PL_ELREDE: D = {
  rede_el_sem_quadro: 'Obwód {circuito} bez rozdzielnicy',
  rede_el_ponto_sem_eletroduto: 'Obwód {circuito}: punkt bez rury połączonej z rozdzielnicą',
  rede_el_dispositivo_sem_eletroduto: 'Puszka lub urządzenie elektryczne bez podłączonej rury',
  rede_el_quadro_posicoes: 'Rozdzielnica z {n} obwodami na {limite} miejsc',
  rede_el_potencia_zero: 'Obwód {circuito}: punkt o mocy 0',
};
