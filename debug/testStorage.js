    window.addEventListener("load", function () {
        console.log("onload");
        chrome.storage.local.get(null).then((result) => {
          document.getElementById("output").textContent = JSON.stringify(result, null, 2);
        });
    });
