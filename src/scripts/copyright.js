function addCopyrightInfo() {
    var divElement = document.querySelector('.copyright');
    if(divElement) {
        divElement.textContent = "";

        // https://developer.chrome.com/docs/extensions/mv3/manifest/
        const manifest = chrome.runtime.getManifest();

        var imgElement1 = document.createElement('img');
        imgElement1.src = '../assets/github-favicon.svg';
        imgElement1.alt = 'GitHub:';
        imgElement1.classList.add("copyrightImg");
        
        var linkElement1 = document.createElement('a');
        linkElement1.href = manifest["homepage_url"];
        linkElement1.title = manifest["homepage_url"];
        linkElement1.target = '_blank';
        linkElement1.textContent = 'GitHub';
        
        var imgElement2 = document.createElement('img');
        imgElement2.src = '../assets/email.png';
        imgElement2.alt = 'Email:';
        imgElement2.classList.add("copyrightImg");
        
        var linkElement2 = document.createElement('a');
        linkElement2.href = "mailto:" + manifest["author"]["email"];
        linkElement2.title = manifest["author"]["email"];
        linkElement2.textContent = 'Email';

        var spanElement1 = document.createElement('span');
        const versionText = "v" + manifest["version"];
        spanElement1.title = versionText;
        spanElement1.textContent = versionText;
        spanElement1.classList.add("copyrightSpan");
        
        divElement.appendChild(imgElement1);
        divElement.appendChild(linkElement1);
        divElement.appendChild(imgElement2);
        divElement.appendChild(linkElement2);
        divElement.appendChild(spanElement1);
    }
}

document.addEventListener('DOMContentLoaded', addCopyrightInfo);