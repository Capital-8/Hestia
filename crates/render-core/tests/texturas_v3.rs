//! HSTR v3: índices de textura por material e seção de texturas com cadeia de mips.
//!
//! Layout usado nas contas de offset (cena de um triângulo, sem normais nem fundo):
//! cabeçalho 32 + posições 36 + índices 12 = 80, depois os materiais (68 bytes cada na v3), depois a
//! seção de texturas (quantidade u32; por textura: largura, altura, níveis u32 e os pixels), lotes,
//! sol e câmera.

use render_core::camera::Camera;
use render_core::cena::{
    Cena, Lote, Material, PartesCena, Sol, Textura, MAX_TEXTURAS, SEM_TEXTURA, TAMANHO_MATERIAL_V3,
    VERSAO_CENA, VERSAO_CENA_V2,
};
use render_core::erro::Erro;
use render_core::vetor::Vec3;

/// Início dos materiais: cabeçalho (32), posições (36) e índices (12).
const INICIO_MATERIAIS: usize = 32 + 36 + 12;

/// Padrão xadrez de 8x8, um texel por quadrado, em duas cores vivas.
fn tabuleiro_8x8() -> Vec<u8> {
    let mut pixels = Vec::with_capacity(8 * 8 * 4);
    for y in 0..8u32 {
        for x in 0..8u32 {
            let par = (x + y) % 2 == 0;
            let cor = if par { [230, 40, 40, 255] } else { [20, 20, 200, 255] };
            pixels.extend_from_slice(&cor);
        }
    }
    pixels
}

/// Reduz um nível a metade (média de blocos 2x2, com a borda repetida quando o lado é 1).
fn reduzir(nivel: &[u8], largura: u32, altura: u32) -> (Vec<u8>, u32, u32) {
    let (w2, h2) = Textura::dimensoes_do_nivel(largura, altura, 1);
    let mut saida = Vec::with_capacity((w2 * h2 * 4) as usize);
    for y in 0..h2 {
        for x in 0..w2 {
            for canal in 0..4usize {
                let mut soma = 0u32;
                for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                    let sx = (2 * x + dx).min(largura - 1);
                    let sy = (2 * y + dy).min(altura - 1);
                    soma += u32::from(nivel[((sy * largura + sx) * 4) as usize + canal]);
                }
                saida.push(((soma + 2) / 4) as u8);
            }
        }
    }
    (saida, w2, h2)
}

/// Textura com a cadeia completa de mips gerada a partir da imagem de nível 0.
fn cadeia(largura: u32, altura: u32, base: Vec<u8>) -> Textura {
    let mut niveis = vec![base];
    for nivel in 1..Textura::niveis_completos(largura, altura) {
        let (w, h) = Textura::dimensoes_do_nivel(largura, altura, nivel - 1);
        let (proximo, _, _) = reduzir(&niveis[(nivel - 1) as usize], w, h);
        niveis.push(proximo);
    }
    Textura {
        largura,
        altura,
        niveis,
    }
}

fn material_com(texturas: [Option<u32>; 4]) -> Material {
    Material {
        cor_base: [0.8, 0.8, 0.8],
        rugosidade: 0.6,
        metalico: 0.0,
        opacidade: 1.0,
        transmissao: 0.0,
        ior: 1.5,
        emissivo: [0.0, 0.0, 0.0],
        tipo: 0,
        escala: 1.0,
        texturas,
    }
}

fn cena_com(materiais: Vec<Material>, texturas: Vec<Textura>) -> Result<Cena, Erro> {
    let camera = Camera::olhando_para(
        Vec3::novo(0.0, -3.0, 2.0),
        Vec3::novo(0.0, 0.0, 0.0),
        Vec3::novo(0.0, 0.0, 1.0),
        0.9,
        16.0 / 9.0,
        0.1,
        100.0,
    )
    .expect("câmera");
    Cena::nova(PartesCena {
        posicoes: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        indices: vec![0, 1, 2],
        normais: Vec::new(),
        materiais,
        texturas,
        lotes: vec![Lote {
            inicio_indices: 0,
            quantidade_indices: 3,
            material: 0,
        }],
        sol: Sol::padrao(),
        fundo: None,
        camera,
    })
}

fn u32_em(bytes: &[u8], deslocamento: usize) -> u32 {
    u32::from_le_bytes(bytes[deslocamento..deslocamento + 4].try_into().expect("4 bytes"))
}

fn gravar_u32(bytes: &mut [u8], deslocamento: usize, valor: u32) {
    bytes[deslocamento..deslocamento + 4].copy_from_slice(&valor.to_le_bytes());
}

/// Cena de um material com albedo na textura 0 (8x8, mips), codificada em v3.
fn cena_um_albedo() -> (Cena, Vec<u8>) {
    let cena = cena_com(
        vec![material_com([Some(0), None, None, None])],
        vec![cadeia(8, 8, tabuleiro_8x8())],
    )
    .expect("cena válida");
    let bytes = cena.codificar();
    (cena, bytes)
}

#[test]
fn v3_com_albedo_de_textura_8x8_vai_e_volta() {
    let (_cena, bytes) = cena_um_albedo();

    assert_eq!(&bytes[0..4], b"HSTR");
    assert_eq!(u32_em(&bytes, 4), VERSAO_CENA, "escrita com textura usa a versão 3");
    assert_eq!(u32_em(&bytes, 4), 3);

    // Material: 68 bytes; os quatro índices ficam no fim do bloco, na ordem albedo, normal,
    // rugosidade, metálico.
    let indices_material = INICIO_MATERIAIS + 52;
    assert_eq!(u32_em(&bytes, indices_material), 0, "albedo aponta para a textura 0");
    for canal in 1..4 {
        assert_eq!(u32_em(&bytes, indices_material + 4 * canal), SEM_TEXTURA);
    }

    // Seção de texturas logo após o material, antes dos lotes.
    let secao = INICIO_MATERIAIS + TAMANHO_MATERIAL_V3;
    assert_eq!(u32_em(&bytes, secao), 1, "quantidade de texturas");
    assert_eq!(u32_em(&bytes, secao + 4), 8, "largura");
    assert_eq!(u32_em(&bytes, secao + 8), 8, "altura");
    assert_eq!(u32_em(&bytes, secao + 12), 4, "níveis de mip de 8x8 até 1x1");
    // 4 (quantidade) + 12 (cabeçalho) + 256 + 64 + 16 + 4 (pixels) = 356 bytes na seção.
    let fim_secao = secao + 356;
    // Mais lote (12), sol (12) e câmera (148), sem normais nem fundo.
    assert_eq!(bytes.len(), fim_secao + 12 + 12 + 148);

    let lida = Cena::decodificar(&bytes).expect("decodifica v3");
    assert_eq!(lida.materiais[0].texturas, [Some(0), None, None, None]);
    assert_eq!(lida.texturas.len(), 1);
    let textura = &lida.texturas[0];
    assert_eq!((textura.largura, textura.altura), (8, 8));
    let tamanhos: Vec<usize> = textura.niveis.iter().map(Vec::len).collect();
    assert_eq!(tamanhos, vec![256, 64, 16, 4], "tamanho de cada nível RGBA8");
    assert_eq!(textura.niveis[0], tabuleiro_8x8(), "pixels do nível 0 preservados");

    assert_eq!(lida.codificar(), bytes, "segundo round-trip é idêntico");
}

#[test]
fn round_trip_com_duas_texturas_de_mips() {
    let textura_a = cadeia(8, 8, tabuleiro_8x8());
    // 3x5: cadeia de 3 níveis (3x5, 1x2, 1x1), com lado que não é potência de dois.
    let base_b: Vec<u8> = (0..3 * 5 * 4).map(|i| (i * 7 % 251) as u8).collect();
    let textura_b = cadeia(3, 5, base_b);
    assert_eq!(textura_b.niveis.len(), 3);

    let materiais = vec![
        material_com([Some(0), Some(1), None, Some(1)]),
        material_com([None, None, Some(0), None]),
    ];
    let cena = cena_com(materiais, vec![textura_a.clone(), textura_b.clone()]).expect("cena");
    let bytes = cena.codificar();
    assert_eq!(u32_em(&bytes, 4), VERSAO_CENA);

    let lida = Cena::decodificar(&bytes).expect("decodifica");
    assert_eq!(lida.texturas, vec![textura_a, textura_b]);
    assert_eq!(lida.materiais[0].texturas, [Some(0), Some(1), None, Some(1)]);
    assert_eq!(lida.materiais[1].texturas, [None, None, Some(0), None]);
    assert_eq!(lida.codificar(), bytes);
}

#[test]
fn cena_sem_textura_continua_em_v2_e_lida_sem_textura() {
    let cena = cena_com(vec![Material::padrao()], Vec::new()).expect("cena");
    let bytes = cena.codificar();
    assert_eq!(u32_em(&bytes, 4), VERSAO_CENA_V2, "sem textura grava a v2");
    assert_eq!(u32_em(&bytes, 4), 2);
    let lida = Cena::decodificar(&bytes).expect("decodifica v2");
    assert!(lida.texturas.is_empty());
    assert_eq!(lida.materiais[0].texturas, [None; 4]);
}

#[test]
fn indice_fora_da_lista_e_recusado_na_montagem() {
    let erro = cena_com(
        vec![material_com([Some(1), None, None, None])],
        vec![cadeia(8, 8, tabuleiro_8x8())],
    )
    .err();
    assert_eq!(erro, Some(Erro::CenaInvalida));
}

#[test]
fn indice_fora_da_lista_e_recusado_na_leitura() {
    let mut cena = cena_com(
        vec![material_com([Some(0), None, None, None])],
        vec![cadeia(8, 8, tabuleiro_8x8())],
    )
    .expect("cena");
    // Sem passar pela validação: o codificador grava o índice 7 e a leitura precisa recusar.
    cena.materiais[0].texturas[0] = Some(7);
    assert_eq!(
        Cena::decodificar(&cena.codificar()).err(),
        Some(Erro::CenaInvalida)
    );
}

#[test]
fn limites_de_textura_sao_recusados_na_leitura() {
    let (_cena, bytes) = cena_um_albedo();
    let secao = INICIO_MATERIAIS + TAMANHO_MATERIAL_V3;
    let quantidade = secao;
    let largura = secao + 4;
    let altura = secao + 8;
    let niveis = secao + 12;

    let recusada = |mut b: Vec<u8>, deslocamento: usize, valor: u32| {
        gravar_u32(&mut b, deslocamento, valor);
        Cena::decodificar(&b).err()
    };

    assert_eq!(recusada(bytes.clone(), quantidade, MAX_TEXTURAS + 1), Some(Erro::CenaInvalida));
    assert_eq!(recusada(bytes.clone(), largura, 0), Some(Erro::CenaInvalida));
    assert_eq!(recusada(bytes.clone(), largura, 8193), Some(Erro::CenaInvalida));
    assert_eq!(recusada(bytes.clone(), altura, 0), Some(Erro::CenaInvalida));
    assert_eq!(recusada(bytes.clone(), niveis, 0), Some(Erro::CenaInvalida));
    // 8x8 tem no máximo 4 níveis (8, 4, 2, 1).
    assert_eq!(recusada(bytes.clone(), niveis, 5), Some(Erro::CenaInvalida));
    // Textura declarada de 8192x8192 com a cadeia inteira: o buffer não tem esses bytes.
    let mut grande = bytes.clone();
    gravar_u32(&mut grande, largura, 8192);
    gravar_u32(&mut grande, altura, 8192);
    gravar_u32(&mut grande, niveis, 1);
    assert_eq!(Cena::decodificar(&grande).err(), Some(Erro::CenaInvalida));
    // Bytes faltando no fim da seção (buffer truncado) também são recusados.
    assert_eq!(
        Cena::decodificar(&bytes[..bytes.len() - 4]).err(),
        Some(Erro::CenaInvalida)
    );
}

#[test]
fn limites_de_textura_sao_recusados_na_montagem() {
    // Quantidade acima de 64.
    let muitas: Vec<Textura> = (0..=MAX_TEXTURAS)
        .map(|_| Textura {
            largura: 1,
            altura: 1,
            niveis: vec![vec![0, 0, 0, 255]],
        })
        .collect();
    assert_eq!(cena_com(vec![Material::padrao()], muitas).err(), Some(Erro::CenaInvalida));

    // Largura zero, lado acima de 8192 e número de níveis errado.
    let zero = Textura {
        largura: 0,
        altura: 1,
        niveis: vec![vec![]],
    };
    let grande = Textura {
        largura: 8193,
        altura: 1,
        niveis: vec![vec![0; 8193 * 4]],
    };
    let niveis_demais = Textura {
        largura: 2,
        altura: 2,
        niveis: vec![vec![0; 16], vec![0; 4], vec![0; 4]],
    };
    let tamanho_errado = Textura {
        largura: 2,
        altura: 2,
        niveis: vec![vec![0; 15]],
    };
    for textura in [zero, grande, niveis_demais, tamanho_errado] {
        assert!(!textura.valida());
        assert_eq!(
            cena_com(vec![Material::padrao()], vec![textura]).err(),
            Some(Erro::CenaInvalida)
        );
    }
}
