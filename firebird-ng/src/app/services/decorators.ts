import 'reflect-metadata';
import { PropertyOptions, SelectOptions, NumberOptions, ColorOptions, BooleanOptions } from './painter-config.interface';

// Decorator factory functions
export function ConfigProperty(options: PropertyOptions = {}): PropertyDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    Reflect.defineMetadata('configProperty', options, target, propertyKey);
  };
}

export function SelectField(options: SelectOptions): PropertyDecorator {
  return ConfigProperty({ ...options, type: 'select' });
}

export function NumberField(options: NumberOptions): PropertyDecorator {
  return ConfigProperty({ ...options, type: 'number' });
}

export function ColorField(options: ColorOptions = {}): PropertyDecorator {
  return ConfigProperty({ ...options, type: 'color' });
}

export function BooleanField(options: BooleanOptions = {}): PropertyDecorator {
  return ConfigProperty({ ...options, type: 'boolean' });
}
