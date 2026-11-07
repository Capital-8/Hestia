//! Orçamento de memória e política de tiles do modo pt. Funções puras, testáveis sem GPU.
//!
//! Contas (todas em bytes):
//! - cena: BVH (nós e triângulos), materiais e os arrays de textura com todos os mips (`bytes_do_plano`);
//! - render: acumulado de radiância em ping-pong (2 RGBA32F), acumulado de R em ping-pong (2), G-buffer
//!   do primeiro acerto (2: geo e normal) e uma leitura transitória do acumulado (1); com denoise, mais 3
//!   (duas intermediárias e a saída). Cada RGBA32F custa 16 bytes por pixel.

use crate::erro::ErroPt;

/// Bytes de um pixel RGBA32F.
pub const BYTES_PIXEL_RGBA32F: u64 = 16;
/// RGBA32F por pixel sem denoise: acumulado de radiância (2), acumulado de R (2), G-buffer (2) e leitura
/// transitória (1).
pub const TEXTURAS_DO_RENDER: u64 = 2 + 2 + 2 + 1;
/// RGBA32F extras do denoise (duas intermediárias e a saída).
pub const TEXTURAS_DO_DENOISE: u64 = 3;

/// Submissão de GPU acima deste tempo (ms) é o limite do watchdog do Windows (TDR); o modo pt divide o
/// passe em tiles antes de chegar nele.
pub const LIMITE_SUBMISSAO_MS: f64 = 300.0;
/// Lado do tile quando o passe inteiro passa de `LIMITE_SUBMISSAO_MS`.
pub const LADO_TILE_PT: u32 = 256;
/// Menor lado de tile que a política reduz.
pub const LADO_TILE_MINIMO: u32 = 64;

/// Bytes dos alvos de um render de `largura x altura`. Sem denoise, 7 RGBA32F por pixel; com denoise,
/// 10 (o denoise soma 3 texturas).
pub fn bytes_alvos(largura: u32, altura: u32, denoise: bool) -> u64 {
    let pixels = u64::from(largura) * u64::from(altura);
    let texturas = TEXTURAS_DO_RENDER + if denoise { TEXTURAS_DO_DENOISE } else { 0 };
    pixels * BYTES_PIXEL_RGBA32F * texturas
}

/// Bytes da cena na GPU: BVH, materiais e texturas.
pub fn bytes_cena(bytes_nos: u64, bytes_triangulos: u64, bytes_materiais: u64, bytes_texturas: u64) -> u64 {
    bytes_nos + bytes_triangulos + bytes_materiais + bytes_texturas
}

/// `Ok` se `necessario` cabe em `orcamento`; senão o erro com os dois números.
pub fn verificar(necessario: u64, orcamento: u64) -> Result<(), ErroPt> {
    if necessario > orcamento {
        Err(ErroPt::Memoria { necessario, orcamento })
    } else {
        Ok(())
    }
}

/// Lado do tile do próximo passe, dado o lado atual (0 = passe inteiro) e a maior submissão do último
/// passe. Abaixo do limite, mantém. Acima: sai do passe inteiro para tiles de `LADO_TILE_PT`, e um
/// tile que ainda passa reduz o lado pela metade (sem passar do mínimo).
pub fn decidir_lado_tile(lado: u32, pior_submissao_ms: f64) -> u32 {
    if pior_submissao_ms <= LIMITE_SUBMISSAO_MS {
        lado
    } else if lado == 0 {
        LADO_TILE_PT
    } else {
        (lado / 2).max(LADO_TILE_MINIMO)
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn alvos_contam_o_que_o_render_aloca() {
        // 1280x720 = 921.600 px; 7 RGBA32F de 16 bytes (sem denoise), 10 com denoise.
        assert_eq!(bytes_alvos(1280, 720, false), 921_600 * 16 * 7);
        assert_eq!(bytes_alvos(1280, 720, true), 921_600 * 16 * 10);
    }

    #[test]
    fn orcamento_recusa_com_os_dois_numeros() {
        assert_eq!(verificar(100, 100), Ok(()));
        assert_eq!(
            verificar(101, 100),
            Err(ErroPt::Memoria { necessario: 101, orcamento: 100 })
        );
    }

    #[test]
    fn imagem_grande_estoura_o_perfil_leve() {
        // 4K com denoise: 3840*2160*16*9 ≈ 1.19 GB, acima do orçamento de 1 GiB do perfil leve.
        let alvos = bytes_alvos(3840, 2160, true);
        assert!(verificar(alvos, 1024 * 1024 * 1024).is_err());
        // 1080p com denoise cabe no padrão (2 GiB).
        assert!(verificar(bytes_alvos(1920, 1080, true), 2048 * 1024 * 1024).is_ok());
    }

    #[test]
    fn passe_rapido_mantem_o_passe_inteiro() {
        assert_eq!(decidir_lado_tile(0, 84.0), 0);
        assert_eq!(decidir_lado_tile(256, 300.0), 256);
    }

    #[test]
    fn passe_lento_passa_a_tiles_e_tile_lento_reduz() {
        assert_eq!(decidir_lado_tile(0, 301.0), LADO_TILE_PT);
        assert_eq!(decidir_lado_tile(256, 500.0), 128);
        assert_eq!(decidir_lado_tile(128, 900.0), 64);
        // No mínimo, não desce mais.
        assert_eq!(decidir_lado_tile(64, 2_000.0), 64);
    }
}
