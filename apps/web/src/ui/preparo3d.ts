/**
 * Ponte entre o preparo do projeto e a vista 3D do canvas. O `ViewportCanvas` registra aqui como (re)iniciar a montagem do
 * modelo; o preparo a chama com a planta na tela, para que a aba 3D abra com o modelo já montado. A montagem em si é a de
 * sempre (fatias, worker de resolução): este módulo só dá a partida e informa o andamento.
 */
export interface Andamento3d {
  montados: number;
  total: number;
}

let iniciar: (() => Andamento3d | null) | null = null;

export function registrarPreparo3d(f: (() => Andamento3d | null) | null): void {
  iniciar = f;
}

/** Dá a partida na montagem 3D (idempotente: a mesma chave não refaz) e devolve o andamento; `null` sem vista registrada. */
export function iniciarPreparo3d(): Andamento3d | null {
  return iniciar?.() ?? null;
}
