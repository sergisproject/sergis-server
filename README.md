# SerGIS Server

The Node.js-based server for interaction with the SerGIS Web Client for [the SerGIS Project](http://sergisproject.github.io/)

## Pre-reqs

- The server must have a recent version of [node.js](http://www.nodejs.org/) and [npm](https://npmjs.org/) (usually installed with node.js).
- SerGIS Server has a few node.js dependencies; to install these, run `npm install` in a terminal in the root directory of the codebase.
- Make sure the submodules in `sergis-author` and `sergis-client` are there (if you cloned the git repo, run `git submodule init` and/or `git submodule update`).
- To run the required [grunt](http://www.gruntjs.com/) tasks, `grunt-cli` must be installed. To do this, run: `npm install -g grunt-cli`
- SerGIS Server requires a running [MongoDB](https://www.mongodb.org/) server. The path to the MongoDB server can be set in `config.js`.

## Configuring the Server

Before running the server, check the config file (`config.js`), and change any relevant configuration variables.

## Starting the Server

1. Run `grunt dist` to run cssmin and uglifyjs, or `grunt` to run those and jshint. (Running grunt is required to create the static files necessary for the server.)
1. Run `node server.js` to see what you can do, or `node server.js start` to start the HTTP/socket server!

## TODOs

- Add new access level: "Unlisted" (only shows up in game listings for game owner and admins, but anyone with the link can access)
- Add ability to edit existing games (if either we own the game, or if we're an admin)
- Add ability for admins to "impersonate" another user in the Author and see their unfinished (author) games
- Add ability to "Remember Me" at login
- Make server cope better with MongoDB crashing

## License

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.

For more, see `LICENSE.txt` and `CONTRIBUTORS.txt`.
