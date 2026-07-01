# Getting Started with Firebird Event Display

This tutorial will walk you through the basics of the user interface. 
Let's start with a quick tour of the main features.

## 1. First Look at the Display

When you first open Firebird, you'll see the main display page. 
This is where the 3D visualization happens. 
Take a moment to look around - you should see:

<img src="./01_01_basic_view.png" width="900" alt="Basic Firebird View" title="Firebird display window view"/>

> If you don't see a detector and trajectories, it might not be a problem, 
> especially if you used Firebird before. Proceed with the tutorials 
> to a configuration section. If you still don't see anything, after configuring
> Firebird, proceed to [the Trobleshooting](../troubleshoot) section.

We will go in details of how to control everything, for now press 
**"Configure"** button to go into Firebird configuration. 

<img src="./01_03_configure_menu.drawio.png" width="1000" alt="Basic Firebird View" title="Firebird display window view"/>


## 2. Select geoemetry and data

Firebird needs detector geometry and event data to be set (while it is still possible
to show only one). 

<img src="./01_04_inputs.drawio.png" alt="Firebird inputs" title="Firebird geometry and event inputs"/>


The easiest way to start is with a preset configurations:

1. Look for the **"Examples: Select example configuration preset"** dropdown
2. Choose one of the options like:
   - "Full ePIC detector geometry (no events)" - for exploring just the detector
   - "DIS NC in ePIC" options - for viewing collision events
   - "DIRC optical photons" - for specialized detector studies

When you select a preset, it automatically fills in the geometry and event sources below.

## 3. Overview the interface

... By this moment geometry should be loaded ...

<img src="./01_02_ui_labels.drawio.png" width="900" alt="Basic Firebird View" title="Firebird display window view"/>

Try these basic interactions:
- **🖱️ Left-click and drag** to rotate the view
- **🖱️ Right-click and drag** to pan
- **🖱️ Scroll** to zoom in and out

The menus are 

1. **Main menu**. Switch between the configs and the display
2. **Controls**. Select event, set clipping, import/export
3. **Scene tree**. Navigate geometry and event elements 
4. **Camera and visuals**.  
5. **Animation and time**. See how event evolve in time
6. **Loading progress**. For geometry and event data 


### View Controls

The floating panel on the right provides quick access to view controls:
- **Zoom buttons** (+/-) for precise zoom control
- **View options** (eye icon) for grids and visual aids
- **Camera mode** button to switch between perspective and orthographic views

## 4. Scene Organization

<img src="./01_05_scene_tree.gif" alt="Scene tree" title="Scene tree view">

Click the **tree icon** <img src="./material-icons_account_tree.svg" width="15" alt="tree_button" > 
in the header to open the scene tree panel. This shows:
- All loaded geometry components
- Event data (tracks, hits, etc.)
- Visual helpers

> You may need to press **refresh** <img src="./material-icons_refresh.svg" style="float:left" width="15" alt="tree_button" > 
> button on the tree panel if not all nodes are shown

You can:
- Click the eye icons to show/hide components
- Expand groups to see sub-components
- Hover over items to highlight them in the 3D view (when highlighting is enabled)

### Event Navigation

<img src="./01_06_event_selection.png" width="400" alt="Event Selection" title="Event Selection"/>

If you loaded multiple events:
1. Use the **event selector dropdown** in the header to switch between events
2. Each event is labeled with its ID for easy reference


### Geometry Clipping

<img src="./01_07_clipping.gif" loading="lazy" alt="Firebird geometry clipping" title="Geometry Clipping">

The **crop icon** in the header opens clipping controls:
1. Enable clipping with the checkbox
2. Use the preset buttons for common views (half, quarter cuts)
3. Adjust angles manually with the sliders
4. This helps see inside the detector layers

Firebird clipping concepts:  

- Clipping only works for Geometry. Event presentation is not affected. 
- There are 2 separate modes "Angular Clipping" and "Z Clipping"
- (!) There is a known limitation that "Z Clipping" hides event data 


### Measurement Tools

Click the **crosshair icon** to access measurement tools:
- **Show 3D Coordinates** - Display cursor position in detector coordinates
- **Show 3D Distance** - Measure distances between two points (click twice)

### Visual Helpers

Click the **eye icon** on the right panel to access:
- **Cartesian Grid** - Reference grid in X, Y, Z
- **Eta-Phi Grid** - Cylindrical coordinate system used in particle physics
- **Axis indicators** - Show coordinate axes
- **Labels** - Component names in 3D space


## 4. More configuration

### Manual Configuration (Optional)

We may select 

**Geometry:** Use the geometry dropdown to select a detector configuration. The URLs ending in `.root` contain different detector subsystems.

**Event Data:** You have two options:
- **JSON files** - Pre-converted event data that loads quickly
- **EDM4EIC ROOT files** - Raw simulation output (requires backend server)

For EDM4EIC files, you can specify which events to load using the range field (e.g., "0-5" for the first 6 events).

Click the **DISPLAY** button to return to the main view with your selected data loaded.

### Time-Based Animation

The bottom toolbar controls time-based visualization:

- **Time slider** - Drag to see particles at different times
- **Play/Pause** - Animate particle trajectories
- **Step buttons** - Move forward/backward one time step
- **Rewind** - Return to the beginning
- **Stop** - Show all particles at once

Try playing an animation to see particles emerge from the collision point and travel through the detector!
![FirebirdClipping.gif](../../../../Users/romanov/Desktop/FirebirdClipping.gif)

### Performance Considerations

In the bottom-left corner, you'll see performance statistics (FPS, triangles, etc.). If performance is slow:

1. Hide unnecessary geometry using the scene tree
2. Go to Configure and enable "Performance over quality"
3. Reduce the number of loaded events

## 5. EIC simulation campaigns

... How to selct and navigate simulation campaign files

## Next Steps


