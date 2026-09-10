import '../scripts/diagnostics.js';
import * as easyReadTools from '../scripts/easyReadTools.js';
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
  const template = document.getElementById('line_template');

  for (const [index, item] of pagination.items.entries()) {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('.seq').textContent = String(pagination.startIndex + index + 1);
    row.querySelector('.title').textContent = item.title || item.url || item.key;
    row.querySelector('a').href = item.url || item.key;
    row.querySelector('.readedTimes').textContent = String(item.datetimes?.length ?? 0);
    const latestRead = Math.max(0, ...(item.datetimes ?? []), item.videoProgress?.updatedAt ?? 0);
    row.querySelector('.lastReadTime').textContent = latestRead ? easyReadTools.formatDate(latestRead) : "";
    if (Number.isFinite(item.position?.progress)) {
      row.querySelector('.readProgress').textContent = `${item.position.progress.toFixed(2)}%`;
    }
    if (Number.isFinite(item.videoProgress?.progress)) {
      row.querySelector('.videoProgress').textContent = `${formatDuration(item.videoProgress.currentTime)} / ${formatDuration(item.videoProgress.duration)} (${item.videoProgress.progress.toFixed(2)}%)`;
    }
    const copies = artifactsByPage[item.key]?.artifacts ?? [];
    if (copies.length) {
      const formats = [...new Set(copies.map((copy) => copy.format.toUpperCase()))];
      row.querySelector('.artifacts').textContent = `${copies.length} · ${formats.join(', ')}`;
      row.querySelector('.artifacts').title = copies.map((copy) => copy.fileName).join("\n");
    }
    fragment.appendChild(row);
  }

  document.getElementById('recordsBody').replaceChildren(fragment);
  document.getElementById('recordSummary').textContent = easyReadTools.getMessageForLocales("allrecords_page_summary", [pagination.totalItems, PAGE_SIZE]);
  document.getElementById('pageIndicator').textContent = easyReadTools.getMessageForLocales("allrecords_page_indicator", [pagination.currentPage, pagination.totalPages]);
  document.getElementById('previousPage').disabled = pagination.currentPage <= 1;
  document.getElementById('nextPage').disabled = pagination.currentPage >= pagination.totalPages;
}

document.getElementById('previousPage').addEventListener('click', () => renderPage(currentPage - 1));
document.getElementById('nextPage').addEventListener('click', () => renderPage(currentPage + 1));
document.getElementById('exportRecords').addEventListener('click', () => {
  easyReadTools.exportToJsonFile({ [easyReadTools.ALL_RECORDS_NAME]: allRecords }, `EasyRead-allRecords-${easyReadTools.getNowDateTimeString()}.json`);
});

chrome.storage.local.get([easyReadTools.ALL_RECORDS_NAME, easyReadTools.ARTIFACTS_NAME]).then((result) => {
  allRecords = result[easyReadTools.ALL_RECORDS_NAME] ?? {};
  sortedRecords = Object.entries(allRecords).map(([key, value]) => ({ key, ...value })).sort((left, right) => {
    const latest = (item) => Math.max(0, ...(item.datetimes ?? []), item.videoProgress?.updatedAt ?? 0);
    return latest(right) - latest(left);
  });
  artifactsByPage = result[easyReadTools.ARTIFACTS_NAME] ?? {};
  renderPage(1);
  document.getElementById('createdTime').innerText = easyReadTools.formatDate(Date.now());
});

window.addEventListener('load', () => {
  document.getElementById("allrecords_page_title").textContent = easyReadTools.getMessageForLocales("allrecords_page_title");
  document.getElementById("allrecords_page_notice").textContent = easyReadTools.getMessageForLocales("allrecords_page_notice");
  document.getElementById("previousPage").textContent = easyReadTools.getMessageForLocales("allrecords_page_previous");
  document.getElementById("nextPage").textContent = easyReadTools.getMessageForLocales("allrecords_page_next");
  document.getElementById("recordsHeaderNumber").textContent = easyReadTools.getMessageForLocales("allrecords_header_number");
  document.getElementById("recordsHeaderTitle").textContent = easyReadTools.getMessageForLocales("allrecords_header_title");
  document.getElementById("recordsHeaderReadTimes").textContent = easyReadTools.getMessageForLocales("allrecords_header_read_times");
  document.getElementById("recordsHeaderLastReadTime").textContent = easyReadTools.getMessageForLocales("allrecords_header_last_read_time");
  document.getElementById("exportRecords").textContent = easyReadTools.getMessageForLocales("allrecords_export");
  document.getElementById("recordsHeaderReadProgress").textContent = easyReadTools.getMessageForLocales("allrecords_header_read_progress");
  document.getElementById("recordsHeaderVideoProgress").textContent = easyReadTools.getMessageForLocales("allrecords_header_video_progress");
  document.getElementById("recordsHeaderArtifacts").textContent = easyReadTools.getMessageForLocales("allrecords_header_artifacts");
});
