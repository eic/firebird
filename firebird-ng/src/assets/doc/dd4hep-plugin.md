# DD4Hep Plugin
# DD4Hep Plugin

Plugin for DD4Hep that allows to dump true particle trajectories (throug Geant4 stepping actions) 
to Firebird data exchange (DEX) format. 

<a href="https://eic.github.io/firebird/">
<img src="media/eic_dis_animation_v7.gif" title="EIC ePIC DIS event" />
</a>


## Usage

1. First one has to build DD4Hep plugin and ensure it is discoverable (e.g. `LD_LIBRARY_PATH` is pointing on it
   or it is installed in system libraries)

    ```bash
    git clone https://github.com/eic/firebird.git
    cd firebird/dd4hep-plugin
    mkdir build && cd build
    
    # This will create prefix/lib folder after the install
    cmake ..
    make && make install
   
    # By default the library will be installed into firebird/dd4hep-plugin/prefix/lib
    cd ..              # go back to firebird repo root
    ls prefix/lib      # <= Ensure libfirebird-dd4hep.so is there
   
    # Make library and .components file are discoverable:
    export LD_LIBRARY_PATH="$(pwd)/prefix/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    ```

2. Now you run dd4hep as usual adding special steering file through `--steeringFile` flag.
   This plugin comes with several predefined steering files. 
   You can copy them, configure and add your own configs!

   ```bash
   # assuming you are in:
   # firebird/dd4hep-plugin
   pwd   # <= ensure you are in firebird/dd4hep-plugin
   
   ddsim --steeringFile=my_steering.py --compactFile=geometry -N=5 --outputFile=sim_output.edm4hep.root --inputFiles sim_input.hepmc   
   ```

   This will produce `sim_output.firebird.json` Firebird format JSON file containing steps info

   > (!) for large events or e.g. if optical photons are saved, such file could easily be gigabytes in size

## How it works

Under the hood **Firebird dd4hep-plugin** comes with several Geant4 "actions" that can injected 
into DD4Hep processing using steering file or python configuration. 

- `FirebirdTrajectoryWriterEventAction` this is the main intended to use event-action. Use it with 
  `firebird_steering.py`. It enables Geant4 to save trajectories in the end of event. These 
  trajectories are the same, that are used in Geant4 event display. Then event-action saves 
  the trajectories into the firebird format. Saving one full event with all showers can easily take 
  tenths of gygabytes, so users can customize cuts in steering file to save only required data. 

- `FirebirdTrajectoryWriterSteppingAction` - this class uses Geant4 stepping action and writes 
  data as Geant4 generates it. As is it doesn't provide benefits compared to event-action,
  (moreover event-action trajectories are designed to be displayed so geant4 may add points to smooth them).
  But **users can modify C++ code of this file** if they need any custom internal Geant4 data. 
  Stepping action has access to simulation data as steps occur, detailed physics information, 
  complete access to physics processes at each step and can potentially modify the simulation while it runs

- `TextDumpingSteppingAction` - is a Geant4 stepping action for DD4hep that records detailed 
  trajectory information during simulation. It writes track and step data to a simple text file format 
  that can be easily parsed for custom analysis or visualization (NOT Firebird). This file is also 
  easy to use as C++ plugin example. 

### Pre-made steering files:

- firebird_steering.py - intended for the first or regular use. Saves everything > 350 MeV (no optical photons)
- cuts_example_steering.py - shows all possible cuts
- optical steering.py - saves only generator particles and optical photons. Good to introspects detectors like DIRC
- save_all_steering.py - saves all including optical photons and particles > 1MeV. 
  Use it carefully with particular detectors or space cuts. Easily can make Gigabytes long files. 


## Configuration Options

### FirebirdTrajectoryWriterEventAction Configuration Options

The `FirebirdTrajectoryWriterEventAction` provides extensive configuration options for filtering and controlling trajectory output:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `OutputFile` | string | "trajectories.firebird.json" | Output file name for the JSON trajectory data |
| `ComponentName` | string | "Geant4Trajectories" | Component name that will appear in the Firebird display |
| `SaveOptical` | bool | false | When true, optical photons are saved regardless of other filter settings |
| `OnlyPrimary` | bool | false | When true, only primary tracks (ParentID=0) are saved |
| `VertexCut` | bool | false | Enable vertex position filtering |
| `VertexZMin` | double | -5000 | Minimum Z position (mm) for track vertex (start point) |
| `VertexZMax` | double | 5000 | Maximum Z position (mm) for track vertex (start point) |
| `StepCut` | bool | false | Enable step-by-step position filtering |
| `StepZMin` | double | -5000 | Minimum Z position (mm) for any track step to be recorded |
| `StepZMax` | double | 5000 | Maximum Z position (mm) for any track step to be recorded |
| `StepRMax` | double | 5000 | Maximum radial distance from Z axis (mm) for any track step to be recorded |
| `MomentumMin` | double | 150 | Minimum momentum (MeV/c) for tracks to be saved |
| `MomentumMax` | double | 1e6 | Maximum momentum (MeV/c) for tracks to be saved |
| `TrackLengthMin` | double | 0 | Minimum track length (mm) for tracks to be saved |
| `SaveParticles` | vector<int> | [] | List of PDG codes to save. If empty, save all particle types |
| `RequireRichTrajectory` | bool | true | When true, only use trajectories that provide proper time information |
| `VerboseTimeExtraction` | bool | false | Enable detailed logging of time extraction from trajectory points |

#### Filtering Explanation

The `FirebirdTrajectoryWriterEventAction` applies filters in the following order:

1. **Particle Type Filtering**:
   - If `SaveOptical` is true, optical photons are always saved regardless of other filters
   - If `SaveParticles` is not empty, only particles with matching PDG codes are saved

2. **Track Source Filtering**:
   - If `OnlyPrimary` is true, only tracks with ParentID=0 (primary particles) are saved

3. **Momentum Filtering**:
   - Tracks with momentum outside the range [`MomentumMin`, `MomentumMax`] are filtered out

4. **Vertex Position Filtering**:
   - If `VertexCut` is true, tracks with vertex Z position outside the range [`VertexZMin`, `VertexZMax`] are filtered out

5. **Step Position Filtering**:
   - If `StepCut` is true, individual track points with Z position outside [`StepZMin`, `StepZMax`] or radial distance greater than `StepRMax` are filtered out
   - Tracks that have all points filtered out are not saved

6. **Track Length Filtering**:
   - If `TrackLengthMin` > 0, tracks shorter than this length are filtered out

7. **Rich Trajectory Requirement**:
   - If `RequireRichTrajectory` is true, only trajectories that properly support time extraction are saved

### Example Usage in Steering File

Here's how to configure the event action in your steering file:

```python
# Instantiate the event action
event_action = DDG4.EventAction(kernel, 'FirebirdTrajectoryWriterEventAction/TrajectoryWriter')
event_action.ComponentName = "Geant4Trajectories"   # Tracks group name in firebird
event_action.OutputFile = "mytrajectories.firebird.json"
event_action.OnlyPrimary = True                    # Only keep primary tracks
event_action.MomentumMin = 350                     # Minimum momentum (MeV/c)
event_action.StepCut = True                        # Enable step position filtering
event_action.StepZMin = -3000                      # Minimum Z (mm) for track steps
event_action.StepZMax = 3000                       # Maximum Z (mm) for track steps
event_action.StepRMax = 2000                       # Maximum R (mm) for track steps

# Add the event action to the kernel
kernel.eventAction().add(event_action)
```

### FirebirdTrajectoryWriterSteppingAction Configuration

Similar configuration options are available for the stepping action version of the firebird writer.
See the source code for detailed documentation of these parameters.

## EIC specific example

EIC openly provides docker images as well as sample data. Docker/singularity images aka eic_shell
ships all standard HENP stack, such as ROOT, Geant4, DD4Hep, Acts etc.

One can start this example simply by [eic_shell](https://eic.github.io/tutorial-setting-up-environment/index.html) or
[eicweb/eic_xl](https://hub.docker.com/r/eicweb/eic_xl/tags) docker image:

```bash
docker pull eicweb/eic_xl:nightly
docker run --rm -it -v /host/where/phoenix-dd4hep:/mnt/phoenix-dd4hep -v /host/place/with/data:/mnt/data eicweb/eic_xl:nightly
```

```bash
# Build dd4hep plugin and install to system root
cd /mnt/phoenix-dd4hep
mkdir build && cd build && cmake ..
make && make install 
cd ..

# Make sure the library and .components file are discoverable:
export LD_LIBRARY_PATH="/mnt/phoenix-dd4hep/prefix/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    
# Use the default ePIC detector for DD4HEP
source /opt/detector/epic-main/bin/thisepic.sh

# Copy example steering file
cp /mnt/phoenix-dd4hep/steering.py /mnt/data/
# edit parameters of /mnt/data/steering.py

# Copy example hepmc3 input file
xrdcp root://dtn2001.jlab.org:1094//work/eic2/EPIC/EVGEN/CI/pythia8NCDIS_5x41_minQ2=1_beamEffects_xAngle=-0.025_hiDiv_1_20ev.hepmc3.tree.root /mnt/data/test.hepmc3.tree.root

# Run DDSIM 10 events
ddsim --steeringFile=/mnt/data/steering.py --compactFile=$DETECTOR_PATH/epic.xml -N=10 --outputFile=/mnt/data/sim_output.edm4hep.root --inputFiles /mnt/data/test.hepmc3.tree.root

# Convert to phoenix
python3 dd4hep_txt_to_phoenix.py -o /mnt/data/result.phoenix.json /mnt/data/sim_output.evt.txt
```

## Text Stepping Dump Format

The dump format is dumb: 

```
#Format description
#  E - event: run_num event_num
#  T - track: id, status, pdg, pdg_name, eta, phi, qOverP, px, py, pz, vx, vy, vz
#  P - point: x, y, z, t
E 0 0 
T 8 2212 proton 1 3.5709294573447994 2.261549546104013 6.396484757681894e-05 -559.9251499726829 677.3808238429499 15608.865329424996 0.03897413220097487 0.05261577347068468 18.657590231736023
P 0.03897413220097487 0.05261577347068468 18.657590231736023 -0.07918188652875727
P -17.623005842295107 21.759339731997773 515.6859422023264 1.5843399605023456
P -17.941631710801495 22.14470031506324 524.5667632485647 1.6140634959863716
... 
```

- Lines beginning with E mark the start of a new event
- Lines beginning with T contain information about a particle track
- Lines beginning with P contain step point information

The file is organized in a hierarchical manner:

- Event record (E)
- Track record (T)
- Multiple point records (P) for that track
- Next track record
- And so on...

For each track, there's always at least two points:

- The first point (P) after a track record is the PreStepPoint (beginning of step)
- Subsequent points are PostStepPoints (end of steps)


### Run simulation for 10 events
#### (!) Using *.edm4hep.root in the output is mandatory

```bash
ddsim --steeringFile=steering.py --compactFile=$DETECTOR_PATH/epic.xml -N=100 --outputFile=sim_output.edm4hep.root --inputFiles sim_input.hepmc
```

***Example 10 events***

```bash
python3 test_stepping.py --compactFile=$DETECTOR_PATH/epic.xml -N=10 --outputFile=sim_output.edm4hep.root --inputFiles /mnt/d/data/firebird/pythia8CCDIS_18x275_minQ2-100_beamEffects_xAngle-0.025_hiDiv_1.hepmc
```

## EIC specific example

EIC openly provides docker images as well as sample data. Docker/singularity images aka eic_shell
ships all standard HENP stack, such as ROOT, Geant4, DD4Hep, Acts etc.

One can start this example simply by [eic_shell](https://eic.github.io/tutorial-setting-up-environment/index.html) or
[eicweb/eic_xl](https://hub.docker.com/r/eicweb/eic_xl/tags) docker image:

```bash
docker pull eicweb/eic_xl:nightly
docker run --rm -it -v /host/where/phoenix-dd4hep:/mnt/phoenix-dd4hep -v /host/place/with/data:/mnt/data eicweb/eic_xl:nightly
```

```bash
# Build dd4hep plugin and install to system root
cd /mnt/phoenix-dd4hep
mkdir build && cd build && cmake ..
make && make install 
cd ..

# Make sure the library and .components file are discoverable:
export LD_LIBRARY_PATH="/mnt/phoenix-dd4hep/prefix/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    
# Use the default ePIC detector for DD4HEP
source /opt/detector/epic-main/bin/thisepic.sh

# Copy example steering file
cp /mnt/phoenix-dd4hep/steering.py /mnt/data/
# edit parameters of /mnt/data/steering.py

# Copy example hepmc3 input file
xrdcp root://dtn2001.jlab.org:1094//work/eic2/EPIC/EVGEN/CI/pythia8NCDIS_5x41_minQ2=1_beamEffects_xAngle=-0.025_hiDiv_1_20ev.hepmc3.tree.root /mnt/data/test.hepmc3.tree.root

# Run DDSIM 10 events
ddsim --steeringFile=/mnt/data/steering.py --compactFile=$DETECTOR_PATH/epic.xml -N=10 --outputFile=/mnt/data/sim_output.edm4hep.root --inputFiles /mnt/data/test.hepmc3.tree.root

# Convert to phoenix
python3 dd4hep_txt_to_phoenix.py -o /mnt/data/result.phoenix.json /mnt/data/sim_output.evt.txt
```

