cmake_minimum_required(VERSION 3.16 FATAL_ERROR)

# CMP0074: find_package() uses <PackageName>_ROOT variables
cmake_policy(SET CMP0074 NEW)

PROJECT(firebird-dd4hep
  LANGUAGES CXX
  DESCRIPTION "DD4Hep data output for Firebird event display"
  )

# C++ standard
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD 20 CACHE STRING "Set the C++ standard to be used")
if(NOT CMAKE_CXX_STANDARD MATCHES "17|20|23")
  message(FATAL_ERROR "Unsupported C++ standard: ${CMAKE_CXX_STANDARD}")
endif()
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build type
if (NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "Build type configuration" FORCE)
  message(STATUS "Setting default build type: ${CMAKE_BUILD_TYPE}")
endif()

# Error on all warnings
if(NOT CMAKE_BUILD_TYPE STREQUAL "Release")
  add_compile_options(-Wall -Wextra -Werror -pedantic)
endif()

# Export compile commands as json for run-clang-tidy
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Install to the top directory by default
if(CMAKE_INSTALL_PREFIX_INITIALIZED_TO_DEFAULT)
    set(CMAKE_INSTALL_PREFIX ${CMAKE_SOURCE_DIR}/prefix CACHE PATH "Install in $src/prefix/ directory by default" FORCE)
endif()

# Install into GNU standard directories
include(GNUInstallDirs)

# Dependencies
find_package(DD4hep 1.27 REQUIRED COMPONENTS DDCore DDRec)
find_package(fmt REQUIRED)
find_package(Geant4 REQUIRED)
message(STATUS "Geant4_INCLUDE_DIR ${Geant4_INCLUDE_DIR}")

#-----------------------------------------------------------------------------------
set(LIB_FIREBIRD_DD4HEP ${PROJECT_NAME})

dd4hep_configure_output(INSTALL ${CMAKE_INSTALL_PREFIX})
dd4hep_set_compiler_flags()

dd4hep_add_plugin(${LIB_FIREBIRD_DD4HEP}
  SOURCES
        src/TextDumpingSteppingAction.cpp
        src/FirebirdTrajectoryWriterEventAction.cpp
        src/FirebirdTrajectoryWriterSteppingAction.cpp
  USES ROOT::Core ROOT::Gdml
  )

target_link_libraries(${LIB_FIREBIRD_DD4HEP}
  PUBLIC DD4hep::DDCore DD4hep::DDRec DD4hep::DDG4 fmt::fmt Geant4::Interface
  )
target_include_directories(${LIB_FIREBIRD_DD4HEP} SYSTEM PRIVATE ${Geant4_INCLUDE_DIR})

