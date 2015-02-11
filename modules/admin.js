/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving administrative pages
// for sergis-server.

// node modules
var fs = require("fs"),
    path = require("path");

// required modules
var bodyParser = require("body-parser");

var app, io, db, config;

// Valid username
var USERNAME_REGEX = /^[A-Za-z0-9~$"':;,.-_]+/;

// Name of admin page
var ADMIN_PAGE_NAME = "admin";

/**
 * Set up handlers and such.
 *
 * @param _app - The express app.
 * @param _io - The socket.io instance.
 * @param _db - The MongoDB database.
 * @param _config - The sergis-server configuration.
 */
function init(_app, _io, _db, _config) {
    app = _app; io = _io; db = _db; config = _config;
    
    // Admin homepage
    app.get("/" + ADMIN_PAGE_NAME, function (req, res) {
        db.collection("games").find({}).toArray(function (err, games) {
            if (err) {
                console.error("Error finding all in games database: ", err);
                res.status(500);
                res.end("<h1>Database Error</h1><h2>See console</h2>");
            } else {
                var gamesList = [];
                for (var i = 0; i < games.length; i++) {
                    gamesList.push({
                        username: games[i].username,
                        password: games[i].password,
                        jsondata: JSON.stringify(games[i].jsondata),
                        url: req.protocol + "://" + req.hostname + ((req.protocol == "http" && config.PORT == 80) || (req.protocol == "https" && config.PORT == 443) ? "" : ":" + config.PORT) + "/" + games[i].username
                    });
                }
                res.render(path.join(config.TEMPLATES_DIR, "admin.html"), {
                    games: gamesList
                });
            }
        });
    });

    app.use("/admin", bodyParser.urlencoded({extended: true}));

    app.post("/admin", function (req, res) {
        var games = db.collection("games");
        if (req.body.delete) {
            // Delete game (by username)
            games.remove({username: req.body.delete}, function (err, result) {
                if (err) {
                    console.error("Error removing from games database: ", err);
                    res.status(500);
                    res.end("<h1>Database Error</h1><h2>See console</h2>");
                } else {
                    console.log("Removed document from games database: ", result);
                    res.redirect("/admin");
                }
            });
        } else if (req.body.jsondata && req.body.username) {
            // Check username
            if (USERNAME_REGEX.test(req.body.username) == false ||
                // We can't have the same name as the admin page...
                req.body.username.toLowerCase() == ADMIN_PAGE_NAME.toLowerCase()) {
                
                res.end("<h1>Error</h1><h2>Invalid username.</h2><a href='javascript:history.back();'>Back</a>");
                return;
            }
            
            // Check JSON data
            try {
                var jsondata = JSON.parse(req.body.jsondata);
            } catch (err) {}
            if (!jsondata) {
                res.end("<h1>Error</h1><h2>Invalid JSON data.</h2><a href='javascript:history.back();'>Back</a>");
                return;
            }
            
            // Check username existance
            var username = req.body.username.toLowerCase(),
                password = req.body.password;
            games.find({username: username}).toArray(function (err, games) {
                // Check for database error
                if (err) {
                    console.error("Error checking games database: ", err);
                    res.status(500);
                    res.end("<h1>Database Error</h1><h2>See console</h2>");
                    return;
                }
                
                // Check username existance
                if (games.length > 0) {
                    res.end("<h1>Error</h2><h2>Username has already been used.</h2><a href='javascript:history.back();'>Back</a>");
                    return;
                }
                
                // Add game to database
                var game = {
                    jsondata: jsondata,
                    username: username,
                    password: password
                };
                db.collection("games").insert(game, function (err, result) {
                    // Check for database error
                    if (err) {
                        console.error("Error inserting into games database: ", err);
                        res.status(500);
                        res.end("<h1>Database Error</h1><h2>See console</h2>");
                        return;
                    }
                    
                    // We're good!
                    console.log("Inserted document into games database: ", result);
                    res.redirect("/admin");
                });
            });
        } else {
            // Neither deletion nor insertion... (or missing data)
            res.end("<h1>Error</h1><h2>Please enter data for all fields.</h2><a href='javascript:history.back();'>Back</a>");
        }
    });
}

exports.init = init;
