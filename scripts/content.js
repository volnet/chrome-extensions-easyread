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
    let postion =  {
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
function sendMessagePagePosition(position) {
    chrome.runtime.sendMessage({ position: position }, function (response) {
        console.log("Background page responded: " + response);
    });
}


let scrollTimer;
window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
        const position = getScrollPosition();
        sendMessagePagePosition(position);
        console.log("sendMessagePageProgress(" + position + ")");
    }, 1000);
});
