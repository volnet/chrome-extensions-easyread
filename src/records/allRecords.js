import '../scripts/diagnostics.js';
import * as easyReadTools from '../scripts/easyReadTools.js';
import '../scripts/ui.js';
import { initializeRecords } from './recordsView.js';
await globalThis.EasyReadLocale?.ready;

for (const [id, key] of [
  ['allrecords_page_title', 'allrecords_page_title'],
  ['allrecords_page_notice', 'allrecords_page_notice'],
  ['createdTimeLabel', 'ui_generated_at']
]) document.getElementById(id).textContent = easyReadTools.getMessageForLocales(key);
document.title = easyReadTools.getMessageForLocales('allrecords_page_title');
initializeRecords();
