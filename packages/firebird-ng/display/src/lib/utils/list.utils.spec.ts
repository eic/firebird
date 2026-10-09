import { filterIntersectingItems, removeIntersectingItemsInPlace } from './list.utils';

describe('List Utilities', () => {

  describe('filterIntersectingItems', () => {
    it('should filter out items from list1 that are present in list2', () => {
      const list1 = [1, 2, 3, 4, 5];
      const list2 = [3, 4, 5, 6, 7];
      const result = filterIntersectingItems(list1, list2);
      expect(result).toEqual([1, 2]);
      expect(list1).toEqual([1, 2, 3, 4, 5]); // Ensure list1 is not modified
    });

    it('should return an empty array if all items in list1 are in list2', () => {
      const list1 = [1, 2, 3];
      const list2 = [1, 2, 3];
      const result = filterIntersectingItems(list1, list2);
      expect(result).toEqual([]);
    });

    it('should return the original list1 if no items in list1 are in list2', () => {
      const list1 = [1, 2, 3];
      const list2 = [4, 5, 6];
      const result = filterIntersectingItems(list1, list2);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('removeIntersectingItemsInPlace', () => {
    it('should remove items from list1 that are present in list2 in place', () => {
      const list1 = [1, 2, 3, 4, 5];
      const list2 = [3, 4, 5, 6, 7];
      removeIntersectingItemsInPlace(list1, list2);
      expect(list1).toEqual([1, 2]);
    });

    it('should remove all items from list1 if they are all in list2', () => {
      const list1 = [1, 2, 3];
      const list2 = [1, 2, 3];
      removeIntersectingItemsInPlace(list1, list2);
      expect(list1).toEqual([]);
    });

    it('should not modify list1 if no items in list1 are in list2', () => {
      const list1 = [1, 2, 3];
      const list2 = [4, 5, 6];
      removeIntersectingItemsInPlace(list1, list2);
      expect(list1).toEqual([1, 2, 3]);
    });
  });

});
