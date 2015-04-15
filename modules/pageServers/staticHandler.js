/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving minified static files.

// node modules
var path = require("path"),
    fs = require("fs");

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
        if (config.MINIFY_JS) {
            // Serve a minified version
            if (!minifiedJS.hasOwnProperty(name)) {
                config.time("staticHandler.js", "Minifying " + name + "...");
                
                // Save current working directory
                var cwd = process.cwd();
                // Set current working directory to filesPath
                // (This is done so that UglifyJS can read the files, but still uses
                //  just the file basename in the source map.)
                process.chdir(filesPath);
                
                // Uglify the files
                var uglifyConfig = {
                    outSourceMap: name + ".map",
                    sourceRoot: sourceRoot
                };
                /*
                if (!config.MINIFY_JS) {
                    uglifyConfig.mangle = false;
                    uglifyConfig.compress = false;
                }
                */
                var result = UglifyJS.minify(files, uglifyConfig);
                
                // Set current working directory back
                process.chdir(cwd);
                
                // Store the minified code in memory
                minifiedJS[name] = {
                    code: result.code,
                    map: result.map
                };
                
                config.time("staticHandler.js", "Minified " + name + ".");
            }

            // Send the end result file on out
            res.set("Content-Type", "text/javascript");
            res.send(minifiedJS[name].code);
        } else {
            // We're not minifying, so just concat all the files
            
            // First, get the contents of all the files
            var contentPromises = [];
            files.forEach(function (fileName) {
                contentPromises.push(new Promise(function (resolve, reject) {
                    fs.readFile(path.join(filesPath, fileName), function (err, data) {
                        if (err) return reject(err);
                        resolve(data);
                    });
                }));
            });
            
            Promise.all(contentPromises).then(function (contents) {
                res.set("Content-Type", "text/javascript");
                res.send(contents.join("\n\n\n\n\n\n"));
            }).catch(function (err) {
                next(err);
            });
        }
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
    path.join(config.SERGIS_AUTHOR, "javascripts"), // filesPath
    config.HTTP_PREFIX + "/author-lib/javascripts/" // sourceRoot
));
router.get("/author.js.map", pageHandlers.getSourceMap.bind(null, "author.js"));

router.get("/client.js", pageHandlers.getMinifiedJS.bind(
    null, // this
    "client.js", // name
    config.CLIENT_RESOURCES_JS, // files
    path.join(config.SERGIS_CLIENT, "lib"), // filesPath
    config.HTTP_PREFIX + "/client-lib/" // sourceRoot
));
router.get("/client.js.map", pageHandlers.getSourceMap.bind(null, "client.js"));

router.get("/client.local.js", pageHandlers.getMinifiedJS.bind(
    null, // this
    "client.local.js", // name
    config.CLIENT_RESOURCES_JS_LOCAL, // files
    path.join(config.SERGIS_CLIENT, "lib"), // filesPath
    config.HTTP_PREFIX + "/client-lib/" // sourceRoot
));
router.get("/client.local.js.map", pageHandlers.getSourceMap.bind(null, "client.local.js"));
