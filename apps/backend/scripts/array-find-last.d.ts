interface Array<T> {
  findLast(
    predicate: (value: T, index: number, array: T[]) => unknown,
    thisArg?: unknown,
  ): T | undefined;
}
