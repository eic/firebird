#!/usr/bin/env python3

import ROOT
import argparse
import sys


def copy_events(input_filename, output_filename, tree_name, num_events_to_copy):
    # Open the original ROOT file
    input_file = ROOT.TFile.Open(input_filename, "READ")
    if not input_file or input_file.IsZombie():
        print(f"Error: Cannot open input file '{input_filename}'.")
        sys.exit(1)

    # Get the TTree from the original file
    input_tree = input_file.Get(tree_name)
    if not input_tree:
        print(f"Error: Tree '{tree_name}' not found in '{input_filename}'.")
        input_file.Close()
        sys.exit(1)

    # Create a new ROOT file
    output_file = ROOT.TFile.Open(output_filename, "RECREATE")
    if not output_file or output_file.IsZombie():
        print(f"Error: Cannot create output file '{output_filename}'.")
        input_file.Close()
        sys.exit(1)

    # Set maximum compression level
    output_file.SetCompressionLevel(9)

    # Clone the tree structure (no events are copied yet)
    output_tree = input_tree.CloneTree(0)

    # Total number of events in the input tree
    total_events = input_tree.GetEntries()
    if num_events_to_copy > total_events:
        print(f"Warning: Requested {num_events_to_copy} events, but the input tree only contains {total_events} events.")
        num_events_to_copy = total_events

    # Copy the desired events
    for i in range(num_events_to_copy):
        input_tree.GetEntry(i)
        output_tree.Fill()

    # Write the new tree to the output file
    output_tree.Write()

    # Close the files
    output_file.Close()
    input_file.Close()

    print(f"Successfully created '{output_filename}' with {num_events_to_copy} event(s).")


def main():
    parser = argparse.ArgumentParser(description='Copy a specified number of events from a ROOT file to a new ROOT file.')
    parser.add_argument('input_file', help='Path to the input ROOT file.')
    parser.add_argument('output_file', help='Path to the output ROOT file.')
    parser.add_argument('-n', '--num-events', type=int, default=2, help='Number of events to copy (default: 2).')
    parser.add_argument('-t', '--tree-name', default='events', help='Name of the TTree to copy from (default: myTree).')

    args = parser.parse_args()

    copy_events(args.input_file, args.output_file, args.tree_name, args.num_events)


if __name__ == '__main__':
    main()
