/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// node modules
var fs = require("fs"),
    path = require("path");

// required modules
config.time("db.js", "Requiring mongoose...");
var mongoose = require("mongoose");
config.time("db.js", "Required mongoose.");

// our modules
var config = require("../config");


/** Functions to call when the database is loaded */
var loadHandlers = [];

/** Models */
var models = exports.models = {};

/** Models directory */
var modelsDir = path.join(__dirname, "models");


// Connect to the MongoDB server
config.time("db.js", "Connecting to MongoDB server...");
mongoose.connect(config.MONGO_SERVER, {
    server: {
        keepAlive: 1,
        auto_reconnect: true
    }
});
config.time("db.js", "Connected to MongoDB server.");

var db = mongoose.connection;

db.on("error", function (err) {
    console.error("Error connecting to MongoDB at " + config.MONGO_SERVER + ": ", err.stack);
    // Just quit...
    process.exit();
});

db.once("open", function () {
    console.log("Opened MongoDB connection.");
    
    // Load models from `models` directory
    config.time("db.js", "Loading models...");
    fs.readdir(modelsDir, function (err, files) {
        if (err) return console.error(err, "reading files from models directory at " + modelsDir);
        
        // Load all the models
        try {
            for (var i = 0; i < files.length; i++) {
                if (files[i].substr(-3) == ".js") {
                    // "require" this file
                    models[files[i].substring(0, files[i].length - 3)] = require(path.join(modelsDir, files[i]))(mongoose);
                }
            }
        } catch (err) {
            console.error("Error loading model: ", err.stack);
            
            // Make sure the MongoDB connection is closed
            exports.close(function () {
                process.exit();
            });
            
            // And, we're done here
            return;
        }
        
        config.time("db.js", "Models loaded. Running load handlers...");
        // Run load handlers
        for (var i = 0; i < loadHandlers.length; i++) {
            loadHandlers[i]();
        }
        config.time("db.js", "Done running load handlers.");
        // No more load handlers allowed
        loadHandlers = null;
    });
});


/**
 * Get the current Mongoose connection.
 */
exports.getMongooseConnection = function () {
    return db;
};


/**
 * Add a function to be run once the database is connected (or right away if the
 * database is already connected).
 *
 * @param {Function} callback - The function to call.
 */
exports.addLoadHandler = function (callback) {
    if (Array.isArray(loadHandlers)) {
        // Database connection isn't loaded yet
        loadHandlers.push(callback);
    } else {
        // Loading is already done
        callback();
    }
};


/**
 * Close the MongoDB database connection if opened.
 *
 * @param {Function} [callback] - An optional callback for after it's closed.
 */
exports.close = function (callback) {
    if (mongoose.connection) {
        console.log("Closing MongoDB connection...");
        mongoose.connection.close(function () {
            // There's a strong chance we'll never get here, because the server
            // will end before it's fully closed.
            console.log("Closed MongoDB connection.");
            if (typeof callback == "function") callback();
        });
    } else {
        callback();
    }
};

/**
 * To get a session object, in case it's ever needed.
 *
 * @param {string} sessionID - The session ID.
 *
 * @return {Promise.<?object>} The session object, if any.
 */
exports.getSessionByID = function (sessionID) {
    return new Promise(function (resolve, reject) {
        db.collection("sessions").findOne({_id: sessionID}, function (err, session) {
            if (err) {
                return reject(err);
            }

            var sessionObject;
            try {
                sessionObject = JSON.parse(session.session);
            } catch (err) {}
            resolve(sessionObject || undefined);
        });
    });
};
