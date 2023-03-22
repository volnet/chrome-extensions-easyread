export const ALL_RECORDS_NAME = "allRecords";

export function getKey(url) {
  return url.split('#')[0].toLowerCase().trim();
}

export function formatDate(timestamp) {
  const dateObj = new Date(timestamp);
  const formattedDate = dateObj.toLocaleString(chrome.i18n.getUILanguage(), {hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', second: 'numeric'});
  return formattedDate;
}

export function sortDateTimeList(datetimes) {
   return datetimes.sort((a,b) => (new Date(b) - new Date(a))); 
}

export function isSupportedScheme(url) {
  return url.startsWith('http');
}

export function isByHuman(datetimes) {
  if(datetimes && datetimes.length > 0) {
    const maxDatetime = new Date(Math.max(...datetimes));
    if((Date.now() - maxDatetime.getTime()) > 60000) {
      return true;
    }
    return false;
  }
}

export function getMessageForLocales(name, placeHolder) {
  if(placeHolder) {
    return chrome.i18n.getMessage(name, placeHolder);
  }
  else {
    return chrome.i18n.getMessage(name);
  }
}