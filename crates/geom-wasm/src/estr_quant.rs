//! Quantidades da estrutura por elemento (docs/estrutura/PLANO.md, A.4.6; consulta 203 `estr_quant`; ficha K4).
//!
//! FONTE ÚNICA: os prismas são os de `estr_planta::elementos` (os mesmos quadros da malha da consulta 200), no contorno exato da A.2 (LOD fino, 96
//! lados no círculo), SEM o aparo das vigas: o volume bate com o da malha da 200 no LOD 2 e as interseções entre elementos não são abatidas (A.4.6).
//!
//! `linhas [elemento_num, categoria, tipo_num, material_num]`, `valores [volume, area_forma, comprimento, area_secao]`, em ordem de categoria e elemento:
//! - volume (m³): soma dos prismas por integração exata (área do perfil × eixo); fundação isolada: base + pescoço. As camadas de acabamento do pilar
//!   arquitetônico NÃO entram (o volume é o do perfil do tipo);
//! - area_forma (m²): DECISÃO desta ficha, mantida simples: a área lateral TOTAL dos prismas (perímetro de todos os anéis do perfil × eixo), SEM abater
//!   as faces apoiadas e sem as tampas. Pilar E1: 1,20 × 3,00 = 3,60. A A.4.6 fala em "superfície lateral menos faces apoiadas": como as tampas já
//!   não contam e as laterais não se apoiam em nada que o kernel conheça (laje e radier não passam por aqui), o abatimento fica para quando houver;
//! - comprimento (m): altura do pilar, eixo 3D da viga (sem aparo), comprimento da corrida, comprimento da estaca, altura total da isolada;
//! - area_secao (m²): a do perfil (líquida dos furos); na isolada e na estaca, a da base.
//!
//! O peso (volume × densidade) e as somas por tipo ficam com o TS. Elemento que não forma geometria não sai (a consulta 204 o aponta).

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::estr_malha::PARTE_CAMADAS;
use crate::estr_planta::elementos;

/// Consulta 203 `estr_quant`.
pub fn consulta_estr_quant(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let (mut linhas, mut valores) = (Vec::new(), Vec::new());
    for e in elementos(cena, nivel, 2) {
        let pecas = || e.pecas.iter().filter(|p| p.parte != PARTE_CAMADAS);
        let volume: f64 = pecas().map(|p| p.volume()).sum();
        let forma: f64 = pecas().map(|p| p.area_lateral()).sum();
        let secao = pecas().next().map_or(0.0, |p| p.contorno.area());
        linhas.extend([e.num, e.categoria, e.tipo, e.material]);
        valores.extend([volume, forma, e.comprimento, secao]);
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(valores)])
}
