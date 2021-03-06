/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */


/*****************************************************************************/
// mongod --dbpath=\mongodata --port 27017
// mongod --dbpath=/var/mongod
/*****************************************************************************/


// node modules
var path = require("path"),
    fs = require("fs");

// required modules
// NOTE: require'd below if needed:
// express, express-sessions, connect-mongo, http, socket.io, cookie-parser,
// body-parser, hbs, serve-index

// our modules
var config = require("./config");
// NOTE: ./modules/db and ./modules/accounts are require'd below if needed


config.time("server.js", "top");


/**
 * The different plain static file directories.
 * The keys are the Express paths, and the values are objects with these
 * properties:
 *   `path`: The local path to the directory to serve.
 *   `requiredFiles`: Files that we should check are in the directory (optional)
 *                    NOTE: This is not able to check for files in subdirs!
 */
var STATIC_DIRECTORIES = {
    "/static": {
        path: config.STATIC_DIR,
        requiredFiles: ["author.min.js", "client.min.js", "client.local.min.js"]
    },
    "/client-lib": {
        path: path.join(config.SERGIS_CLIENT, "lib")
    },
    "/author-lib": {
        path: config.SERGIS_AUTHOR
    },
    "/uploads": {
        path: config.UPLOADS_DIR
    }
};


/**
 * The different modules for the different sections of the HTTP server.
 * The keys are the Express paths, and the values are the filenames of the
 * modules in `modules/pageServers/`.
 */
var HTTP_SERVERS = {
    "/author": "authorHandler",
    "/account": "accountHandler",
    "/games": "gamesHandler",
    // This one catches everything else
    "/": "homepageHandler"
};


/**
 * The different modules for the different sections of the Socket.IO WebSockets
 * server. The keys are the socket namespaces, and the values are the filenames
 * of the modules in `modules/socketServers/`.
 */
var SOCKET_SERVERS = {
    "/game": "gameSocketHandler",
    "/author": "authorSocketHandler"
};


/**
 * Functions to call right before exiting.
 * @type Array.<Function>
 */
var exitHandlers = [];

/**
 * Initialize the exit handlers.
 */
function initExitHandlers() {
    // So that the server will not close instantly when Ctrl+C is pressed, etc.
    try {
        process.stdin.resume();
    } catch (err) {
        // This might happen if we're not running from a terminal or something
        //console.error("Error listening on stdin: ", err.stack);
    }

    // Catch app closing
    process.on("beforeExit", runExitHandlers);

    // Catch exit signals (NOTE: Ctrl+C == SIGINT)
    process.on("SIGINT", runExitHandlers.bind(this, "caught SIGINT"));
    process.on("SIGTERM", runExitHandlers.bind(this, "caught SIGTERM"));
    process.on("SIGHUP", runExitHandlers.bind(this, "caught SIGHUP"));
    
    // Catch uncaught exceptions
    process.on("uncaughtException", function (err) {
        console.log("");
        console.error("UNCAUGHT EXCEPTION: ", err.stack);
        runExitHandlers();
    });
}

/**
 * Run all the exit handlers.
 *
 * @param {string} reason - The reason that we're exiting.
 */
function runExitHandlers(reason) {
    console.log("");
    console.log("Running exit handlers" + (reason ? " (" + reason + ")" : "") + "...");
    
    // Start from the end and run each exit handler
    while (exitHandlers.length) {
        try {
            exitHandlers.pop()();
        } catch (err) {
            console.error("Error running exit handler: ", err.stack);
        }
    }
    console.log("Exiting server...");
    process.exit();
}


////////////////////////////////////////////////////////////////////////////////
var db;
// Make sure we're starting something and, if so, set up exit handling and init
if (config.ENABLE_HTTP_SERVER || config.ENABLE_SOCKET_SERVER) {
    // Set up database
    db = require("./modules/db");
    config.time("server.js", "Required db.");
    db.addLoadHandler(function () {
        // Database is loaded; set up exit handler system
        initExitHandlers();
        
        // Set up exit handler for database
        exitHandlers.push(function () {
            return db.close();
        });
        
        // Initialize the rest of the server
        init();
    });
} else {
    // Nope, nothing to do
    console.error("Neither HTTP nor socket server enabled!");
    console.log("\nUsage: " + process.argv[0] + " " + process.argv[1] + " [OPTIONS]");
    console.log("\nOptions:");
    var max = Math.max.apply(Math, config.argdata.map(function (arginfo) {
        return arginfo[0].length;
    }));
    config.argdata.forEach(function (arginfo) {
        var msg = "    " + arginfo[0];
        for (var i = 0; i < (max - arginfo[0].length); i++) {
            msg += " ";
        }
        msg += " : " + arginfo[1];
        console.log(msg);
    });
}


////////////////////////////////////////////////////////////////////////////////

var app, server, io;
function init() {
    config.time("server.js", "Init'ing the rest of the server...");
    // Start HTTP server (if enabled)
    if (config.ENABLE_HTTP_SERVER) startHttpServer();
    // Start the Socket server (if enabled)
    if (config.ENABLE_SOCKET_SERVER) startSocketServer();
    
    // Always ready for more
    console.log("Ready\n");
}


/** Start HTTP server. */
function startHttpServer() {
    console.log("Starting SerGIS HTTP server on port " + config.PORT + "...");

    // Require more stuff
    config.time("server.js", "Requiring more stuff...");
    var express = require("express");
    config.time("server.js", "Required express.");
    var session = require("express-session");
    config.time("server.js", "Required express-session.");
    var MongoStore = require("connect-mongo")(session);
    config.time("server.js", "Required connect-mongo.");
    var cookieParser = require("cookie-parser");
    config.time("server.js", "Required cookie-parser.");
    var bodyParser = require("body-parser");
    config.time("server.js", "Required body-parser");
    var hbs = require("hbs");
    config.time("server.js", "Required hbs.");
    var accounts = require("./modules/accounts");

    // Create Express server instance
    app = express();
    server = require("http").Server(app);

    // Listen with the HTTP server on our port
    server.listen(config.PORT);
    
    config.time("server.js", "Express listening on " + config.PORT);

    // Set up plain static directories
    var staticDescrip, staticInfo;
    for (staticDescrip in STATIC_DIRECTORIES) {
        if (STATIC_DIRECTORIES.hasOwnProperty(staticDescrip)) {
            staticInfo = STATIC_DIRECTORIES[staticDescrip];
            if (!staticInfo.path || !fs.statSync(staticInfo.path).isDirectory()) {
                throw new Error("Invalid `path` in STATIC_DIRECTORIES[" + JSON.stringify(staticDescrip) + "]");
            }
            if (staticInfo.requiredFiles) {
                var files = fs.readdirSync(staticInfo.path);
                staticInfo.requiredFiles.forEach(function (filename) {
                    if (files.indexOf(filename) == -1) {
                        throw new Error("Missing file " + filename + " in STATIC_DIRECTORIES[" + JSON.stringify(staticDescrip) + "]");
                    }
                });
            }
            app.use(config.HTTP_PREFIX + staticDescrip, express.static(staticInfo.path));
        }
    }

    // Set up cookie processing
    app.use(cookieParser(config.COOKIE_SIGNING_KEY || undefined));

    // Set up body parser for POST data
    app.use(bodyParser.urlencoded({
        extended: true
    }));

    // Set up sessions
    app.use(session({
        secret: config.SESSION_SECRET,
        // whether to automatically save the session
        resave: false,
        // whether to save the session before anything has been written to it
        saveUninitialized: false,
        // use mongoDB to store the sessions
        store: new MongoStore({
            mongooseConnection: db.getMongooseConnection()
        })
    }));

    // Set up templating
    app.set("views", path.join(__dirname, "views"));
    hbs.registerPartials(path.join(__dirname, "views", "partials"));
    hbs.registerHelper("or", function (a, b, options) {
        return (a || b) ? options.fn(this) : options.inverse(this);
    });
    hbs.registerHelper("or3way", function (a, b, c, options) {
        return (a || b || c) ? options.fn(this) : options.inverse(this);
    });
    hbs.registerHelper("eq", function (a, b, options) {
        return (a == b) ? options.fn(this) : options.inverse(this);
    });
    hbs.registerHelper("formatDate", function (date) {
        date = new Date(date);
        var now = new Date();
        return date.toLocaleDateString("en-US", {
            year: (date.getFullYear() == now.getFullYear()) ? undefined : "numeric",
            month: "long",
            day: "numeric"
        });
    });
    
    // Render HTML files (used for client/author's index.html)
    app.engine("html", function (path, data, callback) {
        if (!data) data = {};
        data.startComment = "<!--";
        data.endComment = "-->";
        data.startJSComment = "/*";
        data.endJSComment = "*/";
        return hbs.__express(path, data, callback);
    });
    
    // Render HBS files (used for sergis-server views)
    app.engine("hbs", function (path, data, callback) {
        if (!data) data = {};
        data.HTTP_PREFIX = config.HTTP_PREFIX;
        data.CLIENT_STATIC = config.CLIENT_STATIC;
        return hbs.__express(path, data, callback);
    });
    
    // Set up SERVER_LOG_DIRS (if applicable)
    if (config.SERVER_LOG_DIRS && Object.keys(config.SERVER_LOG_DIRS).length > 0) {
        var logRouter = express.Router();
        var serveIndex = require("serve-index");
        logRouter.use(accounts.checkUser);
        logRouter.use(accounts.requireLogin);
        logRouter.use(function (req, res, next) {
            if (!req.user.isFullAdmin) {
                req.error = {number: 403};
                return next("route");
            }
            next();
        });
        Object.keys(config.SERVER_LOG_DIRS).forEach(function (logDirName) {
            if (!config.URL_SAFE_REGEX.test(logDirName)) {
                throw new Error("Invalid SERVER_LOG_DIR property: " + logDirName);
            }
            // To serve the individual files (logs)
            logRouter.use("/" + logDirName, express.static(config.SERVER_LOG_DIRS[logDirName]));
            // To serve the index page
            logRouter.use("/" + logDirName, serveIndex(config.SERVER_LOG_DIRS[logDirName]));
        });
        app.use(config.HTTP_PREFIX + "/server-logs", logRouter);
    }

    config.time("server.js", "Express set up.");
    
    // Create handlers for our other page servers (see HTTP_SERVERS above)
    for (var pathDescrip in HTTP_SERVERS) {
        if (HTTP_SERVERS.hasOwnProperty(pathDescrip)) {
            app.use(config.HTTP_PREFIX + pathDescrip, require("./modules/pageServers/" + HTTP_SERVERS[pathDescrip]));
            config.time("server.js", "Express page hander " + pathDescrip + " loaded.");
        }
    }

    // Set up error handling
    app.use(function (err, req, res, next) {
        // NOTE: It probably wouldn't be beneficial to cause any errors here.
        console.error("--------------------------------------------------------------------------------");
        console.error("SerGIS Server ERROR at " + (new Date()) + ":\n" + err.stack + "\n\n");
        res.status(500);
        res.render("error.hbs", {
            title: "Internal Server Error",
            errorPage: true,
            me: req.user,
            number: 500,
            details: "See error console on server, or contact the site administrator with the exact date and time that this error occurred."
        });
    });
}


/** Start the socket server. */
function startSocketServer() {
    // Decide on the socket.io path
    var socketPath;
    if (config.SOCKET_PREFIX) {
        console.log("Setting socket path to " + config.SOCKET_PREFIX + "/socket.io");
        socketPath = config.SOCKET_PREFIX + "/socket.io";
    }

    // Check if we already have the Express HTTP server
    if (app) {
        console.log("Starting SerGIS socket server with HTTP server...");
        // Use the same server instance for the socket.io server
        io = require("socket.io")(server, {
            path: socketPath
        });
    } else {
        console.log("Starting SerGIS socket server on port " + config.PORT + "...");
        // There's no HTTP server yet; make socket.io listen all by its lonesomes
        io = require("socket.io").listen(config.PORT, {
            path: socketPath
        });
    }

    if (config.SOCKET_ORIGIN) {
        console.log("Setting socket to allow origin " + config.HTTP_ORIGIN);
        io.origins(config.HTTP_ORIGIN);
    }

    config.time("server.js", "Socket initialized.");
    
    // Create handlers for all our socket servers (see SOCKET_SERVERS above)
    for (var pathDescrip in SOCKET_SERVERS) {
        if (SOCKET_SERVERS.hasOwnProperty(pathDescrip)) {
            io.of(pathDescrip).use(require("./modules/socketServers/" + SOCKET_SERVERS[pathDescrip]));
            config.time("server.js", "Socket handler " + pathDescrip + " loaded.");
        }
    }
}
