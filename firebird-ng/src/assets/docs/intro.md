# Firebird Documentation Intro

Welcome to the **Firebird** documentation! 
Firebird is an Angular application for visualizing 
Electron-Ion Collider (EIC) events in a browser‐based environment. 
It leverages Angular, Material Design, Three.js, 
and an extensible architecture to handle geometry, event data, and interactive UI controls. 

Below is an overview of key elements.

---

## 1. Overview

- **Purpose**: Firebird provides a flexible front‐end for 3D+time event visualization, 
- allowing users to explore detector geometries, track data, and time‐based animations.
- **Framework**: 
  - Built in **Angular** (version 19+)
  - **Angular Material** for UI
  - Phoenix Event Display library for scene management
- **3D Engine**: **Three.js** with custom geometry and event data-pipelines

---

## 2. Shell Layout

Firebird uses a custom `<app-shell>` component as its base layout. This shell provides:
- **Header** with logo, navigation items, theme toggles, and optional controls projected by each page.
- **Left / Right Pane** areas for side menus or tool panels. These can be shown or hidden based on user preference.
- **Central Pane** for primary content (3D canvas, or a documentation viewer, etc.).
- **Footer** containing extra controls, time sliders, performance stats, etc.

Using the shell, your page can project content in different **slots** like:
```html
<app-shell>
  <ng-container header>
    <!-- Page-specific header controls here -->
  </ng-container>
  
  <div leftPane>
    <!-- Content for left panel -->
  </div>
  
  <div centralPane>
    <!-- The main content or 3D display -->
  </div>
  
  <div rightPane>
    <!-- Content for right panel -->
  </div>
  
  <div footer>
    <!-- Footer content -->
  </div>
</app-shell>
