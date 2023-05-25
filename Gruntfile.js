module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        manifest: require('./src/manifest.json'),
        clean: {
            build: ['dist/*', 'output/*']
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
        crx: {
            zip: {
                src: "dist/**/*",
                dest: "output/chrome-extensions-<%= pkg.name %>-<%= manifest.version %>.zip",
            },
        }
    });

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-crx');
    grunt.registerTask('default', ['clean','copy', 'crx']);
};
