## Prerequisites

- **Browsers**: only latest Chrome/Chromium stable are supported
- **[Node.js](https://nodejs.org/en/)**: latest **current** or **LTS** version
- **RAM**: Minimum 512MB, Recommended 1024MB
- **HDD**: Minimum 500MB

## Build prerequisites

- **Bash**, **Make**

## Installation

!> You need **separate** account for your bot, bot **won't**  work on your broadcaster account

- Copy `config.example.json` to `config.json` and set everything as desired in `config` part
- if you want to use `!title` and `!game` you need to add bot as channel editor in [Permissions settings](http://twitch.tv/dashboard/permissions) on Twitch
- before starting a bot, you need to install npm dependencies

    `npm install`

- start bot

    `npm start`

- To access webpanel, go to `http://localhost:<port>` where port is configured in config.json (default: 20000)

## Installation (snapshot)

!> You need **separate** account for your bot, bot **won't**  work on your broadcaster account

- Copy `config.example.json` to `config.json` and set everything as desired in `config` part
- if you want to use `!title` and `!game` you need to add bot as channel editor in [Permissions settings](http://twitch.tv/dashboard/permissions) on Twitch
- before starting a bot, you need to build a bot

    `make`

- start bot

    `npm start`

- To access webpanel, go to `http://localhost:<port>` where port is configured in config.json (default: 20000)

## Upgrade

- Backup your `config.json` and `db` folder, if you are using `nedb`
- unzip new sogeBot version
- copy your backup files/directories to a bot directory
- run **npm install** and you're ready!

## Oauth generation

For [generation of oauth token](http://oauth.sogehige.tv) is advised to [create your own clientId](https://github.com/sogehige/sogeBot/wiki/custom-clientId-(recommended)).

!> Make sure you login into correct accounts. Anonymous/Privacy modes can help you with login into correct accounts.