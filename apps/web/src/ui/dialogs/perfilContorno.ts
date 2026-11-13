// Contorno do perfil para a prévia 2D do diálogo (estrutura, A.2 e A.5): vem da consulta 205 (`estr_perfil`) do kernel por
// uma função INJETÁVEL. Nenhum caminho TS calcula contorno de perfil (A.0 item 2). Até a ficha R1 ligar o kernel, o
// padrão devolve null e a prévia mostra "pré-visualização indisponível".

import type { PerfilForma } from '@hestia/model';

/** Anéis do contorno: o primeiro é o externo; os demais, furos. Vértices em metros, no sistema local do perfil. */
export interface ContornoPerfil {
  anel: ReadonlyArray<readonly [number, number]>;
  furos: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

/** Função de contorno: devolve o contorno do kernel ou null quando ele não está disponível (ou o perfil é inválido). */
export type FuncaoContorno = (perfil: PerfilForma) => ContornoPerfil | null;

const SEM_KERNEL: FuncaoContorno = () => null;
let fonte: FuncaoContorno = SEM_KERNEL;

/** Contorno do perfil pela consulta 205 do kernel; null enquanto ela não está ligada. */
export const perfilContorno: FuncaoContorno = (perfil) => fonte(perfil);

/** Liga a função que consulta o kernel (ficha R1). Sem argumento, volta ao padrão sem kernel. */
export function definirPerfilContorno(fn?: FuncaoContorno): void {
  fonte = fn ?? SEM_KERNEL;
}
