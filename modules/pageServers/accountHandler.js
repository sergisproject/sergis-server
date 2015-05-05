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
    multer = require("multer");

// our modules
var config = require("../../config"),
    db = require("../db"),
    accounts = require("../accounts");

// The router for /account/
var router = module.exports = express.Router();

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
     * Show info on an account.
     * (If we're here, then we know that we have permission.)
     */
    account: function (req, res, next) {
        // NOTE: It isn't guaranteed that the use of "otherUser" means that
        // we're on an admin page.
        // accountActions["update-user"] will set otherUser right after updating
        // it, whether it originally came from req.user or req.otherUser.
        var user = req.otherUser || req.user;
        // Get the list of groups, in case we need it
        db.models.Organization.find({}).exec().then(function (organizations) {
            res.render("account.hbs", {
                title: "SerGIS Account - " + user.username,
                me: req.user,
                user: user,
                isMe: req.user.equals(user),
                statusMessages: req.statusMessages,
                organizations: organizations.map(function (org) {
                    return {
                        _id: org._id,
                        name: org.name,
                        selected: user.organization && user.organization.equals(org)
                    };
                }),
                gameNamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                gameNameCharacters: config.URL_SAFE_REGEX_CHARS
            });
        }).then(null, function (err) {
            next(err);
        });
    },
    
    /**
     * Handle POST requests for a user account page.
     * (If we're here, then we know that we have permission.)
     */
    accountPost: function (req, res, next) {
        // Double-check
        var user = req.otherUser || req.user;
        if (user.username.toLowerCase() != req.body.username.toLowerCase()) {
            req.error = {number: 400};
            return next("route");
        }
        
        // Now, are we trying to do something specific?
        switch (req.body.action) {
            case "update-user":
                accountActions["update-user"](req, res, next, user);
                return;
            case "create-game":
                accountActions["create-game"](req, res, next, user);
                return;
            case "delete-user":
                accountActions["delete-user"](req, res, next, user);
                return;
        }
        
        // Never mind, it's possible that we came here w/o doing anything
        next();
    },
    
    /**
     * Serve admin page.
     */
    admin: function (req, res, next) {
        // First check: is the user an admin at all?
        if (!req.user.isAnyAdmin) {
            // Nope! Silly user
            req.error = {number: 403};
            return next("route");
        }
        
        // Yup, the user actually gotst some rights
        // Let's get them something to look at
        var sortParam = "" + req.query.sort;
        if (["username", "name", "organization", "admin"].indexOf(sortParam) == -1) {
            sortParam = "";
        }
        
        var sort = sortParam;
        if (sort == "admin") sort = "-isFullAdmin -isOrganizationAdmin";
        if (sort.indexOf("organization") == -1) sort += " organization";
        if (sort.indexOf("isFullAdmin") == -1) sort += " -isFullAdmin";
        if (sort.indexOf("isOrganizationAdmin") == -1) sort += " -isOrganizationAdmin";
        if (sort.indexOf("username") == -1) sort += " username";
        sort = sort.trim();
        
        var authorgames, organizations, filterParam;
        // Get the organizations list
        db.models.Organization.find({}).exec().then(function (_orgs) {
            organizations = _orgs;
            filterParam = "" + req.query.filter;
            var orgIDs = organizations.map(function (org) { return "" + org._id; });
            if (orgIDs.indexOf(filterParam) == -1) filterParam = "";
            
            // Get the author games list, if applicable
            if (req.user.isFullAdmin) {
                return db.models.AuthorGame.find({})
                                           .sort("owner")
                                           .populate("owner")
                                           .exec();
            }
        }).then(function (_authorgames) {
            authorgames = _authorgames || [];
            
            // Get the user list
            var criteria = {};
            if (req.user.isOrganizationAdmin) {
                criteria.organization = req.user.organization._id;
            } else if (filterParam) {
                criteria.organization = filterParam;
            }
            return db.models.User.find(criteria)
                                 .sort(sort)
                                 .populate("organization")
                                 .exec();
        }).then(function (users) {
            // Now, render all that shit
            res.render("admin.hbs", {
                title: "SerGIS Server Admin",
                me: req.user,
                users: users.map(function (user) {
                    return {
                        _id: user._id,
                        username: user.username,
                        name: user.name,
                        isFullAdmin: user.isFullAdmin,
                        isOrganizationAdmin: user.isOrganizationAdmin,
                        isMe: user.equals(req.user),
                        organizations: organizations.map(function (org) {
                            return {
                                _id: org._id,
                                name: org.name,
                                selected: user.organization && user.organization.equals(org)
                            };
                        })
                    };
                }),
                authorgames: authorgames,
                statusMessages: req.statusMessages,
                serverLogs: !!config.SERVER_LOG_DIR,
                organization: req.user.isOrganizationAdmin && req.user.organization && req.user.organization.name,
                organizations: organizations,
                filter: filterParam,
                sort: sortParam,
                usernamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                usernameCharacters: config.URL_SAFE_REGEX_CHARS,
                formCheckers: true,
                passwordGenerator: true
            });
        }).then(null, function (err) {
            next(err);
        });
    },
    
    /**
     * Handle POST requests the admin page, then serve admin page.
     */
    adminPost: function (req, res, next) {
        // First check: is the user an admin at all?
        if (!req.user.isAnyAdmin) {
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
                                                req.body.name, req.user.organization._id, "nope");
                    return;
                case "delete-user":
                    adminActions["delete-user"](req, res, next, req.body.user, req.user.organization._id);
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
                                                req.body.name, req.body.organization, req.body.admin);
                    return;
                case "set-user-organization":
                    adminActions["set-user-organization"](req, res, next, req.body.user, req.body.organization);
                    return;
                case "set-user-admin":
                    adminActions["set-user-admin"](req, res, next, req.body.user, req.body.admin);
                    return;
                case "delete-user":
                    adminActions["delete-user"](req, res, next, req.body.user);
                    return;
                case "download-author-game":
                    adminActions["download-author-game"](req, res, next, req.body.authorgame);
                    return;
            }
        }
        
        // Never mind, it's possible that we came here w/o doing anything
        next();
    }
};


////////////////////////////////////////////////////////////////////////////////
// Account actions
var accountActions = {
    /**
     * Handle a request for the updating of a user.
     */
    "update-user": function (req, res, next, user) {
        var newPassword;
        req.statusMessages = [];
        
        // Check if the display name is changed
        if (req.body.name && req.body.name != user.name) {
            user.name = req.body.name;
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
        
        // Check if the organization is changed (admin only)
        if (req.user.isFullAdmin && req.body.organization != "" + (user.organization && user.organization._id)) {
            user.organization = req.body.organization || undefined;
            req.statusMessages.push("The organization for " + user.username + " has been updated.");
        }
        
        // Check if the admin status is changed (admin only)
        if (!req.user.equals(user) && req.user.isFullAdmin && req.body.admin && req.body.admin != user.adminStatus) {
            user.adminStatus = req.body.admin;
            req.statusMessages.push("The admin status for " + user.username + " has been updated.");
        }
        
        // Set the changes if there are any
        user.save().then(function () {
            // Update the password, if needed
            if (newPassword) return user.setPassword(newPassword);
        }).then(function () {
            // Make sure organization is still populated
            return user.populate("organization").execPopulate();
        }).then(function () {
            // All good!
            req.otherUser = user;
            next();
        }).then(null, function (err) {
            next(err);
        });
    },
    
    /**
     * Handle a request for creating a new game under a user account.
     */
    "create-game": function (req, res, next, user) {
        // Pass control to accounts.createGame
        accounts.createGame(req, res, next, user, req.body.gameName, req.body.access);
    },
    
    /**
     * Handle a request for deleting a user account.
     */
    "delete-user": function (req, res, next, user) {
        // Full Admin accounts cannot be deleted.
        if (user.isFullAdmin) {
            req.statusMessages = ["Full Admin accounts cannot be deleted."];
            return next();
        }
        
        user.remove().then(function () {
            if (req.user.username == user.username) {
                // We deleted ourselves
                req.session.destroy(function (err) {
                    if (err) {
                        console.error("ERROR DESTROYING SESSION: ", err.stack);
                    }
                    // Just redirect to the home page
                    res.redirect(config.HTTP_PREFIX + "/");
                });
            } else {
                // We deleted somebody else, so just redirect to admin page
                res.redirect(config.HTTP_PREFIX + "/account/admin");
            }
        }, function (err) {
            next(err);
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Admin actions
var adminActions = {
    /**
     * Handle a request for the creation of a user.
     */
    "create-user": function (req, res, next, username, password, name, organizationID, admin) {
        var errorMsg;
        if (!username) {
            errorMsg = "No username provided.";
        } else if (!config.URL_SAFE_REGEX.test(username)) {
            errorMsg = "Invalid username.\nUsernames may consist of any letters, digits, and the following characters: " + config.URL_SAFE_REGEX_CHARS;
        } else if (!name) {
            errorMsg = "No display name provided.";
        }

        if (errorMsg) {
            return res.render("error-back.hbs", {
                title: "SerGIS Server Admin",
                subtitle: "Error Creating Account",
                details: errorMsg
            });
        }

        // Finally... create the account
        db.models.User.createUser(username, name, password, organizationID, admin == "yup", admin == "kinda", req.user).then(function () {
            // Everything successful; continue on our merry way!
            req.statusMessages = ["User \"" + username + "\" has been created."];
            next();
        }, function (err) {
            if (err && err.name == "ValidationError") {
                return res.render("error-back.hbs", {
                    title: "SerGIS Server Admin",
                    subtitle: "Error Creating Account",
                    details: "User creation failed.\nPlease make sure that the username does not already exist."
                });
            } else {
                next(err);
            }
        });
    },
    
    /**
     * Handle a request for the deletion of a user.
     */
    "delete-user": function (req, res, next, userID, organizationID) {
        // Get the user, to check things if needed
        db.models.User.findById(userID).exec().then(function (user) {
            if (!user) {
                // Well, our job is practically done for us
                next();
                return;
            }
            
            // Make sure that we're not deleting ourselves, or an admin account
            if (user.equals(req.user) || user.isFullAdmin) {
                // Ahh!! Just pretend we didn't do anything
                // (This technically isn't possible to do from the admin home page anyway,
                // so this shouldn't ever be reached.)
                next();
                return;
            }
            
            // If we need to check the organization, do so
            if (organizationID && !user.organization.equals(organizationID)) {
                // Pretend we're not here
                next();
                return;
            }
            
            // All good! Delete
            return accounts.deleteUser(user).then(function () {
                // All done!
                req.statusMessages = ["\"" + user.name + "\" has been deleted."];
                next();
            });
        }).then(null, function (err) {
            next(err);
        });
    },
    
    /**
     * Handle creating a new organization.
     */
    "create-organization": function (req, res, next, organizationName) {
        if (!organizationName) {
            res.render("error-back.hbs", {
                title: "SerGIS Server Admin",
                subtitle: "Error Creating Organization",
                details: "No organization name provided."
            });
            return;
        }
        
        var org = new db.models.Organization({
            name: organizationName,
            name_lowercase: organizationName.toLowerCase()
        });
        org.save().then(function () {
            req.statusMessages = ["Oranization \"" + organizationName + "\" has been created."];
            next();
        }, function (err) {
            next(err);
        });
    },
    
    /**
     * Set the organization of a user.
     */
    "set-user-organization": function (req, res, next, userID, organizationID) {
        // Make sure user is A-Ok
        db.models.User.findById(userID).exec().then(function (user) {
            if (!user) {
                res.render("error-back.hbs", {
                    title: "SerGIS Server Admin",
                    subtitle: "Error Updating User",
                    details: "Invalid username."
                });
                return;
            }
            
            user.organization = organizationID || undefined;
            return user.save().then(function () {
                req.statusMessages = ["The organization for \"" + user.name + "\" has been updated."];
                next();
            });
        }).then(null, function (err) {
            next(err);
        });
    },
    
    /**
     * Set the admin status of a user.
     */
    "set-user-admin": function (req, res, next, userID, admin) {
        // Make sure the username is A-Ok
        db.models.User.findById(userID).exec().then(function (user) {
            if (!user) {
                res.render("error-back.hbs", {
                    title: "SerGIS Server Admin",
                    subtitle: "Error Updating User",
                    details: "Invalid username."
                });
                return;
            }
            
            // Make sure we're not changing ourselves
            if (user.equals(req.user)) {
                // Pretend that nothing happened.
                next();
                return;
            }
            
            user.adminStatus = admin;
            return user.save().then(function () {
                // All good now!
                req.statusMessages = ["\"" + user.name + "\" is now " + (admin == "yup" ? " an Admin." : admin == "kinda" ? "an Organization Admin." : "not an admin.")];
                next();
            });
        }).then(null, function (err) {
            next(err);
        });
    },
    
    /**
     * Handle downloading the JSON for a user's author game.
     */
    "download-author-game": function (req, res, next, authorgameID) {
        db.models.AuthorGame.findById(authorgameID)
                            .select("name jsondata")
                            .lean(true)
                            .exec().then(function (authorgame) {
            // Lolz, this one's funny (we don't call next())
            res.set("Content-Type", "application/json");
            res.set("Content-Disposition", "attachment; filename=\"AUTHOR_" + authorgame.name.replace(/"/g, "\\\"") + ".json\"");
            console.log("Downloading author game: " + authorgame.name);
            res.send(authorgame.jsondata);
            console.log(authorgame.name + " sent.");
        }).then(null, function (err) {
            next(err);
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Set up all the page handler routing
router.use(accounts.checkUser);
router.use(accounts.requireLogin);

router.get("", pageHandlers.account);
router.post("", pageHandlers.accountPost, pageHandlers.account);

router.get("/author", function (req, res, next) {
    // Redirect from old author URL
    res.redirect(config.HTTP_PREFIX + "/author");
});

router.get("/admin", pageHandlers.admin);
router.post("/admin", pageHandlers.adminPost, pageHandlers.admin);

router.get("/admin/:username", accounts.requireOtherAccountAccess, pageHandlers.account);
router.post("/admin/:username", accounts.requireOtherAccountAccess, pageHandlers.accountPost, pageHandlers.account);
