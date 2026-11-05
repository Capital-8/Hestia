//! Testes puros do pipeline: HSTR v1 decodifica e a câmera continuam corretas sem GPU.

use render_core::camera::Camera;
use render_core::cena::{Lote, Material, PartesCena, Sol};
use render_core::vetor::Vec3;
use render_core::Cena;
use render_native::matrizes::matriz_vp_wgpu;

fn cena_teste() -> Cena {
    let camera = Camera::olhando_para(
        Vec3::novo(4.0, -6.0, 3.0),
        Vec3::novo(0.0, 0.0, 1.0),
        Vec3::novo(0.0, 0.0, 1.0),
        0.8,
        16.0 / 9.0,
        0.1,
        120.0,
    )
    .expect("câmera de teste");
    let material = Material {
        cor_base: [0.7, 0.3, 0.2],
        rugosidade: 0.65,
        metalico: 0.0,
        opacidade: 1.0,
        transmissao: 0.0,
        ior: 1.5,
        emissivo: [0.0, 0.0, 0.0],
    };
    Cena::nova(PartesCena {
        posicoes: vec![
            -1.0, -1.0, 0.0, 1.0, -1.0, 0.0, 1.0, 1.0, 0.0, -1.0, 1.0, 0.0,
        ],
        indices: vec![0, 1, 2, 0, 2, 3],
        normais: Vec::new(),
        materiais: vec![material],
        lotes: vec![Lote {
            inicio_indices: 0,
            quantidade_indices: 6,
            material: 0,
        }],
        sol: Sol::padrao(),
        fundo: Some([0.4, 0.55, 0.8]),
        camera,
    })
    .expect("cena válida")
}

#[test]
fn hstr_ida_e_volta_preserva_camera_e_materiais() {
    let original = cena_teste();
    let bytes = original.codificar();
    let lida = Cena::decodificar(&bytes).expect("decodifica HSTR v1");

    assert_eq!(lida.quantidade_triangulos(), 2);
    assert_eq!(lida.indices, original.indices);
    assert_eq!(lida.lotes, original.lotes);
    assert_eq!(
        lida.fundo.map(|v| v.map(|c| c as f32)),
        original.fundo.map(|v| v.map(|c| c as f32))
    );
    assert!((lida.camera.perto - original.camera.perto).abs() < 1.0e-6);
    assert!((lida.camera.longe - original.camera.longe).abs() < 1.0e-6);
    assert!(
        (lida.camera.posicao - original.camera.posicao).comprimento() < 1.0e-6,
        "posição da câmera precisa sobreviver ao HSTR"
    );

    // A view/projeção convertida para wgpu continua mapeando o plano próximo em z=0.
    let vp = matriz_vp_wgpu(&lida.camera.view, &lida.camera.projecao);
    let inversa = render_core::matematica::inverter(&vp).expect("vp invertível");
    assert!(inversa.iter().all(|v| v.is_finite()));
}

#[test]
fn hstr_truncado_e_recusado_sem_panic() {
    let bytes = cena_teste().codificar();
    assert!(Cena::decodificar(&bytes[..bytes.len() / 2]).is_err());
    assert!(Cena::decodificar(b"nao-e-uma-cena").is_err());
}
