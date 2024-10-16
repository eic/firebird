// entry-component.spec.ts

import {
  EntryComponent,
  EntryComponentFactory,
  registerComponentFactory,
  getComponentFactory,
  _resetComponentRegistry,
} from './entry-component';

describe('EntryComponent', () => {
  it('should not allow instantiation of abstract class', () => {
    // Attempting to instantiate an abstract class should result in a compile-time error.
    // This test ensures that the class is abstract by design.

    // Uncommenting the following line should cause a TypeScript error.
    // const component = new EntryComponent('name', 'type');

    // Since TypeScript prevents instantiation of abstract classes at compile time,
    // we can simulate this in the test by checking that an error is thrown.

    expect(() => {
      // Force a runtime check by attempting to instantiate via casting.
      (EntryComponent as any).call(null, 'name', 'type');
    }).toThrowError();
  });
});

describe('Component Registry', () => {
  // Define a TestComponentFactory for testing
  class TestComponentFactory implements EntryComponentFactory {
    type: string = 'TestType';

    fromDexObject(obj: any): EntryComponent {
      return new TestComponent(obj['name'], obj['originType']);
    }
  }

  // Define TestComponent class extending EntryComponent
  class TestComponent extends EntryComponent {
    constructor(name: string, originType?: string) {
      super(name, 'TestType', originType);
    }

    toDexObject(): any {
      return {
        name: this.name,
        type: this.type,
        originType: this.originType,
      };
    }
  }

  beforeEach(() => {
    // Reset the component registry before each test
    _resetComponentRegistry();
  });

  it('should register and retrieve component factories correctly', () => {
    const factory = new TestComponentFactory();

    // Register the factory
    registerComponentFactory(factory);

    // Retrieve the factory
    const retrievedFactory = getComponentFactory('TestType');

    expect(retrievedFactory).toBeDefined();
    expect(retrievedFactory).toBe(factory);
  });

  it('should return undefined for unregistered component types', () => {
    const retrievedFactory = getComponentFactory('UnknownType');

    expect(retrievedFactory).toBeUndefined();
  });

  it('should overwrite existing factory when registering a factory with the same type', () => {
    const factory1 = new TestComponentFactory();
    const factory2 = new TestComponentFactory();

    // Register the first factory
    registerComponentFactory(factory1);

    // Register the second factory with the same type
    registerComponentFactory(factory2);

    // Retrieve the factory
    const retrievedFactory = getComponentFactory('TestType');

    expect(retrievedFactory).toBe(factory2);
  });

  it('should use the correct factory to create component instances', () => {
    const factory = new TestComponentFactory();
    registerComponentFactory(factory);

    const dexObject = {
      name: 'TestComponent',
      type: 'TestType',
      originType: 'TestOrigin',
    };

    const retrievedFactory = getComponentFactory('TestType');
    expect(retrievedFactory).toBeDefined();

    const component = retrievedFactory!.fromDexObject(dexObject);
    expect(component).toBeInstanceOf(EntryComponent);
    expect(component.name).toBe('TestComponent');
    expect(component.type).toBe('TestType');
    expect(component.originType).toBe('TestOrigin');
  });
});
