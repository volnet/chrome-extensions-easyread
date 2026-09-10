import '../scripts/diagnostics.js';
import * as easyReadTools from '../scripts/easyReadTools.js';

document.querySelectorAll(".settingsTab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".settingsTab").forEach((item) => item.classList.toggle("isActive", item === tab));
  document.querySelectorAll(".settingsPanel").forEach((panel) => {
    const active = panel.id === tab.dataset.panel;
    panel.hidden = !active;
    panel.classList.toggle("isActive", active);
  });
}));

const highlightsToggle = document.getElementById("settingHighlightsEnabled");
chrome.storage.local.get([easyReadTools.HIGHLIGHTS_ENABLED_NAME]).then((stored) => {
  highlightsToggle.checked = stored[easyReadTools.HIGHLIGHTS_ENABLED_NAME] !== false;
});
highlightsToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ [easyReadTools.HIGHLIGHTS_ENABLED_NAME]: highlightsToggle.checked });
  document.getElementById("output").textContent = easyReadTools.getMessageForLocales(
    highlightsToggle.checked ? "popup_page_highlights_enabled" : "popup_page_highlights_disabled"
  );
});

const annotationAuthorInput = document.getElementById("annotationAuthor");
chrome.storage.local.get([easyReadTools.ANNOTATION_AUTHOR_NAME]).then((stored) => {
  annotationAuthorInput.value = stored[easyReadTools.ANNOTATION_AUTHOR_NAME] ?? "";
});
document.getElementById("btnSaveAnnotationAuthor").addEventListener("click", async () => {
  await chrome.storage.local.set({
    [easyReadTools.ANNOTATION_AUTHOR_NAME]: annotationAuthorInput.value.trim()
  });
  document.getElementById("output").textContent = easyReadTools.getMessageForLocales("setting_page_annotationAuthorSaved");
});

const btnDownloadAllRecordsAsJson = document.getElementById("btnDownloadAllRecordsAsJson");
btnDownloadAllRecordsAsJson.addEventListener('click', async () => {
  easyReadTools.getStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME]), (result) => {
    easyReadTools.exportToJsonFile(result, "EasyRead-allRecord-v" + easyReadTools.getNowDateTimeString() + ".json");
  });
});

const btnRemoveAllRecords = document.getElementById("btnRemoveAllRecords");
btnRemoveAllRecords.addEventListener('click', async () => {
  easyReadTools.removeStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME]), ()=>{
    document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_allRecordsRemoved");
  });
});

const btnDownloadReadLatersAsJson = document.getElementById("btnDownloadReadLatersAsJson");
btnDownloadReadLatersAsJson.addEventListener('click', async () => {
  easyReadTools.getStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]), (result) => {
    easyReadTools.exportToJsonFile(result, "EasyRead-readLaters-v" + easyReadTools.getNowDateTimeString() + ".json");
  });
});

const btnRemoveReadLaters = document.getElementById("btnRemoveReadLaters");
btnRemoveReadLaters.addEventListener('click', async () => {
  easyReadTools.removeStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]), ()=>{
    document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_readLatersRemoved");
  });
});

const btnDownloadNotesAsJson = document.getElementById("btnDownloadNotesAsJson");
btnDownloadNotesAsJson.addEventListener('click', async () => {
  easyReadTools.getStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME]), (result) => {
    easyReadTools.exportToJsonFile(result, "EasyRead-notes-v" + easyReadTools.getNowDateTimeString() + ".json");
  });
});

const btnDownloadNotesAsMarkdown = document.getElementById("btnDownloadNotesAsMarkdown");
btnDownloadNotesAsMarkdown.addEventListener('click', async () => {
  easyReadTools.getStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME]), (result) => {
    const txtMarkdownTemplate = document.getElementById("txtMarkdownTemplate").value;
    const txtMarkdownNotesSectionTemplate = document.getElementById("txtMarkdownNotesSectionTemplate").value;
    const notes = result[easyReadTools.NOTES_NAME];
    const files = easyReadTools.convertNotesToMarkdownFiles(notes, txtMarkdownTemplate, txtMarkdownNotesSectionTemplate);
    exportToZipFile(files, "EasyRead-notes-v" + easyReadTools.getNowDateTimeString() + ".zip");
  });
});

/*
files = [
  { name: "file1.txt", content: "Hello, world!" },
  { name: "file2.txt", content: "This is a sample file." }
];
filename = "export.zip";
*/
function exportToZipFile(files, filename) {
  if(Array.isArray(files) && files.length > 0) {
    var zip = new JSZip();  

    files.forEach(function(file) {
      zip.file(file.name, file.content);
    });
  
    zip.generateAsync({ type: "blob" }).then(function(content) {
      var link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
  else {
    console.log("files is not array or files length is 0.");
  }
}

const btnRemoveNotes = document.getElementById("btnRemoveNotes");
btnRemoveNotes.addEventListener('click', async () => {
  easyReadTools.removeStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME]), ()=>{
    document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_notesRemoved");
  });
});

const btnDownloadStorageAsJson = document.getElementById("btnDownloadStorageAsJson");
btnDownloadStorageAsJson.addEventListener('click', async () => {
  easyReadTools.getStorageJsonData(null, (result) => {
    easyReadTools.exportToJsonFile(result, "EasyRead-Storage-v" + easyReadTools.getNowDateTimeString() + "-backup.json");
  });
});

const btnMergeStorageJson = document.getElementById("btnMergeStorageJson");
btnMergeStorageJson.addEventListener('click', async () => {
  var fileInput = document.getElementById('fileInputStorageJson');
  var file = fileInput.files[0];
  var reader = new FileReader();

  reader.onload = function(e) {
    var contents = e.target.result;
    try {
      var json = JSON.parse(contents);
      easyReadTools.mergeStorageJsonData(json, (e)=>{
        if(e.status) {
          var result = "counterAllRecordsDuplicateItems=" + e["counterAllRecordsDuplicateItems"] + "<br />"
          + "counterAllRecordsMergeItems=" + e["counterAllRecordsMergeItems"] + "<br />"
          + "counterReadLatersMergeItems=" + e["counterReadLatersMergeItems"] + "<br />"
          + "counterNotesDuplicateItems=" + e["counterNotesDuplicateItems"] + "<br />"
          + "counterNotesMergeItems=" + e["counterNotesMergeItems"] + "<br />"
          + "counterAnnotationsMergeItems=" + e["counterAnnotationsMergeItems"] + "<br />"
          + "takeMilliseconds=" + e["takeMilliseconds"] + "<br />";
          document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_storageMergedSuccessfully")
            + "<br />" + result;
          console.log("easyReadTools.mergeStorageJsonData " + file.name + " succeeded.");
        }
        else {
          document.getElementById("output").innerHTML = "easyReadTools.mergeStorageJsonData - error";
          console.log("easyReadTools.mergeStorageJsonData - error:", e);
        }
      });
    } catch(err) { globalThis.EasyReadDiagnostics?.record(err, { source: "src/setting/setting.js" }, false);
      document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_storageMergedFailed") + err.toString();
      console.error("parse " + file.name + " failed:", err);
    }
  };
  if(file) {
    reader.readAsText(file);
  }
  else {
    document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_fileInputNofiles");
    console.log("User must select a file (*.json) first, or the file is not exists.");
  }
});

const btnReplaceStorageJson = document.getElementById("btnReplaceStorageJson");
btnReplaceStorageJson.addEventListener('click', async () => {
  var fileInput = document.getElementById('fileInputStorageJson');
  var file = fileInput.files[0];
  var reader = new FileReader();

  reader.onload = function(e) {
    var contents = e.target.result;
    try {
      var json = JSON.parse(contents);
      easyReadTools.replaceStorageJsonData(json, (e)=>{
        if(e.status) {
          var result = "takeMilliseconds=" + e["takeMilliseconds"] + "<br />";
          document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_storageReplacedSuccessfully")
            + "<br />" + result;
          console.log("easyReadTools.relaceStorageJsonData " + file.name + " succeeded.");
        }
        else {
          document.getElementById("output").innerHTML = "easyReadTools.relaceStorageJsonData - error";
          console.log("easyReadTools.relaceStorageJsonData - error:", e);
        }
      });
    } catch(err) { globalThis.EasyReadDiagnostics?.record(err, { source: "src/setting/setting.js" }, false);
      document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_storageReplacedFailed") + err.toString();
      console.error("parse " + file.name + " failed:", err);
    }
  };
  if(file) {
    reader.readAsText(file);
  }
  else {
    document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_fileInputNofiles");
    console.log("User must select a file (*.json) first, or the file is not exists.");
  }
});

const btnDropStorage = document.getElementById("btnDropStorage");
btnDropStorage.addEventListener('click', async () => {
  easyReadTools.clearAllStorage(()=>{
    document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_storageDroped");
  });
});

window.addEventListener('load', function() {
  document.getElementById("setting_page_title").textContent = easyReadTools.getMessageForLocales("setting_page_title");
  document.getElementById("setting_page_notice").textContent = easyReadTools.getMessageForLocales("setting_page_notice");
  document.getElementById("setting_tab_general").textContent = easyReadTools.getMessageForLocales("setting_tab_general");
  document.getElementById("setting_tab_data").textContent = easyReadTools.getMessageForLocales("setting_tab_data");
  document.getElementById("setting_tab_backup").textContent = easyReadTools.getMessageForLocales("setting_tab_backup");
  document.getElementById("settingHighlightsTitle").textContent = easyReadTools.getMessageForLocales("popup_page_show_highlights");
  document.getElementById("settingHighlightsDescription").textContent = easyReadTools.getMessageForLocales("setting_page_highlights_description");

  document.getElementById("setting_page_notice_annotationAuthor").textContent = easyReadTools.getMessageForLocales("setting_page_notice_annotationAuthor");
  document.getElementById("annotationAuthorLabel").textContent = easyReadTools.getMessageForLocales("setting_page_annotationAuthorLabel");
  document.getElementById("btnSaveAnnotationAuthor").textContent = easyReadTools.getMessageForLocales("setting_page_btnSaveAnnotationAuthor");

  document.getElementById("setting_page_notice_allRecords").textContent = easyReadTools.getMessageForLocales("setting_page_notice_allRecords");
  document.getElementById("btnDownloadAllRecordsAsJson").textContent = easyReadTools.getMessageForLocales("setting_page_btnDownloadAllRecordsAsJson");
  document.getElementById("btnRemoveAllRecords").textContent = easyReadTools.getMessageForLocales("setting_page_btnRemoveAllRecords");
  
  document.getElementById("setting_page_notice_readLaters").textContent = easyReadTools.getMessageForLocales("setting_page_notice_readLaters");
  document.getElementById("btnDownloadReadLatersAsJson").textContent = easyReadTools.getMessageForLocales("setting_page_btnDownloadReadLatersAsJson");
  document.getElementById("btnRemoveReadLaters").textContent = easyReadTools.getMessageForLocales("setting_page_btnRemoveReadLaters");
  
  document.getElementById("setting_page_notice_notes").textContent = easyReadTools.getMessageForLocales("setting_page_notice_notes");
  document.getElementById("btnDownloadNotesAsJson").textContent = easyReadTools.getMessageForLocales("setting_page_btnDownloadNotesAsJson");
  document.getElementById("btnDownloadNotesAsMarkdown").textContent = easyReadTools.getMessageForLocales("setting_page_btnDownloadNotesAsMarkdown");
  document.getElementById("btnRemoveNotes").textContent = easyReadTools.getMessageForLocales("setting_page_btnRemoveNotes");
  
  document.getElementById("setting_page_notice_storage").textContent = easyReadTools.getMessageForLocales("setting_page_notice_storage");
  document.getElementById("btnDownloadStorageAsJson").textContent = easyReadTools.getMessageForLocales("setting_page_btnDownloadStorageAsJson");
  document.getElementById("btnMergeStorageJson").textContent = easyReadTools.getMessageForLocales("setting_page_btnMergeStorageJson");
  document.getElementById("btnReplaceStorageJson").textContent = easyReadTools.getMessageForLocales("setting_page_btnReplaceStorageJson");
  document.getElementById("btnDropStorage").textContent = easyReadTools.getMessageForLocales("setting_page_btnDropStorage");
});
