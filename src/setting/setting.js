import * as easyReadTools from '../scripts/easyReadTools.js';

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
    } catch(err) {
      document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_storageMergedFailed") + err.toString();
      console.error("parse " + file.name + " failed: " + err);
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
    } catch(err) {
      document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("setting_page_storageReplacedFailed") + err.toString();
      console.error("parse " + file.name + " failed: " + err);
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
