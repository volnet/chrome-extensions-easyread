# Chrome Extension EasyRead

[**[English](README.md)** | [中文](docs/README-CN.md)]

This is a Chrome / Edge extension that creates a smooth web browsing experience for you, providing but not limited to: core functions such as reading later, adding notes, and auto-recording.

We recommend this reading process:

1. Easily read any web page, as usual, without any interruptions.
2. When you see something worth recording, select it and **Add to note**.
3. When you have a lot of materials, click **Read Later** to turn them into to-do items, and then read them slowly.
4. When you open a webpage that you have already visited, it will automatically restore you to the **last visited location**.
5. In order to consolidate knowledge, we recommend that you regularly perform data management, export and delete historical data, and use third-party tools to organize your access history and notes.
6. The next reading does not start randomly from anywhere on the Internet, but from **EasyRead**'s **Read Later** list.

For a better user experience:

We recommend you keep the EasyRead extension always displayed in the toolbar, you will get **read it later** quantity reminders and **fewer steps**.

1. After the extension is installed, it is not displayed in the toolbar by default.
2. To adjust the extension to always appear in the toolbar, please try the following steps:
     - Google Chrome: Extensions icon > EasyRead > "Pin" (pin icon).
     - Microsoft Edge: Alt+F > Extensions > EasyRead > "Show in toolbar" (visual icon).

## Features

### Read Later

1. Add current page to read later list.
2. Later read counter to help you manage unread.
3. The reading progress helps you to continue reading.
4. The pop-up reminder on the current page will confirm for you whether it is already in the list.

### Add Notes

1. Manage notes by page, an article is a knowledge unit.
2. Select the text on the page and add it to the note.
3. View notes by page, multi-paragraph notes are presented in the order they were added.
4. Support exporting to Markdown format.

### Auto Record

1. Log all visited web pages.
2. Track the number of visits, time, etc.

### Export & Import

1. All data is stored locally in the browser.
2. Support one-click all export as backup.
3. Supports two recovery modes: replace storage and merge storage.
4. Support the purpose of deleting all data and some data to save space.

## Installation

### 01 Add-ons Store(Recommend)

1. [Google Chrome Web Store](https://chrome.google.com/webstore/detail/easyread/lpopnmoejimlifiejilnpneckijlgodg)
2. [Microsoft Edge Store](https://microsoftedge.microsoft.com/addons/detail/hcebppkpnooppfiigihimjnahoknakdp)

### 02 Manual(Releases)

[Download the release for your browser, signatured by online-web-store.](https://github.com/volnet/chrome-extensions-easyread/releases)

### 03 Manual(Source Code, Developer)

To install the extension, follow these steps:

1. Clone or download this repository. Follow the step [#Develop](#develop) & [#Build](#build), you can found the `/dist/` directory.
2. Open Google Chrome and go to `chrome://extensions`(Open Microsoft Edge and go to `edge://extensions`).
3. Enable "Developer mode" by toggling the switch in the top right corner.
4. Click "Load unpacked" and select the directory where you cloned/downloaded this repository, location to `/dist/<developMode>` directory.

## Usage

1. Read later: Click the extension "Read Later" button / any blank space on the page, right click "Read Later".
2. Add notes: Select the text with the mouse, right-click and "Add to Notes".
3. Backup and recovery: Click the "gear icon" to enter the "Settings" page, "Download storage", and "Replace storage" when recovery is required.

## Develop

This project uses a third-party JavaScript library, which can be obtained in the following ways:

```bash
npm install
```

## Build

This project uses Grunt to pack, you can find the target dir = `dist/`.

```bash
grunt
```

## Contributing

Feedback of any kind is welcome, including but not limited to:

1. Suggestions for improvement.
2. Error feedback.
3. Contribute code.

If you find a bug or have a feature request, please open an issue. If you want to contribute code, please fork the repository and submit a pull request.

## Contact

1. Get the latest contact information through [GitHub](https://github.com/volnet), project address: [https://github.com/volnet/chrome-extensions-easyread](https://github.com/volnet/chrome-extensions-easyread).
2. Contact me via [Twitter(@GongCen)](https://twitter.com/GongCen) or [Email(eeee6688@hotmail.com)](mailto:eeee6688@hotmail.com).

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
