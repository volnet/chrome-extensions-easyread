import * as easyReadTools from './easyReadTools.js';

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    // console.log("chrome.tabs.onActivated.callback = " + tab.url);
    AutoRecord(tab);
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // console.log("chrome.tabs.onUpdated.callback = " + tab.url);
  AutoRecord(tab);
});

chrome.runtime.onStartup.addListener(()=>{
  easyReadTools.updateBudgeText();
});
chrome.runtime.onInstalled.addListener((details)=>{
  easyReadTools.updateBudgeText();
});

function updateStorageCallback_AllRecordsURLDateTimes(queryValue, context) {
  let result = { status:easyReadTools.UPDATE_STATUS_NO, value:null, message:"" };
  let newValue = {};
  // queryValue == {} or {thePageKey : it's value}
  console.log(queryValue);
  if(queryValue[context.key]) {
    const datetimes = queryValue[context.key]["datetimes"];
    if(datetimes && datetimes.length > 0 && easyReadTools.isByHuman(datetimes)){
      newValue = { title: context.tab.title, url: context.tab.url, datetimes: [...datetimes, Date.now()] };
      result.value = newValue;
      result.status = easyReadTools.UPDATE_STATUS_YES;
    } else {
      result.status = easyReadTools.UPDATE_STATUS_NO;
      result.message = "No update reason: The last datetime is too closely.";
    }
  } else {
    // create new
    newValue = { title: context.tab.title, url: context.tab.url, datetimes: [ Date.now() ] };
    result.value = newValue;
    result.status = easyReadTools.UPDATE_STATUS_YES;
  }
  return result;
}

function AutoRecord(tab) {
  const pageUrl = easyReadTools.getKey(tab.url);
  if (easyReadTools.isSupportedScheme(tab.url)) {
    const keyChain = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageUrl]);
    easyReadTools.updateStorageJsonData(keyChain, updateStorageCallback_AllRecordsURLDateTimes, {
      key: pageUrl,
      tab: tab
    });
  }
}