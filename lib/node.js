/* global BigInt */

import {
  ReferenceTag,
  AttributeDefinitionTag,
  CloseNodeTag,
  GapTag,
  LiteralTag,
  OpenNodeTag,
  Property,
  ShiftTag,
  TreeNode,
  GapNode,
  NullNode,
  BindingTag,
  Document,
  HashTag,
  NullTag,
  EscapeTag,
  EmptyTag,
  SumsTag,
} from './symbols.js';
import {
  arrayLast,
  arrayMap,
  arrayReduce,
  arraySlice,
  freezeRecord,
  isArray,
  isObject,
  isRecord,
  isString,
} from './object.js';
import {
  buildReferenceTag,
  parseTag,
  parseTagType,
  printReferenceFlags,
  printReferenceSumsKey,
  printTag,
  startsNode,
} from './tags.js';
import { arrayValues, concat, evaluateReturn } from '@bablr/stream-helpers';
import { _validNodes, isValidTag } from './_valid.js';
import { parse } from '@babel/eslint-parser';

let compareNames = (a, b) => (a > b ? 1 : b > a ? -1 : 0);

// expected node size is 11 children
let CRITICAL_THRESHHOLD = 0x1000; // 0x10000 / 16

// expected literal size is 88 characters
// we expect 968 characters per node
// 88 characters per hash (SHA) + 4 (####) + contentLength
// probably around 12% - 15% overhead?
let LITERAL_CRITICAL_THRESHHOLD = 0x4000000; // 0x100000000 / 64

let porcelain = { porcelain: true };

let { setPrototypeOf, freeze } = Object;
let { isFinite } = Number;

const freezeRecord_ = (obj) => {
  setPrototypeOf(obj, null);
  freeze(obj);
  return obj;
};

const countValues = (values, depth) => {
  if (Object.getPrototypeOf(values)) throw new Error();

  return depth > 1
    ? Array.prototype.map.call(values, getValueSize).reduce((a, b) => a + b, 0)
    : values.length;
};

export const getDepth = (node) => {
  return isNode(node) ? (node.length ? parseTag(node[0]).value.depth ?? 1 : 1) : 0;
};

export const getFlags = (node) => {
  return isNode(node) ? (node.length ? parseTag(node[0]).value.flags : null) : 0;
};

const treeFrom = (...values) => {
  return treeFromValues(values);
};

export { treeFrom as from };

const validateShift = (lastProperty, property) => {
  if (lastProperty?.type === Property && property.type === Property) {
    let lastShift = lastProperty.value.shift;
    let { shift } = property.value;

    if (lastShift && shift) {
      if (shift.index !== lastShift.index + 1) throw new Error('bad shift');
    }
  }
};

const getFirstPropertyChild = (children) => {
  for (let child of traverse(children)) {
    if (child.type === Property) {
      return child;
    }
  }
  return null;
};

export const getPathValue = (path) => {
  return getValues(path.node)[path.index];
};

export const allShouldersCold = (lastValue, value) => {
  if (getDepth(lastValue) !== getDepth(value)) throw new Error();

  let shoulderPath = findTreePath(0, value);
  let lastShoulderPath = findTreePath(-1, lastValue);

  for (let d = getDepth(lastValue); d >= 1; d--) {
    if (valuesBreak_(concat(arrayValues(lastShoulderPath.node), arrayValues(shoulderPath.node)))) {
      return true;
    }

    if (d === 1) {
      let shoulderValue = shoulderPath.node[shoulderPath.index];
      let lastShoulderValue = lastShoulderPath.node[lastShoulderPath.index];

      if (
        lastShoulderValue?.type === LiteralTag &&
        shoulderValue?.type === LiteralTag &&
        !literalBreaks(lastShoulderValue.value + shoulderValue.value)
      ) {
        return false;
      }
    }

    shoulderPath = shoulderPath.parent;
    lastShoulderPath = lastShoulderPath.parent;
  }

  // the construction is irreducable
  return true;
};

export const treeFromValues = (values) => {
  if (!isArray(values) && !values[Symbol.iterator]) throw new Error();
  if (values.length && !isString(values[0])) throw new Error();

  let tree;

  if (!isArray) {
    return treeFromValues([...values]);
  }

  freezeRecord(values);

  if (!values.length) {
    throw new Error();
  }

  if (isFinite(values[0])) throw new Error();

  let sigilTag = parseTag(values[0]);

  if (sigilTag.type === ShiftTag) throw new Error('no longer supported');

  let isPropertyRoot = [EmptyTag, ReferenceTag, ShiftTag].includes(sigilTag.type);
  let isRoot = startsNode(sigilTag) && (sigilTag.type !== OpenNodeTag || !sigilTag.value.type);
  let depth = sigilTag.type !== OpenNodeTag ? 1 : sigilTag.value.depth;

  if (!isRoot && depth > 1) {
    if (values.length === 1) throw new Error();

    let size = 0;
    let lastValue = null;
    for (let value of arrayValues(values)) {
      size += getSize(value);
      if (getSize(value) <= 1) {
        throw new Error('subtrees must be at least size 2');
      } else if (lastValue && !allShouldersCold(lastValue, value)) {
        throw new Error('nodes should collapse');
      } else if (lastValue && !validateShift(getAt(-1, lastValue), getAt(0, value))) {
      } else if (getDepth(value) !== depth - 1) {
        throw new Error('tree of mixed depths');
      } else if (!_validNodes.has(value)) {
        throw new Error('tree node not valid');
      }
      lastValue = value;
    }
  } else if (!isPropertyRoot) {
    if (!isRoot) {
      if (values.length > 1 && valuesBreak(arrayValues(values))) {
        throw new Error('node should break');
      }
    }

    let lastShift = null;
    for (let value of arrayValues(values)) {
      let tag = parseTag(value);

      if (isString(value) && printTag(tag, { porcelain: true }) !== value) throw new Error();

      let lastLiteralTag = null;
      switch (tag.type) {
        case Property: {
          let property = value;
          // let { shift } = property.value;

          // validateShift(lastShift, shift);

          // lastShift = shift;
          break;
        }

        case TreeNode:
        case NullNode:
        case GapNode: {
          throw new Error();
        }

        case ReferenceTag:
        case ShiftTag:
        case SumsTag:
          if (!isPropertyRoot) {
            throw new Error('tag must occur in property');
          }
          break;

        case BindingTag: {
          if (sigilTag.type !== BindingTag) throw new Error();
          break;
        }

        case LiteralTag:
          if (literalBreaks(tag.value.value)) throw new Error();
          if (lastLiteralTag && !literalBreaks(lastLiteralTag.value.value + tag.value.value))
            throw new Error();
          lastLiteralTag = tag;
          break;
      }

      if (tag.type !== LiteralTag) {
        lastLiteralTag = null;
      }
    }
  } else {
    // property root
    for (let value of arrayValues(values)) {
      if (value == null) throw new Error();
    }
  }

  _validNodes.add(values);

  return values;
};

export const stepGearHashLiteral = (value, hash = 0) => {
  if (value === null) throw new Error();
};

export const literalBreaks = (str) => {
  let hash = 0n;
  let lh1 = null;
  let lh2 = null;
  let lh3 = null;
  for (let chr of str) {
    for (let byte of encodeUTF8([chr.codePointAt(0)])) {
      hash = BigInt(BigInt(hash << 1n) + BigInt(GEARS32[byte])) & BigInt(0xffffffff);
    }

    if (literalHashesBreak(lh3, lh2, lh1, hash)) {
      return true;
    }

    lh3 = lh2;
    lh2 = lh1;
    lh1 = hash;
  }

  return false;
};

export function* literalParts(str) {
  let hash = 0n;
  let lh1 = null;
  let lh2 = null;
  let lh3 = null;
  let part = '';

  for (let chr of str) {
    for (let byte of encodeUTF8([chr.codePointAt(0)])) {
      hash = BigInt(BigInt(hash << 1n) + BigInt(GEARS32[byte])) & BigInt(0xffffffff);
    }

    if (literalHashesBreak(lh3, lh2, lh1, hash)) {
      if (part.length) {
        yield part;
      }
      hash = 0n;
      lh1 = null;
      part = '';

      for (let byte of encodeUTF8([chr.codePointAt(0)])) {
        hash = BigInt(BigInt(hash << 1n) + BigInt(GEARS32[byte])) & BigInt(0xffffffff);
      }
    }

    part += String.fromCodePoint(chr.codePointAt(0));

    lh3 = lh2;
    lh2 = lh1;
    lh1 = hash;
  }

  if (part.length) {
    yield part;
  }
}

const setValuesAt = (idx, node, value) => {
  let values = getValues(node);
  let flags = getFlags(node);

  if (!isFinite(idx)) throw new Error();

  if (!value == null) {
    throw new Error();
  }

  let newValues = [...arrayValues(values)];
  newValues[idx] = value;
  return treeFromValues(newValues, flags, getDepth(node));
};

export const hashesBreak = (h1, h2, h3, h4) => {
  return false;
  if (h1 == null) return false;
  if (h1 < CRITICAL_THRESHHOLD) {
    let max = Math.max(h2, h3, h4);
    return max > 0xffff - CRITICAL_THRESHHOLD;
  } else {
    let min = Math.min(h2, h3, h4);
    return min < CRITICAL_THRESHHOLD;
  }
};

export const literalHashesBreak = (h1, h2, h3, h4) => {
  return false;
  if (h1 == null) return false;
  let low = LITERAL_CRITICAL_THRESHHOLD;
  let high = 0xffffffff - LITERAL_CRITICAL_THRESHHOLD;
  if (h1 < LITERAL_CRITICAL_THRESHHOLD) {
    return h2 > high || h3 > high || h4 > high;
  } else {
    return h2 < low || h3 < low || h4 < low;
  }
};

const valuesBreak_ = (values) => {
  let hash = 0;
  let lh1 = null,
    lh2 = null,
    lh3 = null;
  let first = true;
  for (let value of values) {
    if (value !== null) {
      hash = stepGearHashValue(value, hash);
      if (hashesBreak(lh3, lh2, lh1, hash)) return true;
      lh3 = lh2;
      lh2 = lh1;
      lh1 = hash;
    }
  }
  return false;
};

const valuesBreak = (values) => {
  let hash = 0;
  let lh1 = null;
  let lh2 = null;
  let lh3 = null;
  let lastValue = null;
  let isLeaf = !values.length || values[0] === null || isString(values[0]);
  for (let value of values) {
    hash = stepGearHashValue(value, hash);
    if (
      isLeaf
        ? hashesBreak(lh3, lh2, lh1, hash)
        : valuesBreak_(concat(arrayValues(lastValue), arrayValues(value)))
    ) {
      return true;
    }
    lh3 = lh2;
    lh2 = lh1;
    lh1 = hash;
    lastValue = value;
  }
  return false;
};

const indexFromPath = (path) => {
  let index = 0;
  for (let i = 0; i < path.length; i++) {
    let { node, index: nodeIndex } = path[i];
    let values = getValues(node);
    if (getDepth(node)) {
      for (let j = 0; j < nodeIndex; j++) {
        let value = values[j];
        index += getSize(value);
      }
    }
  }
  return index;
};

export const findTreePath = (idx, tree, depth = Infinity) => {
  return evaluateReturn(__findTreePath(idx, tree, depth));
};

export const __findTreePath = (idx, tree, depth = Infinity) => {
  return ___findTreePath(idx, tree, depth);
};

function* ___findTreePath(idx, tree, depth = Infinity) {
  if (idx == null) return null;
  if (tree && !isArray(tree)) throw new Error();

  let path = null;
  let node = tree;
  let treeDepth = getDepth(tree);

  if (isArray(idx)) {
    if (idx.length > getDepth(tree)) return null;
    for (let seg of arrayValues(idx)) {
      let index = typeof seg !== 'object' ? seg : seg.index;
      if (typeof index === 'string') throw new Error();
      if (!isNode(node)) return null;
      let index_ = index < 0 ? node.length + index : index;
      path = freezeRecord({ parent: path, depth: path ? path.depth + 1 : 1, node, index: index_ });
      yield path;
      node = node[index_];
      if (node && !isNode(node)) {
        return path;
      }
      if (!node) return null;
    }

    return path;
  }

  let treeSum = getSize(tree);
  let currentIdx = idx < 0 ? treeSum - 1 : 0;
  let direction = idx < 0 ? -1 : 1;
  let targetIdx = idx < 0 ? treeSum + idx : idx;

  stack: while (node) {
    assertValidNode(node);

    const values = node;
    let candidateNode;

    let backwards = idx < 0;
    const increment = backwards ? -1 : 1;
    for (
      let i = backwards ? values.length - 1 : 0;
      backwards ? i >= 0 : i < values.length;
      i += increment
    ) {
      let value = values[i];
      if (isNode(value) && (path?.depth ?? 0) + 1 < Math.min(depth, treeDepth)) {
        candidateNode = value;

        const sum = getSize(candidateNode);
        const nextIndex = currentIdx + sum * direction;
        if (
          (backwards ? nextIndex < targetIdx : nextIndex > targetIdx) ||
          (backwards ? nextIndex < 0 : nextIndex >= treeSum)
        ) {
          path = freezeRecord({ parent: path, depth: path ? path.depth + 1 : 1, node, index: i });
          yield path;
          node = candidateNode;
          continue stack;
        } else {
          currentIdx += sum * direction;
        }
      } else {
        const nextIndex = currentIdx + direction;
        if (!isFinite(targetIdx)) {
          path = freezeRecord({
            parent: path,
            depth: path ? path.depth + 1 : 1,
            node,
            index: targetIdx,
          });
          yield path;

          return path;
        } else if (backwards ? nextIndex < targetIdx : nextIndex > targetIdx) {
          path = freezeRecord({ parent: path, depth: path ? path.depth + 1 : 1, node, index: i });
          yield path;

          return path;
        } else if (
          backwards
            ? nextIndex < targetIdx || nextIndex < 0
            : nextIndex > targetIdx || nextIndex >= treeSum
        ) {
          break;
        } else {
          currentIdx += direction;
        }
      }
    }

    path = freezeRecord({
      parent: path,
      depth: path ? path.depth + 1 : 1,
      node,
      index: backwards ? -Infinity : Infinity,
    });
    yield path;

    return path;
  }

  return null;
}

const getPrevTreePath = (treePath) => {
  let treePath_ = treePath;

  while (treePath_) {
    let { parent, depth, node, index } = treePath_;
    if (index > 0) {
      --index;
      return freezeRecord({ parent, depth, node, index });
    } else {
      let targetDepth = depth;
      while (parent && parent.index > 0) {
        parent = parent.parent;
      }
      if (!parent) return null;

      depth = parent.depth;
      node = parent.node;
      index = parent.index - 1;
      parent = parent.parent;

      let childPath = freezeRecord({ parent, depth, node, index });

      // go back down to target depth
      while (depth < targetDepth) {
        let child = node[1][index];

        if (child == null) return null;

        depth++;
        parent = childPath;
        node = child;
        index = node[1].length - 1;

        childPath = freezeRecord({ parent, depth, node, index });
      }

      return childPath;
    }
  }

  return null;
};

const getNextTreePath = (treePath) => {
  let treePath_ = treePath;

  while (treePath_) {
    let { parent, depth, node, index } = treePath_;
    if (index + 1 < node.length) {
      ++index;
      return freezeRecord({ parent, depth, node, index });
    } else {
      let targetDepth = depth;
      while (parent && parent.index + 1 >= parent.node.length) {
        parent = parent.parent;
      }
      if (!parent) return null;

      depth = parent.depth;
      node = parent.node;
      index = parent.index + 1;
      parent = parent.parent;

      let childPath = freezeRecord({ parent, depth, node, index });

      // go back down to target depth
      while (depth < targetDepth) {
        let child = node[index];

        if (child == null) return null;

        depth++;
        parent = childPath;
        node = child;
        index = 0;

        childPath = freezeRecord({ parent, depth, node, index });
      }

      return childPath;
    }
  }

  return null;
};

const getTreePathValue = (treePath) => {
  return treePath.node[1][treePath.index];
};

const getLastTreePath = (treePath) => {
  let { parent, depth, node, index } = treePath;

  let value = node[1][index];

  return freezeRecord({
    parent,
    depth: depth + 1,
    node: value,
    index: value[1].length - 1,
  });
};

const pathsSameNode = (a, b) => {
  // nodes aren't safe to compare with === but paths are
  return (a === null && a === b) || (a && b && a.parent === b.parent && a.node === b.node);
};

const buildSplicePath = (idx, removeCount, insertValues, tree) => {
  let idx_ = !isArray(idx) && idx < 0 ? Math.max(getSize(tree) + idx, 0) : idx;
  let splicePath = null;

  for (let path of __findTreePath(idx_, tree)) {
    let isLeaf_ = path.depth === getDepth(tree);
    splicePath = {
      parent: splicePath,
      path,
      node: path.node,
      removes: isLeaf_ ? removeCount : 1,
      inserts: isLeaf_ ? [...insertValues] : [],
      target: path.index,
    };
  }
  return splicePath;
};

const _splice = (idx, removeCount, insertValues, tree) => {
  let isLeaf = true;
  let splicePath = buildSplicePath(idx, removeCount, insertValues, tree);
  let flags = getFlags(tree);

  let nextInserts;

  let frame = splicePath;
  while (frame) {
    let parentFrame = frame.parent;

    let lastPath = null;
    let hash = 0;
    let lh1 = null;
    let lh2 = null;
    let lh3 = null;
    let { target, removes, inserts } = frame;

    nextInserts = parentFrame?.inserts || [];

    if ((isLeaf || isFinite(target)) && target > 0) {
      // leading pulldown
      let chunk = [...arrayValues(frame.node)].slice(0, target);

      if (chunk.length) {
        inserts.unshift(...(isLeaf ? chunk : chunk.map((value) => value[1])));
      }
    } else {
      if (frame.parent?.path.index > 0) {
        // pull down the whole last chunk in case we need to re-break with it
        debugger;
        inserts.unshift(
          ...arrayValues(frame.parent.node[frame.parent.path.index - 1]).map((value) =>
            isArray(value) ? value[1] : value,
          ),
        );
        ++parentFrame.target;
        ++parentFrame.removes;
      }
    }

    let chunk = [];

    let lastValue;
    for (let value_ of inserts) {
      let value = isObject(value_) ? value_ : printTag(parseTag(value_), porcelain);

      let breaks =
        !!lastValue &&
        (isLeaf
          ? hashesBreak(lh3, lh2, lh1, stepGearHashValue(value, hash))
          : valuesBreak_(concat(arrayValues(lastValue), arrayValues(value))));

      if (breaks) {
        let lastValue = null;
        if (chunk.length) {
          lastValue = chunk.pop();
          if (isArray(lastValue)) {
            lastValue = lastValue[1];
          }
        }

        if (!nextInserts.length || valuesBreak_(concat(arrayLast(nextInserts), chunk))) {
          nextInserts.push(chunk);
        } else {
          let lastInsertValue = nextInserts.pop();
          nextInserts.push([...lastInsertValue, ...chunk]);
        }

        chunk = [];
        lh1 = null;
        lh2 = null;
        lh3 = null;
        hash = 0;

        chunk.push(isLeaf ? lastValue : treeFromValues(lastValue, flags));
        chunk.push(isLeaf ? value : treeFromValues(value, flags));
      } else {
        if (isLeaf || !chunk.length) {
          let value_ = isLeaf ? value : treeFromValues(value, flags);
          hash = stepGearHashValue(value_, hash);
          chunk.push(value_);
        } else {
          let lastValue = chunk.pop();
          if (isArray(lastValue)) {
            lastValue = lastValue[1];
          }
          let tree = treeFromValues(concat(arrayValues(lastValue), arrayValues(value)), flags);
          hash = stepGearHashValue(tree, hash);
          chunk.push(tree);
        }
      }

      lh3 = lh2;
      lh2 = lh1;
      lh1 = hash;
      lastValue = value;
    }

    let path = getNextTreePath(frame);
    let remainingRebreaks = 8;
    let remainingRemoves = removes;
    for (; path && isFinite(target) && remainingRebreaks; path = getNextTreePath(path)) {
      let value = path.node[path.index];
      let parentNodesBreak = lastPath && !pathsSameNode(lastPath, path);

      if (parentNodesBreak) {
        ++parentFrame.removes;
      }

      if (remainingRemoves) {
        --remainingRemoves;
      } else {
        hash = stepGearHashValue(value, hash);

        let breaks =
          !!lastValue &&
          (isLeaf
            ? hashesBreak(lh3, lh2, lh1, hash)
            : valuesBreak_(concat(arrayValues(lastValue), arrayValues(value))));

        if (breaks) {
          nextInserts.push(chunk);
          chunk = [];
          lh1 = null;
          lh2 = null;
          lh3 = null;
          hash = stepGearHashValue(value);
          chunk.push(value);
        } else {
          chunk.push(value);
        }

        --remainingRebreaks;

        lastValue = value;
        lh3 = lh2;
        lh2 = lh1;
        lh1 = hash;
      }
      lastPath = path;
    }

    if (chunk.length) {
      if (!isLeaf && !nextInserts.length) {
        // go down down down!

        if (!frame.parent) {
          return chunk[0];
        }

        let leftSiblingsPath = getPrevTreePath(frame.parent.path);
        // need rightmost value in this node?
        let leftSiblings = leftSiblingsPath?.node[leftSiblingsPath.index];
        let rightSiblingsPath = getNextTreePath(frame.parent.path);
        let rightSiblings = rightSiblingsPath?.node[rightSiblingsPath.index];

        let removes = 0;
        let inserts = [];
        if (
          leftSiblings &&
          // Not enough!! *some* values may be able to break left
          !valuesBreak(
            concat(
              arrayValues(getTreePathValue(getLastTreePath(leftSiblingsPath))),
              arrayValues(chunk[0]),
            ),
          )
        ) {
          // merge with left
          path = getLastTreePath(leftSiblingsPath);
          ++frame.removes;
          --frame.target;
          removes = 1;
          inserts = [
            treeFromValues([...arrayValues(getTreePathValue(path)), ...arrayValues(chunk[0])]),
          ];
        } else if (rightSiblings && !valuesBreak(concat(arrayValues(rightSiblings), chunk))) {
          throw new Error('not implemented');

          path = rightSiblingsPath;
        } else if (rightSiblings) {
          throw new Error('not implemented');

          // force reflow right siblings onto this chunk
        } else if (leftSiblings) {
          path = leftSiblingsPath;
          ++frame.removes;
          --frame.target;
          removes = 1;
          inserts = [
            treeFromValues([...arrayValues(getTreePathValue(path)), treeFromValues(chunk)]),
          ];
        } else {
          throw new Error();
        }

        frame = {
          parent: frame.parent,
          path,
          node: path.node,
          removes,
          inserts,
          target: path.index,
        };
        isLeaf = frame.path.depth === getDepth(tree);
        continue;
      } else if (nextInserts.length && valuesBreak_(concat(arrayLast(nextInserts), chunk))) {
        nextInserts.push(chunk);
      } else {
        let lastInsertValue = nextInserts.pop() || [];
        nextInserts.push([...lastInsertValue, ...chunk]);
      }
    }

    if (path && (isLeaf || isFinite(target)) && path.index < path.node.length) {
      // trailing pulldown
      let chunk = [...arrayValues(path.node)].slice(path.index);

      if (chunk.length) {
        nextInserts.push(...chunk);
      }
    }

    isLeaf = false;
    frame = frame.parent;
  }

  return nextInserts.length === 1 && isArray(nextInserts[0])
    ? treeFromValues(nextInserts[0], flags)
    : treeFromValues(
        nextInserts.map((node) => treeFromValues(node, flags)),
        flags,
      );
};

export const splice = (idx, removeCount, insertValues, tree) => {
  if (!isValidNode(tree)) throw new Error();

  // let result = _splice(idx, removeCount, insertValues, tree);

  // TODO remove me!
  let values = [...arrayValues(tree)];

  values.splice(idx, removeCount, ...insertValues);

  let result = treeFromValues(values);

  if (getSize(result) !== getSize(tree) - removeCount + (insertValues?.length ?? 0)) {
    throw new Error();
  }

  return result;
};

export const isValidNode = (node) => {
  return _validNodes.has(node);
};

export const assertValidNode = (node) => {
  if (!isValidNode(node)) throw new Error();
};

export const isNode = (value) => {
  let isArr = isArray(value);
  return isArr && typeof value[0] === 'string';
};

export function* traverse(tree) {
  let states = [{ node: tree, i: 0 }];

  assertValidNode(tree);

  stack: while (states.length) {
    let s = states[states.length - 1];
    let { node } = s;

    let values = node;
    let depth = getDepth(node);

    for (let { i } = s; s.i < values.length; ) {
      let value = values[i];
      if (isNode(value) && parseTagType(value) !== Property) {
        let node = value;
        assertValidNode(node);
        states.push({ node, i: 0 });
        i = ++s.i;
        continue stack;
      } else {
        if (value !== null) {
          yield value;
        }
        i = ++s.i;
      }
    }

    states.pop();
  }
}

export function* traverseChildren(tree) {
  let depth = getDepth(tree);
  for (let i = 1; i < tree.length; i++) {
    let value = tree[i];
    if (parseTagType(value) === CloseNodeTag) {
      break;
    }
    if (depth > 1) {
      yield* traverse(value);
    } else {
      yield value;
    }
  }
}

export const push = (tag, tags) => {
  if (isArray(tag) && ![ReferenceTag, ShiftTag, EmptyTag].includes(parseTagType(tag[0])))
    throw new Error();

  return splice(getSize(tags), 0, [tag], tags);
};

export const replaceAt = (idx, tag, tree) => {
  return splice(idx, 1, [tag], tree);
};

export const removeAt = (idx, tree) => {
  return splice(idx, 1, [], tree);
};

export const map = (fn, tree) => {
  let result = null;
  for (let tag of traverse(tree)) {
    result = result ? push(fn(tag), result) : treeFromValues([fn(tag)]);
  }
  return result;
};

const getValueSize = (value) => {
  if (!isNode(value)) {
    return 1;
  } else {
    let node = value;
    let sigilTag = parseTag(node[0]);

    if ([EmptyTag, ReferenceTag, ShiftTag].includes(sigilTag)) {
      return node.length;
    }

    let { depth } = sigilTag.value;
    if (depth > 1) {
      return arrayReduce(node, (acc, prop) => acc + prop[3].count, 0);
    } else {
      return node.length;
    }
  }
};

export const getSize = (tree) => {
  if (tree == null) {
    return 0;
  } else {
    return getValueSize(tree);
  }
};

export const getChildrenSize = (tree) => {
  let size = getSize(tree);

  if (size > 0) {
    --size;
  }
  if (parseTagType(arrayLast(tree)) === CloseNodeTag) {
    --size;
  }

  return size;
};

export const findPath = (idx, tree, options = freezeRecord({})) => {
  if (!isRecord(options)) throw new Error();
  if (idx == null) return null;
  if (tree && !isArray(tree)) throw new Error();
  let { depth = Infinity, existing = false } = options;

  let path = [];
  let node = tree;
  let treeDepth = getDepth(tree);

  if (isArray(idx)) {
    if (idx.length > Math.min(depth, getDepth(tree))) return null;
    for (let seg of arrayValues(idx)) {
      let index = !isObject(seg) ? seg : seg.index;

      if (isObject(seg) && seg.node !== node) throw new Error();
      if (isString(index)) throw new Error();
      if (!isNode(node)) return null;
      let index_ = index < 0 ? node.length + index : index;
      path.push(freezeRecord({ index: index_, node }));
      node = node[index_];
      if (node != null && !isNode(node)) {
        return freezeRecord(path);
      }
      if (!node) return null;
    }

    return freezeRecord(path);
  }

  let treeSum = getSize(tree);
  let currentIdx = idx < 0 ? treeSum - 1 : 0;
  let direction = idx < 0 ? -1 : 1;
  let targetIdx = idx < 0 ? treeSum + idx : idx;

  stack: while (node) {
    assertValidNode(node);

    let values = node;
    let candidateNode;

    let backwards = idx < 0;
    let increment = backwards ? -1 : 1;
    for (
      let i = backwards ? values.length - 1 : 0;
      backwards ? i >= 0 : i < values.length;
      i += increment
    ) {
      let value = values[i];
      if (isNode(value) && path.length + 1 < Math.min(depth, treeDepth)) {
        candidateNode = value;

        let sum = getSize(candidateNode);
        let nextIndex = currentIdx + sum * direction;
        if (
          (backwards ? nextIndex < targetIdx : nextIndex > targetIdx) ||
          (backwards ? nextIndex < 0 : nextIndex >= treeSum)
        ) {
          path.push(freezeRecord({ index: i, node }));
          node = candidateNode;
          continue stack;
        } else {
          currentIdx += sum * direction;
        }
      } else {
        let nextIndex = currentIdx + direction;
        if (!isFinite(targetIdx)) {
          path.push(freezeRecord({ index: targetIdx, node }));

          return freezeRecord(path);
        } else if (backwards ? nextIndex < targetIdx : nextIndex > targetIdx) {
          path.push(freezeRecord({ index: i, node }));

          return freezeRecord(path);
        } else if (
          backwards
            ? nextIndex < targetIdx || nextIndex < 0
            : nextIndex > targetIdx || nextIndex >= treeSum
        ) {
          break;
        } else {
          currentIdx += direction;
        }
      }
    }

    if (existing) {
      return null;
    } else {
      path.push(freezeRecord({ index: backwards ? -Infinity : Infinity, node }));

      return freezeRecord(path);
    }
  }

  return null;
};

export const pathsEqual = (a, b) => {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i].node !== b[i].node || a[i].index !== b[i].index) return false;
  }
  return true;
};

export const isValidPath = (tagsPath) => {
  return (
    isRecord(tagsPath) &&
    isArray(tagsPath) &&
    [...arrayValues(tagsPath)].every((frame) => isRecord(frame))
  );
};

export const indexForPath = (path, tree) => {
  if (!findPath(path, tree)) return null;

  let index = 0;

  for (let i = 0; i < path.length; i++) {
    let frame = path[i];

    for (let j = 0; j < frame.index; j++) {
      let value = frame.node[j];

      index += value != null ? (i === path.length - 1 ? 1 : getSize(value)) : 0;
    }
  }

  return index;
};

export const referenceIsSingular = (ref) => {
  return !ref.flags.array && !['#', '.', '__'].includes(ref.type);
};

export const referencesAreEqual = (a, b) => {
  return (
    a === b ||
    (a.type === b.type &&
      a.name === b.name &&
      a.flags.array === b.flags.array &&
      a.flags.intrinsic === b.flags.intrinsic &&
      a.flags.hasGap === b.flags.hasGap &&
      a.flags.expression === b.flags.expression)
  );
};

const __findCount = (sumsKey, sortedArray, startIdx, endIdx) => {
  if (!sortedArray.length || endIdx < startIdx) return null;
  if (!isString(sumsKey)) throw new Error();

  let expected = sumsKey;
  let idx = startIdx + Math.floor((endIdx - startIdx) / 2 + 0.1);
  let skipIdx = idx * 3;
  let sumsKey_ = sortedArray[skipIdx];
  let flags = sortedArray[skipIdx + 1];
  let value = sortedArray[skipIdx + 2];

  let direction = compareNames(expected, sumsKey_);

  if (direction === 0) {
    return value;
  } else {
    if (startIdx === endIdx) return null;

    if (direction > 0) {
      return __findCount(sumsKey, sortedArray, idx + 1, endIdx);
    } else {
      return __findCount(sumsKey, sortedArray, startIdx, idx - 1);
    }
  }
};

export const findCount = (
  sumsKey,
  sortedArray,
  startIdx = 0,
  endIdx = sortedArray.length / 3 - 1,
) => {
  return __findCount(sumsKey, sortedArray, startIdx, endIdx);
};

export const getIndex = (pathSegment, tags) => {
  if (nodeIsRoot(tags) && !tags[1]) return null;

  let { type, name, index, shiftIndex } = pathSegment;
  let firstPropsIndex = __getPropertyTagsIndex(tags, type, name, 0);
  let prop = firstPropsIndex == null ? null : getAt(firstPropsIndex, tags);
  let ref = prop ? parseTag(prop[0]).value : null;
  let counts = countRefs(tags);

  if (ref?.flags.array) {
    let sumsKey = printReferenceSumsKey(ref);
    if (index < 0) {
      index = findCount(sumsKey, counts) + index;
    } else if (index == null) {
      index = findCount(sumsKey, counts) - 1;

      if (index < 0) return null;
    }
  }

  let parentIndex = __getPropertyTagsIndex(tags, type, name, index ?? 0);

  if (parentIndex != null && ref?.flags.expression) {
    let shiftIndex_ = shiftIndex == null ? -1 : shiftIndex;
    if (shiftIndex_ < 0) {
      let shifts = 0;
      // TODO speed this up for deeply nested shifts
      // algorithm: make big jump forward, then look at shift index to see if we overshot completely
      // works because we know the size of the thing and a bigger thing doesn't fit in a smaller one
      throw new Error('wat');
      while (getAt(parentIndex + shifts, getValues(tags)[3])?.value.shift) {
        shifts++;
      }

      if (-shiftIndex_ > shifts + 1) return null;

      return parentIndex + shifts + shiftIndex_ + 1;
    } else {
      if (parentIndex + shiftIndex_ >= getSize(tags)) {
        return null;
      }

      return parentIndex + shiftIndex_;
    }
  }

  return parentIndex;
};

const __getPropertyTagsIndex = (tags, type, name, index) => {
  let nameCount = 0;
  let node = tags;
  let idx = -1;

  // drill into subtrees, passing over subtrees with too few references of the desired name
  outer: while (node) {
    let counts = countRefs(node);

    if (!counts) return null;

    let ref = buildReferenceTag(type, name).value;
    let valueNameCount = findCount(printReferenceSumsKey(ref), counts);

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of arrayValues(node)) {
      if (!isNode(value) || parseTagType(value) === Property) {
        idx++;
        let tag = parseTag(value);
        if (isObject(tag) && tag.type === Property) {
          let tags = tag.value;
          if (parseTagType(tags[0]) === ReferenceTag) {
            let reference = parseTag(tags[0]).value;
            if (
              (name != null && reference.name === name) ||
              (type != null && reference.type === type)
            ) {
              nameCount += 1;
              if (nameCount > index) {
                return idx;
              }
            }
          }
        }
      } else {
        let counts = countRefs(value);
        let sumsKey = printReferenceSumsKey(ref);
        if (nameCount + findCount(sumsKey, counts) > index) {
          node = value;
          continue outer;
        } else {
          nameCount += findCount(sumsKey, counts) ?? 0;
          idx += getSize(value);
        }
      }
    }

    return null;
  }

  return null;
};

export const nodeIsRoot = (node) => {
  return startsNode(node[0]) && parseTag(node[0]).value.type !== Symbol.for('__');
};

export const sumsKeyIsPlural = (sumsKey) => {
  let str = sumsKey;
  return str[0] === '#' || str[0] === '.' || (str[0] === '_' && str[1] === '_');
};

export const countRefs = (values) => {
  let { flags } = parseTag(values[0]).value;
  let refsSums = new Map();
  for (let val of arrayValues(values)) {
    if (isArray(val) && parseTagType(val) !== Property) {
      let valRefs = val[2];
      debugger;

      for (let i = 0; i < valRefs.length; i++) {
        let sumsKey = valRefs[i];
        let flags = valRefs[++i];
        let value = valRefs[++i];

        let isArray = flags.includes('[') || sumsKeyIsPlural(sumsKey);

        let record = refsSums.get(sumsKey);
        let count = record?.[2] ?? 0;
        let recordIsArray = !!record && (record[1].includes('[') || sumsKeyIsPlural(record[0]));

        if (!isArray && count > 0) {
          throw new Error('doubled reference: ' + sumsKey);
        } else if (count > 0 && recordIsArray !== isArray) {
          throw new Error();
        }

        refsSums.set(sumsKey, [sumsKey, flags, count + value]);
      }
    } else {
      let tag = parseTag(val);

      if (tag.type === Property) {
        let tags = tag.value;
        if (tags[0] && !isString(tags[0])) throw new Error();

        let ref = parseTag(tags[0]).value;
        let sumsKey = printReferenceSumsKey(ref);
        refsSums.set(sumsKey, [
          sumsKey,
          printReferenceFlags(ref.flags),
          (refsSums.get(ref)?.[2] ?? 0) + 1,
        ]);
      }
    }
  }

  let sortedEntries = [...refsSums.values()].sort((a, b) => compareNames(a[0], b[0]));

  return flags === '{'
    ? sortedEntries.length
      ? freezeRecord([sortedEntries[0][0], sortedEntries[sortedEntries.length - 1][0]])
      : ''
    : freezeRecord(sortedEntries.flatMap((_) => _));
};

export const countGaps = (values) => {
  let count = 0;
  for (let child of arrayValues(values)) {
    if (child.type === Property && child.value.hash && child.value.sums) {
      count += child.value.sums[2];
    } else if (child.type === Property && child.value.node) {
      if (child.value.hash && child.value.sums) {
        child.value.sums[2];
      } else {
        switch (child.value.node.type) {
          case GapNode:
            ++count;
            break;
          case TreeNode:
            count += child.value.sums[2];
            break;
        }
      }
    }
  }
  return count;
};

export const countLineBreaks = (values) => {
  let count = 0;
  for (let child of arrayValues(values)) {
    if (isArray(child)) {
      count += buildLineBreaksCount(child);
    } else {
      let tag = isString(child) ? parseTag(child) : child;
      if (
        tag.type === LiteralTag ||
        tag.type === EscapeTag ||
        (tag.type === OpenNodeTag && tag.value.literalValue)
      ) {
        let textTag = tag.type === OpenNodeTag ? tag.value.literalValue : tag;
        let text = textTag.type === LiteralTag ? textTag.value.value : textTag.value.value;
        let idx = -1;
        while ((idx = text.indexOf('\n', idx + 1)) >= 0) {
          count++;
        }
      }
      if (tag.type === Property && tag.value.node?.type === TreeNode) {
        count += buildLineBreaksCount(tag.value.node.value.tags);
      } else if (tag.type === Property && tag.value.hash && tag.value.sums) {
        count += tag.value.sums[4];
      }
    }
  }
  return count;
};

export const buildLineBreaksCount = (node) => {
  if (node[2]) {
    return node[2][4];
  } else {
    return countLineBreaks(node[1]);
  }
};

export const countMarkupChars = (values) => {
  let count = 0;
  for (let child of arrayValues(values)) {
    if (isArray(child)) {
      count += buildMarkupChrsCount(child);
    } else {
      let tag = child;
      if (isString(tag)) {
        count += tag.length;
      } else if (tag.type === Property) {
        for (let propTag of traverse(tag.value.tags)) {
          if (isString(propTag)) {
            count += propTag.length;
          } else {
            if (propTag.value.hash && propTag.value.sums) {
              count += propTag.value.sums[3];
            } else if (propTag.type === TreeNode) {
              count += buildMarkupChrsCount(propTag.value.tags);
            }
          }
        }
      }
    }
  }
  return count;
};

export const buildMarkupChrsCount = (node) => {
  return countMarkupChars(node[1]);
};

export const countChrs = (values) => {
  let count = 0;
  for (let child of arrayValues(values)) {
    if (isArray(child)) {
      count += buildChrsCount(child);
    } else {
      let tag = isString(child) ? parseTag(child) : child;
      if (
        tag.type === LiteralTag ||
        tag.type === EscapeTag ||
        (tag.type === OpenNodeTag && tag.value.literalValue)
      ) {
        let textTag = tag.type === OpenNodeTag ? tag.value.literalValue : tag;
        let text = textTag.type === LiteralTag ? textTag.value : textTag.value.value;

        count += text.length;
      }
      if (tag.type === Property && tag.value.node?.type === TreeNode) {
        count += buildChrsCount(tag.value.node.value.tags);
      } else if (tag.type === Property && tag.value.hash && tag.value.sums) {
        count += tag.value.sums[5];
      }
    }
  }
  return count;
};

export const buildChrsCount = (node) => {
  return countChrs(node[1]);
};

export const sumNode = (node) => {
  assertValidNode(node);

  let sigilTag = parseTag(node[0]);

  let refCounts = 0;

  if (!node.length || (sigilTag.type === OpenNodeTag && sigilTag.value.type === Symbol.for('__'))) {
    refCounts = countRefs(node);
  }

  return freezeRecord([
    refCounts,
    gearHash(node),
    countGaps(node),
    countMarkupChars(node),
    countLineBreaks(node),
    countChrs(node),
  ]);
};

export const fromValues = (...args) => {
  // TODO validate here
  return treeFromValues(...args);
};

export const getAt = (idx, tree) => {
  let path = findPath(idx, tree, freezeRecord({ existing: true }));
  let seg = path && path[path.length - 1];
  return seg && seg.node[seg.index];
};

export const getChildrenAt = (idx, tree) => {
  let idx_ = idx < 0 ? idx + getChildrenSize(tree) : idx;
  if (idx_ < 0 || idx_ === getSize(tree)) return null;

  return getAt(idx_ + 1, tree);
};

export const getSigilTag = (tags) => {
  let candidate = tags[0];

  return startsNode(candidate) ? parseTag(candidate) : null;
};

export function* traverseInner(tree) {
  for (let tag of traverse(tree)) {
    if (isObject(tag) && tag.type === Property) {
      yield* traverse(tag.value.tags);
    } else {
      yield tag;
    }
  }
}

function* codePoints(str) {
  for (let chr of str) {
    yield chr.codePointAt(0);
  }
}

function* encodeUTF8(points) {
  let leadSurrogate = null;

  for (let point of points) {
    if (point >= 0xd800 && point <= 0xdbff) {
      leadSurrogate = point;
      continue;
    }

    if (leadSurrogate !== null) {
      if (point >= 0xdc00 && point <= 0xdfff) {
        point = (leadSurrogate - 0xd800) * 0x400 + point - 0xdc00 + 0x10000;
      } else {
        yield leadSurrogate;
      }
      leadSurrogate = null;
    }

    if (point < 0x80) {
      yield point;
    } else if (point < 0x800) {
      yield (point >> 6) | 192;
      yield (point & 63) | 128;
    } else if (point < 0xd800 || (point >= 0xe000 && point < 0x10000)) {
      yield (point >> 12) | 224;
      yield ((point >> 6) & 63) | 128;
      yield (point & 63) | 128;
    } else if (point >= 0x10000 && point <= 0x10ffff) {
      yield (point >> 18) | 240;
      yield ((point >> 12) & 63) | 128;
      yield ((point >> 6) & 63) | 128;
      yield (point & 63) | 128;
    } else {
      // invalid
      yield 0xef;
      yield 0xbf;
      yield 0xbd;
    }
  }

  if (leadSurrogate) {
    yield leadSurrogate;
  }
}

const UTF8From = (str) => {
  return encodeUTF8(codePoints(str));
};

let GEARS32 = [
  0x2928ea69, 0x74656e3b, 0x81e8eeee, 0xc7d32c29, 0xc6eb0d30, 0x48a20a2f, 0xca2b9cea, 0x25e6413c,
  0x5108622e, 0x7e3653ae, 0xc3b9665f, 0xa07ec1aa, 0x628ff219, 0x47421152, 0x647650a9, 0xd217d3d2,
  0x4f0811ea, 0x2918eada, 0x59181089, 0xef786e26, 0x5e662f4f, 0x22a74b32, 0xa9d665b9, 0x3555ebde,
  0x063c13d8, 0x1b81735a, 0xb85bdac2, 0x1c03b392, 0x5a5959b2, 0x9912adca, 0xad12301d, 0x92aa131a,
  0x897f2f55, 0xe9406f61, 0x71c1bea1, 0x4e995c8b, 0x4eb04df7, 0x461c779e, 0x2797cb0c, 0xfd160333,
  0x1073a0ce, 0x196401a2, 0x9eb4dcce, 0x73e17eb4, 0x90972a08, 0xe5a4048c, 0xfe1e0b16, 0xc1f00849,
  0xf1484e28, 0xb24d09a7, 0xd7eb18c2, 0xc3e742a0, 0xba6bb453, 0x0370bde1, 0x66684a9e, 0x31634481,
  0xcac46c5c, 0xab93c5f1, 0x547612e5, 0xec8bb9bf, 0xa286f878, 0x295cd1c7, 0x56379d32, 0x6aa418c0,
  0xff609018, 0xdc209c74, 0x4d4b1c54, 0x34dda513, 0x686e05d0, 0x8e54d2a2, 0xf85ae6d4, 0xc5badff6,
  0xb05f0d42, 0xd2a6373f, 0x70aba1dc, 0x0ffe88f2, 0xc01d7a60, 0x61595c65, 0xdcedeef8, 0x6c5ae2da,
  0x9ac3ed8a, 0xfe24742d, 0x49d3720f, 0x3dd58f9c, 0x3b82ed4f, 0x2854a9ac, 0x69f3466d, 0x8b5a3351,
  0xb03b669a, 0xa867ee10, 0x9c6b4cff, 0xfa45a125, 0x162a6303, 0x7179bf89, 0x14874496, 0x21c0dd67,
  0x68c016e8, 0x3b834707, 0x6d00332d, 0xcdf326ab, 0x3177afb3, 0x94984ef7, 0xdbb155cc, 0xfacbc5fe,
  0xc689b1e0, 0xe17a375f, 0x8706981c, 0xc3962143, 0x35a67f61, 0xbce2db97, 0x1c7bad57, 0x7c84efb2,
  0x1c8ae39d, 0x57d64f83, 0xd27d5166, 0x76a1e77e, 0x9963d012, 0x2501c5e6, 0x67cbff21, 0x1ee5c6c7,
  0x1fffc7af, 0xfcfdf92a, 0x860671e9, 0xa4307e49, 0x1448ab69, 0xbff2834b, 0x45922b4e, 0x853d8226,
  0xf5473b95, 0xa8ec816d, 0x8f99d3cf, 0x23efc63c, 0x0dc9653b, 0xccd61e37, 0x1912761a, 0x7aed67b0,
  0x4c7009ce, 0xf8dde262, 0x47b73936, 0x2e93e356, 0x44fb0c20, 0x9914965a, 0x0c384042, 0xeb5275ad,
  0xf924bc31, 0xf0ed608f, 0x5ff6455d, 0xf4df3085, 0x7c6e6c83, 0x4f03e456, 0x752cff40, 0x6057aa11,
  0x6949105d, 0xfd15fa76, 0x367ab52a, 0xdc1973bb, 0xd2382cec, 0x833dadc3, 0xb84b2c55, 0x36aebf27,
  0xffd7467b, 0x632cb80b, 0x844c7fc0, 0x47eabcf2, 0xa7d7f5bf, 0xdf708cd9, 0x52c1a24a, 0x904b6523,
  0x193577f8, 0x429adfc2, 0x94fe5343, 0x4100a151, 0x9d2d52ef, 0x6efb8e08, 0xf858fd98, 0x49bc94bd,
  0xf1837fe0, 0xd0242a70, 0xd6aa7bdc, 0xb4f16fdc, 0x9bc28a38, 0xce2b9707, 0xfd0335e1, 0x422518f3,
  0x6373b766, 0xbc3a81d2, 0xae9a7f44, 0xfc5250cc, 0x81a27c05, 0x5665cc0e, 0xc1f0f220, 0x7674bfc9,
  0x423d56a8, 0x7bc4df5b, 0x8ce196c1, 0xe454546c, 0xe8e2c088, 0xc847c2b1, 0xd3e2ab97, 0xd04a7cf8,
  0xb7d9a0b4, 0x6073edfd, 0x53b5a561, 0x5828c2f0, 0x48074a2a, 0xebac5432, 0xe37df053, 0xcd07de79,
  0xff028e3a, 0xc2d1eecc, 0xef34f9d6, 0x70f465cf, 0x6af15021, 0xdc4cbbcd, 0x04cbf6b6, 0xc26b00d7,
  0xadc74144, 0x42dc2adf, 0x0e1b7751, 0x33b3f165, 0x8630efa3, 0x46b479a1, 0xf3f067a7, 0xfe3cad74,
  0xc8d8adc6, 0x0ae7ec07, 0x34380eed, 0x123373e0, 0x5c42e37a, 0x7d05a582, 0x86543a8c, 0x3b8d2380,
  0x895f9401, 0x07416351, 0xa7f90688, 0x688a2e66, 0x39e12c34, 0x8ee18c5b, 0xc146d556, 0xefb993ec,
  0xbe5c0cac, 0x50347757, 0x9d4c467d, 0x992ffe19, 0x20173621, 0x11e4f9cd, 0xcd22ea06, 0x195671ab,
  0x9f2450c8, 0x9deee2ba, 0xf3057224, 0x04ccacdb, 0x0790e3d8, 0x160ffc7e, 0x1971a098, 0x9a897d39,
];

export const stepGearHash16 = (byte, hash = 0) => {
  return ((hash << 2) + GEARS32[byte]) & 0xffff;
};

export const stepGearHash32 = (byte, hash = 0) => {
  return ((hash << 1) + GEARS32[byte]) & 0xffffffff;
};

export const gearHash16 = (bytes) => {
  let hash = 0;
  for (let byte of bytes) {
    hash = stepGearHash16(byte, hash);
  }
  return hash;
};

export const gearHash32 = (bytes) => {
  let hash = 0;
  for (let byte of bytes) {
    hash = stepGearHash32(byte, hash);
  }
  return hash;
};

function* bytes16(hashes) {
  for (let hash of hashes) {
    yield (hash & 0xff00) >> 8;
    yield hash & 0xff;
  }
}

export const gearHashBytes = (bytes) => {
  let hashes = [];
  let hash = 0;
  let count = 0;
  for (let byte of bytes) {
    hash = stepGearHash16(byte, hash);

    if (count === 8) {
      if (hashes.length === 8) {
        hash = gearHash16(bytes16(hashes));
        hashes = [hash];
      }
      hashes.push(hash);
      count = 0;
    } else {
      count++;
    }
  }

  hashes.push(hash);

  return gearHash16(bytes16(hashes));
};

export const stepGearHashValue = (value, hash = 0) => {
  if (value === null) throw new Error();
  let valueHash = gearHashBytes(UTF8From(printValue(value)));
  return ((hash << 2) + GEARS32[valueHash >> 8]) & 0xffff;
};

export const gearHash = (values) => {
  return gearHashBytes(
    UTF8From([...arrayValues(values)].map((value) => printValue(value)).join('')),
  );
};

const printHash = (hash) => {
  if (!Number.isFinite(hash)) throw new Error();
  return hash.toString(16).padStart(4, '0');
};

const printValue = (value) => {
  if (isArray(value)) {
    return `__:##${printHash(gearHash(value))}##<//>`;
  } else if (isObject(value)) {
    let property = value;
    let printed = '';
    for (let tag of traverse(property.value)) {
      switch (parseTagType(tag)) {
        case NullNode:
        case GapNode:
          printed += '<//>';
          break;
        case TreeNode:
          printed += `##${printHash(gearHash(tag.value.children))}##<//>`;
          break;
        case HashTag: // yes? no?
          break;
        default:
          printed += printTag(parseTag(tag), porcelain);
          break;
      }
    }
    return printed;
  } else if (isString(value)) {
    return value;
  } else {
    throw new Error();
  }
};
