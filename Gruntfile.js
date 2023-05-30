module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        manifest: require('./src/manifest.json'),
        clean: {
            build: ['dist/*']
        },
        copy: {
            production: {
                files: [
                    {
                        expand: true,
                        cwd: 'src',
                        src: ['**', '!assets/logo-dev/**'],
                        dest: 'dist/production/',
                    },
                    {
                        src: 'node_modules/jszip/dist/jszip.min.js',
                        dest: 'dist/production/scripts/jszip.min.js'
                    }
                ]
            },
            development: {
                files: [
                    {
                        expand: true,
                        cwd: 'src',
                        src: ['**', '!assets/logo-dev/**', '!assets/logo/**'],
                        dest: 'dist/development/',
                    },
                    {
                        src: 'node_modules/jszip/dist/jszip.min.js',
                        dest: 'dist/development/scripts/jszip.min.js'
                    },
                    {
                        expand: true,
                        cwd: 'src/assets/logo-dev',
                        src: ['**'],
                        dest: 'dist/development/assets/logo/',
                    }
                ]
            }
        },
        jshint: {
            all: ['Gruntfile.js', 'src/**/*.js']
        },
        "uglify":{
            production: {
                options: {
                    compress: true,
                    beautify: true
                },
                files: [
                    { src:["src/scripts/background.js"], dest:"dist/production/scripts/background.js" },
                    { src:["src/scripts/content.js"], dest:"dist/production/scripts/content.js" },
                    { src:["src/scripts/copyright.js"], dest:"dist/production/scripts/copyright.js" },
                    { src:["src/scripts/easyReadTools.js"], dest:"dist/production/scripts/easyReadTools.js" },
                    { src:["src/records/allRecords.js"], dest:"dist/production/records/allRecords.js" },
                    { src:["src/popup/popup.js"], dest:"dist/production/popup/popup.js" },
                    { src:["src/setting/setting.js"], dest:"dist/production/setting/setting.js" },
                    { src:["src/debug/testStorage.js"], dest:"dist/production/debug/testStorage.js" },
                ]
            }
        },
        "crx": {
            production: {
                files: [
                    {
                        src: "dist/development/**/*",
                        dest: "output/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>-prod.zip",
                    },
                    {
                        src: "dist/production/**/*",
                        dest: "output/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>-prod.crx",
                        options: {
                            privateKey: 'key.pem'
                        }
                    }
                ]
            },
            development: {
                files: [
                    {
                        src: "dist/development/**/*",
                        dest: "output/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>-dev.zip",
                    },
                    {
                        src: "dist/development/**/*",
                        dest: "output/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>-dev.crx",
                        options: {
                            privateKey: 'key.pem'
                        }
                    }
                ]
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-crx-new');

    grunt.registerTask('default', ['clean', 'copy', 'uglify', 'crx']);
    grunt.registerTask('do-jshint', ['jshint']);
    grunt.registerTask('export-crx', ['crx']);
};
