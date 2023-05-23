export const ALL_RECORDS_NAME = "allRecords";
export const READ_LATERS_NAME = "readLaters";
export const READ_STATUS_UNREAD = 0;
export const READ_STATUS_READING = 1;
export const READ_STATUS_READED = 2;
export const NOTES_NAME = "notes";

// storage.
export const UPDATE_STATUS_YES = 0;
export const UPDATE_STATUS_NO = 1;
export const KEYCHAIN_SEPARATOR = "__EasyReadSeparator__";

export function getKey(url) {
  if (!url || typeof url !== 'string')
    return '';
  else
    return url.split('#')[0].toLowerCase().trim();
}

export function hasAnchor(url) {
  if (!url || typeof url !== 'string')
    return false;
  else
    return url.includes('#');
}

// en-US
// console.log(formatDate(1621760400000));  // export: "5/23/2021, 12:00:00 AM"
// fr-FR
// console.log(formatDate(1621760400000));  // export: "23/05/2021 à 00:00:00"
export function formatDate(timestamp) {
  const dateObj = new Date(timestamp);
  const formattedDate = dateObj.toLocaleString(chrome.i18n.getUILanguage(), { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  return formattedDate;
}

// return: 2023-05-23
export function formatDateAsFileName(timestamp) {
  const dateObj = new Date(timestamp);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}

export function convertToValidFileName(text) {
  if(text && typeof text === 'string') {
    const maxLength = 255;

    const invalidCharsRegex = /[<>:"/\\|?*\x00-\x1F]/g;
    const fileName = text.replace(invalidCharsRegex, '');

    const truncatedFileName = fileName.slice(0, maxLength);
    return truncatedFileName;
  }
  else {
    return '';
  }
}


export function sortDateTimeList(datetimes) {
  return datetimes.sort((a, b) => (new Date(b) - new Date(a)));
}

export function isSupportedScheme(url) {
  return url.startsWith('http');
}

export function isByHuman(datetimes) {
  if (datetimes && datetimes.length > 0) {
    const maxDatetime = new Date(Math.max(...datetimes));
    if ((Date.now() - maxDatetime.getTime()) > 60000) {
      return true;
    }
    return false;
  }
}

export function getMessageForLocales(name, placeHolder) {
  if (placeHolder) {
    return chrome.i18n.getMessage(name, placeHolder);
  }
  else {
    return chrome.i18n.getMessage(name);
  }
}

function padZero(num, length = 2) {
  var padded = num.toString();
  while (padded.length < length) {
    padded = "0" + padded;
  }
  return padded;
}

export function getNowDateTimeString() {
  var currentDate = new Date();
  var timestamp = currentDate.getFullYear().toString() +
    padZero(currentDate.getMonth() + 1) +
    padZero(currentDate.getDate()) +
    padZero(currentDate.getHours()) +
    padZero(currentDate.getMinutes()) +
    padZero(currentDate.getSeconds()) +
    padZero(currentDate.getMilliseconds(), 3);
  return timestamp;
}

export function generateRandomId() {
  return ((new Date().getTime()) + Math.random().toFixed(4)) * 10000;
}

export function exportToJsonFile(data, filename) {
  exportToFile(data, filename, 'application/json', (data) => {
    return JSON.stringify(data, null, 2);
  });
}

export function exportToMarkdownFile(data, filename) {
  exportToFile(data, filename, 'text/markdown');
}

function exportToFile(data, filename, filetype, convertDataCallback) {
  if(data) {
    if(convertDataCallback) {
      data = convertDataCallback(data);
    }
    const blob = new Blob([data], { type: filetype });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }
}

const _storage = chrome.storage.local;

function keyChainSplit(keyChain) {
  return keyChain.split(KEYCHAIN_SEPARATOR);
}
export function keyChainGenerate(keys) {
  return keys.join(KEYCHAIN_SEPARATOR);
}

// keys: a key chain like allRecords[KEYCHAIN_SEPARATOR]datetimes
// callback: Query the value of the keyChain;
//      <return> callback(queryValue);
//        if KEYCHAIN_SEPARATOR == "."
//        queryValue: 
//          if keyChain == "exist_key0" , queryValue:
//                return { "exist_key0": it'sValue }
//          if keyChain == "not_exist_key0" , queryValue:
//                return {}
//          if keyChain == "exist_key0.exist_key1" , queryValue:
//                return { "exist_key1": it'sValue }
//          if keyChain == "exist_key0.not_exist_key1" , queryValue:
//                return {}
//          if keyChain == "exist_key0.not_exist_key1...not_exist_keyN" , queryValue:
//                return {}
// - suggest: in the callback, use the queryValue[key] to check is it available.
// - <return>: updateBlock = { status:UPDATE_STATUS_*, value:[object], message:[string][optional], callback_onUpdated }
//          if update, status = UPDATE_STATUS_YES, the path exist_key0.not_exist_key1 will auto create.
//          if not update, status = UPDATE_STATUS_NO
// context: pass the params;
export async function updateStorageJsonData(keyChain, callback, context) {
  const keyArray = keyChainSplit(keyChain);
  if (keyArray && keyArray.length > 0) {
    const key0 = keyArray[0];

    await _storage.get([key0], (result) => {
      // console.log("key0=" + key0);
      // console.log(result);
      var obj = {};
      if (!result[key0]) {
        obj = { [key0]: null };
      } else {
        obj = result;
      }
      function getValue(keys) {
        var value = result;
        for (var i = 0; i < keys.length; i++) {
          if (!value[keys[i]]) {
            return {};
          }
          value = value[keys[i]];
        }
        if (keys.length > 0)
          return { [keys[keys.length - 1]]: value };
        else
          return value;
      }
      function setValue(keys, newValue) {
        var value = obj;
        for (var i = 0; i < keys.length - 1; i++) {
          if (!value[keys[i]]) {
            value[keys[i]] = {};
          }
          value = value[keys[i]];
        }
        value[keys[keys.length - 1]] = newValue;
      }
      let updateBlock = null;
      if (callback) {
        // console.log(getValue(keyArray));
        updateBlock = callback(getValue(keyArray), context);
      };
      if (updateBlock && updateBlock.status == UPDATE_STATUS_YES) {
        setValue(keyArray, updateBlock.value);
        _storage.set(obj, () => {
          // console.log("['" + key0 + "']:Updated:");
          // console.log(obj);
          if (updateBlock.callback_onUpdated) {
            updateBlock.callback_onUpdated(true, obj, context);
          }
        });
      } else {
        let msg = "";
        if (updateBlock && updateBlock["message"]) {
          msg = updateBlock["message"];
        }
        // console.log("Nothing updated. Message: " + msg);
        if (updateBlock && updateBlock.callback_onUpdated) {
          updateBlock.callback_onUpdated(false, null, context);
        }
      }
    });
  }
}

// keyChain: like allRecords[KEYCHAIN_SEPARATOR][pageUrl]
export function removeStorageJsonData(keyChain, callback) {
  const keyArray = keyChainSplit(keyChain);
  if (keyArray) {
    const key0 = keyArray[0];
    if (keyArray.length == 1) {
      _storage.remove(key0, () => {
        if (callback) { callback(); }
        console.log("Removed: key:" + key0 + " removed from the storage.");
      });
    } else if (keyArray.length > 1) {
      _storage.get([key0], (result) => {
        var obj = result;
        function remove(keys) {
          var value = obj;
          for (var i = 0; i < keys.length - 1; i++) {
            value = value[keys[i]];
          }
          delete value[keys[keys.length - 1]];
        }
        remove(keyArray);
        _storage.set(obj, () => {
          if (callback) { callback(); }
          console.log("Removed: keyChain:" + keyChain);
        });
      });
    }
  } else {
    if (callback) { callback(); }
    console.log("Nothing to removed: keyChain:" + keyChain);
  }
}

// keyChain: null=all; like allRecords[KEYCHAIN_SEPARATOR][pageUrl]
// callback: Query the value of the keyChain;
//      void callback(queryValue);
//        if KEYCHAIN_SEPARATOR == "."
//        queryValue: 
//          if keyChain == "exist_key0" , queryValue:
//                return { "exist_key0": it'sValue }
//          if keyChain == "not_exist_key0" , queryValue:
//                return {}
//          if keyChain == "exist_key0.exist_key1" , queryValue:
//                return { "exist_key1": it'sValue }
//          if keyChain == "exist_key0.not_exist_key1" , queryValue:
//                return {}
//          if keyChain == "exist_key0.not_exist_key1...not_exist_keyN" , queryValue:
//                return {}
// - suggest: in the callback, use the queryValue[key] to check is it available.
// context: pass the params;
export async function getStorageJsonData(keyChain, callback, context) {
  if (!keyChain) {
    _storage.get(null, (result) => {
      if (callback) { callback(result, context); }
    });
  } else {
    const keyArray = keyChainSplit(keyChain);
    if (keyArray) {
      const key0 = keyArray[0];
      await _storage.get([key0], (result) => {
        if (keyArray.length == 1) {
          if (callback) { callback(result, context); }
        } else {
          function getValue(keys) {
            var value = result;
            for (var i = 0; i < keys.length; i++) {
              if (!value[keys[i]]) {
                return {};
              }
              value = value[keys[i]];
            }
            if (keys.length > 0)
              return { [keys[keys.length - 1]]: value };
            else
              return value;
          }
          if (callback) { callback(getValue(keyArray), context); }
        }
      });
    }
  }
}

export async function mergeStorageJsonData(data, callback) {
  if (!data) {
    console.log("mergeStorageJsonData: data is null.");
    if(callback) {
      callback({ "status": false });
    }
    return;
  }
  try {
    var startDateTime = new Date();
    var counterAllRecordsDuplicateItems = 0;
    var counterAllRecordsMergeItems = 0;
    var counterReadLatersMergeItems = 0;
    var counterNotesDuplicateItems = 0;
    var counterNotesMergeItems = 0;

    var newAllRecords = data[ALL_RECORDS_NAME];
    var newReadLaters = data[READ_LATERS_NAME];
    var newNotes = data[NOTES_NAME];
    _storage.get(null).then((result) => {
      // merge all records.
      if (newAllRecords) {
        if(!result[ALL_RECORDS_NAME]) {
          result[ALL_RECORDS_NAME] = {};
        }

        for (let rawKey in newAllRecords) {
          const key = getKey(rawKey);
          let oldItem = result[ALL_RECORDS_NAME][key];
          const newItem = newAllRecords[key];
          if (!oldItem) {
            result[ALL_RECORDS_NAME][key] = newAllRecords[key];
            ++counterAllRecordsMergeItems;
          }
          else {
            // merge items.
            oldItem["url"] = newItem["url"];
            oldItem["title"] = newItem["title"];
            oldItem["position"] = newItem["position"];
            const newDateTimes = newItem["datetimes"];
            const length = newDateTimes.length;
            for (let i = 0; i < length; ++i) {
              const datetime = newDateTimes[i];
              if (!oldItem["datetimes"].includes(datetime)) {
                oldItem["datetimes"].push(datetime);
              }
            } 
            oldItem["datetimes"].sort((a, b) => a - b);
            result[ALL_RECORDS_NAME][key] = oldItem;
            ++counterAllRecordsDuplicateItems;
          }
        }
      }
      // merge readLaters.
      if (newReadLaters) {
        if(!result[READ_LATERS_NAME]) {
          result[READ_LATERS_NAME] = [];
        }
        const length = newReadLaters.length;
        for (var i = 0; i < length; ++i) {
          var item = newReadLaters[i];
          result[READ_LATERS_NAME].push(item);
          ++counterReadLatersMergeItems;
        }
      }
      // merge notes.
      if(newNotes) {
        if(!result[NOTES_NAME]) {
          result[NOTES_NAME] = [];
        }

        for (let rawKey in newNotes) {
          const key = getKey(rawKey);
          let oldItem = result[NOTES_NAME][key];
          const newItem = newNotes[key];
          if (!oldItem) {
            result[NOTES_NAME][key] = newNotes[key];
            ++counterNotesMergeItems;
          }
          else {
            // merge items.
            oldItem["url"] = newItem["url"];
            oldItem["title"] = newItem["title"];
            oldItem["createDateTime"] = oldItem["createDateTime"] < newItem["createDateTime"] ? oldItem["createDateTime"] : newItem["createDateTime"];
            const newNotes = newItem["notes"];
            const length = newNotes.length;
            for (let i = 0; i < length; ++i) {
              const newNote = newNotes[i];
              let oldNoteFound = oldItem["notes"].find((n) => n.id === newNote.id)
              if (oldNoteFound) {
                if(oldNoteFound["createDateTime"] < newNote["createDateTime"]) {
                  for(let jsonName in oldNoteFound) {
                    if(jsonName !== "id" && oldNoteFound.hasOwnProperty(jsonName)) {
                      oldNoteFound[jsonName] = newNote[jsonName];
                    }
                  }
                }
              }
              else {
                oldItem["notes"].push(newNote);
              }
            }
            oldItem["notes"].sort((a, b) => a["createDateTime"] - b["createDateTime"]);
            result[NOTES_NAME][key] = oldItem;
            ++counterNotesDuplicateItems;
          }
        }
      }

      _storage.set(result).then(() => {
        if(callback) {
          callback({
            "status": true,
            "newStorage": result,
            "counterAllRecordsDuplicateItems": counterAllRecordsDuplicateItems,
            "counterAllRecordsMergeItems": counterAllRecordsMergeItems,
            "counterReadLatersMergeItems": counterReadLatersMergeItems,
            "counterNotesDuplicateItems": counterNotesDuplicateItems,
            "counterNotesMergeItems": counterNotesMergeItems,
            "takeMilliseconds": (new Date() - startDateTime)
          });
        }
      });
    });
  } catch(e) {
    if(callback) {
      callback({
        "status": false,
        "error": e
      });
    }
  }
}

export async function replaceStorageJsonData(data, callback) {
  if (!data) {
    console.log("replaceStorageJsonData: data is null.");
    if(callback) {
      callback({ "status": false });
    }
    return;
  }
  try {
    var startDateTime = new Date();
    _storage.get(null).then((result) => {
      _storage.set(data).then(() => {
        if(callback) {
          callback({
            "status": true,
            "oldStorage": result,
            "newStorage": data,
            "takeMilliseconds": (new Date() - startDateTime)
          });
        }
      });
    });
  } catch(e) {
    if(callback) {
      callback({
        "status": false,
        "error": e
      });
    }
  }
}

export function clearAllStorage(callback) {
  _storage.clear(() => {
    if (callback) { callback() }
  });
}

export async function updateBudgeText() {
  const key = READ_LATERS_NAME;
  let unreadCount = 0;
  let badgeText = "";
  _storage.get(key, (queryValue) => {
    const list = queryValue[key];
    if (list) {
      for (let i = 0; i < list.length; ++i) {
        if (!list[i].status || list[i].status == READ_STATUS_UNREAD) {
          ++unreadCount;
        }
      }
    }
    if (unreadCount && unreadCount > 0) {
      badgeText = unreadCount.toString();
    }
    chrome.action.setBadgeText({
      text: badgeText
    });
    chrome.action.setBadgeTextColor({
      color: "#6c5004"
    });
    chrome.action.setBadgeBackgroundColor({
      color: "#ffe803"
    });
  });
}

/** ------- Markdown ------- **/

/**
 * Convert notes to markdown files
 * @param {Array} data ["pageKey1": {...noteInfo...}, "pageKey2": {...noteInfo...}]
 * @param {string} mdTemplate markdown template, with {notesSection} to replace notes section.
 * @param {string} mdNotesSectionTemplate notes section template, with loop to page's notes.
 * */
export function convertNotesToMarkdownFiles(data, mdTemplate, mdNotesSectionTemplate) {
  let files = [];
  if(data) {
    for(let key in data) {
      if(data.hasOwnProperty(key)) {
        const item = data[key];
        const fileName = formatDateAsFileName(item["createDateTime"]) + "_" + convertToValidFileName(item["title"]) + ".md";

        let markdown = "";
        if(mdTemplate) {
          markdown = mdTemplate;
          markdown = markdownTemplaceReplace(markdown, "title", item["title"]);
          markdown = markdownTemplaceReplace(markdown, "url", item["url"]);
          markdown = markdownTemplaceReplace(markdown, "createDateTime", formatDate(item["createDateTime"]));
        }
        if(mdNotesSectionTemplate) {      
          let notesSection = "";
          if(item["notes"]) {          
            for(let i = 0; i < item["notes"].length; ++i) {
              const note = item["notes"][i];
              let notesSectionItem = mdNotesSectionTemplate;
              notesSectionItem = markdownTemplaceReplace(notesSectionItem, "createDateTime", formatDate(note["createDateTime"]))
              notesSectionItem = markdownTemplaceReplace(notesSectionItem, "selectionText", decodeURIComponent(note["selectionText"]))
              notesSection += notesSectionItem;
            }
          }
          markdown = markdown.replace("{notes_section}", notesSection);
        }
        files.push({"name": fileName, "content": markdown} );
      }
    }
  }
  return files;
}

function markdownTemplaceReplace(template, key, value) {
  var regex = new RegExp("\\$" + key + "\\$", "g");
  template = template.replace(regex, value);
  return template;
}

/**
 * Get the scroll bar progress
 * @returns {string} Scroll bar progress
 */
export function getScrollProgress() {
  // Get page height
  const pageHeight = document.documentElement.scrollHeight;
  // Get visible area height
  const windowHeight = window.innerHeight;
  // Get scroll bar position
  const scrollPosition = window.scrollY;
  // Calculate scroll bar progress
  const progress = (scrollPosition / (pageHeight - windowHeight)) * 100;
  return progress;
}

/**
* Set the scroll bar progress
* @param {number} progress Scroll bar progress
*/
export function setScrollProgress(progress) {
  const pageHeight = document.documentElement.scrollHeight;
  const windowHeight = window.innerHeight;
  const scrollPosition = (pageHeight - windowHeight) * (progress / 100);
  window.scrollTo(0, scrollPosition);
}

export function getScrollPosition() {
  let postion = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    progress: getScrollProgress()
  }
  return postion;
}

export function setScrollPostion(postion) {
  window.scroll({
    left: postion.scrollX,
    top: postion.scrollY,
    behavior: 'smooth'
  });
}

// Define a module called Config
const configs = (function () {
  // Define a private variable to store configuration values
  let _configs;

  // Define a private method for loading configuration values from LocalStorage
  function loadConfigFromLocalStorage() {
    /*
      const savedConfig = localStorage. getItem('configs');
      if (savedConfig) {
        return JSON.parse(savedConfig);
      } else {
        return {};
      }*/
    return {};
  }

  // Define a private method for merging configuration objects
  function mergeConfig(configObj) {
    // Load configuration values from LocalStorage
    const savedConfig = loadConfigFromLocalStorage();

    // Merge configuration objects, where values stored in LocalStorage have higher priority
    return Object.assign({}, configObj, savedConfig);
  }

  // Define a public method for initializing the configuration object
  function init(configObj) {
    // If the configuration object has been initialized, return directly
    if (_configs) {
      return;
    }

    // Merge configuration object
    _configs = mergeConfig(configObj);
  }

  // Define a public method for getting configuration objects
  function getConfigs() {
    return _configs;
  }

  // return public method
  return {
    init,
    getConfigs
  };
})();

// Initialize the configuration object globally
configs.init({
  IsAutoRecordedEnabled: true
});

export { configs };
