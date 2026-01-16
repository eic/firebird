import subprocess
import os

def setup_environment():
    """
    Updates the LD_LIBRARY_PATH environment variable to include custom library paths.
    """
    # Get the current LD_LIBRARY_PATH value from the environment
    current_ld_library_path = os.environ.get('LD_LIBRARY_PATH', '')

    # Define the prefix you want to add
    prefix_path = '/var/project/prefix/lib'

    # Prepend the prefix to the LD_LIBRARY_PATH
    new_ld_library_path = (prefix_path + ':' + current_ld_library_path) if current_ld_library_path else prefix_path

    # Set the new LD_LIBRARY_PATH in the environment
    os.environ['LD_LIBRARY_PATH'] = new_ld_library_path
    print("Updated LD_LIBRARY_PATH:", os.environ['LD_LIBRARY_PATH'])

def run_command(command):
    """
    Executes a given command in the shell and prints the output as it appears.

    Parameters:
        command (list): A list containing the command and its arguments.
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

def get_hepmc_path(beam, minq2):
    return f"root://dtn-eic.jlab.org//volatile/eic/EPIC/EVGEN/DIS/NC/{beam}/minQ2={minq2}/pythia8NCDIS_{beam}_minQ2={minq2}_beamEffects_xAngle=-0.025_hiDiv_1.hepmc3.tree.root"

def get_base_name(beam, minq2, event_num):
    return f"py8_dis-cc_{beam}_minq2-{minq2}_minp-150mev_vtxcut-5m_nevt-{event_num}"

def run_simulation(beam, minq2, event_num, detector_path, steering_file):
    """
    Runs the simulation for a given beam, Q2 value, and event number, then converts the output file.

    Parameters:
        beam (str): The energy configuration for the beam.
        minq2 (int): The minimum Q2 value.
        event_num (int): The number of events to simulate.
        detector_path (str): Path to the detector configuration XML file.
    """
    # Construct the input file URL
    url = get_hepmc_path(beam, minq2)

    # Construct the output file name
    output_base = get_base_name(beam, minq2, event_num)
    output_edm4hep = output_base + ".edm4hep.root"
    output_evttxt = output_base + ".evt.txt"
    event_prefix = f"CC_{beam}_minq2_{minq2}"


    # Command for npsim
    npsim_command = [
        "npsim",
        "--compactFile", detector_path,
        "-N", str(event_num),
        "--inputFiles", url,
        "--random.seed", "1",
        "--outputFile", output_edm4hep,
        # "-v", "WARNING",
        "--steeringFile", steering_file
        # #"npsim",
        # "python3", "npsim_stepping.py"
        # "--compactFile", detector_path,
        # "-N", str(event_num),
        # "--inputFiles", url,
        # "--random.seed", "1",
        # "--outputFile", output_file,
        # "--steeringFile=steering.py"
    ]

    # Run the simulation
    run_command(npsim_command)

    # Command for converting the output file to JSON format
    reconstruction_command = [
    "eicrecon",
      f"-Pjana:debug_plugin_loading=1",
      f"-Pjana:nevents={event_num}",
      f"-Pjana:timeout=0",
      f"-Ppodio:output_file={output_base}.edm4eic.root",
      f"-Pdd4hep:xml_files={detector_path}",
      f"{output_base}.edm4hep.root"
    ]

    # Run the conversion
    run_command(reconstruction_command)

setup_environment()

# Set the detector path (assuming it's predefined as an environment variable or explicitly defined here)
DETECTOR_PATH = os.getenv('DETECTOR_PATH', '/opt/detector/epic-main/share/epic/')

# Matrix definitions for beams and Q2 values
beams = ['5x41', '10x100', '18x275']
minq2s = [1, 100, 1000]

# Iterate over each combination of beam and minq2
for beam in beams:
    for minq2 in minq2s:
        print("\n---------------------------------------------------------------------------------"*5)
        run_simulation(beam, minq2, 5, f'{DETECTOR_PATH}/epic_full.xml', '/mnt/dd4hep-plugin/firebird_steering.py')
        print("\n/////////////////////////////////////////////////////////////////////////////////"*5)
