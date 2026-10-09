/**
 * @summary Filters out items from list1 that are present in list2 and returns a new list.
 * @param {T[]} list1 - The first list of items.
 * @param {T[]} list2 - The second list of items to be removed from the first list.
 * @return {T[]} A new list with items from list1 that are not in list2.
 */
export function filterIntersectingItems<T>(list1: T[], list2: T[]): T[] {
  const set2 = new Set(list2);
  return list1.filter(item => !set2.has(item));
}

/**
 * @summary Removes items from list1 that are present in list2 in place.
 * @param {T[]} list1 - The first list of items.
 * @param {T[]} list2 - The second list of items to be removed from the first list.
 */
export function removeIntersectingItemsInPlace<T>(list1: T[], list2: T[]): void {
  const set2 = new Set(list2);
  let i = 0;
  while (i < list1.length) {
    if (set2.has(list1[i])) {
      list1.splice(i, 1); // Remove the item at index i
    } else {
      i++;
    }
  }
}
