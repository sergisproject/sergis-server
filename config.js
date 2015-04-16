/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file holds configuration information for sergis-server.
// NOTE: Changing this file is quite breaking to clones of sergis-server that use modified versions of this file!!
// Be extremely careful and obnoxiously loud when changing it.

// node modules
var path = require("path");

/**
 * Information about command-line arguments that can be passed to server.js.
 * @type Array.<Array.<String>>
 */
var argdata = [
    ["start", "Start both the HTTP server and the socket server."],
    ["start-http-server[=true,false]", "Start the HTTP server."],
    ["start-socket-server[=true,false]", "Start the socket server."],
    ["http-server-origin=http://hostname:post", "Origin for the HTTP server (if separate from the socket server)"],
    ["socket-server-origin=http://hostname:port", "Origin for the socket server (if separate from the HTTP server)"],
    ["http-server-prefix=/path/prefix/by/server", "Prefix to the path added by a forwarding server wrapping the HTTP server"],
    ["socket-server-prefix=/path/prefix/by/server", "Prefix to the path added by a forwarding server wrapping the socket server"]
];


/**
 * Arguments passed via the command line (argv).
 * @type {Object.<string, (string|boolean)>}
 */
var args = {};

/**
 * Parse command-line arguments passed via the command line.
 */
(function () {
    // ONLY PROCESS IF WE WERE REQUIRE'D BY server.js
    if (path.basename(module.parent.filename) != "server.js") {
        return;
    }
    
    var argv = process.argv.slice(2), name, value;
    for (var i = 0; i < argv.length; i++) {
        arg = argv[i];
        if (argv[i].indexOf("=") != -1) {
            name = argv[i].substring(0, argv[i].indexOf("="));
            value = argv[i].substring(argv[i].indexOf("=") + 1) || true;
            if (value === "true") value = true;
            if (value === "false") value = false;
        } else {
            name = argv[i];
            value = true;
        }
        args[name] = value;
    }
})();

var config = module.exports = {};


////////////////////////////////////////////////////////////////////////////////
// GENERAL CONFIG


/**
 * Whether development mode is on. If true, then timing messages are shown.
 *
 * @type {boolean}
 */
config.DEVELOPMENT = process.env && process.env.NODE_ENV == "development";


/**
 * Default server port.
 *
 * @type {number|string}
 */
config.PORT = process.env.PORT || 3000;


/**
 * MongoDB server path.
 *
 * @type {string}
 */
config.MONGO_SERVER = "mongodb://localhost:27017/sergis-server";


/**
 * Session secret.
 * NOTE: This should be changed from the default!
 *
 * @type {string}
 */
config.SESSION_SECRET = "put-your-random-sergis-session-secret-here";


///////////////////////////////////////////////////////////////////////////
// ARGUMENT-OVERRIDDEN CONFIG


/**
 * Whether to start the HTTP server.
 *
 * @type {boolean}
 */
config.ENABLE_HTTP_SERVER = !!(args["start-http-server"] || args["start"]);


/**
 * Whether to start the WebSockets (socket.io) server.
 *
 * @type {boolean}
 */
config.ENABLE_SOCKET_SERVER = !!(args["start-socket-server"] || args["start"]);


/**
 * Origin for the HTTP server.
 * (Set to "" if the HTTP server is running in the same node instance as
 *  the socket.io server.)
 *
 * @type {string}
 */
config.HTTP_ORIGIN = args["http-server-origin"] || "";


/**
 * Origin for the socket.io server.
 * (Set to "" if the socket.io server is running in the same node instance
 *  as the HTTP server.)
 *
 * @type {string}
 */
config.SOCKET_ORIGIN = args["socket-server-origin"] || "";


/**
 * The prefix to the path.
 * Example: if some proxy is serving us at /my-web-game/..., this would be
 * "/my-web-game"
 *
 * NOTE: This property is referenced by `grunt`.
 * @see Gruntfile.js
 *
 * @type {string}
 */
config.HTTP_PREFIX = args["http-server-prefix"] || "";


/**
 * The prefix to the socket.io server, if hosted through some sort of proxy
 * that adds to the beginning of the path.
 * Example: if the socket.io.js path is /my-web-game/socket.io/socket.io.js,
 * this would be "/my-web-game".
 *
 * @type {string}
 */
config.SOCKET_PREFIX = args["socket-server-prefix"] || "";


///////////////////////////////////////////////////////////////////////////
// DATA DIRECTORIES


/**
 * Alternate HTTP path for the SerGIS Client static files
 * (i.e. the sergis-client/lib).
 * If not provided (empty string), defaults to /client-lib/ (served through
 * node.js). This is set at the bottom of this file.
 *
 * @type {string}
 */
config.CLIENT_STATIC = "";


/**
 * sergis-client directory.
 * Used for serving "lib" (at /client-lib/...) and using index.html.
 *
 * NOTE: This directory is referenced by `grunt`.
 * @see Gruntfile.js
 *
 * @type {string}
 */
config.SERGIS_CLIENT = path.join(__dirname, "sergis-client");


/**
 * sergis-client JavaScript files to concatenate and minify (in this order)
 * if the sergis-server backend is used.
 *
 * NOTE: These files are referenced by `grunt`.
 * @see Gruntfile.js
 *
 * @type {Array.<string>}
 */
config.CLIENT_RESOURCES_JS = ["es6-promise.js", "main.js", "frontends/arcgis.js",
                              "backends/sergis-server.js"];


/**
 * sergis-client JavaScript files to concatenate and minify (in this order)
 * if the local backend is used.
 *
 * NOTE: These files are referenced by `grunt`.
 * @see Gruntfile.js
 *
 * @type {Array.<string>}
 */
config.CLIENT_RESOURCES_JS_LOCAL = ["es6-promise.js", "main.js", "frontends/arcgis.js",
                                    "backends/game-common.js", "backends/local.js"];


/**
 * Alternate HTTP path for the SerGIS Author static files
 * (i.e. the sergis-author directory).
 * If not provided (empty string), defaults to /author-lib/ (served through
 * node.js). This is set at the bottom of this file.
 *
 * @type {string}
 */
config.AUTHOR_STATIC = "";


/**
 * sergis-author directory.
 * Used for serving at /author-lib/... and using index.html.
 *
 * NOTE: This directory is referenced by `grunt`.
 * @see Gruntfile.js
 *
 * @type {string}
 */
config.SERGIS_AUTHOR = path.join(__dirname, "sergis-author");


/**
 * sergis-author JavaScript files to concatenate and minify (in this order).
 *
 * NOTE: These files are referenced by `grunt`.
 * @see Gruntfile.js
 *
 * @type {Array.<string>}
 */
config.AUTHOR_RESOURCES_JS = [
    "es6-promise.js", "author-checkpromise.js",
    "author-main.js", "author-ask.js",
    "author-json.js", "author-games.js", "author-table.js",
    "author-editor.js", "author-action-editor.js", "author-frontend-info-editor.js",
    "author-backend_sergis-server.js"
];


/**
 * Directory to look for minified JS files and source maps generated by `grunt`.
 *
 * NOTE: This directory is referenced by `grunt`.
 * @see Gruntfile.js
 *
 * @type {string}
 */
config.STATIC_DIR = path.join(__dirname, "dist");


///////////////////////////////////////////////////////////////////////////
// Misc.


/**
 * Whether to temporarily disable login and assume everyone is a logged-in
 * admin. Can be used when first setting up the server before there are any
 * accounts. MUST BE SET TO `false` ONCE THE SERVER IS SET UP!!
 *
 * @type {boolean}
 */
config.ASSUME_ADMIN = false;


/**
 * Regex for things that must be URL-safe (i.e. usernames and game names).
 *
 * @type {RegExp}
 */
config.URL_SAFE_REGEX = /^[A-Za-z0-9~$\*()"':;,\.\-_]+$/;


/**
 * Human-readable character list for URL_SAFE_REGEX.
 *
 * @type {string}
 */
config.URL_SAFE_REGEX_CHARS = "~ $ * ( ) \" ' : ; , . - _";


/**
 * Information about command-line arguments that can be passed to server.js.
 *
 * @type {Object.<string, (string|boolean)>}
 */
config.argdata = argdata;



////////////////////////////////////////////////////////////////////////////////

// Check CLIENT_STATIC
if (!config.CLIENT_STATIC) config.CLIENT_STATIC = config.HTTP_PREFIX + "/client-lib/";
if (config.CLIENT_STATIC.substr(-1) == "/") config.CLIENT_STATIC = config.CLIENT_STATIC.slice(0, -1);

// Check AUTHOR_STATIC
if (!config.AUTHOR_STATIC) config.AUTHOR_STATIC = config.HTTP_PREFIX + "/author-lib/";
if (config.AUTHOR_STATIC.substr(-1) == "/") config.AUTHOR_STATIC = config.AUTHOR_STATIC.slice(0, -1);


// TIMING STUFF (to test performance)
var startTime, prevTime;
config.time = function (fileName, description) {
    if (!config.DEVELOPMENT) return;
    if (!startTime) startTime = prevTime = process.hrtime();
    var timeFromStart = process.hrtime(startTime);
    var timeFromPrev = process.hrtime(prevTime);
    prevTime = process.hrtime();
    
    timeFromStart = (timeFromStart[0] + timeFromStart[1] / 1e9).toFixed(5);
    timeFromStart = ("          " + timeFromStart).substr(Math.min(-10, -timeFromStart.length));
    
    timeFromPrev = ((timeFromPrev[0] + timeFromPrev[1] / 1e9) * 1000).toFixed(3);
    timeFromPrev = ("          " + timeFromPrev).substr(Math.min(-10, -timeFromPrev.length));
    
    console.log("::: TIMING [" + timeFromStart + " sec] [" + timeFromPrev + " ms diff]: " + fileName + ": " + description);
};
