# Use grunt to pack the source code to zip

## Install and config Grunt

See also:

1. [Official Grunt Getting Started Document](https://github.com/volnet/grunt-get-started).
2. [Official grunt-crx documents](https://www.npmjs.com/package/grunt-crx).

> current directory: project root directory

```bash
npm install --golbal grunt-cli
npm install --save-dev grunt
npm install --save-dev grunt-crx
```

Create a new file: `Gruntfile.js`.

It's a sample code. [Gruntfile.js](/Gruntfile.js).

> Known issue:
>
> When using the `files` configuration for the output task, it may not generate correctly.
>
> It could be due to this line of code ([`var done = this.async();`](https://github.com/thom4parisot/grunt-crx/blob/bd3389b04edf1b1e47324322a7e6a7e3c66b65e0/tasks/crx.js#LL19C20-L19C20) ) where the objects at the front of the queue are marked as completed and done is called, while the ones at the back are still unfinished.

```javascript
module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        manifest: require('./src/manifest.json'),
        crx: {
            options: {
                privateKey: "./key.pem"
            },
            staging: {
                "src": [
                    "src/**/*",
                    "!.{git,svn}",
                    "!*.pem"
                ],
                "dest": "output/staging/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>.crx",
                "options": {
                    "baseURL": "https://github.com/volnet/chrome-extensions-easyread"
                }
            },
            production: {
                files: {
                    "output/production/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>.zip": [
                        "src/**/*",
                        "!.{git,svn}",
                        "!*.pem",
                        "!dev/**"
                    ]
                },{
                    "output/production/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>.crx": [
                        "src/**/*",
                        "!.{git,svn}",
                        "!*.pem",
                        "!dev/**"
                    ]
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-crx');
    grunt.registerTask('default', ['crx']);
};
```

## Create a key.pem file

```bash
openssl genpkey -algorithm RSA -out key.pem -pkeyopt rsa_keygen_bits:2048
```

### Build

```bash
grunt
```

### WARNING

The Chrome / Edge is not supported user install .crx which is not from [Chrome Web Store](https://chrome.google.com/webstore/) / [Microsoft Edge addons Store](https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home) except the enterprise users, so you usually not need the .crx export. 

You can only upload the .zip file to the [Chrome Web Store Dashboard](https://chrome.google.com/webstore/devconsole/register) or [Microsoft Edge Dashboard](https://partner.microsoft.com/zh-cn/dashboard/microsoftedge/overview).

