#!/usr/bin/env node

// src/cli-entry.ts
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// src/ascii-json.ts
function asciiJson(value) {
  return JSON.stringify(value, null, 2).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

// src/glossary.ts
import { readFileSync } from "node:fs";
var GLOSSARY_FILE = new URL("../data/glossary.json", import.meta.url);
function loadGlossary(file = GLOSSARY_FILE) {
  const g = JSON.parse(readFileSync(file, "utf8"));
  for (const [key, entries] of Object.entries(g)) {
    if (!Array.isArray(entries) || entries.length === 0) throw new Error(`glossary: "${key}" has no entries`);
    for (const e of entries) {
      if (!["bc", "federal"].includes(e.jurisdiction) || !Array.isArray(e.en_terms) || e.en_terms.length === 0 || !Array.isArray(e.acts)) {
        throw new Error(`glossary: malformed entry under "${key}"`);
      }
    }
  }
  return g;
}
var isAscii = (s) => /^[\x00-\x7f]*$/.test(s);
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function position(text2, term) {
  if (!isAscii(term)) return text2.indexOf(term);
  const m = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(term)}`, "i").exec(text2);
  return m ? m.index + m[1].length : -1;
}
function termsInText(g, text2) {
  const found = Object.keys(g).map((k) => ({ k, at: position(text2, k) })).filter((f) => f.at >= 0);
  return found.filter((f) => !found.some((o) => o.k.length > f.k.length && o.k.toLowerCase().includes(f.k.toLowerCase()))).sort((a, b) => a.at - b.at).map((f) => f.k);
}
function lookupTerm(g, term) {
  const t = term.trim();
  const expand = (key2, match) => g[key2].map((e) => ({ term: key2, match, ...e }));
  const key = Object.keys(g).find((k) => k.toLowerCase() === t.toLowerCase());
  if (key) return expand(key, "exact");
  const lower = t.toLowerCase();
  const english = Object.keys(g).filter((k) => g[k].some((e) => e.en_terms.some((en) => en.toLowerCase() === lower)));
  if (english.length > 0) return english.flatMap((k) => expand(k, "english"));
  return termsInText(g, t).flatMap((k) => expand(k, "contained"));
}

// src/tool-error.ts
var ToolError = class extends Error {
};

// node_modules/fast-xml-parser/src/util.js
var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
var nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
var regexName = new RegExp("^" + nameRegexp + "$");
function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}
var isName = function(string) {
  const match = regexName.exec(string);
  return !(match === null || typeof match === "undefined");
};
function isExist(v) {
  return typeof v !== "undefined";
}
var DANGEROUS_PROPERTY_NAMES = [
  // '__proto__',
  // 'constructor',
  // 'prototype',
  "hasOwnProperty",
  "toString",
  "valueOf",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__"
];
var criticalProperties = ["__proto__", "constructor", "prototype"];

// node_modules/fast-xml-parser/src/validator.js
var defaultOptions = {
  allowBooleanAttributes: false,
  //A tag can have attributes without any value
  unpairedTags: []
};
function validate(xmlData, options) {
  options = Object.assign({}, defaultOptions, options);
  const tags = [];
  let tagFound = false;
  let reachedRoot = false;
  if (xmlData[0] === "\uFEFF") {
    xmlData = xmlData.substr(1);
  }
  for (let i = 0; i < xmlData.length; i++) {
    if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
      i += 2;
      i = readPI(xmlData, i);
      if (i.err) return i;
    } else if (xmlData[i] === "<") {
      let tagStartPos = i;
      i++;
      if (xmlData[i] === "!") {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === "/") {
          closingTag = true;
          i++;
        }
        let tagName = "";
        for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        if (tagName[tagName.length - 1] === "/") {
          tagName = tagName.substring(0, tagName.length - 1);
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
        }
        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;
        if (attrStr[attrStr.length - 1] === "/") {
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
          } else {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else if (tags.length === 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject(
                "InvalidTag",
                "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                getLineNumberForPosition(xmlData, tagStartPos)
              );
            }
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }
          if (reachedRoot === true) {
            return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
          } else if (options.unpairedTags.indexOf(tagName) !== -1) {
          } else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === "<") {
            if (xmlData[i + 1] === "!") {
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i + 1] === "?") {
              i = readPI(xmlData, ++i);
              if (i.err) return i;
            } else {
              break;
            }
          } else if (xmlData[i] === "&") {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        }
        if (xmlData[i] === "<") {
          i--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }
  if (!tagFound) {
    return getErrorObject("InvalidXml", "Start tag expected.", 1);
  } else if (tags.length == 1) {
    return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
  }
  return true;
}
function isWhiteSpace(char) {
  return char === " " || char === "	" || char === "\n" || char === "\r";
}
function readPI(xmlData, i) {
  const start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == "?" || xmlData[i] == " ") {
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === "xml") {
        return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}
function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "<") {
        angleBracketsCount++;
      } else if (xmlData[i] === ">") {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  }
  return i;
}
var doubleQuote = '"';
var singleQuote = "'";
function readAttributeStr(xmlData, i) {
  let attrStr = "";
  let startChar = "";
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === "") {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) {
      } else {
        startChar = "";
      }
    } else if (xmlData[i] === ">") {
      if (startChar === "") {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== "") {
    return false;
  }
  return {
    value: attrStr,
    index: i,
    tagClosed
  };
}
function scanAttributeTokens(attrStr) {
  const tokens = [];
  const len = attrStr.length;
  let i = 0;
  while (i < len) {
    const tokenStart = i;
    while (i < len && isWhiteSpace(attrStr[i])) i++;
    if (i >= len) break;
    if (attrStr[i] === "=") {
      i = tokenStart + 1;
      continue;
    }
    const leadingWs = attrStr.slice(tokenStart, i);
    const nameStart = i;
    while (i < len && !isWhiteSpace(attrStr[i]) && attrStr[i] !== "=") i++;
    const name = attrStr.slice(nameStart, i);
    let equalsGroup;
    let j = i;
    while (j < len && isWhiteSpace(attrStr[j])) j++;
    if (j < len && attrStr[j] === "=") {
      equalsGroup = attrStr.slice(i, j + 1);
      i = j + 1;
    }
    let quoteChar;
    let value;
    let k = i;
    while (k < len && isWhiteSpace(attrStr[k])) k++;
    if (k < len && (attrStr[k] === '"' || attrStr[k] === "'")) {
      const valueStart = k + 1;
      const closeIdx = attrStr.indexOf(attrStr[k], valueStart);
      if (closeIdx !== -1) {
        quoteChar = attrStr[k];
        value = attrStr.slice(valueStart, closeIdx);
        i = closeIdx + 1;
      }
    }
    const token = { startIndex: tokenStart };
    token[1] = leadingWs;
    token[2] = name;
    token[3] = equalsGroup;
    token[4] = quoteChar !== void 0 ? true : void 0;
    token[5] = quoteChar;
    token[6] = value;
    tokens.push(token);
  }
  return tokens;
}
function validateAttributeString(attrStr, options) {
  const matches = scanAttributeTokens(attrStr);
  const attrNames = {};
  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
      return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
    }
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
      attrNames[attrName] = 1;
    } else {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
    }
  }
  return true;
}
function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === "x") {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ";")
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}
function validateAmpersand(xmlData, i) {
  i++;
  if (xmlData[i] === ";")
    return -1;
  if (xmlData[i] === "#") {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ";")
      break;
    return -1;
  }
  return i;
}
function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col
    }
  };
}
function validateAttrName(attrName) {
  return isName(attrName);
}
function validateTagName(tagname) {
  return isName(tagname);
}
function getLineNumberForPosition(xmlData, index) {
  const lines = xmlData.substring(0, index).split(/\r?\n/);
  return {
    line: lines.length,
    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}

// node_modules/@nodable/entities/src/entities.js
var CURRENCY = {
  cent: "\xA2",
  pound: "\xA3",
  curren: "\xA4",
  yen: "\xA5",
  euro: "\u20AC",
  dollar: "$",
  fnof: "\u0192",
  inr: "\u20B9",
  af: "\u060B",
  birr: "\u1265\u122D",
  peso: "\u20B1",
  rub: "\u20BD",
  won: "\u20A9",
  yuan: "\xA5",
  cedil: "\xB8"
};
var XML = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"'
};
var COMMON_HTML = {
  nbsp: "\xA0",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  laquo: "\xAB",
  raquo: "\xBB",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  bull: "\u2022",
  para: "\xB6",
  sect: "\xA7",
  deg: "\xB0",
  frac12: "\xBD",
  frac14: "\xBC",
  frac34: "\xBE"
};

// node_modules/@nodable/entities/src/EntityDecoder.js
var ENTITY_ACTION = Object.freeze({
  /** Resolve and expand the entity normally. */
  ALLOW: "allow",
  /** Silently skip this entity — it will not be registered. */
  BLOCK: "block",
  /** Throw an error, aborting entity registration entirely. */
  THROW: "throw"
});
var SPECIAL_CHARS = new Set("!?\\\\/[]$%{}^&*()<>|+");
function validateEntityName(name) {
  if (name[0] === "#") {
    throw new Error(`[EntityReplacer] Invalid character '#' in entity name: "${name}"`);
  }
  for (const ch of name) {
    if (SPECIAL_CHARS.has(ch)) {
      throw new Error(`[EntityReplacer] Invalid character '${ch}' in entity name: "${name}"`);
    }
  }
  return name;
}
function mergeEntityMaps(...maps) {
  const out = /* @__PURE__ */ Object.create(null);
  for (const map of maps) {
    if (!map) continue;
    for (const key of Object.keys(map)) {
      const raw = map[key];
      if (typeof raw === "string") {
        out[key] = raw;
      } else if (raw && typeof raw === "object" && raw.val !== void 0) {
        const val = raw.val;
        if (typeof val === "string") {
          out[key] = val;
        }
      }
    }
  }
  return out;
}
var LIMIT_TIER_EXTERNAL = "external";
var LIMIT_TIER_BASE = "base";
var LIMIT_TIER_ALL = "all";
function parseLimitTiers(raw) {
  if (!raw || raw === LIMIT_TIER_EXTERNAL) return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
  if (raw === LIMIT_TIER_ALL) return /* @__PURE__ */ new Set([LIMIT_TIER_ALL]);
  if (raw === LIMIT_TIER_BASE) return /* @__PURE__ */ new Set([LIMIT_TIER_BASE]);
  if (Array.isArray(raw)) return new Set(raw);
  return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
}
var NCR_LEVEL = Object.freeze({ allow: 0, leave: 1, remove: 2, throw: 3 });
var XML10_ALLOWED_C0 = /* @__PURE__ */ new Set([9, 10, 13]);
function parseNCRConfig(ncr) {
  if (!ncr) {
    return { xmlVersion: 1, onLevel: NCR_LEVEL.allow, nullLevel: NCR_LEVEL.remove };
  }
  const xmlVersion = ncr.xmlVersion === 1.1 ? 1.1 : 1;
  const onLevel = NCR_LEVEL[ncr.onNCR] ?? NCR_LEVEL.allow;
  const nullLevel = NCR_LEVEL[ncr.nullNCR] ?? NCR_LEVEL.remove;
  const clampedNull = Math.max(nullLevel, NCR_LEVEL.remove);
  return { xmlVersion, onLevel, nullLevel: clampedNull };
}
var EntityDecoder = class {
  /**
   * @param {object} [options]
   * @param {object|null}  [options.namedEntities]        — extra named entities merged into base map
   * @param {object}  [options.limit]                 — security limits
   * @param {number}       [options.limit.maxTotalExpansions=0]  — 0 = unlimited
   * @param {number}       [options.limit.maxExpandedLength=0]   — 0 = unlimited
   * @param {'external'|'base'|'all'|string[]} [options.limit.applyLimitsTo='external']
   *   Which entity tiers count against the security limits:
   *   - 'external' (default) — only input/runtime + persistent external entities
   *   - 'base'               — only DEFAULT_XML_ENTITIES + namedEntities
   *   - 'all'                — every entity regardless of tier
   *   - string[]             — explicit combination, e.g. ['external', 'base']
   * @param {((resolved: string, original: string) => string)|null} [options.postCheck=null]
   * @param {string[]} [options.remove=[]] — entity names (e.g. ['nbsp', '#13']) to delete (replace with empty string)
   * @param {string[]} [options.leave=[]]  — entity names to keep as literal (unchanged in output)
   * @param {object}   [options.ncr]       — Numeric Character Reference controls
   * @param {1.0|1.1}  [options.ncr.xmlVersion=1.0]
   *   XML version governing which codepoint ranges are restricted:
   *   - 1.0 — C0 controls U+0001–U+001F (except U+0009/000A/000D) are prohibited
   *   - 1.1 — C0 controls are allowed when written as NCRs; C1 (U+007F–U+009F) decoded as-is
   * @param {'allow'|'leave'|'remove'|'throw'} [options.ncr.onNCR='allow']
   *   Base action for numeric references. Severity order: allow < leave < remove < throw.
   *   For codepoint ranges that carry a minimum level (surrogates → remove, XML 1.0 C0 → remove),
   *   the effective action is max(onNCR, rangeMinimum).
   * @param {'remove'|'throw'} [options.ncr.nullNCR='remove']
   *   Action for U+0000 (null). 'allow' and 'leave' are clamped to 'remove' since null is never safe.
   * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onExternalEntity=null]
   *   Hook called when an external entity is registered via `setExternalEntities()` or
   *   `addExternalEntity()`. Return `ENTITY_ACTION.ALLOW` to accept the entity,
   *   `ENTITY_ACTION.BLOCK` to silently skip it, or `ENTITY_ACTION.THROW` to abort with an error.
   * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onInputEntity=null]
   *   Hook called when an input entity is registered via `addInputEntities()`. Return
   *   `ENTITY_ACTION.ALLOW` to accept, `ENTITY_ACTION.BLOCK` to silently skip, or
   *   `ENTITY_ACTION.THROW` to abort with an error.
   */
  constructor(options = {}) {
    this._limit = options.limit || {};
    this._maxTotalExpansions = this._limit.maxTotalExpansions || 0;
    this._maxExpandedLength = this._limit.maxExpandedLength || 0;
    this._postCheck = typeof options.postCheck === "function" ? options.postCheck : (r2) => r2;
    this._limitTiers = parseLimitTiers(this._limit.applyLimitsTo ?? LIMIT_TIER_EXTERNAL);
    this._numericAllowed = options.numericAllowed ?? true;
    this._baseMap = mergeEntityMaps(XML, options.namedEntities || null);
    this._externalMap = /* @__PURE__ */ Object.create(null);
    this._inputMap = /* @__PURE__ */ Object.create(null);
    this._totalExpansions = 0;
    this._expandedLength = 0;
    this._removeSet = new Set(options.remove && Array.isArray(options.remove) ? options.remove : []);
    this._leaveSet = new Set(options.leave && Array.isArray(options.leave) ? options.leave : []);
    const ncrCfg = parseNCRConfig(options.ncr);
    this._ncrXmlVersion = ncrCfg.xmlVersion;
    this._ncrOnLevel = ncrCfg.onLevel;
    this._ncrNullLevel = ncrCfg.nullLevel;
    this._onExternalEntity = typeof options.onExternalEntity === "function" ? options.onExternalEntity : null;
    this._onInputEntity = typeof options.onInputEntity === "function" ? options.onInputEntity : null;
  }
  // -------------------------------------------------------------------------
  // Private: registration hook dispatch
  // -------------------------------------------------------------------------
  /**
   * Invoke a registration hook for a single entity name/value pair.
   * Returns true when the entity should be accepted, false when it should be
   * silently skipped (BLOCK), and throws when the hook returns THROW.
   *
   * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} hook
   * @param {string} name
   * @param {string} value
   * @param {string} context  — used in error messages ('external' | 'input')
   * @returns {boolean}  true = accept, false = skip
   */
  _applyRegistrationHook(hook, name, value, context) {
    if (!hook) return true;
    const action = hook(name, value);
    if (action === ENTITY_ACTION.BLOCK) return false;
    if (action === ENTITY_ACTION.THROW) {
      throw new Error(
        `[EntityDecoder] Registration of ${context} entity "&${name};" was rejected by hook`
      );
    }
    return true;
  }
  // -------------------------------------------------------------------------
  // Persistent external entity registration
  // -------------------------------------------------------------------------
  /**
   * Replace the full set of persistent external entities.
   * All keys are validated — throws on invalid characters.
   * If `onExternalEntity` is set, it is called once per entry; entries that
   * return `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW`
   * aborts the whole call.
   * @param {Record<string, string | { regex?: RegExp, val: string }>} map
   */
  setExternalEntities(map) {
    if (map) {
      for (const key of Object.keys(map)) {
        validateEntityName(key);
      }
    }
    if (!this._onExternalEntity) {
      this._externalMap = mergeEntityMaps(map);
      return;
    }
    const flat = mergeEntityMaps(map);
    const filtered = /* @__PURE__ */ Object.create(null);
    for (const [name, value] of Object.entries(flat)) {
      if (this._applyRegistrationHook(this._onExternalEntity, name, value, "external")) {
        filtered[name] = value;
      }
    }
    this._externalMap = filtered;
  }
  /**
   * Add a single persistent external entity.
   * If `onExternalEntity` is set it is called before the entity is stored;
   * `ENTITY_ACTION.BLOCK` silently skips storage, `ENTITY_ACTION.THROW` raises.
   * @param {string} key
   * @param {string} value
   */
  addExternalEntity(key, value) {
    validateEntityName(key);
    if (typeof value === "string" && value.indexOf("&") === -1) {
      if (this._applyRegistrationHook(this._onExternalEntity, key, value, "external")) {
        this._externalMap[key] = value;
      }
    }
  }
  // -------------------------------------------------------------------------
  // Input / runtime entity registration (per document)
  // -------------------------------------------------------------------------
  /**
   * Inject DOCTYPE entities for the current document.
   * Also resets per-document expansion counters.
   * If `onInputEntity` is set it is called once per entry; entries returning
   * `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW` aborts.
   * @param {Record<string, string | { regx?: RegExp, regex?: RegExp, val: string }>} map
   */
  addInputEntities(map) {
    this._totalExpansions = 0;
    this._expandedLength = 0;
    if (!this._onInputEntity) {
      this._inputMap = mergeEntityMaps(map);
      return;
    }
    const flat = mergeEntityMaps(map);
    const filtered = /* @__PURE__ */ Object.create(null);
    for (const [name, value] of Object.entries(flat)) {
      if (this._applyRegistrationHook(this._onInputEntity, name, value, "input")) {
        filtered[name] = value;
      }
    }
    this._inputMap = filtered;
  }
  // -------------------------------------------------------------------------
  // Per-document reset
  // -------------------------------------------------------------------------
  /**
   * Wipe input/runtime entities and reset counters.
   * Call this before processing each new document.
   * @returns {this}
   */
  reset() {
    this._inputMap = /* @__PURE__ */ Object.create(null);
    this._totalExpansions = 0;
    this._expandedLength = 0;
    return this;
  }
  // -------------------------------------------------------------------------
  // XML version (can be set after construction, e.g. once parser reads <?xml?>)
  // -------------------------------------------------------------------------
  /**
   * Update the XML version used for NCR classification.
   * Call this as soon as the document's `<?xml version="...">` declaration is parsed.
   * @param {1.0|1.1|number} version
   */
  setXmlVersion(version) {
    this._ncrXmlVersion = version === 1.1 ? 1.1 : 1;
  }
  // -------------------------------------------------------------------------
  // Primary API
  // -------------------------------------------------------------------------
  /**
   * Replace all entity references in `str` in a single pass.
   *
   * @param {string} str
   * @returns {string}
   */
  decode(str) {
    if (typeof str !== "string" || str.length === 0) return str;
    if (str.indexOf("&") === -1) return str;
    const original = str;
    const chunks = [];
    const len = str.length;
    let last = 0;
    let i = 0;
    const limitExpansions = this._maxTotalExpansions > 0;
    const limitLength = this._maxExpandedLength > 0;
    const checkLimits = limitExpansions || limitLength;
    while (i < len) {
      if (str.charCodeAt(i) !== 38) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < len && str.charCodeAt(j) !== 59 && j - i <= 32) j++;
      if (j >= len || str.charCodeAt(j) !== 59) {
        i++;
        continue;
      }
      const token = str.slice(i + 1, j);
      if (token.length === 0) {
        i++;
        continue;
      }
      let replacement;
      let tier;
      if (this._removeSet.has(token)) {
        replacement = "";
        if (tier === void 0) {
          tier = LIMIT_TIER_EXTERNAL;
        }
      } else if (this._leaveSet.has(token)) {
        i++;
        continue;
      } else if (token.charCodeAt(0) === 35) {
        const ncrResult = this._resolveNCR(token);
        if (ncrResult === void 0) {
          i++;
          continue;
        }
        replacement = ncrResult;
        tier = LIMIT_TIER_BASE;
      } else {
        const resolved = this._resolveName(token);
        replacement = resolved?.value;
        tier = resolved?.tier;
      }
      if (replacement === void 0) {
        i++;
        continue;
      }
      if (i > last) chunks.push(str.slice(last, i));
      chunks.push(replacement);
      last = j + 1;
      i = last;
      if (checkLimits && this._tierCounts(tier)) {
        if (limitExpansions) {
          this._totalExpansions++;
          if (this._totalExpansions > this._maxTotalExpansions) {
            throw new Error(
              `[EntityReplacer] Entity expansion count limit exceeded: ${this._totalExpansions} > ${this._maxTotalExpansions}`
            );
          }
        }
        if (limitLength) {
          const delta = replacement.length - (token.length + 2);
          if (delta > 0) {
            this._expandedLength += delta;
            if (this._expandedLength > this._maxExpandedLength) {
              throw new Error(
                `[EntityReplacer] Expanded content length limit exceeded: ${this._expandedLength} > ${this._maxExpandedLength}`
              );
            }
          }
        }
      }
    }
    if (last < len) chunks.push(str.slice(last));
    const result = chunks.length === 0 ? str : chunks.join("");
    return this._postCheck(result, original);
  }
  // -------------------------------------------------------------------------
  // Private: limit tier check
  // -------------------------------------------------------------------------
  /**
   * Returns true if a resolved entity of the given tier should count
   * against the expansion/length limits.
   * @param {string} tier  — LIMIT_TIER_EXTERNAL | LIMIT_TIER_BASE
   * @returns {boolean}
   */
  _tierCounts(tier) {
    if (this._limitTiers.has(LIMIT_TIER_ALL)) return true;
    return this._limitTiers.has(tier);
  }
  // -------------------------------------------------------------------------
  // Private: entity resolution
  // -------------------------------------------------------------------------
  /**
   * Resolve a named entity token (without & and ;).
   * Priority: inputMap > externalMap > baseMap
   * Returns the resolved value tagged with its limit tier.
   *
   * @param {string} name
   * @returns {{ value: string, tier: string }|undefined}
   */
  _resolveName(name) {
    if (name in this._inputMap) return { value: this._inputMap[name], tier: LIMIT_TIER_EXTERNAL };
    if (name in this._externalMap) return { value: this._externalMap[name], tier: LIMIT_TIER_EXTERNAL };
    if (name in this._baseMap) return { value: this._baseMap[name], tier: LIMIT_TIER_BASE };
    return void 0;
  }
  /**
   * Classify a codepoint and return the minimum action level that must be applied.
   * Returns -1 when no minimum is imposed (normal allow path).
   *
   * Ranges checked (in priority order):
   *   1. U+0000            — null, governed by nullNCR (always ≥ remove)
   *   2. U+D800–U+DFFF     — surrogates, always prohibited (min: remove)
   *   3. U+0001–U+001F \ {0x09,0x0A,0x0D}  — XML 1.0 restricted C0 (min: remove)
   *      (skipped in XML 1.1 — C0 controls are allowed when written as NCRs)
   *
   * @param {number} cp  — codepoint
   * @returns {number}   — minimum NCR_LEVEL value, or -1 for no restriction
   */
  _classifyNCR(cp) {
    if (cp === 0) return this._ncrNullLevel;
    if (cp >= 55296 && cp <= 57343) return NCR_LEVEL.remove;
    if (this._ncrXmlVersion === 1) {
      if (cp >= 1 && cp <= 31 && !XML10_ALLOWED_C0.has(cp)) return NCR_LEVEL.remove;
    }
    return -1;
  }
  /**
   * Execute a resolved NCR action.
   *
   * @param {number} action   — NCR_LEVEL value
   * @param {string} token    — raw token (e.g. '#38') for error messages
   * @param {number} cp       — codepoint, used only for error messages
   * @returns {string|undefined}
   *   - decoded character string  → 'allow'
   *   - ''                        → 'remove'
   *   - undefined                 → 'leave' (caller must skip past '&' only)
   *   - throws Error              → 'throw'
   */
  _applyNCRAction(action, token, cp) {
    switch (action) {
      case NCR_LEVEL.allow:
        return String.fromCodePoint(cp);
      case NCR_LEVEL.remove:
        return "";
      case NCR_LEVEL.leave:
        return void 0;
      // signal: keep literal
      case NCR_LEVEL.throw:
        throw new Error(
          `[EntityDecoder] Prohibited numeric character reference &${token}; (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`
        );
      default:
        return String.fromCodePoint(cp);
    }
  }
  /**
   * Full NCR resolution pipeline for a numeric token.
   *
   * Steps:
   *   1. Parse the codepoint (decimal or hex).
   *   2. Validate the raw codepoint range (NaN, <0, >0x10FFFF).
   *   3. If numericAllowed is false and no minimum restriction applies → leave as-is.
   *   4. Classify the codepoint to find the minimum required action level.
   *   5. Resolve effective action = max(onNCR, minimum).
   *   6. Apply and return.
   *
   * @param {string} token  — e.g. '#38', '#x26', '#X26'
   * @returns {string|undefined}
   *   - string (incl. '')  — replacement ('' = remove)
   *   - undefined          — leave original &token; as-is
   */
  _resolveNCR(token) {
    const second = token.charCodeAt(1);
    let cp;
    if (second === 120 || second === 88) {
      cp = parseInt(token.slice(2), 16);
    } else {
      cp = parseInt(token.slice(1), 10);
    }
    if (Number.isNaN(cp) || cp < 0 || cp > 1114111) return void 0;
    const minimum = this._classifyNCR(cp);
    if (!this._numericAllowed && minimum < NCR_LEVEL.remove) return void 0;
    const effective = minimum === -1 ? this._ncrOnLevel : Math.max(this._ncrOnLevel, minimum);
    return this._applyNCRAction(effective, token, cp);
  }
};

// node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
var defaultOnDangerousProperty = (name) => {
  if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return "__" + name;
  }
  return name;
};
var defaultOptions2 = {
  preserveOrder: false,
  attributeNamePrefix: "@_",
  attributesGroupName: false,
  textNodeName: "#text",
  ignoreAttributes: true,
  removeNSPrefix: false,
  // remove NS from tag name or attribute name if true
  allowBooleanAttributes: false,
  //a tag can have attributes without any value
  //ignoreRootElement : false,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  //Trim string values of tag and attributes
  cdataPropName: false,
  numberParseOptions: {
    hex: true,
    leadingZeros: true,
    eNotation: true,
    unicode: false
  },
  tagValueProcessor: function(tagName, val) {
    return val;
  },
  attributeValueProcessor: function(attrName, val) {
    return val;
  },
  stopNodes: [],
  //nested tags will not be parsed even for errors
  alwaysCreateTextNode: false,
  isArray: () => false,
  commentPropName: false,
  unpairedTags: [],
  processEntities: true,
  htmlEntities: false,
  entityDecoder: null,
  ignoreDeclaration: false,
  ignorePiTags: false,
  transformTagName: false,
  transformAttributeName: false,
  updateTag: function(tagName, jPath, attrs) {
    return tagName;
  },
  // skipEmptyListItem: false
  captureMetaData: false,
  maxNestedTags: 100,
  strictReservedNames: true,
  jPath: true,
  // if true, pass jPath string to callbacks; if false, pass matcher instance
  onDangerousProperty: defaultOnDangerousProperty
};
function validatePropertyName(propertyName, optionName) {
  if (typeof propertyName !== "string") {
    return;
  }
  const normalized = propertyName.toLowerCase();
  if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
  if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
}
function normalizeProcessEntities(value, htmlEntities) {
  if (typeof value === "boolean") {
    return {
      enabled: value,
      // true or false
      maxEntitySize: 1e4,
      maxExpansionDepth: 1e4,
      maxTotalExpansions: Infinity,
      maxExpandedLength: 1e5,
      maxEntityCount: 1e3,
      allowedTags: null,
      tagFilter: null,
      appliesTo: "all"
    };
  }
  if (typeof value === "object" && value !== null) {
    return {
      enabled: value.enabled !== false,
      maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4),
      maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4),
      maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
      maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5),
      maxEntityCount: Math.max(1, value.maxEntityCount ?? 1e3),
      allowedTags: value.allowedTags ?? null,
      tagFilter: value.tagFilter ?? null,
      appliesTo: value.appliesTo ?? "all"
    };
  }
  return normalizeProcessEntities(true);
}
var buildOptions = function(options) {
  const built = Object.assign({}, defaultOptions2, options);
  const propertyNameOptions = [
    { value: built.attributeNamePrefix, name: "attributeNamePrefix" },
    { value: built.attributesGroupName, name: "attributesGroupName" },
    { value: built.textNodeName, name: "textNodeName" },
    { value: built.cdataPropName, name: "cdataPropName" },
    { value: built.commentPropName, name: "commentPropName" }
  ];
  for (const { value, name } of propertyNameOptions) {
    if (value) {
      validatePropertyName(value, name);
    }
  }
  if (built.onDangerousProperty === null) {
    built.onDangerousProperty = defaultOnDangerousProperty;
  }
  built.processEntities = normalizeProcessEntities(built.processEntities, built.htmlEntities);
  built.unpairedTagsSet = new Set(built.unpairedTags);
  if (built.stopNodes && Array.isArray(built.stopNodes)) {
    built.stopNodes = built.stopNodes.map((node) => {
      if (typeof node === "string" && node.startsWith("*.")) {
        return ".." + node.substring(2);
      }
      return node;
    });
  }
  return built;
};

// node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var METADATA_SYMBOL;
if (typeof Symbol !== "function") {
  METADATA_SYMBOL = "@@xmlMetadata";
} else {
  METADATA_SYMBOL = /* @__PURE__ */ Symbol("XML Node Metadata");
}
var XmlNode = class {
  constructor(tagname) {
    this.tagname = tagname;
    this.child = [];
    this[":@"] = /* @__PURE__ */ Object.create(null);
  }
  add(key, val) {
    if (key === "__proto__") key = "#__proto__";
    this.child.push({ [key]: val });
  }
  addChild(node, startIndex) {
    if (node.tagname === "__proto__") node.tagname = "#__proto__";
    if (node[":@"] && Object.keys(node[":@"]).length > 0) {
      this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
    } else {
      this.child.push({ [node.tagname]: node.child });
    }
    this.addStartIndex(startIndex);
  }
  addStartIndex(startIndex) {
    if (startIndex !== void 0) {
      this.child[this.child.length - 1][METADATA_SYMBOL] = { startIndex };
    }
  }
  addEndIndex(endIndex) {
    const lastChild = this.child[this.child.length - 1];
    if (lastChild !== void 0 && lastChild[METADATA_SYMBOL] !== void 0 && lastChild[METADATA_SYMBOL].endIndex === void 0) {
      lastChild[METADATA_SYMBOL].endIndex = endIndex;
    }
  }
  /** symbol used for metadata */
  static getMetaDataSymbol() {
    return METADATA_SYMBOL;
  }
};

// node_modules/xml-naming/src/index.js
var nameStartChar10 = ":A-Za-z_\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD";
var nameChar10 = nameStartChar10 + "\\-\\.\\d\xB7\u0300-\u036F\u203F-\u2040";
var nameStartChar11 = ":A-Za-z_\xC0-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}";
var nameChar11 = nameStartChar11 + "\\-\\.\\d\xB7\u0300-\u036F\u0487\u203F-\u2040";
var buildRegexes = (startChar, char, flags = "") => {
  const ncStart = startChar.replace(":", "");
  const ncChar = char.replace(":", "");
  const ncNamePat = `[${ncStart}][${ncChar}]*`;
  return {
    name: new RegExp(`^[${startChar}][${char}]*$`, flags),
    ncName: new RegExp(`^${ncNamePat}$`, flags),
    qName: new RegExp(`^${ncNamePat}(?::${ncNamePat})?$`, flags),
    nmToken: new RegExp(`^[${char}]+$`, flags),
    nmTokens: new RegExp(`^[${char}]+(?:\\s+[${char}]+)*$`, flags)
  };
};
var regexes10 = buildRegexes(nameStartChar10, nameChar10);
var regexes11 = buildRegexes(nameStartChar11, nameChar11, "u");
var nameStartCharAscii = ":A-Za-z_";
var nameCharAscii = nameStartCharAscii + "\\-\\.\\d";
var regexesAscii = buildRegexes(nameStartCharAscii, nameCharAscii);
var getRegexes = (xmlVersion = "1.0", asciiOnly = false) => {
  if (asciiOnly) return regexesAscii;
  return xmlVersion === "1.1" ? regexes11 : regexes10;
};
var qName = (str, { xmlVersion = "1.0", asciiOnly = false } = {}) => getRegexes(xmlVersion, asciiOnly).qName.test(str);

// node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
var DocTypeReader = class {
  constructor(options, xmlVersion) {
    this.suppressValidationErr = !options;
    this.options = options;
    this.xmlVersion = xmlVersion || 1;
  }
  setXmlVersion(xmlVersion = 1) {
    this.xmlVersion = xmlVersion;
  }
  readDocType(xmlData, i) {
    const entities = /* @__PURE__ */ Object.create(null);
    let entityCount = 0;
    if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
      i = i + 9;
      let angleBracketsCount = 1;
      let hasBody = false, comment = false;
      let quoteChar = null;
      let exp = "";
      for (; i < xmlData.length; i++) {
        if (quoteChar !== null) {
          if (xmlData[i] === quoteChar) quoteChar = null;
          exp += xmlData[i];
          continue;
        }
        if (!hasBody && !comment && (xmlData[i] === '"' || xmlData[i] === "'")) {
          quoteChar = xmlData[i];
          exp += xmlData[i];
          continue;
        }
        if (xmlData[i] === "<" && !comment) {
          if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
            i += 7;
            let entityName, val;
            [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
            if (val.indexOf("&") === -1) {
              if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                throw new Error(
                  `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                );
              }
              entities[entityName] = val;
              entityCount++;
            }
          } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
            i += 8;
            const { index } = this.readElementExp(xmlData, i + 1);
            i = index;
          } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
            i += 8;
          } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
            i += 9;
            const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
            i = index;
          } else if (hasSeq(xmlData, "!--", i)) comment = true;
          else throw new Error(`Invalid DOCTYPE`);
          angleBracketsCount++;
          exp = "";
        } else if (xmlData[i] === ">") {
          if (comment) {
            if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
              comment = false;
              angleBracketsCount--;
            }
          } else {
            angleBracketsCount--;
          }
          if (angleBracketsCount === 0) {
            break;
          }
        } else if (xmlData[i] === "[") {
          hasBody = true;
        } else {
          exp += xmlData[i];
        }
      }
      if (quoteChar !== null || angleBracketsCount !== 0) {
        throw new Error(`Unclosed DOCTYPE`);
      }
    } else {
      throw new Error(`Invalid Tag instead of DOCTYPE`);
    }
    return { entities, i };
  }
  readEntityExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    const startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
      i++;
    }
    let entityName = xmlData.substring(startIndex, i);
    validateEntityName2(entityName, { xmlVersion: this.xmlVersion });
    i = skipWhitespace(xmlData, i);
    if (!this.suppressValidationErr) {
      if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
        throw new Error("External entities are not supported");
      } else if (xmlData[i] === "%") {
        throw new Error("Parameter entities are not supported");
      }
    }
    let entityValue = "";
    [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
    if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
      throw new Error(
        `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
      );
    }
    i--;
    return [entityName, entityValue, i];
  }
  readNotationExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    const startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let notationName = xmlData.substring(startIndex, i);
    !this.suppressValidationErr && validateEntityName2(notationName, { xmlVersion: this.xmlVersion });
    i = skipWhitespace(xmlData, i);
    const identifierType = xmlData.substring(i, i + 6).toUpperCase();
    if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
      throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
    }
    i += identifierType.length;
    i = skipWhitespace(xmlData, i);
    let publicIdentifier = null;
    let systemIdentifier = null;
    if (identifierType === "PUBLIC") {
      [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
      i = skipWhitespace(xmlData, i);
      if (xmlData[i] === '"' || xmlData[i] === "'") {
        [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
      }
    } else if (identifierType === "SYSTEM") {
      [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
      if (!this.suppressValidationErr && !systemIdentifier) {
        throw new Error("Missing mandatory system identifier for SYSTEM notation");
      }
    }
    return { notationName, publicIdentifier, systemIdentifier, index: --i };
  }
  readIdentifierVal(xmlData, i, type) {
    let identifierVal = "";
    const startChar = xmlData[i];
    if (startChar !== '"' && startChar !== "'") {
      throw new Error(`Expected quoted string, found "${startChar}"`);
    }
    i++;
    const startIndex = i;
    while (i < xmlData.length && xmlData[i] !== startChar) {
      i++;
    }
    identifierVal = xmlData.substring(startIndex, i);
    if (xmlData[i] !== startChar) {
      throw new Error(`Unterminated ${type} value`);
    }
    i++;
    return [i, identifierVal];
  }
  readElementExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    const startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let elementName = xmlData.substring(startIndex, i);
    if (!this.suppressValidationErr && !qName(elementName, { xmlVersion: this.xmlVersion })) {
      throw new Error(`Invalid element name: "${elementName}"`);
    }
    i = skipWhitespace(xmlData, i);
    let contentModel = "";
    if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
    else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
    else if (xmlData[i] === "(") {
      i++;
      const startIndex2 = i;
      while (i < xmlData.length && xmlData[i] !== ")") {
        i++;
      }
      contentModel = xmlData.substring(startIndex2, i);
      if (xmlData[i] !== ")") {
        throw new Error("Unterminated content model");
      }
    } else if (!this.suppressValidationErr) {
      throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
    }
    return {
      elementName,
      contentModel: contentModel.trim(),
      index: i
    };
  }
  readAttlistExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    let startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let elementName = xmlData.substring(startIndex, i);
    validateEntityName2(elementName, { xmlVersion: this.xmlVersion });
    i = skipWhitespace(xmlData, i);
    startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let attributeName = xmlData.substring(startIndex, i);
    if (!validateEntityName2(attributeName, { xmlVersion: this.xmlVersion })) {
      throw new Error(`Invalid attribute name: "${attributeName}"`);
    }
    i = skipWhitespace(xmlData, i);
    let attributeType = "";
    if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
      attributeType = "NOTATION";
      i += 8;
      i = skipWhitespace(xmlData, i);
      if (xmlData[i] !== "(") {
        throw new Error(`Expected '(', found "${xmlData[i]}"`);
      }
      i++;
      let allowedNotations = [];
      while (i < xmlData.length && xmlData[i] !== ")") {
        const startIndex2 = i;
        while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
          i++;
        }
        let notation = xmlData.substring(startIndex2, i);
        notation = notation.trim();
        if (!validateEntityName2(notation, { xmlVersion: this.xmlVersion })) {
          throw new Error(`Invalid notation name: "${notation}"`);
        }
        allowedNotations.push(notation);
        if (xmlData[i] === "|") {
          i++;
          i = skipWhitespace(xmlData, i);
        }
      }
      if (xmlData[i] !== ")") {
        throw new Error("Unterminated list of notations");
      }
      i++;
      attributeType += " (" + allowedNotations.join("|") + ")";
    } else {
      const startIndex2 = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      attributeType += xmlData.substring(startIndex2, i);
      const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
      if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
        throw new Error(`Invalid attribute type: "${attributeType}"`);
      }
    }
    i = skipWhitespace(xmlData, i);
    let defaultValue = "";
    if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
      defaultValue = "#REQUIRED";
      i += 8;
    } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
      defaultValue = "#IMPLIED";
      i += 7;
    } else {
      [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
    }
    return {
      elementName,
      attributeName,
      attributeType,
      defaultValue,
      index: i
    };
  }
};
var skipWhitespace = (data, index) => {
  while (index < data.length && /\s/.test(data[index])) {
    index++;
  }
  return index;
};
function hasSeq(data, seq, i) {
  for (let j = 0; j < seq.length; j++) {
    if (seq[j] !== data[i + j + 1]) return false;
  }
  return true;
}
function validateEntityName2(name, xmlVersion) {
  if (qName(name, { xmlVersion }))
    return name;
  else
    throw new Error(`Invalid entity name ${name}`);
}

// node_modules/anynum/digitTable.js
var SCRIPT_ZEROS = [
  // Basic Latin (ASCII) — included for completeness / pass-through
  48,
  // 0-9
  // Arabic scripts
  1632,
  // Arabic-Indic ٠١٢٣٤٥٦٧٨٩
  1776,
  // Extended Arabic-Indic (Urdu/Persian/Sindhi) ۰۱۲۳
  // Indic scripts
  2406,
  // Devanagari ०१२३४५६७८९
  2534,
  // Bengali ০১২৩৪৫৬৭৮৯
  2662,
  // Gurmukhi ੦੧੨੩੪੫੬੭੮੯
  2790,
  // Gujarati ૦૧૨૩૪૫૬૭૮૯
  2918,
  // Odia ୦୧୨୩୪୫୬୭୮୯
  3046,
  // Tamil ௦௧௨௩௪௫௬௭௮௯
  3174,
  // Telugu ౦౧౨౩౪౫౬౭౮౯
  3302,
  // Kannada ೦೧೨೩೪೫೬೭೮೯
  3430,
  // Malayalam ൦൧൨൩൪൫൬൭൮൯
  3558,
  // Sinhala Archaic ෦෧෨෩෪෫෬෭෮෯
  // Southeast Asian scripts
  3664,
  // Thai ๐๑๒๓๔๕๖๗๘๙
  3792,
  // Lao ໐໑໒໓໔໕໖໗໘໙
  3872,
  // Tibetan ༠༡༢༣༤༥༦༧༨༩
  4160,
  // Myanmar ၀၁၂၃၄၅၆၇၈၉
  4240,
  // Myanmar Shan ႐႑႒႓႔႕႖႗႘႙
  6112,
  // Khmer ០១២៣៤៥៦៧៨៩
  6160,
  // Mongolian ᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙
  6470,
  // Limbu ᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏
  6608,
  // New Tai Lue ᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙
  6784,
  // Tai Tham Hora ᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉
  6800,
  // Tai Tham Tham ᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙
  6992,
  // Balinese ᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙
  7088,
  // Sundanese ᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹
  7232,
  // Lepcha ᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉
  7248,
  // Ol Chiki ᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙
  // Fullwidth (CJK context)
  65296,
  // Fullwidth ０１２３４５６７８９
  // Mathematical digit variants (Unicode math block)
  120782,
  // Mathematical Bold
  120792,
  // Mathematical Double-Struck
  120802,
  // Mathematical Sans-Serif
  120812,
  // Mathematical Sans-Serif Bold
  120822,
  // Mathematical Monospace
  // Other scripts
  66720,
  // Osmanya 𐒠𐒡𐒢𐒣𐒤𐒥𐒦𐒧𐒨𐒩
  68912,
  // Hanifi Rohingya 𐴰𐴱𐴲𐴳𐴴𐴵𐴶𐴷𐴸𐴹
  69734,
  // Brahmi 𑁦𑁧𑁨𑁩𑁪𑁫𑁬𑁭𑁮𑁯
  69872,
  // Sora Sompeng 𑃰𑃱𑃲𑃳𑃴𑃵𑃶𑃷𑃸𑃹
  69942,
  // Chakma 𑄶𑄷𑄸𑄹𑄺𑄻𑄼𑄽𑄾𑄿
  70096,
  // Sharada 𑇐𑇑𑇒𑇓𑇔𑇕𑇖𑇗𑇘𑇙
  70384,
  // Khudawadi 𑋰𑋱𑋲𑋳𑋴𑋵𑋶𑋷𑋸𑋹
  70736,
  // Newa 𑑐𑑑𑑒𑑓𑑔𑑕𑑖𑑗𑑘𑑙
  70864,
  // Tirhuta 𑓐𑓑𑓒𑓓𑓔𑓕𑓖𑓗𑓘𑓙
  71248,
  // Modi 𑙐𑙑𑙒𑙓𑙔𑙕𑙖𑙗𑙘𑙙
  71360,
  // Takri 𑛀𑛁𑛂𑛃𑛄𑛅𑛆𑛇𑛈𑛉
  71472,
  // Ahom 𑜰𑜱𑜲𑜳𑜴𑜵𑜶𑜷𑜸𑜹
  71904,
  // Warang Citi 𑣠𑣡𑣢𑣣𑣤𑣥𑣦𑣧𑣨𑣩
  72016,
  // Dives Akuru 𑥐𑥑𑥒𑥓𑥔𑥕𑥖𑥗𑥘𑥙
  72688,
  // Khitan Small Script 𑯰𑯱𑯲𑯳𑯴𑯵𑯶𑯷𑯸𑯹
  72784,
  // Bhaiksuki 𑱐𑱑𑱒𑱓𑱔𑱕𑱖𑱗𑱘𑱙
  73040,
  // Masaram Gondi 𑵐𑵑𑵒𑵓𑵔𑵕𑵖𑵗𑵘𑵙
  73120,
  // Gunjala Gondi 𑶠𑶡𑶢𑶣𑶤𑶥𑶦𑶧𑶨𑶩
  73552,
  // Kawi 𑽐𑽑𑽒𑽓𑽔𑽕𑽖𑽗𑽘𑽙
  92768,
  // Mro 𖩠𖩡𖩢𖩣𖩤𖩥𖩦𖩧𖩨𖩩
  92864,
  // Tangsa 𖫀𖫁𖫂𖫃𖫄𖫅𖫆𖫇𖫈𖫉
  93008,
  // Pahawh Hmong 𖭐𖭑𖭒𖭓𖭔𖭕𖭖𖭗𖭘𖭙
  123200,
  // Nyiakeng Puachue Hmong 𞅀𞅁𞅂𞅃𞅄𞅅𞅆𞅇𞅈𞅉
  123632,
  // Wancho 𞋰𞋱𞋲𞋳𞋴𞋵𞋶𞋷𞋸𞋹
  124144,
  // Nag Mundari 𞓰𞓱𞓲𞓳𞓴𞓵𞓶𞓷𞓸𞓹
  125264,
  // Adlam 𞥐𞥑𞥒𞥓𞥔𞥕𞥖𞥗𞥘𞥙
  130032
  // Segmented digit symbols 🯰🯱🯲🯳🯴🯵🯶🯷🯸🯹
];
var NOT_DIGIT = 255;
var HIGH_MAP = /* @__PURE__ */ new Map();
var LOW_MAX = 65535;
var LOW_MIN = 1632;
var TABLE_OFFSET = LOW_MIN;
var TABLE_SIZE = LOW_MAX - LOW_MIN + 1;
var TABLE = new Uint8Array(TABLE_SIZE).fill(NOT_DIGIT);
for (const zero of SCRIPT_ZEROS) {
  for (let d = 0; d < 10; d++) {
    const cp = zero + d;
    if (cp <= LOW_MAX) {
      TABLE[cp - TABLE_OFFSET] = d;
    } else {
      HIGH_MAP.set(cp, d);
    }
  }
}

// node_modules/anynum/anynum.js
var CHAR_0 = 48;
var CHAR_9 = 57;
var CHAR_MINUS = 45;
var MINUS_SET = /* @__PURE__ */ new Set([8722, 65293, 65123]);
function anynum(str) {
  if (typeof str !== "string") return str;
  const len = str.length;
  if (len === 0) return str;
  let firstHit = -1;
  for (let i = 0; i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) continue;
    if (cc < TABLE_OFFSET) {
      if (MINUS_SET.has(cc)) {
        firstHit = i;
        break;
      }
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          if (HIGH_MAP.has(cp)) {
            firstHit = i;
            break;
          }
        }
      }
      continue;
    }
    if (TABLE[cc - TABLE_OFFSET] !== NOT_DIGIT || MINUS_SET.has(cc)) {
      firstHit = i;
      break;
    }
  }
  if (firstHit === -1) return str;
  const chars = [];
  if (firstHit > 0) chars.push(str.slice(0, firstHit));
  for (let i = firstHit; i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) {
      chars.push(str[i]);
      continue;
    }
    if (cc < TABLE_OFFSET) {
      chars.push(MINUS_SET.has(cc) ? "-" : str[i]);
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          const d2 = HIGH_MAP.get(cp);
          if (d2 !== void 0) {
            chars.push(String.fromCharCode(d2 + 48));
            i++;
            continue;
          }
        }
      }
      chars.push(str[i]);
      continue;
    }
    if (MINUS_SET.has(cc)) {
      chars.push("-");
      continue;
    }
    const d = TABLE[cc - TABLE_OFFSET];
    chars.push(d !== NOT_DIGIT ? String.fromCharCode(d + 48) : str[i]);
  }
  return chars.join("");
}
var anynum_default = anynum;

// node_modules/strnum/strnum.js
var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
var binRegex = /^0b[01]+$/;
var octRegex = /^0o[0-7]+$/;
var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
var consider = {
  hex: true,
  binary: false,
  octal: false,
  leadingZeros: true,
  decimalPoint: ".",
  eNotation: true,
  //skipLike: /regex/,
  infinity: "original",
  // "null", "infinity" (Infinity type), "string" ("Infinity" (the string literal))
  unicode: false
};
function toNumber(str, options = {}) {
  options = Object.assign({}, consider, options);
  if (!str || typeof str !== "string") return str;
  let trimmedStr = str.trim();
  if (trimmedStr.length === 0) return str;
  else if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
  else if (trimmedStr === "0") return 0;
  if (options.unicode) {
    trimmedStr = anynum_default(trimmedStr);
    if (trimmedStr === "0") return 0;
  }
  if (options.hex && hexRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 16);
  } else if (options.binary && binRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 2);
  } else if (options.octal && octRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 8);
  } else if (!isFinite(trimmedStr)) {
    return handleInfinity(str, Number(trimmedStr), options);
  } else if (trimmedStr.includes("e") || trimmedStr.includes("E")) {
    return resolveEnotation(str, trimmedStr, options);
  } else {
    const match = numRegex.exec(trimmedStr);
    if (match) {
      const sign = match[1] || "";
      const leadingZeros = match[2];
      let numTrimmedByZeros = trimZeros(match[3]);
      const decimalAdjacentToLeadingZeros = sign ? (
        // 0., -00., 000.
        str[leadingZeros.length + 1] === "."
      ) : str[leadingZeros.length] === ".";
      if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) {
        return str;
      } else {
        const num = Number(trimmedStr);
        const parsedStr = String(num);
        if (num === 0) return num;
        if (parsedStr.search(/[eE]/) !== -1) {
          if (options.eNotation) return num;
          else return str;
        } else if (trimmedStr.indexOf(".") !== -1) {
          if (parsedStr === "0") return num;
          else if (parsedStr === numTrimmedByZeros) return num;
          else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
          else return str;
        }
        let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
        if (leadingZeros) {
          return n === parsedStr || sign + n === parsedStr ? num : str;
        } else {
          return n === parsedStr || n === sign + parsedStr ? num : str;
        }
      }
    } else {
      return str;
    }
  }
}
var eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
function resolveEnotation(str, trimmedStr, options) {
  if (!options.eNotation) return str;
  const notation = trimmedStr.match(eNotationRegx);
  if (notation) {
    let sign = notation[1] || "";
    const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
    const leadingZeros = notation[2];
    const eAdjacentToLeadingZeros = sign ? (
      // 0E.
      str[leadingZeros.length + 1] === eChar
    ) : str[leadingZeros.length] === eChar;
    if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
    else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
      return Number(trimmedStr);
    } else if (leadingZeros.length > 0) {
      if (options.leadingZeros && !eAdjacentToLeadingZeros) {
        trimmedStr = (notation[1] || "") + notation[3];
        return Number(trimmedStr);
      } else return str;
    } else {
      return Number(trimmedStr);
    }
  } else {
    return str;
  }
}
function trimZeros(numStr) {
  if (numStr && numStr.indexOf(".") !== -1) {
    let end = numStr.length;
    while (end > 0 && numStr.charCodeAt(end - 1) === 48) end--;
    numStr = numStr.slice(0, end);
    if (numStr === ".") numStr = "0";
    else if (numStr[0] === ".") numStr = "0" + numStr;
    else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
    return numStr;
  }
  return numStr;
}
function parse_int(numStr, base) {
  const str = numStr.trim();
  if (base === 2 || base === 8) numStr = str.substring(2);
  if (parseInt) return parseInt(numStr, base);
  else if (Number.parseInt) return Number.parseInt(numStr, base);
  else if (window && window.parseInt) return window.parseInt(numStr, base);
  else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}
function handleInfinity(str, num, options) {
  const isPositive = num === Infinity;
  switch (options.infinity.toLowerCase()) {
    case "null":
      return null;
    case "infinity":
      return num;
    // Return Infinity or -Infinity
    case "string":
      return isPositive ? "Infinity" : "-Infinity";
    case "original":
    default:
      return str;
  }
}

// node_modules/fast-xml-parser/src/ignoreAttributes.js
function getIgnoreAttributesFn(ignoreAttributes) {
  if (typeof ignoreAttributes === "function") {
    return ignoreAttributes;
  }
  if (Array.isArray(ignoreAttributes)) {
    return (attrName) => {
      for (const pattern of ignoreAttributes) {
        if (typeof pattern === "string" && attrName === pattern) {
          return true;
        }
        if (pattern instanceof RegExp && pattern.test(attrName)) {
          return true;
        }
      }
    };
  }
  return () => false;
}

// node_modules/path-expression-matcher/src/Expression.js
var Expression = class {
  /**
   * Create a new Expression
   * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
   * @param {Object} options - Configuration options
   * @param {string} options.separator - Path separator (default: '.')
   */
  constructor(pattern, options = {}, data) {
    this.pattern = pattern;
    this.separator = options.separator || ".";
    this.segments = this._parse(pattern);
    this.data = data;
    this._hasDeepWildcard = this.segments.some((seg) => seg.type === "deep-wildcard");
    this._hasAttributeCondition = this.segments.some((seg) => seg.attrName !== void 0);
    this._hasPositionSelector = this.segments.some((seg) => seg.position !== void 0);
  }
  /**
   * Parse pattern string into segments
   * @private
   * @param {string} pattern - Pattern to parse
   * @returns {Array} Array of segment objects
   */
  _parse(pattern) {
    const segments = [];
    let i = 0;
    let currentPart = "";
    while (i < pattern.length) {
      if (pattern[i] === this.separator) {
        if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
            currentPart = "";
          }
          segments.push({ type: "deep-wildcard" });
          i += 2;
        } else {
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
          }
          currentPart = "";
          i++;
        }
      } else {
        currentPart += pattern[i];
        i++;
      }
    }
    if (currentPart.trim()) {
      segments.push(this._parseSegment(currentPart.trim()));
    }
    return segments;
  }
  /**
   * Parse a single segment
   * @private
   * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
   * @returns {Object} Segment object
   */
  _parseSegment(part) {
    const segment = { type: "tag" };
    let bracketContent = null;
    let withoutBrackets = part;
    const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
    if (bracketMatch) {
      withoutBrackets = bracketMatch[1] + bracketMatch[3];
      if (bracketMatch[2]) {
        const content = bracketMatch[2].slice(1, -1);
        if (content) {
          bracketContent = content;
        }
      }
    }
    let namespace = void 0;
    let tagAndPosition = withoutBrackets;
    if (withoutBrackets.includes("::")) {
      const nsIndex = withoutBrackets.indexOf("::");
      namespace = withoutBrackets.substring(0, nsIndex).trim();
      tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim();
      if (!namespace) {
        throw new Error(`Invalid namespace in pattern: ${part}`);
      }
    }
    let tag = void 0;
    let positionMatch = null;
    if (tagAndPosition.includes(":")) {
      const colonIndex = tagAndPosition.lastIndexOf(":");
      const tagPart = tagAndPosition.substring(0, colonIndex).trim();
      const posPart = tagAndPosition.substring(colonIndex + 1).trim();
      const isPositionKeyword = ["first", "last", "odd", "even"].includes(posPart) || /^nth\(\d+\)$/.test(posPart);
      if (isPositionKeyword) {
        tag = tagPart;
        positionMatch = posPart;
      } else {
        tag = tagAndPosition;
      }
    } else {
      tag = tagAndPosition;
    }
    if (!tag) {
      throw new Error(`Invalid segment pattern: ${part}`);
    }
    segment.tag = tag;
    if (namespace) {
      segment.namespace = namespace;
    }
    if (bracketContent) {
      if (bracketContent.includes("=")) {
        const eqIndex = bracketContent.indexOf("=");
        segment.attrName = bracketContent.substring(0, eqIndex).trim();
        segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
      } else {
        segment.attrName = bracketContent.trim();
      }
    }
    if (positionMatch) {
      const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
      if (nthMatch) {
        segment.position = "nth";
        segment.positionValue = parseInt(nthMatch[1], 10);
      } else {
        segment.position = positionMatch;
      }
    }
    return segment;
  }
  /**
   * Get the number of segments
   * @returns {number}
   */
  get length() {
    return this.segments.length;
  }
  /**
   * Check if expression contains deep wildcard
   * @returns {boolean}
   */
  hasDeepWildcard() {
    return this._hasDeepWildcard;
  }
  /**
   * Check if expression has attribute conditions
   * @returns {boolean}
   */
  hasAttributeCondition() {
    return this._hasAttributeCondition;
  }
  /**
   * Check if expression has position selectors
   * @returns {boolean}
   */
  hasPositionSelector() {
    return this._hasPositionSelector;
  }
  /**
   * Get string representation
   * @returns {string}
   */
  toString() {
    return this.pattern;
  }
};

// node_modules/path-expression-matcher/src/ExpressionSet.js
var ExpressionSet = class {
  constructor() {
    this._byDepthAndTag = /* @__PURE__ */ new Map();
    this._wildcardByDepth = /* @__PURE__ */ new Map();
    this._deepWildcards = [];
    this._deepByTerminalTag = /* @__PURE__ */ new Map();
    this._patterns = /* @__PURE__ */ new Set();
    this._sealed = false;
  }
  /**
   * Add an Expression to the set.
   * Duplicate patterns (same pattern string) are silently ignored.
   *
   * @param {import('./Expression.js').default} expression - A pre-constructed Expression instance
   * @returns {this} for chaining
   * @throws {TypeError} if called after seal()
   *
   * @example
   * set.add(new Expression('root.users.user'));
   * set.add(new Expression('..script'));
   */
  add(expression) {
    if (this._sealed) {
      throw new TypeError(
        "ExpressionSet is sealed. Create a new ExpressionSet to add more expressions."
      );
    }
    if (this._patterns.has(expression.pattern)) return this;
    this._patterns.add(expression.pattern);
    if (expression.hasDeepWildcard()) {
      const lastSeg2 = expression.segments[expression.segments.length - 1];
      if (lastSeg2 && lastSeg2.type !== "deep-wildcard" && lastSeg2.tag !== "*") {
        const tag2 = lastSeg2.tag;
        if (!this._deepByTerminalTag.has(tag2)) this._deepByTerminalTag.set(tag2, []);
        this._deepByTerminalTag.get(tag2).push(expression);
      } else {
        this._deepWildcards.push(expression);
      }
      return this;
    }
    const depth = expression.length;
    const lastSeg = expression.segments[expression.segments.length - 1];
    const tag = lastSeg?.tag;
    if (!tag || tag === "*") {
      if (!this._wildcardByDepth.has(depth)) this._wildcardByDepth.set(depth, []);
      this._wildcardByDepth.get(depth).push(expression);
    } else {
      const key = `${depth}:${tag}`;
      if (!this._byDepthAndTag.has(key)) this._byDepthAndTag.set(key, []);
      this._byDepthAndTag.get(key).push(expression);
    }
    return this;
  }
  /**
   * Add multiple expressions at once.
   *
   * @param {import('./Expression.js').default[]} expressions - Array of Expression instances
   * @returns {this} for chaining
   *
   * @example
   * set.addAll([
   *   new Expression('root.users.user'),
   *   new Expression('root.config.setting'),
   * ]);
   */
  addAll(expressions) {
    for (const expr of expressions) this.add(expr);
    return this;
  }
  /**
   * Check whether a pattern string is already present in the set.
   *
   * @param {import('./Expression.js').default} expression
   * @returns {boolean}
   */
  has(expression) {
    return this._patterns.has(expression.pattern);
  }
  /**
   * Number of expressions in the set.
   * @type {number}
   */
  get size() {
    return this._patterns.size;
  }
  /**
   * Seal the set against further modifications.
   * Useful to prevent accidental mutations after config is built.
   * Calling add() or addAll() on a sealed set throws a TypeError.
   *
   * @returns {this}
   */
  seal() {
    this._sealed = true;
    return this;
  }
  /**
   * Whether the set has been sealed.
   * @type {boolean}
   */
  get isSealed() {
    return this._sealed;
  }
  /**
   * Test whether the matcher's current path matches any expression in the set.
   *
   * Evaluation order (cheapest → most expensive):
   *  1. Exact depth + tag bucket  — O(1) lookup, typically 0–2 expressions
   *  2. Depth-only wildcard bucket — O(1) lookup, rare
   *  3. Deep-wildcard list         — always checked, but usually small
   *
   * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
   * @returns {boolean} true if any expression matches the current path
   *
   * @example
   * if (stopNodes.matchesAny(matcher)) {
   *   // handle stop node
   * }
   */
  matchesAny(matcher) {
    return this.findMatch(matcher) !== null;
  }
  /**
  * Find and return the first Expression that matches the matcher's current path.
  *
  * Uses the same evaluation order as matchesAny (cheapest → most expensive):
  *  1. Exact depth + tag bucket
  *  2. Depth-only wildcard bucket
  *  3. Deep-wildcard list
  *
  * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
  * @returns {import('./Expression.js').default | null} the first matching Expression, or null
  *
  * @example
  * const expr = stopNodes.findMatch(matcher);
  * if (expr) {
  *   // access expr.config, expr.pattern, etc.
  * }
  */
  findMatch(matcher) {
    const depth = matcher.getDepth();
    const tag = matcher.getCurrentTag();
    const exactKey = `${depth}:${tag}`;
    const exactBucket = this._byDepthAndTag.get(exactKey);
    if (exactBucket) {
      for (let i = 0; i < exactBucket.length; i++) {
        if (matcher.matches(exactBucket[i])) return exactBucket[i];
      }
    }
    const wildcardBucket = this._wildcardByDepth.get(depth);
    if (wildcardBucket) {
      for (let i = 0; i < wildcardBucket.length; i++) {
        if (matcher.matches(wildcardBucket[i])) return wildcardBucket[i];
      }
    }
    const deepBucket = this._deepByTerminalTag.get(tag);
    if (deepBucket) {
      for (let i = 0; i < deepBucket.length; i++) {
        if (matcher.matches(deepBucket[i])) return deepBucket[i];
      }
    }
    for (let i = 0; i < this._deepWildcards.length; i++) {
      if (matcher.matches(this._deepWildcards[i])) return this._deepWildcards[i];
    }
    return null;
  }
};

// node_modules/path-expression-matcher/src/Matcher.js
var MatcherView = class {
  /**
   * @param {Matcher} matcher - The parent Matcher instance to read from.
   */
  constructor(matcher) {
    this._matcher = matcher;
  }
  /**
   * Get the path separator used by the parent matcher.
   * @returns {string}
   */
  get separator() {
    return this._matcher.separator;
  }
  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].tag : void 0;
  }
  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].namespace : void 0;
  }
  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return void 0;
    return path[path.length - 1].values?.[attrName];
  }
  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return false;
    const current = path[path.length - 1];
    return current.values !== void 0 && attrName in current.values;
  }
  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {*}
   */
  getAnyParentAttr(attrName) {
    return this._matcher.getAnyParentAttr(attrName);
  }
  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    return this._matcher.hasAnyParentAttr(attrName);
  }
  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].position ?? 0;
  }
  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].counter ?? 0;
  }
  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }
  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this._matcher.path.length;
  }
  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    return this._matcher.toString(separator, includeNamespace);
  }
  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this._matcher.path.map((n) => n.tag);
  }
  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    return this._matcher.matches(expression);
  }
  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this._matcher);
  }
};
var Matcher = class {
  /**
   * Create a new Matcher.
   * @param {Object} [options={}]
   * @param {string} [options.separator='.'] - Default path separator
   */
  constructor(options = {}) {
    this.separator = options.separator || ".";
    this.path = [];
    this.siblingStacks = [];
    this._pathStringCache = null;
    this._view = new MatcherView(this);
    this._keptAttrs = [];
  }
  /**
   * Push a new tag onto the path.
   * @param {string} tagName
   * @param {Object|null} [attrValues=null]
   * @param {string|null} [namespace=null]
   * @param {Object|null} [options=null]
   * @param {string[]} [options.keep] - Names of attributes (from attrValues)
   */
  push(tagName, attrValues = null, namespace = null, options = null) {
    this._pathStringCache = null;
    if (this.path.length > 0) {
      this.path[this.path.length - 1].values = void 0;
    }
    const currentLevel = this.path.length;
    let level = this.siblingStacks[currentLevel];
    if (!level) {
      level = { counts: /* @__PURE__ */ new Map(), total: 0 };
      this.siblingStacks[currentLevel] = level;
    }
    const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;
    const counter = level.counts.get(siblingKey) || 0;
    const position2 = level.total;
    level.counts.set(siblingKey, counter + 1);
    level.total++;
    const node = {
      tag: tagName,
      position: position2,
      counter
    };
    if (namespace !== null && namespace !== void 0) {
      node.namespace = namespace;
    }
    if (attrValues !== null && attrValues !== void 0) {
      node.values = attrValues;
    }
    this.path.push(node);
    const depth = this.path.length;
    const keep = options !== null ? options.keep : null;
    if (keep !== null && keep !== void 0 && keep.length > 0 && attrValues) {
      for (let i = 0; i < keep.length; i++) {
        const name = keep[i];
        if (attrValues[name] !== void 0) {
          this._keptAttrs.push({ depth, name, value: attrValues[name] });
        }
      }
    }
  }
  /**
   * Pop the last tag from the path.
   * @returns {Object|undefined} The popped node
   */
  pop() {
    if (this.path.length === 0) return void 0;
    this._pathStringCache = null;
    const node = this.path.pop();
    if (this.siblingStacks.length > this.path.length + 1) {
      this.siblingStacks.length = this.path.length + 1;
    }
    const poppedDepth = this.path.length + 1;
    while (this._keptAttrs.length > 0 && this._keptAttrs[this._keptAttrs.length - 1].depth >= poppedDepth) {
      this._keptAttrs.pop();
    }
    return node;
  }
  /**
   * Update current node's attribute values.
   * Useful when attributes are parsed after push.
   * @param {Object} attrValues
   */
  updateCurrent(attrValues) {
    if (this.path.length > 0) {
      const current = this.path[this.path.length - 1];
      if (attrValues !== null && attrValues !== void 0) {
        current.values = attrValues;
      }
    }
  }
  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    return this.path.length > 0 ? this.path[this.path.length - 1].tag : void 0;
  }
  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    return this.path.length > 0 ? this.path[this.path.length - 1].namespace : void 0;
  }
  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    if (this.path.length === 0) return void 0;
    return this.path[this.path.length - 1].values?.[attrName];
  }
  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    if (this.path.length === 0) return false;
    const current = this.path[this.path.length - 1];
    return current.values !== void 0 && attrName in current.values;
  }
  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * Unlike getAttrValue(), this works regardless of how deep the path has
   * gone since the attribute was pushed — but only for attribute names that
   * were explicitly marked with `keep` at push time. Cost is proportional to
   * the number of currently-kept attributes (typically 0-3), not path depth.
   * @param {string} attrName
   * @returns {*} the value, or undefined if no ancestor kept this attribute
   */
  getAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return kept[i].value;
    }
    return void 0;
  }
  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return true;
    }
    return false;
  }
  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].position ?? 0;
  }
  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].counter ?? 0;
  }
  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }
  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this.path.length;
  }
  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    const sep2 = separator || this.separator;
    const isDefault = sep2 === this.separator && includeNamespace === true;
    if (isDefault) {
      if (this._pathStringCache !== null) {
        return this._pathStringCache;
      }
      const result = this.path.map(
        (n) => n.namespace ? `${n.namespace}:${n.tag}` : n.tag
      ).join(sep2);
      this._pathStringCache = result;
      return result;
    }
    return this.path.map(
      (n) => includeNamespace && n.namespace ? `${n.namespace}:${n.tag}` : n.tag
    ).join(sep2);
  }
  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this.path.map((n) => n.tag);
  }
  /**
   * Reset the path to empty.
   */
  reset() {
    this._pathStringCache = null;
    this.path = [];
    this.siblingStacks = [];
    this._keptAttrs = [];
  }
  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    const segments = expression.segments;
    if (segments.length === 0) {
      return false;
    }
    if (expression.hasDeepWildcard()) {
      return this._matchWithDeepWildcard(segments);
    }
    return this._matchSimple(segments);
  }
  /**
   * @private
   */
  _matchSimple(segments) {
    if (this.path.length !== segments.length) {
      return false;
    }
    for (let i = 0; i < segments.length; i++) {
      if (!this._matchSegment(segments[i], this.path[i], i === this.path.length - 1)) {
        return false;
      }
    }
    return true;
  }
  /**
   * @private
   */
  _matchWithDeepWildcard(segments) {
    let pathIdx = this.path.length - 1;
    let segIdx = segments.length - 1;
    while (segIdx >= 0 && pathIdx >= 0) {
      const segment = segments[segIdx];
      if (segment.type === "deep-wildcard") {
        segIdx--;
        if (segIdx < 0) {
          return true;
        }
        const nextSeg = segments[segIdx];
        let found = false;
        for (let i = pathIdx; i >= 0; i--) {
          if (this._matchSegment(nextSeg, this.path[i], i === this.path.length - 1)) {
            pathIdx = i - 1;
            segIdx--;
            found = true;
            break;
          }
        }
        if (!found) {
          return false;
        }
      } else {
        if (!this._matchSegment(segment, this.path[pathIdx], pathIdx === this.path.length - 1)) {
          return false;
        }
        pathIdx--;
        segIdx--;
      }
    }
    return segIdx < 0;
  }
  /**
   * @private
   */
  _matchSegment(segment, node, isCurrentNode) {
    if (segment.tag !== "*" && segment.tag !== node.tag) {
      return false;
    }
    if (segment.namespace !== void 0) {
      if (segment.namespace !== "*" && segment.namespace !== node.namespace) {
        return false;
      }
    }
    if (segment.attrName !== void 0) {
      if (!isCurrentNode) {
        return false;
      }
      if (!node.values || !(segment.attrName in node.values)) {
        return false;
      }
      if (segment.attrValue !== void 0) {
        if (String(node.values[segment.attrName]) !== String(segment.attrValue)) {
          return false;
        }
      }
    }
    if (segment.position !== void 0) {
      if (!isCurrentNode) {
        return false;
      }
      const counter = node.counter ?? 0;
      if (segment.position === "first" && counter !== 0) {
        return false;
      } else if (segment.position === "odd" && counter % 2 !== 1) {
        return false;
      } else if (segment.position === "even" && counter % 2 !== 0) {
        return false;
      } else if (segment.position === "nth" && counter !== segment.positionValue) {
        return false;
      }
    }
    return true;
  }
  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this);
  }
  /**
   * Create a snapshot of current state.
   * @returns {Object}
   */
  snapshot() {
    return {
      path: this.path.map((node) => ({ ...node })),
      siblingStacks: this.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level),
      keptAttrs: this._keptAttrs.map((entry) => ({ ...entry }))
    };
  }
  /**
   * Restore state from snapshot.
   * @param {Object} snapshot
   */
  restore(snapshot) {
    this._pathStringCache = null;
    this.path = snapshot.path.map((node) => ({ ...node }));
    this.siblingStacks = snapshot.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level);
    this._keptAttrs = (snapshot.keptAttrs || []).map((entry) => ({ ...entry }));
  }
  /**
   * Return the read-only {@link MatcherView} for this matcher.
   *
   * The same instance is returned on every call — no allocation occurs.
   * It always reflects the current parser state and is safe to pass to
   * user callbacks without risk of accidental mutation.
   *
   * @returns {MatcherView}
   *
   * @example
   * const view = matcher.readOnly();
   * // pass view to callbacks — it stays in sync automatically
   * view.matches(expr);       // ✓
   * view.getCurrentTag();     // ✓
   * // view.push(...)         // ✗ method does not exist — caught by TypeScript
   */
  readOnly() {
    return this._view;
  }
};

// node_modules/is-unsafe/src/contexts/html.js
var HTML_PATTERNS = [
  {
    id: "html-script-open",
    description: "<script opening tag",
    pattern: /<script[\s>/]/i
  },
  {
    id: "html-script-close",
    description: "</script closing tag",
    pattern: /<\/script[\s>]/i
  },
  {
    id: "html-javascript-protocol",
    description: "javascript: URI scheme (with optional whitespace/encoding)",
    // Handles j&#x61;vascript:, j\u0061vascript:, and whitespace variants
    pattern: /j[\t\n\r ]*a[\t\n\r ]*v[\t\n\r ]*a[\t\n\r ]*s[\t\n\r ]*c[\t\n\r ]*r[\t\n\r ]*i[\t\n\r ]*p[\t\n\r ]*t[\t\n\r ]*:/i
  },
  {
    id: "html-vbscript-protocol",
    description: "vbscript: URI scheme",
    pattern: /vbscript[\t\n\r ]*:/i
  },
  {
    id: "html-data-html",
    description: "data:text/html URI \u2014 can execute scripts in browsers",
    pattern: /data[\t\n\r ]*:[\t\n\r ]*text\/html/i
  },
  {
    id: "html-data-xhtml",
    description: "data:application/xhtml+xml URI",
    pattern: /data[\t\n\r ]*:[\t\n\r ]*application\/xhtml/i
  },
  {
    id: "html-data-svg",
    description: "data:image/svg+xml URI \u2014 can execute scripts",
    pattern: /data[\t\n\r ]*:[\t\n\r ]*image\/svg\+xml/i
  },
  {
    id: "html-inline-event-handler",
    description: "Inline event handler attributes: onclick=, onerror=, onload=, etc.",
    // \bon ensures we match a word boundary so "phonetic=" is not caught
    pattern: /\bon\w{1,30}\s*=/i
  },
  {
    id: "html-entity-obfuscated-script",
    description: "HTML-entity-encoded <script (e.g. &#x3C;script or &lt;script)",
    // Entities include optional trailing semicolon: &#x3C; or &#x3C (both valid in HTML5)
    pattern: /(?:&#x0*3[Cc];?|&#0*60;?|&lt;)\s*script/i
  },
  {
    id: "html-entity-obfuscated-javascript",
    description: 'HTML-entity-encoded javascript: (partial \u2014 catches common &#106; or &#x6a; for "j")',
    pattern: /(?:&#x0*6[Aa];?|&#0*106;?)\s*(?:&#x0*61;?|a)[\s\S]{0,80}script\s*:/i
  },
  {
    id: "html-style-expression",
    description: "CSS expression() \u2014 IE-era code execution in style attributes",
    pattern: /style[\s\S]{0,20}expression\s*\(/i
  },
  {
    id: "html-object-embed",
    description: "<object or <embed tags that can load active content",
    pattern: /<(?:object|embed)[\s>/]/i
  },
  {
    id: "html-base-tag",
    description: "<base href= \u2014 can hijack all relative URLs on a page",
    pattern: /<base[\s>]/i
  },
  {
    id: "html-meta-refresh",
    description: '<meta http-equiv="refresh" \u2014 can redirect users',
    pattern: /<meta[\s\S]{0,40}http-equiv[\s\S]{0,20}refresh/i
  },
  {
    id: "html-srcdoc",
    description: "srcdoc= attribute on iframes \u2014 embeds HTML that can run scripts",
    pattern: /srcdoc\s*=/i
  },
  {
    id: "html-iframe",
    description: "<iframe tag",
    pattern: /<iframe[\s>/]/i
  },
  {
    id: "html-form",
    description: "<form tag \u2014 can be used for phishing / credential harvesting injection",
    pattern: /<form[\s>/]/i
  }
];
var html_default = HTML_PATTERNS;

// node_modules/is-unsafe/src/contexts/xml.js
var XML_PATTERNS = [
  {
    id: "xml-cdata-injection",
    description: "CDATA section injection: <![CDATA[ breaks out of text node context",
    pattern: /<!\[CDATA\[/i
  },
  {
    id: "xml-cdata-close",
    description: "CDATA close sequence: ]]> can terminate an enclosing CDATA section",
    pattern: /\]\]>/
  },
  {
    id: "xml-processing-instruction",
    description: "XML processing instruction: <?xml-stylesheet or <?php etc.",
    pattern: /<\?(?:xml[\- ]|php|asp)/i
  },
  {
    id: "xml-doctype-injection",
    description: "DOCTYPE declaration embedded in content \u2014 can define entities",
    // Match <!DOCTYPE followed by end-of-string, whitespace, or [ (internal subset)
    pattern: /<!DOCTYPE(?:[\s[]|$)/i
  },
  {
    id: "xml-entity-system",
    description: "SYSTEM keyword \u2014 used in external entity declarations (XXE)",
    pattern: /\bSYSTEM\s+["']/i
  },
  {
    id: "xml-entity-public",
    description: "PUBLIC keyword \u2014 used in external entity declarations (XXE)",
    pattern: /\bPUBLIC\s+["']/i
  },
  {
    id: "xml-entity-declaration",
    description: "<!ENTITY declaration \u2014 defines entities, potential XXE or entity expansion",
    pattern: /<!ENTITY[\s%]/i
  },
  {
    id: "xml-billion-laughs",
    description: "Entity reference chaining / billion laughs: repeated &eX; style references",
    // Heuristic: 3+ consecutive entity refs suggests expansion attack
    pattern: /(?:&\w{1,20};){3,}/
  },
  {
    id: "xml-namespace-confusion",
    description: "xmlns: attribute injection \u2014 can redefine namespaces to confuse parsers",
    // pattern: /\bxmlns\s*(?::\w{1,40})?\s*=/i,
    pattern: /\bxmlns(?::\w{1,40})?\s*=/i
  },
  {
    id: "xml-comment-injection",
    description: "<!-- comment injection \u2014 can hide content from some parsers",
    pattern: /<!--/
  },
  {
    id: "xml-comment-close",
    description: "--> closes an enclosing XML comment",
    pattern: /-->/
  },
  {
    id: "xml-pi-close",
    description: "?> closes an enclosing processing instruction",
    pattern: /\?>/
  }
];
var xml_default = XML_PATTERNS;

// node_modules/is-unsafe/src/contexts/svg.js
var SVG_PATTERNS = [
  {
    id: "svg-script-element",
    description: "<script element inside SVG executes JavaScript",
    pattern: /<script[\s>/]/i
  },
  {
    id: "svg-xlink-href-javascript",
    description: "xlink:href with javascript: \u2014 classic SVG XSS via <a> or <use>",
    pattern: /xlink\s*:\s*href\s*=\s*["']?\s*javascript\s*:/i
  },
  {
    id: "svg-href-javascript",
    description: "href= with javascript: in SVG context (<a>, <animate>, etc.)",
    pattern: /href\s*=\s*["']?\s*javascript\s*:/i
  },
  {
    id: "svg-foreignobject",
    description: "<foreignObject embeds HTML inside SVG \u2014 can execute scripts",
    pattern: /<foreignObject[\s>/]/i
  },
  {
    id: "svg-use-external",
    description: "<use xlink:href or href pointing to external resource (non-fragment URL)",
    // Match <use with href= where the value starts with a non-# character (external URL)
    // [\"'][^#] catches quoted values not starting with #; [^\"'#\s>] catches unquoted
    pattern: /<use[\s\S]{0,60}(?:xlink\s*:\s*)?href\s*=\s*(?:["'][^#]|[^"'#\s>])/i
  },
  {
    id: "svg-animate-href",
    description: '<animate attributeName="href" \u2014 can dynamically change href to javascript:',
    pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*href["']/i
  },
  {
    id: "svg-animate-xlinkhref",
    description: '<animate attributeName="xlink:href"',
    pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*xlink\s*:\s*href["']/i
  },
  {
    id: "svg-set-javascript",
    description: '<set to="javascript:..." \u2014 sets an attribute to a javascript: URI',
    pattern: /<set[\s\S]{0,80}to\s*=\s*["']?\s*javascript\s*:/i
  },
  {
    id: "svg-event-handler",
    description: "SVG-specific event handler attributes: onload=, onerror=, onactivate=, etc.",
    pattern: /\bon(?:load|error|activate|begin|end|repeat|focus|blur|click|mouse\w{1,20}|key\w{1,20})\s*=/i
  },
  {
    id: "svg-handler-generic",
    description: "Generic on* handler catch-all for SVG attributes",
    pattern: /\bon\w{1,30}\s*=/i
  },
  {
    id: "svg-filter-feimage",
    description: "<feImage href= \u2014 filter primitive that can load external resources",
    pattern: /<feImage[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=/i
  },
  {
    id: "svg-image-external",
    description: "<image xlink:href with http/https or javascript protocol",
    pattern: /<image[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=\s*["']?\s*(?:https?|javascript)\s*:/i
  },
  {
    id: "svg-style-javascript",
    description: "style= attribute containing javascript: (e.g. background:url(javascript:...))",
    pattern: /style\s*=[\s\S]{0,60}javascript\s*:/i
  }
];
var svg_default = SVG_PATTERNS;

// node_modules/is-unsafe/src/contexts/sql.js
var SQL_PATTERNS = [
  {
    id: "sql-block-comment-open",
    description: "SQL block comment open: /* ... */ \u2014 unusual in legitimate user text",
    pattern: /\/\*/
  },
  {
    id: "sql-union-select",
    description: "UNION SELECT \u2014 most common SQL injection aggregation attack",
    pattern: /\bUNION\s{1,20}(?:ALL\s{1,20})?SELECT\b/i
  },
  {
    id: "sql-drop-table",
    description: "DROP TABLE \u2014 destructive DDL injection",
    pattern: /\bDROP\s{1,20}TABLE\b/i
  },
  {
    id: "sql-drop-database",
    description: "DROP DATABASE \u2014 destructive DDL injection",
    pattern: /\bDROP\s{1,20}DATABASE\b/i
  },
  {
    id: "sql-insert-into",
    description: "INSERT INTO \u2014 data injection",
    pattern: /\bINSERT\s{1,20}INTO\b/i
  },
  {
    id: "sql-delete-from",
    description: "DELETE FROM \u2014 data deletion injection",
    pattern: /\bDELETE\s{1,20}FROM\b/i
  },
  {
    id: "sql-update-set",
    description: "UPDATE ... SET \u2014 data modification injection",
    // Allows arbitrary content between UPDATE and SET (table name, alias, etc.)
    pattern: /\bUPDATE\b[\s\S]{1,60}\bSET\b/i
  },
  {
    id: "sql-exec-xp",
    description: "EXEC xp_ \u2014 MSSQL extended stored procedure execution",
    pattern: /\bEXEC(?:UTE)?\s{1,20}xp_/i
  },
  {
    id: "sql-tautology-string",
    description: `Classic string tautology: ' OR '1'='1 or " OR "1"="1"`,
    // Last quote is optional — injection may truncate it: ' OR '1'='1--
    pattern: /'\s{0,10}OR\s{0,10}'[^']{0,20}'\s*=\s*'[^']{0,20}/i
  },
  {
    id: "sql-tautology-numeric",
    description: "Numeric tautology: OR 1=1",
    pattern: /\bOR\s{1,10}1\s*=\s*1\b/i
  },
  {
    id: "sql-always-true-zero",
    description: "Numeric tautology: OR 0=0",
    pattern: /\bOR\s{1,10}0\s*=\s*0\b/i
  },
  {
    id: "sql-sleep-benchmark",
    description: "Time-based blind injection: SLEEP() or BENCHMARK()",
    pattern: /\b(?:SLEEP|BENCHMARK)\s*\(/i
  },
  {
    id: "sql-waitfor-delay",
    description: "MSSQL time-based blind injection: WAITFOR DELAY",
    pattern: /\bWAITFOR\s{1,20}DELAY\b/i
  },
  {
    id: "sql-char-function",
    description: "CHAR() function \u2014 used to obfuscate injected strings",
    pattern: /\bCHAR\s*\(\s*\d{1,3}/i
  },
  {
    id: "sql-information-schema",
    description: "INFORMATION_SCHEMA \u2014 reconnaissance query for table/column enumeration",
    pattern: /\bINFORMATION_SCHEMA\b/i
  }
];
var sql_default = SQL_PATTERNS;

// node_modules/is-unsafe/src/contexts/shell.js
var SHELL_PATTERNS = [
  {
    id: "shell-path-traversal-unix",
    description: "Unix path traversal: ../  \u2014 climbing the directory tree",
    pattern: /\.\.\//
  },
  {
    id: "shell-path-traversal-windows",
    description: "Windows path traversal: ..\\ \u2014 climbing the directory tree",
    pattern: /\.\.\\/
  },
  {
    id: "shell-path-traversal-encoded",
    description: "URL-encoded path traversal: %2e%2e or %2f variants",
    pattern: /%2e%2e|%2f\.\.|\.\.%2f/i
  },
  {
    id: "shell-null-byte",
    description: "Null byte injection: \\x00 or %00 \u2014 truncates strings in C-backed functions",
    pattern: /\x00|%00/
  },
  {
    id: "shell-semicolon",
    description: "Semicolon command separator: cmd1; cmd2",
    pattern: /;/
  },
  {
    id: "shell-pipe",
    description: "Pipe operator: cmd1 | cmd2",
    pattern: /\|/
  },
  {
    id: "shell-and-operator",
    description: "AND operator: cmd1 && cmd2",
    pattern: /&&/
  },
  {
    id: "shell-or-operator",
    description: "OR operator: cmd1 || cmd2",
    pattern: /\|\|/
  },
  {
    id: "shell-backtick",
    description: "Backtick command substitution: `cmd`",
    pattern: /`/
  },
  {
    id: "shell-dollar-paren",
    description: "Dollar-paren command substitution: $(cmd)",
    pattern: /\$\(/
  },
  {
    id: "shell-dollar-brace",
    description: "Dollar-brace variable expansion: ${var} \u2014 can be abused for injection",
    pattern: /\$\{/
  },
  {
    id: "shell-redirect-out",
    description: "Output redirection: cmd > file or cmd >> file",
    pattern: />{1,2}/
  },
  {
    id: "shell-redirect-in",
    description: "Input redirection: cmd < file",
    pattern: /</
  },
  {
    id: "shell-newline-injection",
    description: "Newline injection: \\n or \\r \u2014 can inject new shell commands",
    pattern: /[\n\r]/
  },
  {
    id: "shell-glob-star",
    description: "Glob expansion: * or ? \u2014 can expand to unintended files",
    // Only flag when combined with path separators to reduce false positives
    pattern: /[/\\][*?]/
  },
  {
    id: "shell-absolute-root",
    description: "Absolute root path injection: string starting with / or \\ (Windows UNC)",
    pattern: /^(?:\/|\\\\)/
  },
  {
    id: "shell-windows-drive",
    description: "Windows drive letter path injection: C:\\ or D:/",
    pattern: /^[a-zA-Z]:[/\\]/
  },
  {
    id: "shell-curl-wget",
    description: "curl/wget with URL or flags \u2014 can exfiltrate data or download payloads",
    // Require a URL scheme (http/https/ftp) or a flag (-) to reduce false positives
    // "curl is a tool" won't match; "curl http://..." or "curl -s ..." will
    pattern: /\b(?:curl|wget)\s+(?:https?:\/\/|ftp:\/\/|-)/i
  }
];
var shell_default = SHELL_PATTERNS;

// node_modules/is-unsafe/src/contexts/redos.js
var REDOS_PATTERNS = [
  {
    id: "redos-nested-quantifier-plus",
    description: "Nested + quantifier inside a group with outer quantifier: (a+)+, (.+b)*, etc.",
    // Matches any group containing a + quantifier, with an outer * or + — catches (a+)+, (.+b)*, etc.
    pattern: /\([^)]*\+[^)]*\)[+*]/
  },
  {
    id: "redos-nested-quantifier-star",
    description: "Nested * quantifier: (a*)* or (a*)+ \u2014 catastrophic backtracking",
    pattern: /\([^)]*\*[^)]*\)[*+]/
  },
  {
    id: "redos-nested-groups",
    description: "Doubly nested quantified groups: ((a+)+) \u2014 guaranteed catastrophic",
    pattern: /\(\([^)]{0,40}\)[+*]\)[+*]/
  },
  {
    id: "redos-alternation-overlap",
    description: "Overlapping alternation under quantifier: (a|a)+ \u2014 ambiguous NFA paths",
    // Detect repeated identical alternatives under a quantifier
    pattern: /\(([^|()]{1,20})\|(?:\1)(?:\|[^|()]{1,20}){0,5}\)[+*?]{1,2}/
  },
  {
    id: "redos-star-plus-concat",
    description: "(x*x)+ pattern \u2014 triggers super-linear backtracking",
    pattern: /\([^)]{0,10}\*[^)]{0,10}\)[+*]/
  },
  {
    id: "redos-dot-star-greedy",
    description: "(.*){n,} or (.+){n,} \u2014 repeated greedy dot quantifiers",
    pattern: /\(\.[*+]\)\{?\d/
  },
  {
    id: "redos-large-repetition",
    description: "Very large fixed or range repetition count {1000,} or {1000,n} \u2014 denial of service via backtracking",
    // Matches { followed by 4+ digits (≥1000), then optional ,digits }
    pattern: /\{\d{4,}(?:,\d*)?\}/
  },
  {
    id: "redos-catastrophic-alternation",
    description: "Long alternation with many similar branches \u2014 polynomial backtracking risk",
    // Heuristic: 10+ pipe-separated alternatives in a single group
    pattern: /\([^)]{0,200}(?:\|[^|)]{0,50}){9,}\)/
  }
];
var redos_default = REDOS_PATTERNS;

// node_modules/is-unsafe/src/contexts/nosql.js
var sep = `["'\\s]*:`;
var NOSQL_PATTERNS = [
  // ─── MongoDB $ operator injection ────────────────────────────────────────
  {
    id: "nosql-where-operator",
    description: "$where \u2014 executes arbitrary JavaScript server-side in MongoDB",
    pattern: new RegExp(`\\$where${sep}`, "i")
  },
  {
    id: "nosql-ne-operator",
    description: '$ne \u2014 "not equal" operator used to bypass equality checks',
    pattern: new RegExp(`\\$ne${sep}`, "i")
  },
  {
    id: "nosql-gt-operator",
    description: '$gt \u2014 "greater than" used to bypass password/value checks',
    pattern: new RegExp(`\\$gte?${sep}`, "i")
  },
  {
    id: "nosql-lt-operator",
    description: '$lt / $lte \u2014 "less than" bypass variants',
    pattern: new RegExp(`\\$lte?${sep}`, "i")
  },
  {
    id: "nosql-regex-operator",
    description: "$regex \u2014 can be used to extract data character by character (blind injection)",
    pattern: new RegExp(`\\$regex${sep}`, "i")
  },
  {
    id: "nosql-or-operator",
    description: "$or \u2014 logical OR; used to create always-true conditions",
    pattern: new RegExp(`\\$or${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-and-operator",
    description: "$and \u2014 logical AND operator injection",
    pattern: new RegExp(`\\$and${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-nor-operator",
    description: "$nor \u2014 logical NOR operator injection",
    pattern: new RegExp(`\\$nor${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-exists-operator",
    description: "$exists \u2014 can enumerate fields to determine schema",
    pattern: new RegExp(`\\$exists${sep}`, "i")
  },
  {
    id: "nosql-in-operator",
    description: "$in \u2014 matches any value in a list; can enumerate values",
    pattern: new RegExp(`\\$in${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-expr-operator",
    description: "$expr \u2014 allows aggregation expressions in queries (MongoDB 3.6+)",
    pattern: new RegExp(`\\$expr${sep}`, "i")
  },
  {
    id: "nosql-function-operator",
    description: "$function \u2014 executes arbitrary JavaScript in MongoDB 4.4+",
    pattern: new RegExp(`\\$function${sep}`, "i")
  },
  {
    id: "nosql-accumulator-operator",
    description: "$accumulator \u2014 custom aggregation with arbitrary JS execution",
    pattern: new RegExp(`\\$accumulator${sep}`, "i")
  },
  // ─── Prototype pollution ─────────────────────────────────────────────────
  {
    id: "nosql-proto-pollution",
    description: "__proto__ \u2014 prototype pollution via object key injection",
    pattern: /__proto__/
  },
  {
    id: "nosql-constructor-prototype",
    description: "constructor.prototype \u2014 alternative prototype pollution vector (dot notation or JSON key)",
    // Matches dot-notation (obj.constructor.prototype) and JSON key adjacency
    // ("constructor": {"prototype": ...})
    pattern: /constructor[\s"':.,{\[]*prototype/i
  },
  {
    id: "nosql-proto-bracket",
    description: '["__proto__"] \u2014 bracket-notation prototype pollution',
    pattern: /\[["']__proto__["']\]/
  }
];
var nosql_default = NOSQL_PATTERNS;

// node_modules/is-unsafe/src/contexts/log.js
var LOG_PATTERNS = [
  // ─── CRLF / newline injection ─────────────────────────────────────────────
  {
    id: "log-crlf-injection",
    description: "CRLF injection: literal \\r or \\n embeds fake log lines",
    pattern: /[\r\n]/
  },
  {
    id: "log-url-encoded-crlf",
    description: "URL-encoded CRLF: %0d, %0a, %0D, %0A \u2014 decoded by some log parsers",
    pattern: /%0[dDaA]/
  },
  {
    id: "log-unicode-newline",
    description: "Unicode newline variants: U+2028 (line separator), U+2029 (paragraph separator)",
    pattern: /[\u2028\u2029]/
  },
  // ─── Log4Shell / JNDI injection (CVE-2021-44228) ─────────────────────────
  {
    id: "log-log4shell-jndi",
    description: "Log4Shell: ${jndi:...} triggers remote code execution in Apache Log4j",
    pattern: /\$\{jndi\s*:/i
  },
  {
    id: "log-log4shell-obfuscated",
    description: "Obfuscated Log4Shell: ${::-j}... lookup-bypass prefix used to evade WAF detection",
    // ${::- is the Log4j lookup-bypass escape sequence; presence alone is suspicious
    pattern: /\$\{::-/
  },
  {
    id: "log-log4j-lookup",
    description: "Log4j lookup syntax: ${env:...}, ${sys:...}, ${ctx:...} \u2014 data exfiltration",
    pattern: /\$\{(?:env|sys|ctx|main|map|sd|web|docker|k8s|spring)\s*:/i
  },
  // ─── Server-Side Template Injection (SSTI) in log messages ───────────────
  {
    id: "log-ssti-double-brace",
    description: "SSTI double-brace: {{expression}} \u2014 Jinja2, Twig, Handlebars, etc.",
    pattern: /\{\{[\s\S]{0,80}\}\}/
  },
  {
    id: "log-ssti-hash-brace",
    description: "SSTI hash-brace: #{expression} \u2014 Thymeleaf, Velocity, Ruby ERB",
    pattern: /#\{[\s\S]{0,80}\}/
  },
  {
    id: "log-ssti-dollar-brace",
    description: "SSTI/EL injection: ${expression with operators or method calls} \u2014 JSP EL, Freemarker, SpEL",
    // Require that the ${...} content looks like an expression, not a plain variable name.
    // Flags if the content contains: . ( * + operators, or known SSTI keywords.
    // This avoids flagging ${PATH}, ${HOME} etc. (plain shell variables).
    pattern: /\$\{[^}]*(?:\.|\(|\*|\+|\bclass\b|\bruntime\b|\bprocess\b|\bexec\b)[^}]{0,80}\}/i
  },
  {
    id: "log-ssti-percent-tag",
    description: "SSTI ERB/ASP tag: <%= expression %> \u2014 Ruby ERB, ASP",
    pattern: /<%=[\s\S]{0,80}%>/
  },
  // ─── Null byte ────────────────────────────────────────────────────────────
  {
    id: "log-null-byte",
    description: "Null byte: \\x00 or %00 \u2014 can truncate log entries in C-backed loggers",
    pattern: /\x00|%00/
  },
  // ─── ANSI escape injection ────────────────────────────────────────────────
  {
    id: "log-ansi-escape",
    description: "ANSI escape sequence: ESC[ \u2014 can manipulate terminal output when logs are tailed",
    pattern: /\x1b\[/
  }
];
var log_default = LOG_PATTERNS;

// node_modules/is-unsafe/src/contexts/sql-strict.js
var SQL_STRICT_EXTRA = [
  {
    id: "sql-line-comment",
    description: "SQL line comment: -- followed by whitespace or end of string",
    pattern: /--(?:\s|$)/
  },
  {
    id: "sql-stacked-query",
    description: "Stacked queries: semicolon immediately followed by a SQL keyword",
    pattern: /;\s{0,10}(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i
  },
  {
    id: "sql-hex-encoding",
    description: "Hex-encoded string injection: 0x41414141 style (MySQL)",
    pattern: /\b0x[0-9a-f]{4,}/i
  }
];
var SQL_STRICT_PATTERNS = [...sql_default, ...SQL_STRICT_EXTRA];
var sql_strict_default = SQL_STRICT_PATTERNS;

// node_modules/is-unsafe/src/index.js
html_default.label = "HTML";
xml_default.label = "XML";
svg_default.label = "SVG";
sql_default.label = "SQL";
sql_strict_default.label = "SQL-STRICT";
shell_default.label = "SHELL";
redos_default.label = "REDOS";
nosql_default.label = "NOSQL";
log_default.label = "LOG";
var VALID_CONTEXTS = Object.freeze({
  HTML: html_default,
  XML: xml_default,
  SVG: svg_default,
  SQL: sql_default,
  "SQL-STRICT": sql_strict_default,
  SHELL: shell_default,
  REDOS: redos_default,
  NOSQL: nosql_default,
  LOG: log_default
});
function assertString(value) {
  if (typeof value !== "string") {
    throw new TypeError(
      `is-unsafe: first argument must be a string, got ${typeof value}`
    );
  }
}
function assertContext(context) {
  if (context instanceof RegExp) return;
  if (Array.isArray(context)) {
    if (context.length === 0) {
      throw new TypeError("is-unsafe: context must not be an empty array");
    }
    if (Array.isArray(context[0])) {
      for (const list of context) {
        if (!Array.isArray(list) || list.length === 0) {
          throw new TypeError(
            "is-unsafe: each context in the array must be a non-empty pattern array (PatternList)"
          );
        }
      }
    }
    return;
  }
  throw new TypeError(
    `is-unsafe: second argument must be a PatternList (e.g. HTML), an array of PatternLists (e.g. [HTML, XML]), or a RegExp. Got: ${typeof context}`
  );
}
function normalise(context) {
  if (context instanceof RegExp) return { lists: null, regex: context };
  if (Array.isArray(context[0])) return { lists: context, regex: null };
  return { lists: [context], regex: null };
}
function matchList(value, list) {
  const label = list.label ?? "CUSTOM";
  for (const rule of list) {
    if (rule.pattern.test(value)) {
      return { context: label, id: rule.id, description: rule.description, pattern: rule.pattern };
    }
  }
  return null;
}
function isUnsafe(value, context) {
  assertString(value);
  assertContext(context);
  const { lists, regex } = normalise(context);
  if (regex) return regex.test(value);
  for (const list of lists) {
    if (matchList(value, list) !== null) return true;
  }
  return false;
}

// node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
function extractRawAttributes(prefixedAttrs, options) {
  if (!prefixedAttrs) return {};
  const attrs = options.attributesGroupName ? prefixedAttrs[options.attributesGroupName] : prefixedAttrs;
  if (!attrs) return {};
  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(options.attributeNamePrefix)) {
      const rawName = key.substring(options.attributeNamePrefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}
function extractNamespace(rawTagName) {
  if (!rawTagName || typeof rawTagName !== "string") return void 0;
  const colonIndex = rawTagName.indexOf(":");
  if (colonIndex !== -1 && colonIndex > 0) {
    const ns = rawTagName.substring(0, colonIndex);
    if (ns !== "xmlns") {
      return ns;
    }
  }
  return void 0;
}
var OrderedObjParser = class {
  constructor(options, externalEntities) {
    this.options = options;
    this.currentNode = null;
    this.tagsNodeStack = [];
    this.parseXml = parseXml;
    this.parseTextData = parseTextData;
    this.resolveNameSpace = resolveNameSpace;
    this.buildAttributesMap = buildAttributesMap;
    this.isItStopNode = isItStopNode;
    this.replaceEntitiesValue = replaceEntitiesValue;
    this.readStopNodeData = readStopNodeData;
    this.saveTextToParentTag = saveTextToParentTag;
    this.addChild = addChild;
    this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
    this.entityExpansionCount = 0;
    this.currentExpandedLength = 0;
    this.doctypefound = false;
    let namedEntities = { ...XML };
    if (this.options.entityDecoder) {
      this.entityDecoder = this.options.entityDecoder;
    } else {
      if (typeof this.options.htmlEntities === "object") namedEntities = this.options.htmlEntities;
      else if (this.options.htmlEntities === true) namedEntities = { ...COMMON_HTML, ...CURRENCY };
      this.entityDecoder = new EntityDecoder({
        namedEntities: { ...namedEntities, ...externalEntities },
        numericAllowed: this.options.htmlEntities,
        limit: {
          maxTotalExpansions: this.options.processEntities.maxTotalExpansions,
          maxExpandedLength: this.options.processEntities.maxExpandedLength,
          applyLimitsTo: this.options.processEntities.appliesTo
        },
        // onExternalEntity: (name, value) => isUnsafe(value) ? 'block' : 'allow',
        onInputEntity: (name, value) => (
          //TODO: VALID_CONTEXTS.HTML should be set only if this.options.htmlEntities
          isUnsafe(value, [html_default, xml_default]) ? ENTITY_ACTION.BLOCK : ENTITY_ACTION.ALLOW
        )
        //postCheck: resolved => resolved
      });
    }
    this.matcher = new Matcher();
    this.readonlyMatcher = this.matcher.readOnly();
    this.isCurrentNodeStopNode = false;
    this.stopNodeExpressionsSet = new ExpressionSet();
    const stopNodesOpts = this.options.stopNodes;
    if (stopNodesOpts && stopNodesOpts.length > 0) {
      for (let i = 0; i < stopNodesOpts.length; i++) {
        const stopNodeExp = stopNodesOpts[i];
        if (typeof stopNodeExp === "string") {
          this.stopNodeExpressionsSet.add(new Expression(stopNodeExp));
        } else if (stopNodeExp instanceof Expression) {
          this.stopNodeExpressionsSet.add(stopNodeExp);
        }
      }
      this.stopNodeExpressionsSet.seal();
    }
  }
};
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  const options = this.options;
  if (val !== void 0) {
    if (options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);
      const jPathOrMatcher = options.jPath ? jPath.toString() : jPath;
      const newval = options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
      if (newval === null || newval === void 0) {
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        return newval;
      } else if (options.trimValues) {
        return parseValue(val, options.parseTagValue, options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, options.parseTagValue, options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}
function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(":");
    const prefix = tagname.charAt(0) === "/" ? "/" : "";
    if (tags[0] === "xmlns") {
      return "";
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}
var attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
function buildAttributesMap(attrStr, jPath, tagName, force = false) {
  const options = this.options;
  if (force === true || options.ignoreAttributes !== true && typeof attrStr === "string") {
    const matches = getAllMatches(attrStr, attrsRegx);
    const len = matches.length;
    const attrs = {};
    const processedVals = new Array(len);
    let hasRawAttrs = false;
    const rawAttrsForMatcher = {};
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      const oldVal = matches[i][4];
      if (attrName.length && oldVal !== void 0) {
        let val = oldVal;
        if (options.trimValues) val = val.trim();
        val = this.replaceEntitiesValue(val, tagName, this.readonlyMatcher);
        processedVals[i] = val;
        rawAttrsForMatcher[attrName] = val;
        hasRawAttrs = true;
      }
    }
    if (hasRawAttrs && typeof jPath === "object" && jPath.updateCurrent) {
      jPath.updateCurrent(rawAttrsForMatcher);
    }
    const jPathStr = options.jPath ? jPath.toString() : this.readonlyMatcher;
    let hasAttrs = false;
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      if (this.ignoreAttributesFn(attrName, jPathStr)) continue;
      let aName = options.attributeNamePrefix + attrName;
      if (attrName.length) {
        if (options.transformAttributeName) {
          aName = options.transformAttributeName(aName);
        }
        aName = sanitizeName(aName, options);
        if (matches[i][4] !== void 0) {
          const oldVal = processedVals[i];
          const newVal = options.attributeValueProcessor(attrName, oldVal, jPathStr);
          if (newVal === null || newVal === void 0) {
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            attrs[aName] = newVal;
          } else {
            attrs[aName] = parseValue(oldVal, options.parseAttributeValue, options.numberParseOptions);
          }
          hasAttrs = true;
        } else if (options.allowBooleanAttributes) {
          attrs[aName] = true;
          hasAttrs = true;
        }
      }
    }
    if (!hasAttrs) return;
    if (options.attributesGroupName && !options.preserveOrder) {
      const attrCollection = {};
      attrCollection[options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}
var parseXml = function(xmlData) {
  xmlData = xmlData.replace(/\r\n?/g, "\n");
  const xmlObj = new XmlNode("!xml");
  let currentNode = xmlObj;
  let textData = "";
  this.matcher.reset();
  this.entityDecoder.reset();
  this.entityExpansionCount = 0;
  this.currentExpandedLength = 0;
  this.doctypefound = false;
  const options = this.options;
  const docTypeReader = new DocTypeReader(options.processEntities);
  const xmlLen = xmlData.length;
  for (let i = 0; i < xmlLen; i++) {
    const ch = xmlData[i];
    if (ch === "<") {
      const c1 = xmlData.charCodeAt(i + 1);
      if (c1 === 47) {
        const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
        let tagName = xmlData.substring(i + 2, closeIndex).trim();
        if (options.removeNSPrefix) {
          const colonIndex = tagName.indexOf(":");
          if (colonIndex !== -1) {
            tagName = tagName.substr(colonIndex + 1);
          }
        }
        tagName = transformTagName(options.transformTagName, tagName, "", options).tagName;
        if (currentNode) {
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        }
        const lastTagName = this.matcher.getCurrentTag();
        if (tagName && options.unpairedTagsSet.has(tagName)) {
          throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
        }
        if (lastTagName && options.unpairedTagsSet.has(lastTagName)) {
          this.matcher.pop();
          this.tagsNodeStack.pop();
        }
        this.matcher.pop();
        this.isCurrentNodeStopNode = false;
        currentNode = this.tagsNodeStack.pop() || xmlObj;
        if (options.captureMetaData && currentNode) {
          currentNode.addEndIndex(closeIndex + 1);
        }
        textData = "";
        i = closeIndex;
      } else if (c1 === 63) {
        let tagData = readTagExp(xmlData, i, false, "?>");
        if (!tagData) throw new Error("Pi Tag is not closed.");
        textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        const attsMap = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName, true);
        if (attsMap) {
          const ver = attsMap[this.options.attributeNamePrefix + "version"];
          this.entityDecoder.setXmlVersion(Number(ver) || 1);
          docTypeReader.setXmlVersion(Number(ver) || 1);
        }
        if (options.ignoreDeclaration && tagData.tagName === "?xml" || options.ignorePiTags) {
        } else {
          const childNode = new XmlNode(tagData.tagName);
          childNode.add(options.textNodeName, "");
          if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent && options.ignoreAttributes !== true) {
            childNode[":@"] = attsMap;
          }
          this.addChild(currentNode, childNode, this.readonlyMatcher, i);
          if (options.captureMetaData) {
            currentNode.addEndIndex(tagData.closeIndex + 2);
          }
        }
        i = tagData.closeIndex + 1;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
        const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
        if (options.commentPropName) {
          const comment = xmlData.substring(i + 4, endIndex - 2);
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          currentNode.add(options.commentPropName, [{ [options.textNodeName]: comment }]);
        }
        i = endIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 68) {
        if (this.doctypefound) throw new Error("Multiple DOCTYPE declarations found.");
        this.doctypefound = true;
        const result = docTypeReader.readDocType(xmlData, i);
        this.entityDecoder.addInputEntities(result.entities);
        i = result.i;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i + 9, closeIndex);
        textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        let val = this.parseTextData(tagExp, currentNode.tagname, this.readonlyMatcher, true, false, true, true);
        if (val == void 0) val = "";
        if (options.cdataPropName) {
          currentNode.add(options.cdataPropName, [{ [options.textNodeName]: tagExp }]);
        } else {
          currentNode.add(options.textNodeName, val);
        }
        i = closeIndex + 2;
      } else {
        let result = readTagExp(xmlData, i, options.removeNSPrefix);
        if (!result) {
          const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlLen, i + 50));
          throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
        }
        let tagName = result.tagName;
        const rawTagName = result.rawTagName;
        let tagExp = result.tagExp;
        let attrExpPresent = result.attrExpPresent;
        let closeIndex = result.closeIndex;
        ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
        if (options.strictReservedNames && (tagName === options.commentPropName || tagName === options.cdataPropName || tagName === options.textNodeName || tagName === options.attributesGroupName)) {
          throw new Error(`Invalid tag name: ${tagName}`);
        }
        if (currentNode && textData) {
          if (currentNode.tagname !== "!xml") {
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher, false);
          }
        }
        const lastTag = currentNode;
        if (lastTag && options.unpairedTagsSet.has(lastTag.tagname)) {
          currentNode = this.tagsNodeStack.pop();
          this.matcher.pop();
        }
        let isSelfClosing = false;
        if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
          isSelfClosing = true;
          if (tagName[tagName.length - 1] === "/") {
            tagName = tagName.substr(0, tagName.length - 1);
            tagExp = tagName;
          } else {
            tagExp = tagExp.substr(0, tagExp.length - 1);
          }
          attrExpPresent = tagName !== tagExp;
        }
        let prefixedAttrs = null;
        let rawAttrs = {};
        let namespace = void 0;
        namespace = extractNamespace(rawTagName);
        if (tagName !== xmlObj.tagname) {
          this.matcher.push(tagName, {}, namespace);
        }
        if (tagName !== tagExp && attrExpPresent) {
          prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);
          if (prefixedAttrs) {
            rawAttrs = extractRawAttributes(prefixedAttrs, options);
          }
        }
        if (tagName !== xmlObj.tagname) {
          this.isCurrentNodeStopNode = this.isItStopNode();
        }
        const startIndex = i;
        if (this.isCurrentNodeStopNode) {
          let tagContent = "";
          if (isSelfClosing) {
            i = result.closeIndex;
          } else if (options.unpairedTagsSet.has(tagName)) {
            i = result.closeIndex;
          } else {
            const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
            if (!result2) throw new Error(`Unexpected end of ${rawTagName}`);
            i = result2.i;
            tagContent = result2.tagContent;
          }
          const childNode = new XmlNode(tagName);
          if (prefixedAttrs) {
            childNode[":@"] = prefixedAttrs;
          }
          childNode.add(options.textNodeName, tagContent);
          this.matcher.pop();
          this.isCurrentNodeStopNode = false;
          this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
          if (options.captureMetaData) {
            currentNode.addEndIndex(i + 1);
          }
        } else {
          if (isSelfClosing) {
            ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            if (options.captureMetaData) {
              currentNode.addEndIndex(closeIndex + 1);
            }
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
          } else if (options.unpairedTagsSet.has(tagName)) {
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            if (options.captureMetaData) {
              currentNode.addEndIndex(result.closeIndex + 1);
            }
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
            i = result.closeIndex;
            continue;
          } else {
            const childNode = new XmlNode(tagName);
            if (this.tagsNodeStack.length > options.maxNestedTags) {
              throw new Error("Maximum nested tags exceeded");
            }
            this.tagsNodeStack.push(currentNode);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            currentNode = childNode;
          }
          textData = "";
          i = closeIndex;
        }
      }
    } else {
      textData += xmlData[i];
    }
  }
  return xmlObj.child;
};
function addChild(currentNode, childNode, matcher, startIndex) {
  if (!this.options.captureMetaData) startIndex = void 0;
  const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
  const result = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
  if (result === false) {
  } else if (typeof result === "string") {
    childNode.tagname = result;
    currentNode.addChild(childNode, startIndex);
  } else {
    currentNode.addChild(childNode, startIndex);
  }
}
function replaceEntitiesValue(val, tagName, jPath) {
  const entityConfig = this.options.processEntities;
  if (!entityConfig || !entityConfig.enabled) {
    return val;
  }
  if (entityConfig.allowedTags) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    const allowed = Array.isArray(entityConfig.allowedTags) ? entityConfig.allowedTags.includes(tagName) : entityConfig.allowedTags(tagName, jPathOrMatcher);
    if (!allowed) {
      return val;
    }
  }
  if (entityConfig.tagFilter) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
      return val;
    }
  }
  return this.entityDecoder.decode(val);
}
function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
  if (textData) {
    if (isLeafNode === void 0) isLeafNode = parentNode.child.length === 0;
    textData = this.parseTextData(
      textData,
      parentNode.tagname,
      matcher,
      false,
      parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
      isLeafNode
    );
    if (textData !== void 0 && textData !== "")
      parentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}
function isItStopNode() {
  if (this.stopNodeExpressionsSet.size === 0) return false;
  return this.matcher.matchesAny(this.stopNodeExpressionsSet);
}
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
  let attrBoundary = 0;
  const len = xmlData.length;
  const closeCode0 = closingChar.charCodeAt(0);
  const closeCode1 = closingChar.length > 1 ? closingChar.charCodeAt(1) : -1;
  let result = "";
  let segmentStart = i;
  for (let index = i; index < len; index++) {
    const code = xmlData.charCodeAt(index);
    if (attrBoundary) {
      if (code === attrBoundary) attrBoundary = 0;
    } else if (code === 34 || code === 39) {
      attrBoundary = code;
    } else if (code === closeCode0) {
      if (closeCode1 !== -1) {
        if (xmlData.charCodeAt(index + 1) === closeCode1) {
          result += xmlData.substring(segmentStart, index);
          return { data: result, index };
        }
      } else {
        result += xmlData.substring(segmentStart, index);
        return { data: result, index };
      }
    } else if (code === 9 && !attrBoundary) {
      result += xmlData.substring(segmentStart, index) + " ";
      segmentStart = index + 1;
    }
  }
}
function findClosingIndex(xmlData, str, i, errMsg) {
  const closingIndex = xmlData.indexOf(str, i);
  if (closingIndex === -1) {
    throw new Error(errMsg);
  } else {
    return closingIndex + str.length - 1;
  }
}
function findClosingChar(xmlData, char, i, errMsg) {
  const closingIndex = xmlData.indexOf(char, i);
  if (closingIndex === -1) throw new Error(errMsg);
  return closingIndex;
}
function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
  const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
  if (!result) return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {
    tagName = tagExp.substring(0, separatorIndex);
    tagExp = tagExp.substring(separatorIndex + 1).trimStart();
  }
  const rawTagName = tagName;
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }
  return {
    tagName,
    tagExp,
    closeIndex,
    attrExpPresent,
    rawTagName
  };
}
function readStopNodeData(xmlData, tagName, i) {
  const startIndex = i;
  let openTagCount = 1;
  const xmllen = xmlData.length;
  for (; i < xmllen; i++) {
    if (xmlData[i] === "<") {
      const c1 = xmlData.charCodeAt(i + 1);
      if (c1 === 47) {
        const closeIndex = findClosingChar(xmlData, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i),
              i: closeIndex
            };
          }
        }
        i = closeIndex;
      } else if (c1 === 63) {
        const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
        const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i, false);
        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }
}
function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === "string") {
    const newval = val.trim();
    if (newval === "true") return true;
    else if (newval === "false") return false;
    else return toNumber(val, options);
  } else {
    if (isExist(val)) {
      return val;
    } else {
      return "";
    }
  }
}
function transformTagName(fn, tagName, tagExp, options) {
  if (fn) {
    const newTagName = fn(tagName);
    if (tagExp === tagName) {
      tagExp = newTagName;
    }
    tagName = newTagName;
  }
  tagName = sanitizeName(tagName, options);
  return { tagName, tagExp };
}
function sanitizeName(name, options) {
  if (criticalProperties.includes(name)) {
    throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
  } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return options.onDangerousProperty(name);
  }
  return name;
}

// node_modules/fast-xml-parser/src/xmlparser/node2json.js
var METADATA_SYMBOL2 = XmlNode.getMetaDataSymbol();
function stripAttributePrefix(attrs, prefix) {
  if (!attrs || typeof attrs !== "object") return {};
  if (!prefix) return attrs;
  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(prefix)) {
      const rawName = key.substring(prefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}
function prettify(node, options, matcher, readonlyMatcher) {
  return compress(node, options, matcher, readonlyMatcher);
}
function compress(arr, options, matcher, readonlyMatcher) {
  let text2;
  const compressedObj = {};
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName(tagObj);
    if (property !== void 0 && property !== options.textNodeName) {
      const rawAttrs = stripAttributePrefix(
        tagObj[":@"] || {},
        options.attributeNamePrefix
      );
      matcher.push(property, rawAttrs);
    }
    if (property === options.textNodeName) {
      if (text2 === void 0) text2 = tagObj[property];
      else text2 += "" + tagObj[property];
    } else if (property === void 0) {
      continue;
    } else if (tagObj[property]) {
      let val = compress(tagObj[property], options, matcher, readonlyMatcher);
      const isLeaf = isLeafTag(val, options);
      if (Object.keys(val).length === 0 && options.alwaysCreateTextNode) {
        val[options.textNodeName] = "";
      }
      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], readonlyMatcher, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
        else val = "";
      }
      if (tagObj[METADATA_SYMBOL2] !== void 0 && typeof val === "object" && val !== null) {
        val[METADATA_SYMBOL2] = tagObj[METADATA_SYMBOL2];
      }
      if (compressedObj[property] !== void 0 && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() : readonlyMatcher;
        if (options.isArray(property, jPathOrMatcher, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }
      if (property !== void 0 && property !== options.textNodeName) {
        matcher.pop();
      }
    }
  }
  if (typeof text2 === "string") {
    if (text2.length > 0) compressedObj[options.textNodeName] = text2;
  } else if (text2 !== void 0) compressedObj[options.textNodeName] = text2;
  return compressedObj;
}
function propName(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== ":@") return key;
  }
}
function assignAttributes(obj, attrMap, readonlyMatcher, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length;
    for (let i = 0; i < len; i++) {
      const atrrName = keys[i];
      const rawAttrName = atrrName.startsWith(options.attributeNamePrefix) ? atrrName.substring(options.attributeNamePrefix.length) : atrrName;
      const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() + "." + rawAttrName : readonlyMatcher;
      if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}
function isLeafTag(obj, options) {
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;
  if (propCount === 0) {
    return true;
  }
  if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
    return true;
  }
  return false;
}

// node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
var XMLParser = class {
  constructor(options) {
    this.externalEntities = {};
    this.options = buildOptions(options);
  }
  /**
   * Parse XML dats to JS object 
   * @param {string|Uint8Array} xmlData 
   * @param {boolean|Object} validationOption 
   */
  parse(xmlData, validationOption) {
    if (typeof xmlData !== "string" && xmlData.toString) {
      xmlData = xmlData.toString();
    } else if (typeof xmlData !== "string") {
      throw new Error("XML data is accepted in String or Bytes[] form.");
    }
    if (validationOption) {
      if (validationOption === true) validationOption = {};
      const result = validate(xmlData, validationOption);
      if (result !== true) {
        throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
      }
    }
    const orderedObjParser = new OrderedObjParser(this.options, this.externalEntities);
    const orderedResult = orderedObjParser.parseXml(xmlData);
    if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
    else return prettify(orderedResult, this.options, orderedObjParser.matcher, orderedObjParser.readonlyMatcher);
  }
  /**
   * Add Entity which is not by default supported by this library
   * @param {string} key 
   * @param {string} value 
   */
  addEntity(key, value) {
    if (value.indexOf("&") !== -1) {
      throw new Error("Entity value can't have '&'");
    } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
      throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
    } else if (value === "&") {
      throw new Error("An entity with value '&' is not permitted");
    } else {
      this.externalEntities[key] = value;
    }
  }
  /**
   * Returns a Symbol that can be used to access the metadata
   * property on a node.
   * 
   * If Symbol is not available in the environment, an ordinary property is used
   * and the name of the property is here returned.
   * 
   * The XMLMetaData property is only present when `captureMetaData`
   * is true in the options.
   */
  static getMetaDataSymbol() {
    return XmlNode.getMetaDataSymbol();
  }
};

// src/sources/xml.ts
var parser = new XMLParser({
  preserveOrder: true,
  // legislative text is mixed content: text and inline elements must stay in order
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  // keep "40" and "52.10" as strings
  parseAttributeValue: false,
  ignorePiTags: true,
  // <?amendment-start …?> markers: drop the marker, keep the words
  ignoreDeclaration: true,
  processEntities: true,
  htmlEntities: true
});
function parseXml2(xml) {
  return { name: "#document", attrs: {}, children: convert(parser.parse(xml)) };
}
function convert(items) {
  const out = [];
  for (const item of items) {
    const key = Object.keys(item).find((k) => k !== ":@");
    if (!key || key.startsWith("?") || key === "#comment") continue;
    if (key === "#text") {
      out.push(String(item[key]));
      continue;
    }
    const attrs = item[":@"] ?? {};
    out.push({ name: key, attrs, children: convert(item[key] ?? []) });
  }
  return out;
}
var isEl = (c) => typeof c === "object" && c !== null;
var child = (n, name) => n.children.find((c) => isEl(c) && c.name === name);
function findElement(n, name) {
  for (const c of n.children) {
    if (!isEl(c)) continue;
    if (c.name === name) return c;
    const deeper = findElement(c, name);
    if (deeper) return deeper;
  }
  return null;
}
function decodeEntities(s) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&nbsp;/g, "\xA0").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
var WHOLE_SECTION = 600;
var MAX_BEFORE = 300;
var MAX_AFTER = 450;
function cutSnippet(body, whenNoHit) {
  const pos = body.indexOf("**");
  if (pos === -1) return whenNoHit();
  if (body.length <= WHOLE_SECTION) return body;
  const clauseEnd = Math.max(body.lastIndexOf(". ", pos), body.lastIndexOf("; ", pos));
  let start;
  if (clauseEnd !== -1 && pos - clauseEnd <= MAX_BEFORE) start = clauseEnd + 2;
  else if (pos <= MAX_BEFORE) start = 0;
  else {
    const sp = body.indexOf(" ", pos - 90);
    start = sp !== -1 && sp < pos ? sp + 1 : pos - 90;
  }
  const hitEnd = body.indexOf("**", pos + 2) + 2;
  const next = /[.;](?=\s|$)/.exec(body.slice(hitEnd));
  let end;
  if (next && hitEnd + next.index + 1 - pos <= MAX_AFTER) end = hitEnd + next.index + 1;
  else {
    const sp = body.lastIndexOf(" ", pos + 150);
    end = sp > hitEnd ? sp : Math.min(body.length, pos + 150);
  }
  return (start > 0 ? "\u2026" : "") + body.slice(start, end) + (end < body.length ? "\u2026" : "");
}

// src/sources/federal-meta.ts
var FED_BASE = "https://laws-lois.justice.gc.ca";
var text = (html) => decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
function parseFedPage(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const head = h1 ? text(h1[1]).match(/^(.*?)\s*\(((?:[^()]|\([^()]*\))*)\)$/) : null;
  const line = text(html).match(/(?:Act|Regulations are) current to (\d{4}-\d{2}-\d{2})(?: and last amended on (\d{4}-\d{2}-\d{2}))?/);
  return {
    title: head ? head[1] : h1 ? text(h1[1]) || null : null,
    citation: head ? head[2] : null,
    currentTo: line ? line[1] : null,
    lastAmended: line?.[2] ?? null
  };
}
var field = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? decodeEntities(m[1]).trim() : null;
};
var idFromLink = (link) => link ? decodeURIComponent(link.replace(/^.*\/XML\//, "").replace(/\.xml$/i, "")) : null;
function parseLegis(xml) {
  const out = [];
  for (const m of xml.matchAll(/<Act>([\s\S]*?)<\/Act>/g)) {
    const b = m[1];
    const id = idFromLink(field(b, "LinkToXML"));
    if (field(b, "Language") !== "eng" || !id) continue;
    out.push({
      id,
      uniqueId: field(b, "UniqueId") ?? id,
      kind: "act",
      title: field(b, "Title") ?? id,
      officialNumber: field(b, "OfficialNumber"),
      ref: null,
      regRefs: [...b.matchAll(/<Reg idRef="([^"]*)"/g)].map((r2) => r2[1])
    });
  }
  for (const m of xml.matchAll(/<Regulation id="([^"]*)"[^>]*>([\s\S]*?)<\/Regulation>/g)) {
    const b = m[2];
    const id = idFromLink(field(b, "LinkToXML"));
    if (field(b, "Language") !== "eng" || !id) continue;
    out.push({ id, uniqueId: field(b, "UniqueId") ?? id, kind: "regulation", title: field(b, "Title") ?? id, officialNumber: null, ref: m[1], regRefs: [] });
  }
  return out;
}
function normalizeFedId(input) {
  const t = input.trim();
  const crc = t.match(/^C\.R\.C\.,?[\s_]*c\.[\s_]*(\d+)$/i);
  const id = crc ? `C.R.C.,_c._${crc[1]}` : t.replace(/^(SOR|SI)\/(\d+-\d+)$/i, "$1-$2");
  if (!/^[A-Za-z0-9][A-Za-z0-9.,_-]*$/.test(id) || id.includes("..")) {
    throw new ToolError(`act_id "${input}" is not a Justice Laws id (such as L-2 or C.R.C.,_c._986). Look it up with find_act (tool) or find (command).`);
  }
  return id;
}
var isFederalId = (id) => /[-/]/.test(id) || /^C\.R\.C\./i.test(id.trim());

// src/notice.ts
var BC_LAWS_NOTICE = "These materials contain information that has been derived from information originally made available by the Province of British Columbia at: http://www.bclaws.gov.bc.ca and this information is being used in accordance with the King's Printer Licence \u2013 British Columbia available at: https://www.bclaws.gov.bc.ca/standards/Licence.html. They have not, however, been produced in affiliation with, or with the endorsement of, the Province of British Columbia and THESE MATERIALS ARE NOT AN OFFICIAL VERSION.";
var FEDERAL_NOTICE = "These materials reproduce the consolidated Acts and regulations of Canada from the Justice Laws Website (https://laws-lois.justice.gc.ca), as permitted by the Reproduction of Federal Law Order (SI/97-5). They have not been produced in affiliation with, or with the endorsement of, the Government of Canada, and THESE MATERIALS ARE NOT AN OFFICIAL VERSION.";

// src/sources/search-all.ts
var EMPTY = { output: { query: "", documents_searched: 0, results: [], warnings: [], notes: [], notice: "" }, scored: [] };
async function searchAll(sources, query, limit = 10) {
  const [bs, fs] = await Promise.allSettled([sources.bc.searchScored(query, limit), sources.federal.searchScored(query, limit)]);
  const failed = [bs, fs].filter((s) => s.status === "rejected");
  if (failed.length === 2) throw failed[0].reason;
  for (const f2 of failed) if (!(f2.reason instanceof ToolError)) throw f2.reason;
  const b = bs.status === "fulfilled" ? bs.value : EMPTY;
  const f = fs.status === "fulfilled" ? fs.value : EMPTY;
  const lost = [
    ...bs.status === "rejected" ? [`BC search failed, so only federal results are shown: ${bs.reason.message}`] : [],
    ...fs.status === "rejected" ? [`Federal search failed, so only BC results are shown: ${fs.reason.message}`] : []
  ];
  const results = [...b.scored, ...f.scored].map((s, order) => ({ ...s, order })).sort((x, y) => y.score - x.score || x.order - y.order).slice(0, limit).map((s) => s.result);
  return {
    query,
    documents_searched: b.output.documents_searched + f.output.documents_searched,
    results,
    warnings: [...lost, ...b.output.warnings, ...f.output.warnings],
    notes: ["BC and federal results, ranked together by the same scoring.", .../* @__PURE__ */ new Set([...b.output.notes, ...f.output.notes])],
    notice: `${BC_LAWS_NOTICE}

${FEDERAL_NOTICE}`
  };
}

// src/cli.ts
var USAGE = `Usage: node bclaw.mjs <command> [arguments]

  term <words>                               statutory English (BC and federal) for a Chinese or everyday-English term, and where it appears
  search <bc|federal|all> <phrase> [...]     sections matching any of the phrases (each phrase is quoted; joined with OR)
  section <act_id> <section>                 verbatim text of one section, with its citation
  toc <act_id>                               parts, and every section number and heading
  find <bc|federal> <act name>               acts and regulations by title, with their act_id

BC act_ids look like 96113_01; federal ones like L-2 or C.R.C.,_c._986, so section and toc need no jurisdiction.
Federal search covers the Canada Labour Code and its regulations. Output is JSON; non-ASCII characters are \\u-escaped.`;
var ok = (value) => ({ code: 0, stdout: asciiJson(value), stderr: "" });
var usage = () => ({ code: 2, stdout: "", stderr: USAGE });
var quoted = (phrases) => phrases.map((p) => `"${p.replace(/"/g, "")}"`).join(" OR ");
async function runCli(argv, { bc, federal, glossary: glossary2 }) {
  const [cmd, ...args] = argv;
  const [where, ...rest] = args;
  try {
    switch (cmd) {
      case "help":
      case "--help":
      case "-h":
        return { code: 0, stdout: USAGE, stderr: "" };
      case "term":
        return args.length > 0 ? ok(lookupTerm(glossary2, args.join(" "))) : usage();
      case "search":
        if (rest.length === 0) return usage();
        if (where === "bc") return ok(await bc.search(quoted(rest), 10));
        if (where === "federal") return ok(await federal.search(quoted(rest), 10));
        if (where === "all") return ok(await searchAll({ bc, federal }, quoted(rest), 10));
        return usage();
      case "section":
        if (args.length !== 2) return usage();
        return ok(await (isFederalId(args[0]) ? federal.getSection(args[0], args[1]) : bc.getSection(args[0], args[1])));
      case "toc":
        if (args.length !== 1) return usage();
        return ok(await (isFederalId(args[0]) ? federal.getToc(args[0]) : bc.getToc(args[0])));
      case "find":
        if (rest.length === 0) return usage();
        if (where === "bc") return ok(await bc.findAct(rest.join(" ")));
        if (where === "federal") return ok(await federal.findAct(rest.join(" ")));
        return usage();
      default:
        return usage();
    }
  } catch (e) {
    const message = e instanceof ToolError ? e.message : `Unexpected error while reading the official source: ${e instanceof Error ? e.message : String(e)}`;
    return { code: 1, stdout: "", stderr: message };
  }
}

// src/http.ts
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { join } from "node:path";

// src/version.ts
var VERSION = "0.2.0";

// src/http.ts
var USER_AGENT = `canada-law-mcp/${VERSION} (+https://github.com/bellaaaaxu/canada-law)`;
var DAY_MS = 24 * 36e5;
function createCachedFetcher(opts) {
  const ttl = opts.ttlMs ?? DAY_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  mkdirSync(opts.cacheDir, { recursive: true });
  return async (url) => {
    const file = join(opts.cacheDir, createHash("sha256").update(url).digest("hex") + ".json");
    const cached = readCache(file);
    if (cached && cached.url === url && now().getTime() - Date.parse(cached.fetchedAt) < ttl) {
      return cached;
    }
    const res = await doFetch(url, { headers: { "User-Agent": USER_AGENT } });
    const result = {
      url,
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body: await res.text(),
      fetchedAt: now().toISOString()
    };
    if (result.status === 200) writeFileSync(file, JSON.stringify(result));
    return result;
  };
}
function readCache(file) {
  try {
    return JSON.parse(readFileSync2(file, "utf8"));
  } catch {
    return null;
  }
}

// src/sources/bc-xml.ts
var BR = "\uE000";
var CHARS = {
  "in:eacute": "\xE9",
  "in:EACUTE": "\xC9",
  "in:aacute": "\xE1",
  "in:AACUTE": "\xC1",
  "in:agrave": "\xE0",
  "in:AGRAVE": "\xC0",
  "in:rsquo": "'",
  "in:degree": "\xB0"
};
function inlineRaw(nodes, o) {
  let s = "";
  for (const c of nodes) {
    if (!isEl(c)) {
      s += c;
      continue;
    }
    const inner = () => inlineRaw(c.children, o);
    if (c.name in CHARS) s += CHARS[c.name];
    else if (c.name === "in:char") s += c.attrs.type === "mdash" ? "\u2014" : c.attrs.type === "ndash" ? "-" : "";
    else if (c.name === "in:term" || c.name === "in:doublequoted") s += `"${inner()}"`;
    else if (c.name === "in:singlequoted") s += `'${inner()}'`;
    else if (c.name === "in:br" || c.name === "in:hr") s += BR;
    else if (c.name === "in:graphic") s += "[graphic omitted: see source_url]";
    else if (c.name === "hit") s += o.markHits ? `**${inner()}**` : inner();
    else s += inner();
  }
  return s;
}
function tidy(raw) {
  return raw.replace(/\s+/g, " ").replace(new RegExp(` ?${BR} ?`, "g"), "\n").trim();
}
var inlineText = (n, o = {}) => tidy(inlineRaw(n.children, o));
var LIST_BLOCKS = /* @__PURE__ */ new Set([
  "bcl:subsection",
  "bcl:paragraph",
  "bcl:subparagraph",
  "bcl:clause",
  "bcl:subclause",
  "bcl:definition"
]);
var LINE_BLOCKS = /* @__PURE__ */ new Set(["bcl:hnote", "bcl:centertext", "bcl:lefttext", "bcl:righttext", "bcl:scheduletitle"]);
var indent = (depth) => "  ".repeat(depth);
function renderSection(section, o = {}) {
  return renderBlock(section, 0, true, o).join("\n");
}
function renderBlock(node, depth, isSection, o) {
  const lines = [];
  const numNode = child(node, "bcl:num");
  const label = numNode ? isSection ? inlineText(numNode) : `(${inlineText(numNode)})` : "";
  let cur = label;
  const flush = () => {
    if (cur !== null && cur.trim() !== "") lines.push(indent(depth) + tidy(cur));
    cur = null;
  };
  const append = (s, spaced) => {
    if (cur === null) cur = "";
    cur += spaced && cur.trim() !== "" ? " " + s : s;
  };
  for (const c of node.children) {
    if (!isEl(c)) append(c, false);
    else if (c.name === "bcl:num" || c.name === "bcl:marginalnote") continue;
    else if (c.name === "bcl:text") append(inlineRaw(c.children, o), true);
    else if (LIST_BLOCKS.has(c.name)) {
      const childDepth = c.name === "bcl:subsection" ? depth : depth + 1;
      const childLines = renderBlock(c, childDepth, false, o);
      if (label && cur !== null && tidy(cur) === label && childLines.length > 0 && childDepth === depth) {
        childLines[0] = indent(depth) + label + " " + childLines[0].trimStart();
        cur = null;
      } else flush();
      lines.push(...childLines);
    } else if (LINE_BLOCKS.has(c.name)) {
      flush();
      const t = inlineText(c, o);
      if (t) lines.push(indent(depth) + t);
    } else if (c.name === "oasis:table") {
      flush();
      lines.push(...renderTable(c, depth, o));
    } else append(inlineRaw([c], o), false);
  }
  flush();
  return lines;
}
function renderTable(table, depth, o) {
  const lines = [];
  const walk2 = (n) => {
    for (const c of n.children) {
      if (!isEl(c)) continue;
      if (c.name === "oasis:tcaption") lines.push(indent(depth) + inlineText(c, o));
      else if (c.name === "oasis:trow") {
        const cells = c.children.filter(isEl).map((e) => inlineText(e, o));
        lines.push(indent(depth) + cells.join(" | "));
      } else walk2(c);
    }
  };
  walk2(table);
  return lines;
}
var sectionNum = (s) => {
  const n = child(s, "bcl:num");
  return n ? inlineText(n) : "";
};
var sectionHeading = (s) => {
  const m = child(s, "bcl:marginalnote");
  return m ? inlineText(m) : null;
};
function containerLabel(n) {
  const num = child(n, "bcl:num");
  const text2 = child(n, "bcl:text");
  const numStr = num ? inlineText(num) : "";
  const title = text2 ? inlineText(text2) : "";
  if (n.name === "bcl:part") return `Part ${numStr}${title ? " \u2014 " + title : ""}`.trim();
  if (n.name === "bcl:division") return `Division ${numStr}${title ? " \u2014 " + title : ""}`.trim();
  if (n.name === "bcl:schedule") {
    const t = child(n, "bcl:scheduletitle");
    return t ? inlineText(t) : "Schedule";
  }
  return null;
}
function walkSections(n, ctx, visit) {
  for (const c of n.children) {
    if (!isEl(c)) continue;
    if (c.name === "bcl:section") {
      visit(c, ctx);
      continue;
    }
    const label = containerLabel(c);
    const next = {
      location: label ? [...ctx.location, label] : ctx.location,
      partDocId: c.name === "act:content" && c.attrs.id ? c.attrs.id : ctx.partDocId
    };
    walkSections(c, next, visit);
  }
}
function findSections(doc, num) {
  const wanted = num.trim();
  const out = [];
  walkSections(doc, { location: [], partDocId: null }, (s, ctx) => {
    if (sectionNum(s) === wanted) {
      out.push({ node: s, num: wanted, heading: sectionHeading(s), location: ctx.location, partDocId: ctx.partDocId });
    }
  });
  return out;
}
function buildToc(doc) {
  const out = [];
  const walk2 = (n, depth, partDocId) => {
    for (const c of n.children) {
      if (!isEl(c)) continue;
      if (c.name === "bcl:section") {
        out.push({ kind: "section", num: sectionNum(c), title: sectionHeading(c), depth, partDocId });
      } else if (c.name === "bcl:part" || c.name === "bcl:division") {
        const num = child(c, "bcl:num");
        const text2 = child(c, "bcl:text");
        out.push({
          kind: c.name === "bcl:part" ? "part" : "division",
          num: num ? inlineText(num) : null,
          title: text2 ? inlineText(text2) : null,
          depth,
          partDocId
        });
        walk2(c, depth + 1, partDocId);
      } else if (c.name === "bcl:schedule") {
        out.push({ kind: "schedule", num: null, title: containerLabel(c), depth, partDocId });
        walk2(c, depth + 1, partDocId);
      } else {
        walk2(c, depth, c.name === "act:content" && c.attrs.id ? c.attrs.id : partDocId);
      }
    }
  };
  walk2(doc, 0, null);
  return out;
}
function renderToc(entries) {
  return entries.map((e) => {
    const pad = indent(e.depth);
    if (e.kind === "part") return `${pad}Part ${e.num ?? ""}${e.title ? " \u2014 " + e.title : ""}`;
    if (e.kind === "division") return `${pad}Division ${e.num ?? ""}${e.title ? " \u2014 " + e.title : ""}`;
    if (e.kind === "schedule") return `${pad}${e.title ?? "Schedule"}`;
    return `${pad}${e.num}  ${e.title ?? ""}`.trimEnd();
  }).join("\n");
}
function docInfo(doc) {
  const root = doc.children.find(isEl);
  if (!root) return { kind: "unknown", title: null, regnum: null, status: null, repealedText: null };
  const kind = root.name === "act:act" ? "act" : root.name === "reg:regulation" ? "regulation" : "unknown";
  const text2 = (name) => {
    const n = child(root, name);
    return n ? inlineText(n) : null;
  };
  return {
    kind,
    title: text2(kind === "regulation" ? "reg:title" : "act:title"),
    regnum: text2("reg:regnum"),
    status: root.attrs.status ?? null,
    repealedText: text2("act:repealedtext")
  };
}
function analyzeHitSections(doc) {
  const out = [];
  walkSections(doc, { location: [], partDocId: null }, (s) => {
    let totalHits = 0;
    let headingHit = false;
    let definedTermExact = false;
    let definedTermPartial = false;
    const scan = (n, inHeading, term) => {
      for (const c of n.children) {
        if (!isEl(c)) continue;
        if (c.name === "hit") {
          totalHits++;
          if (inHeading) headingHit = true;
          if (term) {
            if (inlineText(term).toLowerCase() === inlineText(c).toLowerCase()) definedTermExact = true;
            else definedTermPartial = true;
          }
        }
        scan(c, inHeading || c.name === "bcl:marginalnote", c.name === "in:term" ? c : term);
      }
    };
    scan(s, false, null);
    const note = child(s, "bcl:marginalnote");
    const firstInNote = note?.children.find((c) => isEl(c) || c.trim() !== "");
    const headingStartsWithHit = isEl(firstInNote) && firstInNote.name === "hit";
    out.push({
      num: sectionNum(s),
      heading: sectionHeading(s),
      totalHits,
      headingHit,
      headingStartsWithHit,
      definedTermExact,
      definedTermPartial,
      snippet: makeSnippet(s)
    });
  });
  return out;
}
function makeSnippet(section) {
  const body = tidy(renderSection(section, { markHits: true }).replace(/\n/g, " "));
  return cutSnippet(body, () => {
    const note = child(section, "bcl:marginalnote");
    return note ? inlineText(note, { markHits: true }) : body.slice(0, 240);
  });
}

// src/sources/bc-meta.ts
var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function isoDate(text2) {
  const m = text2.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]) + 1;
  if (month === 0) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
var plain = (html) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function parsePageMeta(html) {
  const titleBlock = html.match(/<div id="title">([\s\S]*?)<\/div>/);
  const h2 = titleBlock?.[1].match(/<h2>([\s\S]*?)<\/h2>/);
  const h3 = titleBlock?.[1].match(/<h3>([\s\S]*?)<\/h3>/);
  const chapter = h3 ? plain(h3[1]).match(/^\[(R?SBC) (\d{4})\] CHAPTER ([\w.]+)$/) : null;
  const current = plain(html.slice(0, 2e4)).match(/This [A-Za-z ]{2,40}? is current to ([A-Z][a-z]+ \d{1,2}, \d{4})/);
  return {
    title: h2 ? plain(h2[1]) : null,
    citation: chapter ? `${chapter[1]} ${chapter[2]}, c. ${chapter[3]}` : null,
    currentTo: current ? isoDate(current[1]) : null
  };
}
var isEl2 = (c) => typeof c === "object" && c !== null;
var childText = (n, name) => {
  const c = n.children.find((x) => isEl2(x) && x.name === name);
  return c ? inlineText(c) : null;
};
function parseFullSearch(xml) {
  const root = parseXml2(xml).children.find(isEl2);
  if (!root || root.name !== "results") throw new Error("Unexpected search response (no <results> element)");
  const docs = root.children.filter((c) => isEl2(c) && c.name === "doc");
  return {
    totalHits: Number(root.attrs.totalhits ?? docs.length),
    docs: docs.map((d) => ({
      id: childText(d, "CIVIX_DOCUMENT_ID") ?? "",
      title: childText(d, "CIVIX_DOCUMENT_TITLE") ?? "",
      loc: childText(d, "CIVIX_DOCUMENT_LOC") ?? "",
      multiParent: childText(d, "CIVIX_MULTI_PARENT"),
      frags: d.children.filter((c) => isEl2(c) && c.name === "frag").map((f) => inlineText(f))
    }))
  };
}
function parseActFolder(folder2) {
  const name = folder2.replace(/^\d+_/, "").trim();
  const m = name.match(/^(.*?) \[(R?SBC) (\d{4})\] c\. ?([\w.]+)$/);
  return m ? { title: m[1], citation: `${m[2]} ${m[3]}, c. ${m[4]}` } : { title: name, citation: null };
}
var multiActIdFor = (partId) => partId.replace(/_[^_]+$/, "_00") + "_multi";
function classifyDoc(d) {
  const [, folder2, ...rest] = d.loc.split("/");
  if (!folder2 || rest.length === 0) return { kind: "other", reason: "unrecognised location" };
  const act = parseActFolder(folder2);
  if (rest.length === 1 && /^00_/.test(rest[0])) {
    return { kind: "act", actId: d.id, docId: d.id, actTitle: act.title, actCitation: act.citation ?? "" };
  }
  if (rest[0] === "00_Act") {
    return {
      kind: "act",
      actId: multiActIdFor(d.id),
      docId: d.id,
      actTitle: d.multiParent ?? act.title,
      actCitation: act.citation ?? ""
    };
  }
  if (/^\d+_Regulations$/.test(rest[0])) {
    const m = d.title.match(/^(.*) - (\d+[A-Za-z]?\/\d{2,4})$/);
    return {
      kind: "regulation",
      actId: d.id,
      docId: d.id,
      actTitle: m ? m[1] : d.title,
      actCitation: m ? `B.C. Reg. ${m[2]}` : ""
    };
  }
  return { kind: "other", reason: rest[0].replace(/^\d+_/, "") };
}

// src/sources/bc.ts
var BASE = "https://www.bclaws.gov.bc.ca/civix";
var DOC = `${BASE}/document/id/complete/statreg/`;
var MAX_PAGE = 20;
var MAX_DOCS_SEARCHED = 8;
var CONCURRENCY = 4;
var SECTIONS_XPATH = "/xpath///bcl:section%5Bdescendant::hit%5D";
var LITERAL_NOTE = 'Matching is literal (no plurals or stemming): include variants, e.g. "meal break" OR "meal breaks", or a wildcard such as break*.';
var SNIPPET_NOTE = "A snippet is the whole section when the section is short; otherwise it is cut short to the clause around the first match (\u2026 marks a cut), and other parts of the section can change its meaning. Before quoting, explaining or citing a section, read its full text with get_section (MCP tool) or the section command.";
var CURRENT_TO_WARNING = 'current_to is null: the official page did not show a "current to" date, so currency could not be confirmed. Check source_url before relying on this text.';
var pageUrl = (id) => DOC + id.replace(/_multi$/, "");
var BcClient = class {
  fetcher;
  parsed = /* @__PURE__ */ new Map();
  constructor(opts) {
    this.fetcher = opts.fetcher;
  }
  // ---------- find_act ----------
  async findAct(name) {
    const clean = name.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) throw new ToolError("name is empty.");
    let { docs } = await this.fullSearch(`title:"${clean}"`);
    if (docs.length === 0) {
      const words = clean.split(" ").map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
      if (words.length > 0) ({ docs } = await this.fullSearch(`title:(${words.map((w) => "+" + w).join(" ")})`));
    }
    const byKey = /* @__PURE__ */ new Map();
    docs.forEach((d, order) => {
      const c = classifyDoc(d);
      if (c.kind === "other") return;
      const key = `${c.kind}|${c.actTitle}|${c.actCitation}`;
      if (byKey.has(key)) return;
      byKey.set(key, { act_id: c.actId, title: c.actTitle, citation: c.actCitation, type: c.kind, source_url: pageUrl(c.actId), order });
    });
    const exact = (a) => a.title.toLowerCase() === clean.toLowerCase() ? 0 : 1;
    const typeRank = (a) => a.type === "act" ? 0 : 1;
    const statusRank = (a) => a.status === "repealed or replaced" ? 1 : 0;
    const list = [...byKey.values()].sort((a, b) => exact(a) - exact(b) || typeRank(a) - typeRank(b) || a.order - b.order);
    await mapLimit(
      list.filter((a) => a.type === "act").slice(0, 5),
      CONCURRENCY,
      async (a) => {
        const res = await this.fetcher(`${DOC}${a.act_id}/xml/xpath//act:act%5B@status%5D`);
        const stub = res.status === 200 ? findElement(parseXml2(res.body), "act:act") : null;
        if (res.status === 200 && !stub && /No Results/.test(res.body)) {
          a.status = "current";
        } else if (stub) {
          const info = docInfo({ name: "#document", attrs: {}, children: [stub] });
          a.status = NOT_CURRENT.test(info.status ?? "") ? "repealed or replaced" : "unknown";
          a.note = [`status: ${info.status}`, info.repealedText].filter(Boolean).join(". ");
        } else a.status = "unknown";
      }
    );
    return list.sort((a, b) => exact(a) - exact(b) || statusRank(a) - statusRank(b) || typeRank(a) - typeRank(b) || a.order - b.order).slice(0, 10).map(({ order: _order, ...a }) => a);
  }
  // ---------- get_toc ----------
  async getToc(actId) {
    const { id, doc, fetchedAt } = await this.loadDoc(actId);
    const facts = await this.actFacts(id, doc);
    const warnings = [];
    if (!facts.page.currentTo) warnings.push(CURRENT_TO_WARNING);
    warnings.push(...statusWarnings(facts.info));
    return {
      act: {
        jurisdiction: "bc",
        act_title: facts.title,
        act_citation: facts.citation,
        act_id: id,
        source_url: pageUrl(id),
        current_to: facts.page.currentTo,
        retrieved_at: fetchedAt
      },
      outline: renderToc(buildToc(doc)),
      warnings,
      notice: BC_LAWS_NOTICE
    };
  }
  // ---------- get_section ----------
  async getSection(actId, section) {
    const num = normalizeSection(section);
    const { id, doc, fetchedAt } = await this.loadDoc(actId);
    const facts = await this.actFacts(id, doc);
    if (NOT_CURRENT.test(facts.info.status ?? "")) {
      throw new ToolError(
        `${facts.title} (${id}) is not a current consolidation (status: ${facts.info.status}). ${facts.info.repealedText ?? ""} Find the current act with find_act (tool) or find (command).`
      );
    }
    const matches = findSections(doc, num);
    if (matches.length === 0) {
      throw new ToolError(`No section ${num} in ${facts.title} (${id}). Its table of contents (get_toc tool, or toc command) lists the section numbers.`);
    }
    const warnings = [];
    if (!facts.page.currentTo) warnings.push(CURRENT_TO_WARNING);
    warnings.push(...statusWarnings(facts.info));
    if (matches.length > 1) {
      warnings.push(`${matches.length} provisions are numbered ${num} in this act (for example one in a Schedule). All are returned; check "location".`);
    }
    const results = matches.map((m) => ({
      citation: {
        jurisdiction: "bc",
        act_title: facts.title,
        act_citation: facts.citation,
        act_id: id,
        section: m.num,
        heading: m.heading,
        source_url: `${pageUrl(m.partDocId ?? id)}#section${m.num}`,
        current_to: facts.page.currentTo,
        retrieved_at: fetchedAt
      },
      location: m.location,
      text: renderSection(m.node)
    }));
    const [first, ...others] = results;
    return { ...first, ...others.length > 0 ? { other_matches: others } : {}, warnings, notice: BC_LAWS_NOTICE };
  }
  // ---------- search_law ----------
  async search(query, limit = 10) {
    return (await this.searchScored(query, limit)).output;
  }
  /** search() plus each result's score, so that search_law "all" can rank BC and federal results together. */
  async searchScored(query, limit = 10) {
    const q = query.replace(/\//g, " ").replace(/\s+/g, " ").trim();
    if (!q) throw new ToolError("query is empty.");
    const wrapped = `(${q})`;
    const { totalHits, docs } = await this.fullSearch(wrapped);
    const seen = /* @__PURE__ */ new Set();
    const candidates = docs.map(classifyDoc).filter((c) => c.kind !== "other").filter((c) => seen.has(c.docId) ? false : (seen.add(c.docId), true)).sort((a, b) => a.kind === b.kind ? 0 : a.kind === "act" ? -1 : 1).slice(0, MAX_DOCS_SEARCHED);
    const warnings = [];
    const perDoc = await mapLimit(candidates, CONCURRENCY, async (c, docIndex) => {
      const res = await this.fetcher(`${DOC}${c.docId}/xml/search/${encodeURIComponent(wrapped)}${SECTIONS_XPATH}`);
      if (res.status !== 200) {
        warnings.push(
          `In-document search failed for ${c.actTitle} (${c.docId}): HTTP ${res.status}. BC Laws also answers 500 when the words are not in the text itself (e.g. only in the title), so this document was skipped.`
        );
        return [];
      }
      return analyzeHitSections(parseXml2(res.body)).map((s, secIndex) => ({ c, s, docIndex, secIndex, fetchedAt: res.fetchedAt }));
    });
    const score = ({ c, s }) => (s.definedTermExact ? 100 : s.definedTermPartial ? 20 : 0) + (s.headingHit ? 50 : 0) + (s.headingStartsWithHit ? 10 : 0) + Math.min(s.totalHits, 10) + (c.kind === "act" ? 15 : 0);
    const top = perDoc.flat().sort((a, b) => score(b) - score(a) || a.docIndex - b.docIndex || a.secIndex - b.secIndex).slice(0, limit);
    const metas = /* @__PURE__ */ new Map();
    await mapLimit([...new Set(top.map((h) => h.c.actId))], CONCURRENCY, async (id) => {
      metas.set(id, await this.pageMeta(id));
    });
    const undated = [...metas].filter(([, m]) => !m.currentTo).map(([id]) => id);
    if (undated.length > 0) warnings.push(`${CURRENT_TO_WARNING} (${undated.join(", ")})`);
    const results = top.map(({ c, s, fetchedAt }) => ({
      jurisdiction: "bc",
      act_title: c.actTitle,
      act_citation: c.actCitation,
      act_id: c.actId,
      section: s.num,
      heading: s.heading,
      source_url: `${pageUrl(c.docId)}#section${s.num}`,
      current_to: metas.get(c.actId)?.currentTo ?? null,
      retrieved_at: fetchedAt,
      snippet: s.snippet,
      match: [
        ...s.definedTermExact ? ["defines the term"] : s.definedTermPartial ? ["inside a defined term"] : [],
        ...s.headingHit ? ["heading"] : [],
        `${s.totalHits} hit${s.totalHits === 1 ? "" : "s"}`
      ]
    }));
    return {
      output: {
        query: q,
        documents_matched: totalHits,
        documents_searched: candidates.length,
        results,
        warnings,
        notes: [
          `BC Laws full-site search returns documents, not sections: the top ${MAX_PAGE} documents by its own ranking were taken, point-in-time versions and legislative-change tables were dropped, and up to ${MAX_DOCS_SEARCHED} current acts/regulations were searched section by section.`,
          LITERAL_NOTE,
          SNIPPET_NOTE
        ],
        notice: BC_LAWS_NOTICE
      },
      scored: top.map((h, i) => ({ result: results[i], score: score(h) }))
    };
  }
  // ---------- internals ----------
  async fullSearch(q) {
    const res = await this.fetcher(`${BASE}/search/complete/fullsearch?q=${encodeURIComponent(q)}&s=0&e=${MAX_PAGE}`);
    if (res.status !== 200) {
      throw new ToolError(
        `BC Laws search failed (HTTP ${res.status}) for ${q}. Use plain words or "double-quoted phrases" joined by OR, with balanced quotes and parentheses.`
      );
    }
    return parseFullSearch(res.body);
  }
  /** Loads an act/regulation XML. A multi-document act's table-of-contents id is followed to its "_multi" document. */
  async loadDoc(actId) {
    if (!/^[A-Za-z0-9_]+$/.test(actId)) throw new ToolError(`act_id "${actId}" is not a BC Laws document id. Look it up with find_act (tool) or find (command).`);
    let id = actId;
    let res = await this.fetchDoc(id);
    if (/<html[^>]*data-ismulti="true"/.test(res.body.slice(0, 3e3)) && !id.endsWith("_multi")) {
      id = `${id}_multi`;
      res = await this.fetchDoc(id);
    }
    const doc = this.parse(res);
    if (docInfo(doc).kind === "unknown") {
      throw new ToolError(`Document ${actId} is not an act or regulation in XML form. Look up the act id with find_act (tool) or find (command).`);
    }
    return { id, doc, fetchedAt: res.fetchedAt };
  }
  async fetchDoc(id) {
    const res = await this.fetcher(`${DOC}${id}/xml`);
    if (res.status === 404) throw new ToolError(`No BC Laws document with act_id "${id}". Look up the id with find_act (tool) or find (command).`);
    if (res.status !== 200) throw new ToolError(`BC Laws returned HTTP ${res.status} for document ${id}.`);
    return res;
  }
  parse(res) {
    const key = `${res.url}@${res.fetchedAt}`;
    let doc = this.parsed.get(key);
    if (!doc) {
      doc = parseXml2(res.body);
      this.parsed.set(key, doc);
      if (this.parsed.size > 6) this.parsed.delete(this.parsed.keys().next().value);
    }
    return doc;
  }
  async pageMeta(id) {
    const res = await this.fetcher(pageUrl(id));
    return res.status === 200 ? parsePageMeta(res.body) : { title: null, citation: null, currentTo: null };
  }
  async actFacts(id, doc) {
    const info = docInfo(doc);
    const page = await this.pageMeta(id);
    const title = info.title ?? page.title ?? id;
    const citation = info.kind === "regulation" ? info.regnum ? `B.C. Reg. ${info.regnum}` : "" : page.citation ?? "";
    return { info, page, title, citation };
  }
};
var NOT_CURRENT = /^(repealed|replaced)$/i;
function statusWarnings(info) {
  if (info.status && NOT_CURRENT.test(info.status)) {
    return [`Not a current consolidation (status: ${info.status}). ${info.repealedText ?? ""}`.trim()];
  }
  if (info.status) return [`The document carries an unrecognised status "${info.status}"; check source_url before relying on it.`];
  if (info.repealedText) return [`Official note on this act: ${info.repealedText}`];
  return [];
}
function normalizeSection(section) {
  const s = section.trim().replace(/^(?:ss?\.|section)\s*/i, "");
  if (!/^\d+[A-Za-z]?(?:\.\d+[A-Za-z]?)*(?:-\d+[A-Za-z]?(?:\.\d+[A-Za-z]?)*)?$/.test(s)) {
    throw new ToolError(`"${section}" is not a section number (expected something like 40, 52.13 or 128-129).`);
  }
  return s;
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// src/sources/federal-xml.ts
var BR2 = "\uE000";
function inlineRaw2(nodes) {
  let s = "";
  for (const c of nodes) {
    if (!isEl(c)) {
      s += c;
      continue;
    }
    if (c.name === "HistoricalNote" || c.name === "MarginalNote" || c.name === "Footnote" || c.name === "FootnoteRef" || c.name === "PageBreak") continue;
    if (c.name === "DefinedTermEn") s += `"${inlineRaw2(c.children).trim()}"`;
    else if (c.name === "Repealed") s += (s !== "" && !/\s$/.test(s) ? " " : "") + inlineRaw2(c.children);
    else if (c.name === "LineBreak") s += BR2;
    else if (c.name === "Leader" || c.name === "LeaderRightJustified") s += " ";
    else if (c.name === "ImageGroup" || c.name === "Image") s += "[image omitted: see source_url]";
    else s += inlineRaw2(c.children);
  }
  return s;
}
var tidy2 = (raw) => raw.replace(/\s+/g, " ").replace(new RegExp(` ?${BR2} ?`, "g"), "\n").trim();
var inlineText2 = (n) => tidy2(inlineRaw2(n.children));
var indent2 = (depth) => "  ".repeat(depth);
var BLOCKS = /* @__PURE__ */ new Set(["Subsection", "Paragraph", "Subparagraph", "Clause", "Subclause", "Subsubclause", "Definition", "Provision", "Item", "FormulaParagraph"]);
function renderFedSection(section, o = {}) {
  const lines = renderBlock2(section, 0);
  return (o.mark ? lines.map((l) => l.replace(o.mark, (m) => `**${m}**`)) : lines).join("\n");
}
function renderBlock2(node, depth) {
  const lines = [];
  const labelNode = child(node, "Label");
  const label = labelNode ? inlineText2(labelNode) : "";
  let cur = label;
  const flush = () => {
    if (cur !== null && tidy2(cur) !== "") lines.push(...tidy2(cur).split("\n").map((l) => indent2(depth) + l));
    cur = null;
  };
  const append = (s) => {
    if (cur === null) cur = "";
    cur += cur.trim() !== "" && s.trim() !== "" && !/^\s/.test(s) ? " " + s : s;
  };
  const block = (ls) => {
    flush();
    lines.push(...ls);
  };
  for (const c of node.children) {
    if (!isEl(c)) {
      if (c.trim()) append(c);
      continue;
    }
    if (c.name === "Label" || c.name === "MarginalNote" || c.name === "HistoricalNote" || c.name === "FootnoteRef") continue;
    if (c.name === "Text") append(inlineRaw2(c.children));
    else if (BLOCKS.has(c.name)) {
      const childDepth = c.name === "Subsection" ? depth : depth + 1;
      const childLines = renderBlock2(c, childDepth);
      if (label && cur !== null && tidy2(cur) === label && childLines.length > 0 && childDepth === depth) {
        childLines[0] = indent2(depth) + label + " " + childLines[0].trimStart();
        cur = null;
      } else flush();
      lines.push(...childLines);
    } else if (c.name.startsWith("Continued")) {
      const t = inlineText2(c);
      if (t) block([indent2(depth) + t]);
    } else if (c.name === "ReadAsText" || c.name === "AmendedText") block(quoted2(c, depth + 1));
    else if (c.name === "Section") block(renderBlock2(c, depth + 1));
    else if (c.name === "List") block(c.children.filter(isEl).flatMap((i) => renderBlock2(i, depth + 1)));
    else if (c.name === "TableGroup" || c.name === "table") block(renderTable2(c, depth));
    else if (c.name === "FormulaGroup") block(renderFormula(c, depth));
    else if (c.name === "Footnote") {
      const l = child(c, "Label");
      const body = tidy2(inlineRaw2(c.children.filter((x) => !(isEl(x) && x.name === "Label"))));
      block([`${indent2(depth)}[footnote${l ? " " + inlineText2(l) : ""}] ${body}`.trimEnd()]);
    } else if (c.name === "ImageGroup") block([indent2(depth) + "[image omitted: see source_url]"]);
    else append(inlineRaw2([c]));
  }
  flush();
  if (node.attrs["in-force"] === "no" && lines.length > 0) lines[0] = indent2(depth) + "[Not in force] " + lines[0].trimStart();
  return lines;
}
function quoted2(n, depth) {
  return n.children.filter(isEl).flatMap((c) => {
    if (c.name === "Section" || BLOCKS.has(c.name)) return renderBlock2(c, depth);
    if (c.name === "Heading") return [indent2(depth) + headingText(c)];
    const t = inlineText2(c);
    return t ? [indent2(depth) + t] : [];
  });
}
function renderTable2(table, depth) {
  const lines = [];
  const walk2 = (n) => {
    for (const c of n.children) {
      if (!isEl(c)) continue;
      if (c.name === "title" || c.name === "Caption") lines.push(indent2(depth) + inlineText2(c));
      else if (c.name === "row") lines.push(indent2(depth) + c.children.filter(isEl).map((e) => tidy2(inlineRaw2(e.children))).join(" | "));
      else walk2(c);
    }
  };
  walk2(table);
  return lines.filter((l) => l.trim() !== "");
}
function renderFormula(group, depth) {
  return group.children.filter(isEl).flatMap((c) => {
    if (c.name === "FormulaDefinition") {
      const term = child(c, "FormulaTerm");
      const rest = c.children.filter((x) => !(isEl(x) && x.name === "FormulaTerm"));
      return [indent2(depth) + tidy2(`${term ? inlineText2(term) : ""} ${inlineRaw2(rest)}`)];
    }
    if (BLOCKS.has(c.name)) return renderBlock2(c, depth + 1);
    const t = inlineText2(c);
    return t ? [indent2(depth) + t] : [];
  });
}
function headingText(h) {
  const label = child(h, "Label");
  const title = child(h, "TitleText");
  const note = child(h, "Note");
  const text2 = [label ? inlineText2(label) : "", title ? inlineText2(title) : ""].filter(Boolean).join(" \u2014 ");
  return (note ? `${text2} ${inlineText2(note)}` : text2).trim();
}
function scheduleTitle(s) {
  const h = child(s, "ScheduleFormHeading");
  const text2 = h ? h.children.filter(isEl).map(inlineText2).filter(Boolean).join(" ") : "";
  return text2 || "Schedule";
}
var notTheLaw = (s) => s.attrs.id === "RelatedProvs" || s.attrs.id === "NifProvs";
function walk(container, base, v) {
  let stack = [];
  const location = () => [...base, ...stack.map((s) => s.text)];
  for (const c of container.children) {
    if (!isEl(c)) continue;
    if (c.name === "Heading") {
      const level = Number(c.attrs.level ?? 1);
      const text2 = headingText(c);
      stack = stack.filter((s) => s.level < level);
      if (text2) {
        stack.push({ level, text: text2 });
        v.heading?.(text2, location().length - 1);
      }
    } else if (c.name === "Section") v.section(c, location());
    else if (c.name === "Schedule") {
      if (notTheLaw(c)) continue;
      const title = scheduleTitle(c);
      v.heading?.(title, location().length);
      walk(c, [...location(), title], v);
    } else if (c.name !== "HistoricalNote" && c.name !== "Identification") walk(c, location(), v);
  }
}
function walkLaw(doc, v) {
  const root = doc.children.find(isEl);
  if (!root) return;
  for (const c of root.children) {
    if (!isEl(c)) continue;
    if (c.name === "Body") walk(c, [], v);
    else if (c.name === "Schedule" && !notTheLaw(c)) {
      const title = scheduleTitle(c);
      v.heading?.(title, 0);
      walk(c, [title], v);
    }
  }
}
var REPEALED_ONLY = /^\[Repealed\b[^\]]*\]$/;
function toSection(node, location) {
  const labelNode = child(node, "Label");
  const num = labelNode ? inlineText2(labelNode) : "";
  const note = child(node, "MarginalNote");
  return {
    node,
    num,
    heading: note ? inlineText2(note) : null,
    location,
    nearestHeading: location.at(-1) ?? null,
    repealed: REPEALED_ONLY.test(renderFedSection(node).slice(num.length).trim()),
    range: /\s(?:to|and)\s/.test(num)
  };
}
function bodySections(doc) {
  const out = [];
  walkLaw(doc, { section: (node, location) => out.push(toSection(node, location)) });
  return out;
}
var parts = (n) => n.split(".").map((p) => parseInt(p, 10));
function compareNums(a, b) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}
function inRange(label, num) {
  const to = label.match(/^([\d.]+) to ([\d.]+)$/);
  if (to) return compareNums(to[1], num) <= 0 && compareNums(num, to[2]) <= 0;
  return label.split(/,\s*|\s+and\s+/).includes(num);
}
function findFedSections(sections, num) {
  const exact = sections.filter((s) => s.num === num);
  return exact.length > 0 ? exact : sections.filter((s) => s.range && inRange(s.num, num));
}
function hasNotInForcePart(node) {
  return node.attrs["in-force"] === "no" || node.children.some((c) => isEl(c) && hasNotInForcePart(c));
}
function fedDocInfo(doc) {
  const root = doc.children.find(isEl);
  const kind = root?.name === "Statute" ? "act" : root?.name === "Regulation" ? "regulation" : "unknown";
  const ident = root ? child(root, "Identification") : void 0;
  const text2 = (name) => {
    const n = ident ? child(ident, name) : void 0;
    return n ? inlineText2(n) || null : null;
  };
  const numbered = bodySections(doc).filter((s) => /^\d/.test(s.num));
  return {
    kind,
    title: text2("ShortTitle") ?? text2("LongTitle"),
    instrumentNumber: text2("InstrumentNumber"),
    lastAmended: root?.attrs["lims:lastAmendedDate"] ?? null,
    allRepealed: numbered.length > 0 && numbered.every((s) => s.repealed),
    readerNote: text2("ReaderNote")
  };
}
function instruction(n) {
  return n.children.map((c) => !isEl(c) ? c : c.name === "AmendedText" || c.name === "HistoricalNote" || c.name === "Footnote" ? " " : ` ${instruction(c)} `).join("");
}
var PROVISION = String.raw`\b(?:sub)?(?:section|paragraph|subparagraph|clause)s?\b`;
var CHANGED = new RegExp(String.raw`(${PROVISION}\s(?:(?!${PROVISION})[^:;])*?)\s(?:is|are)\s(?:replaced|amended|repealed)\b`, "gi");
function notInForce(doc) {
  const root = doc.children.find(isEl);
  const nif = root?.children.find((c) => isEl(c) && c.name === "Schedule" && c.attrs.id === "NifProvs");
  if (!nif) return [];
  const out = [];
  const collect = (n) => {
    for (const c of n.children) {
      if (!isEl(c)) continue;
      if (c.name !== "RelatedOrNotInForce") {
        collect(c);
        continue;
      }
      const h = child(c, "Heading");
      const citation = h ? headingText(h).replace(/^[\s—–-]+/, "") : "";
      const nums = /* @__PURE__ */ new Set();
      const added = (x, inAmended) => {
        for (const k of x.children) {
          if (!isEl(k)) continue;
          if (inAmended && k.name === "Section") {
            const l = child(k, "Label");
            if (l) nums.add(inlineText2(l));
          }
          added(k, inAmended || k.name === "AmendedText");
        }
      };
      const said = tidy2(instruction(c));
      for (const m of said.matchAll(CHANGED)) {
        for (const d of m[1].split(/\sof\s/)[0].matchAll(/(?<![\w.(])(\d+(?:\.\d+)*)/g)) nums.add(d[1]);
      }
      added(c, false);
      out.push({ citation, sections: [...nums] });
    }
  };
  collect(nif);
  return out;
}
function fedToc(doc) {
  const lines = [];
  walkLaw(doc, {
    heading: (text2, depth) => lines.push(indent2(depth) + text2),
    section: (node, location) => {
      const s = toSection(node, location);
      if (s.num !== "") lines.push(`${indent2(location.length)}${s.num}  ${s.heading ?? (s.repealed ? "Repealed" : "")}`.trimEnd());
    }
  });
  return lines.join("\n");
}
function allOf(n, name) {
  return n.children.flatMap((c) => !isEl(c) ? [] : c.name === name ? [c, ...allOf(c, name)] : allOf(c, name));
}
function sectionRecords(doc) {
  return bodySections(doc).filter((s) => /^\d/.test(s.num) && !s.range && !s.repealed).map((s) => ({
    num: s.num,
    heading: s.heading,
    nearestHeading: s.nearestHeading,
    location: s.location,
    text: renderFedSection(s.node),
    notes: allOf(s.node, "MarginalNote").map((m) => inlineText2(m)).join(" | "),
    definedTerms: allOf(s.node, "DefinedTermEn").map((d) => inlineText2(d))
  }));
}

// src/sources/federal.ts
var CONCURRENCY2 = 4;
var SEARCHED_ACT = "L-2";
var LEGIS_URL = `${FED_BASE}/eng/XML/Legis.xml`;
var xmlUrl = (id) => `${FED_BASE}/eng/XML/${id}.xml`;
var folder = (kind) => kind === "regulation" ? "regulations" : "acts";
var fedPageUrl = (kind, id) => `${FED_BASE}/eng/${folder(kind)}/${id}/index.html`;
var sectionUrl = (kind, id, num) => `${FED_BASE}/eng/${folder(kind)}/${id}/section-${num}.html`;
var word = (kind) => kind === "regulation" ? "regulation" : "act";
var FederalClient = class {
  fetcher;
  parsed = /* @__PURE__ */ new Map();
  searchable = /* @__PURE__ */ new Map();
  legisCache = null;
  constructor(opts) {
    this.fetcher = opts.fetcher;
  }
  // ---------- find_act ----------
  async findAct(name) {
    const clean = name.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) throw new ToolError("name is empty.");
    const q = clean.toLowerCase();
    const words = q.split(" ").map((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
    const rank = (e) => {
      const t = e.title.toLowerCase();
      return t === q ? 0 : t.includes(q) ? 1 : words.every((w) => w.test(t)) ? 2 : -1;
    };
    const found = (await this.legis()).map((e, order) => ({ e, r: rank(e), order })).filter((x) => x.r >= 0).sort((a, b) => a.r - b.r || (a.e.kind === b.e.kind ? 0 : a.e.kind === "act" ? -1 : 1) || a.e.title.length - b.e.title.length || a.order - b.order).slice(0, 10);
    const pages = await mapLimit(found, CONCURRENCY2, ({ e }) => this.pageMeta(e.kind, e.id));
    return found.map(({ e }, i) => ({ act_id: e.id, title: e.title, citation: pages[i].citation ?? "", type: e.kind, source_url: fedPageUrl(e.kind, e.id) }));
  }
  // ---------- get_toc ----------
  async getToc(actId) {
    const { id, doc, info, fetchedAt } = await this.load(actId);
    const page = await this.pageMeta(info.kind, id);
    const pending = notInForce(doc);
    return {
      act: {
        jurisdiction: "federal",
        act_title: info.title ?? page.title ?? id,
        act_citation: page.citation ?? info.instrumentNumber ?? "",
        act_id: id,
        source_url: fedPageUrl(info.kind, id),
        current_to: page.currentTo,
        retrieved_at: fetchedAt
      },
      outline: fedToc(doc),
      warnings: [...docWarnings(info, page), ...info.allRepealed ? [`Every section of this ${word(info.kind)} reads "[Repealed\u2026]": it is repealed.`] : []],
      notes: pending.length > 0 ? [`This ${word(info.kind)} lists ${pending.length} amendment${pending.length === 1 ? "" : "s"} not in force yet. They are not in this outline; the official page lists them under "Amendments not in force".`] : [],
      notice: FEDERAL_NOTICE
    };
  }
  // ---------- get_section ----------
  async getSection(actId, section) {
    const num = normalizeSection(section);
    const { id, doc, info, fetchedAt } = await this.load(actId);
    const title = info.title ?? id;
    if (info.allRepealed) {
      throw new ToolError(`${title} (${id}) is repealed: every section of it reads "[Repealed\u2026]". Find the current act with find_act (tool) or find (command).`);
    }
    const matches = findFedSections(bodySections(doc), num);
    const pending = notInForce(doc);
    const pendingFor = (n) => pending.filter((a) => a.sections.includes(n)).map((a) => a.citation);
    if (matches.length === 0) {
      const adds = pendingFor(num);
      if (adds.length > 0) {
        throw new ToolError(
          `Section ${num} of ${title} (${id}) is not in force: only an amendment that is not in force yet would add or change it (${adds.join("; ")}). The official page lists it under "Amendments not in force": ${fedPageUrl(info.kind, id)}`
        );
      }
      throw new ToolError(`No section ${num} in ${title} (${id}). Its table of contents (get_toc tool, or toc command) lists the section numbers.`);
    }
    const page = await this.pageMeta(info.kind, id);
    const warnings = docWarnings(info, page);
    if (matches.length > 1) warnings.push(`${matches.length} provisions are numbered ${num} in this ${word(info.kind)} (for example one in a schedule). All are returned; check "location".`);
    for (const m of matches) {
      if (m.range) warnings.push(`Sections ${m.num} were repealed together. The official website has no page for section ${num} on its own, so source_url is the table of contents.`);
      else if (m.repealed) warnings.push(`Section ${m.num} is repealed.`);
      if (hasNotInForcePart(m.node)) warnings.push(`Part of section ${m.num} is not in force yet: it is marked "[Not in force]" (shaded on the official page).`);
      const changes = pendingFor(m.num);
      if (changes.length > 0) {
        warnings.push(
          `An amendment that is not in force yet would change section ${m.num} (${changes.join("; ")}). The text returned is the text in force; the official page lists the amendment under "Amendments not in force".`
        );
      }
    }
    const results = matches.map((m) => ({
      citation: {
        jurisdiction: "federal",
        act_title: title,
        act_citation: page.citation ?? info.instrumentNumber ?? "",
        act_id: id,
        section: m.num,
        heading: m.heading,
        source_url: m.range ? fedPageUrl(info.kind, id) : sectionUrl(info.kind, id, m.num),
        current_to: page.currentTo,
        retrieved_at: fetchedAt
      },
      location: m.location,
      text: renderFedSection(m.node)
    }));
    const [first, ...others] = results;
    return { ...first, ...others.length > 0 ? { other_matches: others } : {}, warnings, notice: FEDERAL_NOTICE };
  }
  // ---------- search_law ----------
  async search(query, limit = 10) {
    return (await this.searchScored(query, limit)).output;
  }
  /** search() plus each result's score, so that search_law "all" can rank BC and federal results together. */
  async searchScored(query, limit = 10) {
    const phrases = parsePhrases(query);
    if (phrases.length === 0) throw new ToolError("query is empty.");
    const alternatives = phrases.map(phrasePattern).join("|");
    const hitsIn = (s) => (s.match(new RegExp(alternatives, "gi")) ?? []).length;
    const has = (s) => s !== null && new RegExp(alternatives, "i").test(s);
    const whole = new RegExp(`^(?:${alternatives})$`, "i");
    const mark = (s) => s.replace(new RegExp(alternatives, "gi"), (m) => `**${m}**`);
    const warnings = [];
    const scope = await this.searchScope(warnings);
    let searched = 0;
    const perDoc = await mapLimit(scope, CONCURRENCY2, async (entry, docIndex) => {
      const res = await this.fetcher(xmlUrl(entry.id));
      if (res.status !== 200) {
        warnings.push(`${entry.title} (${entry.id}) could not be read (HTTP ${res.status}), so it was not searched.`);
        return [];
      }
      searched++;
      const { info, records } = this.toSearchable(res);
      return records.flatMap((r2, secIndex) => {
        const hits = hitsIn(r2.text) + hitsIn(r2.notes);
        const above = has(r2.nearestHeading);
        if (hits === 0 && !above) return [];
        const exact = r2.definedTerms.some((t) => whole.test(t));
        const partial = !exact && r2.definedTerms.some((t) => has(t));
        const heading = has(r2.heading);
        const headingFirst = heading && new RegExp(`^(?:${alternatives})`, "i").test(r2.heading ?? "");
        const score = (exact ? 100 : partial ? 20 : 0) + (heading ? 50 : 0) + (headingFirst ? 10 : 0) + (above ? 30 : 0) + Math.min(hits, 10) + (entry.kind === "act" ? 15 : 0);
        const match = [
          ...exact ? ["defines the term"] : partial ? ["inside a defined term"] : [],
          ...heading ? ["heading"] : [],
          ...above ? ["heading above the section"] : [],
          `${hits} hit${hits === 1 ? "" : "s"}`
        ];
        return [{ entry, r: r2, info, fetchedAt: res.fetchedAt, score, match, order: docIndex * 1e5 + secIndex }];
      });
    });
    const top = perDoc.flat().sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit);
    const pages = /* @__PURE__ */ new Map();
    await mapLimit([...new Set(top.map((h) => h.entry.id))], CONCURRENCY2, async (id) => {
      const h = top.find((x) => x.entry.id === id);
      pages.set(id, await this.pageMeta(h.info.kind, id));
    });
    const undated = [...pages].filter(([, p]) => !p.currentTo).map(([id]) => id);
    if (undated.length > 0) warnings.push(`${CURRENT_TO_WARNING} (${undated.join(", ")})`);
    const scored = top.map(({ entry, r: r2, info, fetchedAt, score, match }) => {
      const page = pages.get(entry.id);
      const body = r2.text.split("\n").map(mark).join(" ").replace(/\s+/g, " ");
      const lead = has(r2.heading) ? mark(r2.heading) : has(r2.nearestHeading) ? mark(r2.nearestHeading) : null;
      const snippet = cutSnippet(body, () => `${lead ? `[${lead}] ` : ""}${body.length > 240 ? body.slice(0, 240) + "\u2026" : body}`);
      return {
        score,
        result: {
          jurisdiction: "federal",
          act_title: info.title ?? entry.title,
          act_citation: page.citation ?? info.instrumentNumber ?? "",
          act_id: entry.id,
          section: r2.num,
          heading: r2.heading,
          source_url: sectionUrl(info.kind, entry.id, r2.num),
          current_to: page.currentTo,
          retrieved_at: fetchedAt,
          snippet,
          match
        }
      };
    });
    const regs = scope.length - 1;
    return {
      output: {
        query: phrases.map((p) => `"${p}"`).join(" OR "),
        documents_searched: searched,
        results: scored.map((s) => s.result),
        warnings,
        notes: [
          `Federal search covers the Canada Labour Code and the ${regs} regulation${regs === 1 ? "" : "s"} made under it, from the official list of acts and regulations. Other federal acts and regulations, and amendments not in force yet, are not searched: find an act with find_act, then read it with get_toc and get_section.`,
          LITERAL_NOTE,
          SNIPPET_NOTE
        ],
        notice: FEDERAL_NOTICE
      },
      scored
    };
  }
  /** The Canada Labour Code and, from the official list, the regulations made under it. */
  async searchScope(warnings) {
    const code = { id: SEARCHED_ACT, title: "Canada Labour Code", kind: "act" };
    let list;
    try {
      list = await this.legis();
    } catch (e) {
      if (!(e instanceof ToolError)) throw e;
      warnings.push(`The official list of acts and regulations could not be read (${e.message.match(/HTTP \d+/)?.[0] ?? "error"}), so only the Canada Labour Code itself was searched, not its regulations.`);
      return [code];
    }
    const act = list.find((e) => e.id === SEARCHED_ACT);
    const regs = (act?.regRefs ?? []).flatMap((ref) => list.filter((e) => e.ref === ref));
    return [{ ...code, title: act?.title ?? code.title }, ...regs.map((e) => ({ id: e.id, title: e.title, kind: e.kind }))];
  }
  toSearchable(res) {
    const key = `${res.url}@${res.fetchedAt}`;
    let s = this.searchable.get(key);
    if (!s) {
      const doc = parseXml2(res.body);
      s = { info: fedDocInfo(doc), records: sectionRecords(doc) };
      this.searchable.set(key, s);
      if (this.searchable.size > 80) this.searchable.delete(this.searchable.keys().next().value);
    }
    return s;
  }
  // ---------- internals ----------
  async load(actId) {
    const id = normalizeFedId(actId);
    const res = await this.fetcher(xmlUrl(id));
    if (res.status === 404) throw new ToolError(`No federal act or regulation with act_id "${id}". Look up the id with find_act (tool) or find (command).`);
    if (res.status !== 200) throw new ToolError(`Justice Laws returned HTTP ${res.status} for ${id}.`);
    const doc = this.parse(res);
    const info = fedDocInfo(doc);
    if (info.kind === "unknown") throw new ToolError(`${id} is not an act or regulation in XML form. Look up the act id with find_act (tool) or find (command).`);
    return { id, doc, info, fetchedAt: res.fetchedAt };
  }
  parse(res) {
    const key = `${res.url}@${res.fetchedAt}`;
    let doc = this.parsed.get(key);
    if (!doc) {
      doc = parseXml2(res.body);
      this.parsed.set(key, doc);
      if (this.parsed.size > 6) this.parsed.delete(this.parsed.keys().next().value);
    }
    return doc;
  }
  async pageMeta(kind, id) {
    const res = await this.fetcher(fedPageUrl(kind, id));
    return res.status === 200 ? parseFedPage(res.body) : { title: null, citation: null, currentTo: null, lastAmended: null };
  }
  /** The English entries of the official list of acts and regulations. */
  async legis() {
    const res = await this.fetcher(LEGIS_URL);
    if (res.status !== 200) {
      throw new ToolError(`The official list of federal acts and regulations could not be read (HTTP ${res.status}). Try again later, or pass a known act_id (such as L-2) to get_toc.`);
    }
    const key = `${res.url}@${res.fetchedAt}`;
    if (this.legisCache?.key !== key) this.legisCache = { key, entries: parseLegis(res.body) };
    return this.legisCache.entries;
  }
};
function docWarnings(info, page) {
  const w = [];
  if (!page.currentTo) w.push(CURRENT_TO_WARNING);
  if (page.lastAmended && info.lastAmended && page.lastAmended !== info.lastAmended) {
    w.push(
      `The official page says this ${word(info.kind)} was last amended on ${page.lastAmended}, but the XML text is the version last amended on ${info.lastAmended}, so it may not be the current text. Check source_url.`
    );
  }
  if (info.readerNote) w.push(`Official note on this ${word(info.kind)}: ${info.readerNote}`);
  return w;
}
function parsePhrases(query) {
  return query.split(/\s+OR\s+/).map((p) => p.trim().replace(/^[("\s]+|[)"\s]+$/g, "").trim()).filter(Boolean);
}
function phrasePattern(phrase) {
  const words = phrase.split(/\s+/).map((w) => {
    const star = w.endsWith("*");
    const core = (star ? w.slice(0, -1) : w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['\u2019]/g, "['\u2019]");
    return star ? `${core}\\w*` : core;
  });
  return `(?<![\\w])${words.join("\\s+")}(?![\\w])`;
}

// src/cli-entry.ts
var glossary = loadGlossary(fileURLToPath(new URL("../assets/glossary.json", import.meta.url)));
var fetcher = createCachedFetcher({ cacheDir: join2(tmpdir(), "canada-law-cache") });
var r = await runCli(process.argv.slice(2), { bc: new BcClient({ fetcher }), federal: new FederalClient({ fetcher }), glossary });
if (r.stdout) process.stdout.write(r.stdout + "\n");
if (r.stderr) process.stderr.write(r.stderr + "\n");
process.exitCode = r.code;
