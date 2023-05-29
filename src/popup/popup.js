import * as easyReadTools from "../scripts/easyReadTools.js";

/* showMessages to notify users */
function showMessages(message) {
  document.getElementById("outputMesssages").textContent = message;
  setTimeout(function () {
    document.getElementById("outputMesssages").textContent = "";
  }, 3000);
}

/* -------- Popup Title -------- */

function onPageLoad_InitTitle() {
  document.getElementById("popupTitle").textContent = easyReadTools.getMessageForLocales("popup_page_title");
}

/* -------- Top Menu bar -------- */

function onPageLoad_InitTopMenuBar() {
  const btnAllRecords = document.getElementById("btnAllRecords");
  btnAllRecords.setAttribute("title", easyReadTools.getMessageForLocales("popup_page_top_menu_bar_all_records_title"));
  btnAllRecords.addEventListener('click', async () => {
    chrome.tabs.create({ active: true, url: '/records/allRecords.html' });
  });

  const btnSetting = document.getElementById("btnSetting");
  btnSetting.setAttribute("title", easyReadTools.getMessageForLocales("popup_page_top_menu_bar_setting_title"));
  btnSetting.addEventListener('click', async () => {
    chrome.tabs.create({ active: true, url: '/setting/setting.html' });
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
        checkBox.addEventListener('change', async (e) => {
          if (e.target.checked) {
            const key = e.target.value;
            if (key) {
              await easyReadTools.updateStorageJsonData(
                easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]),
                updateStorageCallback_ReadLaterRemove,
                {
                  key: easyReadTools.READ_LATERS_NAME,
                  pageKey: key,
                  checkBoxId: e.target.id
                });
              setTimeout(()=>{
                easyReadTools.updateBudgeText();
              }, 1000);
            }
          }
        });

        const isHighlightItem = await isNeedHighlightCurrentPageInReadLaters(item["key"]);

        element.querySelector('label').setAttribute('for', ckId);
        element.querySelector('a').textContent = (isHighlightItem ? "👀 " : "") + item["title"];
        element.querySelector('a').href = item["url"];
        element.querySelector('a').setAttribute('title', item["title"]);

        const position = item["position"];
        if(position && position.progress) {
          element.querySelector('.progress').textContent = " (" + position.progress.toFixed(2) + "%)";
        }
        

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
    showMessages(easyReadTools.getMessageForLocales("popup_page_message_no_readlaters"));
  }
  document.getElementById("titleReadLaters").textContent = easyReadTools.getMessageForLocales("popup_page_total_pages", [unreadCount]);
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
        document.getElementById("titleReadLaters").textContent = easyReadTools.getMessageForLocales("popup_page_total_pages", [olElement.childNodes.length]);
      }
    }, 500);
  }
}

// !!!IMPORTMENT!!! -- DON'T CHANGE THE CODE.
// It's copied to background.js, if you should change it, MUST keep sync to popup.js updateStorageCallback_ReadLaterAdd function.
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
    showMessages(easyReadTools.getMessageForLocales("popup_page_message_readlaters_firsttime"));
  } else {
    // exists "readLaters json object"

    // the url is in the read later list.
    // assert the oldValue is Array.

    let isFound = false;
    for (let i = 0; i < oldValue.length; ++i) {
      if (key === oldValue[i].key && oldValue[i].status === easyReadTools.READ_STATUS_UNREAD) {
        const msg = easyReadTools.getMessageForLocales("popup_page_message_duplicate_readlaters")
        result.message = msg;
        isFound = true;
        showMessages(msg);
      }
    }

    if (!isFound) {
      result.value = [...oldValue, { key: key, url: context.tab.url, title: context.tab.title, createDateTime: Date.now(), status: easyReadTools.READ_STATUS_UNREAD }];
      result.status = easyReadTools.UPDATE_STATUS_YES;
      const msg = easyReadTools.getMessageForLocales("popup_page_message_readlaters_added");
      result.message = msg;
      showMessages(msg);
    }
  }
  return result;
}

function updateStorageCallback_ReadLaterRemove(queryValue, context) {
  var result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "", callback_onUpdated: removeReadLatersStorageUpdated };
  // queryValue == {} or {context.key: it's value}
  // console.log(queryValue);
  // console.log(context.key);
  const oldValue = queryValue[context.key];
  // console.log(oldValue);

  if (!oldValue) {
    showMessages(easyReadTools.getMessageForLocales("popup_page_message_readlaters_remove_null"));
    console.log("the readLaters json object is not exists, may be delete by other thread.");
  } else {
    // exists "readLaters json object"

    // the url is in the read later list.
    // assert the oldValue is Array.

    let isFound = false;
    for (let i = 0; i < oldValue.length; ++i) {
      if (context.pageKey === oldValue[i].key && oldValue[i].status === easyReadTools.READ_STATUS_UNREAD) {
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
      result.message = easyReadTools.getMessageForLocales("popup_page_message_readlaters_remove_null");
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_readlaters_remove_null"));
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
  document.getElementById("btnReadLaterText").textContent = easyReadTools.getMessageForLocales("popup_btn_read_later_text");

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
        document.getElementById("outputAllRecords").innerHTML = easyReadTools.getMessageForLocales("popup_page_message_records_removed");
      });
    }
  });

  easyReadTools.getStorageJsonData(
    easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]),
    renderReadLaters, { key: easyReadTools.READ_LATERS_NAME });
}

/* -------- Notes -------- */

async function onPageLoad_InitNotes() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    if (easyReadTools.isSupportedScheme(pageUrl)) {
      easyReadTools.getStorageJsonData(
        easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME, pageUrl]),
        renderPageNotes,
        { key: pageUrl });
    }
  }
}

function renderPageNotes(queryValue, context) {
  let notesPage = queryValue[context.key];
  if (notesPage) {
    if (notesPage.notes && notesPage.notes.length > 0) {
      // display the outputNotes
      const outputNotesSeperator = document.getElementById("outputNotesSeperator");
      const outputNotes = document.getElementById("outputNotes");
      outputNotesSeperator.classList.remove("outputNotesSeperatorDefault");
      outputNotesSeperator.classList.add("outputNotesSeperator");
      outputNotes.classList.remove("outputNotesDefault");
      outputNotes.classList.add("outputNotes");

      const elements = new Set();
      for(var i = 0; i < notesPage.notes.length; i++) {
        const template = document.getElementById('templateNotes');
        const element = template.content.cloneNode(true);

        const noteItem = element.querySelector('.noteItem');
        noteItem.textContent = decodeURIComponent(notesPage.notes[i].selectionText);
        noteItem.setAttribute("title", easyReadTools.formatDate(notesPage.notes[i].createDateTime));

        elements.add(element);
      }
      document.getElementById("titleNotes").textContent = easyReadTools.getMessageForLocales("popup_page_notes_title");
      document.getElementById('outputNotes').querySelector("ol").append(...elements);
    }
    else {
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_no_notes"));
    }
  }
  else {
    // hidden the outputNotes
    const outputNotesSeperator = document.getElementById("outputNotesSeperator");
    const outputNotes = document.getElementById("outputNotes");
    
    outputNotesSeperator.classList.remove("outputNotesSeperator");
    outputNotesSeperator.classList.add("outputNotesSeperatorDefault");

    outputNotes.classList.remove("outputNotes");
    outputNotes.classList.add("outputNotesDefault");
  }
}

const btnDownloadNotes = document.getElementById("btnDownloadNotes");
btnDownloadNotes.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    easyReadTools.getStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME, pageUrl]), (result) => {
      var txtMarkdownTemplate = `  
# $title$

- Tags: #EasyRead
- CreateDateTime: $createDateTime$
- Link: [$title$]($url$)

---

## Notes
{notes_section}`;
      var txtMarkdownNotesSectionTemplate = `
### $createDateTime$

$selectionText$
`;
      const files = easyReadTools.convertNotesToMarkdownFiles(result, txtMarkdownTemplate, txtMarkdownNotesSectionTemplate);
      if(files && files.length > 0) {
        easyReadTools.exportToMarkdownFile(files[0].content, files[0].name);
      }
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_notes_downloaded"));
    });
  }
});

const btnRemoveNotes = document.getElementById("btnRemoveNotes");
btnRemoveNotes.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    easyReadTools.removeStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME, pageUrl]), () => {
      onPageLoad_InitNotes();
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_notes_removed"));
    });
  }
});

/* -------- AutoRecords -------- */

function renderPageRecords(queryValue, context) {
  let readedPage = queryValue[context.key];
  if (readedPage) {
    if (readedPage.datetimes && readedPage.datetimes.length > 0) {
      const readTimes = readedPage.datetimes.length;
      const message = easyReadTools.getMessageForLocales("popup_page_read_times", [readTimes]);
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
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_no_records_no_datetimes"));
    }
  }
  else {
    document.getElementById('outputAllRecords').innerHTML = easyReadTools.getMessageForLocales("popup_page_message_no_records_text");
    showMessages(easyReadTools.getMessageForLocales("popup_page_message_no_records_firsttime"));
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
      document.getElementById("outputAllRecords").textContent = easyReadTools.getMessageForLocales("popup_page_message_records_not_supported");
    }
  }
}

(function onPageLoad() {
  onPageLoad_InitTitle();
  onPageLoad_InitTopMenuBar();
  onPageLoad_InitReadLaters();
  onPageLoad_InitNotes();
  onPageLoad_InitAllRecords();
})();
