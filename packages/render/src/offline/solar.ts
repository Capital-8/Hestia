/**
 * Posição solar aproximada (NOAA simplificado) para o estudo solar do estúdio.
 *
 * Entrada: data ISO, latitude/longitude em graus, hora local decimal e fuso em horas.
 * Saída: azimute no sistema do Hestia (graus, 0 = leste, anti-horário) e elevação em graus.
 * A aproximação é suficiente para sombras de apresentação; não é efeméride de precisão.
 */

export interface SolarPositionInput {
  /** `YYYY-MM-DD`. */
  date: string;
  latitude: number;
  longitude: number;
  /** Hora local decimal, 0..24. */
  hour: number;
  /** Deslocamento em horas em relação a UTC; ausente = 0. */
  timezone?: number;
}

export interface SolarPosition {
  azimuth: number;
  elevation: number;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const TAU = Math.PI * 2;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const wrap = (a: number): number => ((a % 360) + 360) % 360;

/** Dia do ano (1..366) de uma data ISO, em UTC. */
export function dayOfYear(date: string): number {
  const [ano, mes, dia] = date.split('-').map(Number);
  const y = Number.isFinite(ano) ? ano! : 2000;
  const m = Number.isFinite(mes) ? mes! : 1;
  const d = Number.isFinite(dia) ? dia! : 1;
  const inicio = Date.UTC(y, 0, 0);
  const alvo = Date.UTC(y, m - 1, d);
  return Math.max(1, Math.min(366, Math.round((alvo - inicio) / 86_400_000)));
}

/**
 * Posição do sol no instante pedido. Azimute no sistema do Hestia (0 = leste, anti-horário),
 * elevação acima do horizonte. Ângulos em graus.
 */
export function solarPosition(input: SolarPositionInput): SolarPosition {
  const n = dayOfYear(input.date);
  const hora = Number.isFinite(input.hour) ? input.hour : 12;
  const fuso = Number.isFinite(input.timezone) ? input.timezone! : 0;
  const longitude = Number.isFinite(input.longitude) ? input.longitude : 0;
  const latitude = clamp(Number.isFinite(input.latitude) ? input.latitude : 0, -89.9, 89.9);

  // Ângulo diário e declinação (aproximação de Cooper/NOAA).
  const gamma = (TAU / 365) * (n - 1 + (hora - 12) / 24);
  const decl = 0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma);

  // Equação do tempo (minutos) e hora solar.
  const eqTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );
  const horaSolar = hora + (4 * (longitude - 15 * fuso) + eqTime) / 60;
  const H = (15 * (horaSolar - 12)) * RAD;
  const lat = latitude * RAD;

  const sinElev = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const elevation = Math.asin(clamp(sinElev, -1, 1)) * DEG;

  // Azimute a partir do norte, horário; depois convertido para 0 = leste, anti-horário.
  const azNorte = Math.atan2(
    -Math.sin(H),
    Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat),
  ) * DEG;

  return {
    azimuth: wrap(90 - azNorte),
    elevation,
  };
}

/** Posição no intervalo de uma sequência solar (t em segundos). */
export function solarPositionAt(
  solar: { date: string; latitude: number; longitude: number; startHour: number; endHour: number; timezone?: number },
  t: number,
  duration: number,
): SolarPosition {
  const u = duration > 0 ? clamp(t / duration, 0, 1) : 0;
  const hour = solar.startHour + (solar.endHour - solar.startHour) * u;
  return solarPosition({
    date: solar.date,
    latitude: solar.latitude,
    longitude: solar.longitude,
    hour,
    timezone: solar.timezone,
  });
}
