function addCopyrightInfo() {
    var divElement = document.querySelector('.copyright');
    if(divElement) {
        divElement.textContent = "";

        var imgElement1 = document.createElement('img');
        imgElement1.src = '../images/github-favicon.svg';
        imgElement1.alt = 'GitHub:';
        
        var linkElement1 = document.createElement('a');
        linkElement1.href = 'https://github.com/volnet/chrome-extensions-easyread';
        linkElement1.title = 'https://github.com/volnet/chrome-extensions-easyread';
        linkElement1.target = '_blank';
        linkElement1.textContent = 'GitHub';
        
        var imgElement2 = document.createElement('img');
        imgElement2.src = '../images/email.png';
        imgElement2.alt = 'Email:';
        
        var linkElement2 = document.createElement('a');
        linkElement2.href = 'mailto:eeee6688@hotmail.com';
        linkElement2.title = 'eeee6688@hotmail.com';
        linkElement2.textContent = 'Email';
        
        divElement.appendChild(imgElement1);
        divElement.appendChild(linkElement1);
        divElement.appendChild(imgElement2);
        divElement.appendChild(linkElement2);
    }
}

document.addEventListener('DOMContentLoaded', addCopyrightInfo);