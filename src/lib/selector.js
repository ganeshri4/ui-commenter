/**
 * Stable CSS Selector Generator & Context Extractor for UI Commenter
 * Generates resilient selectors prioritizing ID > data attributes > clean classes > nth-of-type paths.
 */

/**
 * Checks if an ID appears stable (avoids ephemeral framework-generated IDs like react-aria-123)
 */
function isStableId(id) {
  if (!id || typeof id !== "string") return false;
  // Ignore purely numerical IDs, common dynamic patterns (e.g. :r1:, uuid-like hex strings)
  if (/^[0-9]+$/.test(id)) return false;
  if (/^(:r|react-aria|radix-|_ngcontent|ember|vue-)/i.test(id)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(id)) return false; // UUID
  return true;
}

/**
 * Generates a stable CSS selector for any DOM element
 * @param {Element} element
 * @returns {string}
 */
export function generateSelector(element) {
  if (!(element instanceof Element)) return "";

  // 1. Check unique ID
  if (element.id && isStableId(element.id)) {
    const escaped = CSS.escape(element.id);
    try {
      if (document.querySelectorAll(`#${escaped}`).length === 1) {
        return `#${escaped}`;
      }
    } catch (e) {}
  }

  // 2. Check prioritized data attributes / testing hooks
  const priorityAttrs = [
    "data-testid",
    "data-test-id",
    "data-cy",
    "data-qa",
    "data-id",
    "data-component",
    "aria-label",
    "name"
  ];

  for (const attr of priorityAttrs) {
    const val = element.getAttribute(attr);
    if (val && val.trim().length > 0) {
      const escapedVal = CSS.escape(val);
      const selector = `[${attr}="${escapedVal}"]`;
      try {
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      } catch (e) {}
    }
  }

  // 3. Hierarchical path builder
  const path = [];
  let curr = element;

  while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.body && curr !== document.documentElement) {
    let selectorPart = curr.nodeName.toLowerCase();

    // Check unique ID on parent
    if (curr.id && isStableId(curr.id)) {
      const escaped = CSS.escape(curr.id);
      try {
        if (document.querySelectorAll(`#${escaped}`).length === 1) {
          path.unshift(`#${escaped}`);
          break;
        }
      } catch (e) {}
    }

    // Check data-testid on parent
    for (const attr of priorityAttrs) {
      const val = curr.getAttribute(attr);
      if (val && val.trim().length > 0) {
        const escapedVal = CSS.escape(val);
        const candidate = `[${attr}="${escapedVal}"]`;
        try {
          if (document.querySelectorAll(candidate).length === 1) {
            path.unshift(candidate);
            return path.join(" > ");
          }
        } catch (e) {}
      }
    }

    // Class name check (filter out transient utility or state classes)
    const validClasses = Array.from(curr.classList || [])
      .filter(c => !/(active|hover|focus|selected|open|loading|disabled|[0-9a-f]{6,})/i.test(c))
      .slice(0, 2);

    if (validClasses.length > 0) {
      selectorPart += "." + validClasses.map(c => CSS.escape(c)).join(".");
    }

    // Add nth-of-type index if siblings exist with same tag
    const parent = curr.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.nodeName.toLowerCase() === curr.nodeName.toLowerCase()
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(curr) + 1;
        selectorPart += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selectorPart);
    curr = curr.parentElement;

    // Guard against excessive nesting
    if (path.length >= 5) break;
  }

  return path.join(" > ");
}

/**
 * Captures clean, trimmed innerText from an element (up to maxLength chars)
 * @param {Element} element
 * @param {number} maxLength
 * @returns {string}
 */
export function getCleanInnerText(element, maxLength = 250) {
  if (!element || !(element instanceof Element)) return "";
  const raw = element.innerText || element.textContent || "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength) + "…";
}

/**
 * Finds element safely by CSS selector
 * @param {string} selector
 * @returns {Element|null}
 */
export function findElement(selector) {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch (e) {
    return null;
  }
}
