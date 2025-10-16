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

# Enable UI in the simulation
#SIM.enableUI()

# Set UI commands to enable trajectory storage
# (!) It is mandatory to have f'/tracking/storeTrajectory 3' so that RICH points with time info are saved
SIM.ui.commandsConfigure = [
    f'/tracking/storeTrajectory 3',
]

# Need DDG4 kernel to add stepping
kernel = DDG4.Kernel()


# Set UI commands to enable trajectory storage
# These commands need to be executed before the first event
SIM.ui.commandsConfigure = [
    f'/tracking/storeTrajectory 3',
    # '/tracking/verbose 1',
    # Optional: command to draw trajectories in visualization (if used)
    #'/vis/scene/add/trajectories rich'
]

# Dear Debbie,
#
# As was asked in an
# Instantiate the stepping action
event_action = DDG4.EventAction(kernel, 'FirebirdTrajectoryWriterEventAction/TrajectoryWriter')
event_action.ComponentName = "Geant4Trajectories"   # Tracks group name in firebird
#event_action.RequireRichTrajectory = True  # Only use trajectories with time info
#event_action.VerboseTimeExtraction = True  # Log details about time extraction
# stepping = DDG4.SteppingAction(kernel, 'TextDumpingSteppingAction/MyStepper')
event_action.OutputFile = outputFile
# stepping.OnlyPrimary = False           # True = only keep tracks coming from generator/gun (e.g. parent=0)
event_action.MomentumMin = 350               # Only leave tracks with
# stepping.VertexCut = True              # Cut tracks which vertex is outside z_min-z_max range
# stepping.VertexZMin = -5000            # [mm] Min Z for Vertex Cut. Will work only if VertexCut = True
# stepping.VertexZMax = 5000             # [mm] Max Z for Vertex Cut. Will work only if VertexCut = True

#kernel.steppingAction().add(stepping)
kernel.eventAction().add(event_action)


print("== END OF STEERING FILE ==")
