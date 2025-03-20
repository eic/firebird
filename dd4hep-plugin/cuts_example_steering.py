"""
Steering illustrates possible cuts and configurations for Firebird Dd4hep-Plugin
"""
from DDSim.DD4hepSimulation import DD4hepSimulation
from g4units import mm, GeV, MeV, m
import DDG4
import argparse
import sys


# This printout is to check this steering file is using
print("== STARTED STEERING FILE ==")
print(f"g4units: mm={mm}, GeV={GeV}, MeV={MeV}")


# Determine output file name
# We intercept global dd4hep --outputFile flag to get base name for output file
parser = argparse.ArgumentParser()
parser.add_argument('--outputFile', type=str, default="output", help='Output file name')
args, _ = parser.parse_known_args()

# Add .firebird.json instead of .edm4hep.root or... whatever is there?
outputFile = args.outputFile if args.outputFile else "output"
if outputFile.endswith('.edm4hep.root'):
    outputFile = outputFile[:-len('.edm4hep.root')] + '.firebird.json'
else:
    outputFile = outputFile+'.firebird.json' if outputFile else 'output.firebird.json'

print(f"Steering event display 'outputFile' = {outputFile}")

# This is needed for stepping file
SIM = DD4hepSimulation()

# Enable UI in the simulation (you probably don't need it)
# SIM.enableUI()

# Set UI commands to enable trajectory storage
# (!) It is mandatory to have f'/tracking/storeTrajectory 3' so that RICH points with time info are saved
SIM.ui.commandsConfigure = [
    f'/tracking/storeTrajectory 3',
]

# Need DDG4 kernel to add stepping
kernel = DDG4.Kernel()

# Instantiate the stepping action
event_action = DDG4.EventAction(kernel, 'FirebirdTrajectoryWriterEventAction/TrajectoryWriter')
event_action.ComponentName = "Geant4Trajectories"   # Tracks group name in firebird
event_action.OutputFile = outputFile
# ---- Particle Type Filtering ----
# Set which particles to save - central detector tracking focuses on charged particles

# Save only particles with the next PDG codes:
event_action.SaveParticles = [11, -11, 22, 211, -211, 321, -321, 2212, -2212]
event_action.SaveOptical = False                    # Don't save optical photons (reduces file size)

# ---- Track Source Filtering ----
event_action.OnlyPrimary = False                    # Save both primary and secondary tracks

# ---- Momentum Filtering ----
# Central tracking typically focuses on particles with reasonable momentum
# Too low momentum particles curl too much, too high rarely occur
event_action.MomentumMin = 200                      # Minimum momentum (MeV/c)
event_action.MomentumMax = 15 * GeV                 # Maximum momentum
event_action.TrackLengthMin = 50                    # Minimum track length (mm)

# ---- Vertex Position Filtering ----
# EIC central detector region - focus on interaction point
event_action.VertexCut = True                       # Enable vertex position filtering
event_action.VertexZMin = -150                      # IP region Z min (mm)
event_action.VertexZMax = 150                       # IP region Z max (mm)

# ---- Step Position Filtering ----
# Only save track points(steps) within the central detector volume
event_action.StepCut = True                         # Enable step position filtering
event_action.StepZMin = -4000                       # Central detector Z min (mm)
event_action.StepZMax = 4000                        # Central detector Z max (mm)
event_action.StepRMax = 1800                        # Central detector radial limit (mm)

# ---- Trajectory Extraction Configuration ----
event_action.VerboseTimeExtraction = False          # Don't log details about time extraction

# Add our configured event-action
kernel.eventAction().add(event_action)

print("== END OF STEERING FILE ==")
