//! Prova cruzada: o fixture gerado pelo encoder TypeScript (`wasmClient.ts`, HSTR v2) deve ser
//! decodificado pelo `render-core` com os mesmos valores de material.

use render_core::cena::Cena;

const FIXTURE: &[u8] = include_bytes!("fixtures/cena-tipos-v2.hstr");

#[test]
fn fixture_ts_v2_e_decodificado_com_os_tipos_e_escalas_certos() {
    // O cabeçalho fixo traz a versão em bytes 4..8; o `Cena` decodificado não guarda a versão.
    assert_eq!(&FIXTURE[0..4], b"HSTR");
    let versao = u32::from_le_bytes([FIXTURE[4], FIXTURE[5], FIXTURE[6], FIXTURE[7]]);
    assert_eq!(versao, 2, "fixture deve ser HSTR versão 2");

    let cena = Cena::decodificar(FIXTURE).expect("cena v2 do encoder TS deve decodificar");

    assert_eq!(cena.materiais.len(), 3);
    assert_eq!(cena.quantidade_triangulos(), 3);

    assert_eq!(cena.materiais[0].tipo, 1);
    assert_eq!(cena.materiais[0].escala, 2.5);

    assert_eq!(cena.materiais[1].tipo, 3);
    assert_eq!(cena.materiais[1].escala, 1.0);

    assert_eq!(cena.materiais[2].tipo, 6);
    assert_eq!(cena.materiais[2].escala, 1.0);
}
