import * as easyReadTools from "../scripts/easyReadTools.js";

/* showMessages to notify users */
function showMessages(message) {
  document.getElementById("outputMesssages").textContent = message;
  setTimeout(function () {
    document.getElementById("outputMesssages").textContent = "";
  }, 3000);
}

/* -------- Top Menu bar -------- */

function onPageLoad_InitTopMenuBar() {
  const btnAllRecords = document.getElementById("btnAllRecords");
  btnAllRecords.addEventListener('click', async () => {
    chrome.tabs.create({ active: true, url: '/records/allRecords.html' });
  });
}

/* -------- ReadLaters -------- */

async function renderReadLaters(queryValue, context) {
  let lists = queryValue[context.key];
  let unreadCount = 0;
  if (lists && lists.length > 0) {
    const template = document.getElementById('templateReadLater');
    const elements = new Set();

    for (let i = 0; i < lists.length; ++i) {
      let item = lists[i];
      if (item["status"] === easyReadTools.READ_STATUS_UNREAD
        || item["status"] === easyReadTools.READ_STATUS_READING) {
        ++unreadCount;
        const element = template.content.firstElementChild.cloneNode(true);

        const ckId = "checkbox_" + i;
        const checkBox = element.querySelector('input[type=checkbox]');
        checkBox.id = ckId;
        checkBox.value = item["key"];
        checkBox.addEventListener('change', (e) => {
          if (e.target.checked) {
            const key = e.target.value;
            if (key) {
              easyReadTools.updateStorageJsonData(
                easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]),
                updateStorageCallback_ReadLaterRemove,
                {
                  key: easyReadTools.READ_LATERS_NAME,
                  pageKey: key,
                  checkBoxId: e.target.id
                });
            }
          }
        });

        const isHighlightItem = await isNeedHighlightCurrentPageInReadLaters(item["key"]);

        element.querySelector('label').setAttribute('for', ckId)
        element.querySelector('a').textContent = (isHighlightItem ? "👀 " : "") + item["title"];
        element.querySelector('a').href = item["url"];
        element.querySelector('a').setAttribute('title', item["title"]);

        if (isHighlightItem) {
          element.classList.add('highlightLi');
        }

        elements.add(element);
      }
    }
    let olElement = document.querySelector('#outputReadLaters ol')
    olElement.innerHTML = '';
    olElement.append(...elements);
  }
  else {
    console.log("Because no record to found, so it may be your first time to reach the page!");
    showMessages("Because no record to found, so it may be your first time to reach the page!");
  }
  document.getElementById("titleReadLaters").innerHTML = "Total Page: " + (unreadCount) + "";
  easyReadTools.updateBudgeText();
}

function addReadLatersStorageUpdated(updateStatus, updateData) {
  if (updateStatus) {
    renderReadLaters(updateData, { key: easyReadTools.READ_LATERS_NAME })
  }
}

function removeReadLatersStorageUpdated(updateStatus, updateData, context) {
  if (updateStatus) {
    setTimeout(() => {
      const liElement = document.getElementById(context.checkBoxId).parentElement;
      if (liElement) {
        const olElement = liElement.parentElement;
        olElement.removeChild(liElement);
        document.getElementById("titleReadLaters").innerHTML = "Total Page: " + (olElement.childNodes.length) + "";
      }
    }, 500);
  }
}

function updateStorageCallback_ReadLaterAdd(queryValue, context) {
  var result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "", callback_onUpdated: addReadLatersStorageUpdated };
  var newValue = {};
  // queryValue == {} or {context.key: it's value}
  const oldValue = queryValue[context.key];
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
      result.value = [...oldValue, { key: key, url: context.tab.url, title: context.tab.title, createDateTime: Date.now(), status: easyReadTools.READ_STATUS_UNREAD }];
      result.status = easyReadTools.UPDATE_STATUS_YES;
      result.message = "Add a new page to the read later list.";
      showMessages("Add a new page to the read later list.");
      console.log("no found it. add new page.");
    }
  }
  return result;
}

function updateStorageCallback_ReadLaterRemove(queryValue, context) {
  var result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "", callback_onUpdated: removeReadLatersStorageUpdated };
  // queryValue == {} or {context.key: it's value}
  console.log(queryValue);
  console.log(context.key);
  const oldValue = queryValue[context.key];
  console.log(oldValue);

  if (!oldValue) {
    showMessages("Nothing be removed.");
    console.log("the readLaters json object is not exists, may be delete by other thread.");
  } else {
    // exists "readLaters json object"

    // the url is in the read later list.
    // assert the oldValue is Array.

    let isFound = false;
    for (let i = 0; i < oldValue.length; ++i) {
      if (context.pageKey === oldValue[i].key) {
        oldValue[i]["status"] = easyReadTools.READ_STATUS_READED;
        oldValue[i]["endReadDateTime"] = Date.now();
        result.status = easyReadTools.UPDATE_STATUS_YES;
        result.value = oldValue;
        result.message = "Mark the page as READED.";
        isFound = true;
        break;
      }
    }

    if (!isFound) {
      console.log("!Found");
      result.message = "Nothing be removed.";
      showMessages("Nothing be removed.");
      console.log("Nothing be removed.");
    }
    return result;
  }
}

async function isNeedHighlightCurrentPageInReadLaters(key) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    if (key == pageUrl) {
      return true;
    }
  }
  return false;
}

function onPageLoad_InitReadLaters() {
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

  easyReadTools.getStorageJsonData(
    easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]),
    renderReadLaters, { key: easyReadTools.READ_LATERS_NAME });
}

/* -------- AutoRecords -------- */

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

      element.querySelector('.titleAllRecords').textContent = readedPage.title;
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

async function onPageLoad_InitAllRecords() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const title = tab.title;
    const pageUrl = easyReadTools.getKey(tab.url);
    if (easyReadTools.isSupportedScheme(pageUrl)) {
      easyReadTools.getStorageJsonData(
        easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageUrl]),
        renderPageRecords,
        { key: pageUrl });
    }
    else {
      console.log("This page not supported.");
      document.getElementById("outputAllRecords").innerHTML = "This page not supported.";
    }
  }
}

(function onPageLoad() {
  onPageLoad_InitTopMenuBar();
  onPageLoad_InitReadLaters();
  onPageLoad_InitAllRecords();
})();
