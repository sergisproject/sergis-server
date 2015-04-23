/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

var config = require("./config");

function makePaths(base, paths) {
    return paths.map(function (path) {
        return base + "/" + path;
    });
}

module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),


        // jshint
        jshint: {
            options: {
                forin: true,
                freeze: true,
                sub: true,
                //unused: "vars",
                unused: false,
                loopfunc: true,
                globals: {
                    console: true // so we can overwrite it
                }
            },

            // jshint:server
            server: {
                // Node files
                src: ["config.js", "server.js", "modules/*.js", "modules/**/*.js"],
                options: {
                    node: true
                }
            },

            // jshint:client
            client: {
                src: makePaths(config.SERGIS_CLIENT, [
                    "lib/main.js",
                    "lib/backends/*.js",
                    "lib/frontends/*.js"
                ]),
                options: {
                    browser: true,
                    devel: true
                }
            },

            // jshint:author
            author: {
                src: makePaths(config.SERGIS_AUTHOR, ["javascripts/author-*.js"]),
                options: {
                    browser: true,
                    devel: true
                }
            }
        },


        // uglify
        uglify: {
            options: {
                sourceMap: true
            },

            // uglify:client
            client: {
                options: {
                    banner: '/*! SerGIS Project (sergis-client) - <%= grunt.template.today("yyyy-mm-dd") %> */\n',
                    sourceMapRoot: config.HTTP_PREFIX + "/client-lib/"
                },
                src: makePaths(config.SERGIS_CLIENT + "/lib", config.CLIENT_RESOURCES_JS),
                dest: config.SERGIS_CLIENT + "/lib/client.min.js"
            },

            // uglify:client.local
            "client.local": {
                options: {
                    banner: '/*! SerGIS Project (sergis-client) - <%= grunt.template.today("yyyy-mm-dd") %> */\n',
                    sourceMapRoot: config.HTTP_PREFIX + "/client-lib/"
                },
                src: makePaths(config.SERGIS_CLIENT + "/lib", config.CLIENT_RESOURCES_JS_LOCAL),
                dest: config.SERGIS_CLIENT + "/lib/client.local.min.js"
            },

            // uglify:author
            author: {
                options: {
                    banner: '/*! SerGIS Project (sergis-author) - <%= grunt.template.today("yyyy-mm-dd") %> */\n',
                    sourceMapRoot: config.HTTP_PREFIX + "/author-lib/javascripts/"
                },
                src: makePaths(config.SERGIS_AUTHOR + "/javascripts", config.AUTHOR_RESOURCES_JS),
                dest: config.SERGIS_AUTHOR + "/javascripts/author.min.js"
            }
        },


        // cssmin
        cssmin: {
            dist: {
                files: [{
                    src: "static/*",
                    dest: config.STATIC_DIR + "/stylesheet.min.css"
                }]
            }
        },


        // copy
        copy: {
            dist: {
                files: [
                    {
                        cwd: config.SERGIS_CLIENT,
                        src: "lib/client{,.local}.min.js{,.map}",
                        dest: config.STATIC_DIR,
                        expand: true,
                        flatten: true
                    },
                    {
                        cwd: config.SERGIS_AUTHOR,
                        src: "javascripts/author.min.js{,.map}",
                        dest: config.STATIC_DIR,
                        expand: true,
                        flatten: true
                    }
                ]
            }
        },


        // clean
        clean: {
            dist: [
                config.SERGIS_CLIENT + "/lib/client.min.js{,.map}",
                config.SERGIS_CLIENT + "/lib/client.local.min.js{,.map}",
                config.SERGIS_AUTHOR + "/javascripts/author.min.js{,.map}"
            ]
        },


        // watch
        watch: {
            js: {
                files: ["<%= jshint.server.src %>", "<%= jshint.client.src %>", "<%= jshint.author.src %>"],
                tasks: ["jshint", "uglify", "copy", "clean"]
            },
            css: {
                files: ["static/*"],
                tasks: ["cssmin"]
            }
        }
    });

    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-contrib-cssmin");
    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-contrib-watch");

    grunt.registerTask("test", ["jshint"]);
    grunt.registerTask("default", ["jshint", "uglify", "cssmin", "copy", "clean"]);
    grunt.registerTask("dist", ["uglify", "cssmin", "copy", "clean"]);
};
