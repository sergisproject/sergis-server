/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving account and
// administrative pages for sergis-server.

// required modules
var express = require("express"),
    bodyParser = require("body-parser"),
    multer = require("multer");

// our modules
var config = require("../config"),
    db = require("./db");

// The router for /account/
var router = module.exports = express.Router();

// Set up body parser for POST data
router.use(bodyParser.urlencoded({
    extended: true
}));

// Set up multer for POST data (multipart/form-data, used for file uploads or big things)
router.use(multer({
    limits: {
        // Max file size: 5 MB (in bytes)
        fileSize: 1024 * 1024 * 5,
        // Max # of files per request
        files: 2,
        // Max field size: 15 MB (in bytes)
        // Remember, MongoDB's max document size is 16 MB
        fieldSize: 1024 * 1024 * 15
    },
    // Store files in memory instead of on disk
    // WARNING: THIS IS DANGEROUS!
    inMemory: true
}));


////////////////////////////////////////////////////////////////////////////////
// The page handlers for /account/
var pageHandlers = {
    /**
     * Get the account in question for an account URL, and make sure that the
     * user has permission to access.
     */
    checkAccount: function (req, res, next) {
        var otherUsername = req.params.username;
        // Let's get the data on the account that we're trying to open
        db.users.get(otherUsername, function (err, otherUser) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            // Now, are we sure that this other user exists?
            if (!otherUser) {
                // Nope! Send a 404 if we're admin, 403 otherwise.
                req.error = {number: user.isAdmin ? 404 : 403};
                return next("route");
            }

            // Alrighty, now, do we have permission to access him?
            if (!req.user.isAdmin && !(req.user.isOrganizationAdmin && req.user.organization == otherUser.organization)) {
                // Not allowed! Send along a good ol' 403
                req.error = {number: 403};
                return next("route");
            }

            // Alrighty, finally, yes, we do have permission to access this guy, no matter who he is
            req.otherUser = otherUser;
            return next();
        });
    },
    
    /**
     * Show info on an account.
     * (If we're here, then we know that we have permission.)
     */
    account: function (req, res, next) {
        // NOTE: It isn't guaranteed that the use of "otherUser" means that
        // we're on an admin page.
        // accountActions["update-user"] will set otherUser right after updating
        // it, whether it originally came from req.user or req.otherUser.
        var user = req.otherUser || req.user;
        // Get the organization list, in case we need it
        db.organizations.getAll(function (err, organizations) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            return res.render("account.ejs", {
                me: req.user,
                user: user,
                statusMessages: req.statusMessages || false,
                organizations: organizations,
                gameNamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                gameNameCharacters: config.URL_SAFE_REGEX_CHARS
            });
        });
    },
    
    /**
     * Handle POST requests for a user account page.
     * (If we're here, then we know that we have permission.)
     */
    accountPost: function (req, res, next) {
        // Double-check
        var user = req.otherUser || req.user;
        var isMe = user.username == req.user.username;
        if (user.username.toLowerCase() != req.body.username.toLowerCase()) {
            req.error = {number: 400};
            return next("route");
        }
        
        // Now, are we trying to do something specific?
        switch (req.body.action) {
            case "update-user":
                accountActions["update-user"](req, res, next, user, isMe);
                return;
            case "create-game":
                accountActions["create-game"](req, res, next, user, isMe);
                return;
            case "delete-user":
                accountActions["delete-user"](req, res, next, user, isMe);
                return;
        }
        
        // Never mind, it's possible that we came here w/o doing anything
        next();
    },
    
    /**
     * Hande GET requests for the SerGIS Author.
     */
    authorGet: function (req, res, next) {
        // Render page
        return res.render(config.AUTHOR_INDEX, {
            // lib files
            "stylesheet.css": config.HTTP_PREFIX + "/author-lib/stylesheets/stylesheet.css",
            "es6-promise-2.0.0.min.js": config.HTTP_PREFIX + "/author-lib/javascripts/es6-promise-2.0.0.min.js",
            "localforage.nopromises.min.js": config.HTTP_PREFIX + "/author-lib/javascripts/localforage.nopromises.min.js",
            "author-js-src": config.HTTP_PREFIX + "/static/author.js",

            "no-minified": false,
            "socket-io-script-src": config.SOCKET_ORIGIN + config.SOCKET_PREFIX + "/socket.io/socket.io.js",
            "socket-io-origin": config.SOCKET_ORIGIN,
            "socket-io-prefix": config.SOCKET_PREFIX,
            "session": req.sessionID
        });
    },
    
    /**
     * Handle GET requests for the publishing page
     */
    previewGet: function (req, res, next) {
        // Just throw a "Method Not Allowed"
        req.error = {
            number: 405,
            details: "Try clicking the \"Preview\" button in the SerGIS Author again."
        };
        return next("route");
    },
    
    /**
     * Handle POST requests for the preview page (coming from the author).
     */
    previewPost: function (req, res, next) {
        // We must be coming from the author
        // Make sure the game name is good
        if (!req.body.gameName) {
            req.error = {
                number: 400,
                details: "Invalid gameName."
            };
            return next("route");
        }

        db.author.get(req.user.username, req.body.gameName, function (err, jsondata) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (!jsondata) {
                // AHH! We don't exist!
                req.error = {
                    number: 400,
                    details: "Invalid gameName."
                };
                return next("route");
            }

            // Render page
            return res.render(config.CLIENT_INDEX, {
                // NOTE: `test` is written to a JS block!
                test: 'var SERGIS_JSON_DATA = ' + JSON.stringify(jsondata).replace(/<\/script>/g, '</scr" + "ipt>') + ';',

                // lib files
                "style.css": config.HTTP_PREFIX + "/client-lib/style.css",
                "es6-promise-2.0.0.min.js": config.HTTP_PREFIX + "/client-lib/es6-promise-2.0.0.min.js",
                "client-js-src": config.HTTP_PREFIX + "/static/client.local.js",
                "no-minified": false
            });
        });
    },
    
    /**
     * Handle GET requests for the publishing page (throw a 405).
     */
    publishGet: function (req, res, next) {
        // Just throw a "Method Not Allowed"
        req.error = {number: 405};
        return next("route");
    },
    
    /**
     * Handle POST requests for the publishing page (coming from the author).
     */
    publishPost: function (req, res, next) {
        // If we're coming from the publish page
        if (req.body.action == "create-game") {
            // Make sure that we have a valid game name
            if (!req.body.authorGameName) {
                req.error = {
                    number: 400,
                    details: "Invalid authorGameName."
                };
                return next("route");
            }
            
            // Get the JSON data for the game
            db.author.get(req.user.username, req.body.authorGameName, function (err, jsondata) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                if (!jsondata) {
                    // AHH! We don't exist!
                    req.error = {
                        number: 400,
                        details: "Invalid authorGameName."
                    };
                    return next("route");
                }
                
                // Move control to accountActions["create-game"] to check the data and create the game
                accountActions["create-game"](req, res, next, req.user, true, jsondata);
            });
        } else {
            // We must be coming from the author
            // Make sure the game name is good
            if (!req.body.gameName) {
                req.error = {
                    number: 400,
                    details: "Invalid gameName."
                };
                return next("route");
            }
            
            db.author.get(req.user.username, req.body.gameName, function (err, jsondata) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                if (!jsondata) {
                    // AHH! We don't exist!
                    req.error = {
                        number: 400,
                        details: "Invalid gameName."
                    };
                    return next("route");
                }

                // Render the publish page
                return res.render("account-publish.ejs", {
                    me: req.user,
                    authorGameName: req.body.gameName,
                    gameNamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                    gameNameCharacters: config.URL_SAFE_REGEX_CHARS
                });
            });
        }
    },
    
    /**
     * Handle the end of POST requests after we just published a game.
     */
    publishDone: function (req, res, next) {
        // Render a Congrats page
        return res.render("account-publish-done.ejs", {
            me: req.user,
            gameName: req.body.gameName
        });
    },
    
    /**
     * Serve admin page.
     */
    admin: function (req, res, next) {
        // First check: is the user an admin at all?
        if (!req.user.isAdmin && !(req.user.isOrganizationAdmin && req.user.organization)) {
            // Nope! Silly user
            req.error = {number: 403};
            return next("route");
        }
        
        // Yup, the user actually gotst some rights
        // Let's get them something to look at
        db.users.getAll((req.user.isOrganizationAdmin && req.user.organization) ? req.user.organization : null, function (err, users) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            // Get the organization list too
            db.organizations.getAll(function (err, organizations) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                // Now, render all that shit
                return res.render("admin.ejs", {
                    me: req.user,
                    users: users,
                    statusMessages: req.statusMessages || false,
                    organization: req.user.isOrganizationAdmin && req.user.organization,
                    organizations: organizations,
                    usernamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                    usernameCharacters: config.URL_SAFE_REGEX_CHARS
                });
            });
        });
    },
    
    /**
     * Handle POST requests the admin page, then serve admin page.
     */
    adminPost: function (req, res, next) {
        req.user.isAdmin = 1;
        // First check: is the user an admin at all?
        if (!req.user.isAdmin && !(req.user.isOrganizationAdmin && req.user.organization)) {
            // Nope! Silly user
            req.error = {number: 403};
            return next("route");
        }
        
        // If the user is just an organization admin...
        if (req.user.isOrganizationAdmin) {
            // All the things that organization admins can do
            switch (req.body.action) {
                case "create-user":
                    adminActions["create-user"](req, res, next, req.body.username, req.body.password,
                                                req.body.displayName, req.user.organization, "nope");
                    return;
                case "delete-user":
                    adminActions["delete-user"](req, res, next, req.body.username, req.user.organization);
                    return;
            }
        } else {
            // The user is a full-fledged admin!
            switch (req.body.action) {
                case "create-organization":
                    adminActions["create-organization"](req, res, next, req.body.organization);
                    return;
                case "create-user":
                    adminActions["create-user"](req, res, next, req.body.username, req.body.password,
                                                req.body.displayName, req.body.organization, req.body.admin);
                    return;
                case "set-user-organization":
                    adminActions["set-user-organization"](req, res, next, req.body.username, req.body.organization);
                    return;
                case "set-user-admin":
                    adminActions["set-user-admin"](req, res, next, req.body.username, req.body.admin);
                    return;
                case "delete-user":
                    adminActions["delete-user"](req, res, next, req.body.username);
                    return;
            }
        }
        
        // Never mind, it's possible that we came here w/o doing anything
        next();
    },
    
    /**
     * Serve login page.
     */
    login: function (req, res, next, loginErrorMsg) {
        return res.render("account-login.ejs", {
            error: loginErrorMsg || false
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Account actions
var accountActions = {
    /**
     * Handle a request for the updating of a user.
     */
    "update-user": function (req, res, next, user, isMe) {
        var update = {};
        var newPassword;
        req.statusMessages = [];
        // Check if the display name is changed
        if (req.body.displayName && req.body.displayName != user.displayName) {
            update.displayName = req.body.displayName;
            req.statusMessages.push("The display name for " + user.username + " has been updated.");
        }
        // Check if the password should be changed
        if (req.body.password1 && req.body.password2) {
            if (req.body.password1 == req.body.password2) {
                newPassword = req.body.password1;
                req.statusMessages.push("The password for " + user.username + " has been updated.");
            } else {
                req.statusMessages.push("ERROR: New passwords did not match.");
            }
        }
        // Check if the organization is changed
        if (!isMe && req.user.isAdmin && req.body.organization && req.body.organization != user.organization) {
            update.organization = req.body.organization;
            req.statusMessages.push("The organization for " + user.username + " has been updated.");
        }
        // Check if the admin status is changed
        var oldAdminStatus = user.isAdmin ? "yup" : user.isOrganizationAdmin ? "kinda" : "nope";
        if (!isMe && req.user.isAdmin && req.body.admin && req.body.admin != oldAdminStatus) {
            update.isAdmin = req.body.admin == "yup";
            update.isOrganizationAdmin = req.body.admin == "kinda";
            req.statusMessages.push("The admin status for " + user.username + " has been updated.");
        }
        
        // Set the changes if there are any
        if (JSON.stringify(update) != "{}" || newPassword) {
            // Yay, there's changes to update!
            db.users.update(user.username, update, newPassword, function (err) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                // Re-get the user we just updated (store it in req.otherUser)
                db.users.get(user.username, function (err, user) {
                    if (err) {
                        req.error = {number: 500};
                        return next("route");
                    }

                    if (!user) {
                        // Ahh! He's gone!
                        req.error = {status: 500};
                        return next("route");
                    }
                    
                    req.otherUser = user;
                    return next();
                });
            });
        } else {
            // Nothing to change
            return next();
        }
    },
    
    /**
     * Handle a request for creating a new game under a user account.
     * Called from pageHandlers.accountPost and pageHandlers.publishPost.
     * jsondata is only provided from publishPost; if it's missing, we get it
     * from the request.
     */
    "create-game": function (req, res, next, user, isMe, jsondata) {
        // First, make sure everything's here and good
        if (!req.body.gameName) {
            return res.render("error-back.ejs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "Game name is missing."
            });
        }
        if (!config.URL_SAFE_REGEX.test(req.body.gameName)) {
            return res.render("error-back.ejs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "Invalid game name. Game names may consist of any letters, digits, and the following characters: " + config.URL_SAFE_REGEX_CHARS
            });
        }
        if (!req.body.access || ["public", "organization", "private"].indexOf(req.body.access) == -1) {
            return res.render("error-back.ejs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "Invalid access level."
            });
        }
        if (!jsondata && !req.files.jsonfile) {
            return res.render("error-back.ejs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "No SerGIS JSON Game Data file has been provided."
            });
        }

        // Next, make sure the game name isn't taken
        db.games.get(user.username, req.body.gameName, function (err, game) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (game) {
                // Ahh! Game with this gameOwner/gameName combo already exists!
                return res.render("error-back.ejs", {
                    title: "SerGIS Account - " + user.username,
                    subtitle: "Error Creating Game",
                    details: (isMe ? "You" : "This Account") + " already has a game named \"" + req.body.gameName + "\". Game names must be unique."
                });
            }
            
            // Now, check the JSON game data
            if (!jsondata) {
                var jsonerr;
                try {
                    jsondata = JSON.parse(req.files.jsonfile.buffer.toString());
                } catch (err) {
                    jsondata = null;
                    jsonerr = err;
                }
                if (!jsondata) {
                    return res.render("error-back.ejs", {
                        title: "SerGIS Account - " + user.username,
                        subtitle: "Error Creating Game",
                        details: "Invalid SerGIS JSON Game Data file.\n\n" + (jsonerr ? jsonerr.name + ": " + jsonerr.message : "")
                    });
                }
            }
            
            // Okay, everything should be good now!
            db.games.create(user.username, req.body.gameName, req.body.access, jsondata, function (err, game) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                req.statusMessages = [game ? (req.body.gameName + " created successfully!") : "Error creating game."];
                return next();
            });
        });
    },
    
    /**
     * Handle a request for deleting a user account.
     */
    "delete-user": function (req, res, next, user) {
        // Full Admin accounts cannot be deleted.
        if (user.isAdmin) {
            req.statusMessages = ["Full Admin accounts cannot be deleted."];
            return next();
        }
        
        db.users.delete(user.username, function (err) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (isMe) {
                // We deleted ourselves
                req.session.destroy(function (err) {
                    if (err) {
                        console.error("ERROR DESTROYING SESSION: ", err.stack);
                    }
                    // Just redirect to the home page
                    return res.redirect(config.HTTP_PREFIX + "/");
                });
            } else {
                // We deleted somebody else, so just redirect to admin page
                return res.redirect(config.HTTP_PREFIX + "/account/admin");
            }
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Admin actions
var adminActions = {
    /**
     * Handle a request for the creation of a user.
     */
    "create-user": function (req, res, next, username, password, displayName, organization, admin) {
        var errorMsg;
        if (!username) {
            errorMsg = "No username provided.";
        } else if (!config.URL_SAFE_REGEX.test(username)) {
            errorMsg = "Invalid username.\nUsernames may consist of any letters, digits, and the following characters: " + config.URL_SAFE_REGEX_CHARS;
        } else if (!displayName) {
            errorMsg = "No display name provided.";
        }

        if (errorMsg) {
            return res.render("error-back.ejs", {
                title: "SerGIS Server Admin",
                subtitle: "Error Creating Account",
                details: errorMsg
            });
        }

        // Finally... create the account
        db.users.create(username, password, displayName, organization, admin, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (user === false) {
                // Error...
                return res.render("error-back.ejs", {
                    title: "SerGIS Server Admin",
                    subtitle: "Error Creating Account",
                    details: "Username already exists."
                });
            }
            
            // Everything successful; continue on our merry way!
            req.statusMessages = ["User \"" + username + "\" has been created."];
            return next();
        });
    },
    
    /**
     * Handle a request for the deletion of a user.
     */
    "delete-user": function (req, res, next, username, organization) {
        db.users.get(username, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (!user) {
                // Well, our job is practically done for us
                return next();
            }
            
            // Make sure that we're not deleting ourselves, or an admin account
            if (user.username == req.user.username || user.isAdmin) {
                // Ahh!! Just pretend we didn't do anything
                // (This technically isn't possible to do from the admin home page anyway,
                // so this shouldn't ever be reached.)
                return next();
            }
            
            // If we need to check the organization, do so
            if (organization && user.organization !== organization) {
                // Pretend we're not here
                return next();
            }
            
            // All good!
            db.users.delete(username, function (err) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                req.statusMessages = ["User \"" + username + "\" has been deleted."];
                return next();
            });
        });
    },
    
    /**
     * Handle creating a new organization.
     */
    "create-organization": function (req, res, next, organizationName) {
        if (!organizationName) {
            return res.render("error-back.ejs", {
                title: "SerGIS Server Admin",
                subtitle: "Error Creating Organization",
                details: "No organization name provided."
            });
        }
        
        db.organizations.create(organizationName, function (err, organization) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            req.statusMessages = ["Oranization \"" + organizationName + "\" has been created."];
            return next();
        });
    },
    
    /**
     * Set the organization of a user.
     */
    "set-user-organization": function (req, res, next, username, organizationName) {
        // Make sure username is A-Ok
        db.users.get(username, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (!user) {
                return res.render("error-back.ejs", {
                    title: "SerGIS Server Admin",
                    subtitle: "Error Updating User",
                    details: "Invalid username."
                });
            }
            
            // If we're setting the organization to nothing, then just do it now
            if (!organizationName) {
                // Okay, now update the user
                db.users.update(username, {
                    organization: null
                }, null, function (err) {
                    if (err) {
                        req.error = {number: 500};
                        return next("route");
                    }

                    // All good now!
                    req.statusMessages = ["The organization has been set to none for user \"" + username + "\"."];
                    return next();
                });
                return;
            }
            
            // Since we need to, let's make sure organizationName is A-Ok
            db.organizations.get(organizationName, function (err, organization) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                if (!organization) {
                    return res.render("error-back.ejs", {
                        title: "SerGIS Server Admin",
                        subtitle: "Error Updating User",
                        details: "Invalid organization."
                    });
                }
                
                // Okay, now update the user
                db.users.update(username, {
                    organization: organizationName
                }, null, function (err) {
                    if (err) {
                        req.error = {number: 500};
                        return next("route");
                    }

                    // All good now!
                    req.statusMessages = ["The organization has been set to \"" + organizationName + "\" for user \"" + username + "\"."];
                    return next();
                });
            });
        });
    },
    
    /**
     * Set the admin status of a user.
     */
    "set-user-admin": function (req, res, next, username, admin) {
        // Make sure the username is A-Ok
        db.users.get(username, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (!user) {
                return res.render("error-back.ejs", {
                    title: "SerGIS Server Admin",
                    subtitle: "Error Updating User",
                    details: "Invalid username."
                });
            }
            
            // Make sure we're not changing ourselves
            if (user.username == req.user.username) {
                // Pretend that nothing happened.
                return next();
            }
            
            // Okay, now update the user
            db.users.update(username, {
                isAdmin: admin == "yup",
                isOrganizationAdmin: admin == "kinda",
            }, null, function (err) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                // All good now!
                req.statusMessages = ["User \"" + username + "\" is now " + (admin == "yup" ? " an Admin." : admin == "kinda" ? "an Organization Admin." : "not an admin.")];
                return next();
            });
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Set up login
router.use(function (req, res, next) {
    // Test admin account, if we don't have any accounts in the database yet
    if (config.ASSUME_ADMIN) {
        // WARNING: EVERYONE IS AN ADMIN! EXTREMELY UNSAFE!!
        req.user = {
            username: "TempAdmin",
            username_lowercase: "tempadmin",
            encryptedPassword: "",
            displayName: "WARNING: Set ASSUME_ADMIN to false in config.js",
            isAdmin: true
        };
    }
    
    // Is it a login request?
    if (req.method == "POST" && req.body.login == "account-login") {
        // Kill any previous account that the user might have been logged in to
        req.session.username = undefined;
        req.user = undefined;
        // See if it's valid
        db.users.check(req.body.username, req.body.password, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (user) {
                // Yay! Correct!
                // Re-add any pre-login POST data
                var postData = req.session.preLoginPostData;
                if (postData && postData.length) {
                    for (var i = 0; i < postData.length; i++) {
                        req.body[postData[i][0]] = postData[i][1];
                    }
                    req.session.preLoginPostData = undefined;
                }

                // Store the username in the session
                req.session.username = user.username;

                // Store the user with the request
                req.user = user;

                // Continue on our merry way
                return next();
            } else if (user === false) {
                // Bad username/password
                pageHandlers.login(req, res, next, "Username or password incorrect.");
            } else {
                // Error!
                req.error = {number: 500};
                return next("route");
            }
        });
    } else if (!req.user) {
        // No user session!!
        // Store any POST data coming to this page before we show the login page
        if (req.body) {
            var postData = [];
            for (var item in req.body) {
                if (req.body.hasOwnProperty(item)) {
                    postData.push([item, req.body[item]]);
                }
            }
            req.session.preLoginPostData = postData;
        }
        // Serve login page
        pageHandlers.login(req, res, next);
    } else {
        // Everything's good; just continue on our merry way!
        return next();
    }
});


////////////////////////////////////////////////////////////////////////////////
// Set up all the page handler routing
router.get("", pageHandlers.account);
router.post("", pageHandlers.accountPost, pageHandlers.account);

router.get("/author", pageHandlers.authorGet);
router.post("/author", pageHandlers.authorGet); // Could be coming from a post'ed login

router.get("/author/preview", pageHandlers.previewGet);
router.post("/author/preview", pageHandlers.previewPost);

router.get("/author/publish", pageHandlers.publishGet);
router.post("/author/publish", pageHandlers.publishPost, pageHandlers.publishDone);

router.get("/admin", pageHandlers.admin);
router.post("/admin", pageHandlers.adminPost, pageHandlers.admin);

router.get("/admin/:username", pageHandlers.checkAccount, pageHandlers.account);
router.post("/admin/:username", pageHandlers.checkAccount, pageHandlers.accountPost, pageHandlers.account);