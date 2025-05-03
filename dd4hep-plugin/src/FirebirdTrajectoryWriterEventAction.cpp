//==========================================================================
//  AIDA Detector description implementation
//--------------------------------------------------------------------------
// Implementation of the FirebirdTrajectoryWriterEventAction as a DD4hep/DDG4 plugin
// Creates JSON output in the Firebird event display format with reliable time extraction
//==========================================================================

// Framework include files
#include "DDG4/Geant4EventAction.h"
#include "DD4hep/Printout.h"
#include "DDG4/Geant4Kernel.h"

// Geant4 headers
#include "G4Event.hh"
#include "G4TrajectoryContainer.hh"
#include "G4VTrajectory.hh"
#include "G4VTrajectoryPoint.hh"
#include "G4SystemOfUnits.hh"
#include "G4UnitsTable.hh"
#include "G4AttValue.hh"
#include "G4AttDef.hh"
#include "G4RichTrajectory.hh"
#include "G4RichTrajectoryPoint.hh"
#include "G4SmoothTrajectory.hh"
#include "G4SmoothTrajectoryPoint.hh"
#include "G4Trajectory.hh"
#include "G4TrajectoryPoint.hh"

// C/C++ headers
#include <fstream>
#include <iostream>
#include <vector>
#include <sstream>
#include <string>
#include <map>
#include <cmath>
#include <limits>
#include <fmt/core.h>
#include <fmt/format.h>

/// Namespace for the AIDA detector description toolkit
namespace dd4hep {

  /// Namespace for the Geant4 based simulation part of the AIDA detector description toolkit
  namespace sim {

    /**
     * \addtogroup Geant4EventAction
     * @{
     * \package FirebirdTrajectoryWriterEventAction
     * \brief Writes trajectories in Firebird JSON format for visualization with reliable time extraction
     *
     *  This action processes trajectories and outputs them in Firebird JSON format
     *  for direct visualization in the Firebird event display.
     *
     * @}
     */

    /// Firebird JSON format trajectory writer for dd4hep simulation
    /** This action writes filtered trajectories to a JSON file compatible with Firebird
     *  with special focus on reliable time extraction
     *
     *  \version 1.1
     *  \ingroup DD4HEP_SIMULATION
     */
    class FirebirdTrajectoryWriterEventAction : public Geant4EventAction {
    protected:
      /// Property: output file name
      std::string m_outputFile {"trajectories.firebird.json"};

      /// Component name for tracks (configurable)
      std::string m_componentName {"Geant4Trajectories"};

      /// Filter: save optical photons (regardless of other filters)
      bool m_saveOptical {false};

      /// Filter: only primary tracks (ParentID=0)
      bool m_onlyPrimary {false};

      /// Filter: apply vertex position cut
      bool m_vertexCut {false};

      /// Filter: minimum Z position for vertex (mm)
      double m_vertexZMin {-5000};

      /// Filter: maximum Z position for vertex (mm)
      double m_vertexZMax {5000};

      /// Filter: apply step position cut
      bool m_stepCut {false};

      /// Filter: minimum Z position for steps (mm)
      double m_stepZMin {-5000};

      /// Filter: maximum Z position for steps (mm)
      double m_stepZMax {5000};

      /// Filter: maximum radial distance from Z axis for steps (mm)
      double m_stepRMax {5000};

      /// Filter: minimum momentum threshold (MeV/c)
      double m_minMomentum {150};

      /// Filter: maximum momentum threshold (MeV/c)
      double m_maxMomentum {1e6};

      /// Filter: minimum track length (mm)
      double m_minTrackLength {0};

      /// Filter: particle types to save (PDG codes), empty means save all
      std::vector<int> m_saveParticles {};

      /// Require rich trajectory for time information
      bool m_requireRichTrajectory {true};

      /// Debugging: verbose time extraction
      bool m_verboseTimeExtraction {false};

      /// Statistics counters
      long m_totalTrajectories {0};
      long m_filteredTrajectories {0};
      long m_savedTrajectories {0};
      long m_trajectoryWithoutTime {0};
      long m_stepsFiltered {0};

      /// String buffer for entries
      std::vector<std::string> m_entries;

      /// Helper method to check if a value is valid for JSON output
      bool isValidForJSON(G4double value) const {
        return !std::isinf(value) && !std::isnan(value);
      }

      /// Helper method to get a safe value for JSON output
      G4double getSafeValue(G4double value, G4double defaultValue = 0.0) const {
        return isValidForJSON(value) ? value : defaultValue;
      }

      /// Helper method to calculate radial distance from Z axis
      G4double calculateR(G4ThreeVector position) const {
        return std::sqrt(position.x() * position.x() + position.y() * position.y());
      }

      /// Extract time from a trajectory point with robust error handling
      G4double extractTimeFromPoint(G4VTrajectoryPoint* point, int pointIndex) {
        // Try to cast to a G4RichTrajectoryPoint which has time information
        G4RichTrajectoryPoint* richPoint = dynamic_cast<G4RichTrajectoryPoint*>(point);
        if (!richPoint) {
          if (m_requireRichTrajectory) {
            if (m_verboseTimeExtraction) {
              warning("[firebird-writer] Point %d is not a rich trajectory point, cannot extract time", pointIndex);
            }
            m_trajectoryWithoutTime++;
            return -1.0; // Signal that we couldn't extract time
          }

          // If not requiring rich trajectory, return a sequential time based on point index
          return pointIndex * 0.1 * CLHEP::ns;
        }

        std::vector<G4AttValue>* attValues = richPoint->CreateAttValues();
        if (!attValues) {
          if (m_verboseTimeExtraction) {
            warning("[firebird-writer] Point %d has no attribute values", pointIndex);
          }
          return -1.0;
        }

        // Look for PreT for first point (index=0), PostT for all others
        std::string timeAttName = (pointIndex == 0) ? "PreT" : "PostT";
        G4double extractedTime = -1.0;

        for (const auto& attValue : *attValues) {
          if (attValue.GetName() == timeAttName) {
            std::string valueStr = attValue.GetValue();

            // Parse string value - may contain unit like "10.2 ns"
            std::istringstream iss(valueStr);
            G4double timeValue;
            std::string unit;

            // Try to read the value and unit
            iss >> timeValue >> unit;

            // If we have a unit, convert accordingly
            if (!unit.empty()) {
              if (unit == "ns") {
                extractedTime = timeValue * CLHEP::ns;
              } else if (unit == "s") {
                extractedTime = timeValue * CLHEP::s;
              } else if (unit == "ms") {
                extractedTime = timeValue * CLHEP::ms;
              } else if (unit == "us" || unit == "µs") {
                extractedTime = timeValue * CLHEP::microsecond;
              } else {
                // Unknown unit, assume nanoseconds
                extractedTime = timeValue * CLHEP::ns;
              }
            } else {
              // No unit, assume nanoseconds
              extractedTime = timeValue * CLHEP::ns;
            }

            if (m_verboseTimeExtraction) {
              info("[firebird-writer] Extracted time %s = %f ns from point %d",
                   timeAttName.c_str(), extractedTime / CLHEP::ns, pointIndex);
            }

            // We found the time, no need to look further
            break;
          }
        }

        // Clean up
        delete attValues;

        // If we couldn't find the preferred time attribute and we're requiring rich trajectories,
        // return error signal
        if (extractedTime < 0 && m_requireRichTrajectory) {
          if (m_verboseTimeExtraction) {
            warning("[firebird-writer] Could not find %s in point %d", timeAttName.c_str(), pointIndex);
          }
          m_trajectoryWithoutTime++;
          return -1.0;
        }

        // If we're not requiring rich trajectories, return a sequential time if we couldn't extract
        if (extractedTime < 0) {
          return pointIndex * 0.1 * CLHEP::ns;
        }

        return extractedTime;
      }

    public:
      /// Standard constructor
      FirebirdTrajectoryWriterEventAction(Geant4Context* context, const std::string& name = "FirebirdTrajectoryWriterEventAction")
        : Geant4EventAction(context, name)
      {
        declareProperty("OutputFile", m_outputFile);
        declareProperty("ComponentName", m_componentName);
        declareProperty("SaveOptical", m_saveOptical);
        declareProperty("OnlyPrimary", m_onlyPrimary);
        declareProperty("VertexCut", m_vertexCut);
        declareProperty("VertexZMin", m_vertexZMin);
        declareProperty("VertexZMax", m_vertexZMax);
        declareProperty("StepCut", m_stepCut);
        declareProperty("StepZMin", m_stepZMin);
        declareProperty("StepZMax", m_stepZMax);
        declareProperty("StepRMax", m_stepRMax);
        declareProperty("MomentumMin", m_minMomentum);
        declareProperty("MomentumMax", m_maxMomentum);
        declareProperty("TrackLengthMin", m_minTrackLength);
        declareProperty("SaveParticles", m_saveParticles);
        declareProperty("RequireRichTrajectory", m_requireRichTrajectory);
        declareProperty("VerboseTimeExtraction", m_verboseTimeExtraction);

        // Log filtering settings
        info("[firebird-writer] Trajectory filtering configuration:");
        info("[firebird-writer] OutputFile: %s", m_outputFile.c_str());
        info("[firebird-writer] ComponentName: %s", m_componentName.c_str());
        info("[firebird-writer] SaveOptical: %s", m_saveOptical ? "true" : "false");
        info("[firebird-writer] OnlyPrimary: %s", m_onlyPrimary ? "true" : "false");
        info("[firebird-writer] VertexCut: %s", m_vertexCut ? "true" : "false");
        info("[firebird-writer] VertexZMin: %.2f mm", m_vertexZMin);
        info("[firebird-writer] VertexZMax: %.2f mm", m_vertexZMax);
        info("[firebird-writer] StepCut: %s", m_stepCut ? "true" : "false");
        info("[firebird-writer] StepZMin: %.2f mm", m_stepZMin);
        info("[firebird-writer] StepZMax: %.2f mm", m_stepZMax);
        info("[firebird-writer] StepRMax: %.2f mm", m_stepRMax);
        info("[firebird-writer] MinMomentum: %.3f MeV/c", m_minMomentum);
        info("[firebird-writer] MaxMomentum: %.3f MeV/c", m_maxMomentum);
        info("[firebird-writer] MinTrackLength: %.2f mm", m_minTrackLength);
        info("[firebird-writer] RequireRichTrajectory: %s", m_requireRichTrajectory ? "true" : "false");
        info("[firebird-writer] VerboseTimeExtraction: %s", m_verboseTimeExtraction ? "true" : "false");

        if (!m_saveParticles.empty()) {
          std::stringstream ss;
          for (size_t i = 0; i < m_saveParticles.size(); ++i) {
            if (i > 0) ss << ", ";
            ss << m_saveParticles[i];
          }
          info("[firebird-writer] SaveParticles: %s", ss.str().c_str());
        } else {
          info("[firebird-writer] SaveParticles: [all]");
        }
      }

      /// Destructor
      virtual ~FirebirdTrajectoryWriterEventAction() {
        // Only write file if we collected some entries
        if (!m_entries.empty()) {
          try {
            // Open the output file
            std::ofstream output(m_outputFile);
            if (output.is_open()) {
              // Write the header of the JSON file
              output << fmt::format(R"({{"type":"firebird-dex-json","version":"0.04","origin":{{"file":"{}","entries_count":{}}},)",
                                   m_outputFile, m_entries.size());

              // Write the entries array
              output << "\"events\":[";

              // Write each entry
              for (size_t i = 0; i < m_entries.size(); ++i) {
                output << m_entries[i];
                if (i < m_entries.size() - 1) {
                  output << ",";
                }
              }

              // Close the JSON structure
              output << "]}";
              output.close();

              info("[firebird-writer] Successfully wrote JSON trajectories to: %s", m_outputFile.c_str());
            } else {
              error("[firebird-writer] Failed to open output file: %s", m_outputFile.c_str());
            }
          } catch (const std::exception& e) {
            error("[firebird-writer] Error writing JSON file: %s", e.what());
          }
        } else {
          warning("[firebird-writer] No events were processed. Output file not created.");
        }

        // Print final statistics
        info("[firebird-writer] Trajectory filtering statistics:");
        info("[firebird-writer] Total trajectories processed: %ld", m_totalTrajectories);
        info("[firebird-writer] Filtered (skipped) trajectories: %ld (%0.1f%%)",
             m_filteredTrajectories,
             m_totalTrajectories > 0 ? (m_filteredTrajectories * 100.0 / m_totalTrajectories) : 0.0);
        info("[firebird-writer] Saved trajectories: %ld (%0.1f%%)",
             m_savedTrajectories,
             m_totalTrajectories > 0 ? (m_savedTrajectories * 100.0 / m_totalTrajectories) : 0.0);
        if (m_stepCut) {
          info("[firebird-writer] Steps filtered due to position limits: %ld", m_stepsFiltered);
        }
        if (m_requireRichTrajectory) {
          info("[firebird-writer] Trajectories without proper time information: %ld", m_trajectoryWithoutTime);
        }
      }

      /// Check if a trajectory passes the filtering criteria
      bool passesFilters(G4VTrajectory* trajectory) {
        // Get track information
        int pdgCode = trajectory->GetPDGEncoding();
        std::string particleName = trajectory->GetParticleName();
        int parentID = trajectory->GetParentID();
        G4ThreeVector momentum = trajectory->GetInitialMomentum();
        double p = momentum.mag() / CLHEP::MeV; // Convert to MeV/c

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

        // Check track length if required
        if (m_minTrackLength > 0) {
          // Get number of points
          G4int n_points = trajectory->GetPointEntries();

          if (n_points <= 1) {
            // Can't calculate length with less than 2 points
            return false;
          }

          // Calculate total track length
          double trackLength = 0;
          G4ThreeVector prevPos = trajectory->GetPoint(0)->GetPosition();

          for (G4int i = 1; i < n_points; i++) {
            G4ThreeVector pos = trajectory->GetPoint(i)->GetPosition();
            trackLength += (pos - prevPos).mag();
            prevPos = pos;
          }

          // Convert to mm and check against threshold
          if (trackLength / CLHEP::mm < m_minTrackLength) {
            return false; // Skip if track is shorter than minimum length
          }
        }

        // Check vertex position if required
        if (m_vertexCut) {
          // Get number of points
          G4int n_points = trajectory->GetPointEntries();

          if (n_points > 0) {
            G4ThreeVector vertex = trajectory->GetPoint(0)->GetPosition();
            double vz = vertex.z() / CLHEP::mm; // Convert to mm

            if (vz < m_vertexZMin || vz > m_vertexZMax) {
              return false; // Skip if vertex Z is outside range
            }
          }
        }

        // Check if trajectory is a rich trajectory if required
        if (m_requireRichTrajectory) {
          G4RichTrajectory* richTrajectory = dynamic_cast<G4RichTrajectory*>(trajectory);
          if (!richTrajectory) {
            if (m_verboseTimeExtraction) {
              warning("[firebird-writer] Trajectory is not a rich trajectory, skipping");
            }
            return false;
          }

          // Check if the first point has time information
          G4int n_points = trajectory->GetPointEntries();
          if (n_points > 0) {
            G4double time = extractTimeFromPoint(trajectory->GetPoint(0), 0);
            if (time < 0) {
              if (m_verboseTimeExtraction) {
                warning("[firebird-writer] First point of trajectory has no time information, skipping");
              }
              return false;
            }
          }
        }

        // All filters passed
        return true;
      }

      /// Generate track parameters from trajectory
      std::string generateTrackParams(G4VTrajectory* trajectory) {
        // Extract momentum components from trajectory
        G4ThreeVector momentum = trajectory->GetInitialMomentum();
        G4double p = momentum.mag();

        // If momentum is zero, avoid division by zero
        if (p < 1e-10) {
            p = 1e-10;
        }

        // Get PDG code and particle name
        int pdgCode = trajectory->GetPDGEncoding();
        std::string particleName = trajectory->GetParticleName();

        // Get charge
        G4double charge = trajectory->GetCharge();

        // Calculate theta and phi from momentum
        G4double theta = momentum.theta();
        G4double phi = momentum.phi();

        // Calculate q/p - charge over momentum (in GeV/c)
        G4double qOverP = charge / (p / CLHEP::GeV);

        // Convert momentum to MeV/c
        G4double px = momentum.x() / CLHEP::MeV;
        G4double py = momentum.y() / CLHEP::MeV;
        G4double pz = momentum.z() / CLHEP::MeV;

        // Get the vertex position (first point)
        G4ThreeVector vertex(0, 0, 0);
        G4double time = 0.0;

        if (trajectory->GetPointEntries() > 0) {
            G4VTrajectoryPoint* point = trajectory->GetPoint(0);
            vertex = point->GetPosition();

            // Extract time from first point
            time = extractTimeFromPoint(point, 0);
            if (time < 0) {
              time = 0.0; // Fallback if time extraction failed
            }
            time /= CLHEP::ns; // Convert to ns
        }

        // Convert vertex position to mm
        G4double vx = vertex.x() / CLHEP::mm;
        G4double vy = vertex.y() / CLHEP::mm;
        G4double vz = vertex.z() / CLHEP::mm;

        // Ensure all values are valid for JSON
        px = getSafeValue(px);
        py = getSafeValue(py);
        pz = getSafeValue(pz);
        vx = getSafeValue(vx);
        vy = getSafeValue(vy);
        vz = getSafeValue(vz);
        theta = getSafeValue(theta);
        phi = getSafeValue(phi);
        qOverP = getSafeValue(qOverP);
        time = getSafeValue(time);

        // Default local parameters (placeholders in this implementation)
        G4double locA = 0.0;
        G4double locB = 0.0;

        // Format parameters as a JSON array
        // Order: pdg, type, charge, px, py, pz, vx, vy, vz, theta, phi, q_over_p, loc_a, loc_b, time
        return fmt::format("[{},\"{}\",{},{},{},{},{},{},{},{},{},{},{},{},{}]",
                         pdgCode, particleName, charge,
                         px, py, pz,
                         vx, vy, vz,
                         theta, phi, qOverP,
                         locA, locB, time);
      }

      /// Process trajectory points and format them as a JSON string
      std::string processTrajectoryPoints(G4VTrajectory* trajectory) {
        G4int n_points = trajectory->GetPointEntries();

        if (n_points == 0) {
          return "[]"; // No points to process
        }

        std::string pointsStr = "[";
        bool firstPoint = true;

        // Process trajectory points with step cutting if enabled
        for (G4int i = 0; i < n_points; i++) {
          G4VTrajectoryPoint* point = trajectory->GetPoint(i);
          G4ThreeVector position = point->GetPosition();

          // Apply step position filtering if enabled
          if (m_stepCut) {
            double z = position.z() / CLHEP::mm;
            double r = calculateR(position) / CLHEP::mm;

            // Check if step point is within bounds
            if (z < m_stepZMin || z > m_stepZMax || r > m_stepRMax) {
              m_stepsFiltered++;
              continue; // Skip this point as it's outside bounds
            }
          }

          // Extract time from trajectory point
          G4double time = extractTimeFromPoint(point, i);
          if (time < 0) {
            // Use a time derived from the point index if extraction failed
            time = i * 0.1 * CLHEP::ns;
          }
          time /= CLHEP::ns; // Convert to ns

          // Convert position to mm
          double x = position.x() / CLHEP::mm;
          double y = position.y() / CLHEP::mm;
          double z = position.z() / CLHEP::mm;

          // Ensure values are valid for JSON
          x = getSafeValue(x);
          y = getSafeValue(y);
          z = getSafeValue(z);
          time = getSafeValue(time);

          // Format point as [x, y, z, t, aux] where aux=0 for regular points
          if (!firstPoint) {
            pointsStr += ",";
          } else {
            firstPoint = false;
          }

          pointsStr += fmt::format("[{},{},{},{},{}]", x, y, z, time, 0);
        }

        pointsStr += "]";
        return pointsStr;
      }

      /// Begin-of-event callback
      virtual void begin(const G4Event* /* event */) override {
        // Nothing to do at begin of event
      }

      /// End-of-event callback to collect and store trajectories
      virtual void end(const G4Event* event) override {
        G4TrajectoryContainer* trajectoryContainer = event->GetTrajectoryContainer();
        if (!trajectoryContainer) {
          warning("[firebird-writer] No trajectory container found for event %d", event->GetEventID());
          return;
        }

        G4int n_trajectories = trajectoryContainer->entries();
        if (n_trajectories == 0) {
          warning("[firebird-writer] No trajectories found for event %d", event->GetEventID());
          return;
        }

        // Update total trajectories count
        m_totalTrajectories += n_trajectories;

        // Count filtered and saved trajectories for this event
        int filtered_event = 0;
        int saved_event = 0;

        // Create event entry with components structure
        std::string eventEntry = fmt::format(R"({{"id":{},"groups":[)", event->GetEventID());

        // Create component for track segments
        eventEntry += fmt::format(R"({{"name":"{}","type":"PointTrajectory",)", m_componentName);

        // Add origin type information
        eventEntry += R"("origin":{"type":["G4VTrajectory","G4VTrajectoryPoint"]},)";

        // Define parameter columns - now using px, py, pz, x, y, z, time
        eventEntry += R"("paramColumns":["pdg","type","charge","px","py","pz","vx","vy","vz","theta","phi","q_over_p","loc_a","loc_b","time"],)";

        // Define point columns
        eventEntry += R"("pointColumns":["x","y","z","t","aux"],)";

        // Start the trajectories array
        eventEntry += R"("trajectories":[)";

        // Process each trajectory
        bool firstLine = true;
        for (G4int i = 0; i < n_trajectories; i++) {
          G4VTrajectory* trajectory = (*trajectoryContainer)[i];

          // Apply filters - skip this trajectory if it doesn't pass
          if (!passesFilters(trajectory)) {
            filtered_event++;
            continue;
          }

          // Process points with step filtering
          std::string pointsStr = processTrajectoryPoints(trajectory);

          // Skip this trajectory if all points were filtered out
          if (pointsStr == "[]") {
            filtered_event++;
            continue;
          }

          // Count saved trajectories
          saved_event++;

          // Add comma between lines if not the first one
          if (!firstLine) {
            eventEntry += ",";
          } else {
            firstLine = false;
          }

          // Start a new line
          eventEntry += "{\"points\":";

          // Add points array
          eventEntry += pointsStr;

          // Add parameters
          eventEntry += ",\"params\":";
          eventEntry += generateTrackParams(trajectory);

          // Close the line
          eventEntry += "}";
        }

        // Close the lines array, component, groups array and event entry
        eventEntry += "]}]}";

        // Only add event to entries if at least one trajectory was saved
        if (saved_event > 0) {
          m_entries.push_back(eventEntry);
        }

        // Update global counters
        m_filteredTrajectories += filtered_event;
        m_savedTrajectories += saved_event;

        // Log event statistics
        info("[firebird-writer] Event %d: processed %d trajectories, filtered %d, saved %d",
             event->GetEventID(), n_trajectories, filtered_event, saved_event);
      }
    };
  }
}

// Register the plugin with DD4hep
#include "DDG4/Factories.h"
DECLARE_GEANT4ACTION(FirebirdTrajectoryWriterEventAction)