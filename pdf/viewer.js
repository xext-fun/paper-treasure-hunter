import { getDocument, GlobalWorkerOptions, TextLayer } from './pdf.mjs';
import { Highlighter } from '../highlight/highlighter.js';
import { formatTerm, validateLibrary } from '../highlight/keyword-manager.js';

GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', import.meta.url).href;
const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['file','url','open-url','keywords','highlight','clear','preset','add-preset','terms-file','match-total','match-list','previous','next','status','file-name','zoom-out','zoom-in','zoom-label','fit-width','page-number','total-pages','pdf-scroll','pages'].map(id => [id, $(id)]));
const highlighter = new Highlighter(updateMatches);
let pdf = null;
let scale = 1;
let fitWidth = false;
let renderVersion = 0;
let library;
let scrollObserver;

function status(message) { ui.status.textContent = message; }
function updateMatches(engine) {
  ui['match-total'].textContent = String(engine.matches.length);
  ui['match-list'].replaceChildren();
  engine.getMatchCounts().forEach(({ label, count }, index) => {
    const item = document.createElement('li');
    if (engine.matches[engine.currentIndex]?.keywordIndex === index) item.className = 'active';
    const name = document.createElement('span'); name.textContent = label;
    const number = document.createElement('span'); number.textContent = String(count);
    item.append(name, number);
    ui['match-list'].append(item);
  });
  ui.previous.disabled = ui.next.disabled = !engine.matches.length;
  if (engine.currentIndex >= 0) ui['page-number'].value = engine.matches[engine.currentIndex].pageNumber;
}

async function initialize() {
  try {
    library = validateLibrary(await (await fetch('../terms/default-terms.json')).json());
    populatePresets();
    const saved = await chrome.storage.local.get('pdfKeywords');
    ui.keywords.value = saved.pdfKeywords ?? library.groups.flatMap(group => group.terms.map(formatTerm)).join('\n');
  } catch (error) { status(`Could not load terms: ${error.message}`); }
  const query = new URLSearchParams(location.search).get('url');
  if (query) { ui.url.value = query; openUrl(query); }
}
function populatePresets() {
  ui.preset.replaceChildren();
  library.groups.forEach((group, index) => {
    const option = document.createElement('option'); option.value = index; option.textContent = group.name; ui.preset.append(option);
  });
}
async function openUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS PDF URL.');
    status('Opening PDF URL…');
    await openPdf({ url: url.href, withCredentials: false }, url.pathname.split('/').pop() || url.href);
  } catch (error) { status(`Could not open URL: ${error.message}. The server may block cross-origin access.`); }
}
async function openPdf(source, name) {
  const version = ++renderVersion;
  highlighter.setPages([]);
  if (pdf) { await pdf.loadingTask.destroy(); pdf = null; }
  ui.pages.replaceChildren();
  ui['file-name'].textContent = name;
  try {
    const task = getDocument(source);
    const document = await task.promise;
    if (version !== renderVersion) { await document.loadingTask.destroy(); return; }
    pdf = document;
    ui['total-pages'].textContent = String(pdf.numPages);
    scale = 1;
    fitWidth = true;
    await renderPdf(version);
  } catch (error) {
    if (version === renderVersion) { ui.pages.innerHTML = '<div class="empty">Unable to display PDF.</div>'; status(`Could not open PDF: ${error.message}`); }
  }
}
async function renderPdf(version = ++renderVersion) {
  if (!pdf) return;
  const shouldHighlight = highlighter.matches.length > 0;
  const previousMatchIndex = highlighter.currentIndex;
  const scrollFraction = ui['pdf-scroll'].scrollTop / Math.max(1, ui['pdf-scroll'].scrollHeight - ui['pdf-scroll'].clientHeight);
  highlighter.setPages([]);
  ui.pages.replaceChildren();
  const pageModels = [];
  let textCharacters = 0;
  if (fitWidth) {
    const first = await pdf.getPage(1);
    scale = Math.max(0.25, Math.min(4, (ui['pdf-scroll'].clientWidth - 64) / first.getViewport({ scale: 1 }).width));
  }
  ui['zoom-label'].textContent = `${Math.round(scale * 100)}%`;
  for (let number = 1; number <= pdf.numPages; number++) {
    if (version !== renderVersion) return;
    status(`Rendering page ${number} of ${pdf.numPages}…`);
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale });
    const holder = document.createElement('section'); holder.className = 'page'; holder.dataset.pageNumber = number;
    holder.style.width = `${viewport.width}px`; holder.style.height = `${viewport.height}px`;
    const canvas = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    const textLayerElement = document.createElement('div'); textLayerElement.className = 'textLayer';
    holder.append(canvas, textLayerElement); ui.pages.append(holder);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
    const textContent = await page.getTextContent();
    textCharacters += textContent.items.reduce((sum, item) => sum + (item.str?.trim().length || 0), 0);
    const layer = new TextLayer({ textContentSource: textContent, container: textLayerElement, viewport });
    await layer.render();
    pageModels.push({ pageNumber: number, spans: layer.textDivs });
  }
  if (version !== renderVersion) return;
  highlighter.setPages(pageModels);
  if (scrollObserver) scrollObserver.disconnect();
  scrollObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible && highlighter.currentIndex < 0) ui['page-number'].value = visible.target.dataset.pageNumber;
  }, { root: ui['pdf-scroll'], threshold: [0, .25, .5, .75] });
  ui.pages.querySelectorAll('.page').forEach(element => scrollObserver.observe(element));
  if (!textCharacters) { status('This PDF does not contain selectable text. OCR support is required.'); return; }
  status(`Ready · ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`);
  if (shouldHighlight) {
    applyHighlights(false);
    if (highlighter.matches.length && previousMatchIndex >= 0) highlighter.goToMatch(previousMatchIndex);
  } else {
    ui['pdf-scroll'].scrollTop = scrollFraction * Math.max(0, ui['pdf-scroll'].scrollHeight - ui['pdf-scroll'].clientHeight);
  }
}
function applyHighlights(focusFirst = true) {
  if (!pdf) { status('Open a PDF first.'); return; }
  try {
    highlighter.setKeywords(ui.keywords.value);
    highlighter.highlightDocument({ focusFirst });
    status(`${highlighter.matches.length} match${highlighter.matches.length === 1 ? '' : 'es'} found.`);
    chrome.storage.local.set({ pdfKeywords: ui.keywords.value });
  } catch (error) { status(error.message); }
}
ui.file.addEventListener('change', async () => {
  const file = ui.file.files?.[0]; if (!file) return;
  status('Opening local PDF…');
  await openPdf({ data: new Uint8Array(await file.arrayBuffer()) }, file.name);
});
ui['open-url'].addEventListener('click', () => openUrl(ui.url.value.trim()));
ui.url.addEventListener('keydown', event => { if (event.key === 'Enter') openUrl(ui.url.value.trim()); });
ui.highlight.addEventListener('click', () => applyHighlights());
ui.clear.addEventListener('click', () => { highlighter.clearHighlights(); status('Highlights cleared.'); });
ui.previous.addEventListener('click', () => highlighter.previousMatch());
ui.next.addEventListener('click', () => highlighter.nextMatch());
ui.keywords.addEventListener('input', () => chrome.storage.local.set({ pdfKeywords: ui.keywords.value }));
ui['add-preset'].addEventListener('click', () => {
  const terms = library.groups[Number(ui.preset.value)].terms.map(formatTerm).join('\n');
  ui.keywords.value = [ui.keywords.value.trim(), terms].filter(Boolean).join('\n');
  chrome.storage.local.set({ pdfKeywords: ui.keywords.value });
});
ui['terms-file'].addEventListener('change', async () => {
  try {
    const file = ui['terms-file'].files?.[0]; if (!file) return;
    library = validateLibrary(JSON.parse(await file.text())); populatePresets();
    status(`Loaded ${library.groups.length} terms group${library.groups.length === 1 ? '' : 's'}. Select one and click Add terms.`);
  } catch (error) { status(`Invalid terms file: ${error.message}`); }
});
ui['zoom-in'].addEventListener('click', () => { fitWidth = false; scale = Math.min(4, scale * 1.2); renderPdf(); });
ui['zoom-out'].addEventListener('click', () => { fitWidth = false; scale = Math.max(.25, scale / 1.2); renderPdf(); });
ui['fit-width'].addEventListener('click', () => { fitWidth = true; renderPdf(); });
ui['page-number'].addEventListener('change', () => {
  const number = Math.max(1, Math.min(pdf?.numPages || 1, Number(ui['page-number'].value) || 1));
  ui['page-number'].value = number;
  ui.pages.querySelector(`[data-page-number="${number}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});
window.addEventListener('resize', () => { if (fitWidth && pdf) renderPdf(); });
initialize();
