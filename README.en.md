<div align="center">

<img src="docs/img/hestia-icon.svg" alt="Hestia" width="96" height="96">

# Hestia

**Open source BIM for residential architecture.**
Model once, get plans, sections, elevations, schedules and sheets. In the browser or on Windows.

[![Version](https://img.shields.io/github/v/release/engdennylsonsantos-cloud/Hestia?color=b5523a)](https://github.com/engdennylsonsantos-cloud/Hestia/releases/latest)
[![MIT License](https://img.shields.io/github/license/engdennylsonsantos-cloud/Hestia?color=555)](LICENSE)
[![Stars](https://img.shields.io/github/stars/engdennylsonsantos-cloud/Hestia?style=flat&color=555)](https://github.com/engdennylsonsantos-cloud/Hestia/stargazers)
[![Sponsor on GitHub](https://img.shields.io/badge/sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/engdennylsonsantos-cloud)

[**Open in the browser**](https://www.hestiabim.com/app) ·
[**Download for Windows**](https://github.com/engdennylsonsantos-cloud/Hestia/releases/latest) ·
[**Website**](https://www.hestiabim.com) ·
[**♥ Sponsor**](https://github.com/sponsors/engdennylsonsantos-cloud)

[Português](README.md) · English

<br>

<img src="docs/img/3d-perspectiva.png" alt="3D model of a house in Hestia" width="820">

</div>

## What it is

Hestia is BIM software built from scratch for residential design. A single model drives the
plan, the 3D view, sections, elevations, schedules and sheets, so a change in one view shows up
in all the others. Rendering runs on the GPU (WebGPU, falling back to WebGL2) and the geometry
kernel is separate from the UI, written in Rust.

## What it does

- **Residential modeling:** layered walls, floors, slabs, roofs, ceilings, doors and windows, stairs, ramps, railings and component families.
- **Type and instance:** changing a type updates every instance, as in professional BIM tools.
- **Automatic documentation:** floor, roof and area plans, sections, elevations, automatic dimensions, tags and sheets.
- **Schedules:** rooms, walls, slabs, floors, ceilings, doors, windows, roofs and stairs.
- **GPU rendering:** real-time 3D in the browser and in the desktop app.
- **Open formats:** exports IFC4, DXF, vector PDF and CSV, so your project is never locked in.

## See it working

<table>
  <tr>
    <td width="50%"><img src="docs/img/planta-baixa.png" alt="Floor plan"><br><sub><b>Floor plan</b> with layered walls and section marks.</sub></td>
    <td width="50%"><img src="docs/img/cotas-automaticas.png" alt="Automatic dimensions"><br><sub><b>Automatic dimensions:</b> 72 created with one command.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/img/corte.png" alt="Section"><br><sub><b>Sections</b> generated from the same model.</sub></td>
    <td width="50%"><img src="docs/img/elevacao.png" alt="Elevation"><br><sub><b>Elevations</b> with levels and heights.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/img/prancha.png" alt="Sheet"><br><sub><b>Sheets</b> with plan, roof, 3D, sections and elevations.</sub></td>
    <td width="50%"><img src="docs/img/3d-fachada.png" alt="3D facade"><br><sub><b>3D</b> with levels, shadows and materials.</sub></td>
  </tr>
</table>

## Getting started

**No install:** open [hestiabim.com/app](https://www.hestiabim.com/app).

**On Windows:** download the installer from the [latest release](https://github.com/engdennylsonsantos-cloud/Hestia/releases/latest) and run it.

The interface is currently in Portuguese.

## Support the project

Hestia is open source and free, and it stays that way. Your support helps fund maintenance,
new features (rendering, importers, schedules), documentation and user support.

[![Sponsor on GitHub Sponsors](https://img.shields.io/badge/%E2%99%A5%20Sponsor%20on%20GitHub%20Sponsors-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/engdennylsonsantos-cloud)

Not able to give money? A star on the repository, bug reports in
[Issues](https://github.com/engdennylsonsantos-cloud/Hestia/issues), sharing the project with
colleagues and testing it on real projects all help a lot.

## Technical docs and contributing

The technical documentation (in Portuguese) is in [docs/](docs/) and is indexed in the
[main README](README.md#documentação-técnica). Contribution rules are in
[CONTRIBUTING.md](CONTRIBUTING.md), security reports in [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
