import { describe, expect, it } from 'vitest';
import {
  fracaoProgresso,
  podeBaixar,
  podeRenderizar,
  transicionar,
  type EstadoSessao,
} from './renderSessao.ts';

const imagem = (): Blob => new Blob(['x'], { type: 'image/png' });

describe('renderSessao', () => {
  it('T1: fluxo completo ocioso → iniciar → tile×3 → concluir gera concluido com imagem', () => {
    const png = imagem();
    let estado: EstadoSessao = { tipo: 'ocioso' };
    estado = transicionar(estado, { tipo: 'iniciar', total: 3 });
    expect(estado.tipo).toBe('renderizando');
    estado = transicionar(estado, { tipo: 'tile', concluidos: 1, total: 3 });
    estado = transicionar(estado, { tipo: 'tile', concluidos: 2, total: 3 });
    estado = transicionar(estado, { tipo: 'tile', concluidos: 3, total: 3 });
    expect(estado).toMatchObject({ tipo: 'renderizando', concluidos: 3, total: 3 });
    estado = transicionar(estado, { tipo: 'concluir', imagem: png });
    expect(estado).toEqual({ tipo: 'concluido', imagem: png });
  });

  it('T2: tile com valor decrescente não regride', () => {
    let estado = transicionar({ tipo: 'ocioso' }, { tipo: 'iniciar', total: 10 });
    estado = transicionar(estado, { tipo: 'tile', concluidos: 6, total: 10 });
    estado = transicionar(estado, { tipo: 'tile', concluidos: 4, total: 10 });
    expect(estado).toMatchObject({ tipo: 'renderizando', concluidos: 6, total: 10 });
  });

  it('T3: tile fora de renderizando é ignorado', () => {
    const ocioso: EstadoSessao = { tipo: 'ocioso' };
    expect(transicionar(ocioso, { tipo: 'tile', concluidos: 2, total: 5 })).toBe(ocioso);

    const concluido: EstadoSessao = { tipo: 'concluido', imagem: imagem() };
    expect(transicionar(concluido, { tipo: 'tile', concluidos: 2, total: 5 })).toBe(concluido);

    const erro: EstadoSessao = { tipo: 'erro', mensagem: 'falhou' };
    expect(transicionar(erro, { tipo: 'tile', concluidos: 2, total: 5 })).toBe(erro);
  });

  it('T4: podeBaixar falso em renderizando e em concluido sem imagem; verdadeiro com imagem', () => {
    const renderizando: EstadoSessao = { tipo: 'renderizando', concluidos: 1, total: 2, mensagem: '' };
    expect(podeBaixar(renderizando)).toBe(false);
    expect(podeBaixar({ tipo: 'concluido', imagem: null })).toBe(false);
    expect(podeBaixar({ tipo: 'concluido', imagem: imagem() })).toBe(true);
  });

  it('T5: fracaoProgresso devolve null fora de renderizando e 0 com total 0', () => {
    expect(fracaoProgresso({ tipo: 'ocioso' })).toBeNull();
    expect(fracaoProgresso({ tipo: 'concluido', imagem: null })).toBeNull();
    expect(fracaoProgresso({ tipo: 'erro', mensagem: '' })).toBeNull();
    expect(fracaoProgresso({ tipo: 'cancelado' })).toBeNull();
    expect(fracaoProgresso({ tipo: 'renderizando', concluidos: 0, total: 0, mensagem: '' })).toBe(0);
    expect(fracaoProgresso({ tipo: 'renderizando', concluidos: 1, total: 4, mensagem: '' })).toBe(0.25);
  });

  it('T6: reiniciar a partir de erro volta a ocioso; iniciar a partir de concluido funciona', () => {
    const erro: EstadoSessao = { tipo: 'erro', mensagem: 'falhou' };
    expect(transicionar(erro, { tipo: 'reiniciar' })).toEqual({ tipo: 'ocioso' });

    const concluido: EstadoSessao = { tipo: 'concluido', imagem: imagem() };
    const novo = transicionar(concluido, { tipo: 'iniciar', total: 4 });
    expect(novo).toMatchObject({ tipo: 'renderizando', concluidos: 0, total: 4 });
  });

  it('T7: cancelar em renderizando vai para cancelado, e podeRenderizar(cancelado) é true', () => {
    const renderizando = transicionar({ tipo: 'ocioso' }, { tipo: 'iniciar', total: 2 });
    const cancelado = transicionar(renderizando, { tipo: 'cancelar' });
    expect(cancelado).toEqual({ tipo: 'cancelado' });
    expect(podeRenderizar(cancelado)).toBe(true);
    expect(podeRenderizar(renderizando)).toBe(false);
  });

  it('amostra (modo pt): avança concluidos/total e não regride', () => {
    let estado = transicionar({ tipo: 'ocioso' }, { tipo: 'iniciar', total: 64 });
    estado = transicionar(estado, { tipo: 'amostra', feitas: 16, total: 64 });
    expect(estado).toMatchObject({ tipo: 'renderizando', concluidos: 16, total: 64 });
    estado = transicionar(estado, { tipo: 'amostra', feitas: 8, total: 64 });
    expect(estado).toMatchObject({ concluidos: 16 });
    estado = transicionar(estado, { tipo: 'amostra', feitas: 200, total: 64 });
    expect(estado).toMatchObject({ concluidos: 64, total: 64 });
  });

  it('amostra fora de um render é ignorada', () => {
    expect(transicionar({ tipo: 'ocioso' }, { tipo: 'amostra', feitas: 1, total: 4 })).toEqual({ tipo: 'ocioso' });
  });
});
