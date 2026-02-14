# Saving Videos and Frames

This tutorial explains how to record the Firebird event display as a video or as individual PNG frames.
Firebird provides two approaches: **real-time screen recording** for quick captures, and **offline 4K capture**
for producing smooth, high-resolution frame sequences suitable for professional presentations and publications.

## 1. Open the Debug Panel

Both recording methods are accessed through the debug GUI panel.

1. Load your geometry and event data as usual (see [Tutorial 01](./01_basic_ui) if you need help).
2. Click the **bug icon** (🪲) in the header toolbar to toggle the debug panel.
3. A floating panel will appear in the top-right area of the display.

## 2. Real-Time Screen Recording

The simplest approach captures whatever is on screen in real time, including your mouse interactions
and any animations. This uses the browser's built-in `MediaRecorder` API.

1. In the debug panel, click **"Start recording"**.
2. Interact with the display — rotate, zoom, play animations, switch events, etc.
3. Click **"Stop recording"** when you're done.
4. Click **"Download recording"** to save the result as a `.webm` video file.

> **Note:** Real-time recording captures at whatever frame rate your browser achieves.
> If performance drops during recording, the resulting video may have stutters or frame drops.
> For smooth, presentation-quality output, use the offline capture method described below.

## 3. Offline 4K Frame Capture

The offline capture method renders each frame independently at **3840 x 2160** (4K UHD) resolution.
Because each frame is rendered one at a time and saved as a PNG, the result is perfectly smooth
regardless of your machine's real-time performance.

### Starting a Capture

1. Expand the **"4K Capture"** folder in the debug panel.
2. Click **"▶ Start Capture"**.
3. The progress indicator will show the current frame count:
   - During the collision animation phase: `Frame 42 (collision phase)`
   - During the time evolution phase: `Frame 120 / 2000`

The capture runs through two phases automatically:
- **Collision phase** — the electron-ion collision animation
- **Time phase** — stepping through the event time, showing particles propagating through the detector

### Stopping Early

You don't have to wait for the full capture to finish. If you have enough frames:

1. Click **"⏹ Stop"** at any time.
2. The progress indicator will show how many frames were captured.
3. All frames captured before stopping are preserved.

### Downloading Frames

Once the capture finishes (or you stop it early):

1. Click **"💾 Download Frames"**.
2. The frames are packed into a ZIP archive (using `STORE` compression since PNGs are already compressed).
3. Your browser will download `frames_4k.zip` containing a `frames/` folder with files named
   `frame_000000.png`, `frame_000001.png`, etc.

> **Tip:** The frames stay in memory until you start a new capture.
> You can download them multiple times if needed.

## 4. Converting Frames to Video

Once you have the PNG frames, you can assemble them into a video using FFmpeg.

### Install FFmpeg

If you don't have FFmpeg installed:

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS (Homebrew)
brew install ffmpeg

# Or download from https://ffmpeg.org
```

### Encode to MP4

Unzip the frames and encode them:

```bash
unzip frames_4k.zip
cd frames

# High-quality H.264 MP4 at 60fps
ffmpeg -framerate 60 -i frame_%06d.png -c:v libx264 -pix_fmt yuv420p -crf 18 output_4k.mp4
```

The key parameters:
- `-framerate 60` — playback speed (60 fps for smooth motion)
- `-crf 18` — quality level (lower = better quality, 18 is visually lossless)
- `-pix_fmt yuv420p` — pixel format for broad compatibility

### Other Useful Encoding Options

```bash
# Smaller file size (slightly lower quality)
ffmpeg -framerate 60 -i frame_%06d.png -c:v libx264 -pix_fmt yuv420p -crf 23 output.mp4

# 30 fps (slower playback, half the duration)
ffmpeg -framerate 30 -i frame_%06d.png -c:v libx264 -pix_fmt yuv420p -crf 18 output_30fps.mp4

# Lossless (very large file)
ffmpeg -framerate 60 -i frame_%06d.png -c:v libx264 -pix_fmt yuv420p -crf 0 output_lossless.mp4

# WebM/VP9 for web embedding
ffmpeg -framerate 60 -i frame_%06d.png -c:v libvpx-vp9 -crf 30 -b:v 0 output.webm
```

## 5. Tips

- **Memory usage:** Each 4K PNG frame is roughly 5-15 MB uncompressed in memory.
  A 2000-frame capture may use several GB of RAM. Close other browser tabs if needed.
- **Start a new capture** to clear the previous frames from memory.
- **Camera position:** Set up your camera angle before starting the capture.
  The camera will move automatically during the collision and time animation phases.
- **Animation speed:** The offline capture respects the current animation speed setting.
  Adjust it before capturing if you want faster or slower playback.

## Next Steps

- Learn about the [Firebird data format (DEX)](../dex) to prepare your own event data.
- See [DD4Hep Plugin](../dd4hep-plugin) for generating trajectories from Geant4 simulations.
