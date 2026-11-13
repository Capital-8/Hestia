//! Apoio de snap da estrutura em planta (regra 6 de `docs/contratos/familias-e-ferramentas.md`; consulta 207 `estr_apoio`; ficha K4).
//!
//! Os contornos são os da planta (`estr_planta`): o perfil exato da A.2 (96 lados no círculo) de cada prisma vertical (todos os anéis: o externo e os
//! furos; das camadas de acabamento, só o externo) e o contorno convexo projetado da viga (já aparada nos pilares) e da corrida. Pontos:
//! - tipo 0 vértice e tipo 1 meio de aresta (a aresta `i` vai do vértice `i` ao `i + 1`); segmento tipo 0 a aresta;
//! - tipo 2 centro: a posição do pilar e da fundação isolada (chave 0);
//! - tipo 3 ponta do eixo (chave 0 = `a`, 1 = `b`), tipo 4 meio do eixo (chave 0) e segmento tipo 1 o eixo (chave 0): viga e corrida, pelo eixo do
//!   modelo (sem aparo).
//!
//! Chave do contorno: `parte · 2^24 + anel · 2^16 + índice` (`parte` como na malha: 0 corpo, 1 base, 2 pescoço, 3 camadas; `anel` 0 o externo, k o
//! furo k). O TS a escreve como texto (`p0.a1.v3`) na cota associativa. A chave depende só do elemento, do tipo e do nível (A.4.8) e do aparo da viga:
//! o perfil começa sempre no mesmo vértice e o contorno da viga começa no canto do início à direita do eixo, então mover ou girar o elemento mantém as
//! chaves. Ordem: categoria, elemento, tipo, chave.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::estr_malha::PARTE_CAMADAS;
use crate::estr_perfil::P2;
use crate::estr_planta::elementos_aparados;

pub const APOIO_VERTICE: u32 = 0;
pub const APOIO_MEIO: u32 = 1;
pub const APOIO_CENTRO: u32 = 2;
pub const APOIO_PONTA_EIXO: u32 = 3;
pub const APOIO_MEIO_EIXO: u32 = 4;
pub const SEGMENTO_ARESTA: u32 = 0;
pub const SEGMENTO_EIXO: u32 = 1;

/// Chave estável de um vértice ou aresta de contorno.
pub fn chave(parte: u32, anel: u32, indice: u32) -> u32 {
    (parte << 24) | ((anel & 0xff) << 16) | (indice & 0xffff)
}

/// Consulta 207 `estr_apoio`.
pub fn consulta_estr_apoio(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let (mut pontos, mut pontos_xy, mut segmentos, mut segmentos_xy) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for e in elementos_aparados(cena, nivel, 2) {
        let mut pts: Vec<(u32, u32, P2)> = Vec::new();
        let mut segs: Vec<(u32, u32, [f64; 4])> = Vec::new();
        for p in &e.pecas {
            let aneis: Vec<Vec<P2>> = if !p.vertical() {
                vec![p.contorno_planta()]
            } else if p.parte == PARTE_CAMADAS {
                vec![p.anel_planta(&p.contorno.anel)]
            } else {
                p.contorno.aneis().map(|a| p.anel_planta(a)).collect()
            };
            for (k, anel) in aneis.iter().enumerate() {
                let n = anel.len();
                for i in 0..n {
                    let (a, b) = (anel[i], anel[(i + 1) % n]);
                    let ch = chave(p.parte, k as u32, i as u32);
                    pts.push((APOIO_VERTICE, ch, a));
                    pts.push((APOIO_MEIO, ch, [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0]));
                    segs.push((SEGMENTO_ARESTA, ch, [a[0], a[1], b[0], b[1]]));
                }
            }
        }
        if let Some(c) = e.centro {
            pts.push((APOIO_CENTRO, 0, c));
        }
        if let Some([a, b]) = e.eixo {
            pts.push((APOIO_PONTA_EIXO, 0, [a[0], a[1]]));
            pts.push((APOIO_PONTA_EIXO, 1, [b[0], b[1]]));
            pts.push((APOIO_MEIO_EIXO, 0, [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0]));
            segs.push((SEGMENTO_EIXO, 0, [a[0], a[1], b[0], b[1]]));
        }
        pts.sort_by_key(|x| (x.0, x.1));
        segs.sort_by_key(|x| (x.0, x.1));
        for (tipo, ch, p) in pts {
            pontos.extend([e.num, e.categoria, tipo, ch]);
            pontos_xy.extend(p);
        }
        for (tipo, ch, s) in segs {
            segmentos.extend([e.num, e.categoria, tipo, ch]);
            segmentos_xy.extend(s);
        }
    }
    Ok(vec![Saida::U32(pontos), Saida::F64(pontos_xy), Saida::U32(segmentos), Saida::F64(segmentos_xy)])
}
