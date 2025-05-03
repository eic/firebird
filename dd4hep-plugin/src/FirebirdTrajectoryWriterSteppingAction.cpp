//==========================================================================
//  AIDA Detector description implementation
//--------------------------------------------------------------------------
// Copyright (C) Organisation europeenne pour la Recherche nucleaire (CERN)
// All rights reserved.
//
// For the licensing terms see $DD4hepINSTALL/LICENSE.
// For the list of contributors see $DD4hepINSTALL/doc/CREDITS.
//
//==========================================================================

// Framework include files
#include "DDG4/Geant4SteppingAction.h"

// Geant4 headers
#include <G4Step.hh>
#include <G4RunManager.hh>
#include <G4TrackStatus.hh>
#include <G4Run.hh>
#include <G4Event.hh>
#include <G4UnitsTable.hh>
#include <G4ParticleDefinition.hh>
#include <G4ThreeVector.hh>
#include <CLHEP/Units/SystemOfUnits.h>

// C/C++ headers
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <map>
#include <stack>
#include <cmath>
#include <limits>
#include <fmt/core.h>
#include <fmt/format.h>

/// Namespace for the AIDA detector description toolkit
namespace dd4hep {

  /// Namespace for the Geant4 based simulation part of the AIDA detector description toolkit
  namespace sim {

    /**
     * \addtogroup Geant4SteppingAction
     * @{
     * \package FirebirdTrajectoryWriterSteppingAction
     * \brief Stepping action that writes trajectories in Firebird JSON format for visualization
     *
     * This action processes steps and outputs them in Firebird JSON format
     * for direct visualization in the Firebird event display. It combines the
     * time extraction approach from TextDumpingSteppingAction with the JSON formatting
     * from FirebirdTrajectoryWriterEventAction.
     *
     * @}
     */

    /// Firebird JSON format stepping action for dd4hep simulation
    /** This action writes filtered steps to a JSON file compatible with Firebird
     *
     *  \version 1.0
     *  \ingroup DD4HEP_SIMULATION
     */
    class FirebirdTrajectoryWriterSteppingAction : public Geant4SteppingAction {
    protected:
      // Output file and counters
      std::string m_outputFile {"trajectories.firebird.json"};
      std::ofstream m_output;
      std::size_t m_totalSteps {0UL};
      std::size_t m_totalTracks {0UL};
      std::size_t m_totalEvents {0UL};
      std::size_t m_filteredTracks {0UL};
      std::size_t m_stepsFiltered {0UL};

      // Component name for tracks (configurable)
      std::string m_componentName {"Geant4TrueTrajectories"};

      // Filter properties
      double m_minMomentum {300 * CLHEP::MeV};
      double m_maxMomentum {10000 * CLHEP::TeV};
      bool m_saveOptical {false};
      bool m_onlyPrimary {true};

      // Vertex filtering
      bool m_vertexCut {true};
      double m_vertexZMin {-4500};
      double m_vertexZMax {4500};

      // Step filtering - added to match EventAction
      bool m_stepCut {false};
      double m_stepZMin {-5000};
      double m_stepZMax {5000};
      double m_stepRMax {5000};

      // Particle type filtering - added to match EventAction
      std::vector<int> m_saveParticles {};

      // Track length filtering - added to match EventAction
      double m_minTrackLength {0};

      // Track processing state
      std::once_flag m_initFlag;
      int m_prevEvent {-1};
      int m_prevTrackId {-1};
      bool m_skippingTrack {false};

      // JSON entries collection
      std::vector<std::string> m_eventEntries;
      std::vector<std::string> m_pointEntries;

      // Current event data
      std::string m_currentEventEntry;
      bool m_firstTrackInEvent {true};

      /// Helper method to check if file is open and writable
      void ensureOutputWritable() {
        if (!m_output.is_open() || !m_output.good()) {
          auto errMsg = fmt::format("Failed to open the file or file stream is in a bad state. File name: '{}'", m_outputFile);
          error(errMsg.c_str());
          throw std::runtime_error(errMsg);
        }
      }

      /// Helper method to calculate radial distance from Z axis
      double calculateR(const G4ThreeVector& position) const {
        return std::sqrt(position.x() * position.x() + position.y() * position.y());
      }

      /// Initialize output file
      void initializeOutput() {
        // Log configuration
        fmt::print("Plugin {} info: \n", typeid(*this).name());
        fmt::print("   OutputFile     {}\n", m_outputFile);
        fmt::print("   ComponentName  {}\n", m_componentName);
        fmt::print("   MinMomentum    {}\n", m_minMomentum);
        fmt::print("   MaxMomentum    {}\n", m_maxMomentum);
        fmt::print("   SaveOptical    {}\n", m_saveOptical);
        fmt::print("   OnlyPrimary    {}\n", m_onlyPrimary);
        fmt::print("   VertexCut      {}\n", m_vertexCut);
        fmt::print("   VertexZMin     {}\n", m_vertexZMin);
        fmt::print("   VertexZMax     {}\n", m_vertexZMax);
        fmt::print("   StepCut        {}\n", m_stepCut);
        fmt::print("   StepZMin       {}\n", m_stepZMin);
        fmt::print("   StepZMax       {}\n", m_stepZMax);
        fmt::print("   StepRMax       {}\n", m_stepRMax);
        fmt::print("   TrackLengthMin {}\n", m_minTrackLength);

        if (!m_saveParticles.empty()) {
          std::stringstream ss;
          for (size_t i = 0; i < m_saveParticles.size(); ++i) {
            if (i > 0) ss << ", ";
            ss << m_saveParticles[i];
          }
          fmt::print("   SaveParticles  {}\n", ss.str());
        } else {
          fmt::print("   SaveParticles  [all]\n");
        }

        // Open the output file for later writing
        m_output.open(m_outputFile);
        ensureOutputWritable();
      }

      /// Write the final JSON file
      void writeOutputFile() {
        ensureOutputWritable();

        // Write the header of the JSON file
        m_output << fmt::format(R"({{"type":"firebird-dex-json","version":"0.04","origin":{{"file":"{}","entries_count":{}}},)",
                             m_outputFile, m_eventEntries.size());

        // Write the entries array
        m_output << "\"events\":[";

        // Write each event entry
        for (size_t i = 0; i < m_eventEntries.size(); ++i) {
          m_output << m_eventEntries[i];
          if (i < m_eventEntries.size() - 1) {
            m_output << ",";
          }
        }

        // Close the JSON structure
        m_output << "]}";
      }

      /// Generate track parameters from G4Track
      std::string generateTrackParams(const G4Track* track) {
        // Extract momentum components
        G4ThreeVector momentum = track->GetMomentum();
        G4double p = momentum.mag();

        // Ensure momentum is not zero to avoid division by zero
        if (p < 1e-10) {
          p = 1e-10;
        }

        // Get particle information
        int pdgCode = track->GetParticleDefinition()->GetPDGEncoding();
        std::string particleName = track->GetParticleDefinition()->GetParticleName();
        G4double charge = track->GetParticleDefinition()->GetPDGCharge();

        // Calculate angular parameters
        G4double theta = momentum.theta();
        G4double phi = momentum.phi();

        // Calculate q/p - charge over momentum (in GeV/c)
        G4double qOverP = charge / (p / CLHEP::GeV);

        // Convert momentum to MeV/c
        G4double px = momentum.x() / CLHEP::MeV;
        G4double py = momentum.y() / CLHEP::MeV;
        G4double pz = momentum.z() / CLHEP::MeV;

        // Get the vertex position
        G4ThreeVector vertex = track->GetVertexPosition();

        // Convert vertex position to mm
        G4double vx = vertex.x() / CLHEP::mm;
        G4double vy = vertex.y() / CLHEP::mm;
        G4double vz = vertex.z() / CLHEP::mm;

        // Get initial time
        G4double time = track->GetGlobalTime() / CLHEP::ns;

        // Placeholder values for local parameters (loc_a, loc_b)
        G4double locA = 0.0;
        G4double locB = 0.0;

        // Handle potential infinities or NaNs which are invalid in JSON
        if (std::isinf(px) || std::isnan(px)) px = 0.0;
        if (std::isinf(py) || std::isnan(py)) py = 0.0;
        if (std::isinf(pz) || std::isnan(pz)) pz = 0.0;
        if (std::isinf(vx) || std::isnan(vx)) vx = 0.0;
        if (std::isinf(vy) || std::isnan(vy)) vy = 0.0;
        if (std::isinf(vz) || std::isnan(vz)) vz = 0.0;
        if (std::isinf(theta) || std::isnan(theta)) theta = 0.0;
        if (std::isinf(phi) || std::isnan(phi)) phi = 0.0;
        if (std::isinf(qOverP) || std::isnan(qOverP)) qOverP = 0.0;
        if (std::isinf(time) || std::isnan(time)) time = 0.0;

        // Format parameters as a JSON array
        // Order: pdg, type, charge, px, py, pz, vx, vy, vz, theta, phi, q_over_p, loc_a, loc_b, time
        return fmt::format("[{},\"{}\",{},{},{},{},{},{},{},{},{},{},{},{},{}]",
                          pdgCode, particleName, charge,
                          px, py, pz,
                          vx, vy, vz,
                          theta, phi, qOverP,
                          locA, locB, time);
      }

      /// Format a point (pre or post step) as a JSON array
      std::string formatPoint(G4StepPoint* point) {
        G4ThreeVector position = point->GetPosition();

        // Convert position to mm and time to ns
        double x = position.x() / CLHEP::mm;
        double y = position.y() / CLHEP::mm;
        double z = position.z() / CLHEP::mm;
        double time = point->GetGlobalTime() / CLHEP::ns;

        // Handle potential infinities or NaNs which are invalid in JSON
        if (std::isinf(x) || std::isnan(x)) x = 0.0;
        if (std::isinf(y) || std::isnan(y)) y = 0.0;
        if (std::isinf(z) || std::isnan(z)) z = 0.0;
        if (std::isinf(time) || std::isnan(time)) time = 0.0;

        // Add auxiliary value (0 for regular points)
        return fmt::format("[{},{},{},{},{}]", x, y, z, time, 0);
      }

      /// Start a new event entry
      void startNewEvent(int runNumber, int eventNumber) {
        // Finalize previous event if there is one
        finalizeEvent();

        // Reset track state
        m_prevTrackId = -1;
        m_firstTrackInEvent = true;
        m_pointEntries.clear();

        // Create the beginning of an event entry with header
        m_currentEventEntry = fmt::format(R"({{"id":{},"groups":[)", eventNumber);

        // Add component for track segments
        m_currentEventEntry += fmt::format(R"({{"name":"{}","type":"PointTrajectory",)", m_componentName);

        // Add origin type information
        m_currentEventEntry += R"("origin":{"type":["G4Track","G4StepPoint"]},)";

        // Define parameter columns
        m_currentEventEntry += R"("paramColumns":["pdg","type","charge","px","py","pz","vx","vy","vz","theta","phi","q_over_p","loc_a","loc_b","time"],)";

        // Define point columns
        m_currentEventEntry += R"("pointColumns":["x","y","z","t","aux"],)";

        // Start the lines array
        m_currentEventEntry += R"("trajectories":[)";

        m_totalEvents++;
        fmt::print("Started processing event: {} (run: {})\n", eventNumber, runNumber);
      }

      /// Finalize the current event and add it to the event entries
      void finalizeEvent() {
        if (m_prevEvent >= 0) {
          // Only save the event if it has at least one track
          if (!m_firstTrackInEvent) {
            // Close the trajectories array, component, and group array
            m_currentEventEntry += "]}]}";
            m_eventEntries.push_back(m_currentEventEntry);

            fmt::print("Finalized event {} with {} tracks\n", m_prevEvent, m_totalTracks - m_filteredTracks);
          } else {
            fmt::print("Skipping empty event {}\n", m_prevEvent);
          }
        }
      }

      /// Check if track passes filtering criteria
      bool passesFilters(const G4Track* track) {
        // Get track information
        std::string particleName = track->GetParticleDefinition()->GetParticleName();
        int pdgCode = track->GetParticleDefinition()->GetPDGEncoding();
        int parentID = track->GetParentID();
        G4ThreeVector momentum = track->GetMomentum();
        double p = momentum.mag();
        G4ThreeVector vertex = track->GetVertexPosition();
        double vz = vertex.z() / CLHEP::mm;

        // Special case for optical photons
        if (particleName == "opticalphoton" && m_saveOptical) {
          return true; // Always save optical photons if requested
        }

        // Check primary track filter
        if (m_onlyPrimary && parentID != 0) {
          return false; // Skip non-primary tracks
        }

        // Check momentum thresholds
        if (p < m_minMomentum || p > m_maxMomentum) {
          return false; // Skip tracks outside momentum range
        }

        // Check vertex position if required
        if (m_vertexCut && (vz < m_vertexZMin || vz > m_vertexZMax)) {
          return false; // Skip if vertex Z is outside range
        }

        // Check if this particle type should be saved
        if (!m_saveParticles.empty()) {
          bool found = false;
          for (int code : m_saveParticles) {
            if (pdgCode == code) {
              found = true;
              break;
            }
          }
          if (!found) {
            return false; // Skip particles not in the save list
          }
        }

        // All filters passed
        return true;
      }

      /// Check if step point passes position filters
      bool pointPassesFilters(const G4ThreeVector& position) {
        if (!m_stepCut) {
          return true; // No filtering if step cut is disabled
        }

        // Convert to mm
        double z = position.z() / CLHEP::mm;
        double r = calculateR(position) / CLHEP::mm;

        // Check Z and R against limits
        if (z < m_stepZMin || z > m_stepZMax || r > m_stepRMax) {
          m_stepsFiltered++;
          return false;
        }

        return true;
      }

      /// Start a new track in the current event
      void startNewTrack(const G4Track* track) {
        // Get track ID
        int trackId = track->GetTrackID();
        m_prevTrackId = trackId;

        // Check if track passes filters
        if (!passesFilters(track)) {
          m_skippingTrack = true;
          m_filteredTracks++;
          return;
        }

        m_skippingTrack = false;

        // Add comma if not the first track in the event
        if (!m_firstTrackInEvent) {
          m_currentEventEntry += ",";
        } else {
          m_firstTrackInEvent = false;
        }

        // Start a new line object
        m_currentEventEntry += "{\"points\":[";

        // Reset point entries for the new track
        m_pointEntries.clear();

        if (trackId < 1000) {
          G4ThreeVector vertex = track->GetVertexPosition();
          fmt::print("Processing track: {}, {} (parent: {}), vertex: ({:.2f}, {:.2f}, {:.2f})\n",
                    trackId,
                    track->GetParticleDefinition()->GetParticleName(),
                    track->GetParentID(),
                    vertex.x(), vertex.y(), vertex.z());
        }
      }

      /// Add a step point to the current track
      void addStepPoint(G4StepPoint* point) {
        if (m_skippingTrack) return;

        // Check if the point passes position filters
        if (!pointPassesFilters(point->GetPosition())) {
          return; // Skip this point
        }

        // Format the point and add to the collection
        std::string pointEntry = formatPoint(point);

        // Add comma if not the first point
        if (!m_pointEntries.empty()) {
          m_pointEntries.push_back("," + pointEntry);
        } else {
          m_pointEntries.push_back(pointEntry);
        }
      }

      /// Finalize the current track with track parameters
      void finalizeTrack(const G4Track* track) {
        if (m_skippingTrack) return;

        // Skip if no points passed the filters
        if (m_pointEntries.empty()) {
          m_skippingTrack = true;
          m_filteredTracks++;
          return;
        }

        // Check track length if required
        if (m_minTrackLength > 0 && m_pointEntries.size() > 1) {
          // We need at least 2 points to calculate length
          G4ThreeVector prevPos = track->GetVertexPosition();

          // Add points to the track and calculate length
          for (size_t i = 0; i < m_pointEntries.size(); i++) {
            m_currentEventEntry += m_pointEntries[i];
          }

          // Close the points array
          m_currentEventEntry += "]";

          // Add track parameters
          m_currentEventEntry += ",\"params\":";
          m_currentEventEntry += generateTrackParams(track);

          // Close the line object
          m_currentEventEntry += "}";

          m_totalTracks++;
        }
      }

    public:
      /// Standard constructor
      FirebirdTrajectoryWriterSteppingAction(Geant4Context* context, const std::string& name = "FirebirdTrajectoryWriterSteppingAction")
        : Geant4SteppingAction(context, name)
      {
        declareProperty("OutputFile", m_outputFile);
        declareProperty("ComponentName", m_componentName);
        declareProperty("MomentumMin", m_minMomentum);
        declareProperty("MomentumMax", m_maxMomentum);
        declareProperty("SaveOptical", m_saveOptical);
        declareProperty("OnlyPrimary", m_onlyPrimary);
        declareProperty("VertexCut", m_vertexCut);
        declareProperty("VertexZMin", m_vertexZMin);
        declareProperty("VertexZMax", m_vertexZMax);
        declareProperty("StepCut", m_stepCut);
        declareProperty("StepZMin", m_stepZMin);
        declareProperty("StepZMax", m_stepZMax);
        declareProperty("StepRMax", m_stepRMax);
        declareProperty("TrackLengthMin", m_minTrackLength);
        declareProperty("SaveParticles", m_saveParticles);
      }

      /// Destructor
      ~FirebirdTrajectoryWriterSteppingAction() override
      {
        // Finalize the last event if needed
        finalizeEvent();

        // Write the output file if we have collected any events
        if (!m_eventEntries.empty()) {
          writeOutputFile();
          info("[firebird-stepping-writer] Successfully wrote JSON trajectories to: %s", m_outputFile.c_str());
        } else {
          warning("[firebird-stepping-writer] No events were processed. Output file not created.");
        }

        // Close the output file
        if (m_output.is_open() && m_output.good()) {
          m_output.close();
        }

        // Print statistics
        info("[firebird-stepping-writer] Statistics:");
        info("[firebird-stepping-writer] Total Events: %ld", m_totalEvents);
        info("[firebird-stepping-writer] Total Tracks: %ld (filtered: %ld, written: %ld)",
             m_totalTracks + m_filteredTracks, m_filteredTracks, m_totalTracks);
        info("[firebird-stepping-writer] Total Steps: %ld (filtered: %ld)",
             m_totalSteps, m_stepsFiltered);
      }

      /// Stepping callback
      void operator()(const G4Step* step, G4SteppingManager*) override
      {
        // Initialize output file if first call
        std::call_once(m_initFlag, [this]() { initializeOutput(); });

        // Get event and run information
        auto runNum = context()->run().run().GetRunID();
        auto eventNum = context()->event().event().GetEventID();

        // Check if this is a new event
        if (eventNum != m_prevEvent) {
          startNewEvent(runNum, eventNum);
          m_prevEvent = eventNum;
        }

        // Get the track
        auto track = step->GetTrack();
        int trackId = track->GetTrackID();

        // Check if this is a new track
        if (trackId != m_prevTrackId) {
          // If we were processing a track before, finalize it
          if (m_prevTrackId > 0 && !m_skippingTrack) {
            finalizeTrack(track);
          }

          // Start a new track
          startNewTrack(track);

          // For a new track, add the pre-step point which is the first point
          if (!m_skippingTrack) {
            addStepPoint(step->GetPreStepPoint());
          }
        }

        // Add the post-step point if not skipping this track
        if (!m_skippingTrack) {
          addStepPoint(step->GetPostStepPoint());
        }

        // Count steps
        m_totalSteps++;
      }
    };

  } // namespace sim
} // namespace dd4hep

// Register the plugin with DD4hep
#include "DDG4/Factories.h"
DECLARE_GEANT4ACTION_NS(dd4hep::sim,FirebirdTrajectoryWriterSteppingAction)