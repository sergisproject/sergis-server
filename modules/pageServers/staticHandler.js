/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving minified static files.

// node modules
var path = require("path");

// required modules
var express = require("express"),
    UglifyJS = require("uglify-js");

// our modules
var config = require("../../config");

// The router for /static/
var router = module.exports = express.Router();

// The JS files that we have minified
var minifiedJS = {
    /*
    "localpath": {
        code: "minified JS code",
        map: "source map of minified JS code"
    }
    */
};


////////////////////////////////////////////////////////////////////////////////
// The page handlers for /static/
var pageHandlers = {
    /**
     * Serve one or more JavaScript files, concatenated and minified.
     *
     * @param {string} name - A unique name for this set of files that should
     *        match the name of the file in the URL path. The source map is
     *        named "name.map".
     * @param {Array.<string>} files - The names of the JS files to concatenate
     *        and minify.
     * @param {string} filesPath - The path to the folder that contains the JS
     *        files.
     * @param {string} sourceRoot - The root of the actual source files (on
     *        the HTTP server).
     */
    getMinifiedJS: function (name, files, filesPath, sourceRoot, req, res, next) {
        if (!minifiedJS.hasOwnProperty(name)) {
            console.log("Minifying JS: " + name);
            // Save current working directory
            var cwd = process.cwd();
            // Set current working directory to filesPath
            // (This is done so that UglifyJS can read the files, but still uses
            //  just the file basename in the source map.)
            process.chdir(filesPath);
            // Uglify the files
            var result = UglifyJS.minify(files, {
                outSourceMap: name + ".map",
                sourceRoot: sourceRoot
            });
            // Set current working directory back
            process.chdir(cwd);
            // Store the minified code in memory
            minifiedJS[name] = {
                code: result.code,
                map: result.map
            };
        }
        
        // Send the end result file on out
        res.set("Content-Type", "text/javascript");
        res.send(minifiedJS[name].code);
    },
    
    /**
     * Serve the source map for previously minified JavaScript file(s).
     *
     * @param {string} name - The name given to `getMinifiedJS`.
     */
    getSourceMap: function (name, req, res, next) {
        if (!minifiedJS.hasOwnProperty(name)) {
            // AHH! Not found!
            return next("route");
        }
        
        // Send the end result file on out
        res.set("Content-Type", "application/json");
        res.send(minifiedJS[name].map);
    }
};


////////////////////////////////////////////////////////////////////////////////
// Set up all the page handler routing
router.get("/author.js", pageHandlers.getMinifiedJS.bind(
    null, // this
    "author.js", // name
    config.AUTHOR_RESOURCES_JS, // files
    path.join(config.AUTHOR_RESOURCES_DIR, "javascripts"), // filesPath
    config.HTTP_PREFIX + "/author-lib/javascripts/" // sourceRoot
));
router.get("/author.js.map", pageHandlers.getSourceMap.bind(null, "author.js"));

router.get("/client.js", pageHandlers.getMinifiedJS.bind(
    null, // this
    "client.js", // name
    config.CLIENT_RESOURCES_JS, // files
    config.CLIENT_RESOURCES_DIR, // filesPath
    config.HTTP_PREFIX + "/client-lib/" // sourceRoot
));
router.get("/client.js.map", pageHandlers.getSourceMap.bind(null, "client.js"));

router.get("/client.local.js", pageHandlers.getMinifiedJS.bind(
    null, // this
    "client.local.js", // name
    config.CLIENT_RESOURCES_JS_LOCAL, // files
    config.CLIENT_RESOURCES_DIR, // filesPath
    config.HTTP_PREFIX + "/client-lib/" // sourceRoot
));
router.get("/client.local.js.map", pageHandlers.getSourceMap.bind(null, "client.local.js"));
