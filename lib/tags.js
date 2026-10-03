/* global btoa */

import {
  _validNodes,
  _validEmpties,
  _validDocuments,
  _validReferences,
  _validBindings,
  _validMuxes,
  _validGaps,
  _validShifts,
  _validBinaryLiterals,
  _validLiterals,
  _validEscapes,
  _validDoctypes,
  _validNulls,
  _validHashes,
  _validSums,
  _validOpenNodes,
  isValidNode,
  isValidTag,
} from './_valid.js';
import {
  hasOwn,
  isArray,
  isSymbol,
  isString,
  freezeRecord,
  isObject,
  isDeepRecord,
  arrayValues,
  arrayJoin,
  arrayMap,
  isFrozen,
} from './object.js';

import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  LiteralTag,
  AttributeDefinitionTag,
  BindingTag,
  Document,
  Property,
  NullNode,
  GapNode,
  TreeNode,
  MuxTag,
  HashTag,
  BinaryLiteralTag,
  EscapeTag,
  SumsTag,
  EmptyTag,
  BindingsNode,
} from './symbols.js';

export { isValidTag };

let { isInteger, isFinite } = Number;
let { freeze, entries } = Object;
let isNumber = (val) => typeof val === 'number';

let compareNames = (a, b) => (a > b ? 1 : b > a ? -1 : 0);

export const printArray = (arr, options = {}) => {
  let pclSp = options.porcelain ? '' : ' ';
  return `[${[...arrayValues(arr)].map((v) => printExpression(v)).join(`,${pclSp}`)}]`;
};

export const printObject = (obj, options = {}) => {
  let pclSp = options.porcelain ? '' : ' ';
  let entries_ = entries(obj);
  return entries_.length
    ? `{${pclSp}${entries_
        .sort(({ 0: k0 }, { 0: k1 }) => compareNames(k0, k1))
        .map(({ 0: k, 1: v }) => `${k}:${pclSp}${printExpression(v)}`)
        .join(`,${pclSp}`)}${pclSp}}`
    : '{}';
};

export const printExpression = (expr, options = {}) => {
  if (isString(expr)) {
    return printString(expr, options);
  } else if (typeof expr === 'symbol') {
    return printString(expr.description, options);
  } else if (expr == null || typeof expr === 'boolean') {
    return String(expr);
  } else if (isNumber(expr)) {
    if (!isFinite(expr)) {
      if (isNaN(expr)) return 'NaN';
      return expr === -Infinity ? '-Infinity' : '+Infinity';
    } else if (isInteger(expr)) {
      return String(expr);
    } else {
      throw new Error();
    }
  } else if (isArray(expr)) {
    return printArray(expr, options);
  } else if (isObject(expr)) {
    return printObject(expr, options);
  } else {
    throw new Error();
  }
};

export const printAttributes = (attributes, options = {}) => {
  if (!isObject(attributes)) throw new Error();
  const printed = attributes && printObject(attributes, options);
  return !printed || printed === '{}' ? '' : printed;
};

export const printIdentifierPath = (path, options = {}) => {
  return [...arrayValues(path)]
    .map((segment) => {
      let { name, type } = segment;
      if (name) {
        return printIdentifier(name);
      }
      if (type) {
        if (type !== '..') throw new Error();
        return type;
      } else {
        throw new Error();
      }
    })
    .join('.');
};

let escapeReplacer = (esc) => {
  if (esc === '\r') {
    return '\\r';
  } else if (esc === '\n') {
    return '\\n';
  } else if (esc === '\t') {
    return '\\t';
  } else if (esc === '\0') {
    return '\\0';
  } else if (esc < ' ') {
    return `\\u${esc.charCodeAt(0).toString(16).padStart(4, '0')}`;
  } else {
    return `\\${esc}`;
  }
};

export const printIdentifier = (id, options = {}) => {
  return /^[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z\u{80}-\u{10ffff}0-9_-]*$/u.test(id)
    ? id
    : printQuotedIdentifier(id);
};

export const printQuotedIdentifier = (id, options = {}) => {
  return `\`${id
    .replace(/[`\\]/g, '\\`')
    .replace(/[\x00-\x20\x7f]/g, (value) => `\\u00${value.toString(16).padStart(2, '0')}`)}\``;
};

export const printSingleString = (str, options = {}) => {
  return `'${str.replace(/['\\\0\r\n\t\u0000-\u001A]/g, escapeReplacer)}'`;
};

export const printDoubleString = (str, options = {}) => {
  return `"${str.replace(/["\\\0\r\n\t\u0000-\u001A]/g, escapeReplacer)}"`;
};

export const printString = (str, options = {}) => {
  return str === "'" ? printDoubleString(str) : printSingleString(str);
};

export const printGapTag = (tag, options = {}) => {
  if (tag?.type !== GapTag) throw new Error();

  return `<//>`;
};

export const printShiftTag = (tag, options = {}) => {
  if (tag?.type !== ShiftTag) throw new Error();

  return `^^^`;
};

export const printHash = (hash, options = {}) => {
  let { value } = hash;
  if (!value) throw new Error();

  return `##${value}##`;
};

export const printHashTag = (tag, options = {}) => {
  if (tag?.type !== HashTag) throw new Error();
  return printHash(tag.value);
};

export const printSums = (sums, options = {}) => {
  if (isArray(sums[0]) && !isFrozen(sums[0])) throw new Error();
  if (!Number.isFinite(sums[1])) throw new Error();
  if (!Number.isFinite(sums[2])) throw new Error();
  if (!Number.isFinite(sums[3])) throw new Error();
  if (sums.length !== 6) throw new Error();

  return `#${printArray(sums, options)}#`;
};

export const printSumsTag = (tag, options = {}) => {
  return printSums(tag.value, options);
};

export const printReference = (ref, options = {}) => {
  let { type, name, flags } = ref;

  if (type && type !== '#' && name) throw new Error();
  if (type && !['_', '__', '.', '#'].includes(type)) throw new Error();

  return `${type || ''}${
    name
      ? name.length === 1 && name >= 'a' && name <= 'z'
        ? printQuotedIdentifier(name)
        : printIdentifier(name)
      : ''
  }${printReferenceFlags(flags)}:`;
};

export const printReferenceTag = (tag) => {
  return printReference(tag.value);
};

export const printReferenceSumsKey = (ref) => {
  return (ref.type ? ref.type : '') + (ref.name ? printQuotedIdentifier(ref.name) : '');
};

export const printBinding = (binding, options = {}) => {
  let { type, name } = binding;
  if (type) {
    if (type !== '..') throw new Error();
    return `:${type}:`;
  } else if (name) {
    return `:${printIdentifier(name.description)}:`;
  } else {
    throw new Error();
  }
};

export const printBindingTag = (tag, options = {}) => {
  return printBinding(tag.value);
};

export const printBase64 = (arrayBuffer) => {
  return `b${btoa(arrayBuffer)}`;
};

export const printBinaryLiteralTag = (tag, options = {}) => {
  if (tag?.type !== BinaryLiteralTag) throw new Error();

  return printBase64(tag.value);
};

export const printEscape = (escape, options = {}) => {
  let pclSp = options.porcelain ? '' : ' ';
  let { value, cookedValue } = escape;
  let cookedPart = cookedValue ? `@${printString(cookedValue)}${pclSp}` : '';
  return `${cookedPart}@@${printString(value)}`;
};

export const printEscapeTag = (tag, options = {}) => {
  if (tag?.type !== EscapeTag) throw new Error();

  return printEscape(tag.value, options);
};

export const printEmptyTag = (tag) => {
  if (tag.type !== EmptyTag) throw new Error();

  return '';
};

export const printNullTag = (tag, options = {}) => {
  if (tag && tag.type !== NullTag && tag !== 'null ') throw new Error();

  return 'null ';
};

export const printName = (type, options = {}) => {
  return typeof type === 'string'
    ? type
    : typeof type === 'symbol'
    ? printIdentifier(type.description)
    : String(type);
};

export const printType = (type, options = {}) => {
  return type == null ? '' : typeof type === 'symbol' ? type.description : String(type);
};

export const printDoctypeTag = (tag, options = {}) => {
  if (tag?.type !== DoctypeTag) throw new Error();

  let { doctype, version, attributes } = tag.value;

  attributes =
    attributes && Object.values(attributes).length ? ` ${printAttributes(attributes)}` : '';

  return `<!${version}:${doctype}${attributes}>`;
};

export const printLiteralTag = (tag, options = {}) => {
  if (tag?.type !== LiteralTag) throw new Error();

  return printString(tag.value.value);
};

let defaultFlags = freezeRecord({
  array: false,
  expression: false,
  intrinsic: false,
  hasGap: false,
});

export const printReferenceFlags = (flags = defaultFlags, options = {}) => {
  let array = flags.array ? `[]` : '';
  let plus = flags.expression ? '+' : '';
  let star = flags.intrinsic ? '*' : '';
  let dollar = flags.hasGap ? '$' : '';

  return `${array}${plus}${star}${dollar}`;
};

export const printNodeFlags = (flags, options = {}) => {
  let star = flags.token ? '*' : '';
  let curlyBrace = flags.object ? '{' : '';
  let brace = flags.array ? '[' : '';

  if (curlyBrace && brace) throw new Error();
  if (star && (curlyBrace || brace)) throw new Error();

  return `${star}${curlyBrace}${brace}`;
};

export const printNodeType = (type, options = {}) => {
  if (![Symbol.for('_'), Symbol.for('__')].includes(type)) throw new Error();

  return type.description;
};

export const printOpenNodeTag = (tag, options = {}) => {
  let { porcelain } = options;
  let porcelainOptions = porcelain ? { porcelain } : {};
  let pclSp = porcelain ? '' : ' ';
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, type, name, literalValue, attributes, selfClosing } = tag.value;

  if (isString(literalValue)) throw new Error();
  if ((flags.token || type === Symbol.for('_')) && (flags.object || flags.array)) throw new Error();

  if (literalValue && !selfClosing) throw new Error();
  let selfClosingFrag = selfClosing ? `${pclSp}/` : '';
  let literalFrag = literalValue ? `${pclSp}${printTag(literalValue)}` : '';
  let flagsFrag = printNodeFlags(flags);
  let printedAttributes = printAttributes(attributes, porcelainOptions);
  let attributesFrag = printedAttributes ? `${pclSp}${printedAttributes}` : '';
  let typeFrag = type ? printNodeType(type) : '';
  let nameFrag = name ? printType(name) : '';
  let flagsCloseFrag = flags.object ? '}' : flags.array ? ']' : '';

  return `<${flagsFrag}${typeFrag}${nameFrag}${flagsCloseFrag}${literalFrag}${attributesFrag}${selfClosingFrag}>`;
};

export const printSelfClosingNodeTag = (tag, options = {}) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, type, name, attributes, literalValue } = tag.value;

  let pclSp = options.porcelain ? '' : ' ';
  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? `${pclSp}${printedAttributes}` : '';
  let literalFrag = literalValue ? `${pclSp}${printString(literalValue)}` : '';
  let typeFrag = type ? printNodeType(type) : '';
  let nameFrag = name ? printType(name) : '';

  return `<${printNodeFlags(flags)}${typeFrag}${nameFrag}${literalFrag}${attributesFrag}${pclSp}/>`;
};

export const printMuxTag = (tag, options = {}) => {
  if (tag?.type !== MuxTag) throw new Error();

  let { processPath, stream } = tag.value;

  return `<${arrayJoin(processPath, '.')}-${stream}>`;
};

export const printCloseNodeTag = (tag, options = {}) => {
  if (tag?.type !== CloseNodeTag) throw new Error();

  return `</>`;
};

export const printAttributeDefinitionTag = (tag, options = {}) => {
  if (tag?.type !== AttributeDefinitionTag) throw new Error();
  if (!tag.value.path?.length) throw new Error();
  let pclSp = options.porcelain ? '' : ' ';
  let { path, value } = tag.value;

  return `{${pclSp}${printIdentifierPath(
    arrayMap(path, (name) => freeze({ type: null, name })),
  )}:${pclSp}${printExpression(value, options)}${pclSp}}`;
};

const printers = {
  [EmptyTag]: printEmptyTag,
  [NullTag]: printNullTag,
  [GapTag]: printGapTag,
  [BindingTag]: printBindingTag,
  [ShiftTag]: printShiftTag,
  [LiteralTag]: printLiteralTag,
  [BinaryLiteralTag]: printBinaryLiteralTag,
  [EscapeTag]: printEscapeTag,
  [DoctypeTag]: printDoctypeTag,
  [ReferenceTag]: printReferenceTag,
  [OpenNodeTag]: printOpenNodeTag,
  [CloseNodeTag]: printCloseNodeTag,
  [HashTag]: printHashTag,
  [SumsTag]: printSumsTag,
  [MuxTag]: printMuxTag,
  [AttributeDefinitionTag]: printAttributeDefinitionTag,
};

export const printTag = (tag, options = {}) => {
  if (tag == null) return tag;
  if (!isObject(tag)) throw new Error();

  return printers[tag.type](tag, options);
};

let buildParser = (str) => {
  return isObject(str) ? str : { idx: 0, str };
};

let inRange = (value, lower, upper) => value >= lower && value <= upper;

let match = (p, literal) => {
  let idx = 0;
  let endIdx = literal.length;
  let { idx: pIdx, str } = p;

  while (idx < endIdx) {
    if (str[pIdx + idx] !== literal[idx]) return null;
    idx++;
  }
  return literal;
};

let canStartIdentifier = (chr) => {
  let code = chr.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90) ||
    code === 96 ||
    (code >= 0x80 && code <= 0x10ffff)
  );
};

let canContinueIdentifier = (chr) => {
  if (canStartIdentifier(chr)) return true;
  let code = chr.charCodeAt(0);

  return code === 45 || code === 95 || (code >= 48 && code <= 57);
};

export const parseTagType = (input) => {
  if (isArray(input)) return parseTag(input).type;
  if (input == null) return null;
  if (input === '') return EmptyTag;
  if (isObject(input) && input.type) return input.type;
  let p = buildTagParser(input);
  let { str, idx } = p;
  if (!isString(str)) throw new Error();
  if (!str.length) throw new Error();

  if (str[idx] >= 'a' && str[idx] <= 'z' && `"'`.includes(str[idx + 1])) {
    let tag = str[idx];
    if (tag !== 'b') throw new Error();
    return BinaryLiteralTag;
  }

  switch (str[idx]) {
    case 'n':
      return str[idx + 1] === 'u' &&
        str[idx + 2] === 'l' &&
        str[idx + 3] === 'l' &&
        (' \r\n'.includes(str[idx + 4]) || idx + 4 === str.length)
        ? NullTag
        : ReferenceTag;
    case '<':
      return str[idx + 1] === '!'
        ? DoctypeTag
        : str[idx + 1] === '/'
        ? str[idx + 2] === '/'
          ? GapTag
          : CloseNodeTag
        : inRange(str[idx + 1], '0', '9')
        ? MuxTag
        : OpenNodeTag;
    case '^':
      if (str[idx + 1] === '^' && str[idx + 2] === '^') {
        return ShiftTag;
      } else {
        throw new Error();
      }
    case ':':
      return BindingTag;
    case '#':
      return str[idx + 1] === '#' ? HashTag : str[idx + 1] === '[' ? SumsTag : ReferenceTag;
    case '@':
      return EscapeTag;
    case '.':
    case '_':
      return ReferenceTag;
    case '"':
    case "'":
      return LiteralTag;
    case '{':
      return AttributeDefinitionTag;
    default:
      if (canStartIdentifier(str[idx]) || '.#_'.includes(str[idx])) {
        return ReferenceTag;
      } else {
        throw new Error();
      }
  }
};

// this should be an option to parseTagType
export const parseStreamTagType = (input) => {
  if (isObject(input) && input.type) return input.type;
  let p = buildTagParser(input);
  let { str, idx } = p;
  if (str == null) return null;
  if (!isString(str)) throw new Error();
  if (!str.length) throw new Error();

  if (str[idx] === '<') {
    if (str[idx + 1] === '-') {
      if (str[idx + 2] === '-') {
        return parseTagType(input);
      } else {
        return MuxTag;
      }
      throw new Error('reserved syntax');
    } else {
      return parseTagType(input);
    }
  } else {
    return parseTagType(input);
  }
};

export const parseObject = (input) => {
  let p = buildParser(input);
  let { str } = p;
  if (!str.length) throw new Error();
  let obj = {};
  let chr = str[p.idx];

  if (chr !== '{') throw new Error();
  chr = str[++p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let sep = true;
  let lastKey = null;
  while (sep && chr !== '}') {
    let key = `'"`.includes(chr) ? parseString(p) : parseIdentifier(p);
    chr = str[p.idx];

    if (chr !== ':') throw new Error();
    chr = str[++p.idx];

    while (chr === ' ') chr = str[++p.idx];

    let value = parseExpression(p);
    chr = str[p.idx];

    if (lastKey !== null && !(key >= lastKey)) throw new Error('object keys not alphabetized');

    obj[key] = value;

    while (chr === ' ') chr = str[++p.idx];

    sep = chr === ',' ? chr : null;
    if (sep) {
      chr = str[++p.idx];
    }

    while (chr === ' ') chr = str[++p.idx];

    lastKey = key;
  }

  if (chr !== '}') throw new Error();
  chr = str[++p.idx];

  return freezeRecord(obj);
};

export const parseArray = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let arr = [];
  let chr = str[p.idx];

  if (chr !== '[') throw new Error();
  chr = str[++p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let first = true;
  while (first || chr === ',') {
    if (!first && chr === ',') {
      chr = str[++p.idx];
      while (chr === ' ') {
        chr = str[++p.idx];
      }
    }

    if (chr === ']') break;

    let value = parseExpression(p);
    chr = str[p.idx];

    arr.push(value);

    while (chr === ' ') {
      chr = str[++p.idx];
    }
    first = false;
  }

  if (chr !== ']') throw new Error();
  chr = str[++p.idx];

  return freezeRecord(arr);
};

export const parseString = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let q = chr;
  let result = [];

  if (!`'"`.includes(q)) throw new Error();
  chr = str[++p.idx];

  while (chr && chr !== q) {
    if (chr === '\\') {
      result.push(parseEscape(p));
      chr = str[p.idx];
    } else if (chr === '\r' || chr === '\n') {
      throw new Error();
    } else {
      result.push(chr);
      chr = str[++p.idx];
    }
  }

  if (chr === q) {
    chr = str[++p.idx];
  } else {
    throw new Error();
  }

  return result.join('');
};

export const parseDigits = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let digits = [];

  while (chr >= '0' && chr <= '9') {
    digits.push(chr);
    chr = str[++p.idx];
  }

  return parseInt(digits.join(''), 10);
};

export const parseUnsignedInteger = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let digits = [];

  if (chr === '0') {
    chr = str[++p.idx];
    return 0;
  }

  while (chr >= '0' && chr <= '9') {
    digits.push(chr);
    chr = str[++p.idx];
  }

  return parseInt(digits.join(''), 10);
};

export const parseInteger = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let negative = false;

  if (chr === '-') {
    negative = true;
    chr = str[++p.idx];
  }

  return parseUnsignedInteger(p) * (negative ? -1 : 1);
};

export const parseNumber = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let startIdx = p.idx;

  if (chr === '-') {
    chr = str[++p.idx];
  }

  if (chr == '0') {
    chr = str[++p.idx];
  } else {
    parseDigits(p);
    chr = str[p.idx];
  }

  if (chr === '.') {
    chr = str[++p.idx];
    parseDigits(p);
    chr = str[p.idx];
  }

  if (chr === 'e' || chr === 'E') {
    chr = str[++p.idx];

    if (chr === '+' || chr === '-') {
      chr = str[++p.idx];
    }

    parseDigits(p);
  }

  let endIdx = p.idx;

  return parseFloat([...str.slice(startIdx, endIdx)].join(''));
};

export const parseEscape = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '\\') throw new Error();
  chr = str[++p.idx];

  switch (chr) {
    case 'u': {
      chr = str[++p.idx];

      let digits = [];
      let q = chr === '{' ? chr : null;
      if (q) {
        chr = str[++p.idx];
      }

      let i = 0;
      while (q ? chr !== '}' : i < 4) {
        if (
          !((chr >= '0' && chr <= '9') || (chr >= 'a' && chr <= 'z') || (chr >= 'A' && chr <= 'Z'))
        )
          throw new Error();

        digits.push(chr);
        chr = str[++p.idx];
        i++;
      }

      if (q) {
        if (chr !== '}') throw new Error();
        chr = str[++p.idx];
      }
      return String.fromCodePoint(parseInt(digits.join(''), 16));
    }
    case 'r':
      chr = str[++p.idx];
      return '\r';
    case 'n':
      chr = str[++p.idx];
      return '\n';
    case 't':
      chr = str[++p.idx];
      return '\t';
    case '\\':
    case '"':
    case "'":
    case '`':
      ++p.idx;
      return chr;
  }
};

export const parseExpression = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];

  switch (chr) {
    case '{':
      return parseObject(p);
    case '[':
      return parseArray(p);
    case '"':
    case "'":
      return parseString(p);
    case 'n':
      if (match(p, 'null')) {
        p.idx += 4;
        return null;
      } else {
        throw new Error();
      }
    case 't':
      if (match(p, 'true')) {
        p.idx += 4;
        return true;
      } else {
        throw new Error();
      }
    case 'f':
      if (match(p, 'false')) {
        p.idx += 5;
        return false;
      } else {
        throw new Error();
      }
    case 'u':
      if (match(p, 'undefined')) {
        p.idx += 9;
        return undefined;
      } else {
        throw new Error();
      }
    case 'N':
      if (match(p, 'NaN')) {
        p.idx += 3;
        return NaN;
      } else {
        throw new Error();
      }
    case 'I':
      if (match(p, 'Infinity')) {
        p.idx += 8;
        return Infinity;
      } else {
        throw new Error();
      }
    case '-':
      if (str[p.idx + 1] === 'I' && match(p, '-Infinity')) {
        p.idx += 9;
        return -Infinity;
      } else {
        return parseNumber(p);
      }
    case '+':
      if (str[p.idx + 1] === 'I' && match(p, '+Infinity')) {
        p.idx += 9;
        return Infinity;
      } else {
        throw new Error();
      }
    default:
      if (chr >= '0' && chr <= '9') {
        return parseNumber(p);
      } else {
        throw new Error();
      }
  }
};

export const parseIdentifier = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let value = [];

  let q = chr === '`' ? chr : null;
  if (q) {
    chr = str[++p.idx];
  }

  let lit, esc;
  do {
    lit = null;
    esc = null;
    if (chr === '\\') {
      esc = parseEscape(p);
      chr = str[p.idx];
    } else {
      if (!q) {
        if (!value.length) {
          if (canStartIdentifier(chr)) {
            lit = chr;
            value.push(chr);
            chr = str[++p.idx];
          } else {
            throw new Error();
          }
        }

        while (chr && canContinueIdentifier(chr)) {
          lit = chr;
          value.push(chr);
          chr = str[++p.idx];
        }
      } else {
        while (!'`\\\r\n'.includes(chr)) {
          lit = chr;
          value.push(chr);
          chr = str[++p.idx];
        }
      }
    }
  } while (lit || esc);

  if (q) {
    if (chr !== '`') throw new Error();
    chr = str[++p.idx];
  }
  return value.join('');
};

export const parseCommand = (command) => {
  let p = buildParser(command);
  let { str } = p;
  let chr = str[p.idx];

  let verb = parseIdentifier(p);

  chr = str[p.idx];

  if (chr !== '(') throw new Error();
  chr = str[++p.idx];

  let args = [];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let first = true;
  while (first || chr === ',') {
    if (!first && chr === ',') {
      chr = str[++p.idx];
      while (chr === ' ') {
        chr = str[++p.idx];
      }
    }

    if (chr === ')') break;

    let value = parseExpression(p);
    chr = str[p.idx];

    args.push(value);

    while (chr === ' ') {
      chr = str[++p.idx];
    }
    first = false;
  }

  if (chr !== ')') throw new Error();
  chr = str[++p.idx];

  return { verb, arguments: args };
};

let buildTagParser = (tag) => {
  switch (typeof tag) {
    case 'string':
      return { idx: 0, str: tag };
    case 'object':
      if (tag.type) {
        throw new Error();
      } else {
        return tag;
      }
  }
};

let flagsCache = new Map();

export const parseNodeFlags = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let token = false;
  let object = false;
  let array = false;

  let flagsStr = '';

  if (chr === '*') {
    flagsStr += chr;
    chr = str[++p.idx];
    token = true;
  }

  if (chr === '{') {
    flagsStr += chr;
    chr = str[++p.idx];
    object = true;
  }

  if (chr === '[') {
    flagsStr += chr;
    chr = str[++p.idx];
    array = true;
  }

  if (object && array) throw new Error();
  if (token && (object || array)) throw new Error();

  let cached = flagsCache.get(flagsStr);
  let flags = cached || freezeRecord({ token, object, array });
  if (!cached) flagsCache.set(flagsStr, flags);
  return flags;
};

export const parseOpenNodeTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '<') throw new Error();
  chr = str[++p.idx];

  let flags = parseNodeFlags(p);

  chr = str[p.idx];

  let type = null;
  let name = null;
  let depth = 1;

  if (chr === '_') {
    chr = str[++p.idx];
    type = Symbol.for('_');

    if (chr === '_') {
      chr = str[++p.idx];
      type = Symbol.for('__');
    }
  }

  if (type === Symbol.for('__')) {
    if (flags.token) throw new Error();

    let depth = 1;
    if (chr >= '0' && chr <= '9') {
      depth = parseUnsignedInteger(p);
      chr = str[p.idx];
    }
    name = depth;
  }

  if (!` \t}]{'"/>`.includes(chr)) {
    name = parseIdentifier(p);
    chr = str[p.idx];
  }

  if (flags.object) {
    if (chr !== '}') throw new Error();
    chr = str[++p.idx];
  } else if (flags.array) {
    if (chr !== ']') throw new Error();
    chr = str[++p.idx];
  }

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let literalValue = null;

  if (`'"@b`.includes(chr)) {
    literalValue = parseTag(p);
    chr = str[p.idx];

    while (chr === ' ') chr = str[++p.idx];
  }

  let attributes = freezeRecord({});

  if (chr === '{') {
    attributes = parseObject(p);
    chr = str[p.idx];

    while (chr === ' ') chr = str[++p.idx];
  }

  let selfClosing = false;

  if (chr === '/') {
    chr = str[++p.idx];
    selfClosing = true;
  }

  if (chr === '>') {
    chr = str[++p.idx];
  }

  if (isString(tag) && p.idx !== str.length) throw new Error();

  return buildOpenNodeTag(flags, type, name, literalValue, attributes, selfClosing);
};

export const parseReferenceFlags = (input) => {
  let p = buildTagParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let array = false;
  let expression = false;
  let intrinsic = false;
  let hasGap = false;

  if (chr === '[') {
    chr = str[++p.idx];
    array = true;
    if (chr !== ']') throw new Error();
    chr = str[++p.idx];
  }

  if (chr === '+') {
    chr = str[++p.idx];
    expression = true;
  }

  if (chr === '*') {
    chr = str[++p.idx];
    intrinsic = true;
  }

  if (chr === '$') {
    chr = str[++p.idx];
    hasGap = true;
  }

  return freezeRecord({ array, expression, intrinsic, hasGap });
};

export const parseReferenceTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];
  let type = null;
  let name = null;

  if ('.#_'.includes(chr)) {
    type = chr;
    chr = str[++p.idx];
  }

  if (type === '.' && chr === '.') {
    type = '..';
    chr = str[++p.idx];
  } else if (type === '_' && chr === '_') {
    type = '__';
    chr = str[++p.idx];
  }

  let quotedIdent = chr === '`';
  if (!type || (type === '#' && canStartIdentifier(chr))) {
    name = parseIdentifier(p);
    chr = str[p.idx];
    if (name.length === 1 && name >= 'a' && name <= 'z' && !quotedIdent) throw new Error();
  }
  if (!type && !quotedIdent && name === 'null') throw new Error();

  let flags = parseReferenceFlags(p);
  chr = str[p.idx];

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildReferenceTag(type, name, flags);
};

export const parseLiteralTag = (tag) => {
  let p = buildTagParser(tag);

  let str = parseString(p);

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildLiteralTag(str);
};

export const parseCloseNodeTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '</>')) throw new Error();
  p.idx += 3;

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildCloseNodeTag();
};

export const parseGapTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '<//>')) throw new Error();
  p.idx += 4;

  if (isString(tag) && p.idx !== p.str.length) throw new Error();
  return buildGapTag();
};

export const parseNullTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, 'null ')) throw new Error();
  p.idx += 5;

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildNullTag();
};

export const parseShiftTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '^^^')) throw new Error();
  p.idx += 3;
  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildShiftTag(1);
};

export const parseBinaryLiteralTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== 'b') throw new Error();
  chr = str[++p.idx];

  let value = parseString(p);
  chr = str[p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildBinaryLiteralTag(value);
};

export const parseEscapeTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '@') throw new Error();
  chr = str[++p.idx];

  let hasCooked = true;
  if (chr === '@') {
    chr = str[++p.idx];
    hasCooked = false;
  }

  let cookedValue = null;
  let value = null;

  if (hasCooked) {
    cookedValue = parseString(p);
    chr = str[p.idx];
  } else {
    value = parseString(p);
    chr = str[p.idx];
  }

  if (hasCooked) {
    while (chr === ' ') {
      chr = str[++p.idx];
    }

    if (chr !== '@') throw new Error();
    chr = str[++p.idx];
    if (chr !== '@') throw new Error();
    chr = str[++p.idx];

    value = parseString(p);
    chr = str[p.idx];
  }

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildEscapeTag(value, cookedValue);
};

export const parseBase64 = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];

  let content = '';

  while (
    inRange(chr, 'a', 'z') ||
    inRange(chr, 'A', 'Z') ||
    inRange(chr, '0', '9') ||
    '=+/'.includes(chr)
  ) {
    content += chr;
    chr = str[++p.idx];
  }

  return content;
};

export const parseHashTag = (tag) => {
  let p = buildTagParser(tag);

  if (!match(p, '##')) throw new Error();
  p.idx += 2;

  let hash = parseBase64(p);

  if (!match(p, '##')) throw new Error();
  p.idx += 2;

  return buildHashTag(hash);
};

export const parseSumsTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];
  let values = [];

  if (!match(p, '#[')) throw new Error();
  p.idx += 2;
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let first = true;
  while (first || chr === ',') {
    if (!first && chr === ',') {
      chr = str[++p.idx];
      while (chr === ' ') {
        chr = str[++p.idx];
      }
    }

    if (chr === ']') break;

    let value = parseExpression(p);
    chr = str[p.idx];

    values.push(value);

    while (chr === ' ') {
      chr = str[++p.idx];
    }
    first = false;
  }

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  if (!match(p, ']#')) throw new Error();
  p.idx += 2;
  chr = str[p.idx];

  return buildSumsTag(values);
};

export const parseIdentifierPath = (p) => {
  let { str } = buildParser(p);
  let chr = str[p.idx];
  let segments = [];

  let sep = true;
  while (sep) {
    segments.push(parseIdentifier(p));
    chr = str[p.idx];

    sep = chr === '.' ? chr : null;
  }

  return freezeRecord(segments);
};

export const parseAttributeDefinitionTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '{') throw new Error();
  chr = str[++p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let key = parseIdentifierPath(p);
  chr = str[p.idx];

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let value = parseExpression(p);
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  if (chr !== '}') throw new Error();
  chr = str[++p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildAttributeDefinitionTag(key, value);
};

export const parseBindingTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];
  let type = null;
  let name = null;

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  if (chr === '.' && str[p.idx + 1] === '.') {
    p.idx += 2;
    type = Symbol.for('..');
  } else {
    name = Symbol.for(parseIdentifier(p));
    chr = str[p.idx];
  }

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildBindingTag(type, name);
};

export const parseDoctypeTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '<' || str[p.idx + 1] !== '!') throw new Error();
  p.idx += 2;

  let version = parseUnsignedInteger(p);
  chr = str[p.idx];

  if (!match(p, ':cstml')) throw new Error();
  p.idx += 6;
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let attributes = freezeRecord({});

  if (chr === '{') {
    attributes = parseObject(p);
    chr = str[p.idx];

    while (chr === ' ') chr = str[++p.idx];
  }

  if (chr !== '>') throw new Error();
  chr = str[++p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildDoctypeTag(version, attributes);
};

export const parseMuxTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '<') throw new Error();
  chr = str[++p.idx];

  let processPath = [];
  let stream = 1;

  if (!inRange(chr, '0', '9')) throw new Error();

  do {
    let digits = [];
    while (chr >= '0' && chr <= '9') {
      digits.push(chr);
      chr = str[++p.idx];
    }
    processPath.push(parseInt(digits.join(''), 10));
  } while (chr === '.');

  if (chr === '-') {
    chr = str[++p.idx];
    if ('1234'.includes(chr)) {
      stream = parseInt(chr, 10);
      chr = str[++p.idx];
    }
  }

  if (chr !== '>') throw new Error();
  chr = str[++p.idx];

  return buildMuxTag(processPath, stream);
};

export const parseTag = (tag) => {
  // TODO remove this?
  if (isArray(tag)) {
    if (!_validNodes.has(tag)) throw new Error();
    let node = tag;
    let sigilTag = node[0];

    switch (parseTagType(sigilTag)) {
      case OpenNodeTag:
        return buildTag_(TreeNode, node);
      case GapTag:
        return buildTag_(GapNode, node);
      case NullTag:
        return buildTag_(NullNode, node);
      case ReferenceTag:
      case ShiftTag:
      case EmptyTag:
        return buildTag_(Property, node);
      case BindingTag:
        return buildTag_(BindingsNode, node);
      default:
        throw new Error();
    }

    return tag;
  }
  if (tag === '') return buildEmptyTag();
  if (tag == null) return null;

  let p = buildTagParser(tag);

  let tagType = parseTagType(p);

  switch (tagType) {
    case DoctypeTag:
      return parseDoctypeTag(tag);
    case AttributeDefinitionTag:
      return parseAttributeDefinitionTag(tag);
    case OpenNodeTag:
      return parseOpenNodeTag(tag);
    case ReferenceTag:
      return parseReferenceTag(tag);
    case BindingTag:
      return parseBindingTag(tag);
    case LiteralTag:
      return parseLiteralTag(tag);
    case BinaryLiteralTag:
      return parseBinaryLiteralTag(tag);
    case EscapeTag:
      return parseEscapeTag(tag);
    case CloseNodeTag:
      return parseCloseNodeTag(tag);
    case GapTag:
      return parseGapTag(tag);
    case NullTag:
      return parseNullTag(tag);
    case ShiftTag:
      return parseShiftTag(tag);
    case HashTag:
      return parseHashTag(tag);
    case SumsTag:
      return parseSumsTag(tag);
    case Property:
      return tag;
    case TreeNode:
    case GapNode:
    case NullNode:
    default:
      throw new Error();
  }
};

export const parseStreamTag = (tag) => {
  if (isObject(tag) && tag.type === Property) return tag;
  let p = buildTagParser(tag);
  if (tag == null) return null;

  let tagType = parseStreamTagType(p);

  return tagType === MuxTag ? parseMuxTag(tag) : parseTag(tag);
};

const symbolName = (name) => {
  return isString(name) ? Symbol.for(name) : name;
};

let buildTag_ = (type, value) => {
  return freezeRecord({ type, value });
};

export const emptyTag = buildTag_(EmptyTag, freezeRecord({}));
_validEmpties.add(emptyTag.value);

export const buildEmptyTag = () => {
  return emptyTag;
};

export const buildDocumentTag = (doctypeTag, tree) => {
  let tag = buildTag_(Document, freezeRecord({ doctypeTag, tree }));
  _validDocuments.add(tag.value);
  return tag;
};

export const defaultReferenceFlags = freezeRecord({
  array: false,
  expression: false,
  intrinsic: false,
  hasGap: false,
});

export const buildReferenceTag = (type = null, name = null, flags = defaultReferenceFlags) => {
  return buildTag_(ReferenceTag, buildReference(type, name, flags));
};

export const buildReference = (type = null, name = null, flags = defaultReferenceFlags) => {
  if (!Object.isFrozen(flags)) throw new Error();
  let { array, expression, intrinsic, hasGap } = flags;

  if (type != null && !['_', '__', '.', '#'].includes(type)) throw new Error();
  if (type && ['_', '#'].includes(type) && (intrinsic || hasGap)) throw new Error();

  if (name != null && (!isString(name) || !name)) throw new Error();

  if (hasGap && intrinsic) throw new Error();
  if (array && ['_', '#'].includes(type)) throw new Error();

  array = !!array;
  expression = !!expression;
  intrinsic = !!intrinsic;
  hasGap = !!hasGap;

  let type_ = type == null && name == null ? '.' : type;

  let reference = freezeRecord({
    type: type_,
    name,
    flags: freezeRecord({ array, expression, intrinsic, hasGap }),
  });
  _validReferences.add(reference);
  return reference;
};

export const buildHash = (value) => {
  if (!isString(value)) throw new Error();

  let hash = freezeRecord({ value });
  _validHashes.add(hash);
  return hash;
};

export const buildHashTag = (value) => {
  return buildTag_(HashTag, buildHash(value));
};

export const buildSums = (sums) => {
  if (sums.length !== 6) throw new Error();
  if (isArray(sums[0]) && !isFrozen(sums[1])) throw new Error();
  if (!Number.isFinite(sums[1])) throw new Error();
  if (!Number.isFinite(sums[2])) throw new Error();
  if (!Number.isFinite(sums[3])) throw new Error();

  freezeRecord(sums);
  _validSums.add(sums);
  return sums;
};

export const buildSumsTag = (sums) => {
  return buildTag_(SumsTag, buildSums(sums));
};

export const nullTag = buildTag_(NullTag, freezeRecord({}));
_validNulls.add(nullTag.value);

export const buildNullTag = () => {
  return nullTag;
};

export const buildBinding = (type, name) => {
  let type_ = isString(type) ? Symbol.for(type) : type;
  let name_ = isString(name) ? Symbol.for(name) : name;
  if (type_ && (!isSymbol(type_) || !['..', '_'].includes(type_.desription))) throw new Error();
  if (name_ && !isSymbol(name_)) throw new Error();
  if (type_ && name_) throw new Error();

  let binding = freezeRecord({ type: type_, name: name_ });
  _validBindings.add(binding);
  return binding;
};

export const buildBindingTag = (type, name) => {
  return buildTag_(BindingTag, buildBinding(type, name));
};

export const buildMux = (processPath, stream) => {
  if (stream && !(stream >= 1 && stream <= 4)) throw new Error();

  let mux = freezeRecord({ processPath, stream });
  _validMuxes.add(mux);
  return mux;
};

export const buildMuxTag = (processPath, stream) => {
  return buildTag_(MuxTag, buildMux(processPath, stream));
};

export const buildGap = (hash = null) => {
  let gap = freezeRecord({ hash });
  _validGaps.add(gap);
  return gap;
};

export const buildGapTag = (hash = null) => {
  return buildTag_(GapTag, buildGap(hash));
};

export const buildShift = (index) => {
  let shift = freezeRecord({ index });
  _validShifts.add(shift);
  return shift;
};

export const buildShiftTag = (index) => {
  return buildTag_(ShiftTag, buildShift(index));
};

export const buildBinaryLiteral = (value) => {
  if (!isString(value) || !value) throw new Error();
  // TODO is the string valid base64
  let binaryLiteral = freezeRecord({ value });
  _validBinaryLiterals.add(binaryLiteral);
  return binaryLiteral;
};

export const buildBinaryLiteralTag = (value) => {
  return buildTag_(BinaryLiteralTag, buildBinaryLiteral(value));
};

export const buildLiteral = (value) => {
  if (!isString(value) || !value) throw new Error('invalid literal');
  let literal = freezeRecord({ value });
  _validLiterals.add(literal);
  return literal;
};

export const buildLiteralTag = (value) => {
  return buildTag_(LiteralTag, buildLiteral(value));
};

export const buildEscape = (value, cookedValue) => {
  if (!isString(value) || !value) throw new Error();
  let escape = freezeRecord({ value, cookedValue });
  _validEscapes.add(escape);
  return escape;
};

export const buildEscapeTag = (value, cookedValue) => {
  return buildTag_(EscapeTag, buildEscape(value, cookedValue));
};

export const buildDoctype = (version = 0, attributes = freezeRecord({})) => {
  if (!isDeepRecord(attributes)) throw new Error();

  let doctype = freezeRecord({ doctype: 'cstml', version, attributes });
  _validDoctypes.add(doctype);
  return doctype;
};

export const buildDoctypeTag = (version = 0, attributes = freezeRecord({})) => {
  return buildTag_(DoctypeTag, buildDoctype(version, attributes));
};

export const defaultNodeFlags = freezeRecord({ array: false, object: false, token: false });

export const buildOpenNode = (
  flags = defaultNodeFlags,
  type = '__',
  name = null,
  literalValue = null,
  attributes = freezeRecord({}),
  selfClosing = !!literalValue,
) => {
  let type_ = symbolName(type);
  if (!isDeepRecord(attributes)) throw new Error();
  if (literalValue && ![LiteralTag, EscapeTag, BinaryLiteralTag].includes(literalValue.type)) {
    throw new Error();
  }
  if (!type && !name && !flags.token && literalValue != null) throw new Error();
  if (literalValue != null && !selfClosing) throw new Error();

  if (isString(literalValue)) throw new Error();

  if (flags.object && flags.array) throw new Error();

  if (type_ && ![Symbol.for('_'), Symbol.for('__')].includes(type_)) throw new Error();
  if ((flags.token || type_ === Symbol.for('_')) && (flags.object || flags.array))
    throw new Error();
  if (!hasOwn(flags, 'token')) throw new Error();

  let openNode = freezeRecord({
    flags,
    name: type_ === Symbol.for('__') ? null : symbolName(name),
    type: type_,
    depth: name && type_ === Symbol.for('__') ? name ?? 1 : 1,
    literalValue,
    attributes,
    selfClosing,
  });
  _validOpenNodes.add(openNode);
  return openNode;
};

export const buildOpenNodeTag = (
  flags = defaultNodeFlags,
  type = '__',
  name = null,
  literalValue = null,
  attributes = freezeRecord({}),
  selfClosing = !!literalValue,
) => {
  return buildTag_(
    OpenNodeTag,
    buildOpenNode(flags, type, name, literalValue, attributes, selfClosing),
  );
};

export const buildCloseNodeTag = () => {
  return buildTag_(CloseNodeTag);
};

export const buildAttributeDefinition = (key, value) => {
  if (!key?.length) throw new Error();

  return freezeRecord({ path: key, value });
};

export const buildAttributeDefinitionTag = (key, value) => {
  return buildTag_(AttributeDefinitionTag, buildAttributeDefinition(key, value));
};

let porcelain = { porcelain: true };

let flagsForSigilTag = (tag) => {
  let tag_ = isString(tag) ? parseTag(tag) : tag;
  return tag_.type === OpenNodeTag
    ? (tag_.value.flags.object ? '{' : '') + (tag_.value.flags.array ? '[' : '')
    : '';
};

export const startsNode = (tag) => {
  let tagType = parseTagType(tag);
  return [OpenNodeTag, NullTag, GapTag].includes(tagType);
};

export const endsNode = (tag) => {
  let tagType = parseTagType(tag);
  if ([CloseNodeTag, NullTag, GapTag].includes(tagType)) return true;

  return tagType === OpenNodeTag ? parseTag(tag).value.selfClosing : false;
};
