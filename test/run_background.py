# docker run -it --rm -v/home/romanov/dev/firebird:/mnt eicweb/eic_xl:nightly
# cd /mnt/dd4hep-plugin/
# mkdir build && cd build
# This will create prefix/lib folder after the install
# cmake .. && make && make install
# cd .. && ls prefix/lib  # <= Ensure libfirebird-dd4hep.so is there
# export LD_LIBRARY_PATH="/mnt/dd4hep-plugin/prefix/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
# mkdir -p tmp && cd tmp
# source /opt/detector/epic-main/bin/thisepic.sh
# pip install --upgrade pyrobird
# python3 /mnt/test/run_background.py


import subprocess
import os

INPUT_FILE="root://dtn-eic.jlab.org//volatile/eic/EPIC/EVGEN/BACKGROUNDS/MERGED/HEPMC_merger-1.0.2/10x100/1SignalPerFrame/HEPMC_merger-1.0.2_bgmerged_1SignalPerFrame_MinBias_pythia6_10x100_egas_bgas.hepmc3.tree.root"
OUTPUT_BASE="background_py6_10x100_egas_bgas"
DETECTOR_PATH = os.getenv('DETECTOR_PATH', '/opt/detector/epic-main/share/epic/')
DETECTOR_FILE = f'{DETECTOR_PATH}/epic_craterlake_10x100.xml'
STEERING_FILE = '/mnt/dd4hep-plugin/firebird_steering.py'
EVENT_NUM = 10

def run_command(command):
    """
    Executes a given command in the shell and prints the output as it appears.
    Parameters: command (list): A list containing the command and its arguments.
    """

    print("Executing:", " ".join(command))

    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    # Print output as it appears
    while True:
        output = process.stdout.readline()
        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.strip())

    # Handle errors if there are any
    err = process.stderr.read()
    if err:
        print("Error:", err)

    # Check the process return code
    process.wait()
    print("Command completed with return code:", process.returncode)
    print("\n" + "-"*50 + "\n")

if __name__ == "__main__":
    print(f"INPUT_FILE     :{INPUT_FILE}")
    print(f"OUTPUT_BASE    :{OUTPUT_BASE}")
    print(f"DETECTOR_PATH  :{DETECTOR_PATH}")
    print(f"DETECTOR_FILE  :{DETECTOR_FILE}")
    print(f"STEERING_FILE  :{STEERING_FILE}")


    # Command for npsim
    npsim_command = [
        "npsim",
        "--compactFile", DETECTOR_FILE,
        "-N", str(EVENT_NUM),
        "--inputFiles", INPUT_FILE,
        "--random.seed", "1",
        "--outputFile", f"{OUTPUT_BASE}.edm4hep.root",
        "--steeringFile", STEERING_FILE,
    ]

    # Run the simulation
    #run_command(npsim_command)

    # Command for converting the output file to JSON format
    reconstruction_command = [
        "eicrecon",
        f"-Pjana:debug_plugin_loading=1",
        f"-Pdd4hep:xml_files={DETECTOR_FILE}",
        f"-Pjana:nevents={EVENT_NUM}",
        f"-Pjana:timeout=0",
        f"-Ppodio:output_file={OUTPUT_BASE}.edm4eic.root",
        f"{OUTPUT_BASE}.edm4hep.root"
    ]
    #run_command(reconstruction_command)

    # smooth trajectories
    run_command(["pyrobird", "smooth",
        f"{OUTPUT_BASE}.firebird.json",
        "-o", f"{OUTPUT_BASE}_smth.v04.firebird.json"
    ])

    # zip files
    run_command(["python3",
                 "-m", "zipfile",
                 "-c", f"{OUTPUT_BASE}_smth.v04.firebird.json.zip",
                 f"{OUTPUT_BASE}_smth.v04.firebird.json"
    ])
