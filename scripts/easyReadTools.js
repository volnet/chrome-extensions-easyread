export const ALL_RECORDS_NAME = "allRecords";

export function getKey(url) {
  return url.split('#')[0].toLowerCase().trim();
}

export function formatDate(timestamp) {
  const dateObj = new Date(timestamp);
  const formattedDate = dateObj.toLocaleString(chrome.i18n.getUILanguage(), { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  return formattedDate;
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

const _storeage = chrome.storage.local;
export const UPDATE_STATUS_YES = 0;
export const UPDATE_STATUS_NO = 1;
export const KEYCHAIN_SEPARATOR = "__EasyReadSeparator__";

function keyChainSplit(keyChain) {
  return keyChain.split(KEYCHAIN_SEPARATOR);
}
export function keyChainGenerate(keys) {
  return keys.join(KEYCHAIN_SEPARATOR);
}

// keys: a key chain like allRecords[KEYCHAIN_SEPARATOR]datetimes
// callback: return the { status:UPDATE_STATUS_*, value:[object], message:[string][optional] }
export function updateStorageJsonData(keyChain, callback, params) {
  const keyArray = keyChainSplit(keyChain);
  if (keyArray && keyArray.length > 0) {
    const key0 = keyArray[0];

    _storeage.get([key0], (result) => {
      var obj = null;
      if (!result[key0]) {
        obj = { [key0]: null };
      } else {
        obj = result;
      }
      function getValue(keys) {
        var value = obj;
        for (var i = 0; i < keys.length; i++) {
          if (!value[keys[i]]) {
            return undefined;
          }
          value = value[keys[i]];
        }
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
        updateBlock = callback(getValue(keyArray), params)
      };
      if (updateBlock && updateBlock.status == UPDATE_STATUS_YES) {
        setValue(keyArray, updateBlock.value);
        _storeage.set(obj, () => {
          console.log("['" + key0 + "']:Updated:" + JSON.stringify(obj));
        });
      } else {
        console.log("Nothing updated. Message: " + updateBlock["message"]);
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
      _storeage.remove(key0, () => {
        if (callback) { callback(); }
        console.log("Removed: key:" + key0 + " removed from the storage.");
      });
    } else if (keyArray.length > 1) {
      _storeage.get([key0], (result) => {
        var obj = result;
        function remove(keys) {
          var value = obj;
          for (var i = 0; i < keys.length - 1; i++) {
            value = value[keys[i]];
          }
          delete value[keys[keys.length - 1]];
        }
        remove(keyArray);
        _storeage.set(obj, () => {
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
export function getStorageJsonData(keyChain, callback) {
  if (!keyChain) {
    _storeage.get(null, (result) => {
      if (callback) { callback(result); }
    });
  } else {
    const keyArray = keyChainSplit(keyChain);
    if (keyArray) {
      const key0 = keyArray[0];
      _storeage.get([key0], (result) => {
        if (keyArray.length == 1) {
          if (callback) { callback(result); }
        } else {
          function getValue(keys) {
            var value = result;
            for (var i = 0; i < keys.length; i++) {
              if (!value[keys[i]]) {
                return undefined;
              }
              value = value[keys[i]];
            }
            return value;
          }
          if (callback) { callback(getValue(keyArray)); }
        }
      });
    }
  }
}

export function clearAllStorage(callback) {
  _storeage.clear(()=>{
    if (callback) { callback() }
  });
}