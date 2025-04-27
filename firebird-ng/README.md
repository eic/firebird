# Firebird



## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.


## Running dd4hep plugin with events

```
beam: [5x41, 10x100, 18x275]
minq2: [1, 1000]
url=root://dtn-eic.jlab.org//volatile/eic/EPIC/EVGEN/DIS/NC/${{matrix.beam}}/minQ2=${{matrix.minq2}}/pythia8NCDIS_${{matrix.beam}}_minQ2=${{matrix.minq2}}_beamEffects_xAngle=-0.025_hiDiv_1.hepmc3.tree.root
beam: [5x41, 10x100, 18x275]
minq2: [1, 1000]
url=root://dtn-eic.jlab.org//volatile/eic/EPIC/EVGEN/DIS/NC/10x100/minQ2=1000/pythia8NCDIS_10x100_minQ2=1000_beamEffects_xAngle=-0.025_hiDiv_1.hepmc3.tree.root
npsim --compactFile ${DETECTOR_PATH}/${{ matrix.detector_config }}.xml -N 100 --inputFiles ${url} --random.seed 1 --outputFile sim_dis_${{matrix.beam}}_minQ2=${{matrix.minq2}}_${{ matrix.detector_config }}.edm4hep.root -v WARNING
```
