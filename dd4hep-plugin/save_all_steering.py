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

# Enable UI in the simulation. This might be needed but usually is not
# SIM.enableUI()

# Set Geant4 UI commands to enable trajectory storage.
# (!) /tracking/storeTrajectory 3 is crucial for TrajectoryWriterEventAction to work
SIM.ui.commandsConfigure = [
    f'/tracking/storeTrajectory 3',
    # '/tracking/verbose 1',
]

# Need DDG4 kernel to add stepping
kernel = DDG4.Kernel()


# Instantiate the stepping action
event_action = DDG4.EventAction(kernel, 'FirebirdTrajectoryWriterEventAction/TrajectoryWriter')
event_action.OutputFile = outputFile
event_action.SaveOptical=True
event_action.OnlyPrimary = False             # When both SaveOptical=OnlyPrimary=True only Primary and Optical will be saved
event_action.MomentumMin = 1
# stepping.VertexCut = True              # Cut tracks which vertex is outside z_min-z_max range
# stepping.VertexZMin = -5000            # [mm] Min Z for Vertex Cut. Will work only if VertexCut = True
# stepping.VertexZMax = 5000             # [mm] Max Z for Vertex Cut. Will work only if VertexCut = True

#kernel.steppingAction().add(stepping)
kernel.eventAction().add(event_action)


print("== ENDED STEERING FILE ==")
