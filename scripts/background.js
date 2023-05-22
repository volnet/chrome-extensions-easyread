import * as easyReadTools from './easyReadTools.js';

/*
(function () {
  console.log(easyReadTools.configs.getConfigs().IsAutoRecordedEnabled);
})()
*/

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.status === 'complete') {
      console.log("chrome.tabs.onActivated.callback = " + tab.url);
      if (easyReadTools.isSupportedScheme(tab.url)) {
        autoRecordCurrentPage(tab);
      }
    }
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo && changeInfo.status === 'complete') {
    if (easyReadTools.isSupportedScheme(tab.url)) {
      // Known bug: When clicking on an anchor, it may result in duplicate visit count records.
      autoRecordCurrentPage(tab);
      if (!easyReadTools.hasAnchor(tab.url)) {
        setTabScroll(tab);
      }
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  easyReadTools.updateBudgeText();
});
chrome.runtime.onInstalled.addListener((details) => {
  easyReadTools.updateBudgeText();
  installContextMenus();
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

function installContextMenus() {
  chrome.contextMenus.create({
    title: easyReadTools.getMessageForLocales("contextMenus_title_page_addReadLater"),
    contexts: ["page"],
    id: "page"
  });

  chrome.contextMenus.create({
    title: easyReadTools.getMessageForLocales("contextMenus_title_selection_addNote"),
    contexts: ["selection"],
    id: "selection"
  });
}

chrome.contextMenus.onClicked.addListener(contextMenusOnClick);
function contextMenusOnClick(info) {
  switch (info.menuItemId) {
    case 'page':
      addReadLater();
      break;
    case 'selection':
      addNotesSelection(info.selectionText);
      break;
    default:
      console.log('No match context menus.');
  }
}

async function addReadLater() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    if (easyReadTools.isSupportedScheme(tab.url)) {
      easyReadTools.updateStorageJsonData(
        easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]),
        updateStorageCallback_ReadLaterAdd,
        {
          key: easyReadTools.READ_LATERS_NAME,
          tab: tab
        });
    };
  }
}

// !!!IMPORTMENT!!! -- DON'T CHANGE THE CODE.
// It's copied from popup.js, it shouldn't be changed from the source code, MUST keep sync to popup.js updateStorageCallback_ReadLaterAdd function.
function updateStorageCallback_ReadLaterAdd(queryValue, context) {
  var result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "", callback_onUpdated: addReadLatersStorageUpdated };
  var newValue = {};
  // queryValue == {} or {context.key: it's value}
  const oldValue = queryValue[context.key];
  const key = easyReadTools.getKey(context.tab.url);

  // const posision: if we want to get the page's postion, we have to try read from allrecords.
  // here no implement.

  if (!oldValue) {
    // not exists "readLaters json object", create new one to init.
    newValue = new Array();
    newValue.push({ key: key, url: context.tab.url, title: context.tab.title, createDateTime: Date.now(), status: easyReadTools.READ_STATUS_UNREAD });
    result.value = newValue;
    result.status = easyReadTools.UPDATE_STATUS_YES;
    showMessages("Add a new page to the read later list.");
    // console.log("create readLaters json object. add new page.");
  } else {
    // exists "readLaters json object"

    // the url is in the read later list.
    // assert the oldValue is Array.

    let isFound = false;
    for (let i = 0; i < oldValue.length; ++i) {
      if (key === oldValue[i].key && oldValue[i].status === easyReadTools.READ_STATUS_UNREAD) {
        result.message = "The page is in your read later list yet.";
        isFound = true;
        showMessages("The page is in your read later list yet.");
      }
    }

    if (!isFound) {
      result.value = [...oldValue, { key: key, url: context.tab.url, title: context.tab.title, createDateTime: Date.now(), status: easyReadTools.READ_STATUS_UNREAD }];
      result.status = easyReadTools.UPDATE_STATUS_YES;
      result.message = "Add a new page to the read later list.";
      showMessages("Add a new page to the read later list.");
      // console.log("no found it. add new page.");
    }
  }
  return result;
}

function addReadLatersStorageUpdated(updateStatus, updateData) {
  if (updateStatus) {
    easyReadTools.updateBudgeText();
  }
}

/* showMessages to notify users */
function showMessages(message) {
  console.log("background.js: " + message);
}

function updateStorageCallback_addNotes(queryValue, context) {
  let result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "" };
  // queryValue == {} or {thePageKey : it's value}
  // console.log(queryValue);
  let oldValue = queryValue[context.key];
  if (oldValue && oldValue["notes"] && oldValue["notes"].length > 0) {
      oldValue["notes"] = [...oldValue["notes"], {"selectionText": context.value, "createDateTime": Date.now()}];
      result.value = oldValue;
      result.status = easyReadTools.UPDATE_STATUS_YES;
  }
  else {
    // create new
    let newValue = { title: context.tab.title, url: context.tab.url, notes: [{"selectionText": context.value, "createDateTime": Date.now()}] };
    result.value = newValue;
    result.status = easyReadTools.UPDATE_STATUS_YES;
  }
  return result;
}

async function addNotesSelection(selectionText) {
  if(selectionText && selectionText.length > 0) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      const pageKey = easyReadTools.getKey(tab.url);
      if (easyReadTools.isSupportedScheme(tab.url)) {
        const keyChain = easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME, pageKey]);
        easyReadTools.updateStorageJsonData(keyChain, updateStorageCallback_addNotes, {
          key: pageKey,
          tab: tab,
          value: encodeURIComponent(selectionText)
        });
      }
    }
  }
}