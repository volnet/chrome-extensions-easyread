function addCopyrightInfo() {
    var divElement = document.querySelector('.copyright');
    if (divElement) {
        divElement.textContent = "";

        // https://developer.chrome.com/docs/extensions/mv3/manifest/
        const manifest = chrome.runtime.getManifest();

        // GitHub Link
        let imgElement1 = document.createElement('img');
        imgElement1.src = '../assets/github-favicon.svg';
        imgElement1.alt = 'GitHub:';
        imgElement1.classList.add("copyrightImg");

        let linkElement1 = document.createElement('a');
        linkElement1.href = manifest["homepage_url"];
        linkElement1.title = manifest["homepage_url"];
        linkElement1.target = '_blank';
        linkElement1.textContent = 'GitHub';

        // Email Link
        let imgElement2 = document.createElement('img');
        imgElement2.src = '../assets/email.png';
        imgElement2.alt = 'Email:';
        imgElement2.classList.add("copyrightImg");

        let linkElement2 = document.createElement('a');
        linkElement2.href = "mailto:" + manifest["author"]["email"];
        linkElement2.title = manifest["author"]["email"];
        linkElement2.textContent = 'Email';

        // Twitter Link
        let imgElement3 = document.createElement('img');
        imgElement3.src = '../assets/twitter-64.png';
        imgElement3.alt = 'Twitter:';
        imgElement3.classList.add("copyrightImg");

        const text = "#EasyRead @GongCen I want ";
        const encodedText = encodeURIComponent(text);
        const twitterUrl = "https://twitter.com/intent/tweet?text=" + encodedText + "&src=share_button";

        let linkElement3 = document.createElement('a');
        linkElement3.href = twitterUrl;
        linkElement3.title = "Twitter";
        linkElement3.target = '_blank';
        linkElement3.textContent = 'Twitter';

        // Version
        let spanElement1 = document.createElement('span');
        const versionText = "v" + manifest["version"];
        spanElement1.title = versionText;
        spanElement1.textContent = versionText;
        spanElement1.classList.add("copyrightSpan");

        divElement.appendChild(imgElement1);
        divElement.appendChild(linkElement1);
        divElement.appendChild(imgElement2);
        divElement.appendChild(linkElement2);
        divElement.appendChild(imgElement3);
        divElement.appendChild(linkElement3);
        divElement.appendChild(spanElement1);
    }
}

document.addEventListener('DOMContentLoaded', addCopyrightInfo);