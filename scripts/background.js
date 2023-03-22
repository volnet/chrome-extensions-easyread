import * as easyReadTools from './easyReadTools.js';

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    // console.log("chrome.tabs.onActivated.callback = " + tab.url);
    readingWeb(tab);
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // console.log("chrome.tabs.onUpdated.callback = " + tab.url);
  readingWeb(tab);
});

function updateStorageCallback_AllRecordsURLDateTimes(queryValue, params) {
  var result = { status:easyReadTools.UPDATE_STATUS_NO, value:null, message:"" };
  var newValue = {};
  if(queryValue) {
    const datetimes = queryValue["datetimes"];
    if(datetimes && datetimes.length > 0 && easyReadTools.isByHuman(datetimes)){
      newValue = { title: params.title, url: params.url, datetimes: [...datetimes, Date.now()] };
      result.value = newValue;
      result.status = easyReadTools.UPDATE_STATUS_YES;
    } else {
      result.status = easyReadTools.UPDATE_STATUS_NO;
      result.message = "NoUpdate Reason: The last datetime is too closely.";
    }
  } else {
    // create new
    newValue = { title: params.title, url: params.url, datetimes: [ Date.now() ] };
    result.value = newValue;
    result.status = easyReadTools.UPDATE_STATUS_YES;
  }
  return result;
}

function readingWeb(tab) {
  const pageUrl = easyReadTools.getKey(tab.url);
  if (easyReadTools.isSupportedScheme(pageUrl)) {
    const keyChain = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageUrl]);
    easyReadTools.updateStorageJsonData(keyChain, updateStorageCallback_AllRecordsURLDateTimes, tab);
  }
}