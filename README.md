# SerGIS Server

The Node.js-based server for interaction with the SerGIS Web Client for [the SerGIS Project](http://sergisproject.github.io/)

## Pre-reqs

The server must have a recent version of [node.js](http://www.nodejs.org/) and [npm](https://npmjs.org/) (usually installed with node.js).

SerGIS Server has a few node.js dependencies; to install these, run `npm install` in a terminal in the root directory of the codebase. Also, make sure the submodules in `sergis-author` and `sergis-client` are there (if you cloned the git repo, run `git submodule init` and/or `git submodule update`).

Also, SerGIS Server requires a running [MongoDB](https://www.mongodb.org/) server.

Before running the server, check the config file (`config.js`), and change any relevant variables. Then, run `node server.js` to see what you can do!

## TODOs

- Add ability to sort the tables of games, users, etc.
- As Full Admin, on the Admin page, add ability to filter users by organization.
- For the "Publish" page (that's shown in the Author), give the user 2 radio button choices:
      [*]  Create new game: ____________
      [ ]  Overwrite existing game: [--dropdown-w/-existing-games--]
- Add new access level: "Unlisted" (only shows up in game listings for game owner and admins, but anyone with the link can access)
- Allow game owners and admins to change names of existing games (and store old names for purpose of redirection)
- Add ability to edit existing games (if either we own the game, or if we're an admin)

## License

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.

For more, see `LICENSE.txt` and `CONTRIBUTORS.txt`.
