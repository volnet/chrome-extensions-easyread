import * as easyReadTools from '../scripts/easyReadTools.js';

chrome.storage.local.get(null).then((result) => {
  // document.getElementById("output").innerHTML = JSON.stringify(result);
    const elements = new Set();
    const template = document.getElementById('line_template');
    const allRecords = result[easyReadTools.ALL_RECORDS_NAME];
    //document.getElementById("output").innerHTML = JSON.stringify(allRecords);
    let i = 0;
    for (let key in allRecords) {
        ++i;
        const element = template.content.firstElementChild.cloneNode(true);
        const item = allRecords[key];
        element.querySelector('.seq').textContent = i.toString();
        element.querySelector('.title').textContent = item["title"];
        element.querySelector('a').href = item["url"];
        if(item['datetimes']) {
          element.querySelector('.readedTimes').textContent = item['datetimes'].length.toString();
        }
        elements.add(element);
        document.getElementById('outputTable').appendChild(element);
    }
    document.getElementById('createdTime').innerText = easyReadTools.formatDate(Date.now());
});

const btnClearAll = document.getElementById("btnClearAll");
btnClearAll.addEventListener('click', async () => {
  chrome.storage.local.clear(()=>{
    document.getElementById("output").innerHTML = easyReadTools.getMessageForLocales("allrecords_page_allBeCleared");
  });
});

window.addEventListener('load', function() {
  document.getElementById("allrecords_page_title").textContent = easyReadTools.getMessageForLocales("allrecords_page_title");
  document.getElementById("allrecords_page_notice").textContent = easyReadTools.getMessageForLocales("allrecords_page_notice");
  document.getElementById("btnClearAll").textContent = easyReadTools.getMessageForLocales("allrecords_page_btnClearAll");
});
