/**
 * Get the scroll bar progress
 * @returns {string} Scroll bar progress
 */
function getScrollProgress() {
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
function setScrollProgress(progress) {
    const pageHeight = document.documentElement.scrollHeight;
    const windowHeight = window.innerHeight;
    const scrollPosition = (pageHeight - windowHeight) * (progress / 100);
    window.scrollTo(0, scrollPosition);
}

function getScrollPosition() {
    let postion = {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        progress: getScrollProgress()
    }
    return postion;
}

function setScrollPostion(postion) {
    window.scroll({
        left: postion.scrollX,
        top: postion.scrollY,
        behavior: 'smooth'
    });
}

// sendMessage from UserPage(content.js) to Extension(background.js)
async function sendMessagePagePosition(position) {
    const response = await chrome.runtime.sendMessage({ position: position });
    console.log("sendMessagePagePosition from content.js to background.js", response);
}

let userHasScrolled = false;
let scrollTimer;

(() => {
    window.addEventListener('scroll', () => {
        userHasScrolled = true;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(async () => {
            try {
                const position = getScrollPosition();
                await sendMessagePagePosition(position);
            } catch (e) {
                console.log(e);
            }
            // console.log("sendMessagePageProgress(" + position + ")");
        }, 3000); // After scroll 3 seconds to reduce message.
    });
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        console.log("chrome.runtime.onMessage.addListener - callback invoked.");
        /*
        if(userHasScrolled) {
            console.log("User has scroll the page, don't recovery the old scroll postion.");
            // Here can inject a confirm div to user to decide is need to auto set scroll.
        }
        else {*/
        if(!userHasScrolled) {
            console.log("chrome.runtime.onMessage.addListener - setScroll - received message:", message);
            if (message && message.command == "setScroll") {
                setScrollPostion(message.position);
            }
        }
    });
})();