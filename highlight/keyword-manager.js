/** Parse one literal or named regular expression per line. */
export function parseKeywords(input) {
  const keywords = [];
  for (const [index, raw] of input.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let label = line;
    let expression = line;
    const named = line.match(/^(.+?)\s*::\s*(\/.*\/[a-z]*)$/i);
    if (named) { label = named[1].trim(); expression = named[2]; }
    const regexForm = expression.match(/^\/([\s\S]*)\/([a-z]*)$/i);
    let regex;
    try {
      if (regexForm) {
        const flags = [...new Set((regexForm[2].replace(/g|y/gi, '') + 'gi').split(''))].join('');
        regex = new RegExp(regexForm[1], flags);
      } else {
        regex = new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
      }
    } catch (error) {
      throw new Error(`Line ${index + 1}: ${error.message}`);
    }
    keywords.push({ label, regex, source: line });
  }
  return keywords;
}

export function formatTerm(term) {
  return `${term.label} :: /${term.pattern.replaceAll('/', '\\/')}/i`;
}

export function validateLibrary(data) {
  if (data?.version !== 1 || !Array.isArray(data.groups)) throw new Error('Terms file must have version 1 and a groups array.');
  for (const group of data.groups) {
    if (typeof group.name !== 'string' || !Array.isArray(group.terms)) throw new Error('Each group needs a name and terms array.');
    for (const term of group.terms) {
      if (typeof term.label !== 'string' || typeof term.pattern !== 'string') throw new Error('Each term needs a label and pattern.');
      new RegExp(term.pattern, 'gi');
    }
  }
  return data;
}
