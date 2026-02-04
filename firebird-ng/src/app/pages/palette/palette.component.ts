import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  COOL_COLORS,
  MEDIUM_COLORS,
  WARM_COLORS,
  METALLIC_COLORS,
  ALL_COLORS,
} from '../../theme/cool2-geometry-ruleset';

interface ColorEntry {
  name: string;
  value: number;
  hexString: string;
  hsl: { h: number; s: number; l: number };
  saturationLevel: number;  // Extracted numeric level (50, 100, 200, etc.)
}

function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: (hex >> 16) & 255,
    g: (hex >> 8) & 255,
    b: hex & 255,
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function toHexString(num: number): string {
  return '#' + num.toString(16).padStart(6, '0').toUpperCase();
}

function extractSaturationLevel(name: string): number {
  // Extract numeric suffix like _50, _100, _200, _300, _400, _500
  const match = name.match(/_(\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // For colors without numeric suffix (like SIENNA, TERRACOTTA, CHROME, etc.)
  return 999;  // Sort at the end of their group
}

function processColors(colors: Record<string, number>): ColorEntry[] {
  return Object.entries(colors)
    .map(([name, value]) => {
      const rgb = hexToRgb(value);
      return {
        name,
        value,
        hexString: toHexString(value),
        hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
        saturationLevel: extractSaturationLevel(name),
      };
    })
    .sort((a, b) => {
      // Sort by saturation level first (50, 100, 200, etc.)
      if (a.saturationLevel !== b.saturationLevel) {
        return a.saturationLevel - b.saturationLevel;
      }
      // Then alphabetically by name
      return a.name.localeCompare(b.name);
    });
}

@Component({
  selector: 'app-palette',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './palette.component.html',
  styleUrls: ['./palette.component.scss'],
})
export class PaletteComponent {
  coolColors = processColors(COOL_COLORS);
  mediumColors = processColors(MEDIUM_COLORS);
  warmColors = processColors(WARM_COLORS);
  metallicColors = processColors(METALLIC_COLORS);
  allColors = processColors(ALL_COLORS);

  getTextColor(entry: ColorEntry): string {
    // Use white text for dark colors, black for light colors
    return entry.hsl.l < 50 ? '#ffffff' : '#000000';
  }

  formatHexValue(value: number): string {
    return '0x' + value.toString(16).toUpperCase();
  }
}
