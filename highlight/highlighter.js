import { parseKeywords } from './keyword-manager.js';

/** DOM text-layer highlighter. No PDF.js dependency, so other surfaces can reuse it. */
export class Highlighter {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.pages = [];
    this.keywords = [];
    this.matches = [];
    this.currentIndex = -1;
    this.modified = new Map();
  }

  setPages(pages) {
    this.clearHighlights();
    this.pages = pages;
  }

  setKeywords(input) {
    this.keywords = Array.isArray(input) ? input : parseKeywords(input);
  }

  clearHighlights() {
    for (const [element, children] of this.modified) element.replaceChildren(...children);
    this.modified.clear();
    this.matches = [];
    this.currentIndex = -1;
    this.onChange(this);
  }

  getMatchCounts() {
    const counts = this.keywords.map(keyword => ({ label: keyword.label, count: 0 }));
    for (const match of this.matches) counts[match.keywordIndex].count++;
    return counts;
  }

  highlightDocument({ focusFirst = true } = {}) {
    this.clearHighlights();
    const all = [];
    for (const page of this.pages) {
      const { text, locations } = buildIndex(page.spans);
      const candidates = [];
      this.keywords.forEach((keyword, keywordIndex) => {
        const regex = new RegExp(keyword.regex.source, keyword.regex.flags.includes('g') ? keyword.regex.flags : keyword.regex.flags + 'g');
        for (const hit of text.matchAll(regex)) {
          if (!hit[0].length) continue;
          candidates.push({ start: hit.index, end: hit.index + hit[0].length, keywordIndex, pageNumber: page.pageNumber, locations });
        }
      });
      candidates.sort((a, b) => a.start - b.start || b.end - a.end || a.keywordIndex - b.keywordIndex);
      let occupiedUntil = 0;
      for (const candidate of candidates) {
        if (candidate.start < occupiedUntil) continue;
        occupiedUntil = candidate.end;
        all.push(candidate);
      }
    }
    const fragmentsByElement = new Map();
    for (const match of all) {
      match.elements = [];
      let lastElement = null;
      let fragmentStart = 0;
      const finish = end => {
        if (lastElement && end > fragmentStart) {
          if (!fragmentsByElement.has(lastElement)) fragmentsByElement.set(lastElement, []);
          fragmentsByElement.get(lastElement).push({ start: fragmentStart, end, match });
        }
      };
      for (let i = match.start; i < match.end; i++) {
        const location = match.locations[i];
        if (!location) { finish(i); lastElement = null; continue; }
        if (location.element !== lastElement) {
          finish(i);
          lastElement = location.element;
          fragmentStart = location.offset;
        }
        const next = match.locations[i + 1];
        if (i === match.end - 1 || !next || next.element !== lastElement || next.offset !== location.offset + 1) {
          finish(location.offset + 1);
          lastElement = null;
        }
      }
      delete match.locations;
    }
    for (const [element, fragments] of fragmentsByElement) {
      const original = [...element.childNodes];
      this.modified.set(element, original);
      const source = element.textContent;
      fragments.sort((a, b) => a.start - b.start);
      const nodes = [];
      let cursor = 0;
      for (const fragment of fragments) {
        if (fragment.start < cursor) continue;
        if (fragment.start > cursor) nodes.push(document.createTextNode(source.slice(cursor, fragment.start)));
        const mark = document.createElement('mark');
        mark.className = 'ht-highlight';
        mark.textContent = source.slice(fragment.start, fragment.end);
        fragment.match.elements.push(mark);
        nodes.push(mark);
        cursor = fragment.end;
      }
      if (cursor < source.length) nodes.push(document.createTextNode(source.slice(cursor)));
      element.replaceChildren(...nodes);
    }
    this.matches = all;
    this.currentIndex = -1;
    if (all.length && focusFirst) this.goToMatch(0);
    else this.onChange(this);
    return all;
  }

  goToMatch(index) {
    if (!this.matches.length) return;
    for (const element of this.matches[this.currentIndex]?.elements || []) element.classList.remove('ht-current');
    this.currentIndex = (index + this.matches.length) % this.matches.length;
    const match = this.matches[this.currentIndex];
    for (const element of match.elements) element.classList.add('ht-current');
    match.elements[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.onChange(this);
  }

  nextMatch() { this.goToMatch(this.currentIndex + 1); }
  previousMatch() { this.goToMatch(this.currentIndex - 1); }
}

function buildIndex(spans) {
  let text = '';
  const locations = [];
  let previous = null;
  for (const element of spans) {
    const value = element.textContent || '';
    if (!value) continue;
    if (previous && needsSpace(previous, element)) {
      text += ' ';
      locations.push(null);
    }
    for (let offset = 0; offset < value.length; offset++) locations.push({ element, offset });
    text += value;
    previous = element;
  }
  return { text, locations };
}

function needsSpace(left, right) {
  const a = left.textContent || '';
  const b = right.textContent || '';
  if (/\s$/.test(a) || /^\s/.test(b)) return false;
  const x = left.getBoundingClientRect();
  const y = right.getBoundingClientRect();
  if (Math.abs(x.top - y.top) > Math.max(x.height, y.height) * 0.5) return true;
  return y.left - x.right > Math.max(1, x.height * 0.12);
}
