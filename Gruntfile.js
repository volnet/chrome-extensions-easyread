module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        manifest: require('./src/manifest.json'),
        clean: {
            build: ['dist/*']
        },
        copy: {
            src: {
                files: [
                    {
                        expand: true,
                        cwd: 'src',
                        src: '**',
                        dest: 'dist/',
                    }
                ]
            },
            jszip: {
                files: [
                    {
                        src: 'node_modules/jszip/dist/jszip.min.js',
                        dest: 'dist/scripts/jszip.min.js'
                    }
                ]
            }
        },
        "crx": {
            options: {
                timeoutMillonseconds : 5000
            },
            zip: {
                src: "dist/**/*",
                dest: "output/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>.zip",
            },
            crx: {
                src: "dist/**/*",
                dest: "output/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>.crx",
                options: {
                    privateKey: 'key.pem'
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-crx-new');

    grunt.registerTask('default', ['clean','copy', 'crx']);
    grunt.registerTask('export-crx', ['crx']);
};
