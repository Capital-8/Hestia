//! Malha das fundações (docs/estrutura/PLANO.md, A.4.2; consulta 200 `estr_malha`; ficha K3).
//!
//! `deslocamento_topo` é a cota do TOPO da peça relativa à cota do nível (negativo = enterrada). Isolada: o pescoço (se existe) sobe `altura_pescoco`
//! e termina no topo; a base fica sob ele (o topo da base é `topo - altura_pescoco`) e desce `altura_base`. Sem pescoço o topo da base é o topo.
//! Estaca: o perfil (circular ou tubo circular) desce `altura_base` do topo. Corrida: a seção retangular fica perpendicular ao eixo `a`→`b`, com a
//! largura (X do perfil) na horizontal e a altura (Y) na vertical, o topo no topo. Tipo, perfil, nível ou eixo inválidos (corrida com menos de 1 mm,
//! isolada sem posição, modo do tipo contra o grupo de posição da linha) dão `ENTRADA`. Radier não passa por aqui (é laje).

use crate::cena::Cena;
use crate::estr_malha::{cota_do_nivel, perfil_malha, MalhaEstr, CATEGORIA_FUNDACAO, EIXO_MINIMO, PARTE_BASE, PARTE_PESCOCO};
use crate::estr_prisma::Quadro3;
use crate::esquema::ENTRADA;
use crate::secoes_estr::{FundacaoLinha, TipoFundacaoLinha, FUNDACAO_CORRIDA, FUNDACAO_ESTACA, FUNDACAO_ISOLADA};

/// Quadro vertical em `pos`, girado de `rotacao`, com a origem na cota `z` e o eixo de `z` a `z + dz`.
fn quadro_vertical(pos: [f64; 2], rotacao: f64, z: f64, dz: f64) -> Quadro3 {
    let (s, c) = rotacao.sin_cos();
    Quadro3 { origem: [pos[0], pos[1], z], ex: [c, s, 0.0], ey: [-s, c, 0.0], eixo: [0.0, 0.0, dz] }
}

/// Quadro da corrida: X à esquerda do eixo (horizontal), Y vertical, topo da seção em `z_topo`. Eixo com menos de 1 mm: `ENTRADA`.
pub fn quadro_corrida(a: [f64; 2], b: [f64; 2], z_topo: f64, faixa_y: [f64; 2]) -> Result<Quadro3, u32> {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let comprimento = dx.hypot(dy);
    if comprimento.is_nan() || comprimento < EIXO_MINIMO {
        return Err(ENTRADA);
    }
    let (ux, uy) = (dx / comprimento, dy / comprimento);
    Ok(Quadro3 { origem: [a[0], a[1], z_topo - faixa_y[1]], ex: [-uy, ux, 0.0], ey: [0.0, 0.0, 1.0], eixo: [dx, dy, 0.0] })
}

/// Acrescenta as partes da fundação `id` à malha (modo do tipo contra o grupo de posição da linha conferido aqui).
pub fn adicionar_fundacao(m: &mut MalhaEstr, cena: &Cena, id: u32, l: &FundacaoLinha, tipo: &TipoFundacaoLinha, lod: u32) -> Result<(), u32> {
    let topo = cota_do_nivel(cena, l.nivel)? + l.deslocamento_topo;
    let base = perfil_malha(cena, &tipo.base, lod)?;
    if !topo.is_finite() || !tipo.altura_base.is_finite() || tipo.altura_base <= 0.0 {
        return Err(ENTRADA);
    }
    match (tipo.modo, l.pos, l.eixo) {
        (FUNDACAO_CORRIDA, None, Some((a, b))) if tipo.forma != FUNDACAO_ESTACA => {
            let q = quadro_corrida(a, b, topo, base.contorno.faixa_y())?;
            m.adicionar(id, CATEGORIA_FUNDACAO, PARTE_BASE, tipo.material, &base.extrudar(&q)?)
        }
        (FUNDACAO_ISOLADA, Some(pos), None) => {
            let (topo_base, pescoco) = match tipo.pescoco {
                Some((p, altura)) if tipo.forma != FUNDACAO_ESTACA && altura.is_finite() && altura > 0.0 => (topo - altura, Some((perfil_malha(cena, &p, lod)?, altura))),
                Some(_) => return Err(ENTRADA),
                None => (topo, None),
            };
            m.adicionar(id, CATEGORIA_FUNDACAO, PARTE_BASE, tipo.material, &base.extrudar(&quadro_vertical(pos, l.rotacao, topo_base, -tipo.altura_base))?)?;
            if let Some((p, altura)) = pescoco {
                m.adicionar(id, CATEGORIA_FUNDACAO, PARTE_PESCOCO, tipo.material, &p.extrudar(&quadro_vertical(pos, l.rotacao, topo_base, altura))?)?;
            }
            Ok(())
        }
        _ => Err(ENTRADA),
    }
}
