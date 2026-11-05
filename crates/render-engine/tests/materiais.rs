//! Materiais procedurais (HSTR v2): a cena `cena-materiais.hstr` renderiza sem erro e não é preta,
//! e a cena H1 lida como v1 (tipo 0 em tudo) continua igual à referência.
//!
//! Exigem GPU nativa, como os demais testes de `Motor`. O fixture `cena-materiais.hstr` é gerado
//! pelo teste ignorado `gerar_fixture_cena_materiais` (`cargo test --test materiais -- --ignored`).

use std::io::Cursor;
use std::path::PathBuf;

use render_core::{Cena, Textura};
use render_engine::{Motor, Retangulo};

const LARGURA: u32 = 640;
const ALTURA: u32 = 360;
const TOLERANCIA: u8 = 3;

fn caminho_fixture(nome: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(nome)
}

fn ler_fixture(nome: &str) -> Vec<u8> {
    std::fs::read(caminho_fixture(nome)).expect("fixture existe")
}

/// Decodifica o PNG de referência como RGBA8 (640x360).
fn referencia(nome: &str) -> Vec<u8> {
    let bytes = ler_fixture(nome);
    let mut leitor = png::Decoder::new(Cursor::new(bytes)).read_info().expect("PNG");
    let mut buffer = vec![0; leitor.output_buffer_size()];
    let info = leitor.next_frame(&mut buffer).expect("quadro");
    assert_eq!((info.width, info.height), (LARGURA, ALTURA));
    buffer[..info.buffer_size()].to_vec()
}

fn renderizar(cena: &Cena, motor: &Motor) -> Vec<u8> {
    let cena_gpu = motor.carregar_cena(cena).expect("carregar cena");
    motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            LARGURA,
            ALTURA,
            Retangulo { x: 0, y: 0, w: LARGURA, h: ALTURA },
            1.0,
        )
        .expect("renderizar")
}

fn maior_diferenca(a: &[u8], b: &[u8]) -> u8 {
    a.iter().zip(b).map(|(x, y)| x.abs_diff(*y)).max().unwrap_or(0)
}

/// Tipos por índice de material, como a cena de prova: chão, parede, telha, porta, janela, chaminé.
const TIPOS_DE_PROVA: [(usize, u8); 6] = [(0, 4), (1, 1), (2, 3), (3, 2), (4, 6), (5, 7)];
/// Índice da janela (vidro, tipo 6) na cena de prova e sua opacidade. A H1 gravou opacidade 1,0
/// para todos os materiais; sem um valor abaixo de 1 a janela seria um sólido sem transmissão.
const INDICE_JANELA: usize = 4;
const OPACIDADE_JANELA: f64 = 0.25;

#[test]
#[ignore = "gera tests/fixtures/cena-materiais.hstr; rodar com --ignored"]
fn gerar_fixture_cena_materiais() {
    let mut cena = Cena::decodificar(&ler_fixture("cena-h1.hstr")).expect("H1 válido");
    for (indice, tipo) in TIPOS_DE_PROVA {
        cena.materiais[indice].tipo = tipo;
    }
    cena.materiais[INDICE_JANELA].opacidade = OPACIDADE_JANELA;
    std::fs::write(caminho_fixture("cena-materiais.hstr"), cena.codificar()).expect("gravar fixture");
}

#[test]
fn cena_materiais_renderiza_sem_erro_e_nao_e_preta() {
    let cena = Cena::decodificar(&ler_fixture("cena-materiais.hstr")).expect("fixture v2");
    let tipos: Vec<u8> = cena.materiais.iter().map(|m| m.tipo).collect();
    for tipo in [1u8, 2, 3, 4, 6, 7] {
        assert!(tipos.contains(&tipo), "tipo {tipo} ausente da cena de prova");
    }
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let rgba = renderizar(&cena, &motor);
    assert!(rgba.chunks_exact(4).any(|p| p[0] > 0 || p[1] > 0 || p[2] > 0), "imagem preta");
    let soma: f64 = rgba
        .chunks_exact(4)
        .map(|p| 0.2126 * p[0] as f64 + 0.7152 * p[1] as f64 + 0.0722 * p[2] as f64)
        .sum();
    let media = soma / (LARGURA * ALTURA) as f64;
    eprintln!("[materiais] luminância média = {media:.2}");
    assert!((10.0..=245.0).contains(&media), "luminância média {media:.2} fora de 10..245");
}

#[test]
fn cena_h1_lida_como_v1_tem_tipo_zero_e_bate_a_referencia() {
    let cena = Cena::decodificar(&ler_fixture("cena-h1.hstr")).expect("H1 v1");
    assert_eq!(&ler_fixture("cena-h1.hstr")[4..8], &1u32.to_le_bytes(), "fixture é v1");
    for m in &cena.materiais {
        assert_eq!(m.tipo, 0);
        assert_eq!(m.escala, 1.0);
    }
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let rgba = renderizar(&cena, &motor);
    let diferenca = maior_diferenca(&rgba, &referencia("ref-h1-msaa4-640x360.png"));
    eprintln!("[regressao tipo 0] H1 v1 vs referência msaa4: diferença máxima = {diferenca}");
    assert!(diferenca <= TOLERANCIA, "diferença máxima {diferenca} > {TOLERANCIA}");
}

/// Janela de vidro (tipo 6) da cena de prova, em pixels: x0..x1 e y0..y1 exclusivos. É a janela
/// da direita, a maior. O caixilho claro (luminância acima de 115) fica de fora da conta.
const JANELA_VIDRO: (u32, u32, u32, u32) = (291, 322, 209, 256);
const LUMINANCIA_MAXIMA_VIDRO: f64 = 115.0;

/// Luminância (Rec. 709) de um pixel RGBA8.
fn luminancia(p: &[u8]) -> f64 {
    0.2126 * p[0] as f64 + 0.7152 * p[1] as f64 + 0.0722 * p[2] as f64
}

/// Luminância dos pixels escuros da janela (o vidro). O caixilho, mais claro, não entra.
fn luminancias_do_vidro(rgba: &[u8]) -> Vec<f64> {
    let (x0, x1, y0, y1) = JANELA_VIDRO;
    let mut valores = Vec::new();
    for y in y0..y1 {
        for x in x0..x1 {
            let i = ((y * LARGURA + x) * 4) as usize;
            let lum = luminancia(&rgba[i..i + 4]);
            if lum < LUMINANCIA_MAXIMA_VIDRO {
                valores.push(lum);
            }
        }
    }
    valores
}

fn media_e_desvio(valores: &[f64]) -> (f64, f64) {
    let n = valores.len() as f64;
    let media = valores.iter().sum::<f64>() / n;
    let variancia = valores.iter().map(|v| (v - media).powi(2)).sum::<f64>() / n;
    (media, variancia.sqrt())
}

#[test]
fn vidro_mostra_o_fundo_e_nao_e_chapado() {
    let cena = Cena::decodificar(&ler_fixture("cena-materiais.hstr")).expect("fixture v2");
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let rgba = renderizar(&cena, &motor);
    let valores = luminancias_do_vidro(&rgba);
    assert!(valores.len() > 900, "janela de vidro com {} pixels azulados", valores.len());
    let (media, desvio) = media_e_desvio(&valores);
    eprintln!("[vidro] janela: luminância média {media:.2}, desvio {desvio:.2}");
    // Máscara deste teste (luminância < 115 na janela): desvio 6,12 com o vidro. A mesma janela pela
    // silhueta azul do estado anterior ao vidro dá 1,60 antes e 2,16 depois (medido em 2026-11-05;
    // a máscara por luminância pega também as bordas escuras do caixilho). O limite abaixo é só
    // um guarda contra a janela chapada.
    assert!(desvio > 1.8, "janela chapada: desvio {desvio:.2}");
    assert!((10.0..=245.0).contains(&media), "média da janela {media:.2} fora de 10..245");
}

/// Tiles com vidro: a diferença entre tiles e imagem inteira, medida dentro da janela de vidro,
/// tem que caber na tolerância dos tiles (ver tests/motor.rs), sem aumentá-la. A janela do passe
/// opaco inclui a margem da refração, então a cor de tela perto da borda do tile é a da imagem.
/// Fora da janela a cena tem diferenças de tile que já existem sem o vidro (ver
/// `verificar_tiles_com_vidro`): elas não são medidas por este teste.
#[test]
fn tiles_com_vidro_igualam_a_imagem_inteira_msaa4() {
    verificar_tiles_com_vidro(4, 5);
}

#[test]
fn tiles_com_vidro_igualam_a_imagem_inteira_sem_msaa() {
    verificar_tiles_com_vidro(1, 3);
}

fn verificar_tiles_com_vidro(amostras: u32, tolerancia: u8) {
    let cena = Cena::decodificar(&ler_fixture("cena-materiais.hstr")).expect("fixture v2");
    let motor = Motor::nativo_com_amostras(amostras).expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");
    let inteira_regiao = Retangulo { x: 0, y: 0, w: LARGURA, h: ALTURA };
    let inteira = motor
        .renderizar_regiao(&cena_gpu, &cena.camera, LARGURA, ALTURA, inteira_regiao, 1.0)
        .expect("imagem inteira");

    // Mesma grade desigual de tests/motor.rs; a janela da direita cruza a linha y = 250.
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
            let linha = regiao.w as usize * 4;
            for l in 0..regiao.h as usize {
                let destino = ((regiao.y as usize + l) * LARGURA as usize + regiao.x as usize) * 4;
                montada[destino..destino + linha].copy_from_slice(&parte[l * linha..(l + 1) * linha]);
            }
        }
    }
    // Dentro da janela do vidro: a diferença que o passe de vidro pode causar.
    let (x0, x1, y0, y1) = JANELA_VIDRO;
    let mut dentro = 0u8;
    for y in y0..y1 {
        for x in x0..x1 {
            let i = ((y * LARGURA + x) * 4) as usize;
            for c in 0..3 {
                dentro = dentro.max(montada[i + c].abs_diff(inteira[i + c]));
            }
        }
    }
    // Imagem toda: inclui as diferenças do caminho opaco (procedural), medidas também sem vidro.
    let toda = maior_diferenca(&montada, &inteira);
    eprintln!(
        "[vidro] {amostras} amostras, tiles vs imagem inteira: janela de vidro = {dentro}, imagem toda = {toda}"
    );
    assert!(
        dentro <= tolerancia,
        "tiles com vidro ({amostras} amostras): diferença na janela {dentro} > {tolerancia}"
    );
}

/// Textura de albedo para a prova: xadrez vermelho e azul de 8x8 texels, só com o nível 0 de mip.
fn textura_xadrez() -> Textura {
    let mut pixels = Vec::with_capacity(8 * 8 * 4);
    for y in 0..8u32 {
        for x in 0..8u32 {
            let cor = if (x + y) % 2 == 0 { [255, 0, 0, 255] } else { [0, 0, 255, 255] };
            pixels.extend_from_slice(&cor);
        }
    }
    Textura {
        largura: 8,
        altura: 8,
        niveis: vec![pixels],
    }
}

#[test]
fn textura_de_albedo_muda_a_imagem() {
    // Chaminé (material 5, tijolo) com albedo de xadrez: o caminho com textura tem que aparecer na
    // imagem. Sem a textura a cena fica igual à da fixture (ver os outros testes).
    let sem = Cena::decodificar(&ler_fixture("cena-materiais.hstr")).expect("fixture v2");
    let mut com = Cena::decodificar(&ler_fixture("cena-materiais.hstr")).expect("fixture v2");
    com.texturas.push(textura_xadrez());
    com.materiais[5].texturas[0] = Some(0);
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let diferenca = maior_diferenca(&renderizar(&sem, &motor), &renderizar(&com, &motor));
    eprintln!("[texturas] albedo de xadrez na chaminé: diferença máxima = {diferenca}");
    assert!(diferenca > 40, "a textura de albedo não alterou a imagem (diferença {diferenca})");
}

#[test]
fn textura_alem_do_limite_da_gpu_e_recusada() {
    // O núcleo aceita até 64 texturas, mas o grupo 1 da GPU tem 16 slots: a recusa é explícita.
    let mut cena = Cena::decodificar(&ler_fixture("cena-materiais.hstr")).expect("fixture v2");
    cena.texturas = (0..17).map(|_| textura_xadrez()).collect();
    let motor = Motor::nativo().expect("GPU nativa necessária para este teste");
    let erro = motor.carregar_cena(&cena).err().expect("17 texturas devem ser recusadas");
    assert!(erro.to_string().contains("17 texturas"), "mensagem: {erro}");
}
