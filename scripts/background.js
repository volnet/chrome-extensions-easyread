import * as easyReadTools from './easyReadTools.js';

/*
(function () {
  console.log(easyReadTools.configs.getConfigs().IsAutoRecordedEnabled);
})()
*/

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if(tab && tab.status === 'complete') {
      console.log("chrome.tabs.onActivated.callback = " + tab.url);
      if (easyReadTools.isSupportedScheme(tab.url)) {
        autoRecordCurrentPage(tab);
      }
    }
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // console.log("chrome.tabs.onUpdated.callback = " + tab.url);
  if (changeInfo && changeInfo.status === 'complete') {
    console.log("chrome.tabs.onUpdated.addListener + changeInfo.status === 'complete'")
    if (easyReadTools.isSupportedScheme(tab.url)) {
      autoRecordCurrentPage(tab);
      setTabScroll(tab);
    }
  }
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
  // console.log(queryValue);
  let oldValue = queryValue[context.key];
  if (oldValue) {
    const datetimes = queryValue[context.key]["datetimes"];
    if (datetimes && datetimes.length > 0 && easyReadTools.isByHuman(datetimes)) {
      // newValue = { title: context.tab.title, url: context.tab.url, datetimes: [...datetimes, Date.now()] };
      oldValue["datetimes"] = [...datetimes, Date.now()];
      result.value = oldValue;
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

function updateStorageCallback_ReadLatersPosition(queryValue, context) {
  let result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "" };
  // queryValue == {} or {thePageKey : it's value}
  // console.log("updateStorageCallback_ReadLatersPosition");
  // console.log(queryValue);
  let oldValue = queryValue[context.key];
  if (oldValue && oldValue.length > 0) {
    for (let i = 0; i < oldValue.length; ++i) {
      if (oldValue[i].key === context.pageKey) {
        oldValue[i]["position"] = context.position;
        result.value = oldValue;
        result.status = easyReadTools.UPDATE_STATUS_YES;
        result.message = "position is updated";
      }
    }
  }
  return result;
}

function updateStorageCallback_AllRecordsPosition(queryValue, context) {
  let result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "" };
  // queryValue == {} or {thePageKey : it's value}
  // console.log(queryValue);
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tab = sender.tab;
  if (tab) {
    const pageKey = easyReadTools.getKey(tab.url);
    if (message && message.position) {
      // update readLaters's position.
      if (easyReadTools.isSupportedScheme(tab.url)) {
        // console.log("easyReadTools.updateStorageJsonData(keyChainReadLaters")
        const keyChainReadLaters = easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]);
        easyReadTools.updateStorageJsonData(keyChainReadLaters, updateStorageCallback_ReadLatersPosition, {
          key: easyReadTools.READ_LATERS_NAME,
          tab: tab,
          pageKey: pageKey,
          position: message.position
        });

        // update autoRecord's position.
        const keyChainAllRecords = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageKey]);
        easyReadTools.updateStorageJsonData(keyChainAllRecords, updateStorageCallback_AllRecordsPosition, {
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
  // https://developer.chrome.com/docs/extensions/mv3/messaging/
  // If you want to asynchronously use sendResponse(), add return true; to the onMessage event handler.
  // return true;
});

async function setTabScroll(tab) {
  try {
    // console.log("query the tab's position and send message to content.js to set it.");
    if (tab) {
      const pageKey = easyReadTools.getKey(tab.url);
      const keyChainAllRecords = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageKey]);
      await easyReadTools.getStorageJsonData(keyChainAllRecords, async (queryValue, context) => {
        let dataValue = queryValue[pageKey];
        if (dataValue && dataValue.position) {
          let msg = {
            "command": "setScroll",
            "position": dataValue.position
          };
          // console.log("Relocate the page at the position: ");
          try {
            chrome
            await chrome.tabs.sendMessage(tab.id, msg);
          } catch (e) {
            console.log(e);
          }
        }
      });
    }
  }
  catch (e) {
    console.log(e);
  }
}
