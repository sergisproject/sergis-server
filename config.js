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
 * Arguments passed via the command line (argv).
 * @type {Object.<string, (string|boolean)>}
 */
var args = {};
(function () {
    var arg, name, value;
    for (var i = 2; i < process.argv.length; i++) {
        arg = process.argv[i];
        if (arg.indexOf("=") != -1) {
            name = arg.substring(0, arg.indexOf("="));
            value = arg.substring(arg.indexOf("=") + 1);
        } else {
            name = arg;
            value = true;
        }
        args[name] = value;
    }
})();


/**
 * Information about command-line arguments that can be passed to server.js.
 * @type Array.<Array.<String>>
 */
var argdata = [
    ["start-http-server", "Start the HTTP server."],
    ["start-socket-server", "Start the socket server."],
    ["http-server-origin=http://hostname:post", "Origin for the HTTP server (if separate from the socket server)"],
    ["socket-server-origin=http://hostname:port", "Origin for the socket server (if separate from the HTTP server)"],
    ["http-server-prefix=/path/prefix/by/server", "Prefix to the path added by a forwarding server wrapping the HTTP server"],
    ["socket-server-prefix=/path/prefix/by/server", "Prefix to the path added by a forwarding server wrapping the socket server"]
];


/**
 * SerGIS Server configuration.
 */
var config = module.exports = {
    /**
     * Default server port.
     * @type {number}
     */
    PORT: process.env.PORT || 3000,
    
    /**
     * MongoDB server path.
     * @type {string}
     */
    MONGO_SERVER: "mongodb://localhost:27017/sergis-server",
    
    /**
     * Session secret.
     * NOTE: This should be changed from the default!
     * @type {string}
     */
    SESSION_SECRET: "put-your-random-sergis-session-secret-here",
    
    ///////////////////////////////////////////////////////////////////////////
    // ARGUMENT-OVERRIDDEN CONFIG
    
    /**
     * Whether to start the HTTP server.
     * @type {boolean}
     */
    ENABLE_HTTP_SERVER: !!args["start-http-server"],
    
    /**
     * Whether to start the WebSockets (socket.io) server.
     * @type {boolean}
     */
    ENABLE_SOCKET_SERVER: !!args["start-socket-server"],
    
    /**
     * Origin for the HTTP server.
     * (Set to "" if the HTTP server is running in the same node instance as
     *  the socket.io server.)
     * @type {string}
     */
    HTTP_ORIGIN: args["http-server-origin"] || "",
    
    /**
     * Origin for the socket.io server.
     * (Set to "" if the socket.io server is running in the same node instance
     *  as the HTTP server.)
     * @type {string}
     */
    SOCKET_ORIGIN: args["socket-server-origin"] || "",
    
    /**
     * The prefix to the path.
     * Example: if some proxy is serving us at /my-web-game/..., this would be
     * "/my-web-game"
     * @type {string}
     */
    HTTP_PREFIX: args["http-server-prefix"] || "",
    
    /**
     * The prefix to the socket.io server, if hosted through some sort of proxy
     * that adds to the beginning of the path.
     * Example: if the socket.io.js path is /my-web-game/socket.io/socket.io.js,
     * this would be "/my-web-game".
     * @type {string}
     */
    SOCKET_PREFIX: args["socket-server-prefix"] || "",
    
    ///////////////////////////////////////////////////////////////////////////
    // DATA DIRECTORIES
    
    /**
     * Templates directory.
     * @type {string}
     */
    TEMPLATES_DIR: path.join(__dirname, "templates"),
    
    /**
     * sergis-client resources directory.
     * (mapped to http://this-nodejs-server/client-lib/...)
     * @type {string}
     */
    CLIENT_RESOURCES_DIR: path.join(__dirname, "sergis-client", "lib"),
    
    /**
     * sergis-client JavaScript files to concatenate and minify (in this order)
     * if the sergis-server backend is used.
     * @type {Array.<string>}
     */
    CLIENT_RESOURCES_JS: ["main.js", "frontends/arcgis.js", "backends/sergis-server.js"],
    
    /**
     * sergis-client JavaScript files to concatenate and minify (in this order)
     * if the local backend is used.
     * @type {Array.<string>}
     */
    CLIENT_RESOURCES_JS_LOCAL: ["main.js", "frontends/arcgis.js", "backends/local.js"],
    
    /**
     * sergis-client index file (path to index.html).
     * @type {string}
     */
    CLIENT_INDEX: path.join(__dirname, "sergis-client", "index.html"),
    
    /**
     * sergis-author resources directory.
     * (mapped to http://this-nodejs-server/author-lib/...)
     * @type {string}
     */
    AUTHOR_RESOURCES_DIR: path.join(__dirname, "sergis-author"),
    
    /**
     * sergis-author JavaScript files to concatenate and minify (in this order).
     * @type {Array.<string>}
     */
    AUTHOR_RESOURCES_JS: [
        "author-main.js", "author-ask.js",
        "author-json.js", "author-games.js", "author-table.js",
        "author-editor.js", "author-action-editor.js", "author-frontend-info-editor.js",
        "author-backend_sergis-server.js"
    ],
    
    /**
     * sergis-author index file (path to index.html).
     * @type {string}
     */
    AUTHOR_INDEX: path.join(__dirname, "sergis-author", "index.html"),

    ///////////////////////////////////////////////////////////////////////////
    // Misc.
    
    /**
     * Whether to temporarily disable login and assume everyone is a logged-in
     * admin. Can be used when first setting up the server before there are any
     * accounts. MUST BE SET TO `false` ONCE THE SERVER IS SET UP!!
     * @type {boolean}
     */
    ASSUME_ADMIN: false,
    
    /**
     * Regex for things that must be URL-safe (i.e. usernames and game names).
     * @type {RegExp}
     */
    URL_SAFE_REGEX: /^[A-Za-z0-9~$"':;,.\-_]+$/,
    
    /**
     * Human-readable character list for URL_SAFE_REGEX.
     * @type {string}
     */
    URL_SAFE_REGEX_CHARS: "~ $ \" ' : ; , . - _",

    /**
     * Information about command-line arguments that can be passed to server.js.
     * @type {Object.<string, (string|boolean)>}
     */
    argdata: argdata
};
