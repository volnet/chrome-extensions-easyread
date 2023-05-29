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
        "crx": {
            options: {
                timeoutMillonsecondes: 5000
            },
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
    grunt.loadNpmTasks('grunt-crx-new');

    grunt.registerTask('default', ['clean', 'copy', 'crx']);
    grunt.registerTask('export-crx', ['crx']);
};
