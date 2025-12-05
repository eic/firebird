# Electron Ion Collider dynamic visualization
**(aka EIC Event Display)**

[![Frontend CI/CD Workflow](https://github.com/eic/firebird/actions/workflows/frontend.yaml/badge.svg?branch=main)](https://github.com/eic/firebird/actions/workflows/frontend.yaml)

Visit working display: 

https://eic.github.io/firebird/


## Project Overview


<a href="https://eic.github.io/firebird/">
<img src="firebird-ng/src/assets/doc/media/eic_dis_animation_v7.gif" title="EIC ePIC DIS event" />
</a>

**Firebird** is a web-based event display framework for particle physics experiments, 
specifically designed for the Electron-Ion Collider (EIC). 
It visualizes detector geometries, detector responses (hits), particle trajectories, 
and physics processes using modern web technologies. 
Firebird serves research, debugging/QC, and educational purposes.


## Repository Structure

This is a **monorepo** containing three interdependent components:

- **firebird-ng/** - Angular frontend (TypeScript, Three.js, RxJS)
- **pyrobird/** - Python Flask backend (file server for local run, ROOT conversion)
- **dd4hep-plugin/** - C++ Geant4/DD4Hep plugin (trajectory extraction during simulation)

The documentation source lives in 
- `firebird-ng/src/assets/doc`


