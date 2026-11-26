/*
 * Texto do diagnóstico `curvatura_fechada` em "Verificar rede" (ficha F2): o eletroduto corrugado tem um canto fechado demais para o
 * raio mínimo de curvatura (valor provisório a conferir). Shard próprio: `familias.ts` só importa e espalha. Paridade nas 7 línguas pelo tipo `D`.
 */

export const PT_CURVATURA = {
  rede_curvatura: 'Eletroduto corrugado com canto fechado demais: o raio mínimo pede {necessario} mm de trecho e ele tem {disponivel} mm (raio provisório a conferir). Aumente o trecho ou abra o canto',
} as const;

type D = Record<keyof typeof PT_CURVATURA, string>;

export const EN_CURVATURA: D = { rede_curvatura: 'Corrugated conduit with a bend that is too tight: the minimum radius needs {necessario} mm of run and it has {disponivel} mm (provisional radius, to check). Lengthen the run or open the bend' };
export const ES_CURVATURA: D = { rede_curvatura: 'Conducto corrugado con una curva demasiado cerrada: el radio mínimo pide {necessario} mm de tramo y tiene {disponivel} mm (radio provisional, por verificar). Alargue el tramo o abra la curva' };
export const DE_CURVATURA: D = { rede_curvatura: 'Wellrohr mit zu engem Bogen: Der Mindestradius braucht {necessario} mm Strecke, vorhanden sind {disponivel} mm (vorläufiger Radius, zu prüfen). Strecke verlängern oder Bogen öffnen' };
export const FR_CURVATURA: D = { rede_curvatura: 'Conduit annelé avec un coude trop serré : le rayon minimal demande {necessario} mm de tronçon et il en a {disponivel} mm (rayon provisoire à vérifier). Allongez le tronçon ou ouvrez le coude' };
export const IT_CURVATURA: D = { rede_curvatura: 'Tubo corrugato con una curva troppo stretta: il raggio minimo richiede {necessario} mm di tratto e ne ha {disponivel} mm (raggio provvisorio da verificare). Allunga il tratto o apri la curva' };
export const PL_CURVATURA: D = { rede_curvatura: 'Rura karbowana ze zbyt ciasnym łukiem: minimalny promień wymaga {necessario} mm odcinka, a jest {disponivel} mm (promień tymczasowy do sprawdzenia). Wydłuż odcinek lub otwórz łuk' };
