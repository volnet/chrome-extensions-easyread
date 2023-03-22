import * as easyReadTools from "../scripts/easyReadTools.js";

const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
if (tabs && tabs.length > 0) {
  const tab = tabs[0];
  const title = tab.title;
  const pageUrl = easyReadTools.getKey(tab.url);
  if (easyReadTools.isSupportedScheme(pageUrl)) {
    chrome.storage.local.get([easyReadTools.ALL_RECORDS_NAME], (result) => {
      if(result[easyReadTools.ALL_RECORDS_NAME]) {
        const readedPage = result[easyReadTools.ALL_RECORDS_NAME][pageUrl];
        if (readedPage) {
          if (readedPage.datetimes && readedPage.datetimes.length > 0) {
            const readTimes = readedPage.datetimes.length;
            const message = "已读：" + readTimes + "次";
            const readedTimes = easyReadTools.sortDateTimeList(readedPage.datetimes).map((datetime) => easyReadTools.formatDate(datetime) + '<br />').join('');
  
            const template = document.getElementById('mytemplate');
            const elements = new Set();
            const element = template.content.cloneNode(true);
  
            element.querySelector('.title').textContent = title;
            element.querySelector('.url').textContent = pageUrl;
            element.querySelector('.message').textContent = message;
            element.querySelector('.readedTimes').innerHTML = readedTimes;
  
            elements.add(element);
            document.getElementById('output').append(...elements);
          }
          else {
            console.log("It's your first time to reach the page!");
            document.getElementById("output").innerHTML = "It's your first time to reach the page!";
          }
        }
        else {
          console.log("Because no record to found, so it may be your first time to reach the page!");
          document.getElementById("output").innerHTML = "Because no record to found, so it may be your first time to reach the page!";
        }
      }
    });
}
else {
  console.log("This page not supported.");
  document.getElementById("output").innerHTML = "This page not supported.";
}
}

const btnReadedAndRemove = document.getElementById("btnReadedAndRemove");
btnReadedAndRemove.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = getKey(tab.url);
    chrome.storage.local.remove(pageUrl, () => {
      document.getElementById("output").innerHTML = "The storeage of '" + tab.url + "' be cleared!";
    });
  }
});

const btnAllRecords = document.getElementById("btnAllRecords");
btnAllRecords.addEventListener('click', async () => {
  chrome.tabs.create({ active: true, url: '/records/allRecords.html' });
});

