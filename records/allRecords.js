import * as easyReadTools from '../scripts/easyReadTools.js';

easyReadTools.getStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME]), (result) => {
    const elements = new Set();
    const template = document.getElementById('line_template');
    const allRecords = result[easyReadTools.ALL_RECORDS_NAME];
    let i = 0;
    if(allRecords){
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
        if(item['position'] && item['position'].progress) {
          element.querySelector('.readProgress').textContent = item['position'].progress.toFixed(2) + "%";
        }
 
        
        elements.add(element);
        document.getElementById('outputTable').appendChild(element);
      }
    }
    document.getElementById('createdTime').innerText = easyReadTools.formatDate(Date.now()); 
});

window.addEventListener('load', function() {
  document.getElementById("allrecords_page_title").textContent = easyReadTools.getMessageForLocales("allrecords_page_title");
  document.getElementById("allrecords_page_notice").textContent = easyReadTools.getMessageForLocales("allrecords_page_notice");
});
