
### Firebird may be used with a server and has a server part. 

While Firebird can run as a pure frontend in general. For the ePIC/EIC use case a backend server is now essential:

- **Data access**: Simulation campaign data are accessed via XRootD, which is not available from JavaScript. 
  A small backend is needed to fetch data, convert it to Firebird format, and serve it to the frontend.
- **Browser compatibility (CORS):** Firebird is served from one address, while geometry and other assets are loaded from GitHub CI artifacts. 
  This triggers CORS (Cross-Origin Resource Sharing) restrictions. 
  Chrome currently accepts this setup, but Firefox (the default browser on Linux) does not, which means Firebird does not reliably work in Firefox. 
  A server cleanly resolves this by proxying all assets from a single origin.
- **Geometry stability**: We use current DD4Hep geometry from the ePIC repository. 
  When geometry formats change or temporarily break - so visualization is broken, 
  the server allows us to keep multiple versions and quickly 
  switch to a stable fallback, instead of the event display simply stopping to work.
- **Local installation**: Firebird architecture supports local installation—users run the same server 
  backend on their machines to work with their own geometry and files.
- **Batch jobs**: such local installations with the server allows to use Firebird in batch jobs and CI


### Technical differences with Phoenix:

Internally, Phoenix uses three.js, which has its core primitives: camera, renderer, scene, etc. 
What Phoenix tried to do is create "Manager" classes that wrap and represent these primitives with more event display functionality. 
Unfortunately, they couldn't achieve clean separation. Different aspects of the application (effects, ray-tracing, etc.) 
require different groupings of primitives (scene + renderer, or renderer + controls + camera). To handle this, Phoenix Managers just reference each other, belong to each other, and are completely highly coupled.

The overlay feature illustrates this problem perfectly. Instead of creating a separate class to handle alternative views, they duplicated camera, renderer, and controls across these already-coupled managers.

```ts
/** Main renderer to be used by the event display. */
private mainRenderer: WebGLRenderer;
/** Overlay renderer for rendering a secondary overlay canvas. */
private overlayRenderer: WebGLRenderer;
And then something like

// Creates BOTH perspective and orthographic cameras
const perspectiveCamera = new PerspectiveCamera(75, ...);
const orthographicCamera = new OrthographicCamera(...);

// Creates controls for each
this.perspectiveControls = this.setOrbitControls(perspectiveCamera, rendererElement);
this.orthographicControls = this.setOrbitControls(orthographicCamera, rendererElement);

// Then assigns main vs overlay
this.setMainControls(this.perspectiveControls);
this.setOverlayControls(this.orthographicControls);

```

The pattern repeats throughout—each "view" gets its own complete copy of three.js objects scattered across managers, 
requiring synchronization methods like transformSync() and updateSync() to keep them coordinated. 
My take is that it's impossible to untangle this without essentially making "Phoenix 2."

For Firebird, a lot of thinking went into avoiding this. I came up with the idea of "rendering heads." 
There's one flat interface that serves as a gate to three.js primitives (and can use Phoenix as a backend). 
If you need scene + camera, or controls + geometry—you take it from there. Then there are rendering heads (not yet fully implemented) that can attach to different things. 
One rendering head might be an overlay, another the main display, a third VR/AR. 
Or you could create classic projections (top/left/front/isometric) with different views on one screen, or pages with main view plus per-detector representations. 
It's not yet fully implemented, but the classes are organized with that architecture in mind.

Phoenix and Firebird also use different UI systems because Phoenix UI depends heavily on these Manager interconnections, making it inseparable. 
There are two libraries—you can use only the phoenix-event-display library (which we reference now), but if you start using PhoenixUI, 
you're basically locked into everything as-is.

Finally, one weakness of default three.js is raycasting performance—particularly for tasks like identifying particles from mouse pointer position. 
This is essential for VR work, since presumably looking around isn't enough; pointing at tracks and geometry needs to work well. Out of the box, it's just slow. 
There's a fast approach using Bounding Volume Hierarchy (BVH), and Firebird has started applying this library: https://github.com/gkjohnson/three-mesh-bvh
Look at examples!




Technically
Phoenix - Highly coupled managers and sticking VR somewhere in between Main... and Overlay... everything
Firebird - finishing rendering heads and attaching VR there

UI - different, but probably should be easy, but if one wants to have UI inside VR (and probably that is wanted) - Firebird would be easier to bring in something like https://github.com/pmndrs/uikit, because three.js interface is made simpler

Raytracing - interacting - done differently 