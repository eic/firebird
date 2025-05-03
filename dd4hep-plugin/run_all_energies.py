#!/usr/bin/env python3
"""
run_all_energies.py - EIC Simulation Runner

This script runs particle physics simulations for the Electron-Ion Collider (EIC) 
using npsim and eicrecon across multiple beam energy configurations and 
Q² values, generating simulation data files.

Features:
- Sets up the environment with appropriate library paths
- Runs npsim simulations with specified parameters
- Processes output files with eicrecon for reconstruction
- Supports customization of simulation parameters via command-line arguments
- Runs with sensible defaults when no arguments are provided

Usage:
    ./run_all_energies.py                      # Run with default settings
    ./run_all_energies.py [options]            # Run with custom options

Default behavior:
    Without any arguments, the script will:
    - Use /mnt/dd4hep-plugin/firebird_steering.py as the steering file
    - Run simulations for beam energies: 5x41, 10x100, 18x275
    - Use minimum Q² values: 1, 100, 1000
    - Process 5 events per configuration
    - Use the detector path from DETECTOR_PATH environment variable
      or /opt/detector/epic-main/share/epic/epic_full.xml as fallback
    - Use /var/project/prefix/lib for plugin libraries
    - Save output files to the current directory

Examples:
    ./run_all_energies.py                      # Run with defaults
    ./run_all_energies.py --events 10          # Run with 10 events per configuration
    ./run_all_energies.py -o /path/to/outputs  # Save outputs to specific directory
    ./run_all_energies.py --plugin-path /custom/lib/path  # Use custom plugin path
    ./run_all_energies.py --steering /path/to/steering.py --beams 5x41 10x100
    ./run_all_energies.py --minq2s 1 100       # Run with only Q² values 1 and 100
"""

import subprocess
import os
import argparse


def setup_environment(plugin_path='prefix/lib'):
    """
    Updates the LD_LIBRARY_PATH environment variable to include custom library paths.
    
    Parameters:
        plugin_path (str): The library path to prepend to LD_LIBRARY_PATH
    """
    # Get the current LD_LIBRARY_PATH value from the environment
    current_ld_library_path = os.environ.get('LD_LIBRARY_PATH', '')

    # Prepend the prefix to the LD_LIBRARY_PATH
    new_ld_library_path = (plugin_path + ':' + current_ld_library_path) if current_ld_library_path else plugin_path

    # Set the new LD_LIBRARY_PATH in the environment
    os.environ['LD_LIBRARY_PATH'] = new_ld_library_path
    print("Updated LD_LIBRARY_PATH:", os.environ['LD_LIBRARY_PATH'])


def run_command(command):
    """
    Executes a given command in the shell and prints the output as it appears.

    Parameters:
        command (list): A list containing the command and its arguments.
        
    Returns:
        int: The return code of the executed command.
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
    return_code = process.wait()
    print("Command completed with return code:", return_code)
    print("\n" + "-"*50 + "\n")
    return return_code


def get_hepmc_path(beam, minq2):
    """
    Generates the path to the HepMC input file based on beam and minQ2 parameters.
    
    Parameters:
        beam (str): The energy configuration for the beam.
        minq2 (int): The minimum Q2 value.
        
    Returns:
        str: The path to the HepMC file.
    """
    return f"root://dtn-eic.jlab.org//volatile/eic/EPIC/EVGEN/DIS/NC/{beam}/minQ2={minq2}/pythia8NCDIS_{beam}_minQ2={minq2}_beamEffects_xAngle=-0.025_hiDiv_1.hepmc3.tree.root"


def get_base_name(beam, minq2, event_num, output_dir=None):
    """
    Generates the base filename for output files.
    
    Parameters:
        beam (str): The energy configuration for the beam.
        minq2 (int): The minimum Q2 value.
        event_num (int): The number of events to simulate.
        output_dir (str, optional): Directory for output files. If provided,
                                   the path will be prepended to the filename.
        
    Returns:
        str: The base filename (with path) for output files.
    """
    filename = f"py8_dis-cc_{beam}_minq2-{minq2}_minp-150mev_vtxcut-5m_nevt-{event_num}"
    
    if output_dir:
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        return os.path.join(output_dir, filename)
    
    return filename


def run_simulation(beam, minq2, event_num, detector_path, steering_file, output_dir=None):
    """
    Runs the simulation for a given beam, Q2 value, and event number, then converts the output file.

    Parameters:
        beam (str): The energy configuration for the beam.
        minq2 (int): The minimum Q2 value.
        event_num (int): The number of events to simulate.
        detector_path (str): Path to the detector configuration XML file.
        steering_file (str): Path to the steering file for npsim.
        output_dir (str, optional): Directory to store output files.
        
    Returns:
        bool: True if the simulation completed successfully, False otherwise.
    """
    # Construct the input file URL
    url = get_hepmc_path(beam, minq2)

    # Construct the output file name
    output_base = get_base_name(beam, minq2, event_num, output_dir)
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
        "--steeringFile", steering_file
    ]

    # Run the simulation
    if run_command(npsim_command) != 0:
        print(f"Error running npsim for beam={beam}, minq2={minq2}")
        return False

    # Command for converting the output file
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
    if run_command(reconstruction_command) != 0:
        print(f"Error running eicrecon for beam={beam}, minq2={minq2}")
        return False
        
    return True


def main():
    """
    Main function that parses command-line arguments and runs the simulation.
    """
    # Define default paths and values
    default_detector_base = os.getenv('DETECTOR_PATH', '/opt/detector/epic-main/share/epic/')
    default_detector_path = os.path.join(default_detector_base, "epic_full.xml")
    default_steering_path = "firebird_steering.py"
    default_plugin_path = "prefix/lib"
    default_output_path = "tmp"
    
    parser = argparse.ArgumentParser(
        description="EIC Simulation Runner",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    # Add command-line arguments
    parser.add_argument(
        "--steering", 
        default=default_steering_path,
        help="Path to the steering file for npsim"
    )
    parser.add_argument(
        "--detector", 
        default=default_detector_path,
        help="Path to the detector configuration XML file"
    )
    parser.add_argument(
        "--events", 
        type=int, 
        default=5,
        help="Number of events to simulate per configuration"
    )
    parser.add_argument(
        "--beams", 
        nargs="+", 
        default=['5x41', '10x100', '18x275'],
        help="Beam energy configurations to simulate"
    )
    parser.add_argument(
        "--minq2s", 
        nargs="+", 
        type=int, 
        default=[1, 100, 1000],
        help="Minimum Q2 values to simulate"
    )
    parser.add_argument(
        "--skip-setup", 
        action="store_true",
        help="Skip environment setup step"
    )
    parser.add_argument(
        "--plugin-path",
        default=default_plugin_path,
        help="Path to plugin libraries to be added to LD_LIBRARY_PATH"
    )
    parser.add_argument(
        "-o", "--output",
        dest="output_dir",
        default=default_output_path,
        help="Directory for output files"
    )
    
    args = parser.parse_args()
    
    # Setup environment if not skipped
    if not args.skip_setup:
        setup_environment(args.plugin_path)
    
    # Validate detector path
    detector_path = args.detector
    if not os.path.exists(detector_path):
        print(f"Error: Detector file not found: {detector_path}")
        return 1
        
    # Validate steering file
    steering_file = args.steering
    if not os.path.exists(steering_file):
        print(f"Error: Steering file not found: {steering_file}")
        return 1
    
    # Create output directory if specified
    if args.output_dir:
        os.makedirs(args.output_dir, exist_ok=True)
        print(f"Output files will be saved to: {args.output_dir}")
    
    # Run simulations for each combination
    for beam in args.beams:
        for minq2 in args.minq2s:
            print("\n" + "-" * 100)
            print(f"Running simulation for beam={beam}, minq2={minq2}, events={args.events}")
            success = run_simulation(
                beam=beam,
                minq2=minq2, 
                event_num=args.events,
                detector_path=detector_path,
                steering_file=steering_file,
                output_dir=args.output_dir
            )
            print("\n" + "/" * 100)
            if not success:
                print(f"Simulation failed for beam={beam}, minq2={minq2}")
    
    return 0


if __name__ == "__main__":
    exit(main())