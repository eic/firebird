import {deepCopy} from "./deep-copy";


describe('deepCopy', () => {
  it('should perform a deep copy of an array', () => {
    const array = [{ x: 1 }, { x: 2 }];
    const copiedArray = deepCopy(array);
    expect(copiedArray).toEqual(array);
    expect(copiedArray).not.toBe(array);
    expect(copiedArray[0]).not.toBe(array[0]);
  });

  it('should perform a deep copy of a Date object', () => {
    const date = new Date();
    const copiedDate = deepCopy(date);
    expect(copiedDate).toEqual(date);
    expect(copiedDate).not.toBe(date);
  });

  it('should perform a deep copy of an object', () => {
    const object = { a: { b: 2 }, c: 3 };
    const copiedObject = deepCopy(object);
    expect(copiedObject).toEqual(object);
    expect(copiedObject).not.toBe(object);
    expect(copiedObject.a).not.toBe(object.a);
  });

  it('should return primitive types directly', () => {
    const num = 42;
    const copiedNum = deepCopy(num);
    expect(copiedNum).toBe(num);
  });

  it('should handle null and undefined correctly', () => {
    expect(deepCopy(null)).toBeNull();
    expect(deepCopy(undefined)).toBeUndefined();
  });

  it('should copy complex objects with nested structures', () => {
    const complexObject = { a: { b: { c: 1 } }, d: [2, 3], e: new Date() };
    const copiedComplexObject = deepCopy(complexObject);
    expect(copiedComplexObject).toEqual(complexObject);
    expect(copiedComplexObject.a).not.toBe(complexObject.a);
    expect(copiedComplexObject.a.b).not.toBe(complexObject.a.b);
    expect(copiedComplexObject.d).not.toBe(complexObject.d);
    expect(copiedComplexObject.e).toEqual(complexObject.e);
    expect(copiedComplexObject.e).not.toBe(complexObject.e);
  });
});
