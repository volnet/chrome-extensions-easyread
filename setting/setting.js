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

const btnDownloadStorageAsJson = document.getElementById("btnDownloadStorageAsJson");
btnDownloadStorageAsJson.addEventListener('click', async () => {
  easyReadTools.getStorageJsonData(null, (result) => {
    easyReadTools.exportToJsonFile(result, "EasyRead-Storage-v" + easyReadTools.getNowDateTimeString() + ".json");
  });
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
  
  document.getElementById("setting_page_notice_storage").textContent = easyReadTools.getMessageForLocales("setting_page_notice_storage");
  document.getElementById("btnDownloadStorageAsJson").textContent = easyReadTools.getMessageForLocales("setting_page_btnDownloadStorageAsJson");
  document.getElementById("btnDropStorage").textContent = easyReadTools.getMessageForLocales("setting_page_btnDropStorage");
});
