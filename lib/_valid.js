import { PropertyWeakMap } from 'property-weak-map';
import {
  AttributeDefinitionTag,
  BinaryLiteralTag,
  BindingTag,
  CloseTag,
  DoctypeTag,
  Document,
  EmptyTag,
  GapNode,
  GapTag,
  HashTag,
  LiteralTag,
  MuxTag,
  NullNode,
  NullTag,
  OpenTag,
  Property,
  ReferenceTag,
  ShiftTag,
  SumsTag,
  TreeNode,
} from './symbols.js';
import { isArray } from './object.js';
import { parseTag } from './tags.js';

export const _validDoctypes = new PropertyWeakMap();
export const _validOpenNodes = new PropertyWeakMap();
export const _validCloseNodes = new PropertyWeakMap();
export const _validReferences = new PropertyWeakMap();
export const _validShifts = new PropertyWeakMap();
export const _validGaps = new PropertyWeakMap();
export const _validHashes = new PropertyWeakMap();
export const _validSums = new PropertyWeakMap();
export const _validBindings = new PropertyWeakMap();
export const _validMuxes = new PropertyWeakMap();
export const _validNulls = new PropertyWeakMap();
export const _validAttributeDefinitions = new PropertyWeakMap();
export const _validLiterals = new PropertyWeakMap();
export const _validBinaryLiterals = new PropertyWeakMap();
export const _validEmpties = new PropertyWeakMap();

export const _validDocuments = new PropertyWeakMap();

export const _validNodes = new PropertyWeakMap();

export const isValidTag = (tag) => {
  switch (tag.type) {
    case DoctypeTag:
      return _validDoctypes.has(tag.value);
    case OpenTag:
      return _validOpenNodes.has(tag.value);
    case CloseTag:
      return _validCloseNodes.has(tag.value);
    case ReferenceTag:
      return _validReferences.has(tag.value);
    case ShiftTag:
      return _validShifts.has(tag.value);
    case GapTag:
      return _validGaps.has(tag.value);
    case HashTag:
      return _validHashes.has(tag.value);
    case SumsTag:
      return _validSums.has(tag.value);
    case BindingTag:
      return _validBindings.has(tag.value);
    case MuxTag:
      return _validMuxes.has(tag.value);
    case NullTag:
      return _validNulls.has(tag.value);
    case AttributeDefinitionTag:
      return _validAttributeDefinitions.has(tag.value);
    case LiteralTag:
      return _validLiterals.has(tag.value);
    case BinaryLiteralTag:
      return _validBinaryLiterals.has(tag.value);
    case EmptyTag:
      return _validEmpties.has(tag.value);

    case Document:
      return _validDocuments.has(tag.value);
    case TreeNode:
    case NullNode:
    case GapNode:
    case Property:
      return _validNodes.has(tag.value);
  }
};

export const isValidNode = (node) => {
  if (!node || !isArray(node)) return false;

  switch (parseTag(node[0]).type) {
    case NullTag:
    case OpenTag:
    case GapTag:
      return _validNodes.has(node);
    default:
      throw new Error();
  }
};

export const isValidProperty = (node) => {
  if (!node || !isArray(node)) return false;

  switch (parseTag(node[0]).type) {
    case ReferenceTag:
    case ShiftTag:
    case EmptyTag:
      return _validNodes.has(node);
    default:
      return false;
  }
};
