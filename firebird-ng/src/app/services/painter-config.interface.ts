// Base configuration interface
export interface PainterConfig {
  // Common properties for all painters
  visible: boolean;
  // Method to identify config type
  getConfigType(): string;
}

// Base options for property decorators
export interface PropertyOptions {
  label?: string;
  type?: string;
  showWhen?: (config: any) => boolean;
  options?: Array<{value: any, label: string}>;
}

export interface SelectOptions extends PropertyOptions {
  options: Array<{value: any, label: string}>;
}

export interface NumberOptions extends PropertyOptions {
  min?: number;
  max?: number;
  step?: number;
}

export interface ColorOptions extends PropertyOptions {}

export interface BooleanOptions extends PropertyOptions {}
