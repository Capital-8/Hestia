//! Testes de integração do `Motor`: regressão contra a API antiga, cobertura de tiles e reuso.
//!
//! Exigem uma GPU nativa (DX12/Vulkan/Metal). Sem GPU, os testes falham com a mensagem do
//! `Motor::nativo()`, de propósito: nunca marcam como passou sem renderizar.

use std::io::Cursor;

use render_core::Cena;
use render_engine::{renderizar_com_camera, Motor, Retangulo};

const CENA: &[u8] = include_bytes!("fixtures/cena-h1.hstr");
/// Referência com amostras = 1 (sem MSAA). Regenerada no H19: o estado H18 já tinha mudado o ambiente.
/// Regenerada de novo em 2026-11-05 pela sombra do Sol dimensionada pelos projetores (d03af5ef):
/// a borda da sombra no chão e no telhado ficou mais nítida; diferença máxima 116 e 2212 px com
/// diferença acima de 2. Ver tests/fixtures/CHANGELOG-referencias.md.
const REFERENCIA: &[u8] = include_bytes!("fixtures/ref-h1-640x360.png");
/// Referência com amostras = 4 (MSAA x4), gerada a partir do mesmo estado do H19.
/// Regenerada em 2026-11-05 pelo mesmo motivo de `REFERENCIA` (diferença máxima 113, 2323 px
/// acima de 2). Ver tests/fixtures/CHANGELOG-referencias.md.
const REFERENCIA_MSAA4: &[u8] = include_bytes!("fixtures/ref-h1-msaa4-640x360.png");
const LARGURA: u32 = 640;
const ALTURA: u32 = 360;
const TOLERANCIA: u8 = 2;

fn cena() -> Cena {
    Cena::decodificar(CENA).expect("fixture HSTR válido")
}

/// Decodifica o PNG de referência como RGBA8 (640x360).
fn referencia(png_bytes: &[u8]) -> Vec<u8> {
    let decodificador = png::Decoder::new(Cursor::new(png_bytes));
    let mut leitor = decodificador.read_info().expect("PNG de referência");
    let mut buffer = vec![0; leitor.output_buffer_size()];
    let info = leitor.next_frame(&mut buffer).expect("quadro do PNG");
    assert_eq!((info.width, info.height), (LARGURA, ALTURA));
    assert_eq!(info.color_type, png::ColorType::Rgba, "referência deve ser RGBA");
    assert_eq!(info.bit_depth, png::BitDepth::Eight);
    buffer[..info.buffer_size()].to_vec()
}

/// Maior diferença absoluta por canal entre dois buffers RGBA8 do mesmo tamanho.
fn maior_diferenca(a: &[u8], b: &[u8]) -> u8 {
    assert_eq!(a.len(), b.len(), "tamanhos diferentes");
    a.iter()
        .zip(b)
        .map(|(x, y)| x.abs_diff(*y))
        .max()
        .unwrap_or(0)
}

/// Copia `regiao` de `origem` (imagem `largura` de pixels) para `destino`.
fn colar(destino: &mut [u8], origem: &[u8], largura: u32, regiao: Retangulo) {
    let linha = regiao.w as usize * 4;
    for linha_i in 0..regiao.h as usize {
        let inicio_origem = linha_i * linha;
        let inicio_destino =
            ((regiao.y as usize + linha_i) * largura as usize + regiao.x as usize) * 4;
        destino[inicio_destino..inicio_destino + linha]
            .copy_from_slice(&origem[inicio_origem..inicio_origem + linha]);
    }
}

#[test]
fn imagem_inteira_igual_a_api_antiga_e_a_referencia() {
    let cena = cena();
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");

    let via_motor = motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            LARGURA,
            ALTURA,
            Retangulo {
                x: 0,
                y: 0,
                w: LARGURA,
                h: ALTURA,
            },
            1.0,
        )
        .expect("renderizar imagem inteira");
    assert_eq!(via_motor.len(), (LARGURA * ALTURA * 4) as usize);

    let via_api_antiga = renderizar_com_camera(&cena, &cena.camera, LARGURA, ALTURA, 1.0)
        .expect("API antiga")
        .rgba;
    let diferenca_antiga = maior_diferenca(&via_motor, &via_api_antiga);
    eprintln!("[prova a] Motor vs API antiga: diferença máxima = {diferenca_antiga}");
    // Garante que a imagem não é um quadro vazio (fundo uniforme).
    assert!(via_motor.chunks_exact(4).any(|p| p != &via_motor[..4]));
    assert!(
        diferenca_antiga <= TOLERANCIA,
        "Motor vs API antiga: diferença máxima {diferenca_antiga} > {TOLERANCIA}"
    );

    // Motor::nativo() usa MSAA x4: compara com a referência de 4 amostras.
    let diferenca_ref = maior_diferenca(&via_motor, &referencia(REFERENCIA_MSAA4));
    eprintln!("[prova a] Motor (4 amostras) vs referência msaa4: diferença máxima = {diferenca_ref}");
    assert!(
        diferenca_ref <= TOLERANCIA,
        "Motor (4 amostras) vs referência msaa4: diferença máxima {diferenca_ref} > {TOLERANCIA}"
    );
}

#[test]
fn sem_msaa_bate_a_referencia_estrita() {
    let cena = cena();
    let motor = Motor::nativo_com_amostras(1).expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");
    let rgba = motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            LARGURA,
            ALTURA,
            Retangulo {
                x: 0,
                y: 0,
                w: LARGURA,
                h: ALTURA,
            },
            1.0,
        )
        .expect("imagem inteira");
    let diferenca = maior_diferenca(&rgba, &referencia(REFERENCIA));
    eprintln!("[regressao] 1 amostra vs referência: diferença máxima = {diferenca}");
    assert!(
        diferenca <= TOLERANCIA,
        "1 amostra vs referência: diferença máxima {diferenca} > {TOLERANCIA}"
    );
}

#[test]
fn amostras_fora_de_1_e_4_sao_erro_de_argumento() {
    for amostras in [0, 2, 3, 5, 8] {
        let erro = Motor::nativo_com_amostras(amostras)
            .err()
            .expect("amostras inválidas devem falhar antes da GPU");
        assert!(
            matches!(erro, render_engine::ErroRender::Argumentos(_)),
            "{amostras}: esperado Argumentos, veio {erro}"
        );
    }
}

#[test]
fn nativo_usa_quatro_amostras() {
    let motor = Motor::nativo().expect("GPU com MSAA x4 necessária (sem fallback silencioso)");
    assert_eq!(motor.amostras(), 4);
}

/// Com MSAA x4, tiles e imagem inteira diferem em no máximo 5 (medido no H19: 2 canais de 1
/// pixel acima de 2, nenhum acima de 5, fora das bordas dos tiles). A causa é uma amostra de
/// cobertura a mais ou a menos numa aresta de baixo contraste, pela precisão de subpixel do
/// rasterizador com o viewport deslocado. Sem MSAA a diferença continua 1 (dentro de 2).
const TOLERANCIA_TILES_MSAA4: u8 = 5;

/// Sem MSAA, desde a sombra PCSS (S1): 137 pixels diferem em 1 e apenas 1 pixel, na borda da
/// penumbra, difere em 3 (medido com tiles 2x3 contra a imagem inteira). A busca de bloqueadores
/// lê texels por `floor`, então um erro de subpixel do viewport deslocado pode trocar um texel.
/// Antes da PCSS a diferença máxima era 1.
const TOLERANCIA_TILES_SEM_MSAA: u8 = 3;

#[test]
fn tiles_com_msaa4_igualam_a_imagem_inteira() {
    verificar_tiles_montados(4, TOLERANCIA_TILES_MSAA4);
}

#[test]
fn tiles_sem_msaa_igualam_a_imagem_inteira() {
    verificar_tiles_montados(1, TOLERANCIA_TILES_SEM_MSAA);
}

fn verificar_tiles_montados(amostras: u32, tolerancia: u8) {
    let cena = cena();
    let motor = Motor::nativo_com_amostras(amostras).expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");

    let inteira = motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            LARGURA,
            ALTURA,
            Retangulo {
                x: 0,
                y: 0,
                w: LARGURA,
                h: ALTURA,
            },
            1.0,
        )
        .expect("imagem inteira");

    // Grade com divisões desiguais e não múltiplas de 2 ou 4, para pegar erro de arredondamento.
    let xs = [0u32, 200, 430, LARGURA];
    let ys = [0u32, 100, 250, ALTURA];
    let mut montada = vec![0u8; (LARGURA * ALTURA * 4) as usize];
    for janela_y in ys.windows(2) {
        for janela_x in xs.windows(2) {
            let regiao = Retangulo {
                x: janela_x[0],
                y: janela_y[0],
                w: janela_x[1] - janela_x[0],
                h: janela_y[1] - janela_y[0],
            };
            let parte = motor
                .renderizar_regiao(&cena_gpu, &cena.camera, LARGURA, ALTURA, regiao, 1.0)
                .expect("tile");
            assert_eq!(parte.len(), (regiao.w * regiao.h * 4) as usize);
            colar(&mut montada, &parte, LARGURA, regiao);
        }
    }

    let diferenca = maior_diferenca(&montada, &inteira);
    eprintln!("[prova b] {amostras} amostras, tiles montados vs imagem inteira: diferença máxima = {diferenca}");
    assert!(
        diferenca <= tolerancia,
        "tiles vs imagem inteira ({amostras} amostras): diferença máxima {diferenca} > {tolerancia}"
    );
}

#[test]
fn reuso_da_cena_e_do_motor_repete_o_mesmo_resultado() {
    let cena = cena();
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");
    let regiao = Retangulo {
        x: 64,
        y: 32,
        w: 128,
        h: 96,
    };

    let primeira = motor
        .renderizar_regiao(&cena_gpu, &cena.camera, LARGURA, ALTURA, regiao, 1.0)
        .expect("primeira chamada");
    let segunda = motor
        .renderizar_regiao(&cena_gpu, &cena.camera, LARGURA, ALTURA, regiao, 1.0)
        .expect("segunda chamada");
    assert_eq!(maior_diferenca(&primeira, &segunda), 0);
}

#[test]
fn regioes_invalidas_sao_erro_de_argumento() {
    let cena = cena();
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");
    let casos = [
        Retangulo { x: 0, y: 0, w: 0, h: 10 },
        Retangulo { x: 0, y: 0, w: 10, h: 0 },
        Retangulo { x: 600, y: 0, w: 41, h: 10 },
        Retangulo { x: 0, y: 350, w: 10, h: 11 },
        Retangulo { x: u32::MAX, y: 0, w: 2, h: 1 },
    ];
    for regiao in casos {
        let erro = motor
            .renderizar_regiao(&cena_gpu, &cena.camera, LARGURA, ALTURA, regiao, 1.0)
            .expect_err("região inválida deve falhar");
        assert!(
            matches!(erro, render_engine::ErroRender::Argumentos(_)),
            "{regiao:?}: esperado Argumentos, veio {erro}"
        );
    }
}

#[test]
fn media_de_luminancia_fica_em_faixa_razoavel() {
    // Regressão do ambiente por céu SH9: nem preto, nem estourado.
    let cena = cena();
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");
    let rgba = motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            LARGURA,
            ALTURA,
            Retangulo {
                x: 0,
                y: 0,
                w: LARGURA,
                h: ALTURA,
            },
            1.0,
        )
        .expect("imagem inteira");
    let pixels = (LARGURA * ALTURA) as f64;
    let media: f64 = rgba
        .chunks_exact(4)
        .map(|p| 0.2126 * p[0] as f64 + 0.7152 * p[1] as f64 + 0.0722 * p[2] as f64)
        .sum::<f64>()
        / pixels;
    eprintln!("[regressao] luminância média = {media:.2}");
    assert!((10.0..=245.0).contains(&media), "média de luminância {media:.2} fora de 10..245");
}

/// Luminância (Rec. 709) do pixel `(x, y)` de um buffer RGBA8 de `LARGURA` pixels.
fn luminancia_em(rgba: &[u8], x: u32, y: u32) -> f64 {
    let i = ((y * LARGURA + x) * 4) as usize;
    0.2126 * rgba[i] as f64 + 0.7152 * rgba[i + 1] as f64 + 0.0722 * rgba[i + 2] as f64
}

#[test]
fn oclusao_escurece_a_base_da_parede_e_poupa_a_face_plana() {
    // Valores medidos no estado anterior ao SSAO (H1, 640x360, MSAA x4). A base é a média de
    // 10 px acima da linha de contato parede-rodapé, nas colunas 206..246. A face plana é a
    // empena (x 380..420, y 200..240), longe de cantos.
    const BASE_SEM_OCLUSAO: f64 = 126.86;
    const PLANA_SEM_OCLUSAO: f64 = 126.83;

    let cena = cena();
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");
    let rgba = motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            LARGURA,
            ALTURA,
            Retangulo {
                x: 0,
                y: 0,
                w: LARGURA,
                h: ALTURA,
            },
            1.0,
        )
        .expect("imagem inteira");

    // Contato: primeira queda de mais de 12 de luminância abaixo de y = 226.
    let mut medias = Vec::new();
    for x in 206..246 {
        let contato = (227..262)
            .find(|&y| luminancia_em(&rgba, x, y - 1) - luminancia_em(&rgba, x, y) > 12.0)
            .expect("linha de contato na coluna");
        let faixa: f64 = (contato - 10..contato)
            .map(|y| luminancia_em(&rgba, x, y))
            .sum::<f64>()
            / 10.0;
        medias.push(faixa);
    }
    let base = medias.iter().sum::<f64>() / medias.len() as f64;

    let mut soma_plana = 0.0;
    for y in 200..240 {
        for x in 380..420 {
            soma_plana += luminancia_em(&rgba, x, y);
        }
    }
    let plana = soma_plana / (40.0 * 40.0);

    let queda_base = 100.0 * (BASE_SEM_OCLUSAO - base) / BASE_SEM_OCLUSAO;
    let variacao_plana = 100.0 * (plana - PLANA_SEM_OCLUSAO) / PLANA_SEM_OCLUSAO;
    eprintln!(
        "[oclusao] base {BASE_SEM_OCLUSAO:.2} -> {base:.2} ({queda_base:.2}% mais escura); \
         plana {PLANA_SEM_OCLUSAO:.2} -> {plana:.2} ({variacao_plana:+.2}%)"
    );
    assert!(
        queda_base >= 5.0,
        "a base da parede deveria escurecer ao menos 5%: caiu {queda_base:.2}%"
    );
    assert!(
        variacao_plana.abs() < 3.0,
        "a face plana exposta variou {variacao_plana:+.2}% (limite 3%)"
    );
}
