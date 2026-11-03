import type { Component, Project } from '@hestia/model';
import type { MultiPolygon } from '@hestia/geom';
import type { MalhasDasPecas } from './malha.ts';
import type { ResolucaoFamilia } from './pecas.ts';

/*
 * Componente colocado no projeto (ADR 0049 §3.1): da INSTÂNCIA (`Component`) à geometria no mundo. FICHA E8-motor: implementar as quatro
 * funções abaixo. Testes em `instancia.test.ts`. Puras e numéricas (metros). Mundo = `R(rotation) · E · local + (x, y)` no plano, com `E`
 * espelhando o eixo X local quando `mirrored`, e altura Z = `levelElevation(p, c.levelId) + c.z + z local` (`levelElevation` de `@hestia/model`).
 */

/**
 * Resolve a família da instância com o tipo (`c.typeId`, `null` = padrão da família), os valores da instância (`c.values`, em mm) e as
 * famílias do projeto como biblioteca (para aninhados). Família ausente em `p.componentFamilies`: devolve `{ pecas: [], ferragens: [], env: {},
 * erros: [{ onde: 'familia', mensagem: 'Família do componente não existe no projeto.' }] }` (nunca lança). Memoize: a MESMA referência de
 * resultado enquanto `p.componentFamilies`, a família, o tipo e os valores forem os mesmos (use um `WeakMap` por `p.componentFamilies`;
 * uma edição imutável da família ou do projeto invalida sozinha).
 */
export function resolverComponente(p: Project, c: Component): ResolucaoFamilia {
  void p;
  void c;
  throw new Error('não implementado: ficha E8-motor');
}

/**
 * Malha triangular da instância no MUNDO (mesmas malhas de `malhaDasPecas`, `solidas` e `vazios`, com `pecaDoTriangulo` apontando para o índice
 * da peça em `res.pecas`). Cada vértice é transformado pela fórmula do cabeçalho; as normais giram junto (rotação e espelho: a normal de X
 * muda de sinal quando `mirrored`). Quando `mirrored`, a transformação inverte a orientação: troque dois índices de cada triângulo para as normais
 * continuarem saindo para FORA e o volume continuar positivo. `res` opcional (padrão: `resolverComponente(p, c)`).
 */
export function malhaDoComponente(p: Project, c: Component, res?: ResolucaoFamilia): MalhasDasPecas {
  void p;
  void c;
  void res;
  throw new Error('não implementado: ficha E8-motor');
}

/**
 * Pegada em planta (vista de cima): união, via `union` de `@hestia/geom`, dos retângulos (no mundo) de todas as peças NÃO vazias (caixa local
 * `origem` a `origem + extensao` em X e Y, ignorando o contorno). Devolve o `MultiPolygon` da união, sem anel degenerado. Sem peças: `[]`.
 */
export function pegadaDoComponente(p: Project, c: Component, res?: ResolucaoFamilia): MultiPolygon {
  void p;
  void c;
  void res;
  throw new Error('não implementado: ficha E8-motor');
}

/** Caixa envolvente (m) das peças não vazias no mundo, ou `null` sem peças. Vem dos vértices da malha, não de uma estimativa. */
export function caixaDoComponente(p: Project, c: Component, res?: ResolucaoFamilia): { min: [number, number, number]; max: [number, number, number] } | null {
  void p;
  void c;
  void res;
  throw new Error('não implementado: ficha E8-motor');
}
