/**
 * The EntryComponent class is an abstract base class for all entry components.
 */
export abstract class EntryComponent {

  /**
   * The name of the component, intended to be a unique identifier in UI menus and such.
   */
  name: string;

  /**
   * The type of the component, used to identify the component class
   * and facilitate deserialization and factory lookup.
   */
  type: string;

  /**
   * An optional string indicating the origin type of the component,
   * such as the original EDM4EIC/EDM4HEP/C++ data type from which it was derived.
   */
  originType?: string;

  /**
   * The constructor is protected to prevent direct instantiation of the abstract class.
   * Only derived classes can call this constructor when they implement their own constructors.
   *
   * @param name - The name of the component.
   * @param type - The type of the component.
   * @param originType - Optional origin type of the component.
   */
  protected constructor(name: string, type: string, originType?: string) {
    this.name = name;
    this.type = type;
    this.originType = originType;
  }

  /**
   * Abstract method that must be implemented by derived classes.
   * This method should serialize the component instance into a JSON-compatible object
   * following the Data Exchange format (DexObject).
   *
   * @returns A JSON-compatible object representing the serialized component.
   */
  abstract toDexObject(): any;
}

/**
 * The EntryComponentFactory interface defines the structure for factory classes
 * that are responsible for creating instances of EntryComponent subclasses.
 */
export interface EntryComponentFactory {

  /**
   * The type of the component that this factory creates.
   * This should match the `type` property of the components it creates.
   */
  type: string;

  /**
   * Method to create an instance of an EntryComponent subclass from a deserialized object.
   * The method takes a generic object (typically parsed from JSON) and returns an instance
   * of the corresponding EntryComponent subclass.
   *
   * @param obj - The deserialized object from which to create the component.
   * @returns An instance of an EntryComponent subclass.
   */
  fromDexObject(obj: any): EntryComponent;
}

/**
 * The componentRegistry is a mapping from component type strings to their corresponding factories.
 * It is used to look up the appropriate factory when deserializing components from JSON data.
 * This registry enables the system to support multiple component types dynamically.
 */
const componentRegistry: { [type: string]: EntryComponentFactory } = {};

/**
 * Registers a new component factory in the registry.
 * This allows the factory to be used during deserialization to create instances
 * of the component it represents.
 *
 * @param factory - The factory to register.
 */
export function registerComponentFactory(factory: EntryComponentFactory): void {
  componentRegistry[factory.type] = factory;
}

/**
 * Retrieves a component factory from the registry based on the component type.
 *
 * @param type - The type of the component.
 * @returns The corresponding EntryComponentFactory, or undefined if not found.
 */
export function getComponentFactory(type: string): EntryComponentFactory | undefined {
  return componentRegistry[type];
}

/**
 * Resets the component registry.
 * This function is intended for internal use during testing.
 *
 * @internal
 */
export function _resetComponentRegistry(): void {
  for (const key in componentRegistry) {
    delete componentRegistry[key];
  }
}
