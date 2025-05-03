/**
 * The EventGroup class is an abstract base class for all entry components.
 */
export abstract class EventGroup {

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
  origin?: string;



  /**
   * The constructor is protected to prevent direct instantiation of the abstract class.
   * Only derived classes can call this constructor when they implement their own constructors.
   *
   * @param name - The name of the component.
   * @param type - The type of the component.
   * @param origin - Optional origin type of the component.
   */
  protected constructor(name: string, type: string, origin?: any) {
    this.name = name;
    this.type = type;
    this.origin = origin;
  }

  /**
   * Abstract method that must be implemented by derived classes.
   * This method should serialize the component instance into a JSON-compatible object
   * following the Data Exchange format (DexObject).
   *
   * @returns A JSON-compatible object representing the serialized component.
   */
  abstract toDexObject(): any;

  /** min and max time of the EventGroup
   * null means the component doesn't need time and shows as is
   *
   * @returns [min, max] range of times or null if it is not available for the component
   *
   * */
  abstract get timeRange(): [number, number] | null;
}

/**
 * The EventGroupFactory interface defines the structure for factory classes
 * that are responsible for creating instances of EventGroup subclasses.
 */
export interface EventGroupFactory {

  /**
   * The type of the component that this factory creates.
   * This should match the `type` property of the components it creates.
   */
  type: string;

  /**
   * Method to create an instance of an EventGroup subclass from a deserialized object.
   * The method takes a generic object (typically parsed from JSON) and returns an instance
   * of the corresponding EventGroup subclass.
   *
   * @param obj - The deserialized object from which to create the component.
   * @returns An instance of an EventGroup subclass.
   */
  fromDexObject(obj: any): EventGroup;
}

/**
 * The componentRegistry is a mapping from component type strings to their corresponding factories.
 * It is used to look up the appropriate factory when deserializing components from JSON data.
 * This registry enables the system to support multiple component types dynamically.
 */
const componentRegistry: { [type: string]: EventGroupFactory } = {};

/**
 * Registers a new component factory in the registry.
 * This allows the factory to be used during deserialization to create instances
 * of the component it represents.
 *
 * @param factory - The factory to register.
 */
export function registerEventGroupFactory(factory: EventGroupFactory): void {
  componentRegistry[factory.type] = factory;
}

/**
 * Retrieves a component factory from the registry based on the component type.
 *
 * @param type - The type of the component.
 * @returns The corresponding EventGroupFactory, or undefined if not found.
 */
export function getEventGroupFactory(type: string): EventGroupFactory | undefined {
  return componentRegistry[type];
}

/**
 * Resets the component registry.
 * This function is intended for internal use during testing.
 *
 * @internal
 */
export function _resetEventGroupRegistry(): void {
  for (const key in componentRegistry) {
    delete componentRegistry[key];
  }
}
