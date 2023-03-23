import * as easyReadTools from "../scripts/easyReadTools.js";

function showMessages(message) {
  document.getElementById("outputMesssages").textContent = message;
  setTimeout(function(){
    document.getElementById("outputMesssages").textContent = "";
  }, 3000);
}
function renderReadLaters(queryValue, context) {
  let lists = queryValue[context.key];
  if (lists && lists.length > 0) {
    document.getElementById("outputReadLatersCount").innerHTML = "Total Page: " + (lists.length) + ".";

    const template = document.getElementById('templateReadLater');
    const elements = new Set();
    
    for(let i = 0; i < lists.length; ++i) {
      let item = lists[i];
      const element = template.content.firstElementChild.cloneNode(true);
      element.querySelector('.unreadTitle').textContent = item["title"];
      element.querySelector('a').href = item["url"];
      elements.add(element);
    }
    let olElement = document.querySelector('#outputReadLaters ol')
    olElement.innerHTML = '';
    olElement.append(...elements);
  }
  else {
    console.log("Because no record to found, so it may be your first time to reach the page!");
    showMessages("Because no record to found, so it may be your first time to reach the page!");
  }
  easyReadTools.updateBudgeText();
}

function addReadLatersStorageUpdated(updateStatus, updateData) {
  console.log("addReadLatersStorageUpdated running");
  if(updateStatus) {
    renderReadLaters(updateData, {key: easyReadTools.READ_LATERS_NAME})
  }
}

function renderPageRecords(queryValue, context) {
  let readedPage = queryValue[context.key];
  if (readedPage) {
    if (readedPage.datetimes && readedPage.datetimes.length > 0) {
      const readTimes = readedPage.datetimes.length;
      const message = "已读：" + readTimes + "次";
      const readTimesToString = easyReadTools.sortDateTimeList(readedPage.datetimes).map((datetime) => easyReadTools.formatDate(datetime) + '<br />').join('');

      const template = document.getElementById('templateAllRecords');
      const elements = new Set();
      const element = template.content.cloneNode(true);

      element.querySelector('.pageTitle').textContent = readedPage.title;
      element.querySelector('.url').textContent = readedPage.url;
      element.querySelector('.message').textContent = message;
      element.querySelector('.readedTimes').innerHTML = readTimesToString;

      elements.add(element);
      document.getElementById('outputAllRecords').append(...elements);
    }
    else {
      console.log("It's your first time to reach the page!");
      showMessages("It's your first time to reach the page!");
    }
  }
  else {
    document.getElementById('outputAllRecords').innerHTML = "No records.";
    console.log("Because no record to found, so it may be your first time to reach the page!");
    showMessages("Because no record to found, so it may be your first time to reach the page!");
  }
}

function updateStorageCallback_ReadLaterAdd(queryValue, context) {
  var result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "", callback_onUpdated : addReadLatersStorageUpdated };
  var newValue = {};
  // queryValue == {} or {context.key: it's value}
  console.log(queryValue);
  console.log(context.key);
  const oldValue = queryValue[context.key];
  console.log(oldValue);
  const key = easyReadTools.getKey(context.tab.url);
  
  if (!oldValue) {
    // not exists "readLaters json object", create new one to init.
    newValue = new Array();
    newValue.push({ key: key, url: context.tab.url, title: context.tab.title, createDateTime: Date.now(), status: easyReadTools.READ_STATUS_UNREAD });
    result.value = newValue;
    result.status = easyReadTools.UPDATE_STATUS_YES;
    showMessages("Add a new page to the read later list.");
    console.log("create readLaters json object. add new page.");
  } else {
    // exists "readLaters json object"

    // the url is in the read later list.
    // assert the oldValue is Array.

    let isFound = false;
    for (let i = 0; i < oldValue.length; ++i) {
      if (key === oldValue[i].key) {
        result.message = "The page is in your read later list yet.";
        isFound = true;
        showMessages("The page is in your read later list yet.");
      }
    }

    if (!isFound) {
      console.log("!Found");
      console.log(oldValue);
      result.value = [...oldValue, { key: key, url: context.tab.url, title: context.tab.title, createDateTime: Date.now(), status: easyReadTools.READ_STATUS_UNREAD }];
      result.status = easyReadTools.UPDATE_STATUS_YES;
      result.message = "Add a new page to the read later list.";
      showMessages("Add a new page to the read later list.");
      console.log("no found it. add new page.");
    }
  }
  return result;
}

const btnReadLater = document.getElementById("btnReadLater");
btnReadLater.addEventListener('click', async () => {
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
});

const btnReadedAndRemove = document.getElementById("btnReadedAndRemove");
btnReadedAndRemove.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    easyReadTools.removeStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageUrl]), () => {
      document.getElementById("outputAllRecords").innerHTML = "The records of the page is removed.";
    });
  }
});

const btnAllRecords = document.getElementById("btnAllRecords");
btnAllRecords.addEventListener('click', async () => {
  chrome.tabs.create({ active: true, url: '/records/allRecords.html' });
});

// on the page load.
easyReadTools.getStorageJsonData(
  easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]), 
  renderReadLaters, { key: easyReadTools.READ_LATERS_NAME });

const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
if (tabs && tabs.length > 0) {
  const tab = tabs[0];
  const title = tab.title;
  const pageUrl = easyReadTools.getKey(tab.url);
  if (easyReadTools.isSupportedScheme(pageUrl)) {
    easyReadTools.getStorageJsonData(
      easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageUrl]),
      renderPageRecords,
      {key: pageUrl});
  }
  else {
    console.log("This page not supported.");
    document.getElementById("outputAllRecords").innerHTML = "This page not supported.";
  }
}

