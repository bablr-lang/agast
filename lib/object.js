export const { hasOwn, freeze, isFrozen, seal, isSealed, getPrototypeOf, getOwnPropertySymbols } =
  Object;
export const { isArray } = Array;

export {
  deepFreezeRecord,
  isDeepRecord,
  isRecord,
  recordValues,
  arrayValues,
  arrayEntries,
  arrayKeys,
  recordEntries,
  recordKeys,
} from '@bablr/record';

let { setPrototypeOf } = Object;

export const freezeRecord = (obj) => {
  setPrototypeOf(obj, null);
  freeze(obj);
  return obj;
};

let arraySlice_ = Array.prototype.slice;
export const arraySlice = (arr, start, end) => {
  if (!isArray(arr)) throw new Error();

  return freezeRecord(arraySlice_.call(arr, start, end));
};

let arrayJoin_ = Array.prototype.join;
export const arrayJoin = (arr, sep) => {
  if (!isArray(arr)) throw new Error();

  return freezeRecord(arrayJoin_.call(arr, sep));
};

let arrayMap_ = Array.prototype.map;
export const arrayMap = (arr, fn) => {
  if (!isArray(arr)) throw new Error();

  return freezeRecord(arrayMap_.call(arr, fn));
};

let arrayReduce_ = Array.prototype.reduce;
export const arrayReduce = (arr, fn, initial) => {
  if (!isArray(arr)) throw new Error();

  return arrayReduce_.call(arr, fn, initial);
};

export const isObject = (obj) => obj !== null && typeof obj === 'object';
export const isPlainObject = (val) => val && [Object.prototype, null].includes(getPrototypeOf(val));
export const isFunction = (obj) => typeof obj === 'function';
export const isSymbol = (obj) => typeof obj === 'symbol';
export const isString = (obj) => typeof obj === 'string';
export const isType = (obj) => isSymbol(obj) || isString(obj);
export const isRegex = (obj) => obj instanceof RegExp;
export const isPattern = (obj) => isString(obj) || isRegex(obj);

export const arrayLast = (arr) => arr[arr.length - 1];
