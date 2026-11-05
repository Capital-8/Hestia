//! Tiles da imagem final em ordem espiral (do centro para as bordas).
//!
//! A ordem é determinística: distância ao quadrado do centro do tile ao centro da imagem, com
//! desempate por `y` e depois por `x`. As contas usam o dobro das coordenadas, então o centro da
//! imagem é inteiro e nenhum arredondamento entra na comparação. Usa `i128` para não estourar com
//! imagens de largura próxima de `u32::MAX`.

use crate::erro::ErroRender;
use crate::motor::Retangulo;

/// Tiles de `lado` x `lado` (bordas menores), ordenados do centro para fora.
/// Empate: menor y, depois menor x. Erro se algum argumento for zero.
pub fn ordenar_tiles_espiral(
    largura: u32,
    altura: u32,
    lado: u32,
) -> Result<Vec<Retangulo>, ErroRender> {
    if largura == 0 || altura == 0 || lado == 0 {
        return Err(ErroRender::Argumentos(format!(
            "tiles exigem largura, altura e lado maiores que zero (recebido {largura}x{altura}, lado {lado})"
        )));
    }

    let colunas = largura.div_ceil(lado);
    let linhas = altura.div_ceil(lado);
    let mut tiles = Vec::with_capacity(colunas as usize * linhas as usize);

    for linha in 0..linhas {
        let y = linha * lado;
        let h = lado.min(altura - y);
        for coluna in 0..colunas {
            let x = coluna * lado;
            let w = lado.min(largura - x);
            tiles.push(Retangulo { x, y, w, h });
        }
    }

    tiles.sort_by_key(|t| chave_espiral(t, largura, altura));
    Ok(tiles)
}

/// Chave de ordenação: distância ao quadrado (em dobro, exata) e depois `y` e `x`.
fn chave_espiral(t: &Retangulo, largura: u32, altura: u32) -> (i128, u32, u32) {
    let dx = 2 * i128::from(t.x) + i128::from(t.w) - i128::from(largura);
    let dy = 2 * i128::from(t.y) + i128::from(t.h) - i128::from(altura);
    (dx * dx + dy * dy, t.y, t.x)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn distancia(t: &Retangulo, largura: u32, altura: u32) -> i128 {
        chave_espiral(t, largura, altura).0
    }

    #[test]
    fn t1_cobertura_soma_areas() {
        let tiles = ordenar_tiles_espiral(1000, 600, 256).unwrap();
        let area: u64 = tiles.iter().map(|t| u64::from(t.w) * u64::from(t.h)).sum();
        assert_eq!(area, 1000 * 600);
    }

    #[test]
    fn t2_sem_sobreposicao() {
        let (largura, altura) = (333u32, 187u32);
        let tiles = ordenar_tiles_espiral(largura, altura, 64).unwrap();
        let mut grade = vec![0u32; (largura * altura) as usize];
        for t in &tiles {
            for yy in t.y..t.y + t.h {
                for xx in t.x..t.x + t.w {
                    grade[(yy * largura + xx) as usize] += 1;
                }
            }
        }
        assert!(grade.iter().all(|&c| c == 1), "algum pixel não é coberto exatamente uma vez");
    }

    #[test]
    fn t3_primeiro_tile_e_o_central() {
        let (largura, altura) = (1000u32, 600u32);
        let tiles = ordenar_tiles_espiral(largura, altura, 256).unwrap();
        let primeiro = tiles[0];
        // O tile (256,256,256,256) contém o centro (500,300). Distância em dobro: (-232, 168).
        assert_eq!(primeiro, Retangulo { x: 256, y: 256, w: 256, h: 256 });
        assert!(primeiro.x <= 500 && 500 < primeiro.x + primeiro.w);
        assert!(primeiro.y <= 300 && 300 < primeiro.y + primeiro.h);
        // Prova: nenhum outro tile tem distância menor ou igual.
        let minimo = tiles.iter().map(|t| distancia(t, largura, altura)).min().unwrap();
        assert_eq!(distancia(&primeiro, largura, altura), minimo);
        assert_eq!(tiles.iter().filter(|t| distancia(t, largura, altura) == minimo).count(), 1);
    }

    #[test]
    fn t4_ordem_nao_decrescente() {
        let (largura, altura) = (1000u32, 600u32);
        let tiles = ordenar_tiles_espiral(largura, altura, 256).unwrap();
        for par in tiles.windows(2) {
            let a = chave_espiral(&par[0], largura, altura);
            let b = chave_espiral(&par[1], largura, altura);
            assert!(a <= b, "fora de ordem: {a:?} antes de {b:?}");
        }
    }

    #[test]
    fn t5_bordas_menores() {
        let tiles = ordenar_tiles_espiral(300, 100, 256).unwrap();
        assert_eq!(tiles.len(), 2);
        assert!(tiles.contains(&Retangulo { x: 0, y: 0, w: 256, h: 100 }));
        assert!(tiles.contains(&Retangulo { x: 256, y: 0, w: 44, h: 100 }));
    }

    #[test]
    fn t6_zero_gera_erro() {
        assert!(matches!(ordenar_tiles_espiral(0, 10, 256), Err(ErroRender::Argumentos(_))));
        assert!(matches!(ordenar_tiles_espiral(10, 0, 256), Err(ErroRender::Argumentos(_))));
        assert!(matches!(ordenar_tiles_espiral(10, 10, 0), Err(ErroRender::Argumentos(_))));
    }

    #[test]
    fn t7_lado_maior_que_imagem_gera_um_tile() {
        let tiles = ordenar_tiles_espiral(100, 50, 256).unwrap();
        assert_eq!(tiles, vec![Retangulo { x: 0, y: 0, w: 100, h: 50 }]);
    }
}
