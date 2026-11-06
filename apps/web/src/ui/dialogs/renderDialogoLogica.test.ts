import { describe, expect, it } from 'vitest';
import {
  ATALHOS_AMOSTRAS_PT,
  MENSAGEM_RASCUNHO_SO_3D,
  MENSAGEM_SERVICO_GPU_INDISPONIVEL,
  barraProgresso,
  modoVistaDaCaptura,
  motivoGpuIndisponivel,
  motivoModoMaximoIndisponivel,
  nomeArquivoRender,
  podeClicarRenderizar,
  podeRascunhoDaVista,
  podeUsarModoMaximo,
  podeCairParaRascunho,
  problemaAmostrasPt,
  legendaDoResultado,
  linhaDaCameraDeRender,
  rotuloDoBotaoPrincipal,
  rotuloDoModo,
  rotuloDoResultado,
  textoProgressoPt,
  type EntradaPodeRenderizar,
} from './renderDialogoLogica.ts';
import { CODIGO_RENDER, ErroRenderWasm } from '../../editor/render/erroRender.ts';
import type { SaudeRenderNativo } from '../../editor/render/nativeClient.ts';
import type { EstadoSessao } from './renderSessao.ts';

const ocioso: EstadoSessao = { tipo: 'ocioso' };
const renderizando: EstadoSessao = { tipo: 'renderizando', concluidos: 1, total: 4, mensagem: '' };
const concluido: EstadoSessao = { tipo: 'concluido', imagem: new Blob(['x'], { type: 'image/png' }) };
const erro: EstadoSessao = { tipo: 'erro', mensagem: 'falhou' };
const cancelado: EstadoSessao = { tipo: 'cancelado' };

const base: EntradaPodeRenderizar = {
  qualidade: 'gpu',
  estado: ocioso,
  ocupadoLegado: false,
  alvoValido: true,
  servicoDisponivel: true,
  temCamera: true,
  temSnapshot: true,
  temFonte: true,
};

describe('rotuloDoBotaoPrincipal', () => {
  it('nunca rotula o render como "Salvar"', () => {
    for (const estado of [ocioso, renderizando, concluido, erro, cancelado]) {
      expect(rotuloDoBotaoPrincipal(estado, false)).not.toMatch(/salvar/i);
      expect(rotuloDoBotaoPrincipal(estado, true)).not.toMatch(/salvar/i);
    }
  });

  it('mostra "Renderizar" fora do render e "Renderizando…" durante ele', () => {
    expect(rotuloDoBotaoPrincipal(ocioso, false)).toBe('Renderizar');
    expect(rotuloDoBotaoPrincipal(concluido, false)).toBe('Renderizar');
    expect(rotuloDoBotaoPrincipal(erro, false)).toBe('Renderizar');
    expect(rotuloDoBotaoPrincipal(cancelado, false)).toBe('Renderizar');
    expect(rotuloDoBotaoPrincipal(renderizando, false)).toBe('Renderizando…');
    expect(rotuloDoBotaoPrincipal(ocioso, true)).toBe('Renderizando…');
  });
});

describe('podeClicarRenderizar', () => {
  it('habilita a GPU só com o serviço disponível', () => {
    expect(podeClicarRenderizar(base)).toBe(true);
    expect(podeClicarRenderizar({ ...base, servicoDisponivel: false })).toBe(false);
  });

  it('não habilita com render em andamento, legado ocupado ou dimensões inválidas', () => {
    expect(podeClicarRenderizar({ ...base, estado: renderizando })).toBe(false);
    expect(podeClicarRenderizar({ ...base, ocupadoLegado: true })).toBe(false);
    expect(podeClicarRenderizar({ ...base, alvoValido: false })).toBe(false);
  });

  it('permite render de novo depois de concluir, falhar ou cancelar', () => {
    for (const estado of [concluido, erro, cancelado]) {
      expect(podeClicarRenderizar({ ...base, estado })).toBe(true);
    }
  });

  it('exige a fonte no rascunho e a câmera no final', () => {
    expect(podeClicarRenderizar({ ...base, qualidade: 'rascunho', temFonte: false })).toBe(false);
    expect(podeClicarRenderizar({ ...base, qualidade: 'rascunho', servicoDisponivel: false })).toBe(true);
    expect(podeClicarRenderizar({ ...base, qualidade: 'final', temCamera: false })).toBe(false);
    expect(podeClicarRenderizar({ ...base, qualidade: 'final', servicoDisponivel: false })).toBe(true);
  });
});

describe('motivoGpuIndisponivel', () => {
  it('explica a indisponibilidade sem fallback silencioso', () => {
    expect(motivoGpuIndisponivel(false)).toBe(MENSAGEM_SERVICO_GPU_INDISPONIVEL);
    expect(motivoGpuIndisponivel(null)).toBe(MENSAGEM_SERVICO_GPU_INDISPONIVEL);
    expect(motivoGpuIndisponivel(true)).toBeNull();
  });
});

describe('nomeArquivoRender', () => {
  it('monta render-AAAAMMDD-HHMMSS.png', () => {
    expect(nomeArquivoRender(new Date(2026, 10, 5, 9, 4, 7))).toBe('render-20261105-090407.png');
  });
});

describe('barraProgresso', () => {
  it('sem fração real fica indeterminada, sem percentual inventado', () => {
    expect(barraProgresso(null)).toEqual({ indeterminada: true, percentual: 0 });
    expect(barraProgresso(Number.NaN)).toEqual({ indeterminada: true, percentual: 0 });
  });

  it('converte a fração em percentual inteiro e limita a 0..100', () => {
    expect(barraProgresso(0.256)).toEqual({ indeterminada: false, percentual: 26 });
    expect(barraProgresso(1.7)).toEqual({ indeterminada: false, percentual: 100 });
    expect(barraProgresso(-0.2)).toEqual({ indeterminada: false, percentual: 0 });
  });
});

describe('rascunho por vista', () => {
  it('classifica a vista 3D e o estúdio como vista3d, a planta como planta e o resto como outra', () => {
    expect(modoVistaDaCaptura('3d')).toBe('vista3d');
    expect(modoVistaDaCaptura('animation')).toBe('vista3d');
    expect(modoVistaDaCaptura('plan')).toBe('planta');
    expect(modoVistaDaCaptura('section')).toBe('outra');
    expect(modoVistaDaCaptura('sheet')).toBe('outra');
  });

  it('só libera o rascunho na vista 3D; planta e outras vistas são recusadas', () => {
    expect(podeRascunhoDaVista('vista3d')).toBe(true);
    expect(podeRascunhoDaVista('planta')).toBe(false);
    expect(podeRascunhoDaVista('outra')).toBe(false);
  });

  it('a mensagem de recusa manda usar o GPU nativo ou o Final', () => {
    expect(MENSAGEM_RASCUNHO_SO_3D).toMatch(/só vale para a vista 3D/);
    expect(MENSAGEM_RASCUNHO_SO_3D).toMatch(/GPU nativo/);
    expect(MENSAGEM_RASCUNHO_SO_3D).toMatch(/Final/);
  });

  it('o botão fica parado na planta mesmo com canvas e câmera disponíveis', () => {
    // Mesma regra do diálogo: `temFonte` é o canvas da vista somado à permissão do rascunho.
    const naPlanta = { ...base, qualidade: 'rascunho' as const, temFonte: podeRascunhoDaVista(modoVistaDaCaptura('plan')) };
    expect(podeClicarRenderizar(naPlanta)).toBe(false);
    const na3d = { ...base, qualidade: 'rascunho' as const, temFonte: podeRascunhoDaVista(modoVistaDaCaptura('3d')) };
    expect(podeClicarRenderizar(na3d)).toBe(true);
  });
});

describe('rotuloDoResultado', () => {
  it('não rotula nada enquanto não há imagem pronta', () => {
    expect(rotuloDoResultado('rascunho', false)).toBeNull();
    expect(rotuloDoResultado('final', false)).toBeNull();
    expect(rotuloDoResultado('gpu', false)).toBeNull();
  });

  it('o rascunho nunca se apresenta como render', () => {
    const rotulo = rotuloDoResultado('rascunho', true);
    expect(rotulo).toMatch(/Rascunho/);
    expect(rotulo).not.toMatch(/render final|GPU nativa/i);
  });

  it('cada qualidade de render final tem o seu rótulo', () => {
    expect(rotuloDoResultado('final', true)).toMatch(/Rust\/WASM/);
    expect(rotuloDoResultado('gpu', true)).toMatch(/GPU nativa/);
  });
});

describe('falha do Final e rascunho', () => {
  it('textura não suportada não cai para o rascunho', () => {
    expect(podeCairParaRascunho(new ErroRenderWasm(CODIGO_RENDER.texturasNaoSuportadas))).toBe(false);
  });

  it('outras falhas do Final mantêm o rascunho (com aviso no diálogo)', () => {
    expect(podeCairParaRascunho(new ErroRenderWasm(CODIGO_RENDER.interno))).toBe(true);
    expect(podeCairParaRascunho(new Error('falha qualquer'))).toBe(true);
  });
});

describe('linha da câmera de render no diálogo', () => {
  it('câmera escolhida e em uso no GPU: "Câmera: <nome>"', () => {
    expect(linhaDaCameraDeRender({ gpu: true, selecionada: { nome: 'Câmera 1' }, temCameras: true })).toBe('Câmera: Câmera 1');
  });

  it('sem câmera escolhida, mas com câmeras no projeto: pede a seleção na aba Vista', () => {
    expect(linhaDaCameraDeRender({ gpu: true, selecionada: null, temCameras: true })).toBe(
      'Enquadramento automático (selecione uma câmera de render na aba Vista para usá-la)',
    );
  });

  it('sem câmera escolhida e sem câmeras no projeto: enquadramento automático simples', () => {
    expect(linhaDaCameraDeRender({ gpu: true, selecionada: null, temCameras: false })).toBe('Enquadramento automático');
  });

  it('fora do GPU nativo não há linha (Rascunho e Final seguem a vista ativa)', () => {
    expect(linhaDaCameraDeRender({ gpu: false, selecionada: { nome: 'Câmera 1' }, temCameras: true })).toBeNull();
    expect(linhaDaCameraDeRender({ gpu: false, selecionada: null, temCameras: false })).toBeNull();
  });
});

/* ------------------------------------------------------------------ modo máximo (path tracing) ------------------------------------------------------------------ */

const saudeBase: SaudeRenderNativo = {
  ok: true,
  versao: '0.3.0',
  backend: 'wgpu',
  gpu: 'nativo',
  modos: ['raster', 'pt'],
  versaoPt: '0.1.0',
  erroPt: null,
};

describe('modo máximo: rótulos e disponibilidade', () => {
  it('rotuloDoModo: rápido é o padrão e o máximo diz o que é', () => {
    expect(rotuloDoModo('raster')).toBe('Rápido (rasterização)');
    expect(rotuloDoModo('pt')).toBe('Qualidade máxima (path tracing)');
  });

  it('podeUsarModoMaximo: só com o serviço no ar e pt declarado em /health', () => {
    expect(podeUsarModoMaximo(saudeBase)).toBe(true);
    expect(podeUsarModoMaximo(null)).toBe(false);
    expect(podeUsarModoMaximo({ ...saudeBase, ok: false })).toBe(false);
    expect(podeUsarModoMaximo({ ...saudeBase, modos: ['raster'], erroPt: 'sem GPU' })).toBe(false);
  });

  it('motivoModoMaximoIndisponivel: null quando disponível, motivo explícito quando não', () => {
    expect(motivoModoMaximoIndisponivel(saudeBase)).toBeNull();
    expect(motivoModoMaximoIndisponivel(null)).toMatch(/não respondeu/);
    expect(motivoModoMaximoIndisponivel({ ...saudeBase, ok: false })).toMatch(/erro/);
  });

  it('motivoModoMaximoIndisponivel: erro_pt do serviço vira o motivo, sem alteração', () => {
    const motivo = motivoModoMaximoIndisponivel({ ...saudeBase, modos: ['raster'], versaoPt: null, erroPt: 'sem adaptador GPU' });
    expect(motivo).toBe('Qualidade máxima indisponível: sem adaptador GPU');
  });

  it('motivoModoMaximoIndisponivel: serviço antigo (sem pt e sem erro_pt) pede para recompilar', () => {
    const motivo = motivoModoMaximoIndisponivel({ ...saudeBase, modos: ['raster'], versaoPt: null, erroPt: null });
    expect(motivo).toMatch(/versão antiga/);
    expect(motivo).toMatch(/Recompile e reinicie/);
  });
});

describe('modo máximo: progresso, legenda e amostras', () => {
  it('textoProgressoPt: "N de M amostras" durante o render, null fora dele', () => {
    expect(textoProgressoPt({ tipo: 'renderizando', concluidos: 16, total: 64, mensagem: '' })).toBe('16 de 64 amostras');
    expect(textoProgressoPt(ocioso)).toBeNull();
    expect(textoProgressoPt(concluido)).toBeNull();
  });

  it('legendaDoResultado: pt diz amostras e denoise; raster não tem legenda própria', () => {
    expect(legendaDoResultado('pt', 64, true)).toBe('Qualidade máxima · 64 amostras · denoise sim');
    expect(legendaDoResultado('pt', 256, false)).toBe('Qualidade máxima · 256 amostras · denoise não');
    expect(legendaDoResultado('raster', 0, false)).toBeNull();
  });

  it('problemaAmostrasPt: inteiro de 1 a 4096; o resto é recusado', () => {
    expect(problemaAmostrasPt(1)).toBeNull();
    expect(problemaAmostrasPt(64)).toBeNull();
    expect(problemaAmostrasPt(4096)).toBeNull();
    expect(problemaAmostrasPt(0)).toMatch(/1 a 4096/);
    expect(problemaAmostrasPt(4097)).toMatch(/1 a 4096/);
    expect(problemaAmostrasPt(2.5)).toMatch(/inteiro/);
    expect(problemaAmostrasPt(Number.NaN)).toMatch(/inteiro/);
  });

  it('atalhos de amostras são 16, 64 e 256', () => {
    expect([...ATALHOS_AMOSTRAS_PT]).toEqual([16, 64, 256]);
  });

  it('podeClicarRenderizar: no GPU, modo máximo indisponível bloqueia; disponível libera', () => {
    const base: EntradaPodeRenderizar = {
      qualidade: 'gpu',
      estado: ocioso,
      ocupadoLegado: false,
      alvoValido: true,
      servicoDisponivel: true,
      temCamera: true,
      temSnapshot: true,
      temFonte: false,
    };
    expect(podeClicarRenderizar(base)).toBe(true);
    expect(podeClicarRenderizar({ ...base, modoPronto: true })).toBe(true);
    expect(podeClicarRenderizar({ ...base, modoPronto: false })).toBe(false);
  });
});
