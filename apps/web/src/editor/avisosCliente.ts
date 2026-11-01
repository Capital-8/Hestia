import { criarClienteAvisos, type ClienteAvisos } from './avisosWorker.ts';

/**
 * Um worker para os avisos do projeto e outro para os avisos do intervalo de vista: o segundo é pedido pelo painel
 * quando o usuário olha o nível, e não deve esperar o primeiro terminar. Criados na primeira vez que alguém pede.
 */
const clientes = new Map<'avisos' | 'vista', ClienteAvisos>();

export function clienteAvisosCompartilhado(qual: 'avisos' | 'vista'): ClienteAvisos {
  let c = clientes.get(qual);
  if (!c) clientes.set(qual, (c = criarClienteAvisos()));
  return c;
}
