# Chrome Extension EasyRead 轻松阅读

[[English](../README.md) | **[中文](README-CN.md)**]

这是一款Chrome/Edge扩展，为您打造流畅的网页浏览体验，包括但不限于：稍后阅读、添加笔记、自动记录等核心功能。

我们推荐这样的阅读流程：

1. 轻松阅读任意网页，和平时一样，没有任何打扰。
2. 当您看到值得记录的内容，随手选中，**添加到笔记**。
3. 当您有大量资料的时候，点击**稍后阅读**，让它们变成待办事项，再慢慢精读。
4. 当您打开已经访问过的网页的时候，它自动帮您恢复到**上次访问的位置**。
5. 为了巩固知识，我们推荐您定期进行数据管理，导出并删除历史数据，使用第三方工具来整理您的访问历史和笔记。
6. 下一次阅读不再从互联网的任意位置随机开始，而是从**EasyRead 轻松阅读**的**稍后阅读**开始。

为了获得更好的用户体验：

我们建议您将EasyRead扩展始终显示在工具栏中，您将获得**稍后阅读**数量提醒和**更少的操作步骤**。

1. 扩展安装完成后，默认是不显示在工具栏中的。
2. 调整该扩展始终显示在工具栏中，请尝试下列步骤：
    - Google Chrome：扩展图标 > EasyRead > “固定”（图钉图标）。
    - Microsoft Edge：Alt+F > 扩展 > EasyRead > “在工具栏中显示”（可视图标）。

## 特性

### 稍后阅读

1. 添加当前页面到稍后阅读列表。
2. 稍后阅读计数器辅助你管理未读。
3. 阅读进度帮助你断点续读。
4. 当前页弹跳提醒替你确认是否已在列表中。

### 添加笔记

1. 按页管理笔记，一篇文章就是一个知识单元。
2. 选中页面文字，添加到笔记。
3. 按页查看笔记，多段笔记按添加顺序呈现。
4. 支持导出到Markdown格式。

### 自动记录

1. 记录所有访问的网页。
2. 追踪访问次数、时间等。

### 导入导出

1. 所有数据均存储在浏览器本地存储。
2. 支持一键全部导出作为备份。
3. 支持替换存储和合并存储两种恢复模式。
4. 支持删除所有数据、部分数据以节省空间等目的。

## 如何安装

### 01 在线安装（推荐）

1. [Google Chrome Web Store](https://chrome.google.com/webstore/detail/easyread/lpopnmoejimlifiejilnpneckijlgodg)
2. [Microsoft Edge Store](https://microsoftedge.microsoft.com/addons/detail/hcebppkpnooppfiigihimjnahoknakdp)

### 02 手动模式（安装包）

[下载由浏览器插件市场提供签名的版本](https://github.com/volnet/chrome-extensions-easyread/releases)

### 02 手动模式（源码模式，仅适用于开发者）

要安装扩展，请按照下列步骤操作：

1. 克隆或下载此存储库。
2. 打开谷歌浏览器并转到 `chrome://extensions`（打开 Microsoft Edge 并转到 `edge://extensions`）。
3. 通过切换右上角的开关启用“开发者模式”。
4. 单击“加载已解压的扩展程序 / 加载解压缩的扩展”并选择您克隆/下载此存储库的目录。

## 如何使用

1. 稍后阅读：点开扩展“稍后阅读”按钮 / 页面任意空白位置，右键“稍后阅读”。
2. 添加笔记：鼠标选择文字，右键“添加到笔记”。
3. 备份恢复：点击“齿轮”进入“设置”页面，“下载存储”，并在需要恢复的时候“还原存储”。

## 开发

本项目用到第三方JavaScript库，可以通过以下方式获得：

```bash
npm install
```

## 构建

本项目使用Grunt打包，输出文件是`dist/`。

```bash
grunt
```

## 参与到项目

欢迎提供任何形式的反馈，包括但不限于：

1. 改进意见。
2. 错误反馈。
3. 贡献代码。

如果您发现错误或有功能请求，请打开一个问题。如果您想贡献代码，请分叉存储库并提交拉取请求。

## 联系我

1. 通过[GitHub](https://github.com/volnet)获得最新的联系方式，项目地址：[https://github.com/volnet/chrome-extensions-easyread](https://github.com/volnet/chrome-extensions-easyread) 。
2. 通过[Twitter(@GongCen)](https://twitter.com/GongCen)或者[Email(eeee6688@hotmail.com)](mailto:eeee6688@hotmail.com)联系我。

## 许可协议

该项目根据 Apache License 2.0 许可。 有关详细信息，请参阅 [LICENSE](LICENSE) 文件。
