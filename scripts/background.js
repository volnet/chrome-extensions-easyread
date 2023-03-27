import * as easyReadTools from './easyReadTools.js';

(function () {
  console.log(easyReadTools.configs.getConfigs().IsAutoRecordedEnabled);
})()

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    // console.log("chrome.tabs.onActivated.callback = " + tab.url);
    autoRecordCurrentPage(tab);
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // console.log("chrome.tabs.onUpdated.callback = " + tab.url);
  autoRecordCurrentPage(tab);
});

chrome.runtime.onStartup.addListener(() => {
  easyReadTools.updateBudgeText();
});
chrome.runtime.onInstalled.addListener((details) => {
  easyReadTools.updateBudgeText();
});

function updateStorageCallback_AllRecordsURLDateTimes(queryValue, context) {
  let result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "" };
  let newValue = {};
  // queryValue == {} or {thePageKey : it's value}
  console.log(queryValue);
  if (queryValue[context.key]) {
    const datetimes = queryValue[context.key]["datetimes"];
    if (datetimes && datetimes.length > 0 && easyReadTools.isByHuman(datetimes)) {
      newValue = { title: context.tab.title, url: context.tab.url, datetimes: [...datetimes, Date.now()] };
      result.value = newValue;
      result.status = easyReadTools.UPDATE_STATUS_YES;
    } else {
      result.status = easyReadTools.UPDATE_STATUS_NO;
      result.message = "No update reason: The last datetime is too closely.";
    }
  } else {
    // create new
    newValue = { title: context.tab.title, url: context.tab.url, datetimes: [Date.now()] };
    result.value = newValue;
    result.status = easyReadTools.UPDATE_STATUS_YES;
  }
  return result;
}

function autoRecordCurrentPage(tab) {
  const pageKey = easyReadTools.getKey(tab.url);
  if (easyReadTools.isSupportedScheme(tab.url)) {
    const keyChain = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageKey]);
    easyReadTools.updateStorageJsonData(keyChain, updateStorageCallback_AllRecordsURLDateTimes, {
      key: pageKey,
      tab: tab
    });
  }
}


function updateStorageCallback_AllRecordsPosition(queryValue, context) {
  let result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "" };
  // queryValue == {} or {thePageKey : it's value}
  console.log(queryValue);
  let oldValue = queryValue[context.key];
  if (oldValue) {
      oldValue["position"] = context.position;
      result.value = oldValue;
      result.status = easyReadTools.UPDATE_STATUS_YES;
      result.message = "position is updated";
  }
  return result;
}

// add a Listener to add
// receive the page position.
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  const tab = sender.tab;
  if (tab) {
    const pageKey = easyReadTools.getKey(tab.url);
    if (message && message.position) {
      // update readLaters's position.
      // update autoRecord's position.
      if (easyReadTools.isSupportedScheme(tab.url)) {
        const keyChain = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageKey]);
        easyReadTools.updateStorageJsonData(keyChain, updateStorageCallback_AllRecordsPosition, {
          key: pageKey,
          tab: tab,
          position: message.position
        });
      }
    }
    if (sendResponse) {
      sendResponse("success");
    }
  }
});

