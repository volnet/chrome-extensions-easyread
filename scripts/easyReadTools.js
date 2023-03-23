export const ALL_RECORDS_NAME = "allRecords";
export const READ_LATERS_NAME = "readLaters";
export const READ_STATUS_UNREAD = 0;
export const READ_STATUS_READING = 1;
export const READ_STATUS_READED = 2;

// storage.
export const UPDATE_STATUS_YES = 0;
export const UPDATE_STATUS_NO = 1;
export const KEYCHAIN_SEPARATOR = "__EasyReadSeparator__";

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
export function updateStorageJsonData(keyChain, callback, context) {
  const keyArray = keyChainSplit(keyChain);
  if (keyArray && keyArray.length > 0) {
    const key0 = keyArray[0];

    _storeage.get([key0], (result) => {
      console.log("key0=" + key0);
      console.log(result);
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
        if(keys.length > 0)
          return {[keys[keys.length-1]]:value};
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
        console.log(getValue(keyArray));
        updateBlock = callback(getValue(keyArray), context);
      };
      if (updateBlock && updateBlock.status == UPDATE_STATUS_YES) {
        setValue(keyArray, updateBlock.value);
        _storeage.set(obj, () => {
          console.log("['" + key0 + "']:Updated:");
          console.log(obj);
          if(updateBlock.callback_onUpdated) {
            updateBlock.callback_onUpdated(true, obj);
          }
        });
      } else {
        console.log("Nothing updated. Message: " + updateBlock["message"]);
        if(updateBlock && updateBlock.callback_onUpdated) {
          updateBlock.callback_onUpdated(false);
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
export function getStorageJsonData(keyChain, callback, context) {
  if (!keyChain) {
    _storeage.get(null, (result) => {
      if (callback) { callback(result, context); }
    });
  } else {
    const keyArray = keyChainSplit(keyChain);
    if (keyArray) {
      const key0 = keyArray[0];
      _storeage.get([key0], (result) => {
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
            if(keys.length > 0)
              return {[keys[keys.length-1]]:value};
            else
              return value;
          }
          if (callback) { callback(getValue(keyArray), context); }
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

export async function updateBudgeText () {
  const key = READ_LATERS_NAME;
  let unreadCount = 0;
  let badgeText = "";
  _storeage.get(key, (queryValue) => {
    const list = queryValue[key];
    if(list) {
      for(let i = 0; i < list.length; ++i) {
        if(!list[i].status || list[i].status == READ_STATUS_UNREAD) {
          ++unreadCount;
        }
      }
    }
    if(unreadCount && unreadCount > 0) {
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