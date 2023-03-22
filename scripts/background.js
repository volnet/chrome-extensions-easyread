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

function readingWeb(tab) {
  const pageUrl = easyReadTools.getKey(tab.url);
  if (easyReadTools.isSupportedScheme(pageUrl)) {
    chrome.storage.local.get([easyReadTools.ALL_RECORDS_NAME], (result) => {
      if (result[easyReadTools.ALL_RECORDS_NAME]) {
        const currentPage = result[easyReadTools.ALL_RECORDS_NAME][pageUrl];
        if(currentPage) {
          if (currentPage.datetimes.length > 0 && easyReadTools.isByHuman(currentPage.datetimes)) {
            const currentTime = Date.now();
            const datetimeArray = [...currentPage.datetimes, currentTime];
            result[easyReadTools.ALL_RECORDS_NAME][pageUrl] = { title:tab.title, url: tab.url, datetimes: datetimeArray };
            chrome.storage.local.set(result, () => {
              console.log("Update record " + pageUrl);
            });
          }
        }
        else {
          const datetimeArray = new Array();
          datetimeArray.push(Date.now());
          result[easyReadTools.ALL_RECORDS_NAME][pageUrl] = { title:tab.title, url: tab.url, datetimes: datetimeArray } ;
          chrome.storage.local.set(result, () => {
            console.log("Insert new record successed!");
          });
        }
      } else {
        const datetimeArray = new Array();
        datetimeArray.push(Date.now());
        const record = { [pageUrl] : { title:tab.title, url: tab.url, datetimes: datetimeArray } };
        const records = { [easyReadTools.ALL_RECORDS_NAME]: record };
        chrome.storage.local.set(records, () => {
          console.log("Init the allRecords successed! Insert new record successed!");
        });
      }
    });
  }
}
