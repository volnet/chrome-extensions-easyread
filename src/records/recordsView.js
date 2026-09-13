import * as easyReadTools from '../scripts/easyReadTools.js';
import { indexRecords } from '../scripts/easyReadData.mjs';

// One controller for the standalone page and the embedded settings history.
export function initializeRecords(root = document) {
  const get = id => root.querySelector('#' + id);
  const PAGE_SIZE = 500;
  let allRecords = {};
  let sortedRecords = [];
  let currentPage = 1;
  let artifactsByPage = {};

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "";
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remaining = total % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
      : `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  function renderPage(page) {
    const totalItems = sortedRecords.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const normalizedPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const startIndex = (normalizedPage - 1) * PAGE_SIZE;
    const pagination = { items: sortedRecords.slice(startIndex, startIndex + PAGE_SIZE), currentPage: normalizedPage, totalItems, totalPages, startIndex };
    currentPage = pagination.currentPage;
    const fragment = document.createDocumentFragment();
    const template = get('line_template');

    for (const [index, item] of pagination.items.entries()) {
      const row = template.content.firstElementChild.cloneNode(true);
      row.querySelector('.seq').textContent = String(pagination.startIndex + index + 1);
      row.querySelector('.title').textContent = item.title || item.url || item.key;
      const link = row.querySelector('a');
      if (easyReadTools.isSupportedScheme(item.url || item.key)) link.href = item.url || item.key;
      else link.removeAttribute('href');
      link.title = item.url || item.key;
      link.rel = 'noopener noreferrer';
      row.querySelector('.readedTimes').textContent = String(item.datetimes?.length ?? 0);
      const latestRead = item.latestRead;
      row.querySelector('.lastReadTime').textContent = latestRead ? easyReadTools.formatDate(latestRead) : "";
      if (Number.isFinite(item.position?.progress)) {
        row.querySelector('.readProgress').textContent = `${item.position.progress.toFixed(2)}%`;
      }
      if (Number.isFinite(item.videoProgress?.progress)) {
        row.querySelector('.videoProgress').textContent = `${formatDuration(item.videoProgress.currentTime)} / ${formatDuration(item.videoProgress.duration)} (${item.videoProgress.progress.toFixed(2)}%)`;
      }
      const copies = artifactsByPage[item.key]?.artifacts ?? [];
      if (copies.length) {
        const formats = [...new Set(copies.map((copy) => String(copy.format || '').toUpperCase()).filter(Boolean))];
        row.querySelector('.artifacts').textContent = `${copies.length} · ${formats.join(', ')}`;
        row.querySelector('.artifacts').title = copies.map((copy) => copy.fileName).join("\n");
      }
      fragment.appendChild(row);
    }

    get('recordsBody').replaceChildren(fragment);
    get('recordsEmpty').hidden = totalItems > 0;
    get('recordSummary').textContent = easyReadTools.getMessageForLocales("allrecords_page_summary", [pagination.totalItems, PAGE_SIZE]);
    get('pageIndicator').textContent = easyReadTools.getMessageForLocales("allrecords_page_indicator", [pagination.currentPage, pagination.totalPages]);
    get('previousPage').disabled = pagination.currentPage <= 1;
    get('nextPage').disabled = pagination.currentPage >= pagination.totalPages;
  }


  function showError(error) {
    const status = get('recordsEmpty');
    status.hidden = false;
    status.textContent = easyReadTools.getMessageForLocales('ui_operation_failed');
    globalThis.EasyReadDiagnostics?.record(error, { source: 'records' }, status);
  }
  get('previousPage').addEventListener('click', () => renderPage(currentPage - 1));
  get('nextPage').addEventListener('click', () => renderPage(currentPage + 1));
  get('exportRecords').addEventListener('click', async () => {
    const button = get('exportRecords');
    button.disabled = true;
    try {
      const data = await chrome.storage.local.get(easyReadTools.ALL_RECORDS_NAME);
      easyReadTools.exportToJsonFile({ [easyReadTools.ALL_RECORDS_NAME]: data[easyReadTools.ALL_RECORDS_NAME] ?? {} }, `EasyRead-allRecords-${easyReadTools.getNowDateTimeString()}.json`);
    } catch (error) { showError(error); }
    finally { button.disabled = false; }
  });
  let revision = 0;
  async function refresh() {
    const request = ++revision;
    try {
      const result = await chrome.storage.local.get([easyReadTools.ALL_RECORDS_NAME, easyReadTools.ARTIFACTS_NAME]);
      if (request !== revision) return;
      allRecords = result[easyReadTools.ALL_RECORDS_NAME] ?? {};
      sortedRecords = indexRecords(allRecords);
      artifactsByPage = result[easyReadTools.ARTIFACTS_NAME] ?? {};
      get('recordsEmpty').textContent = easyReadTools.getMessageForLocales('ui_records_empty');
      renderPage(currentPage);
      if (get('createdTime')) get('createdTime').textContent = easyReadTools.formatDate(Date.now());
    } catch (error) { if (request === revision) showError(error); }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[easyReadTools.ALL_RECORDS_NAME] || changes[easyReadTools.ARTIFACTS_NAME])) void refresh();
  });
  get("previousPage").textContent = easyReadTools.getMessageForLocales("allrecords_page_previous");
  get("nextPage").textContent = easyReadTools.getMessageForLocales("allrecords_page_next");
  get("recordsHeaderNumber").textContent = easyReadTools.getMessageForLocales("allrecords_header_number");
  get("recordsHeaderTitle").textContent = easyReadTools.getMessageForLocales("allrecords_header_title");
  get("recordsHeaderReadTimes").textContent = easyReadTools.getMessageForLocales("allrecords_header_read_times");
  get("recordsHeaderLastReadTime").textContent = easyReadTools.getMessageForLocales("allrecords_header_last_read_time");
  get("exportRecords").textContent = easyReadTools.getMessageForLocales("allrecords_export");
  get("recordsHeaderReadProgress").textContent = easyReadTools.getMessageForLocales("allrecords_header_read_progress");
  get("recordsHeaderVideoProgress").textContent = easyReadTools.getMessageForLocales("allrecords_header_video_progress");
  get("recordsHeaderArtifacts").textContent = easyReadTools.getMessageForLocales("allrecords_header_artifacts");

  get('previousPage').disabled = true;
  get('nextPage').disabled = true;
  void refresh();
}
